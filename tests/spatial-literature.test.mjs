import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as helpers from '../js/util/spatial-literature.mjs';
import { createPaperPanel } from '../js/util/spatial-literature-panel.mjs';
import { createVRPaperLink, openPaperInBrowser } from '../js/util/spatial-literature-vr-link.mjs';
function mockDocument() {
   class Element {
      constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.style = {}; this.open = false; }
      append(...nodes) { this.children.push(...nodes); nodes.forEach(n => n.parent = this); }
      setAttribute(k,v) { this[k] = v; }
      removeAttribute(k) { delete this[k]; }
      addEventListener(k,fn) { this.events[k] = fn; }
      showModal() { this.open = true; }
      close() { this.open = false; this.events.close?.(); }
      remove() { this.parent.children = this.parent.children.filter(n => n !== this); }
   }
   return { head: new Element('head'), body: new Element('body'), createElement: tag => new Element(tag) };
}
const data = JSON.parse(fs.readFileSync(new URL('../papers_vr.json', import.meta.url)));
const corpus = helpers.prepareCorpus(data), initial = helpers.initialFilters(corpus);
assert.equal(corpus.papers.length, 25);
assert.equal(corpus.edges.length, 58);
assert.equal(corpus.papers.filter(p => helpers.passesFilters(p, initial)).length, 25);
for (const p of corpus.papers) {
   const a = corpus.layout.get(p.id);
   assert.ok(a.radius >= .055 && a.radius <= .13);
   for (const q of corpus.papers.filter(q => helpers.paperYear(q) < helpers.paperYear(p)))
      assert.ok(a.position[2] > corpus.layout.get(q.id).position[2]);
   for (const q of corpus.papers.filter(q => q.id !== p.id && q.year === p.year))
      assert.ok(Math.hypot(...a.position.map((x,i) => x - corpus.layout.get(q.id).position[i])) > a.radius + corpus.layout.get(q.id).radius);
}
assert.deepEqual([...helpers.prepareCorpus({ ...data, papers: [...data.papers].reverse() }).layout].sort(), [...corpus.layout].sort());
assert.equal(helpers.filterKey(initial, '[', corpus).minCitations, 0);
assert.equal(helpers.filterKey(initial, ']', corpus).minCitations, 100);
assert.deepEqual(helpers.filterKey({ minCitations: 500, minYear: 2025 }, 'R', corpus), initial);
assert.ok(!helpers.passesFilters({ year: 2022, citationCount: 1000 }, { minYear: 2023, minCitations: 200 }));
assert.ok(!helpers.passesFilters({ year: 2024, citationCount: 199 }, { minYear: 2023, minCitations: 200 }));
assert.equal(helpers.paperURL({}), null);
assert.equal(helpers.previewURL({ arxivUrl: 'https://arxiv.org/abs/2210.03629' }), 'https://arxiv.org/pdf/2210.03629');
assert.equal(new Set(corpus.papers.map(p => helpers.paperColor(p).join())).size, 6);
assert.equal(helpers.paperName(data.papers[0]), 'ReAct');
assert.equal(helpers.pointOnYearPlane({ origin: [0,0,0], direction: [1,0,0] }, -2), null);
assert.equal(helpers.pointOnYearPlane({ origin: [0,0,0], direction: [0,0,1] }, -2), null);
assert.deepEqual(helpers.pointOnYearPlane({ origin: [0,1,0], direction: [1,1,-1] }, -2), [2,3,-2]);
assert.deepEqual(helpers.normalizePositions({ react: [100, -2], bogus: [1,1], camel: [NaN,1] }, corpus), { react: [3.5,.4] });
assert.equal(helpers.paperURL({ arxivUrl: 'javascript:alert(1)', paperUrl: 'https://example.org' }), 'https://example.org');
assert.equal(helpers.edgeKind({ source: 'a', target: 'b' }, 'a'), 'outgoing');
assert.equal(helpers.edgeKind({ source: 'a', target: 'b' }, 'b'), 'incoming');
assert.equal(helpers.prepareCorpus({ papers: [{ id: 'only' }] }).edges.length, 0);
assert.equal(helpers.pickPaper([0,0,0], [0,0,-1], [
   { id: 'behind', position: [0,0,1], radius: .1 },
   { id: 'far', position: [0,0,-3], radius: .1 },
   { id: 'near', position: [0,0,-1], radius: .1 },
]), 'near');

// Execute the actual scene and Server synchronize/broadcast functions in two
// isolated browser-like contexts. Only rendering, socket relay and disk I/O
// are substituted, including the framework's late-join request/response path.
const cg = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(new URL('../js/render/core/cg.js', import.meta.url))).toString('base64'));
const source = fs.readFileSync(new URL('../js/scenes/hw9-spatial-literature.js', import.meta.url), 'utf8')
   .replace(/^import [\s\S]*?;\s*$/gm, '').replaceAll('export ', '')
   .replace('import.meta.url', JSON.stringify(new URL('../js/scenes/hw9-spatial-literature.js', import.meta.url).href));
const serverSource = fs.readFileSync(new URL('../server/client.js', import.meta.url), 'utf8').replace('this.connectSocket(wsPort);', '');
const members = [], packets = [], stored = new Map(), ids = [];
async function client(id, xr = false, matrix = cg.mIdentity()) {
   let now = 100, animate;
   class Node {
      constructor(parent, form) { this.parent = parent; this.form = form; this.children = []; this.m = cg.mIdentity(); }
      add(form) { const n = new Node(this, form); this.children.push(n); return n; }
      identity() { this.m = cg.mIdentity(); return this; }
      setMatrix(m) { this.m = m.slice(); return this; }
      getGlobalMatrix() { return this.parent ? cg.mMultiply(this.parent.getGlobalMatrix(), this.m) : this.m; }
      move(...p) { this.m = cg.mMultiply(this.m, cg.mTranslate(...p)); return this; }
      scale(...s) { this.m = cg.mMultiply(this.m, cg.mScale(...s)); return this; }
      aimZ(d) { this.m = cg.mMultiply(this.m, cg.mAimZ(d)); return this; }
      placeLimb(a,b,r) { return this.identity().move(cg.mix(a,b,.5)).aimZ(cg.subtract(b,a)).scale(r,r,cg.distance(a,b)/2); }
      color(...c) { this.rgb = c; return this; } dull() { return this; }
      txtrSrc() { return this; } txtr() { return this; }
      info(text) { this.text = text; return this; }
      animate(fn) { animate = fn; }
   }
   const original = () => {}, opened = [];
   let vrLink;
   const linkActions = [], sessionListeners = new Map();
   const session = {
      addEventListener: (name, fn) => sessionListeners.set(name, fn),
      removeEventListener: name => sessionListeners.delete(name),
      emit: (name, hand = 'right') => sessionListeners.get(name)?.({ inputSource: { handedness: hand } }),
   };
   const linkFactory = (model, cg, options) => vrLink = createVRPaperLink(model, cg, {
      ...options, openURL: (url, source) => linkActions.push([url, source]),
   });
   const document = mockDocument(), mouseListeners = new Map(), globalListeners = new Map();
   const canvas = { style: { cursor: 'grab' }, focus() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 750 }),
      addEventListener: (k,fn) => mouseListeners.set(k,fn),
      removeEventListener: k => mouseListeners.delete(k),
   };
   const projection = [1,0,0,0, 0,1,0,0, 0,0,-1.002,-1, 0,0,-.2002,0];
   const view = { projectionMatrix: projection, viewMatrix: cg.mTranslate(0, -1.6, 0) };
   const beam = { isEnabled: true, m: true, matrix: cg.mIdentity(), beamMatrix() { return this.matrix; } };
   const env = vm.createContext({ ...helpers, createPaperPanel, createVRPaperLink: linkFactory,
      xrEntryUI: () => ({ session: xr ? session : null }), document, canvas, cg, URL, console, Date, name: '', clientID: id, clients: ids,
      isMasterClient: () => ids[0] === id, performance: { now: () => now },
      inputEvents: { onPress: original, onDrag: original, onRelease: original }, keyup: original, keydown: original,
      addEventListener: (k,fn) => globalListeners.set(k,fn),
      removeEventListener: k => globalListeners.delete(k),
      lcb: beam, rcb: beam, vr: xr, joyStickState: { left: { x: 0, y: 0 } },
      clay: { views: [view], pose: { transform: { matrix: cg.mTranslate(0, 1.6, 0) } } },
      fetch: async () => ({ ok: true, json: async () => structuredClone(data) }),
      open: (...args) => opened.push(args),
   });
   env.window = env;
   vm.runInContext(serverSource, env);
   env.server = vm.runInContext('new Server()', env);
   env.server.get = (key, cb) => { if (stored.has(key)) cb(stored.get(key)); };
   env.server.set = (key, value) => stored.set(key, structuredClone(value));
   env.server.broadcastObject = packet => {
      packets.push(JSON.parse(JSON.stringify(packet)));
      for (const other of members) if (other.env !== env) other.env[packet.global] = JSON.parse(JSON.stringify(packet.value));
   };
   vm.runInContext(source + '\nglobalThis.begin = init; globalThis.end = deinit;', env);
   const model = new Node(); model.setMatrix(matrix);
   await env.begin(model);
   const c = { env, model, beam, opened, original, document, mouseListeners, globalListeners,
      vrLink, linkActions, session, sessionListeners,
      frame(ms = 16) { now += ms; animate(); },
      key(key) { env.keyup({ key, preventDefault() {} }); },
      mouse(type, x, y) {
         const e = { button: 0, clientX: x, clientY: y, prevented: false,
            preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
         (globalListeners.get(type) || mouseListeners.get(type))?.(e);
         return e;
      },
      screenPoint(p) {
         const clip = cg.mTransform(cg.mMultiply(projection, view.viewMatrix), [...p,1]);
         return [(clip[0] / clip[3] + 1) * 500, (1 - clip[1] / clip[3]) * 375];
      },
   };
   members.push(c); ids.push(id); c.frame(); return c;
}
const desktop = await client(0);
const SHARED = 'hw9LiteratureState';
desktop.key(']'); desktop.key('.');
const headset = await client(1, true, cg.mMultiply(cg.mTranslate(.3, 0, -.2), cg.mRotateY(.2)));
desktop.frame(); headset.frame();
assert.equal(headset.env[SHARED].minCitations, 100, 'late client receives current filters');
assert.equal(headset.env[SHARED].minYear, corpus.minYear + 1);
desktop.key('r'); headset.frame();
assert.equal(headset.env[SHARED].minCitations, 0);
const graph = headset.model.children[0], roots = graph.children.slice(0, 25);
assert.equal(roots.filter(n => n.children[0].form === 'sphere').length, 25);
headset.key('PageUp'); headset.frame();
const paper = corpus.papers.find(p => p.id === 'react'), layout = corpus.layout.get(paper.id);
const ray = cg.mTranslate(...cg.add(layout.position, [0, 0, .4]));
headset.beam.matrix = cg.mMultiply(graph.getGlobalMatrix(), ray);
headset.env.inputEvents.onPress('right'); desktop.frame();
headset.env.inputEvents.onRelease('right');
assert.equal(headset.vrLink.isOpen, true, 'controller click opens a compact original-link card');
assert.equal(headset.linkActions.length, 0, 'selection does not automatically open an external page');
headset.beam.matrix = cg.mMultiply(headset.vrLink.root.getGlobalMatrix(), cg.mTranslate(-.19, -.105, .3));
headset.session.emit('select');
assert.equal(headset.linkActions.length, 0, 'a select without a card-button press cannot launch the link');
headset.env.inputEvents.onPress('right');
assert.equal(headset.linkActions.length, 0, 'polled controller input must not open a browser tab');
headset.session.emit('selectstart'); headset.session.emit('select'); headset.session.emit('selectend');
headset.env.inputEvents.onRelease('right');
assert.equal(headset.linkActions.at(-1)[0], paper.arxivUrl, 'native XR gesture opens the original supplied URL');
assert.equal(headset.linkActions.at(-1)[1], headset.session);
assert.equal(headset.vrLink.isOpen, false);
headset.vrLink.show(paper, headset.env.clay.pose.transform.matrix);
headset.beam.matrix = cg.mMultiply(headset.vrLink.root.getGlobalMatrix(), cg.mTranslate(.24, -.105, .3));
headset.env.inputEvents.onPress('left'); headset.env.inputEvents.onRelease('left');
assert.equal(headset.vrLink.isOpen, false, 'controller ray closes the card after calibrated placement');
assert.equal(headset.env[SHARED].selectedId, 'react', 'card controls do not select graph spheres behind the card');
assert.equal(desktop.env[SHARED].selectedId, paper.id, 'selection after travel and world transform');
const selectedBall = roots[corpus.papers.indexOf(paper)].children[0];
headset.frame();
assert.deepEqual(Array.from(selectedBall.rgb[0]), [1, .71, .22]);
const incomingIndex = corpus.edges.findIndex(e => e.target === paper.id);
assert.deepEqual(Array.from(graph.children[25 + incomingIndex * 2].rgb[0]), [.22, .85, 1]);
desktop.key('o'); assert.equal(desktop.opened[0][0], paper.arxivUrl);
headset.key('o'); assert.equal(headset.opened.length, 0);
const originalPositions = roots.map(n => n.m.slice(12, 15));
for (let i = 0; i < 30; i++) desktop.key(']');
for (let i = 0; i < 90; i++) { desktop.frame(); headset.frame(); }
assert.equal(roots.filter(n => Math.abs(n.m[0]) > .001).length, 0);
assert.deepEqual(roots.map(n => n.m.slice(12, 15)), originalPositions);
const edgeNodes = graph.children.slice(25, 25 + 58 * 2);
assert.ok(edgeNodes.every(n => n.m[0] === 0 && n.m[5] === 0 && n.m[10] === 0));
desktop.key('r');
for (let i = 0; i < 60; i++) headset.frame();
assert.equal(roots.filter(n => n.m[0] > .99).length, 25);
headset.key('Home'); headset.frame();
headset.env.joyStickState.left.y = -1;
headset.frame(50);
assert.ok(graph.m[14] > 0, 'forward stick brings older layers closer');
assert.ok(packets.filter(p => p.global === SHARED).every(p => Object.keys(p.value).length === 4 && !p.value.papers), 'only compact state and XY edits are sent');
assert.equal(desktop.document.body.children.length, 0, 'remote VR selection does not open desktop reader');
const desktopGraph = desktop.model.children[0];
desktop.key('PageUp'); desktop.frame();
const mousePaper = corpus.papers.find(p => p.id === 'toolalpaca');
const center = cg.mTransform(desktopGraph.getGlobalMatrix(), corpus.layout.get(mousePaper.id).position);
const [mx,my] = desktop.screenPoint(center);
const preventedDown = desktop.mouse('mousedown', mx, my);
assert.equal(preventedDown.prevented, true, 'sphere grabs consume camera interaction');
desktop.mouse('mousemove', mx + 60, my - 20); desktop.frame(); headset.frame();
assert.equal(desktop.env.canvas.style.cursor, 'grabbing');
const dragPosition = desktop.env[SHARED].positions[mousePaper.id];
assert.ok(dragPosition[0] > corpus.layout.get(mousePaper.id).position[0]);
assert.ok(dragPosition[1] > corpus.layout.get(mousePaper.id).position[1]);
const mouseRoot = roots[corpus.papers.indexOf(mousePaper)];
assert.deepEqual(Array.from(mouseRoot.m.slice(12,15)), [...dragPosition, corpus.layout.get(mousePaper.id).position[2]], 'mouse drag is synchronized and depth stays fixed');
const linkIndex = corpus.edges.findIndex(e => e.source === mousePaper.id);
const linkBefore = graph.children[25 + linkIndex * 2].m.slice();
desktop.mouse('mousemove', mx + 100, my - 30); // Within throttle interval: local preview still follows.
desktop.frame(10);
const latestLocal = desktopGraph.children[corpus.papers.indexOf(mousePaper)].m.slice(12,15);
assert.ok(latestLocal[0] > dragPosition[0]);
desktop.mouse('mouseup', mx + 100, my - 30); headset.frame();
assert.equal(desktop.document.body.children.length, 0, 'dragging does not open reader');
assert.deepEqual(Array.from(mouseRoot.m.slice(12,15)), Array.from(latestLocal), 'release flushes final XY edit despite throttle');
assert.notDeepEqual(graph.children[25 + linkIndex * 2].m, linkBefore, 'connected lines move with the sphere');
const finalXY = Array.from(desktop.env[SHARED].positions[mousePaper.id]);
desktop.key(']'); desktop.key('r'); headset.frame();
assert.deepEqual(Array.from(desktop.env[SHARED].positions[mousePaper.id]), finalXY, 'filter reset preserves manual layout');
desktop.key('l'); headset.frame(); desktop.frame();
assert.equal(Object.keys(headset.env[SHARED].positions).length, 0);
assert.deepEqual(Array.from(mouseRoot.m.slice(12,15)), corpus.layout.get(mousePaper.id).position, 'L restores deterministic layout');
desktop.mouse('mousemove', mx, my); desktop.frame();
assert.equal(desktop.env.canvas.style.cursor, 'pointer');
desktop.mouse('mousedown', mx, my); desktop.mouse('mouseup', mx, my);
assert.equal(desktop.env[SHARED].selectedId, mousePaper.id, 'mouse unprojects through travel transform');
const reader = desktop.document.body.children[0], frame = reader.children[1];
assert.equal(reader.open, true);
assert.equal(frame.src, helpers.previewURL(mousePaper), 'click loads paper PDF directly');
assert.equal(reader.children[0].children[0].children[0].textContent, mousePaper.title);
const threshold = desktop.env[SHARED].minCitations;
desktop.key(']'); assert.equal(desktop.env[SHARED].minCitations, threshold, 'modal blocks scene keyboard shortcuts');
reader.close(); assert.equal(frame.src, undefined, 'close unloads embedded page');
desktop.key(']'); assert.equal(desktop.env[SHARED].minCitations, threshold + 100);

// Both controller hands use the same year-plane grab, including rotated scene
// calibration, personal travel, off-center grabs, and a parallel-ray fallback.
desktop.key('r'); headset.frame();
for (const hand of ['left', 'right']) {
   const p = corpus.layout.get('react').position;
   const origin = cg.add(p, [.025, 0, .4]);
   headset.beam.matrix = cg.mMultiply(graph.getGlobalMatrix(), cg.mTranslate(...origin));
   headset.env.inputEvents.onPress(hand);
   headset.env.inputEvents.onDrag(hand); headset.frame();
   assert.equal(Object.keys(headset.env[SHARED].positions).length, 0, 'stationary trigger is a click without layout edits');
   headset.beam.matrix = cg.mMultiply(graph.getGlobalMatrix(), cg.mTranslate(...cg.add(origin, [.35,.16,0])));
   headset.env.inputEvents.onDrag(hand); headset.frame(); desktop.frame();
   const moved = desktop.env[SHARED].positions.react;
   assert.ok(Math.abs(moved[0] - (p[0] + .35)) < 1e-8);
   assert.ok(Math.abs(moved[1] - (p[1] + .16)) < 1e-8, 'grab preserves offset instead of snapping to ray');
   assert.equal(roots[0].m[14], p[2]);
   headset.beam.matrix = cg.mMultiply(graph.getGlobalMatrix(), cg.mMultiply(cg.mTranslate(...origin), cg.mRotateY(Math.PI/2)));
   headset.env.inputEvents.onDrag(hand);
   headset.env.inputEvents.onRelease(hand); desktop.frame();
   assert.equal(headset.vrLink.isOpen, false, 'controller drag does not open the card on release');
   assert.deepEqual(Array.from(desktop.env[SHARED].positions.react), Array.from(moved), 'parallel release retains last valid position');
   headset.key('l'); desktop.frame(); headset.frame();
}
desktop.env.end(); headset.env.end();
assert.equal(desktop.document.body.children.length, 0);
assert.equal(desktop.document.head.children.length, 0);
assert.equal(desktop.mouseListeners.size, 0);
assert.equal(desktop.globalListeners.size, 0);
assert.equal(headset.sessionListeners.size, 0, 'leaving removes native XR gesture listeners');
const missingDocument = mockDocument(), missingReader = createPaperPanel(missingDocument);
missingReader.show({ id: 'missing', title: '<b>Literal title</b>' });
assert.equal(missingDocument.body.children[0].children[1].hidden, true);
assert.equal(missingDocument.body.children[0].children[2].hidden, false);
missingReader.dispose();
assert.equal(desktop.env.keyup, desktop.original);
assert.equal(headset.env.inputEvents.onPress, headset.original);
assert.equal(headset.env.inputEvents.onDrag, headset.original);
assert.equal(headset.env.inputEvents.onRelease, headset.original);

// Leaving while the local fetch is pending must not install stale handlers.
let finishFetch;
const oldHandler = () => {};
const pending = vm.createContext({ ...helpers, cg, URL, console,
   inputEvents: { onPress: oldHandler }, keyup: oldHandler, keydown: oldHandler,
   fetch: () => new Promise(resolve => { finishFetch = resolve; }),
});
pending.window = pending;
vm.runInContext(source + '\nglobalThis.begin = init; globalThis.end = deinit;', pending);
const loading = pending.begin({ add() { throw new Error('Disposed scene created a node'); } });
pending.end();
finishFetch({ ok: true, json: async () => structuredClone(data) });
await loading;
assert.equal(pending.keyup, oldHandler);
assert.equal(pending.inputEvents.onPress, oldHandler);

// A new tab is opened synchronously while activation is still available.
const order = [], tab = { opener: {}, location: { replace: url => order.push(['url', url]) } };
openPaperInBrowser(paper.arxivUrl, {
   openWindow: (...args) => { order.push(['open', ...args]); return tab; },
   endSession: () => order.push(['end']), navigate: () => assert.fail('Unexpected same-tab navigation'),
});
assert.equal(tab.opener, null);
assert.deepEqual(order.map(x => x[0]), ['open', 'url', 'end']);
let resolveEnd, navigated = null;
openPaperInBrowser(paper.arxivUrl, {
   openWindow: () => null,
   endSession: () => new Promise(resolve => resolveEnd = resolve),
   navigate: url => navigated = url,
});
assert.equal(navigated, null, 'blocked popup waits for immersive session to end');
resolveEnd(); await new Promise(resolve => setImmediate(resolve));
assert.equal(navigated, paper.arxivUrl, 'blocked popup falls back to the original URL in this tab');
assert.equal(openPaperInBrowser('javascript:alert(1)', {}), false);
console.log('Spatial literature: dataset, layout, filters, late join, VR/mouse selection and dragging, native XR original-link opening, popup fallback, desktop preview, navigation and cleanup passed.');
