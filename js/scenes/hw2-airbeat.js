/*
   AirBeat VR: a short, controller-motion rhythm game.

   Coordinate system: +X is right, +Y is physically up, and the player looks
   down -Z. The highway is one flat, constant-width rectangle in the XZ plane.
   Notes only travel along +Z, so notes and highway share one real perspective.
*/

import * as cg from '../render/core/cg.js';
import { linefont } from '../render/core/linefont.js';
import { GAME_CONFIG as CONFIG, COLORS } from './airbeat/config.js';
import { DEMO_CHART, SONG_DURATION } from './airbeat/chart.js';
import { AirBeatSynth } from './airbeat/synth.js';
import { getNotePosition, calculateAccuracy } from './airbeat/logic.js';

const STATES = Object.freeze({
   MENU: 'MENU', COUNTDOWN: 'COUNTDOWN', PLAYING: 'PLAYING',
   CLEAR: 'CLEAR', FAILED: 'FAILED',
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
const handForLane = lane => lane < 2 ? 'left' : 'right';

let cleanup;

export const init = async model => {
   cleanup?.();

   const previousOnPress = inputEvents.onPress;
   const synth = new AirBeatSynth({
      audioPath: CONFIG.audioPath,
      audioStartOffset: CONFIG.audioStartOffset,
      bpm: CONFIG.bpm,
   });
   const scene = model.add().dull();
   const notes = DEMO_CHART.map((data, index) => ({
      ...data,
      id: index,
      state: 'pending',
      visual: null,
      wasInside: { left: false, right: false },
      armY: 0,
      armTime: 0,
      contactError: 0,
      headJudgment: null,
      outsideSince: null,
      debugHeld: false,
   }));

   let state = STATES.MENU;
   let countdownEndsAt = 0;
   let fallbackSongStart = 0;
   let songTime = 0;
   let score = 0;
   let combo = 0;
   let maxCombo = 0;
   let health = CONFIG.startHealth;
   let counts = { perfect: 0, good: 0, miss: 0 };
   let recentJudgment = '';
   let recentJudgmentAt = -10;
   let lastFrameTime = 0;
   let finalAccuracy = 0;

   const pulse = (hand, strength, duration) => {
      if (typeof vibrate === 'function')
         vibrate(hand, strength, duration);
   };

   // Match hw1-cat's vibrate(hand, strength, duration) pattern, but make a
   // successful rhythm hit sharper than the soft, longer miss warning.
   const pulseSuccessfulHit = (note, judgment) => {
      const isPerfect = judgment === 'PERFECT';
      const isHold = note.type === 'hold';
      const strength = (isPerfect ? .58 : .42) + (isHold ? .05 : 0);
      const duration = isHold ? 85 : isPerfect ? 70 : 55;
      pulse(handForLane(note.lane), strength, duration);
   };

   const addLine = (parent, a, b, radius, color) => {
      const direction = cg.subtract(b, a);
      return parent.add('tubeY').move(cg.mix(a, b, .5)).aimY(direction)
                   .scale(radius, cg.norm(direction) / 2, radius).color(color);
   };

   // This is a rectangular object in world space, not a modeled trapezoid.
   // The headset camera alone makes its distant end appear narrow.
   const playfieldScale = CONFIG.laneWidth / .44;
   const trackCenterZ = (CONFIG.spawnZ + CONFIG.hitZ) / 2;
   const trackHalfLength = (CONFIG.hitZ - CONFIG.spawnZ) / 2;
   scene.add('cube,rounded').move(0, CONFIG.trackY - .045, trackCenterZ)
        .scale(CONFIG.trackHalfWidth + .045, .030, trackHalfLength + .08)
        .color(.006, .010, .025);
   scene.add('cube').move(0, CONFIG.trackY - .006, trackCenterZ)
        .scale(CONFIG.trackHalfWidth, .008, trackHalfLength)
        .color(COLORS.background);

   // Four equal-width lane surfaces remain parallel for the full track length.
   for (let lane = 0; lane < 4; lane++)
      scene.add('cube').move(CONFIG.laneX[lane], CONFIG.trackY + .008, trackCenterZ)
           .scale(CONFIG.laneWidth / 2 - .010, .004, trackHalfLength - .02)
           .color(COLORS.lanes[lane]).opacity(.10);

   const laneBounds = [-2, -1, 0, 1, 2].map(index => index * CONFIG.laneWidth);
   for (let index = 0; index < laneBounds.length; index++)
      addLine(scene,
         [laneBounds[index], CONFIG.trackY + .022, CONFIG.spawnZ],
         [laneBounds[index], CONFIG.trackY + .022, CONFIG.hitZ],
         (index === 0 || index === laneBounds.length - 1 ? .012 : .0045) * playfieldScale,
         index === 2 ? COLORS.accent : COLORS.rail);

   // World-space crossbars are equal width. Their projected width shrinks with
   // distance in exactly the same way as the notes.
   for (let progress of [0, .14, .28, .42, .56, .70, .84, 1]) {
      const z = mix(CONFIG.spawnZ, CONFIG.hitZ, progress);
      scene.add('cube').move(0, CONFIG.trackY + .020, z)
           .scale(CONFIG.trackHalfWidth, .003, (progress === 1 ? .022 : .007) * playfieldScale)
           .color(progress === 1 ? COLORS.accent : COLORS.rail)
           .opacity(progress === 1 ? 1 : .58);
   }

   // A small horizon gate frames the note spawn point without changing track geometry.
   const gateX = CONFIG.trackHalfWidth + .035;
   const gateTop = CONFIG.trackY + .47;
   for (let side of [-1, 1])
      scene.add('cube,rounded').move(side * gateX, CONFIG.trackY + .25, CONFIG.spawnZ - .04)
           .scale(.016, .22, .016).color(side < 0 ? COLORS.lanes[0] : COLORS.lanes[3]);
   addLine(scene, [-gateX, gateTop, CONFIG.spawnZ - .04],
                  [gateX, gateTop, CONFIG.spawnZ - .04], .011, COLORS.accent);

   const hitPads = [];
   const flashes = [];
   for (let lane = 0; lane < 4; lane++) {
      hitPads.push(scene.add('cube,rounded')
         .move(CONFIG.laneX[lane], CONFIG.noteY, CONFIG.hitZ)
         .scale(.195 * playfieldScale, .016, .135 * playfieldScale)
         .color(COLORS.lanes[lane]).opacity(.62));
      flashes.push({
         node: scene.add('torusY').move(CONFIG.laneX[lane], CONFIG.noteY + .018, CONFIG.hitZ)
                    .scale(0).color(COLORS.lanes[lane]).opacity(0),
         position: [CONFIG.laneX[lane], CONFIG.noteY + .018, CONFIG.hitZ],
         startedAt: -10,
      });
   }

   // AirBeat uses the same vector glyphs as linefont / linefont2, but gives
   // them wider tracking and a slightly heavier stroke for headset legibility.
   // Keeping this local prevents the typography change from affecting other scenes.
   const textEntries = {};
   const defineAirBeatTextMesh = (name, text, tracking, lineHeight, stroke) => {
      const paths = [];
      const lines = text.split('\n');
      for (let row = 0; row < lines.length; row++)
         for (let col = 0; col < lines[row].length; col++) {
            const code = lines[row].charCodeAt(col) & 127;
            if (code <= 32 || !linefont[code - 32])
               continue;
            for (const glyphPath of linefont[code - 32].paths)
               paths.push(glyphPath.map(point => [
                  tracking * col + point[0] / 4000,
                  -lineHeight * row - point[1] / 4000,
                  0,
               ]));
         }
      return clay.definePathsMesh(name, stroke, paths);
   };
   const textWidth = (text, tracking) => {
      const longest = text.split('\n').reduce((a, line) => Math.max(a, line.length), 0);
      return longest ? tracking * (longest - 1) + .015 : 0;
   };
   const createText = (name, initial, x, y, z, scale, color, centered = true,
                       tracking = .0235, stroke = .0041, lineHeight = .041) => {
      const meshName = `airbeat_${name}`;
      defineAirBeatTextMesh(meshName, initial, tracking, lineHeight, stroke);
      const node = scene.add(meshName).color(color);
      textEntries[name] = {
         node, meshName, text: null, x, y, z, scale, centered,
         tracking, stroke, lineHeight,
      };
      return node;
   };
   const showText = (name, text, color = null, scaleOverride = null) => {
      const entry = textEntries[name];
      if (entry.text !== text) {
         defineAirBeatTextMesh(entry.meshName, text, entry.tracking,
                               entry.lineHeight, entry.stroke);
         entry.text = text;
      }
      const scale = scaleOverride ?? entry.scale;
      const x = entry.centered
              ? entry.x - textWidth(text, entry.tracking) * scale / 2
              : entry.x;
      entry.node.identity().move(x, entry.y, entry.z).scale(scale);
      if (color)
         entry.node.color(color);
   };
   const hideText = name => textEntries[name].node.identity().scale(0);
   const hideEveryText = () => Object.keys(textEntries).forEach(hideText);

   createText('title', 'AIRBEAT VR', 0, 2.06, -.76, 1.15, COLORS.accent,
              true, .026, .0033);
   createText('menuStatus', '30 SECOND RHYTHM RUN // 113 BPM', 0, 1.88, -.76, .52, COLORS.text);
   createText('help1', 'BLUE LANES LEFT HAND   PINK LANES RIGHT HAND', 0, 1.74, -.76, .34, COLORS.text);
   createText('help2', 'SWING THROUGH TAP   FLICK UP ARROWS', 0, 1.62, -.76, .38, COLORS.text);
   createText('help3', 'KEEP YOUR HAND IN HOLD RAILS', 0, 1.50, -.76, .40, COLORS.text);
   createText('prompt', 'PRESS EITHER TRIGGER TO START', 0, 1.35, -.71, .48, COLORS.good);
   createText('audioMode', 'AUDIO // 113 BPM PRACTICE MIX', 0, 1.25, -.76, .30, COLORS.muted,
              true, .022, .0046);
   createText('desktop', 'DESKTOP  SPACE START   A L TAP   Q P FLICK   R RESTART', 0, 1.18, -.76, .24, COLORS.muted,
              true, .021, .0050);
   createText('countdown', '3', 0, 1.68, -.61, 3.2, COLORS.text, true, .026, .0033);

   createText('score', 'SCORE 000000', -.53, 1.81, -.72, .48, COLORS.text, false);
   createText('combo', 'COMBO 0', 0, 1.64, -.64, .50, COLORS.good);
   createText('health', 'HP 100', .23, 1.81, -.72, .48, COLORS.text, false);
   createText('time', 'TIME 30', .23, 1.70, -.72, .48, COLORS.text, false);
   createText('judgment', 'PERFECT', 0, 1.49, -.64, .85, COLORS.perfect,
              true, .026, .0035);
   createText('debug', '', 0, .72, -.84, .65, COLORS.good);

   createText('resultTitle', 'SONG CLEAR!', 0, 1.99, -.76, 1.10, COLORS.perfect,
              true, .026, .0034);
   createText('resultScore', 'FINAL SCORE 000000', 0, 1.78, -.76, .58, COLORS.text);
   createText('resultStats', 'MAX COMBO 0   ACCURACY 0.0%', 0, 1.63, -.76, .43, COLORS.text);
   createText('resultCounts', 'PERFECT 0   GOOD 0   MISS 0', 0, 1.50, -.76, .38, COLORS.text);
   createText('restart', 'PRESS TRIGGER OR R TO RESTART', 0, 1.33, -.76, .44, COLORS.good);

   const menuPanel = scene.add('cube,rounded').move(0, 1.64, -.80)
                          .scale(.58, .46, .020).color(COLORS.panel).opacity(.94);
   const startButton = scene.add('cube,rounded').move(0, 1.36, -.76)
                            .scale(.24, .050, .018).color(.08, .22, .32);
   const resultPanel = scene.add('cube,rounded').scale(0).color(COLORS.panel).opacity(.96);
   const hudLeft = scene.add('cube,rounded').scale(0).color(COLORS.panel).opacity(.82);
   const hudRight = scene.add('cube,rounded').scale(0).color(COLORS.panel).opacity(.82);
   const healthBack = scene.add('cube,rounded').scale(0).color(.20, .07, .12);
   const healthFill = scene.add('cube,rounded').scale(0).color(COLORS.perfect);
   const progressBack = scene.add('cube,rounded').scale(0).color(.06, .13, .20);
   const progressFill = scene.add('cube,rounded').scale(0).color(COLORS.accent);

   const handTrack = {
      left: { valid: false, pos: [0, 0, 0], previous: null, velocity: [0, 0, 0], speed: 0,
              node: scene.add('sphere').scale(0).color(COLORS.lanes[0]).opacity(.66) },
      right: { valid: false, pos: [0, 0, 0], previous: null, velocity: [0, 0, 0], speed: 0,
               node: scene.add('sphere').scale(0).color(COLORS.lanes[3]).opacity(.66) },
   };

   const makeNoteVisual = note => {
      const root = scene.add().scale(0);
      const laneColor = COLORS.lanes[note.lane];
      // Notes are thin tiles parallel to the highway, with constant world size.
      const body = root.add('cube,rounded')
          .scale(.185 * playfieldScale, .018, .105 * playfieldScale).color(laneColor);
      root.add('cube,rounded').move(0, .020, .008)
          .scale(.125 * playfieldScale, .006, .055 * playfieldScale)
          .color(.88, .97, 1.0);
      const visual = { root, body, trail: [], guide: null };

      if (note.type === 'flickUp') {
         // The arrow lies in the same XZ plane and points toward the horizon.
         root.add('cube,rounded').move(0, .029, -.008)
             .scale(.018 * playfieldScale, .006, .060 * playfieldScale)
             .color(1, 1, 1);
         root.add('cube,rounded').move(-.020, .029, -.037).turnY(-.62)
             .scale(.016 * playfieldScale, .006, .050 * playfieldScale).color(1, 1, 1);
         root.add('cube,rounded').move(.020, .029, -.037).turnY(.62)
             .scale(.016 * playfieldScale, .006, .050 * playfieldScale).color(1, 1, 1);
      }
      if (note.type === 'hold') {
         root.add('torusY').move(0, .012, 0)
             .scale(.17 * playfieldScale, .012, .090 * playfieldScale).color(1, 1, 1);
         const segmentCount = Math.max(8, Math.ceil(note.duration * 6));
         for (let index = 1; index <= segmentCount; index++)
            visual.trail.push(scene.add('cube,rounded').scale(0)
               .color(laneColor).opacity(.62));
         visual.guide = scene.add('torusY').scale(0).color(COLORS.perfect).opacity(.90);
      }
      return visual;
   };
   notes.forEach(note => note.visual = makeNoteVisual(note));

   const curveOffset = (note, phase, approach = 1) => {
      if (note.curve !== 'sweep')
         return [0, 0];
      const wave = Math.sin(Math.PI * clamp(phase, 0, 1));
      return [.18 * playfieldScale * wave * approach, 0];
   };

   const holdTarget = (note, currentSongTime) => {
      const phase = clamp((currentSongTime - note.time) / note.duration, 0, 1);
      const offset = curveOffset(note, phase);
      return [CONFIG.laneX[note.lane] + offset[0],
              CONFIG.noteY, CONFIG.hitZ];
   };

   const hideNote = note => {
      note.visual.root.identity().scale(0);
      note.visual.trail.forEach(segment => segment.identity().scale(0));
      note.visual.guide?.identity().scale(0);
   };

   const updateNoteVisual = (note, currentSongTime) => {
      if (['hit', 'completed', 'missed'].includes(note.state)) {
         hideNote(note);
         return;
      }

      const timeUntil = note.time - currentSongTime;
      const shouldShow = timeUntil <= CONFIG.spawnLeadTime &&
                         (timeUntil >= -.45 || note.state === 'armed' || note.state === 'holding');
      if (!shouldShow) {
         hideNote(note);
         return;
      }

      let headPosition = getNotePosition(note.lane, note.time, currentSongTime);
      if (note.state === 'armed')
         headPosition = [CONFIG.laneX[note.lane], CONFIG.noteY, CONFIG.hitZ];
      note.visual.root.identity().move(headPosition);

      if (note.type !== 'hold')
         return;

      const segmentCount = note.visual.trail.length;
      for (let index = 0; index < segmentCount; index++) {
         const phase = (index + 1) / segmentCount;
         const segmentTime = note.time + note.duration * phase;
         const untilSegment = segmentTime - currentSongTime;
         const approach = clamp(1 - untilSegment / CONFIG.spawnLeadTime, 0, 1);
         if (untilSegment > CONFIG.spawnLeadTime || untilSegment < -.18) {
            note.visual.trail[index].identity().scale(0);
            continue;
         }
         const position = getNotePosition(note.lane, segmentTime, currentSongTime);
         const offset = curveOffset(note, phase, approach);
         position[0] += offset[0];
         // Every segment has the same physical dimensions. Perspective alone
         // makes distant pieces look smaller and near pieces look larger.
         note.visual.trail[index].identity().move(position)
             .scale(.180 * playfieldScale, .014, .100 * playfieldScale);
      }

      if (note.state === 'holding') {
         const target = holdTarget(note, currentSongTime);
         note.visual.guide.identity().move(target)
             .scale(.20 * playfieldScale, .015, .14 * playfieldScale);
      }
      else
         note.visual.guide.identity().scale(0);
   };

   const resetNote = note => {
      note.state = 'pending';
      note.wasInside.left = note.wasInside.right = false;
      note.armY = note.armTime = note.contactError = 0;
      note.headJudgment = null;
      note.outsideSince = null;
      note.debugHeld = false;
      hideNote(note);
   };

   const resetRun = () => {
      synth.stop();
      notes.forEach(resetNote);
      songTime = 0;
      score = 0;
      combo = 0;
      maxCombo = 0;
      health = CONFIG.startHealth;
      counts = { perfect: 0, good: 0, miss: 0 };
      recentJudgment = '';
      recentJudgmentAt = -10;
      finalAccuracy = 0;
      for (let flash of flashes)
         flash.startedAt = -10;
   };

   const beginCountdown = (forceRestart = false) => {
      if (state === STATES.COUNTDOWN ||
          state === STATES.PLAYING && !forceRestart)
         return;
      resetRun();
      state = STATES.COUNTDOWN;
      countdownEndsAt = model.time + 3.0;
      // This begins inside a trigger/key event, satisfying browser audio policy.
      synth.prepare();
   };

   const startPlaying = () => {
      fallbackSongStart = model.time;
      synth.start(SONG_DURATION);
      state = STATES.PLAYING;
      recentJudgment = 'GO!';
      recentJudgmentAt = model.time;
   };

   const finishGame = didClear => {
      if (state !== STATES.PLAYING)
         return;
      state = didClear ? STATES.CLEAR : STATES.FAILED;
      finalAccuracy = calculateAccuracy(counts);
      synth.stop();
      notes.forEach(hideNote);
      if (didClear) {
         pulse('left', .45, 130);
         pulse('right', .45, 130);
      }
   };

   const judgmentFromError = error =>
      Math.abs(error) <= CONFIG.perfectWindow ? 'PERFECT' : 'GOOD';

   const displayJudgment = judgment => {
      recentJudgment = judgment;
      recentJudgmentAt = model.time;
   };

   const registerResult = (note, judgment) => {
      if (['hit', 'completed', 'missed'].includes(note.state))
         return;

      if (judgment === 'MISS') {
         note.state = 'missed';
         counts.miss++;
         combo = 0;
         health = Math.max(0, health - CONFIG.missDamage);
         displayJudgment('MISS');
         pulse(handForLane(note.lane), .18, 90);
      }
      else {
         note.state = note.type === 'hold' ? 'completed' : 'hit';
         const key = judgment.toLowerCase();
         counts[key]++;
         combo++;
         maxCombo = Math.max(maxCombo, combo);
         score += judgment === 'PERFECT' ? CONFIG.perfectScore : CONFIG.goodScore;
         if (note.type === 'hold')
            score += CONFIG.holdCompletionBonus;
         displayJudgment(judgment);
         pulseSuccessfulHit(note, judgment);
         flashes[note.lane].startedAt = model.time;
      }
      hideNote(note);
      if (health <= 0)
         finishGame(false);
   };

   const contactNote = (note, hand, error, fromKeyboard = false) => {
      if (note.state !== 'pending')
         return;
      const judgment = judgmentFromError(error);
      if (note.type === 'tap') {
         registerResult(note, judgment);
      }
      else if (note.type === 'flickUp') {
         if (fromKeyboard) {
            registerResult(note, judgment);
            return;
         }
         note.state = 'armed';
         note.armY = handTrack[hand].pos[1];
         note.armTime = model.time;
         note.contactError = error;
         displayJudgment('FLICK UP!');
         pulse(hand, .14, 25);
      }
      else if (note.type === 'hold') {
         note.state = 'holding';
         note.headJudgment = judgment;
         note.outsideSince = null;
         note.debugHeld = fromKeyboard;
         displayJudgment('HOLD');
         pulse(hand, .16, 35);
      }
   };

   const updateHands = dt => {
      for (let hand of ['left', 'right']) {
         const tracked = handTrack[hand];
         const raw = inputEvents.pos(hand);
         const valid = raw && raw.length >= 3 &&
                       Array.from(raw).slice(0, 3).every(Number.isFinite) &&
                       Math.hypot(raw[0], raw[1], raw[2]) > .01;
         tracked.valid = valid;
         if (!valid) {
            tracked.previous = null;
            tracked.velocity = [0, 0, 0];
            tracked.speed = 0;
            tracked.node.identity().scale(0);
            continue;
         }

         tracked.pos = raw.slice(0, 3);
         if (!tracked.previous || dt <= .001 || dt > .10) {
            tracked.velocity = [0, 0, 0];
         }
         else {
            for (let axis = 0; axis < 3; axis++) {
               const rawVelocity = clamp((tracked.pos[axis] - tracked.previous[axis]) / dt,
                                         -CONFIG.maxTrackedSpeed, CONFIG.maxTrackedSpeed);
               tracked.velocity[axis] = mix(tracked.velocity[axis], rawVelocity, .45);
            }
         }
         tracked.speed = Math.hypot(...tracked.velocity);
         tracked.previous = tracked.pos.slice();
         tracked.node.identity().move(tracked.pos).scale(.034);
      }
   };

   const attemptSpatialHits = currentSongTime => {
      for (let hand of ['left', 'right']) {
         const tracked = handTrack[hand];
         if (!tracked.valid)
            continue;
         let candidate = null;
         let candidateScore = Infinity;

         for (let note of notes) {
            if (note.state !== 'pending' || handForLane(note.lane) !== hand)
               continue;
            const timeUntil = note.time - currentSongTime;
            if (timeUntil > CONFIG.spawnLeadTime || timeUntil < -CONFIG.goodWindow) {
               note.wasInside[hand] = false;
               continue;
            }
            const position = getNotePosition(note.lane, note.time, currentSongTime);
            const distance = cg.distance(tracked.pos, position);
            const inside = distance <= CONFIG.hitRadius;
            const entered = inside && !note.wasInside[hand];
            note.wasInside[hand] = inside;
            const meaningfulMotion = tracked.speed >= CONFIG.minimumHitSpeed && entered ||
                                     tracked.speed >= CONFIG.strongHitSpeed && inside;
            const error = currentSongTime - note.time;
            if (inside && meaningfulMotion && Math.abs(error) <= CONFIG.goodWindow) {
               const priority = Math.abs(error) + distance * .05;
               if (priority < candidateScore) {
                  candidateScore = priority;
                  candidate = { note, error };
               }
            }
         }
         if (candidate)
            contactNote(candidate.note, hand, candidate.error);
      }
   };

   const updateFlicks = () => {
      for (let note of notes) {
         if (note.state !== 'armed')
            continue;
         const hand = handForLane(note.lane);
         const tracked = handTrack[hand];
         if (tracked.valid) {
            const upwardDistance = tracked.pos[1] - note.armY;
            if (upwardDistance >= CONFIG.flickMinDistance ||
                tracked.velocity[1] >= CONFIG.flickMinVelocity) {
               registerResult(note, judgmentFromError(note.contactError));
               continue;
            }
         }
         if (model.time - note.armTime > CONFIG.flickGestureWindow)
            registerResult(note, 'MISS');
      }
   };

   const updateHolds = currentSongTime => {
      for (let note of notes) {
         if (note.state !== 'holding')
            continue;
         if (currentSongTime >= note.time + note.duration) {
            registerResult(note, note.headJudgment);
            continue;
         }
         if (note.debugHeld)
            continue;

         const hand = handForLane(note.lane);
         const tracked = handTrack[hand];
         const target = holdTarget(note, currentSongTime);
         const inside = tracked.valid && cg.distance(tracked.pos, target) <= CONFIG.holdRadius;
         if (inside)
            note.outsideSince = null;
         else if (note.outsideSince === null)
            note.outsideSince = model.time;
         else if (model.time - note.outsideSince > CONFIG.holdGraceTime)
            registerResult(note, 'MISS');
      }
   };

   const registerLateMisses = currentSongTime => {
      for (let note of notes) {
         if (state !== STATES.PLAYING)
            return;
         if (note.state === 'pending' && currentSongTime - note.time > CONFIG.goodWindow)
            registerResult(note, 'MISS');
      }
   };

   const simulateKeyboardHit = (hand, flick) => {
      if (state !== STATES.PLAYING)
         return;
      const eligible = notes.filter(note =>
         note.state === 'pending' && handForLane(note.lane) === hand &&
         (flick ? note.type === 'flickUp' : note.type !== 'flickUp') &&
         Math.abs(songTime - note.time) <= CONFIG.goodWindow)
         .sort((a, b) => Math.abs(songTime - a.time) - Math.abs(songTime - b.time));
      if (eligible.length)
         contactNote(eligible[0], hand, songTime - eligible[0].time, true);
   };

   const onPress = () => {
      if (state === STATES.MENU || state === STATES.CLEAR || state === STATES.FAILED)
         beginCountdown();
   };
   inputEvents.onPress = onPress;

   const onKeyDown = event => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey)
         return;
      const key = event.key.toUpperCase();
      if (key === ' ' && state === STATES.MENU) {
         beginCountdown();
         event.preventDefault();
      }
      else if (key === 'R') {
         if (state !== STATES.COUNTDOWN)
            beginCountdown(true);
      }
      else if (key === 'A') simulateKeyboardHit('left', false);
      else if (key === 'L') simulateKeyboardHit('right', false);
      else if (key === 'Q') simulateKeyboardHit('left', true);
      else if (key === 'P') simulateKeyboardHit('right', true);
   };
   window.addEventListener('keydown', onKeyDown);

   const updateEffects = () => {
      for (let flash of flashes) {
         const age = model.time - flash.startedAt;
         if (age < 0 || age > .24) {
            flash.node.identity().scale(0);
            continue;
         }
         const phase = age / .24;
         flash.node.identity().move(flash.position)
                   .scale((.05 + .19 * phase) * playfieldScale)
                   .opacity(1 - phase);
      }
   };

   const updateUI = () => {
      hideEveryText();
      menuPanel.identity().scale(0);
      startButton.identity().scale(0);
      resultPanel.identity().scale(0);
      hudLeft.identity().scale(0);
      hudRight.identity().scale(0);
      healthBack.identity().scale(0);
      healthFill.identity().scale(0);
      progressBack.identity().scale(0);
      progressFill.identity().scale(0);

      if (state === STATES.MENU) {
         menuPanel.identity().move(0, 1.64, -.80).scale(.58, .46, .020);
         startButton.identity().move(0, 1.36, -.76).scale(.24, .050, .018);
         showText('title', 'AIRBEAT VR');
         showText('menuStatus', '30 SECOND RHYTHM RUN // 113 BPM');
         showText('help1', 'BLUE LANES LEFT HAND   PINK LANES RIGHT HAND');
         showText('help2', 'SWING THROUGH TAP   FLICK UP ARROWS');
         showText('help3', 'KEEP YOUR HAND IN HOLD RAILS');
         showText('prompt', 'PRESS EITHER TRIGGER TO START');
         showText('audioMode', `AUDIO // ${synth.modeLabel}`);
         showText('desktop', 'DESKTOP  SPACE START   A L TAP   Q P FLICK   R RESTART');
         return;
      }

      if (state === STATES.COUNTDOWN) {
         menuPanel.identity().move(0, 1.72, -.80).scale(.34, .40, .020);
         showText('title', 'AIRBEAT VR');
         const remaining = Math.max(1, Math.ceil(countdownEndsAt - model.time));
         showText('countdown', `${remaining}`);
         return;
      }

      if (state === STATES.CLEAR || state === STATES.FAILED) {
         resultPanel.identity().move(0, 1.64, -.80).scale(.54, .42, .020);
         const didClear = state === STATES.CLEAR;
         showText('resultTitle', didClear ? 'SONG CLEAR!' : 'FAILED',
                  didClear ? COLORS.perfect : COLORS.miss);
         showText('resultScore', `FINAL SCORE ${String(score).padStart(6, '0')}`);
         showText('resultStats', `MAX COMBO ${maxCombo}   ACCURACY ${finalAccuracy.toFixed(1)}%`);
         showText('resultCounts', `PERFECT ${counts.perfect}   GOOD ${counts.good}   MISS ${counts.miss}`);
         showText('restart', 'PRESS TRIGGER OR R TO RESTART');
         return;
      }

      hudLeft.identity().move(-.37, 1.75, -.76).scale(.21, .12, .018);
      hudRight.identity().move(.37, 1.75, -.76).scale(.21, .12, .018);
      showText('score', `SCORE ${String(score).padStart(6, '0')}`);
      showText('combo', `COMBO ${combo}`);
      showText('health', `HP ${health}`);
      showText('time', `TIME ${Math.max(0, Math.ceil(SONG_DURATION - songTime))}`);

      const hpFraction = health / CONFIG.startHealth;
      healthBack.identity().move(.37, 1.58, -.75).scale(.17, .014, .010);
      healthFill.identity().move(.20 + .17 * hpFraction, 1.58, -.73)
                .scale(.17 * hpFraction, .009, .007)
                .color(hpFraction > .35 ? COLORS.perfect : COLORS.miss);

      const progress = clamp(songTime / SONG_DURATION, 0, 1);
      progressBack.identity().move(0, 1.96, -.78).scale(.26, .008, .008);
      progressFill.identity().move(-.26 + .26 * progress, 1.96, -.76)
                  .scale(.26 * progress, .005, .005);

      const judgmentAge = model.time - recentJudgmentAt;
      if (recentJudgment && judgmentAge < .85) {
         const color = recentJudgment === 'PERFECT' ? COLORS.perfect
                     : recentJudgment === 'GOOD' || recentJudgment === 'HOLD' ? COLORS.good
                     : recentJudgment === 'MISS' ? COLORS.miss : COLORS.text;
         showText('judgment', recentJudgment, color, .85 + .08 * (1 - judgmentAge / .85));
      }

      if (CONFIG.debug) {
         const left = handTrack.left, right = handTrack.right;
         showText('debug', `T ${songTime.toFixed(2)}   LY ${left.velocity[1].toFixed(2)}   RY ${right.velocity[1].toFixed(2)}`);
      }
   };

   const updateFrame = () => {
      const dt = clamp(model.time - lastFrameTime, 0, .05);
      lastFrameTime = model.time;
      updateHands(dt);

      if (state === STATES.COUNTDOWN && model.time >= countdownEndsAt)
         startPlaying();

      if (state === STATES.PLAYING) {
         songTime = synth.songTime(model.time - fallbackSongStart);
         notes.forEach(note => updateNoteVisual(note, songTime));
         attemptSpatialHits(songTime);
         updateFlicks();
         updateHolds(songTime);
         registerLateMisses(songTime);
         if (state === STATES.PLAYING && songTime >= SONG_DURATION)
            finishGame(health > 0);
      }
      else if (state === STATES.MENU || state === STATES.COUNTDOWN) {
         notes.forEach(hideNote);
      }

      for (let lane = 0; lane < hitPads.length; lane++) {
         const phase = .76 + .12 * Math.sin(model.time * 3 + lane);
         hitPads[lane].opacity(phase);
      }
      updateEffects();
      updateUI();
   };

   cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      if (inputEvents.onPress === onPress)
         inputEvents.onPress = previousOnPress;
      synth.dispose();
   };

   resetRun();
   model.animate(updateFrame);
};

export const deinit = () => {
   cleanup?.();
   cleanup = null;
};
