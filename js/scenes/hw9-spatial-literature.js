import * as cg from '../render/core/cg.js';
import { joyStickState } from '../render/core/controllerInput.js';
import { lcb, rcb } from '../handle_scenes.js';
import { prepareCorpus, initialFilters, normalizeFilters, filterKey, passesFilters, citationCount,
   paperYear, pickPaper, edgeKind, paperURL, paperColor, paperName, labelText, wrapText,
   normalizePositions, pointOnYearPlane } from '../util/spatial-literature.mjs';
import { createPaperPanel } from '../util/spatial-literature-panel.mjs';
import { createVRPaperLink } from '../util/spatial-literature-vr-link.mjs';
import { xrEntryUI } from '../global.js';

export const reloadOnFocus = false;
const SHARED = 'hw9LiteratureState';
const CYAN = [.22, .85, 1], GOLD = [1, .71, .22], INK = [.12, .22, .32];
let cleanup = null;

export const init = async model => {
   cleanup?.();
   let dead = false;
   cleanup = () => { dead = true; };
   const label = (root, text, p, size = .014, color = CYAN) =>
      root.add('label').info(labelText(text)).move(p).scale(size).color(color);
   let corpus;
   try {
      const response = await fetch(new URL('../../papers_vr.json', import.meta.url));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      corpus = prepareCorpus(await response.json());
   } catch (error) {
      if (dead) return;
      label(model, 'Could not load local papers_vr.json. See browser console.', [0, 1.5, -1.5]);
      console.error('Spatial Literature Explorer:', error);
      return;
   }
   if (dead) return;
   window[SHARED] ??= { ...initialFilters(corpus), selectedId: null };
   let state, last = performance.now(), detailKey = '', hovered = null, pointer = null, mouseDown = null;
   let travel = [0, 0, 0], gesture = null; // Navigation is personal; manual XY edits are shared.
   const graph = model.add(), hud = model.add();
   const byID = new Map(corpus.papers.map(p => [p.id, p]));
   const readState = () => {
      const raw = window[SHARED];
      return { ...normalizeFilters(raw, corpus), selectedId: byID.has(raw?.selectedId) ? raw.selectedId : null,
         positions: normalizePositions(raw?.positions, corpus) };
   };
   state = readState();
   const publish = next => { state = next; window[SHARED] = next; server.broadcastGlobal(SHARED); };
   const selected = () => {
      const p = byID.get(state.selectedId);
      return p && passesFilters(p, state) ? p : null;
   };
   const nodes = corpus.papers.map(p => {
      const layout = corpus.layout.get(p.id), root = graph.add().move(layout.position);
      const ball = root.add('sphere').color(paperColor(p));
      const caption = label(root, paperName(p), [0, -layout.radius - .07, 0], .024, [.88, .94, 1]);
      return { p, ...layout, root, ball, caption, amount: passesFilters(p, state) ? 1 : 0 };
   });
   const edges = corpus.edges.map(e => ({ ...e, line: graph.add('tubeZ').dull(), arrow: graph.add('coneZ').dull() }));
   // Physical year slices and a low time rail leave the graph itself unobstructed.
   for (let year = corpus.minYear; year <= corpus.maxYear; year++) {
      const z = -1.5 - (corpus.maxYear - year) * .85;
      graph.add('tubeX').move(0, .42, z).scale(1.6, .003, .003).color(INK).dull();
      label(graph, `${year}`, [-1.68, .48, z], .035);
   }
   graph.add('tubeZ').move(-1.68, .42, -1.5 - (corpus.maxYear - corpus.minYear) * .425)
      .scale(.003, .003, Math.max(.05, (corpus.maxYear - corpus.minYear) * .425)).color(CYAN).dull();

   const filters = label(hud, '', [0, .40, -1.1], .015, [.74, .83, .92]);
   const details = Array.from({ length: 5 }, (_, i) => label(hud, '', [0, -.30 - i * .05, -1.1], .016, [.87, .94, 1]));
   const surface = window.canvas;
   const cursorWas = surface?.style.cursor;
   const panel = createPaperPanel(typeof document === 'undefined' ? null : document, () => surface?.focus());
   const vrLink = createVRPaperLink(model, cg, { beamForHand: hand => {
      const beam = hand === 'left' ? lcb : hand === 'right' ? rcb : null;
      return beam?.isEnabled && beam.m ? beam.beamMatrix() : null;
   } });
   const positionFor = id => {
      if (gesture?.active && gesture.id === id) return gesture.position;
      const base = corpus.layout.get(id).position, xy = state.positions[id];
      return xy ? [xy[0], xy[1], base[2]] : base;
   };
   const candidates = () => nodes.filter(n => passesFilters(n.p, state) && n.amount > .1)
      .map(n => ({ id: n.p.id, position: positionFor(n.p.id), radius: n.radius * n.amount * (state.selectedId === n.p.id ? 1.15 : 1) }));
   const mouseRay = e => {
      const view = clay.views?.[0], rect = surface?.getBoundingClientRect();
      if (!view || !rect?.width || !rect.height) return null;
      const x = 2 * (e.clientX - rect.left) / rect.width - 1, y = 1 - 2 * (e.clientY - rect.top) / rect.height;
      const inverse = cg.mInverse(cg.mMultiply(view.projectionMatrix, view.viewMatrix));
      const toGraph = cg.mInverse(graph.getGlobalMatrix());
      const at = z => {
         const p = cg.mTransform(inverse, [x, y, z, 1]);
         return cg.mTransform(toGraph, p.slice(0, 3).map(v => v / p[3]));
      };
      const a = at(-1), b = at(.5); // Avoid infinity for infinite-far projection matrices.
      return { origin: a, direction: cg.subtract(b, a) };
   };
   const handRay = hand => {
      const beam = hand === 'left' ? lcb : rcb;
      if (!beam?.isEnabled || !beam.m) return null;
      const m = cg.mMultiply(cg.mInverse(graph.getGlobalMatrix()), beam.beamMatrix());
      return { origin: m.slice(12, 15), direction: m.slice(8, 11).map(x => -x) };
   };
   const pick = ray => ray ? pickPaper(ray.origin, ray.direction, candidates()) : null;
   const beginGesture = (owner, ray, screen = null) => {
      if (gesture || dead || panel.isOpen || vrLink.isOpen) return false;
      state = readState();
      const id = pick(ray);
      if (!id) return false;
      const position = positionFor(id).slice(), point = pointOnYearPlane(ray, position[2]);
      if (!point) return false;
      gesture = { owner, id, start: position, point, position, screen, active: false, sentAt: -Infinity };
      publish({ ...state, selectedId: id });
      return true;
   };
   const sendPosition = force => {
      if (!gesture?.active || (!force && performance.now() - gesture.sentAt < 50)) return;
      state = readState();
      publish({ ...state, selectedId: gesture.id,
         positions: { ...state.positions, [gesture.id]: gesture.position.slice(0, 2) } });
      gesture.sentAt = performance.now();
   };
   const updateGesture = (ray, screen = null) => {
      if (!gesture) return;
      state = readState();
      if (!passesFilters(byID.get(gesture.id), state)) { gesture = null; mouseDown = null; return; }
      const point = pointOnYearPlane(ray, gesture.start[2]);
      if (!point) return;
      const delta = cg.subtract(point, gesture.point);
      const moved = gesture.owner === 'mouse' ? screen && Math.hypot(screen[0] - gesture.screen[0], screen[1] - gesture.screen[1]) > 6
         : Math.hypot(delta[0], delta[1]) > .018;
      if (!gesture.active && !moved) return;
      gesture.active = true;
      gesture.position = [Math.max(-3.5, Math.min(3.5, gesture.start[0] + delta[0])),
         Math.max(.4, Math.min(3.2, gesture.start[1] + delta[1])), gesture.start[2]];
      sendPosition(false);
   };
   const finishGesture = () => { sendPosition(true); gesture = null; };
   const consume = e => { e.preventDefault?.(); e.stopImmediatePropagation?.(); };
   const down = e => {
      if (window.vr || e.button !== 0 || panel.isOpen || dead) return;
      mouseDown = [e.clientX, e.clientY];
      if (beginGesture('mouse', mouseRay(e), mouseDown)) consume(e);
   };
   const move = e => {
      pointer = { clientX: e.clientX, clientY: e.clientY };
      if (gesture?.owner === 'mouse') {
         updateGesture(mouseRay(e), [e.clientX, e.clientY]);
         consume(e); // A paper drag must not also rotate the desktop camera.
      }
   };
   const leave = () => { pointer = null; hovered = null; if (!gesture && surface) surface.style.cursor = cursorWas; };
   const up = e => {
      const start = mouseDown; mouseDown = null;
      if (dead || window.vr || e.button !== 0 || !start) return;
      if (gesture?.owner === 'mouse') {
         consume(e);
         updateGesture(mouseRay(e), [e.clientX, e.clientY]);
         const id = gesture?.id, dragged = gesture?.active;
         finishGesture();
         if (id && !dragged) panel.show(byID.get(id));
         return;
      }
      if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) return;
      state = readState();
      const id = pick(mouseRay(e));
      publish({ ...state, selectedId: id });
      if (id) panel.show(byID.get(id));
   };
   const blur = () => { finishGesture(); mouseDown = null; pointer = null; };
   surface?.addEventListener('mousedown', down, true);
   window.addEventListener('mousemove', move, true);
   window.addEventListener('mouseup', up, true);
   window.addEventListener('blur', blur);
   surface?.addEventListener('mouseleave', leave);

   const previous = { keydown: window.keydown, keyup: window.keyup, onPress: inputEvents.onPress,
      onDrag: inputEvents.onDrag, onRelease: inputEvents.onRelease };
   const keydown = () => {};
   const keyup = e => {
      if (dead || panel.isOpen || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) || e.target?.isContentEditable) return;
      state = readState();
      const next = filterKey(state, e.key, corpus);
      if (next) {
         const p = byID.get(state.selectedId);
         if (gesture && !passesFilters(byID.get(gesture.id), next)) finishGesture();
         publish({ ...state, ...next, selectedId: p && passesFilters(p, next) ? p.id : null });
         e.preventDefault();
      } else switch (e.key.toLowerCase()) {
         case 'pageup': travel[2] = Math.min(3.2, travel[2] + .4); e.preventDefault(); break;
         case 'pagedown': travel[2] = Math.max(-.6, travel[2] - .4); e.preventDefault(); break;
         case 'home': travel = [0, 0, 0]; break;
         case 'l': gesture = null; mouseDown = null; publish({ ...state, positions: {} }); break;
         case 'o': {
            const url = paperURL(selected());
            // Explicit computer user gesture only: never auto-open on a headset.
            if (url && !window.vr) window.open(url, '_blank', 'noopener,noreferrer');
            break;
         }
      }
   };
   window.keydown = keydown;
   window.keyup = keyup;
   const onPress = hand => {
      if (dead || gesture) return;
      if (vrLink.isOpen) {
         const beam = hand === 'left' ? lcb : rcb;
         vrLink.press(beam?.isEnabled && beam.m ? beam.beamMatrix() : null);
         return;
      }
      const ray = handRay(hand);
      if (ray && !beginGesture(hand, ray)) publish({ ...readState(), selectedId: null });
   };
   const onDrag = hand => { if (!dead && gesture?.owner === hand) updateGesture(handRay(hand)); };
   const onRelease = hand => {
      if (!dead && gesture?.owner === hand) {
         updateGesture(handRay(hand));
         const id = gesture?.id, dragged = gesture?.active;
         finishGesture();
         if (window.vr && id && !dragged) {
            const head = clay.pose?.transform?.matrix || clay.root().inverseViewMatrix(0);
            vrLink.show(byID.get(id), head);
         }
      }
   };
   inputEvents.onPress = onPress;
   inputEvents.onDrag = onDrag;
   inputEvents.onRelease = onRelease;
   cleanup = () => {
      finishGesture();
      dead = true;
      panel.dispose();
      vrLink.dispose();
      surface?.removeEventListener('mousedown', down, true);
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      window.removeEventListener('blur', blur);
      surface?.removeEventListener('mouseleave', leave);
      if (surface) surface.style.cursor = cursorWas;
      if (window.keydown === keydown) window.keydown = previous.keydown;
      if (window.keyup === keyup) window.keyup = previous.keyup;
      if (inputEvents.onPress === onPress) inputEvents.onPress = previous.onPress;
      if (inputEvents.onDrag === onDrag) inputEvents.onDrag = previous.onDrag;
      if (inputEvents.onRelease === onRelease) inputEvents.onRelease = previous.onRelease;
   };

   model.animate(() => {
      if (dead) return;
      window[SHARED] = server.synchronize(SHARED) || window[SHARED];
      state = readState();
      const now = performance.now(), dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
      const rawHead = clay.pose?.transform?.matrix || clay.root().inverseViewMatrix(0);
      hud.setMatrix(cg.mMultiply(cg.mInverse(model.getGlobalMatrix()), rawHead));
      const head = cg.mMultiply(cg.mInverse(model.getGlobalMatrix()), rawHead);
      if (!window.vr && vrLink.isOpen) vrLink.close();
      vrLink.bindSession(xrEntryUI()?.session || null);
      if (window.vr && !vrLink.isOpen) {
         const joy = joyStickState.left;
         const x = Number.isFinite(joy?.x) && Math.abs(joy.x) > .15 ? joy.x : 0;
         const y = Number.isFinite(joy?.y) && Math.abs(joy.y) > .15 ? joy.y : 0;
         const forward = cg.normalize([-head[8], 0, -head[10]]);
         const right = [-forward[2], 0, forward[0]];
         travel[0] = Math.max(-2.2, Math.min(2.2, travel[0] + (-right[0]*x + forward[0]*y) * dt * .7));
         travel[2] = Math.max(-.6, Math.min(3.2, travel[2] + (-right[2]*x + forward[2]*y) * dt * .7));
      }
      graph.identity().move(travel);
      if (gesture && !passesFilters(byID.get(gesture.id), state)) { gesture = null; mouseDown = null; }
      hovered = !window.vr && pointer && !panel.isOpen ? pick(mouseRay(pointer)) : null;
      if (surface) surface.style.cursor = gesture?.owner === 'mouse' ? 'grabbing' : hovered ? 'pointer' : cursorWas;
      const p = selected(), selectedID = p?.id;
      const rotation = head.slice(); rotation[12] = rotation[13] = rotation[14] = 0;
      for (const n of nodes) {
         const active = passesFilters(n.p, state);
         n.amount += ((active ? 1 : 0) - n.amount) * (1 - Math.exp(-dt * 10));
         if (n.amount < .001) n.amount = 0;
         n.root.identity().move(positionFor(n.p.id)).scale(n.amount);
         n.ball.identity().scale(n.radius * (selectedID === n.p.id ? 1.15 : hovered === n.p.id ? 1.08 : 1))
            .color(selectedID === n.p.id ? GOLD : paperColor(n.p));
         n.caption.setMatrix(rotation).move(0, -n.radius - .07, 0).scale(.024)
            .color(selectedID === n.p.id || hovered === n.p.id ? [1, .88, .57] : [.88, .94, 1]);
      }
      for (const e of edges) {
         const a = corpus.layout.get(e.source), b = corpus.layout.get(e.target);
         const visible = passesFilters(byID.get(e.source), state) && passesFilters(byID.get(e.target), state);
         if (!visible) { e.line.identity().scale(0); e.arrow.identity().scale(0); continue; }
         const pa = positionFor(e.source), pb = positionFor(e.target);
         const d = cg.subtract(pb, pa), length = cg.norm(d);
         if (length < (a.radius + b.radius) * 1.2 + .07) { e.line.identity().scale(0); e.arrow.identity().scale(0); continue; }
         const dir = cg.scale(d, 1 / length);
         const start = cg.add(pa, cg.scale(dir, a.radius * 1.2));
         const end = cg.add(pb, cg.scale(dir, -b.radius * 1.2 - .035));
         const kind = edgeKind(e, selectedID), related = kind !== 'other';
         const color = kind === 'outgoing' ? GOLD : kind === 'incoming' ? CYAN : selectedID ? [.055, .08, .11] : INK;
         e.line.placeLimb(start, end, related ? .004 : .0015).color(color);
         // coneZ tapers toward +Z, so its tip faces the cited target.
         e.arrow.identity().move(end).aimZ(dir).scale(related ? .021 : .012, related ? .021 : .012, .035).color(color);
      }
      const count = corpus.papers.filter(p => passesFilters(p, state)).length;
      filters.info(`${count} / ${nodes.length} papers   |   ${state.minYear}+   |   ${state.minCitations}+ citations`);
      const key = `${!!window.vr}:${vrLink.isOpen}:${selectedID || ''}:${state.minCitations}:${state.minYear}`;
      if (key !== detailKey) {
         detailKey = key;
         const lines = p && window.vr && !vrLink.isOpen ? [ ...wrapText(p.title || p.id),
            `${paperYear(p)} | ${citationCount(p)} citations`, p.arxivUrl || '' ] : [];
         details.forEach((n, i) => n.info(lines[i] || ''));
      }
   });
};

export const deinit = () => { cleanup?.(); cleanup = null; };
