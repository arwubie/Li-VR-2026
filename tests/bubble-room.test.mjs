import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { initialRoom, applyAction, stepRoom, heldBubble, LO, HI, LIMIT } from '../js/util/bubble-room.mjs';
import { BubbleSession } from '../js/util/bubble-room-sync.mjs';

const grab = (s, b, actor, hand, now = 1000) => applyAction(s, { op: 'grab', id: b.id, hand, pos: [...b.p] }, actor, now);

test('two different people merge held bubbles into a discrete color and keep one grab', () => {
   const s = initialRoom(), a = s.bubbles[0], b = s.bubbles[1];
   assert.equal(grab(s, a, 'A', 'left'), true);
   assert.equal(grab(s, b, 'B', 'right'), true);
   applyAction(s, { op: 'move', hand: 'left', pos: [...b.p] }, 'A', 1033);
   assert.equal(s.bubbles.length, 23);
   assert.equal(a.mask, 3);
   assert.equal(heldBubble(s, 'A', 'left'), a);
   assert.equal(heldBubble(s, 'B', 'right'), undefined);
   assert.equal(applyAction(s, { op: 'move', hand: 'right', pos: [0, 1, 0] }, 'B', 1066), false);
   applyAction(s, { op: 'release', hand: 'left' }, 'A', 1100);
   assert.equal(a.owner, null);
});

test('same person can mix with two hands, and three pigments give pearl regardless of order', () => {
   const s = initialRoom(), a = s.bubbles[0], b = s.bubbles[1], c = s.bubbles[2];
   grab(s, a, 'A', 'left'); grab(s, b, 'A', 'right');
   applyAction(s, { op: 'move', hand: 'left', pos: [...b.p] }, 'A', 1033);
   grab(s, c, 'A', 'right', 1066);
   applyAction(s, { op: 'move', hand: 'left', pos: [...c.p] }, 'A', 1100);
   assert.equal(a.mask, 7);
   assert.ok(a.r <= .245);
});

test('free-floating collisions bounce without merging; all spheres remain in bounds', () => {
   const s = initialRoom();
   s.bubbles[0].p = [0, 1, 0]; s.bubbles[1].p = [.05, 1, 0];
   s.bubbles[0].v = [.5, 0, 0]; s.bubbles[1].v = [-.5, 0, 0];
   for (let i = 0; i < 1200; i++) stepRoom(s, 1 / 60, 1000 + i * 1000 / 60);
   assert.equal(s.bubbles.length, 24);
   for (const b of s.bubbles) for (let j = 0; j < 3; j++) {
      assert.ok(b.p[j] >= LO[j] + b.r - 1e-8);
      assert.ok(b.p[j] <= HI[j] - b.r + 1e-8);
      assert.ok(Number.isFinite(b.v[j]));
   }
});

test('grab locks, invalid movement, release leases and generator bounds', () => {
   const s = initialRoom(), a = s.bubbles[0];
   grab(s, a, 'A', 'left');
   assert.equal(grab(s, a, 'B', 'right'), false);
   assert.equal(applyAction(s, { op: 'move', hand: 'left', pos: [NaN, 1, 0] }, 'A', 1050), false);
   stepRoom(s, .02, 3000); assert.equal(a.owner, null);
   applyAction(s, { op: 'size', source: 1, value: 1 }, 'B', 3010);
   applyAction(s, { op: 'spawn', source: 1 }, 'B', 3020);
   assert.equal(s.bubbles.at(-1).r, .19);
   assert.equal(s.bubbles.at(-1).mask, 2);
   for (let i = 0; i < 100; i++) applyAction(s, { op: 'spawn', source: 0 }, 'B', 3030);
   assert.equal(s.bubbles.length, LIMIT);
});

test('swept drag merges across a bubble even when neither endpoint overlaps', () => {
   const s = initialRoom(); s.bubbles = s.bubbles.slice(0, 2);
   const [a, b] = s.bubbles; a.p = [-.6, 1.4, 0]; b.p = [0, 1.4, 0];
   grab(s, a, 'A', 'left'); grab(s, b, 'B', 'right');
   applyAction(s, { op: 'move', hand: 'left', pos: [.6, 1.4, 0] }, 'A', 1033);
   assert.equal(s.bubbles.length, 1); assert.equal(a.mask, 3);
});

test('wall rebounds preserve speed and ball collisions rebound almost elastically', () => {
   const s = initialRoom(); s.bubbles = s.bubbles.slice(0, 1);
   const a = s.bubbles[0]; a.p = [HI[0] - a.r - .001, 1.5, 0]; a.v = [.8, 0, 0];
   stepRoom(s, .02, 1000);
   assert.ok(a.v[0] < -.79);
   const b = initialRoom().bubbles[1]; s.bubbles.push(b);
   a.p = [-a.r + .002, 1.5, 0]; b.p = [b.r - .002, 1.5, 0];
   a.v = [.6, 0, 0]; b.v = [-.6, 0, 0];
   stepRoom(s, .01, 1000);
   assert.ok(a.v[0] < -.56); assert.ok(b.v[0] > .56);
});

test('initial drift is visible and a stationary bubble resumes moving', () => {
   const s = initialRoom();
   assert.ok(s.bubbles.every(b => Math.hypot(...b.v) > .25));
   s.bubbles = s.bubbles.slice(0, 1); s.bubbles[0].v = [0, 0, 0];
   for (let i = 0; i < 120; i++) stepRoom(s, 1 / 60, 1000 + i * 1000 / 60);
   assert.ok(Math.hypot(...s.bubbles[0].v) > .23);
});

// Real course transport: verify batching, local echoes and snapshots rather than a fake direct reducer.
function connect() {
   const source = fs.readFileSync(new URL('../server/client.js', import.meta.url), 'utf8');
   const packets = [], peers = [];
   for (let id = 0; id < 2; id++) {
      const ctx = vm.createContext({ name: '', console, Date, clients: [0, 1], clientID: id, isMasterClient: () => id === 0 });
      ctx.window = ctx; vm.runInContext(source, ctx);
      vm.runInContext('Server = ' + vm.runInContext('Server.toString()', ctx).replace('this.connectSocket(wsPort);', ''), ctx);
      ctx.server = vm.runInContext('new Server()', ctx); ctx.server.neverLoadOrSave();
      ctx.server.broadcastObject = packet => packets.push({ id, packet: structuredClone(packet) });
      ctx.server.init('bubbles', {});
      peers.push({ ctx, session: new BubbleSession(id ? 'B' : 'A', 0) });
   }
   let now = 800;
   const tick = () => {
      now += 34;
      for (const { ctx, session } of peers) {
         ctx.server.send('bubbles', { kind: 'hello', actor: session.actor });
         ctx.server.sync('bubbles', messages => {
            for (const m of Object.values(messages)) session.receive(m, now);
         });
         if (session.tick(.034, now)) ctx.server.send('bubbles', session.snapshot());
      }
      for (const { id, packet } of packets.splice(0)) peers[1 - id].ctx[packet.global] = packet.value;
   };
   const send = (i, action) => {
      const peer = peers[i], m = peer.session.command(action); peer.ctx.server.send('bubbles', m); return m;
   };
   return { peers, tick, send };
}

test('two clients through Server.send/sync: simultaneous grab, remote widgets, fusion, late join and stale snapshots', () => {
   const { peers, tick, send } = connect();
   for (let i = 0; i < 8; i++) tick();
   const a = peers[0].session.state.bubbles[0];
   send(0, { op: 'grab', id: a.id, hand: 'left', pos: [...a.p] });
   send(1, { op: 'grab', id: a.id, hand: 'right', pos: [...a.p] });
   for (let i = 0; i < 5; i++) tick();
   assert.equal(peers[0].session.state.bubbles[0].owner, 'A');
   const b = peers[1].session.state.bubbles[1];
   send(1, { op: 'grab', id: b.id, hand: 'right', pos: [...b.p] });
   for (let i = 0; i < 5; i++) tick();
   send(1, { op: 'move', hand: 'right', pos: [...peers[0].session.state.bubbles[0].p] });
   send(1, { op: 'size', source: 2, value: .9 });
   send(1, { op: 'spawn', source: 2 });
   for (let i = 0; i < 6; i++) tick();
   assert.equal(peers[0].session.state.bubbles.length, 24);
   assert.equal(peers[1].session.state.bubbles.length, 24);
   assert.equal(peers[1].session.state.sizes[2], .9);
   assert.equal(peers[0].session.state.mix.mask, 3);
   assert.equal(peers[1].session.state.mix.mask, 3);
   const snap = peers[0].session.snapshot();
   const late = new BubbleSession('C', 0); late.receive(snap, 2000);
   assert.deepEqual(late.state, snap.state);
   late.receive({ ...snap, seq: snap.seq - 1, state: initialRoom() }, 2010);
   assert.deepEqual(late.state, snap.state);
   // A heartbeat timeout promotes B with its last received world.
   const survivor = peers[1].session;
   assert.equal(survivor.tick(.02, 9000), true);
   assert.equal(survivor.leader, 'B');
   assert.equal(survivor.state.sizes[2], .9);
});
