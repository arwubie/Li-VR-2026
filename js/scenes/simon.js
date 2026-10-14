/*
   SIMON - a single-player memory game in VR.

   Pads light up in a sequence; point a controller beam at a pad and
   press the trigger to repeat it. A desktop keyboard also works:
   keys 1-4 (or Q/W/A/S) press pads, ENTER/SPACE starts and restarts.
*/

import { ControllerBeam } from '../render/core/controllerInput.js';

const PAD_HALF  = .12;              // HALF-WIDTH OF EACH PAD
const PAD_STEP  = .135;             // PAD CENTER OFFSET FROM BOARD CENTER
const STEP_TIME = .50;              // SECONDS PER STEP OF THE PLAYBACK
const LIT_TIME  = .30;              // HOW LONG A PAD STAYS LIT DURING PLAYBACK
const FLASH_TIME = .22;             // HOW LONG A PAD STAYS LIT WHEN PRESSED

const FREQS = [ 523.25, 659.25, 783.99, 1046.50 ];   // C5 E5 G5 C6

const COLORS = {
   board:   [ .06, .07, .09 ],
   pads:    [ [ .15, .62, .30 ], [ .78, .20, .22 ],
              [ .88, .66, .14 ], [ .22, .42, .88 ] ],
   text:    [ .95, .95, .92 ],
   accent:  [ .45, .78, 1.00 ],
   present: [ .85, .55, .15 ],
};

let audioContext = null;
const playTone = (frequency, duration = .2, volume = .12, type = 'sine') => {
   try {
      if (!audioContext)
         audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended')
         audioContext.resume();
      let osc = audioContext.createOscillator();
      let gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + duration);
   } catch (e) { /* AUDIO IS OPTIONAL */ }
};

let cleanup;

export const init = async model => {
   cleanup?.();

   const previousInput = {
      onPress: inputEvents.onPress,
      onDrag: inputEvents.onDrag,
      onRelease: inputEvents.onRelease,
   };

   const game = {
      phase: 'idle',        // idle | show | input | over
      sequence: [],
      inputIndex: 0,
      best: 0,
      showStart: 0,
      lastShownStep: -1,
      litPad: -1,
      flashPad: -1,
      flashUntil: 0,
   };

   let scene = model.add().move(0, 1.45, -1.5).scale(.85).dull();
   let pads = [];
   let beams = {
      left: new ControllerBeam(model, 'left'),
      right: new ControllerBeam(model, 'right'),
   };

   // A DARK BACKING PANEL KEEPS THE THIN LINE FONT READABLE IN VR.

   scene.add('cube,rounded').move(0, -.05, -.035)
        .scale(.62, 1.00, .02).color(COLORS.board);

   clay.defineTextMesh('simonTitle', 'SIMON');
   let title = scene.add('simonTitle').color(COLORS.accent);

   clay.defineTextMesh('simonStatus', 'POINT AND PRESS A PAD');
   let status = scene.add('simonStatus').color(COLORS.text);

   clay.defineTextMesh('simonScore', 'ROUND 1   BEST 0');
   let score = scene.add('simonScore').color(.55, .62, .72);

   clay.defineTextMesh('simonHelp', 'TRIGGER SELECTS, KEYS 1-4');
   let help = scene.add('simonHelp').color(.42, .48, .56);

   const placeCenteredText = (node, text, y, scale, z = .03) => {
      // defineTextMesh ADVANCES .019 UNITS PER CHARACTER; GLYPHS ARE .015 WIDE.
      let width = text.length ? .019 * (text.length - 1) + .015 : 0;
      node.identity().move(-width * scale / 2, y, z).scale(scale);
   };

   placeCenteredText(title, 'SIMON', .36, 2.6);
   placeCenteredText(status, 'POINT AND PRESS A PAD', .20, 1.15);
   placeCenteredText(score, 'ROUND 1   BEST 0', -.44, 1.0);
   placeCenteredText(help, 'TRIGGER SELECTS, KEYS 1-4', -.50, .75);

   // FOUR COLOR PADS IN A 2 X 2 GRID, EACH WITH AN INVISIBLE HIT TARGET.
   // PADS ARE ORDERED: TOP-LEFT, TOP-RIGHT, BOTTOM-LEFT, BOTTOM-RIGHT.

   const PAD_POS = [ [-1, 1], [1, 1], [-1, -1], [1, -1] ];

   for (let i = 0; i < 4; i++) {
      let pad = scene.add()
               .move(PAD_POS[i][0] * PAD_STEP, -.12 + PAD_POS[i][1] * PAD_STEP, 0);
      let button = pad.add('cube,rounded')
                      .scale(PAD_HALF, PAD_HALF, .022)
                      .color(COLORS.pads[i]);
      let target = pad.add('square').move(0, 0, .028)
                      .scale(PAD_HALF, PAD_HALF, 1).opacity(0);
      pads.push({ index: i, button, target });
   }

   let renderedStatus = '', renderedScore = '';

   const setStatus = (message, color = COLORS.text) => {
      if (message !== renderedStatus) {
         renderedStatus = message;
         clay.defineTextMesh('simonStatus', message);
         placeCenteredText(status, message, .20, 1.15);
      }
      status.color(color);
   };

   const setScore = () => {
      let message = `ROUND ${game.sequence.length}   BEST ${game.best}`;
      if (message !== renderedScore) {
         renderedScore = message;
         clay.defineTextMesh('simonScore', message);
         placeCenteredText(score, message, -.44, 1.0);
      }
   };

   const flash = index => {
      game.flashPad = index;
      game.flashUntil = model.time + FLASH_TIME;
   };

   const startGame = () => {
      game.sequence = [ Math.floor(Math.random() * 4) ];
      game.inputIndex = 0;
      game.phase = 'show';
      game.showStart = model.time + .70;
      game.lastShownStep = -1;
      setStatus('WATCH...');
      setScore();
   };

   const handlePadPress = index => {
      if (game.phase === 'idle' || game.phase === 'over') {
         startGame();
         return;
      }
      if (game.phase !== 'input')
         return;
      flash(index);
      playTone(FREQS[index], .22, .13);
      if (index === game.sequence[game.inputIndex]) {
         game.inputIndex++;
         if (game.inputIndex >= game.sequence.length) {
            game.best = Math.max(game.best, game.sequence.length);
            game.sequence.push(Math.floor(Math.random() * 4));
            game.phase = 'show';
            game.showStart = model.time + 1.00;
            game.lastShownStep = -1;
            setStatus(`ROUND ${game.sequence.length}`, COLORS.accent);
            setScore();
         }
      }
      else {
         game.phase = 'over';
         setStatus('WRONG! PRESS TO RESTART', COLORS.present);
         playTone(185, .55, .16, 'sawtooth');
      }
   };

   const pointedPad = hand => {
      beams[hand].update();
      let bestPad = null, bestDistance = Infinity;
      for (let pad of pads) {
         let hit = beams[hand].hitRect(pad.target.getGlobalMatrix());
         if (hit && hit[2] < bestDistance) {
            bestDistance = hit[2];
            bestPad = pad;
         }
      }
      return bestPad;
   };

   const onPress = hand => {
      let pad = pointedPad(hand);
      if (!pad)
         return;
      handlePadPress(pad.index);
      if (typeof vibrate === 'function')
         vibrate(hand, .3, 40);
   };

   const callbacks = {
      onPress,
      onDrag: previousInput.onDrag,
      onRelease: previousInput.onRelease,
   };
   Object.assign(inputEvents, callbacks);

   const onKeyDown = event => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey)
         return;
      let target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
                     target.isContentEditable))
         return;

      if (event.key === 'Enter' || event.key === ' ') {
         if (game.phase === 'idle' || game.phase === 'over')
            startGame();
         event.preventDefault();
         return;
      }
      let map = { '1': 0, '2': 1, '3': 2, '4': 3, 'q': 0, 'w': 1, 'a': 2, 's': 3 };
      let key = event.key.toLowerCase();
      if (key in map) {
         handlePadPress(map[key]);
         event.preventDefault();
      }
   };

   window.addEventListener('keydown', onKeyDown);

   cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      for (let name in callbacks)
         if (inputEvents[name] === callbacks[name])
            inputEvents[name] = previousInput[name];
   };

   model.animate(() => {
      scene.identity().move(0, 1.45, -1.5).scale(.85);

      // PLAY BACK THE SEQUENCE ONE PAD AT A TIME.

      if (game.phase === 'show') {
         let elapsed = model.time - game.showStart;
         let step = Math.floor(elapsed / STEP_TIME);
         let inStep = elapsed - step * STEP_TIME;
         if (step < 0)
            game.litPad = -1;
         else if (step >= game.sequence.length) {
            game.phase = 'input';
            game.inputIndex = 0;
            game.litPad = -1;
         }
         else {
            game.litPad = inStep < LIT_TIME ? game.sequence[step] : -1;
            if (step >= 0 && step !== game.lastShownStep) {
               game.lastShownStep = step;
               playTone(FREQS[game.sequence[step]], .30, .13);
               if (typeof vibrate === 'function') {
                  vibrate('left', .12, 25);
                  vibrate('right', .12, 25);
               }
            }
         }
      }
      else
         game.litPad = -1;

      if (game.phase === 'input')
         setStatus(`YOUR TURN  ${game.inputIndex} / ${game.sequence.length}`);

      // RENDER EACH PAD: DIM AT REST, BRIGHT WHEN LIT OR POINTED AT.

      beams.left.update();
      beams.right.update();
      let hoverLeft = pointedPad('left');
      let hoverRight = pointedPad('right');

      for (let pad of pads) {
         let base = COLORS.pads[pad.index];
         let brightness = .38;
         if (game.phase === 'idle')
            brightness = .34 + .10 * Math.sin(model.time * 2.2 + pad.index * 1.7);
         else if (game.phase === 'over')
            brightness = .30;
         if (game.phase === 'show' && game.litPad === pad.index)
            brightness = 1.9;
         if (game.flashPad === pad.index && model.time < game.flashUntil)
            brightness = 1.9;
         if (pad === hoverLeft || pad === hoverRight)
            brightness = Math.max(brightness, .85);
         pad.button.color(base[0] * brightness, base[1] * brightness, base[2] * brightness);
      }
   });
};

export const deinit = () => {
   cleanup?.();
   cleanup = null;
};
