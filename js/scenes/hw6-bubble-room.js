import * as cg from '../render/core/cg.js';
import { G2 } from '../util/g2.js';
import { lcb, rcb } from '../handle_scenes.js';
import { COLORS, SOURCES, LIMIT } from '../util/bubble-room.mjs';
import { BubbleSession } from '../util/bubble-room-sync.mjs';

const CHANNEL = 'hw6BubbleRoomMessages';
let cleanup = null;

export const init = async model => {
   const actor = globalThis.crypto?.randomUUID?.() || 'bubble-' + Date.now() + '-' + Math.random().toString(36).slice(2);
   const session = new BubbleSession(actor, performance.now());
   server.init(CHANNEL, {});
   const send = packet => server.send(CHANNEL, packet);
   const command = action => send(session.command(action));
   const root = model.add();
   const pointers = {}, panels = [], meshes = new Map(), rendered = new Map();
   let mouse = null, activeHand = 'right', lastHeartbeat = -1000, lastSnapshot = -1000;
   let lastMove = 0, seenMix = '', mixStart = -100, lastTime = performance.now();
   let dead = false;
   const previousMode = window.interactMode;
   const previousHandlers = Object.fromEntries(['onPress', 'onDrag', 'onRelease', 'onClick'].map(k => [k, inputEvents[k]]));
   window.interactMode = 1;

   const local = p => cg.mTransform(cg.mInverse(root.getGlobalMatrix()), p);
   let statusText = 'Joining the room...';
   const header = new G2(false, 1536, 768), footer = new G2(false, 1536, 256);
   model.txtrSrc(6, header.getCanvas());
   model.txtrSrc(7, footer.getCanvas());
   root.add('square').move(0, 2.33, -1.84).scale(1.15, .45, 1).txtr(6);
   root.add('square').move(0, .28, -1.65).scale(1.15, .15, 1).txtr(7);
   header.render = function() {
      this.setColor('#303a55').textHeight(.16).text('B U B B L E   R O O M', 0, .73, 'center');
      this.setColor('#62718b').textHeight(.075).text('a little space to mix things together', 0, .38, 'center');
      this.setColor('#357778').textHeight(.065).text(statusText, 0, .08, 'center');
      Object.values(COLORS).forEach((c, i) => {
         const x = (i - 3) * .275;
         this.setColor(c.hex).fillOval(x - .025, -.38, .05, .10);
         this.setColor('#526078').textHeight(.055).text(c.name, x, -.55, 'center');
      });
      this.setColor('#62718b').textHeight(.056).text('Two colors blend. All three become pearl.', 0, -.85, 'center');
   };
   footer.render = function() {
      this.setColor('#425570').textHeight(.15).text('GRAB / BRING TWO HELD BUBBLES TOGETHER / LET GO', 0, .35, 'center');
      this.setColor('#62718b').textHeight(.13).text('No scores. No wrong colors. Just play.', 0, -.35, 'center');
   };

   // Scene-local white enclosure works in desktop and XR and disappears with the scene.
   // All faces point inward so the room stays white when the viewer turns around.
   for (const [p, rx, ry] of [
      [[0, 2.5, -6], 0, 0], [[0, 2.5, 6], 0, Math.PI],
      [[-6, 2.5, 0], 0, Math.PI / 2], [[6, 2.5, 0], 0, -Math.PI / 2],
      [[0, 7, 0], Math.PI / 2, 0], [[0, -.12, 0], -Math.PI / 2, 0],
   ]) root.add('square').move(p).turnX(rx).turnY(ry).scale(12).color(1, 1, 1).dull();
   root.add('cube').move(0, -.05, -.4).scale(2.18, .04, 1.85).color(.94, .96, .99).dull();
   for (let x = -2; x <= 2; x += .5)
      root.add('cube').move(x, -.006, -.4).scale(.002, .002, 1.8).color(.80, .85, .91).dull();
   for (let z = -2; z <= 1; z += .5)
      root.add('cube').move(0, -.005, z).scale(2.05, .002, .002).color(.80, .85, .91).dull();
   for (const x of [-2.08, 2.08]) {
      root.add('cube').move(x, 1.42, -1.86).scale(.018, 1.42, .018).color(.30, .42, .62).dull();
      root.add('cube').move(x, .05, -.4).scale(.008, .008, 1.46).color(.35, .63, .78).dull();
   }
   root.add('cube').move(0, 2.82, -1.86).scale(2.1, .012, .012).color(.45, .48, .73).dull();

   // A ray in scene coordinates, shared by desktop picking and drag planes.
   const desktopRay = event => {
      if (!window.canvas || !clay.views?.[0]) return null;
      const rect = window.canvas.getBoundingClientRect(), view = clay.views[0];
      const x = 2 * (event.clientX - rect.left) / rect.width - 1;
      const y = 1 - 2 * (event.clientY - rect.top) / rect.height;
      const inv = cg.mInverse(cg.mMultiply(view.projectionMatrix, view.viewMatrix));
      const point = z => {
         const q = cg.mTransform(inv, [x, y, z, 1]);
         // Unprojection already returns world coordinates. local() applies the full
         // inverse scene matrix, including room calibration, exactly once.
         return local(q.slice(0, 3).map(v => v / q[3]));
      };
      const a = point(-1), b = point(1), d = cg.normalize(cg.subtract(b, a));
      return { o: a, d };
   };
   const handRay = hand => {
      const beam = hand === 'left' ? lcb : rcb;
      if (!beam?.isEnabled || !beam.m) return null;
      const matrix = cg.mMultiply(cg.mInverse(root.getGlobalMatrix()),
         cg.mMultiply(cg.mInverse(worldCoords), beam.beamMatrix()));
      return { o: matrix.slice(12, 15), d: cg.normalize(matrix.slice(8, 11).map(x => -x)) };
   };
   const planePoint = (ray, z) => {
      if (!ray || Math.abs(ray.d[2]) < .00001) return null;
      const t = (z - ray.o[2]) / ray.d[2];
      return t > 0 ? cg.add(ray.o, cg.scale(ray.d, t)) : null;
   };
   const panelHit = (p, ray) => {
      if (!ray) return null;
      const matrix = cg.mInverse(p.face.getGlobalMatrix());
      const o = cg.mTransform(matrix, cg.mTransform(root.getGlobalMatrix(), ray.o));
      const end = cg.mTransform(matrix, cg.mTransform(root.getGlobalMatrix(), cg.add(ray.o, ray.d)));
      const d = cg.subtract(end, o);
      if (Math.abs(d[2]) < .00001) return null;
      const t = -o[2] / d[2];
      if (t <= 0) return null;
      return [o[0] + t * d[0], o[1] + t * d[1], t];
   };
   const widgetHit = hand => panels.some(p => {
      const uv = hand === 'mouse' ? panelHit(p, mouse) : p.g2.getUVZ(p.face);
      return uv && Math.abs(uv[0]) <= 1 && Math.abs(uv[1]) <= 1;
   });

   SOURCES.forEach((pos, i) => {
      const color = COLORS[[1, 2, 4][i]];
      root.add('cube').move(pos[0], pos[1] / 2, pos[2]).scale(.13, pos[1] / 2, .13).color(.09, .12, .20).dull();
      root.add('sphere').move(pos).scale(.17).color(color.rgb).opacity(.42);
      root.add('torusY').move(pos[0], pos[1] + .14, pos[2]).scale(.19, .11, .19).color(color.rgb).dull();
      root.add('cube').move(pos[0], pos[1] - .22, pos[2] + .12).scale(.29, .19, .035).color(.12, .15, .23).dull();
      const g2 = new G2(), slot = 3 + i;
      model.txtrSrc(slot, g2.getCanvas());
      const face = root.add('square').move(pos[0], pos[1] - .22, pos[2] + .16).scale(.275, .18, .001).txtr(slot);
      const panel = { g2, face, slider: null };
      panels.push(panel);
      // Use the original G2 widgets; override only hit projection for accurate desktop canvas coordinates.
      const originalUV = g2.getUVZ;
      g2.getUVZ = obj => {
         if (!window.vr) return panelHit(panel, mouse);
         if (window.handtracking) {
            const p = inputEvents.pos(activeHand);
            if (!p) return null;
            const q = cg.mTransform(cg.mInverse(obj.getGlobalMatrix()), p);
            // Planes have a thin Z scale. Test proximity in scene units instead.
            const center = obj.getGlobalMatrix().slice(12, 15);
            return Math.abs(p[2] - center[2]) < .14 ? q : null;
         }
         const beam = activeHand === 'left' ? lcb : rcb;
         return beam?.isEnabled ? beam.hitRect(obj.getGlobalMatrix()) : originalUV(obj);
      };
      g2.render = function() {
         this.setColor('#172139').fillRect(-1, -1, 2, 2);
         this.setColor(color.hex).textHeight(.115).text(color.name + ' SPRING', 0, .67, 'center');
         this.setColor('#b9c8dc').textHeight(.10).text('new bubble size', 0, -.04, 'center');
         const r = .085 + .105 * (panel.pendingSize ?? session.state.sizes[i]);
         this.textHeight(.085).text(session.state.bubbles.length >= LIMIT ? 'ROOM FULL - merge to make space'
            : Math.round(r * 200) + ' cm  /  ' + session.state.bubbles.length + ' bubbles', 0, -.75, 'center');
      };
      g2.addWidget(face, 'button', 0, .30, color.hex, ['  BLOW BUBBLE  '], () => command({ op: 'spawn', source: i }), 2);
      panel.slider = g2.addWidget(face, 'slider', 0, -.35, color.hex, 'SIZE', value => {
         const now = performance.now();
         if (now - panel.lastSize > 65 || panel.lastSize === undefined) {
            command({ op: 'size', source: i, value }); panel.lastSize = now;
         }
         panel.pendingSize = value;
      }, 2.6);
   });

   const pick = (hand, ray) => {
      const handPos = hand !== 'mouse' && inputEvents.pos(hand) ? local(inputEvents.pos(hand)) : null;
      let nearest = null, depth = Infinity, direct = false;
      for (const b of session.state.bubbles) {
         if (b.owner) continue;
         const p = rendered.get(b.id) || b.p;
         if (handPos && cg.distance(handPos, p) < b.r + .09) {
            nearest = b; direct = true; break;
         }
         if (!ray || (window.handtracking && hand !== 'mouse')) continue;
         const v = cg.subtract(p, ray.o), t = cg.dot(v, ray.d);
         const gap = cg.distance(cg.add(ray.o, cg.scale(ray.d, t)), p);
         if (t > 0 && t < depth && gap < b.r + .025) { nearest = b; depth = t; }
      }
      return nearest ? { bubble: nearest, direct } : null;
   };
   const begin = (hand, ray) => {
      if (widgetHit(hand)) return;
      const hit = pick(hand, ray);
      if (!hit) return;
      const b = hit.bubble;
      pointers[hand] = { z: b.p[2], direct: hit.direct,
         distance: ray ? cg.dot(cg.subtract(b.p, ray.o), ray.d) : 0 };
      command({ op: 'grab', id: b.id, hand, pos: [...b.p] });
   };
   const move = (hand, ray) => {
      const pointer = pointers[hand];
      if (!pointer) return;
      const p = pointer.direct && inputEvents.pos(hand) ? local(inputEvents.pos(hand))
         : hand !== 'mouse' && ray ? cg.add(ray.o, cg.scale(ray.d, pointer.distance)) : planePoint(ray, pointer.z);
      if (p && p.every(Number.isFinite)) command({ op: 'move', hand, pos: p });
   };
   const end = hand => {
      if (pointers[hand]) command({ op: 'release', hand });
      delete pointers[hand];
      for (const p of panels) if (p.pendingSize !== undefined) {
         command({ op: 'size', source: panels.indexOf(p), value: p.pendingSize });
         p.pendingSize = undefined;
      }
   };
   inputEvents.onPress = hand => { activeHand = hand; if (window.vr) begin(hand, handRay(hand)); };
   inputEvents.onDrag = hand => { activeHand = hand; };
   inputEvents.onRelease = hand => end(hand);
   inputEvents.onClick = () => {};

   let mouseDown = false;
   const dispatchWidgets = state => { for (const p of panels) p.g2.pointerEvent(state); };
   const down = e => {
      if (window.vr || e.button !== 0) return;
      mouseDown = true;
      mouse = desktopRay(e);
      dispatchWidgets('press');
      begin('mouse', mouse);
   };
   const motion = e => {
      if (window.vr) return;
      mouse = desktopRay(e);
      dispatchWidgets(mouseDown ? 'drag' : 'move');
   };
   const up = e => {
      if (window.vr || !mouseDown || e.button !== 0) return;
      mouse = desktopRay(e);
      dispatchWidgets('release');
      mouseDown = false;
      end('mouse');
   };
   const wheel = e => {
      if (window.vr || !pointers.mouse) return;
      pointers.mouse.z = Math.max(-1.4, Math.min(.6, pointers.mouse.z - e.deltaY * .001));
      e.preventDefault();
   };
   const blur = () => {
      mouse = null;
      if (mouseDown) dispatchWidgets('release');
      mouseDown = false;
      for (const hand of Object.keys(pointers)) end(hand);
   };
   const canvas = window.canvas;
   canvas.addEventListener('mousedown', down);
   window.addEventListener('mousemove', motion);
   canvas.addEventListener('wheel', wheel, { passive: false });
   window.addEventListener('mouseup', up);
   window.addEventListener('blur', blur);

   const pulse = root.add('ringZ').color(.95, .85, 1).dull();
   send({ kind: 'hello', actor });
   model.animate(() => {
      if (dead) return;
      const now = performance.now(), dt = Math.min(.05, (now - lastTime) / 1000);
      lastTime = now;
      if (now - lastHeartbeat > 700) { send({ kind: 'hello', actor }); lastHeartbeat = now; }
      server.sync(CHANNEL, messages => {
         for (const packet of Object.values(messages)) session.receive(packet, now);
      });
      if (session.tick(dt, now) && now - lastSnapshot > 66) {
         send(session.snapshot()); lastSnapshot = now;
      }
      if (now - lastMove > 33) {
         for (const hand of Object.keys(pointers)) move(hand, hand === 'mouse' ? mouse : handRay(hand));
         lastMove = now;
      }
      statusText = (session.count > 1 ? session.count + ' people sharing this room' : 'Your room is ready - invite someone in')
         + (session.state.bubbles.length >= LIMIT ? ' / 42 bubbles' : '');
      header.clear(); header.render(); footer.clear(); footer.render();
      for (const p of panels) {
         if (p.pendingSize === undefined) p.slider.setValue(session.state.sizes[panels.indexOf(p)]);
         if (window.vr) p.g2.update();
         else { p.g2.clear(); p.g2.render(); p.g2.drawWidgets(); }
      }
      const live = new Set();
      for (const b of session.state.bubbles) {
         live.add(b.id);
         if (!meshes.has(b.id)) {
            const node = root.add();
            node.add('sphere').opacity(.52).dull();
            node.add('ringZ').scale(.99).opacity(.70).dull();
            node.add('ringZ').turnY(.8).scale(.99).opacity(.18).dull();
            node.add('sphere').move(-.34, .44, .72).scale(.13, .22, .045).color(1, 1, 1).opacity(.55).dull();
            node.add('sphere').move(.34, -.33, .83).scale(.06).color(.8, .94, 1).opacity(.4).dull();
            meshes.set(b.id, node);
         }
         const node = meshes.get(b.id), color = COLORS[b.mask].rgb;
         const old = rendered.get(b.id) || b.p;
         const p = cg.mix(old, b.p, 1 - Math.exp(-dt * 18));
         rendered.set(b.id, p);
         const breathing = 1 + .014 * Math.sin(model.time * 1.8 + b.id);
         node.identity().move(p).scale(b.r * breathing);
         node.child(0).color(color).opacity(b.owner ? .66 : .52);
         node.child(1).color(color.map(c => c * .72)).opacity(b.owner ? 1 : .78);
         node.child(2).color(color);
      }
      for (const [id, mesh] of meshes) if (!live.has(id)) {
         root.remove(mesh); meshes.delete(id); rendered.delete(id);
      }
      const mix = session.state.mix;
      if (mix && mix.id !== seenMix) { seenMix = mix.id; mixStart = now; }
      const age = (now - mixStart) / 1000;
      pulse.identity();
      if (mix && age < .8) pulse.move(mix.p).scale(.15 + age * .55).color(COLORS[mix.mask].rgb).opacity((1 - age / .8) * .7);
      else pulse.scale(0);
   });

   cleanup = () => {
      dead = true;
      blur();
      send({ kind: 'leave', actor });
      server.sync(CHANNEL, () => {});
      canvas.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', motion);
      canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', blur);
      Object.assign(inputEvents, previousHandlers);
      window.interactMode = previousMode;
   };
};

export const deinit = () => { cleanup?.(); cleanup = null; };
