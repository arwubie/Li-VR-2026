import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MINI_SCALE, WALK_RADIUS, SOURCES, boundStage, fillMusicLayer, fillBellStrike, segmentDistance } from '../js/util/living-music-box.mjs';
const cg = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(new URL('../js/render/core/cg.js', import.meta.url))).toString('base64'));
const near = (a, b, eps = 1e-7) => { assert.equal(a.length, b.length); a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${a} != ${b}`)); };
async function scene(calibration = cg.mIdentity()) {
   let animate, now = 0, stopped = false;
   const listeners = new Map(), nodes = [], audioPositions = [], toggles = [], haptics = [], strikes = [], listenerMatrices = [];
   class Node {
      constructor(parent, form) { this.parent = parent; this.form = form; this.m = cg.mIdentity(); this.children = []; nodes.push(this); }
      add(form) { const n = new Node(this, form); this.children.push(n); return n; }
      identity() { this.m = cg.mIdentity(); return this; }
      setMatrix(m) { this.m = m.slice(); return this; }
      transform(m) { this.m = cg.mMultiply(this.m, m); return this; }
      move(...p) { return this.transform(cg.mTranslate(...p)); }
      scale(...p) { return this.transform(cg.mScale(...p)); }
      turnY(v) { return this.transform(cg.mRotateY(v)); }
      turnZ(v) { return this.transform(cg.mRotateZ(v)); }
      getMatrix() { return this.m; }
      getGlobalMatrix() { return this.parent ? cg.mMultiply(this.parent.getGlobalMatrix(), this.m) : this.m; }
      child(i) { return this.children[i]; }
      color() { return this; } dull() { return this; }
      info(text) { this.text = text; return this; }
      animate(fn) { animate = fn; }
   }
   const model = new Node(); model.m = calibration; model.time = 0;
   const headMatrix = cg.mTranslate(0, 1.7, .3), controllerMatrix = { left: cg.mIdentity(), right: cg.mIdentity() };
   const originalPress = () => {};
   const env = vm.createContext({ cg, MINI_SCALE, STAGE_RADIUS: .225, TABLE_Y: .76, SOURCES, boundStage, fillMusicLayer, fillBellStrike, segmentDistance,
      controllerMatrix, buttonState: { left: [], right: [] }, joyStickState: { left: { x: 0, y: 0 } },
      inputEvents: { onPress: originalPress }, vr: true, interactMode: 0,
      vibrate: (...args) => haptics.push(args),
      performance: { now: () => now }, clay: { pose: { transform: { matrix: headMatrix } } },
      resonanceScene: { setListenerFromMatrix() {} },
      createMusicBoxAudio: () => ({ start: async () => true, position: (i, p) => audioPositions[i] = p,
         enabled: (i, on) => toggles.push([i, on]), strike: i => strikes.push(i),
         listener: m => listenerMatrices.push(m.slice()), dispose: () => stopped = true }),
      addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: k => listeners.delete(k),
   }); env.window = env;
   let source = fs.readFileSync(new URL('../js/scenes/hw7-living-music-box.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '').replaceAll('export ', '');
   vm.runInContext(source + '\nglobalThis.begin = init; globalThis.end = deinit;', env);
   await env.begin(model);
   const frame = () => { now += 16; model.time = now / 1000; animate(); };
   const key = key => listeners.get('keydown')({ key, preventDefault() {} });
   const world = model.children[0], box = world.children[0];
   frame();
   return { env, model, world, box, headMatrix, controllerMatrix, frame, key, listeners, audioPositions, toggles,
      nodes, haptics, strikes, listenerMatrices, originalPress, stopped: () => stopped };
}

test('physical scale and radial constraint preserve vertical tracking', () => {
   near(boundStage([9, .143, 12]), [WALK_RADIUS * .6, .143, WALK_RADIUS * .8]);
   near([1.8288 * MINI_SCALE], [.1524]);
   near(boundStage([.02, .10, -.03]), [.02, .10, -.03]);
});
for (const [name, calibration] of [['normal', cg.mIdentity()], ['calibrated', cg.mMultiply(cg.mTranslate(.3, .2, -.15), cg.mRotateY(.4))]]) {
   test(`tracked scale, boundaries, source positions, and round trip (${name})`, async () => {
      const s = await scene(calibration), original = s.box.getMatrix().slice();
      s.key('m'); s.frame();
      const b = s.box.getGlobalMatrix();
      assert.ok(Math.abs(Math.hypot(...b.slice(0, 3)) - 12) < 1e-8);
      let hp = cg.mTransform(cg.mInverse(b), s.headMatrix.slice(12, 15));
      assert.ok(Math.abs(hp[1] - 1.7 / 12) < 1e-8);
      near(s.audioPositions[0], cg.mTransform(b, SOURCES[0].p));
      // A tracked hand reaches a bell in the SAME matrix space as its sound.
      s.controllerMatrix.right = cg.mMultiply(b, cg.mTranslate(SOURCES[1].p));
      s.env.inputEvents.onPress('right');
      s.env.inputEvents.onRelease('right');
      assert.equal(s.toggles.length, 0); // Trigger is exclusively grabbing.
      s.env.buttonState.right[5] = { pressed: true }; s.frame();
      s.env.buttonState.right[5].pressed = false; s.frame();
      assert.equal(s.toggles[0][0], 1); assert.equal(s.toggles[0][1], false);
      // Physical movement, even a large jump, stays in the circular interior.
      s.headMatrix[12] += 8; s.frame();
      hp = cg.mTransform(cg.mInverse(s.box.getGlobalMatrix()), s.headMatrix.slice(12, 15));
      assert.ok(Math.hypot(hp[0], hp[2]) <= WALK_RADIUS + 1e-8);
      const saved = hp.slice();
      s.key('m'); s.frame(); near(s.box.getMatrix(), original); near(s.world.getMatrix(), cg.mIdentity());
      s.key('m'); s.frame();
      hp = cg.mTransform(cg.mInverse(s.box.getGlobalMatrix()), s.headMatrix.slice(12, 15));
      near(hp, saved);
      assert.equal(s.toggles.length, 1);
      s.env.end(); assert.equal(s.stopped(), true); assert.equal(s.listeners.size, 0);
      assert.equal(s.env.inputEvents.onPress, s.originalPress); assert.equal(s.env.interactMode, 0);
   });
}

test('human grab preserves controller offset and rotation; mode button is edge triggered', async () => {
   const s = await scene();
   s.controllerMatrix.right = cg.mMultiply(s.box.getGlobalMatrix(), cg.mTranslate(.23, -.04, .04));
   s.env.inputEvents.onPress('right');
   const before = s.box.getMatrix().slice();
   s.controllerMatrix.right[12] += .2; s.frame();
   assert.ok(Math.abs(s.box.getMatrix()[12] - before[12] - .2) < 1e-8);
   s.controllerMatrix.right = cg.mMultiply(s.controllerMatrix.right, cg.mRotateY(.3)); s.frame();
   assert.ok(Math.abs(s.box.getMatrix()[2]) > .1);
   s.env.inputEvents.onRelease('right'); const moved = s.box.getMatrix().slice();
   s.env.buttonState.right[4] = { pressed: true }; s.frame(); s.frame();
   assert.ok(Math.abs(Math.hypot(...s.box.getGlobalMatrix().slice(0, 3)) - 12) < 1e-8);
   s.env.buttonState.right[4].pressed = false; s.frame();
   s.env.buttonState.right[4].pressed = true; s.frame(); near(s.box.getMatrix(), moved);
});

test('joystick locomotion is bounded and does not change head height', async () => {
   const s = await scene(); s.key('m'); s.frame();
   s.env.joyStickState.left.y = -1;
   for (let i = 0; i < 900; i++) s.frame();
   const p = cg.mTransform(cg.mInverse(s.box.getGlobalMatrix()), s.headMatrix.slice(12, 15));
   assert.ok(Math.hypot(p[0], p[2]) <= WALK_RADIUS + 1e-8);
   assert.ok(p[2] < -.1); assert.ok(Math.abs(p[1] - 1.7 / 12) < 1e-8);
});

test('four original musical layers have finite, nonclipping samples and silence at loop seam', () => {
   for (let i = 0; i < SOURCES.length; i++) {
      const samples = new Float32Array(48000 * 4); fillMusicLayer(samples, 48000, SOURCES[i].notes, i);
      assert.ok(samples.some(x => Math.abs(x) > .05));
      assert.ok(samples.every(x => Number.isFinite(x) && Math.abs(x) < .5));
      assert.equal(samples[0], 0); assert.ok(Math.abs(samples.at(-1)) < .001);
   }
});

test('existing audio wrapper starts layers in sync, fades without restart, and disposes only owned nodes', async () => {
   const starts = [], stops = [], targets = [], sources = [], rooms = [];
   class AudioContext {
      constructor() { this.currentTime = 10; this.sampleRate = 8000; this.state = 'suspended'; }
      resume() { this.state = 'running'; return Promise.resolve(); }
      createGain() { return { gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime: (...v) => targets.push(v) }, connect() {}, disconnect() {} }; }
      createBuffer(channels, size) { return { getChannelData: () => new Float32Array(size) }; }
      createBufferSource() { return { connect() {}, disconnect() {}, start: at => starts.push(at), stop: () => stops.push(true) }; }
   }
   class ResonanceAudio {
      constructor() { this.output = { connect() {}, disconnect() {} }; rooms.push(this); }
      setListenerFromMatrix(m) { this.listener = m.elements; }
      setRoomProperties(dimensions, materials) { this.materials = materials; }
      createSource(options) { const source = { input: {}, options, setPosition(...p) { this.p = p; }, setGain(g) { this.gain = g; } }; sources.push(source); return source; }
   }
   const env = vm.createContext({ AudioContext, ResonanceAudio }); env.window = env;
   const source = fs.readFileSync(new URL('../js/util/spatial-audio.js', import.meta.url), 'utf8').replaceAll('export ', '');
   vm.runInContext(source + '\nglobalThis.make = createMusicBoxAudio;', env);
   const audio = env.make(SOURCES, fillMusicLayer, fillBellStrike);
   await Promise.all([audio.start(), audio.start()]);
   assert.equal(starts.length, 4); assert.ok(starts.every(t => t === 10.03));
   audio.enabled(1, false); audio.position(1, [1, 2, 3]); await audio.start();
   assert.equal(starts.length, 4); assert.equal(stops.length, 0); assert.equal(targets[0][0], 0);
   near(sources[1].p, [1, 2, 3]);
   const activeRoom = rooms.at(-1);
   assert.ok(Object.values(activeRoom.materials).every(m => m === 'transparent'));
   audio.listener(cg.mRotateY(.6)); near(activeRoom.listener, cg.mRotateY(.6));
   assert.equal(sources[1].options.minDistance, .35);
   assert.equal(sources[1].options.maxDistance, 8);
   audio.strike(1); assert.equal(starts.length, 5); // Muted loop still has its independent impact.
   audio.dispose(); assert.equal(stops.length, 5); assert.ok(sources.every(s => s.gain === 0));
   await audio.start(); audio.strike(1); assert.equal(starts.length, 5);
});


test('table and music box start 30 cm closer together without changing scale', async () => {
   const s = await scene();
   near(s.box.getMatrix().slice(12, 15), [0, .825, -.35]);
   const table = s.world.children.find(n => n.form === 'cube');
   assert.equal(table.getMatrix()[14], -.35);
   near([table.getMatrix()[0], table.getMatrix()[10]], [.762, .3048]);
});
for (const mini of [false, true]) {
   test(`all four instruments grab, rotate, release, persist and move their sound (${mini ? 'miniature' : 'human'})`, async () => {
      const s = await scene(cg.mMultiply(cg.mTranslate(.3, .2, -.15), cg.mRotateY(.4)));
      if (mini) { s.key('m'); s.frame(); }
      const bells = s.box.children.filter(n => n.children.some(c => SOURCES.some(src => c.text === src.name)));
      assert.equal(bells.length, 4);
      for (let i = 0; i < 4; i++) {
         const b = s.box.getGlobalMatrix(), initialBox = s.box.getMatrix().slice();
         const start = SOURCES[i].p;
         const controller = cg.mTranslate(start);
         s.controllerMatrix.right = cg.mMultiply(b, controller);
         s.env.inputEvents.onPress('right');
         const destination = [start[0] * .8, .11, start[2] * .8];
         s.controllerMatrix.right = cg.mMultiply(b, cg.mMultiply(cg.mTranslate(destination), cg.mMultiply(cg.mRotateY(.45), cg.mRotateX(.6))));
         s.env.inputEvents.onDrag('right'); s.frame();
         near(bells[i].getMatrix().slice(12, 15), destination);
         assert.ok(Math.abs(bells[i].getMatrix()[2]) > .1);
         near(s.audioPositions[i], cg.mTransform(b, destination));
         near(s.box.getMatrix(), initialBox); // Bell picks never accidentally grab the enclosing box.
         s.env.inputEvents.onRelease('right'); s.frame();
         destination[1] = .075;
         near(bells[i].getMatrix().slice(4, 7), [0, 1, 0]);
         s.controllerMatrix.right[12] += .4; s.frame();
         near(bells[i].getMatrix().slice(12, 15), destination);
         s.key('m'); s.frame(); s.key('m'); s.frame();
         near(bells[i].getMatrix().slice(12, 15), destination);
      }
      assert.equal(s.toggles.length, 0); // Moving an instrument does not mute it.
      assert.ok(s.haptics.some(([hand, strength]) => hand === 'right' && strength === .35));
      assert.ok(s.haptics.some(([hand, strength]) => hand === 'right' && strength === .18));
   });
}

test('two hands cannot own the same instrument; release clamps to stage; missing haptics are harmless', async () => {
   const s = await scene(); s.key('m'); s.frame();
   const b = s.box.getGlobalMatrix();
   s.env.vibrate = () => { throw new Error('no actuator'); };
   s.controllerMatrix.left = s.controllerMatrix.right = cg.mMultiply(b, cg.mTranslate(SOURCES[0].p));
   s.env.inputEvents.onPress('right'); s.env.inputEvents.onPress('left');
   s.controllerMatrix.left = cg.mMultiply(b, cg.mTranslate(.1, .1, 0));
   s.controllerMatrix.right = cg.mMultiply(b, cg.mTranslate(2, -.3, 0));
   s.env.inputEvents.onRelease('left'); s.env.inputEvents.onRelease('right'); s.frame();
   const local = cg.mTransform(cg.mInverse(b), s.audioPositions[0]);
   near(local, [WALK_RADIUS, .075, 0]);
   assert.equal(s.toggles.length, 0);
});

for (const miniature of [false, true]) {
   test(`direct controller-tip strike needs no buttons, rings once per contact and rearms (${miniature ? 'miniature' : 'human'})`, async () => {
      const s = await scene();
      if (miniature) { s.key('m'); s.frame(); }
      const box = s.box.getGlobalMatrix();
      // Position the actual controller TIP at the cap, not its grip origin.
      const tip = [SOURCES[1].p[0], SOURCES[1].p[1] - .005, SOURCES[1].p[2]];
      // Raw controller orientations have unit scale; offset must be physical metres.
      const raw = cg.mMultiply(box, cg.mTranslate(tip));
      for (let j = 0; j < 12; j++) raw[j] /= miniature ? 12 : 1;
      const atCap = cg.mMultiply(raw, cg.mTranslate(0, .02, .075));
      s.controllerMatrix.right = atCap; s.frame();
      assert.deepEqual(s.strikes, [1]);
      for (let i = 0; i < 40; i++) s.frame();
      assert.deepEqual(s.strikes, [1]); // Resting against a bell never machine-guns.
      s.controllerMatrix.right = cg.mMultiply(atCap, cg.mTranslate(.8, 0, 0)); s.frame();
      s.controllerMatrix.right = atCap; s.frame();
      assert.deepEqual(s.strikes, [1, 1]);
      assert.equal(s.toggles.length, 0);
      near(s.listenerMatrices.at(-1), s.headMatrix);
      assert.ok(s.haptics.some(([hand, gain]) => hand === 'right' && gain === .28));
   });
}

test('fast swept tip impact is detected; a held controller does not strike automatically', async () => {
   const s = await scene(); s.key('m'); s.frame();
   const b = s.box.getGlobalMatrix(), center = SOURCES[0].p.map((v, i) => v + (i === 1 ? -.005 : 0));
   const raw = cg.mMultiply(b, cg.mTranslate(center));
   for (let j = 0; j < 12; j++) raw[j] /= 12;
   const tipPose = cg.mMultiply(raw, cg.mTranslate(0, .02, .075));
   s.controllerMatrix.right = cg.mMultiply(tipPose, cg.mTranslate(-.10, 0, 0)); s.frame();
   s.controllerMatrix.right = cg.mMultiply(tipPose, cg.mTranslate(.10, 0, 0)); s.frame();
   assert.deepEqual(s.strikes, [0]); // Both endpoints miss, but the sweep crosses the cap.
   s.controllerMatrix.right = cg.mMultiply(b, cg.mTranslate(SOURCES[2].p));
   s.env.inputEvents.onPress('right'); s.frame();
   assert.deepEqual(s.strikes, [0]);
});

test('six distinct keepsakes grab and automatically stand on the floor in both views', async () => {
   for (const mini of [false, true]) {
      const s = await scene(); if (mini) { s.key('m'); s.frame(); }
      const names = ['FLOWER', 'CRYSTAL', 'GIFT', 'MUSHROOM', 'CROWN', 'STAR'];
      const props = s.box.children.filter(n => n.children.some(c => names.includes(c.text)));
      assert.equal(props.length, 6);
      for (const prop of props) {
         const b = s.box.getGlobalMatrix(), start = cg.mTransform(prop.getMatrix(), [0, .025, 0]);
         s.controllerMatrix.right = cg.mMultiply(b, cg.mTranslate(start));
         s.env.inputEvents.onPress('right');
         const destination = cg.mMultiply(b, cg.mMultiply(cg.mTranslate(start[0], .15, start[2]), cg.mRotateX(.9)));
         s.controllerMatrix.right = destination; s.env.inputEvents.onDrag('right'); s.frame();
         assert.ok(prop.getMatrix()[13] > .1);
         s.env.inputEvents.onRelease('right'); s.frame();
         assert.equal(prop.getMatrix()[13], 0);
         near(prop.getMatrix().slice(4, 7), [0, 1, 0]);
         s.key('m'); s.frame(); s.key('m'); s.frame();
         assert.equal(prop.getMatrix()[13], 0);
      }
   }
});

test('scale switch spreads actual source locations twelvefold and head rotation reaches the listener', async () => {
   const s = await scene();
   const distance = () => cg.distance(s.audioPositions[1], s.audioPositions[3]);
   const human = distance(); s.key('m'); s.frame();
   near([distance()], [human * 12]);
   const rotated = cg.mMultiply(s.headMatrix, cg.mRotateY(Math.PI / 2));
   s.headMatrix.splice(0, 16, ...rotated); s.frame();
   near(s.listenerMatrices.at(-1), rotated);
});

test('impact buffers have an audible attack, different pitches and a silent end', () => {
   const buffers = SOURCES.map((s, i) => {
      const a = new Float32Array(48000 * 1.3); fillBellStrike(a, 48000, s.notes, i); return a;
   });
   for (const a of buffers) {
      assert.ok(a.some(v => Math.abs(v) > .15));
      assert.ok(a.every(v => Number.isFinite(v) && Math.abs(v) < 1));
      assert.equal(a[0], 0); assert.equal(a.at(-1), 0);
   }
   assert.notDeepEqual(buffers[0].slice(100, 130), buffers[1].slice(100, 130));
   near([segmentDistance([0, 0, 0], [-1, 0, 0], [1, 0, 0])], [0]);
});
