import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as rules from '../js/util/bubble-room.mjs';
import { BubbleSession } from '../js/util/bubble-room-sync.mjs';

const cgSource = fs.readFileSync(new URL('../js/render/core/cg.js', import.meta.url), 'utf8');
const cg = await import('data:text/javascript;base64,' + Buffer.from(cgSource).toString('base64'));

// Exercise the actual scene's mouse listeners, matrices and G2, without computer use.
async function scene(world) {
   const listeners = new Map(), nodes = [], sent = [];
   const events = {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      removeEventListener() {},
   };
   const rect = { left: 45, top: 80, width: 1000, height: 750 };
   const canvas = { ...events, getBoundingClientRect: () => rect };
   const context = new Proxy({ font: '12px Helvetica',
      measureText(t) { return { width: t.length * parseFloat(this.font) * .5 }; },
   }, { get: (o, k) => k in o ? o[k] : () => {} });
   let animate, now = 0, session;
   class Node {
      constructor(parent = null, form = '') { this.parent = parent; this.form = form; this.m = cg.mIdentity(); this.children = []; nodes.push(this); }
      add(form) { const n = new Node(this, form); this.children.push(n); return n; }
      identity() { this.m = cg.mIdentity(); return this; }
      transform(m) { this.m = cg.mMultiply(this.m, m); return this; }
      move(...p) { return this.transform(cg.mTranslate(...p)); }
      scale(...p) { return this.transform(cg.mScale(...p)); }
      turnX(v) { return this.transform(cg.mRotateX(v)); }
      turnY(v) { return this.transform(cg.mRotateY(v)); }
      getGlobalMatrix() { return this.parent ? cg.mMultiply(this.parent.getGlobalMatrix(), this.m) : this.m; }
      child(i) { return this.children[i]; }
      remove(n) { this.children.splice(this.children.indexOf(n), 1); }
      animate(fn) { animate = fn; return this; }
      color() { return this; } dull() { return this; } opacity() { return this; }
      txtr(slot) { this.slot = slot; return this; } txtrSrc() { return this; }
   }
   const model = new Node(); model.m = world; model.time = 0;
   const view = { projectionMatrix: cg.mPerspective(1.5), viewMatrix: cg.mTranslate(0, -1.6, -3) };
   const env = vm.createContext({ ...events, canvas, cg, ...rules,
      BubbleSession: class extends BubbleSession { constructor(...a) { super(...a); session = this; } },
      performance: { now: () => now }, crypto: { randomUUID: () => 'desktop' },
      vr: false, handtracking: false, mouseZ: 0, interactMode: 0,
      clay: { views: [view], inverseRootMatrix: cg.mInverse(world) },
      inputEvents: {}, lcb: null, rcb: null,
      document: { createElement: () => ({ getContext: () => context }) },
      server: { init() {}, send(name, packet) { sent.push(packet); }, sync(name, receive) { receive(sent.splice(0)); } },
   });
   env.window = env;
   const g2 = fs.readFileSync(new URL('../js/util/g2.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '').replaceAll('export ', '');
   vm.runInContext(g2, env);
   const source = fs.readFileSync(new URL('../js/scenes/hw6-bubble-room.js', import.meta.url), 'utf8')
      .replace(/^import .*;\s*$/gm, '').replaceAll('export ', '');
   vm.runInContext(source + '\nglobalThis.initScene = init;', env);
   await env.initScene(model);
   const frame = () => { now += 800; model.time = now / 1000; animate(); };
   frame();
   const face = nodes.find(n => n.form === 'square' && n.slot === 3);
   const eventAt = (u, v) => {
      const worldPoint = cg.mTransform(face.getGlobalMatrix(), [u, v, 0]);
      const ndc = cg.mTransform(cg.mMultiply(view.projectionMatrix, view.viewMatrix), [...worldPoint, 1]);
      return { button: 0, buttons: 1, clientX: rect.left + (ndc[0] / ndc[3] + 1) * rect.width / 2,
         clientY: rect.top + (1 - ndc[1] / ndc[3]) * rect.height / 2 };
   };
   const fire = (type, u, v) => { for (const fn of listeners.get(type) || []) fn(eventAt(u, v)); };
   return { session, frame, fire };
}

for (const [name, world] of [['identity', cg.mIdentity()], ['calibrated room', cg.mTranslate(.35, .2, -.4)]]) {
   test(`desktop SIZE drag reaches the generated bubble through actual scene projection (${name})`, async () => {
      const { session, frame, fire } = await scene(world);
      fire('mousedown', -.60, -.35);
      fire('mousemove', .60, -.35);
      fire('mouseup', .60, -.35);
      frame();
      assert.ok(session.state.sizes[0] > .9, `slider stayed at ${session.state.sizes[0]}`);
      const count = session.state.bubbles.length;
      fire('mousedown', 0, .30); fire('mouseup', 0, .30); frame();
      assert.equal(session.state.bubbles.length, count + 1);
      assert.ok(session.state.bubbles.at(-1).r > .18);
   });
}
