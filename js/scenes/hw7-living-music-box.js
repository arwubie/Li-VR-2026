import * as cg from '../render/core/cg.js';
import { buttonState, joyStickState, controllerMatrix } from '../render/core/controllerInput.js';
import { createMusicBoxAudio } from '../util/spatial-audio.js';
import { MINI_SCALE, STAGE_RADIUS, TABLE_Y, SOURCES, boundStage, fillMusicLayer, fillBellStrike, segmentDistance } from '../util/living-music-box.mjs';

let cleanup = null;
export const initMusicBox = async (model, extension = {}) => {
   const world = model.add(), box = world.add(), keys = new Set();
   const gold = [.83, .62, .27], ivory = [1, .94, .83], pink = [.94, .58, .70];
   let miniature = false, inhabited = false, dead = false, held = null, last = performance.now(), switchDown = false;
   let boxMatrix = cg.mTranslate(0, TABLE_Y + .065, -.35);
   let feet = [0, 0, .025], anchor = [0, 0, 0], headLocal = cg.mTranslate(0, .14, .025);
   let handLocal = { left: cg.mTranslate(-.04, .09, .025), right: cg.mTranslate(.04, .09, .025) };
   let audioStatus = 'Press trigger or Space to start music';
   const enabled = SOURCES.map(() => true), pulses = SOURCES.map(() => -10);
   const itemMatrices = SOURCES.map(s => cg.mTranslate(s.p)), itemHolds = {};
   // Same haptic entry point as hw1-cat / hw2-airbeat; unsupported devices may throw.
   const pulse = (hand, strength, duration) => {
      try { window.vibrate?.(hand, strength, duration)?.catch?.(() => {}); } catch (_) {}
   };
   const audio = createMusicBoxAudio(SOURCES, fillMusicLayer, fillBellStrike);
   const touching = { left: SOURCES.map(() => false), right: SOURCES.map(() => false) };
   const previousTip = {}, lastStrike = SOURCES.map(() => -10);
   const centers = SOURCES.map(() => [0, 0, 0]);
   const decorations = [];
   const handlers = Object.fromEntries(['onPress', 'onDrag', 'onRelease', 'onClick'].map(k => [k, inputEvents[k]]));
   const oldMode = window.interactMode;
   window.interactMode = 1;
   const shape = (parent, form, p, s, c) => parent.add(form).move(p).scale(s).color(c).dull();
   const label = (parent, text, p, s) => parent.add('label').info(text).move(p).scale(s).color(.26, .19, .30);

   // Classroom table: exactly 60 by 24 inches. Top surface at 0.76 m.
   shape(world, 'cube', [0, TABLE_Y - .025, -.35], [.762, .025, .3048], [.54, .35, .23]);
   for (const x of [-.66, .66]) for (const z of [-.57, -.13])
      shape(world, 'cube', [x, (TABLE_Y - .05) / 2, z], [.025, (TABLE_Y - .05) / 2, .025], [.37, .24, .18]);
   shape(world, 'cube', [0, -.025, 0], [3, .025, 3], [.83, .85, .90]);
   shape(box, 'tubeY', [0, -.035, 0], [.25, .03, .25], pink);
   shape(box, 'tubeY', [0, -.004, 0], [STAGE_RADIUS, .004, STAGE_RADIUS], ivory);
   shape(box, 'torusY', [0, -.012, 0], [.238, .022, .238], gold);
   shape(box, 'torusY', [0, -.058, 0], [.243, .012, .243], gold);
   // Low pearl rim leaves the interior and miniature reach unobstructed.
   for (let i = 0; i < 28; i++) {
      const a = i * Math.PI / 14;
      shape(box, 'sphere', [.232 * Math.sin(a), .004, .232 * Math.cos(a)], [.006, .008, .006], ivory);
   }
   const windingAxle = shape(box, 'tubeX', [.264, -.032, 0], [.025, .006, .006], gold);
   const windingKey = shape(box, 'torusX', [.285, -.032, 0], [.006, .019, .019], gold);
   label(box, 'THE LIVING MUSIC BOX', [0, -.035, .253], .010);
   const bells = SOURCES.map((source, i) => {
      const node = box.add().move(source.p);
      shape(node, 'tubeY', [0, -.045, 0], [.020, .03, .020], gold);
      shape(node, 'sphere', [0, -.005, 0], [.026, .025, .026], source.color);
      shape(node, 'torusY', [0, -.022, 0], [.027, .006, .027], gold);
      shape(node, 'sphere', [0, .025, 0], [.006, .006, .006], gold);
      label(node, source.name, [0, -.057, .032], .007);
      shape(node, 'torusY', [0, .02, 0], [0, 0, 0], ivory);
      return node;
   });
   // Six small, individually grabbable keepsakes, with their origins on the floor.
   const propNames = ['FLOWER', 'CRYSTAL', 'GIFT', 'MUSHROOM', 'CROWN', 'STAR'];
   const propPositions = [[-.095, 0, -.095], [.095, 0, -.095], [-.095, 0, .095],
      [.095, 0, .095], [-.10, 0, 0], [.10, 0, 0]];
   propPositions.forEach((p, i) => {
      const node = box.add().move(p);
      itemMatrices.push(cg.mTranslate(p)); centers.push([0, .025, 0]);
      decorations.push(node);
      if (i === 0) {
         shape(node, 'tubeY', [0, .010, 0], [.014, .010, .014], pink);
         shape(node, 'tubeY', [0, .030, 0], [.0025, .020, .0025], [.36, .66, .40]);
         for (let j = 0; j < 5; j++) {
            const a = j * Math.PI * 2 / 5;
            shape(node, 'sphere', [.011 * Math.cos(a), .050, .011 * Math.sin(a)], [.009, .004, .009], [1, .66, .81]);
         }
         shape(node, 'sphere', [0, .053, 0], [.007, .005, .007], gold);
      } else if (i === 1) {
         shape(node, 'tubeY', [0, .004, 0], [.022, .004, .022], gold);
         shape(node, 'coneY', [0, .030, 0], [.014, .026, .014], [.62, .81, 1]);
         shape(node, 'coneY', [-.014, .015, .005], [.010, .014, .010], [.83, .73, 1]);
         shape(node, 'coneY', [.012, .018, -.005], [.009, .017, .009], [.70, .94, .96]);
      } else if (i === 2) {
         shape(node, 'cube', [0, .017, 0], [.019, .017, .017], [.76, .65, .96]);
         shape(node, 'cube', [0, .018, 0], [.004, .018, .018], gold);
         shape(node, 'cube', [0, .018, 0], [.020, .018, .004], gold);
         for (const x of [-.009, .009]) shape(node, 'torusY', [x, .038, 0], [.010, .004, .007], pink);
      } else if (i === 3) {
         shape(node, 'tubeY', [0, .015, 0], [.007, .015, .007], ivory);
         shape(node, 'sphere', [0, .032, 0], [.025, .012, .025], [.95, .55, .65]);
         for (const x of [-.012, .012]) shape(node, 'sphere', [x, .041, .004], [.005, .002, .005], ivory);
      } else if (i === 4) {
         shape(node, 'tubeY', [0, .007, 0], [.020, .007, .020], gold);
         for (let j = 0; j < 5; j++) {
            const a = j * Math.PI * 2 / 5, p = [.018 * Math.sin(a), .024, .018 * Math.cos(a)];
            shape(node, 'coneY', p, [.005, .014, .005], gold);
            shape(node, 'sphere', [p[0], .039, p[2]], [.004, .004, .004], pink);
         }
      } else {
         shape(node, 'tubeY', [0, .004, 0], [.019, .004, .019], pink);
         shape(node, 'tubeY', [0, .018, 0], [.003, .014, .003], gold);
         for (let j = 0; j < 5; j++) {
            const arm = node.add().move(0, .040, 0).turnZ(j * Math.PI * 2 / 5);
            shape(arm, 'coneY', [0, .010, 0], [.008, .016, .004], gold);
         }
         shape(node, 'sphere', [0, .040, 0], [.011, .011, .005], gold);
      }
      label(node, propNames[i], [0, .005, .029], .005);
   });
   // Geometry in normal body metres; the entire avatar is scaled by exactly 1/12.
   const body = box.add(), face = box.add(), hands = { left: box.add(), right: box.add() };
   shape(body, 'sphere', [0, .94, 0], [.16, .24, .12], pink);
   shape(body, 'coneY', [0, .64, 0], [.34, .23, .34], pink);
   for (const x of [-.09, .09]) {
      shape(body, 'tubeY', [x, .25, 0], [.045, .25, .045], ivory);
      shape(body, 'sphere', [x, .035, -.035], [.065, .035, .11], pink);
   }
   shape(face, 'sphere', [0, 0, 0], [.115, .13, .11], [1, .81, .69]);
   shape(face, 'sphere', [0, .075, .025], [.12, .075, .10], [.25, .13, .10]);
   shape(face, 'sphere', [0, .12, .08], [.065, .065, .065], [.25, .13, .10]);
   for (const x of [-.043, .043]) shape(face, 'sphere', [x, .015, -.098], [.012, .016, .009], [.16, .10, .12]);
   shape(face, 'torusY', [0, .12, .07], [.068, .012, .068], gold);
   for (const h of ['left', 'right']) {
      shape(hands[h], 'sphere', [0, 0, 0], [.065, .065, .065], [1, .81, .69]);
      shape(hands[h], 'tubeZ', [0, 0, -.075], [.025, .025, .065], gold);
   }
   const hud = model.add();
   const title = label(hud, '', [0, 1.98, -1.1], .025);
   label(hud, extension.instructions?.[0] ?? 'A / X: change scale | touch bell: strike | trigger: grab', [0, 1.91, -1.1], .016);
   label(hud, extension.instructions?.[1] ?? 'Left stick: walk | B / Y near bell: layer on/off | 1-4: strike', [0, 1.85, -1.1], .016);

   const rawHead = () => clay.pose?.transform?.matrix || clay.root().inverseViewMatrix(0);
   const head = () => cg.mMultiply(cg.mInverse(model.getGlobalMatrix()), rawHead());
   const boxInModel = () => cg.mMultiply(world.getMatrix(), boxMatrix);
   const handPose = hand => {
      // Controller matrices are raw tracking coordinates, not inputEvents' cached
      // calibrated fingertip coordinates. Invert the rendered box exactly once.
      const m = controllerMatrix[hand];
      return window.vr && m?.length === 16
         ? cg.mMultiply(cg.mInverse(box.getGlobalMatrix()), m) : null;
   };
   const startAudio = () => {
      if (!audio) { audioStatus = 'Spatial audio unavailable (Resonance Audio missing)'; return; }
      audio.start().then(ok => { if (!dead) audioStatus = ok ? 'Music playing' : 'Press Space / trigger to enable audio'; })
         .catch(() => { if (!dead) audioStatus = 'Audio blocked: press Space / trigger to retry'; });
   };
   const present = () => {
      world.identity();
      if (miniature) world.setMatrix(cg.mMultiply(cg.mTranslate(anchor),
         cg.mMultiply(cg.mScale(12), cg.mMultiply(cg.mTranslate(cg.scale(feet, -1)), cg.mInverse(boxMatrix)))));
      box.setMatrix(boxMatrix);
   };
   const switchMode = () => {
      held = null;
      for (const hand of Object.keys(itemHolds)) releaseItem(hand);
      if (!miniature) {
         const h = head();
         // Calibrated tracking-floor height, including room-origin offsets.
         const floor = cg.mTransform(cg.mInverse(model.getGlobalMatrix()), [rawHead()[12], 0, rawHead()[14]]);
         anchor = [h[12], floor[1], h[14]];
         inhabited = true;
      } else {
         // Fold the last room-scale displacement into the saved spawn point.
         const p = cg.mTransform(cg.mInverse(box.getGlobalMatrix()), rawHead().slice(12, 15));
         feet = [p[0], 0, p[2]];
      }
      miniature = !miniature;
      for (const hand of ['left', 'right']) { delete previousTip[hand]; touching[hand].fill(false); }
      present();
   };
   const toggle = i => {
      enabled[i] = !enabled[i]; pulses[i] = model.time;
      audio?.enabled(i, enabled[i]);
   };
   // Follow the earlier homework's press -> drag -> release interaction. The
   // controller-to-object offset prevents snapping and preserves held rotation.
   const moveItem = hand => {
      const grab = itemHolds[hand], pose = handPose(hand);
      if (!grab || !pose) return;
      const m = cg.mMultiply(pose, grab.offset);
      itemMatrices[grab.index] = m;
   };
   const releaseItem = hand => {
      const grab = itemHolds[hand];
      if (!grab) return;
      moveItem(hand);
      const m = itemMatrices[grab.index], p = boundStage(m.slice(12, 15));
      // Always seat upright on the actual floor, retaining heading only.
      const yaw = Math.hypot(m[8], m[10]) > .001 ? Math.atan2(m[8], m[10]) : Math.atan2(-m[2], m[0]);
      itemMatrices[grab.index] = cg.mMultiply(cg.mTranslate(p[0], grab.index < SOURCES.length ? .075 : 0, p[2]), cg.mRotateY(yaw));
      delete itemHolds[hand];
      pulse(hand, .18, 40);
   };
   const playStrike = (i, hand) => {
      startAudio();
      audio?.position(i, cg.mTransform(box.getGlobalMatrix(), itemMatrices[i].slice(12, 15)));
      audio?.strike(i);
      pulses[i] = model.time; lastStrike[i] = model.time;
      if (hand) pulse(hand, .28, 45);
   };
   const strike = (i, hand, contact) => {
      if (extension.onBell) {
         if (extension.onBell(i, hand, contact)) lastStrike[i] = model.time;
      } else playStrike(i, hand);
   };
   const layerButtons = { left: false, right: false };
   const updateTouch = () => {
      for (const hand of ['left', 'right']) {
         const pose = handPose(hand);
         if (!pose) { delete previousTip[hand]; touching[hand].fill(false); continue; }
         // Probe the visible controller tip, including its physical grip-to-tip offset.
         const tip = cg.mTransform(pose, [0, -.02, -.075]);
         const old = previousTip[hand]; previousTip[hand] = tip;
         const scale = miniature ? MINI_SCALE : 1;
         const radius = .027 + .014 * scale;
         const canStrike = !held && !itemHolds[hand] && !buttonState[hand][0]?.pressed
            && (!extension.canStrike || extension.canStrike(hand));
         for (let i = 0; i < SOURCES.length; i++) {
            const center = cg.mTransform(itemMatrices[i], [0, -.005, 0]);
            const gap = cg.distance(tip, center);
            // Sweeping catches fast taps between frames, without treating a mode
            // change or a large tracking discontinuity as a swing through the box.
            const swept = old && cg.distance(old, tip) < .35 * scale
               ? segmentDistance(center, old, tip) : gap;
            if (!touching[hand][i] && Math.min(gap, swept) < radius) {
               if (canStrike && model.time - lastStrike[i] > .18) strike(i, hand, {
                  tip, previousTip: old || tip,
                  head: cg.mTransform(cg.mInverse(box.getGlobalMatrix()), rawHead().slice(12, 15)),
               });
               touching[hand][i] = true;
            } else if (gap > radius + .008) touching[hand][i] = false;
         }
         // Separate, explicit music-layer control; it never competes with grabbing.
         const down = !!buttonState[hand][5]?.pressed;
         if (down && !layerButtons[hand] && (!extension.canLayer || extension.canLayer())) {
            let nearest = -1, distance = miniature ? .055 : .075;
            for (let i = 0; i < SOURCES.length; i++) {
               const gap = cg.distance(pose.slice(12, 15), itemMatrices[i].slice(12, 15));
               if (gap < distance) { distance = gap; nearest = i; }
            }
            if (nearest >= 0) { toggle(nearest); pulse(hand, .18, 35); }
         }
         layerButtons[hand] = down;
      }
   };
   inputEvents.onPress = hand => {
      startAudio();
      if (extension.canManipulate && !extension.canManipulate()) return;
      const pose = handPose(hand);
      if (!pose || itemHolds[hand] || held?.hand === hand) return;
      if (extension.press?.(hand, pose)) return;
      const p = pose.slice(12, 15);
      let best = -1, distance = miniature ? .043 : .055;
      itemMatrices.forEach((m, i) => {
         const d = cg.distance(p, cg.mTransform(m, centers[i]));
         if (d < distance) { best = i; distance = d; }
      });
      // Instruments take priority over the enclosing box in both viewing modes.
      if (best >= 0) {
         if (Object.values(itemHolds).some(g => g.index === best) || held) return;
         itemHolds[hand] = { index: best, offset: cg.mMultiply(cg.mInverse(pose), itemMatrices[best]) };
         pulse(hand, .35, 55);
      } else if (!miniature && !held && !Object.keys(itemHolds).length
            && Math.hypot(p[0], p[2]) < .30 && p[1] > -.10 && p[1] < .22) {
         const controller = cg.mMultiply(cg.mInverse(model.getGlobalMatrix()), controllerMatrix[hand]);
         held = { hand, offset: cg.mMultiply(cg.mInverse(controller), boxMatrix) };
         pulse(hand, .35, 55);
      }
   };
   inputEvents.onRelease = hand => {
      releaseItem(hand);
      if (held?.hand === hand) { held = null; pulse(hand, .18, 40); }
   };
   inputEvents.onDrag = hand => moveItem(hand);
   inputEvents.onClick = () => {};
   const keydown = e => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) || e.target?.isContentEditable) return;
      const k = e.key.toLowerCase(); keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      if (k === 'm' && !extension.lockScale) switchMode();
      extension.key?.(k);
      if (k === ' ' || k === 'm') startAudio();
      if (miniature && /^[1-4]$/.test(k)) strike(Number(k) - 1);
   };
   const keyup = e => keys.delete(e.key.toLowerCase());
   const blur = () => {
      keys.clear(); held = null;
      for (const hand of Object.keys(itemHolds)) releaseItem(hand);
   };
   window.addEventListener('keydown', keydown);
   window.addEventListener('keyup', keyup);
   window.addEventListener('blur', blur);
   const api = {
      world, box, hud, title, body, face, hands, bells, windingAxle, windingKey,
      pulse, strike, playStrike, startAudio,
      cue(kind, i) { audio?.cue?.(kind, i); },
      get boxMatrix() { return boxMatrix; },
      get itemMatrices() { return itemMatrices; },
      get feet() { return feet; },
      get miniature() { return miniature; },
      setMiniature(value) { if (miniature !== value) switchMode(); },
      setBox(m) { boxMatrix = m.slice(); },
      setItems(ms) { ms.forEach((m, i) => { itemMatrices[i] = m.slice(); }); },
      resetFeet() {
         const h = head(), floor = cg.mTransform(cg.mInverse(model.getGlobalMatrix()), [rawHead()[12], 0, rawHead()[14]]);
         anchor = [h[12], floor[1], h[14]]; feet = [0, 0, .025]; present();
      },
      cancelGrabs() { held = null; for (const hand of Object.keys(itemHolds)) releaseItem(hand); },
   };
   extension.ready?.(api);
   present();
   model.animate(() => {
      if (dead) return;
      const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
      extension.beforeFrame?.(api, dt);
      const pressed = !!(buttonState.right[4]?.pressed || buttonState.left[4]?.pressed);
      if (pressed && !switchDown) {
         if (!extension.lockScale) switchMode();
         extension.action?.(); startAudio();
      } switchDown = pressed;
      if (held && !miniature) {
         boxMatrix = cg.mMultiply(cg.mMultiply(cg.mInverse(model.getGlobalMatrix()), controllerMatrix[held.hand]), held.offset);
      }
      if (!miniature && !window.vr && (!extension.canManipulate || extension.canManipulate())) {
         boxMatrix[12] += ((keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0)) * dt * .2;
         boxMatrix[14] += ((keys.has('arrowdown') ? 1 : 0) - (keys.has('arrowup') ? 1 : 0)) * dt * .2;
         if (keys.has('q') || keys.has('e')) boxMatrix = cg.mMultiply(boxMatrix, cg.mRotateY(((keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0)) * dt));
      }
      if (miniature) {
         const h = head(), forward = cg.normalize([-h[8], 0, -h[10]]), right = [-forward[2], 0, forward[0]];
         const joy = joyStickState.left;
         let x = (Number.isFinite(joy?.x) && Math.abs(joy.x) > .15 ? joy.x : 0) + Number(keys.has('d')) - Number(keys.has('a'));
         let z = (Number.isFinite(joy?.y) && Math.abs(joy.y) > .15 ? -joy.y : 0) + Number(keys.has('w')) - Number(keys.has('s'));
         const len = Math.max(1, Math.hypot(x, z)); x /= len; z /= len;
         feet = cg.add(feet, cg.scale(cg.add(cg.scale(right, x), cg.scale(forward, z)), dt * .65 * MINI_SCALE));
         present();
         // Clamp the ACTUAL tracked head, so room-scale motion obeys the boundary
         // as well as joystick motion. Rebase feet by the same correction.
         let hp = cg.mTransform(cg.mInverse(boxInModel()), h.slice(12, 15));
         feet = cg.add(feet, cg.subtract(boundStage(hp), hp));
         present();
         headLocal = cg.mMultiply(cg.mInverse(box.getGlobalMatrix()), rawHead());
         for (const hand of ['left', 'right']) handLocal[hand] = handPose(hand) || handLocal[hand];
      } else {
         present();
         if (!inhabited) headLocal[13] = rawHead()[13] * MINI_SCALE;
      }
      const remote = extension.avatar?.(api);
      if (remote) { headLocal = remote.head; handLocal = remote.hands; }
      const p = headLocal.slice(12, 15), yaw = Math.atan2(-headLocal[8], -headLocal[10]) - Math.PI;
      body.identity().move(p[0], 0, p[2]).turnY(yaw).scale(MINI_SCALE);
      face.setMatrix(headLocal).scale(miniature ? 0 : MINI_SCALE / Math.hypot(headLocal[0], headLocal[1], headLocal[2]));
      for (const hand of ['left', 'right']) {
         const m = handLocal[hand];
         const basis = Math.hypot(m[0], m[1], m[2]);
         hands[hand].setMatrix(m).scale(basis > 1e-8 ? MINI_SCALE / basis : 0);
      }
      for (const hand of Object.keys(itemHolds)) moveItem(hand);
      for (let i = 0; i < SOURCES.length; i++) {
         const grabbed = Object.values(itemHolds).some(g => g.index === i);
         const flash = Math.max(0, 1 - (model.time - pulses[i]) / .5);
         bells[i].setMatrix(itemMatrices[i]);
         // Feedback animates the bell cap, never tilts/floats the whole stand.
         bells[i].child(1).identity().move(0, -.005, 0).scale(.026 * (1 + flash * .12), .025, .026 * (1 + flash * .12));
         bells[i].child(5).identity().move(0, .02, 0).scale(flash ? .029 + (1 - flash) * .025 : 0, .002 * flash, flash ? .029 + (1 - flash) * .025 : 0);
         bells[i].child(1).color(grabbed ? SOURCES[i].color.map(c => .5 + c * .5)
            : flash > 0 ? [1, .93, .62] : enabled[i] ? SOURCES[i].color : [.40, .39, .44]);
         audio?.position(i, cg.mTransform(box.getGlobalMatrix(), itemMatrices[i].slice(12, 15)));
      }
      decorations.forEach((node, i) => node.setMatrix(itemMatrices[SOURCES.length + i]));
      audio?.listener(rawHead());
      updateTouch();
      title.info((miniature ? 'MINIATURE / 1:12' : 'HUMAN / TABLETOP') + '   -   ' + audioStatus);
      extension.afterFrame?.(api, dt);
   });
   cleanup = () => {
      dead = true; audio?.dispose(); blur();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      Object.assign(inputEvents, handlers); window.interactMode = oldMode;
      extension.dispose?.();
   };
};
export const init = async model => initMusicBox(model);
export const deinit = () => { cleanup?.(); cleanup = null; };
