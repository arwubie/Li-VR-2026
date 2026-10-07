

import * as cg from "../render/core/cg.js";
import { lcb, rcb } from "../handle_scenes.js";
import {
   loadSound,
   playSoundAtPosition,
} from "../util/positional-audio.js";

// INITIALIZE THE GLOBAL SHARED STATE, FOLLOWING construct.js.

const SHARED_STATE = 'scoreNotes';
server.init(SHARED_STATE, {});

// STAFF LAYOUT. X IS TIME; Y IS PITCH.

const STAFF_Z = 0;
const STAFF_LEFT = -0.49;
const STAFF_RIGHT = 0.49;
const STAFF_BOTTOM = 1.31;
const STAFF_TOP = 1.67;
const STAFF_CENTER_Y = (STAFF_BOTTOM + STAFF_TOP) / 2;
const BEAT_COUNT = 8;
const PITCH_COUNT = 9;
const BEAT_SPACING = (STAFF_RIGHT - STAFF_LEFT) / (BEAT_COUNT - 1);
const PITCH_SPACING = (STAFF_TOP - STAFF_BOTTOM) / (PITCH_COUNT - 1);
const NOTE_RADIUS = 0.038;
const BPM = 100;
const DISPLAY_SCALE = 0.90;
const DISPLAY_CENTER_Y = 1.32;

// Assignment pitch layout, ordered strictly from bottom to top.
// The bottom line starts at middle C (C4 / do), and every line or space
// above it advances by one natural scale step.
const PITCHES = [
   { name: 'C4', solfege: 'do' , file: 'c4.mp3' },
   { name: 'D4', solfege: 're' , file: 'd4.mp3' },
   { name: 'E4', solfege: 'mi' , file: 'e4.mp3' },
   { name: 'F4', solfege: 'fa' , file: 'f4.mp3' },
   { name: 'G4', solfege: 'sol', file: 'g4.mp3' },
   // The supplied a4/b4 files sound one octave low, so use their native
   // higher-octave samples rather than doubling playback speed.
   { name: 'A4', solfege: 'la' , file: 'a5.mp3' },
   { name: 'B4', solfege: 'si' , file: 'b5.mp3' },
   { name: 'C5', solfege: 'do' , file: 'c5.mp3' },
   { name: 'D5', solfege: 're' , file: 'd5.mp3' },
];

const NOTE_TYPES = {
   quarter: {
      color: [0.12, 0.25, 0.75],
      basket: [-0.32, 1.02, STAFF_Z],
      durationBeats: 1,
      label: 'QUARTER  1/4',
   },
   half: {
      color: [0.92, 0.52, 0.10],
      basket: [0.00, 1.02, STAFF_Z],
      durationBeats: 2,
      label: 'HALF  1/2',
   },
   eighth: {
      color: [0.56, 0.16, 0.70],
      basket: [0.32, 1.02, STAFF_Z],
      durationBeats: 0.5,
      label: 'EIGHTH  1/8',
   },
};

const PLAY_BUTTONS = [
   [-0.73, 1.55, STAFF_Z],
   [ 0.73, 1.55, STAFF_Z],
];

const CLEAR_BUTTONS = [
   [-0.73, 1.35, STAFF_Z],
   [ 0.73, 1.35, STAFF_Z],
];

const TRASH_POS = [0.68, 1.02, STAFF_Z];

// AUDIO BUFFERS.

let pitchBuffers = Array(PITCH_COUNT).fill(null);
let createSoundBuffer = null;
let deleteSoundBuffer = null;

let pianoSoundDir = '../../media/sound/pianoNotes/';
let ballSoundDir = '../../media/sound/SFXs/demoBalls/';

Promise.all([
   ...PITCHES.map((pitch, index) =>
      loadSound(pianoSoundDir + pitch.file, buffer => pitchBuffers[index] = buffer)),
   loadSound(ballSoundDir + 'SFX_Ball_Create_Mono_01.wav',
             buffer => createSoundBuffer = buffer),
   loadSound(ballSoundDir + 'SFX_Ball_Delete_Mono_01.wav',
             buffer => deleteSoundBuffer = buffer),
]).then(() => {}).catch(error => console.error(error));

let localCounter = 0;
let dragState = {};
let playback = null;
let lastPlayedBeat = -1;
let currentPlaybackBeat = -1;
let mouseHandlers = null;
let previousInteractMode = 0;
let previousInputHandlers = null;
let activePianoSources = new Set();
const localSessionID = window.crypto && window.crypto.randomUUID
   ? window.crypto.randomUUID()
   : 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2);

let roundedPos = pos => cg.roundVec(4, pos);
let sharedNotes = () => window[SHARED_STATE];
let distance2D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
let isNear = (a, b, radius) => a && distance2D(a, b) < radius;
let isValidPos = pos => Array.isArray(pos) && pos.length >= 3 &&
   pos.every(value => Number.isFinite(value));
let isValidNote = note => note && NOTE_TYPES[note.noteType] &&
   isValidPos(note.pos);
let isPlacedNote = note => isValidNote(note) &&
   Number.isInteger(note.beat) && note.beat >= 0 && note.beat < BEAT_COUNT &&
   Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch < PITCH_COUNT;
let localOwner = () => window.clientID === undefined
   ? localSessionID
   : window.clientID;

let trackPianoSource = source => {
   if (! source)
      return;
   activePianoSources.add(source);
   source.addEventListener('ended', () => activePianoSources.delete(source),
                           { once: true });
};

let stopActivePianoSounds = () => {
   for (let source of activePianoSources)
      try {
         source.stop();
      }
      catch (error) {
         // A source that already ended does not need any further cleanup.
      }
   activePianoSources.clear();
};

let noteID = () => {
   return localOwner() + '-' + Date.now() + '-' + localCounter++;
};

let snapToStaff = pos => {
   if (! pos ||
       pos[0] < STAFF_LEFT - BEAT_SPACING / 2 ||
       pos[0] > STAFF_RIGHT + BEAT_SPACING / 2 ||
       pos[1] < STAFF_BOTTOM - PITCH_SPACING / 2 ||
       pos[1] > STAFF_TOP + PITCH_SPACING / 2)
      return null;

   let beat = Math.round((pos[0] - STAFF_LEFT) / BEAT_SPACING);
   let pitch = Math.round((pos[1] - STAFF_BOTTOM) / PITCH_SPACING);
   beat = Math.max(0, Math.min(BEAT_COUNT - 1, beat));
   pitch = Math.max(0, Math.min(PITCH_COUNT - 1, pitch));

   return {
      beat: beat,
      pitch: pitch,
      pos: roundedPos([
         STAFF_LEFT + beat * BEAT_SPACING,
         STAFF_BOTTOM + pitch * PITCH_SPACING,
         STAFF_Z + 0.025,
      ]),
   };
};

let nearestNote = pos => {
   let nearest = null;
   let nearestDistance = NOTE_RADIUS * 1.8;
   for (let id in sharedNotes()) {
      let note = sharedNotes()[id];
      if (! isValidNote(note))
         continue;
      let distance = distance2D(pos, note.pos);
      if (distance < nearestDistance) {
         nearest = note;
         nearestDistance = distance;
      }
   }
   return nearest;
};

let basketAt = pos => {
   for (let type in NOTE_TYPES)
      if (isNear(pos, NOTE_TYPES[type].basket, 0.115))
         return type;
   return null;
};

let buttonAt = (pos, buttons) => buttons.some(button => isNear(pos, button, 0.085));

let send = message => server.send(SHARED_STATE, message);

let startPlayback = () => {
   send({
      op: playback ? 'stop' : 'play',
      startTime: Date.now() + 400,
      bpm: BPM,
   });
};

let clearScore = () => send({ op: 'clear' });

let beginInteraction = (pointer, pos) => {
   if (! pos)
      return;

   // Buttons take priority over notes and baskets.
   if (buttonAt(pos, PLAY_BUTTONS)) {
      startPlayback();
      return;
   }
   if (buttonAt(pos, CLEAR_BUTTONS)) {
      clearScore();
      return;
   }

   let note = nearestNote(pos);
   let owner = localOwner();
   if (note && (note.grabbedBy == null || note.grabbedBy == owner)) {
      dragState[pointer] = {
         id: note.id,
         isNew: false,
         original: {
            pos: note.pos.slice(),
            beat: note.beat,
            pitch: note.pitch,
         },
         lastPos: pos,
      };
      send({ op: 'grab', id: note.id, owner: owner });
      return;
   }

   let type = basketAt(pos);
   if (type) {
      let id = noteID();
      dragState[pointer] = {
         id: id,
         isNew: true,
         original: null,
         lastPos: pos,
      };
      send({
         op: 'create',
         id: id,
         noteType: type,
         owner: owner,
         pos: roundedPos(pos),
      });
   }
};

let continueInteraction = (pointer, pos) => {
   let drag = dragState[pointer];
   if (! drag || ! pos)
      return;
   drag.lastPos = pos;
   send({
      op: 'move',
      id: drag.id,
      owner: localOwner(),
      pos: roundedPos([pos[0], pos[1], STAFF_Z + 0.035]),
   });
};

let endInteraction = (pointer, pos) => {
   let drag = dragState[pointer];
   if (! drag)
      return;

   pos = pos || drag.lastPos;
   if (isNear(pos, TRASH_POS, 0.12)) {
      send({ op: 'delete', id: drag.id, owner: localOwner(),
             pos: roundedPos(pos) });
   }
   else {
      let snapped = snapToStaff(pos);
      if (snapped) {
         send({
            op: 'release',
            id: drag.id,
            owner: localOwner(),
            beat: snapped.beat,
            pitch: snapped.pitch,
            pos: snapped.pos,
         });
      }
      else if (drag.isNew) {
         send({ op: 'delete', id: drag.id, owner: localOwner(),
                pos: roundedPos(pos) });
      }
      else {
         send({
            op: 'release',
            id: drag.id,
            owner: localOwner(),
            beat: drag.original.beat,
            pitch: drag.original.pitch,
            pos: drag.original.pos,
         });
      }
   }
   delete dragState[pointer];
};

// DRAW ONE MUSICAL NOTE. Different baskets produce visibly different values.

let drawNote = (parent, note, color, scale = 1) => {
   let root = parent.add().move(note.pos);
   root.add(note.noteType == 'half' ? 'torusZ' : 'sphere')
       .scale(0.034 * scale, 0.026 * scale, 0.013 * scale)
       .color(color).dull();
   root.add('cube').move(0.030 * scale, 0.055 * scale, 0)
       .scale(0.004 * scale, 0.058 * scale, 0.006 * scale)
       .color(color).dull();
   if (note.noteType == 'eighth')
      root.add('cube').move(0.052 * scale, 0.098 * scale, 0)
          .turnZ(-0.55).scale(0.029 * scale, 0.006 * scale, 0.006 * scale)
          .color(color).dull();
   return root;
};

let addLabel = (parent, text, pos, scale = 0.032) =>
   parent.add('label').info(text).move(pos).scale(scale).color(0.1, 0.1, 0.1);

export const init = async model => {
   dragState = {};
   playback = null;
   lastPlayedBeat = -1;
   currentPlaybackBeat = -1;

   // Keep the complete interface together so it can be made slightly smaller
   // without changing any of its internal layout or interaction coordinates.
   let sceneRoot = model.add()
      .move(0, DISPLAY_CENTER_Y, 0)
      .scale(DISPLAY_SCALE)
      .move(0, -DISPLAY_CENTER_Y, 0);
   let staticScene = sceneRoot.add();
   let dynamicScene = sceneRoot.add();

   // A single white backdrop frames the full staff, controls, and instructions.
   staticScene.add('cube').move(0, DISPLAY_CENTER_Y, STAFF_Z - 0.075)
      .scale(0.96, 0.74, 0.012).color(1, 1, 1).dull();

   // A nearly invisible plane is used by both controller beams and mouse rays.
   let interactionPlane = staticScene.add('square')
      .move(0, 1.35, STAFF_Z - 0.025)
      .scale(0.92, 0.62, 1)
      .opacity(0.001);

   // Backboard and the five staff lines.
   staticScene.add('cube').move(0, STAFF_CENTER_Y, STAFF_Z - 0.035)
      .scale(0.62, 0.285, 0.015).color(0.94, 0.91, 0.82).dull();

   for (let line = 0 ; line < 5 ; line++) {
      let y = STAFF_BOTTOM + 2 * line * PITCH_SPACING;
      staticScene.add('cube').move(0, y, STAFF_Z)
         .scale(0.59, 0.004, 0.008).color(0.08, 0.08, 0.10).dull();
   }

   // Show the exact pitch assigned to every line and space.
   // Array index 0 is deliberately the bottom line, so pitch rises with Y.
   for (let pitch = 0 ; pitch < PITCH_COUNT ; pitch++) {
      let y = STAFF_BOTTOM + pitch * PITCH_SPACING;
      addLabel(staticScene, PITCHES[pitch].name + ' ' + PITCHES[pitch].solfege,
               [STAFF_RIGHT + 0.085, y, STAFF_Z], 0.015);
   }

   // Subtle beat markers make X-axis snapping legible without changing the staff.
   for (let beat = 0 ; beat < BEAT_COUNT ; beat++) {
      let x = STAFF_LEFT + beat * BEAT_SPACING;
      staticScene.add('cube').move(x, STAFF_CENTER_Y, STAFF_Z - 0.008)
         .scale(0.002, 0.205, 0.003).color(0.72, 0.69, 0.62).opacity(0.32);
      addLabel(staticScene, '' + (beat + 1), [x, STAFF_TOP + 0.09, STAFF_Z], 0.025);
   }

   // Three note baskets.
   for (let type in NOTE_TYPES) {
      let info = NOTE_TYPES[type];
      staticScene.add('cube').move(info.basket)
         .scale(0.125, 0.085, 0.045).color(cg.scale(info.color, 0.55)).dull();
      drawNote(staticScene, {
         pos: [info.basket[0], info.basket[1] + 0.015, STAFF_Z + 0.055],
         noteType: type,
      }, info.color, 0.9);
      addLabel(staticScene, info.label,
               [info.basket[0], info.basket[1] - 0.135, STAFF_Z], 0.019);
   }

   // Duplicate controls on both sides so either participant can reach them.
   for (let pos of PLAY_BUTTONS) {
      staticScene.add('cube').move(pos).scale(0.075, 0.065, 0.025)
         .color(0.10, 0.62, 0.28).dull();
      staticScene.add('coneZ').move(pos[0] + 0.006, pos[1], pos[2] + 0.035)
         .turnZ(-Math.PI / 2).scale(0.032, 0.032, 0.012)
         .color(1, 1, 1).dull();
      addLabel(staticScene, 'PLAY', [pos[0], pos[1] + 0.105, STAFF_Z], 0.024);
   }

   for (let pos of CLEAR_BUTTONS) {
      staticScene.add('cube').move(pos).scale(0.075, 0.065, 0.025)
         .color(0.72, 0.12, 0.12).dull();
      staticScene.add('cube').move(pos[0], pos[1], pos[2] + 0.035)
         .turnZ(Math.PI / 4).scale(0.006, 0.040, 0.010).color(1, 1, 1).dull();
      staticScene.add('cube').move(pos[0], pos[1], pos[2] + 0.035)
         .turnZ(-Math.PI / 4).scale(0.006, 0.040, 0.010).color(1, 1, 1).dull();
      addLabel(staticScene, 'CLEAR', [pos[0], pos[1] + 0.105, STAFF_Z], 0.021);
   }

   staticScene.add('cube').move(TRASH_POS).scale(0.095, 0.085, 0.04)
      .color(0.30, 0.31, 0.34).dull();
   staticScene.add('cube').move(TRASH_POS[0], TRASH_POS[1] + 0.09, STAFF_Z + 0.01)
      .scale(0.11, 0.012, 0.045).color(0.18, 0.18, 0.20).dull();
   addLabel(staticScene, 'TRASH', [TRASH_POS[0], TRASH_POS[1] - 0.135, STAFF_Z], 0.023);

   addLabel(staticScene, 'COLLABORATIVE MUSIC STAFF', [0, 1.87, STAFF_Z], 0.042);
   addLabel(staticScene, 'Drag notes onto the staff - X is time, Y is pitch',
            [0, 0.76, STAFF_Z], 0.023);
   let syncStatus = addLabel(staticScene, 'SYNC: CONNECTING',
                             [0, 0.69, STAFF_Z], 0.018);

   // Convert shared scene positions to the local headset coordinate system,
   // exactly as construct.js does for positional audio.
   let toHeadsetPos = pos => {
      let emptyObj = sceneRoot.add().move(pos);
      let objMatrix = emptyObj.getGlobalMatrix();
      let newPos = objMatrix.slice(12, 15);
      sceneRoot.remove(emptyObj);
      return newPos;
   };

   let toScenePos = pos => pos
      ? cg.mTransform(cg.mInverse(sceneRoot.getGlobalMatrix()), pos)
      : null;

   let beamPoint = hand => {
      let beam = hand == 'left' ? lcb : rcb;
      return beam
         ? toScenePos(beam.hitPoint(interactionPlane.getGlobalMatrix(), true))
         : null;
   };

   // CONTROLLER EVENTS: SAME PRESS / DRAG / RELEASE SHAPE AS construct.js,
   // BUT POSITIONS COME FROM THE CONTROLLER BEAM.

   previousInputHandlers = {
      onPress: inputEvents.onPress,
      onDrag: inputEvents.onDrag,
      onRelease: inputEvents.onRelease,
      onClick: inputEvents.onClick,
   };

   inputEvents.onPress = hand => beginInteraction(hand, beamPoint(hand));
   inputEvents.onDrag = hand => continueInteraction(hand, beamPoint(hand));
   inputEvents.onRelease = hand => endInteraction(hand, beamPoint(hand));
   inputEvents.onClick = hand => {};

   // DESKTOP MOUSE: UNPROJECT THE CURSOR THROUGH THE CURRENT CAMERA AND
   // INTERSECT THAT RAY WITH THE SAME STAFF PLANE USED BY THE VR BEAMS.

   let mousePoint = event => {
      if (! window.canvas || ! clay.views || ! clay.views[0])
         return null;
      let rect = window.canvas.getBoundingClientRect();
      let x = 2 * (event.clientX - rect.left) / rect.width - 1;
      let y = 1 - 2 * (event.clientY - rect.top) / rect.height;
      let view = clay.views[0];
      let inversePV = cg.mInverse(cg.mMultiply(view.projectionMatrix, view.viewMatrix));

      let unproject = z => {
         let p = cg.mTransform(inversePV, [x, y, z, 1]);
         if (Math.abs(p[3]) < 0.00001)
            return null;
         p = [p[0] / p[3], p[1] / p[3], p[2] / p[3]];
         return cg.mTransform(clay.inverseRootMatrix, p);
      };

      let a = unproject(-1), b = unproject(1);
      if (! a || ! b || Math.abs(b[2] - a[2]) < 0.00001)
         return null;
      let targetZ = cg.mTransform(sceneRoot.getGlobalMatrix(),
                                  [0, 0, STAFF_Z + 0.025])[2];
      let t = (targetZ - a[2]) / (b[2] - a[2]);
      return toScenePos(cg.mix(a, b, t));
   };

   let isMouseDown = false;
   let onMouseDown = event => {
      if (event.button != 0)
         return;
      isMouseDown = true;
      beginInteraction('mouse', mousePoint(event));
      event.preventDefault();
   };
   let onMouseMove = event => {
      if (isMouseDown)
         continueInteraction('mouse', mousePoint(event));
   };
   let onMouseUp = event => {
      if (! isMouseDown)
         return;
      isMouseDown = false;
      endInteraction('mouse', mousePoint(event));
      event.preventDefault();
   };
   let onKeyDown = event => {
      if (event.code == 'Space') {
         startPlayback();
         event.preventDefault();
      }
      if (event.key == 'Backspace' || event.key == 'Delete') {
         clearScore();
         event.preventDefault();
      }
   };

   previousInteractMode = window.interactMode;
   window.interactMode = 1;
   window.canvas.addEventListener('mousedown', onMouseDown);
   window.canvas.addEventListener('mousemove', onMouseMove);
   window.addEventListener('mouseup', onMouseUp);
   window.addEventListener('keydown', onKeyDown);
   mouseHandlers = { onMouseDown, onMouseMove, onMouseUp, onKeyDown };

   model.animate(() => {

      let participantCount = Array.isArray(window.clients)
         ? window.clients.length
         : 0;
      syncStatus.info(participantCount > 1
         ? 'SYNC: CONNECTED  (' + participantCount + ' CLIENTS)'
         : 'SYNC: WAITING FOR SECOND CLIENT');
      syncStatus.color(participantCount > 1
         ? [0.10, 0.75, 0.28]
         : [0.85, 0.48, 0.08]);

      // RESPOND TO OPERATION MESSAGES FROM ALL CLIENTS, AS IN construct.js.

      server.sync(SHARED_STATE, (msgs, msgClientID) => {
         for (let messageID in msgs) {
            let message = msgs[messageID];
            if (! message || typeof message != 'object')
               continue;
            let note = sharedNotes()[message.id];
            let owner = message.owner == null ? msgClientID : message.owner;

            if (message.op == 'create') {
               if (! note && message.id != null &&
                   NOTE_TYPES[message.noteType] && isValidPos(message.pos)) {
                  sharedNotes()[message.id] = {
                     id: message.id,
                     noteType: message.noteType,
                     pos: message.pos.slice(),
                     beat: null,
                     pitch: null,
                     grabbedBy: owner,
                  };
                  if (createSoundBuffer)
                     playSoundAtPosition(createSoundBuffer, toHeadsetPos(message.pos));
               }
            }
            else if (message.op == 'grab' && note) {
               if (note.grabbedBy == null || note.grabbedBy == owner)
                  note.grabbedBy = owner;
            }
            else if (message.op == 'move' && note &&
                     note.grabbedBy == owner && isValidPos(message.pos)) {
               note.pos = message.pos.slice();
            }
            else if (message.op == 'release' && note &&
                     note.grabbedBy == owner && isValidPos(message.pos) &&
                     Number.isInteger(message.beat) &&
                     message.beat >= 0 && message.beat < BEAT_COUNT &&
                     Number.isInteger(message.pitch) &&
                     message.pitch >= 0 && message.pitch < PITCH_COUNT) {
               // One snapped cell may contain only one note. This prevents
               // stacked, invisible duplicates from sounding twice.
               for (let id in sharedNotes()) {
                  let other = sharedNotes()[id];
                  if (id != message.id && other.beat == message.beat &&
                      other.pitch == message.pitch)
                     delete sharedNotes()[id];
               }
               note.pos = message.pos.slice();
               note.beat = message.beat;
               note.pitch = message.pitch;
               note.grabbedBy = null;
            }
            else if (message.op == 'delete' && note &&
                     (note.grabbedBy == null || note.grabbedBy == owner)) {
               if (note && deleteSoundBuffer)
                  playSoundAtPosition(deleteSoundBuffer,
                                      toHeadsetPos(isValidPos(message.pos)
                                         ? message.pos
                                         : note.pos));
               delete sharedNotes()[message.id];
            }
            else if (message.op == 'clear') {
               for (let id in sharedNotes())
                  delete sharedNotes()[id];
               dragState = {};
               stopActivePianoSounds();
               playback = null;
               currentPlaybackBeat = -1;
            }
            else if (message.op == 'play') {
               stopActivePianoSounds();
               playback = {
                  startTime: Number.isFinite(message.startTime)
                     ? message.startTime
                     : Date.now() + 100,
                  bpm: Number.isFinite(message.bpm) && message.bpm > 0
                     ? message.bpm
                     : BPM,
               };
               lastPlayedBeat = -1;
               currentPlaybackBeat = -1;
            }
            else if (message.op == 'stop') {
               stopActivePianoSounds();
               playback = null;
               currentPlaybackBeat = -1;
            }
         }
      });

      // PLAY THE SHARED SCORE FROM LEFT TO RIGHT.

      if (playback) {
         // Each numbered X position is one quarter-note beat.
         let beatMilliseconds = 60000 / playback.bpm;
         let beat = Math.floor((Date.now() - playback.startTime) / beatMilliseconds);
         if (beat >= 0 && beat != lastPlayedBeat) {
            lastPlayedBeat = beat;
            currentPlaybackBeat = beat;
            if (beat >= BEAT_COUNT) {
               playback = null;
               currentPlaybackBeat = -1;
            }
            else {
               for (let id in sharedNotes()) {
                  let note = sharedNotes()[id];
                  if (isPlacedNote(note) && note.beat == beat &&
                      pitchBuffers[note.pitch]) {
                     let noteType = NOTE_TYPES[note.noteType] || NOTE_TYPES.quarter;
                     let durationSeconds =
                        noteType.durationBeats * beatMilliseconds / 1000;
                     let source = playSoundAtPosition(
                        pitchBuffers[note.pitch],
                        toHeadsetPos(note.pos),
                        PITCHES[note.pitch].playbackRate || 1,
                        durationSeconds
                     );
                     trackPianoSource(source);
                  }
               }
            }
         }
      }

      // RENDER ALL DYNAMIC OBJECTS FROM THE SYNCHRONIZED STATE.

      while (dynamicScene.nChildren() > 0)
         dynamicScene.remove(0);

      if (currentPlaybackBeat >= 0 && currentPlaybackBeat < BEAT_COUNT) {
         let x = STAFF_LEFT + currentPlaybackBeat * BEAT_SPACING;
         dynamicScene.add('cube').move(x, STAFF_CENTER_Y, STAFF_Z + 0.008)
            .scale(BEAT_SPACING * 0.43, 0.225, 0.004)
            .color(0.15, 0.82, 0.92).opacity(0.22);
      }

      for (let id in sharedNotes()) {
         let note = sharedNotes()[id];
         if (! isValidNote(note))
            continue;
         let color = NOTE_TYPES[note.noteType].color;
         if (note.grabbedBy != null && note.grabbedBy != localOwner())
            color = cg.mix(color, [0.45, 0.45, 0.45], 0.65);
         if (note.beat == currentPlaybackBeat)
            color = [0.10, 1.00, 0.35];
         drawNote(dynamicScene, note, color, note.beat == currentPlaybackBeat ? 1.22 : 1);
      }
   });
};

// REMOVE DESKTOP LISTENERS WHEN THE USER LEAVES OR HOT-RELOADS THE SCENE.

export const deinit = () => {
   if (mouseHandlers && window.canvas) {
      window.canvas.removeEventListener('mousedown', mouseHandlers.onMouseDown);
      window.canvas.removeEventListener('mousemove', mouseHandlers.onMouseMove);
      window.removeEventListener('mouseup', mouseHandlers.onMouseUp);
      window.removeEventListener('keydown', mouseHandlers.onKeyDown);
   }
   mouseHandlers = null;
   window.interactMode = previousInteractMode;
   if (previousInputHandlers) {
      inputEvents.onPress = previousInputHandlers.onPress;
      inputEvents.onDrag = previousInputHandlers.onDrag;
      inputEvents.onRelease = previousInputHandlers.onRelease;
      inputEvents.onClick = previousInputHandlers.onClick;
   }
   dragState = {};
   stopActivePianoSounds();
   playback = null;
   currentPlaybackBeat = -1;
};
