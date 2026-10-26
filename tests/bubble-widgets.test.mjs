import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { initialRoom, applyAction, LIMIT } from '../js/util/bubble-room.mjs';

// Run the real G2 widgets with a canvas context stub, without a browser or GPU.
function setup() {
   const source = fs.readFileSync(new URL('../js/util/g2.js', import.meta.url), 'utf8')
      .replace(/^import .*;\s*$/gm, '').replaceAll('export ', '');
   const context = new Proxy({ font: '12px Helvetica',
      measureText(text) { return { width: String(text).length * parseFloat(this.font) * .5 }; },
   }, { get(target, key) { return key in target ? target[key] : () => {}; } });
   const env = vm.createContext({
      cg: { def: (x, fallback) => x === undefined ? fallback : x },
      document: { createElement: () => ({ getContext: () => context }) },
      window: { vr: false, handtracking: false }, mouseZ: 0,
   });
   vm.runInContext(source + '\nglobalThis.makeG2 = () => new G2();', env);
   const g2 = env.makeG2();
   let uv = [0, 0, 1];
   g2.getUVZ = () => uv;
   return { env, g2, at: (x, y) => { uv = [x, y, 1]; } };
}

test('SIZE accepts a click, drag and final release position without an animation frame', () => {
   const { g2, at } = setup(), values = [];
   g2.addWidget({}, 'slider', 0, -.35, '#ff527b', 'SIZE', value => values.push(value), 2.6);
   at(-.52, -.35); g2.pointerEvent('press');
   assert.ok(Math.abs(values.at(-1) - .1) < 1e-9);
   at(.52, -.35); g2.pointerEvent('drag');
   assert.ok(Math.abs(values.at(-1) - .9) < 1e-9);
   at(.65, -.35); g2.pointerEvent('release');
   assert.equal(values.at(-1), 1);
});

test('fast button clicks each create a bubble, with no cooldown or frames between clicks', () => {
   const { g2, at } = setup(), room = initialRoom();
   g2.addWidget({}, 'button', 0, .30, '#ff527b', ['  BLOW BUBBLE  '],
      () => applyAction(room, { op: 'spawn', source: 0 }, 'mouse', 1000), 2);
   at(0, .30);
   for (let i = 0; i < 8; i++) { g2.pointerEvent('press'); g2.pointerEvent('release'); }
   assert.equal(room.bubbles.length, 32);
   for (let i = 0; i < 20; i++) { g2.pointerEvent('press'); g2.pointerEvent('release'); }
   assert.equal(room.bubbles.length, LIMIT);
});

test('slider changes determine the actual radius of the next generated bubble', () => {
   const { g2, at } = setup(), room = initialRoom();
   g2.addWidget({}, 'slider', 0, -.35, '#ff527b', 'SIZE',
      value => applyAction(room, { op: 'size', source: 0, value }, 'mouse', 1000), 2.6);
   g2.addWidget({}, 'button', 0, .30, '#ff527b', ['  BLOW BUBBLE  '],
      () => applyAction(room, { op: 'spawn', source: 0 }, 'mouse', 1000), 2);
   at(-.649, -.35); g2.pointerEvent('press'); g2.pointerEvent('release');
   at(0, .30); g2.pointerEvent('press'); g2.pointerEvent('release');
   const small = room.bubbles.at(-1).r;
   at(.649, -.35); g2.pointerEvent('press'); g2.pointerEvent('release');
   at(0, .30); g2.pointerEvent('press'); g2.pointerEvent('release');
   assert.ok(room.bubbles.at(-1).r > small * 2);
});

test('button hit area matches the drawn label, and release outside cancels the click', () => {
   const { g2, at } = setup(); let calls = 0;
   const button = g2.addWidget({}, 'button', 0, .30, '#ff527b', ['  BLOW BUBBLE  '], () => calls++, 2);
   // The old half-width hitbox excluded this part of the visible label.
   at(.5, .30); assert.equal(button.isWithin(), true);
   g2.pointerEvent('press'); at(2, 2); g2.pointerEvent('release');
   assert.equal(calls, 0);
   at(.5, .30); g2.pointerEvent('press'); g2.pointerEvent('release');
   assert.equal(calls, 1);
});

test('legacy frame-polled widgets retain their press/release behavior', () => {
   const { env, g2, at } = setup(); let calls = 0;
   g2.addWidget({}, 'button', 0, .30, '#ff527b', ['  BLOW BUBBLE  '], () => calls++, 2);
   at(0, .30); env.mouseZ = 1; g2.update(); env.mouseZ = 0; g2.update();
   assert.equal(calls, 1);
});
