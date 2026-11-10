import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MINI_SCALE, WALK_RADIUS, SOURCES, boundStage, fillMusicLayer, fillBellStrike, segmentDistance } from '../js/util/living-music-box.mjs';
const cg = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(new URL('../js/render/core/cg.js', import.meta.url))).toString('base64'));
const near = (a, b, eps = 1e-7) => { assert.equal(a.length, b.length); a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${a} != ${b}`)); };
import * as game from '../js/util/catch-the-ballerina.mjs';
import * as duet from '../js/util/music-box-duet.mjs';
export { cg, near };
export async function scene(id, network, calibration = cg.mIdentity(), xr = true, sceneFile = 'hw8-catch-the-ballerina.js') {
   let animate, now = 0, stopped = false;
   const listeners = new Map(), nodes = [], audioPositions = [], toggles = [], haptics = [], strikes = [], cues = [], listenerMatrices = [];
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
   const canvasListeners = new Map();
   const canvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 750 }),
      addEventListener: (k, fn) => canvasListeners.set(k, fn),
      removeEventListener: k => canvasListeners.delete(k),
   };
   const camera = cg.mMultiply(cg.mTranslate(0, 1.7, .3), cg.mRotateX(-.9));
   const view = { projectionMatrix: cg.mPerspective(1.5), viewMatrix: cg.mInverse(camera) };
   const model = new Node(); model.m = calibration; model.time = 0;
   const headMatrix = cg.mTranslate(0, 1.7, .3), controllerMatrix = { left: cg.mIdentity(), right: cg.mIdentity() };
   const originalPress = () => {};
   const env = vm.createContext({ canvas, cg, MINI_SCALE, STAGE_RADIUS: .225, TABLE_Y: .76, SOURCES, boundStage, fillMusicLayer, fillBellStrike, segmentDistance,
      ...game, ...duet, clientID: id, clients: network.ids, clientState: network.clientState, server: null, controllerMatrix, buttonState: { left: [], right: [] }, joyStickState: { left: { x: 0, y: 0 } },
      inputEvents: { onPress: originalPress }, vr: xr, interactMode: 0,
      vibrate: (...args) => haptics.push(args),
      performance: { now: () => now }, clay: { views: [view], pose: { transform: { matrix: headMatrix } } },
      resonanceScene: { setListenerFromMatrix() {} },
      createMusicBoxAudio: () => ({ start: async () => true, position: (i, p) => audioPositions[i] = p,
         enabled: (i, on) => toggles.push([i, on]), strike: i => strikes.push(i), cue: (kind, i) => cues.push([kind, i]),
         listener: m => listenerMatrices.push(m.slice()), dispose: () => stopped = true }),
      addEventListener: (k, fn) => { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); },
      removeEventListener: (k, fn) => { listeners.get(k)?.delete(fn); if (!listeners.get(k)?.size) listeners.delete(k); },
   }); env.window = env;
   env.clay.inverseRootMatrix = cg.mIdentity();
   env.server = network.connect(id, env, headMatrix, controllerMatrix);
   let source = fs.readFileSync(new URL('../js/scenes/hw7-living-music-box.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '').replaceAll('export ', '');
   vm.runInContext('{' + source + '\nglobalThis.initMusicBox = initMusicBox; globalThis.deinitMusicBox = deinit;}', env);
   const conductorSource = fs.readFileSync(new URL('../js/util/music-box-conductor.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '').replaceAll('export ', '');
   vm.runInContext('{' + conductorSource + '\nglobalThis.createConductor = createConductor;}', env);
   source = fs.readFileSync(new URL('../js/scenes/' + sceneFile, import.meta.url), 'utf8').replace(/^import [\s\S]*?;\s*$/gm, '').replaceAll('export ', '');
   vm.runInContext('{' + source + '\nglobalThis.begin = init; globalThis.end = deinit;}', env);
   await env.begin(model);
   const frame = (ms = 16) => { now += ms; model.time = now / 1000; animate(); };
   const fireKey = (type, key) => { for (const fn of listeners.get(type) || []) fn({ key, preventDefault() {} }); };
   const key = key => fireKey('keydown', key), release = key => fireKey('keyup', key);
   const screenAt = p => {
      const world = cg.mTransform(box.getGlobalMatrix(), p);
      const clip = cg.mTransform(cg.mMultiply(view.projectionMatrix, view.viewMatrix), [...world, 1]);
      return { clientX: (clip[0] / clip[3] + 1) * 500, clientY: (1 - clip[1] / clip[3]) * 375 };
   };
   const mouse = (type, event) => {
      const e = { button: 0, preventDefault() {}, ...event };
      canvasListeners.get(type)?.(e);
      for (const fn of listeners.get(type) || []) fn(e);
   };
   const mouseAt = p => mouse('mousemove', screenAt(p));
   const dragKey = pixels => {
      const p = screenAt(duet.KEY_POSITION);
      mouse('mousedown', p); mouse('mousemove', { ...p, clientX: p.clientX + pixels }); mouse('mouseup', p);
   };
   const wheel = deltaY => canvasListeners.get('wheel')?.({ deltaY, preventDefault() {} });
   const world = model.children[0], box = world.children[0];
   frame();
   return { env, model, world, box, headMatrix, controllerMatrix, frame, key, release, mouseAt, mouse, dragKey, wheel, canvasListeners, listeners, audioPositions, toggles,
      nodes, haptics, strikes, cues, listenerMatrices, originalPress, stopped: () => stopped };
}

export function network() {
   const members = new Map();
   const net = {
      ids: [0, 1],
      clientState: {
         head: id => members.get(id)?.env.vr ? cg.mMultiply(members.get(id).env.clay.inverseRootMatrix, members.get(id).head) : null,
         // Match clientStateSharing's controller grip -> visible marker transform.
         hand: (id, h) => members.has(id) ? cg.mMultiply(members.get(id).env.clay.inverseRootMatrix,
            cg.mMultiply(members.get(id).controllers[h],
               cg.mMultiply(cg.mTranslate(0, -.049, -.079), cg.mRotateX(-Math.PI / 4)))) : null,
      },
      connect(id, env, head, controllers) {
         members.set(id, { env, head, controllers });
         // Keep the repository's actual synchronize/global/element functions.
         // Replace only the socket relay and persistence in this test environment.
         env.name = '';
         env.isMasterClient = () => net.ids[0] === id;
         const serverSource = fs.readFileSync(new URL('../server/client.js', import.meta.url), 'utf8')
            .replace('this.connectSocket(wsPort);', '');
         vm.runInContext(serverSource, env);
         const server = vm.runInContext('new Server()', env);
         server.neverLoadOrSave();
         server.broadcastObject = packet => {
            const wire = JSON.stringify(packet);
            for (const [other, m] of members) if (other !== id) {
               const received = JSON.parse(wire);
               if (received.element !== undefined) {
                  m.env[received.global] ??= {};
                  m.env[received.global][received.element] = received.value;
               } else m.env[received.global] = received.value;
            }
         };
         return server;
      },
      disconnect(id) { members.delete(id); net.ids.splice(net.ids.indexOf(id), 1); },
   };
   return net;
}

export const duetScene = (id, net, calibration = cg.mIdentity(), xr = true) => scene(id, net, calibration, xr, 'hw8-music-box-duet.js');
