import * as cg from '../render/core/cg.js';
import { buttonState } from '../render/core/controllerInput.js';
import { initMusicBox, deinit as deinitMusicBox } from './hw7-living-music-box.js';
import { SOURCES } from '../util/living-music-box.mjs';
import { createConductor } from '../util/music-box-conductor.js';
import { initialDuet, applyDuetEvent, interruptDuet, validBellContact, sequenceForRole,
   assignRoles, stagePose, validMatrix, WIND_REQUIRED, KEY_POSITION } from '../util/music-box-duet.mjs';

export const reloadOnFocus = false;
const PLAYERS = 'hw8DuetPlayers', GAME = 'hw8DuetGame';
const SEND_MS = 50, STALE_MS = 2000;
let cleanup = null;
export const init = async model => {
   window[PLAYERS] ??= {};
   window[GAME] ??= initialDuet();
   let api, conductor, sequenceRoot, noteLabels, statusLabel, instructionLabel, keyHint, keySpoke, stageRing;
   let state = window[GAME], role = 'spectator', seq = 0, eventID = 0, outbox = [];
   let lastSend = -Infinity, lastPublish = -Infinity, seenRound = -1, seenFeedback = null;
   let wind = 0, latched = false, keyDragging = false, lastMouseX = 0;
   let lastWrist = {}, feedbackAt = -Infinity, feedbackKind = '', feedbackBell = -1;
   const session = `${Date.now()}-${Math.random()}`, observed = new Map(), keys = new Set();
   const surface = typeof canvas !== 'undefined' ? canvas : null;
   const id = () => window.clientID;
   const rawHead = () => clay.pose?.transform?.matrix || clay.root().inverseViewMatrix(0);
   const players = () => window[PLAYERS];
   const active = () => state.phase === 'active';
   const canArrange = () => role === 'giant' && !active();
   const fresh = who => observed.has(who) && performance.now() - observed.get(who).time < STALE_MS;
   const pose = (who, part) => {
      const p = players()[who];
      if (!p || !fresh(who)) return null;
      if (!p.xr) return validMatrix(p.desktop?.[part]) ? p.desktop[part] : null;
      return stagePose(cg, p.toStage, part === 'head' ? clientState.head(who) : clientState.hand(who, part));
   };
   const enqueue = data => {
      if (outbox.length >= 64) return false;
      outbox.push({ ...data, id: ++eventID, session, round: state.round });
      lastSend = -Infinity;
      return true;
   };
   const windKey = delta => {
      if (role !== 'giant' || active() || latched || !Number.isFinite(delta)) return;
      if (wind === 0) api.startAudio();
      wind = Math.min(WIND_REQUIRED, wind + Math.abs(delta));
      if (wind >= WIND_REQUIRED && enqueue({ type: 'wind', angle: wind })) latched = true;
   };
   const keyScreenPoint = () => {
      const view = clay.views?.[0], rect = surface?.getBoundingClientRect();
      if (!api || !view || !rect?.width || !rect.height) return null;
      const world = cg.mTransform(api.box.getGlobalMatrix(), KEY_POSITION);
      const p = cg.mTransform(cg.mMultiply(view.projectionMatrix, view.viewMatrix), [...world, 1]);
      if (!Number.isFinite(p[3]) || p[3] <= 0) return null;
      return [rect.left + (p[0] / p[3] + 1) * rect.width / 2, rect.top + (1 - p[1] / p[3]) * rect.height / 2];
   };
   const mouseDown = e => {
      if (window.vr || role !== 'giant' || active() || e.button !== 0) return;
      const key = keyScreenPoint();
      if (!key || Math.hypot(e.clientX - key[0], e.clientY - key[1]) > 32) return;
      keyDragging = true; latched = false; lastMouseX = e.clientX; api.startAudio(); e.preventDefault();
   };
   const mouseMove = e => {
      if (!keyDragging) return;
      windKey((e.clientX - lastMouseX) * .025); lastMouseX = e.clientX;
   };
   const mouseUp = () => { keyDragging = false; };
   const keyDown = e => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) || e.target?.isContentEditable) return;
      keys.add(e.key.toLowerCase());
   };
   const keyUp = e => keys.delete(e.key.toLowerCase());
   const blur = () => { keys.clear(); mouseUp(); lastWrist = {}; };
   surface?.addEventListener('mousedown', mouseDown);
   window.addEventListener('mousemove', mouseMove);
   window.addEventListener('mouseup', mouseUp);
   window.addEventListener('keydown', keyDown);
   window.addEventListener('keyup', keyUp);
   window.addEventListener('blur', blur);
   const publish = () => { window[GAME] = state; server.broadcastGlobal(GAME); lastPublish = performance.now(); };
   const send = () => {
      if (id() === undefined) return;
      const root = cg.mInverse(clay.inverseRootMatrix || cg.mIdentity());
      const toStage = cg.mMultiply(cg.mInverse(api.box.getGlobalMatrix()), root);
      const inverseBox = cg.mInverse(api.box.getGlobalMatrix());
      const winding = role === 'giant' && !active() && (keyDragging || keys.has('k'));
      window[PLAYERS][id()] = {
         session, seq: ++seq, xr: !!window.vr && validMatrix(clientState.head(id())),
         round: state.round, toStage, feet: api.feet.slice(), wind,
         events: outbox.slice(),
         ...(!window.vr ? { desktop: {
            head: cg.mMultiply(inverseBox, rawHead()),
            left: cg.mMultiply(inverseBox, cg.mMultiply(rawHead(), cg.mTranslate(-.25, -.45, -.3))),
            right: winding ? cg.mMultiply(cg.mTranslate(KEY_POSITION), cg.mRotateX(wind))
               : cg.mMultiply(inverseBox, cg.mMultiply(rawHead(), cg.mTranslate(.25, -.45, -.3))),
         } } : {}),
         ...(canArrange() ? { box: api.boxMatrix.slice(), items: api.itemMatrices.map(m => m.slice()) } : {}),
      };
      server.broadcastGlobalElement(PLAYERS, id()); lastSend = performance.now();
   };
   const updateWind = dt => {
      if (role !== 'giant') return;
      let grabbing = keyDragging || (!window.vr && keys.has('k'));
      if (!window.vr && keys.has('k')) windKey(dt * Math.PI);
      if (window.vr) for (const hand of ['left', 'right']) {
         const m = pose(id(), hand);
         const near = m && cg.distance(m.slice(12, 15), KEY_POSITION) < .085;
         if (near && buttonState[hand][0]?.pressed) {
            grabbing = true;
            const angle = Math.atan2(m[6], m[5]);
            if (lastWrist[hand] !== undefined) {
               const delta = Math.atan2(Math.sin(angle - lastWrist[hand]), Math.cos(angle - lastWrist[hand]));
               // Reject tracking flips; permit regripping to accumulate a half-turn.
               if (Math.abs(delta) < .8) windKey(delta);
            }
            lastWrist[hand] = angle;
         } else delete lastWrist[hand];
      }
      if (!grabbing) {
         latched = false;
         if (wind >= WIND_REQUIRED) wind = 0;
      }
   };
   await initMusicBox(model, {
      lockScale: true, canManipulate: canArrange,
      press(hand, pose) {
         const marker = cg.mTransform(pose, [0, -.049, -.079]);
         if (role === 'giant' && cg.distance(marker, KEY_POSITION) < .085) {
            api.pulse(hand, .2, 35); return true;
         }
         return false;
      },
      canStrike: () => role === 'ballerina' && active(),
      canLayer: () => !active(),
      instructions: ['', ''],
      key(k) { if (k === 'k' && role === 'giant') api.startAudio(); },
      action: () => api.startAudio(), // A/X only enables audio. The key starts rounds.
      onBell(bell, hand, contact) {
         if (role !== 'ballerina' || !active() || !contact || !hand) return false;
         return enqueue({ type: 'bell', bell, hand, contact });
      },
      ready(value) {
         api = value;
         conductor = createConductor(api.box);
         statusLabel = api.hud.child(1); instructionLabel = api.hud.child(2);
         sequenceRoot = api.hud.add();
         noteLabels = SOURCES.map((s, i) => sequenceRoot.add('label').info('').move(-.36 + i * .24, 1.73, -1.1).scale(.011).color(s.color));
         keySpoke = api.box.add();
         keySpoke.add('cube').scale(.004, .025, .004).color(.94, .73, .28).dull();
         keySpoke.add('sphere').move(0, .025, 0).scale(.009).color(1, .93, .62).dull();
         keyHint = api.box.add('label').info('WIND KEY').move(.29, .025, .03).scale(.006).color(.35, .24, .12);
         stageRing = api.box.add('torusY').color(.4, .9, .65);
      },
      beforeFrame(_, dt) {
         window[PLAYERS] = server.synchronize(PLAYERS) || {};
         state = server.synchronize(GAME) || initialDuet(); window[GAME] = state;
         const now = performance.now();
         for (const who of window.clients || []) {
            const p = players()[who], old = observed.get(who);
            if (p && (!old || p.seq !== old.seq || p.session !== old.session))
               observed.set(who, { seq: p.seq, session: p.session, time: now });
         }
         const ids = (window.clients || []).filter(who => fresh(who) && players()[who]);
         const host = ids[0];
         if (host === id()) {
            const roles = assignRoles(state.roles, ids, Object.fromEntries(ids.map(who => [who, players()[who].xr])));
            const changed = roles.giant !== state.roles.giant || roles.ballerina !== state.roles.ballerina;
            if (changed || state.host !== host) {
               state = { ...(changed && active() ? interruptDuet(state) : state), roles, host };
               publish();
            }
         }
         role = id() === state.roles.giant ? 'giant' : id() === state.roles.ballerina ? 'ballerina' : 'spectator';
         api.setMiniature(role === 'ballerina');
         if (state.round !== seenRound) {
            api.cancelGrabs(); if (role === 'ballerina') api.resetFeet();
            seenRound = state.round; wind = 0;
         }
         if (active()) api.cancelGrabs();
         if (state.box && !canArrange()) api.setBox(state.box);
         if (state.items && !canArrange()) api.setItems(state.items);
         const ack = state.acks[`${id()}:${session}`] || 0;
         outbox = outbox.filter(e => e.id > ack);
         updateWind(dt);
      },
      avatar() {
         const who = role === 'ballerina' ? id() : state.roles.ballerina;
         let head, hands;
         if (role === 'ballerina') {
            const map = cg.mMultiply(cg.mInverse(api.box.getGlobalMatrix()), cg.mInverse(clay.inverseRootMatrix || cg.mIdentity()));
            head = stagePose(cg, map, clientState.head(who));
            hands = Object.fromEntries(['left', 'right'].map(h => [h, stagePose(cg, map, clientState.hand(who, h)) || cg.mScale(0)]));
         } else {
            head = pose(who, 'head');
            hands = Object.fromEntries(['left', 'right'].map(h => [h, pose(who, h) || cg.mScale(0)]));
         }
         return head ? { head, hands } : undefined;
      },
      afterFrame() {
         const now = performance.now();
         if (now - lastSend >= SEND_MS) send();
         if (state.host === id()) {
            const ids = (window.clients || []).filter(who => fresh(who) && players()[who]);
            const pair = [state.roles.giant, state.roles.ballerina];
            const connected = pair.every(who => ids.includes(who) && validMatrix(pose(who, 'head')))
               && !!players()[state.roles.ballerina]?.xr;
            const sessions = Object.fromEntries(pair.filter(who => who !== undefined).map(who => [who, players()[who]?.session]));
            if (active() && (!connected || pair.some(who => state.sessions[who] !== sessions[who]))) {
               state = interruptDuet(state); publish();
            }
            const giant = players()[state.roles.giant];
            if (!active() && role !== 'giant' && giant?.box && giant?.items) {
               api.setBox(giant.box); api.setItems(giant.items);
            }
            let changed = false;
            for (const who of ids) {
               const p = players()[who];
               for (const event of [...(p.events || [])].sort((a, b) => a.id - b.id)) {
                  if (event.session !== p.session) continue;
                  const bellMatrix = api.itemMatrices[event.bell];
                  const center = bellMatrix ? cg.mTransform(bellMatrix, [0, -.005, 0]) : null;
                  const ready = connected && pair.every(partner => players()[partner].round === state.round);
                  const next = applyDuetEvent(state, who, event, {
                     ready, sessions, contact: !!center && validBellContact(event, center),
                  });
                  if (next !== state) { state = next; changed = true; }
               }
            }
            window[GAME] = state;
            if (changed || now - lastPublish >= SEND_MS) {
               state = { ...state, box: api.boxMatrix.slice(), items: api.itemMatrices.map(m => m.slice()) };
               publish();
            }
         }
         const giantHead = pose(state.roles.giant, 'head');
         const giantHands = Object.fromEntries(['left', 'right'].map(h => [h, pose(state.roles.giant, h)]));
         conductor.update(giantHead, giantHands, api.boxMatrix, role !== 'giant');
         // In first person show only the conductor's own hands, never a head in the camera.
         if (role === 'giant') for (const h of ['left', 'right']) {
            conductor.hands[h].setMatrix(giantHands[h] || cg.mScale(0));
         }
         if (role === 'giant') {
            conductor.root.identity(); conductor.body.scale(0); conductor.head.scale(0);
            Object.values(conductor.arms).flat().forEach(n => n.scale(0));
         }
         if (role === 'spectator' || !pose(state.roles.ballerina, 'head')) {
            api.body.scale(0); api.face.scale(0); Object.values(api.hands).forEach(n => n.scale(0));
         }
         if (seenFeedback === null) seenFeedback = state.serial;
         for (const f of state.feedback.filter(f => f.serial > seenFeedback)) {
            seenFeedback = f.serial;
            if (f.round !== state.round) continue;
            api.playStrike(f.bell, role === 'ballerina' ? f.hand : null); api.cue(f.kind, f.bell);
            api.pulse('left', f.kind === 'mistake' ? .65 : .3, f.kind === 'victory' ? 180 : 70);
            api.pulse('right', f.kind === 'mistake' ? .65 : .3, f.kind === 'victory' ? 180 : 70);
            feedbackAt = now; feedbackKind = f.kind; feedbackBell = f.bell;
         }
         const flash = Math.max(0, 1 - (now - feedbackAt) / 850);
         const color = feedbackKind === 'mistake' ? [1, .3, .36] : [.3, .9, .65];
         if (flash && feedbackBell >= 0) api.bells[feedbackBell].child(1).color(color);
         stageRing.identity().move(0, .014, 0).scale(flash ? [.23, .004 * flash, .23] : 0).color(color);
         const angle = players()[state.roles.giant]?.wind || 0;
         api.windingKey.setMatrix(cg.mMultiply(cg.mTranslate(KEY_POSITION), cg.mRotateX(angle))).scale(.006, .019, .019);
         keySpoke.setMatrix(cg.mMultiply(cg.mTranslate(KEY_POSITION), cg.mRotateX(angle)));
         keyHint.info(active() ? 'PERFORMING' : 'WIND KEY');
         const win = state.phase === 'won';
         const hasPair = state.roles.giant !== undefined && state.roles.ballerina !== undefined;
         const windingText = role === 'giant' && !active() && !win && wind > 0 ? `WINDING ${Math.round(wind / WIND_REQUIRED * 100)}%`
            : `${state.progress} / 4 NOTES`;
         api.title.info(`A DUET | ${role === 'giant' ? 'CONDUCTOR - HUMAN' : role === 'ballerina' ? 'PERFORMER - 1:12' : 'SPECTATOR'} | ${win ? 'DUET COMPLETE!' : windingText}`);
         statusLabel.info(win ? 'You made music together! Conductor: wind the key for a new melody.'
            : active() ? (flash && feedbackKind === 'mistake' ? 'Wrong note - same melody, start again at note 1.'
               : role === 'giant' ? 'Say the four notes below in order. Your partner plays them.' : 'Listen to your conductor. Walk to the named bell and touch its cap.')
            : state.reason || (hasPair ? 'Both players ready. Conductor: wind the gold key to begin.' : 'Connect computer + VR. Conductor: turn the gold winding key.'));
         instructionLabel.info(role === 'giant' ? (active() ? 'Read your four notes aloud. Only the performer can play bells.' : 'Hold K for one second, or drag the gold key left / right.')
            : role === 'ballerina' ? 'Left stick: walk. Release trigger, then touch. Trigger once: enable audio.' : 'The first computer and VR participant perform the duet.');
         const notes = sequenceForRole(state, role);
         sequenceRoot.identity().scale(notes.length ? 1 : 0);
         noteLabels.forEach((label, i) => {
            label.info(notes[i] ? `${i + 1}. ${notes[i]}` : '');
            if (notes[i]) label.color(SOURCES[state.sequence[i]].color);
         });
         api.hud.setMatrix(cg.mMultiply(cg.mInverse(model.getGlobalMatrix()), rawHead())).move(0, -1.68, .15);
      },
      dispose() {
         surface?.removeEventListener('mousedown', mouseDown);
         window.removeEventListener('mousemove', mouseMove); window.removeEventListener('mouseup', mouseUp);
         window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur);
         if (id() !== undefined && players()[id()]?.session === session) {
            window[PLAYERS][id()] = null; server.broadcastGlobalElement(PLAYERS, id());
         }
      },
   });
   cleanup = deinitMusicBox;
};
export const deinit = () => { cleanup?.(); cleanup = null; };
