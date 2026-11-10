import test from 'node:test';
import assert from 'node:assert/strict';
import { scene, network, cg, near } from './hw8-harness.mjs';
import { assignRoles, beginRound, newRoundState, advanceRound, stagePose, catches } from '../js/util/catch-the-ballerina.mjs';
const GAME = 'hw8BallerinaGame', PLAYERS = 'hw8BallerinaPlayers';
const settle = (a, b, n = 20, ms = 16) => { for (let i = 0; i < n; i++) { a.frame(ms); b.frame(ms); } };
async function pair() {
   const net = network(), a = await scene(0, net), b = await scene(1, net);
   // Keep human hands away until a test intentionally reaches into the box.
   a.controllerMatrix.left = cg.mTranslate(-.5, 1.3, .3);
   a.controllerMatrix.right = cg.mTranslate(.5, 1.3, .3);
   settle(a, b);
   return { net, a, b };
}
const visibleMarkerAt = p => cg.mMultiply(cg.mTranslate(p), cg.mInverse(cg.mMultiply(cg.mTranslate(0, -.049, -.079), cg.mRotateX(-Math.PI / 4))));
const start = (a, b) => { a.key('Enter'); settle(a, b, 240); assert.equal(a.env[GAME].phase, 'active'); };

test('stable distinct roles, spectator and safe missing participants', () => {
   assert.deepEqual(assignRoles({}, [0, 1]), { giant: 0, ballerina: 1 });
   assert.deepEqual(assignRoles({ giant: 0, ballerina: 1 }, [2, 1, 0]), { giant: 0, ballerina: 1 });
   assert.deepEqual(assignRoles({ giant: 0, ballerina: 1 }, [1, 2]), { giant: 2, ballerina: 1 });
   assert.equal(beginRound(newRoundState()).phase, 'waiting');
});

test('one authority decides countdown, deadline, catch, duplicates and restart', () => {
   let s = beginRound({ ...newRoundState(), roles: { giant: 0, ballerina: 1 } });
   assert.equal(advanceRound(s, 2, { ready: false }).countdown, 3);
   s = advanceRound(s, 3); assert.equal(s.phase, 'active');
   s = advanceRound(s, 1, { caught: true }); assert.equal(s.winner, 'giant');
   assert.deepEqual(advanceRound(s, 30, { caught: true }), s);
   s = beginRound(s); assert.equal(s.round, 2); assert.equal(s.winner, null);
   s = advanceRound(s, 3); s = advanceRound(s, 30, { caught: true });
   assert.equal(s.winner, 'ballerina'); assert.equal(s.remaining, 0);
   s = beginRound(s); assert.equal(advanceRound(s, 0, { connected: false }).phase, 'waiting');
});

test('two clients render correct tracked remote head and hands at both scales', async () => {
   const { net, a, b } = await pair();
   assert.deepEqual(a.env[GAME].roles, { giant: 0, ballerina: 1 });
   assert.equal(JSON.stringify(a.env[GAME]), JSON.stringify(b.env[GAME]));
   near([Math.hypot(...a.box.getGlobalMatrix().slice(0, 3))], [1]);
   near([Math.hypot(...b.box.getGlobalMatrix().slice(0, 3))], [12]);
   b.headMatrix.splice(0, 16, ...cg.mMultiply(cg.mTranslate(.08, 1.7, .3), cg.mRotateY(.6)));
   settle(a, b);
   const meta = a.env[PLAYERS][1], remote = stagePose(cg, meta.toStage, net.clientState.head(1));
   const miniHead = a.box.children.find(n => n.children.length === 6 && n.children[0].form === 'sphere' && n.children[0].m[0] === .115);
   assert.ok(miniHead); near(miniHead.getMatrix(), remote);
   near([Math.hypot(...remote.slice(0, 3))], [1 / 12]);
   const giantHead = b.box.children.find(n => n.children.length === 3 && n.children[0].form === 'sphere' && n.children[0].m[0] === .1);
   assert.ok(giantHead);
   near(cg.mMultiply(b.box.getGlobalMatrix(), giantHead.getMatrix()), cg.mMultiply(b.world.getGlobalMatrix(), net.clientState.head(0)));
   const giantHands = b.box.children.filter(n => n.children.length === 1 && n.children[0].form === 'sphere' && n.children[0].m[0] === .02);
   assert.equal(giantHands.length, 2);
   near(giantHands[0].getMatrix(), stagePose(cg, b.env[PLAYERS][0].toStage, net.clientState.hand(0, 'left')));
   const initial = remote[14]; b.env.joyStickState.left.y = -1; settle(a, b, 100);
   assert.ok(a.env[PLAYERS][1].feet[2] < .025);
   assert.notEqual(stagePose(cg, a.env[PLAYERS][1].toStage, net.clientState.head(1))[14], initial);
   net.ids.reverse(); settle(a, b); assert.equal(a.env[GAME].roles.giant, 0);
   a.env.end(); b.env.end(); assert.equal(a.stopped(), true); assert.equal(b.stopped(), true);
});

test('translated rotated box and tracking origin retain scale and all pose rotations', () => {
   const box = cg.mMultiply(cg.mTranslate(.6, .9, -.2), cg.mRotateY(.8));
   const model = cg.mMultiply(cg.mTranslate(.2, 0, .4), cg.mRotateY(-.3));
   const anchor = cg.mTranslate(.3, 0, .2), feet = cg.mTranslate(.12, 0, -.07);
   const world = cg.mMultiply(anchor, cg.mMultiply(cg.mScale(12), cg.mMultiply(cg.mInverse(feet), cg.mInverse(box))));
   const rendered = cg.mMultiply(model, cg.mMultiply(world, box));
   const tracked = cg.mMultiply(cg.mTranslate(.4, 1.6, .5), cg.mMultiply(cg.mRotateY(.7), cg.mRotateX(.2)));
   const miniature = stagePose(cg, cg.mInverse(rendered), tracked);
   near(cg.mMultiply(rendered, miniature), tracked);
   near([Math.hypot(...miniature.slice(0, 3))], [1 / 12]);
   const giant = stagePose(cg, cg.mInverse(cg.mMultiply(model, box)), tracked);
   near(cg.mMultiply(cg.mMultiply(model, box), giant), tracked);
   near([Math.hypot(...giant.slice(0, 3))], [1]);
   assert.equal(stagePose(cg, null, tracked), null);
});

test('contact, near miss, fast sweep, moving target and tracking jump rejection', () => {
   const head = cg.mMultiply(cg.mTranslate(0, 1.7 / 12, 0), cg.mScale(1 / 12));
   assert.equal(catches(cg, head, cg.mTranslate(0, .14, 0)), true);
   assert.equal(catches(cg, head, cg.mTranslate(.10, .14, 0)), false);
   assert.equal(catches(cg, head, cg.mTranslate(.15, .14, 0), cg.mTranslate(-.15, .14, 0)), true);
   assert.equal(catches(cg, head, cg.mTranslate(2, .14, 0), cg.mTranslate(-2, .14, 0)), false);
   assert.equal(catches(cg, null, cg.mIdentity()), false);
   const before = head.slice(); before[12] = -.10;
   const after = head.slice(); after[12] = .10;
   assert.equal(catches(cg, after, cg.mTranslate(0, .14, 0), cg.mTranslate(0, .14, 0), before), true);
});

test('physical hand contact produces one shared win; restart resets position and timer', async () => {
   const { a, b } = await pair();
   start(a, b);
   const mini = stagePose(cg, a.env[PLAYERS][1].toStage, b.headMatrix);
   const world = cg.mTransform(a.box.getGlobalMatrix(), mini.slice(12, 15));
   a.controllerMatrix.right = visibleMarkerAt(world);
   settle(a, b, 10);
   assert.equal(a.env[GAME].winner, 'giant'); assert.equal(b.env[GAME].winner, 'giant');
   settle(a, b, 20); assert.equal(a.env[GAME].round, 1);
   assert.ok(a.haptics.length); assert.ok(b.haptics.length);
   a.controllerMatrix.right = cg.mTranslate(.5, 1.3, .3);
   b.key('Enter'); settle(a, b, 20);
   assert.equal(a.env[GAME].round, 2); assert.equal(a.env[GAME].phase, 'countdown');
   assert.equal(a.env[GAME].remaining, 30);
   near(b.env[PLAYERS][1].feet, [0, 0, .025]);
});

test('timeout is identical on both clients and missing player cancels safely', async () => {
   const { net, a, b } = await pair(); start(a, b);
   settle(a, b, 2000);
   assert.equal(a.env[GAME].winner, 'ballerina'); assert.equal(b.env[GAME].winner, 'ballerina');
   b.key('Enter'); settle(a, b, 40); net.disconnect(1); a.frame();
   assert.equal(a.env[GAME].phase, 'waiting'); assert.equal(a.env[GAME].winner, null);
   a.key('Enter'); for (let i = 0; i < 20; i++) a.frame();
   assert.equal(a.env[GAME].phase, 'waiting');
});

test('countdown ignores contact, locks grabs and preserves music sources', async () => {
   const { a, b } = await pair();
   a.key('Enter'); settle(a, b, 20); assert.equal(a.env[GAME].phase, 'countdown');
   const box = a.box.getMatrix().slice();
   a.controllerMatrix.right = cg.mMultiply(a.box.getGlobalMatrix(), cg.mTranslate(.23, -.04, .04));
   a.env.inputEvents.onPress('right'); a.controllerMatrix.right[12] += .2; settle(a, b, 10);
   near(a.box.getMatrix(), box); assert.equal(a.env[GAME].winner, null);
   assert.equal(a.audioPositions.length, 4); assert.equal(b.audioPositions.length, 4);
   const distance = s => cg.distance(s.audioPositions[1], s.audioPositions[3]);
   near([distance(b)], [12 * distance(a)]);
   a.key('m'); a.frame(); near([Math.hypot(...a.box.getGlobalMatrix().slice(0, 3))], [1]);
});

test('moving and rotating the shared box preserves remote poses and valid catches', async () => {
   const { a, b } = await pair();
   const initial = a.box.getMatrix().slice();
   a.controllerMatrix.right = cg.mMultiply(a.box.getGlobalMatrix(), cg.mTranslate(.23, -.04, .04));
   a.env.inputEvents.onPress('right');
   a.controllerMatrix.right = cg.mMultiply(cg.mTranslate(.13, .02, -.05), cg.mMultiply(a.controllerMatrix.right, cg.mRotateY(.5)));
   settle(a, b, 20); a.env.inputEvents.onRelease('right'); settle(a, b, 20);
   assert.notEqual(a.box.getMatrix()[12], initial[12]);
   near(a.box.getMatrix(), b.box.getMatrix());
   start(a, b);
   const head = stagePose(cg, a.env[PLAYERS][1].toStage, b.headMatrix);
   a.controllerMatrix.right = visibleMarkerAt(cg.mTransform(a.box.getGlobalMatrix(), head.slice(12, 15)));
   settle(a, b, 10);
   assert.equal(a.env[GAME].winner, 'giant'); assert.equal(b.env[GAME].winner, 'giant');
});

test('stale heartbeat and authority disconnect abort; replacement keeps the surviving role', async () => {
   const { net, a, b } = await pair(); start(a, b);
   // A socket may remain open after the participant stops animating their scene.
   for (let i = 0; i < 150; i++) a.frame();
   assert.equal(a.env[GAME].phase, 'waiting'); assert.equal(a.env[GAME].winner, null);
   settle(a, b, 20); a.key('Enter'); settle(a, b, 20);
   net.disconnect(0); for (let i = 0; i < 20; i++) b.frame();
   assert.equal(b.env[GAME].host, 1); assert.equal(b.env[GAME].phase, 'waiting');
   net.ids.push(2); const c = await scene(2, net); settle(b, c, 20);
   assert.equal(b.env[GAME].roles.ballerina, 1); assert.equal(b.env[GAME].roles.giant, 2);
   c.key('Enter'); settle(b, c, 240); assert.equal(b.env[GAME].phase, 'active');
});

test('computer Giant plays with the VR Ballerina while additional XR clients spectate', async () => {
   const net = network(), desktop = await scene(0, net, cg.mIdentity(), false);
   const a = await scene(1, net); settle(desktop, a, 20);
   net.ids.push(2); const b = await scene(2, net);
   for (let i = 0; i < 30; i++) { desktop.frame(); a.frame(); b.frame(); }
   assert.equal(desktop.env[GAME].roles.giant, 0); assert.equal(desktop.env[GAME].roles.ballerina, 1);
   desktop.key('Enter');
   for (let i = 0; i < 20; i++) { desktop.frame(); a.frame(); b.frame(); }
   assert.equal(desktop.env[GAME].phase, 'countdown');
   a.key('Enter');
   for (let i = 0; i < 240; i++) { desktop.frame(); a.frame(); b.frame(); }
   assert.equal(desktop.env[GAME].phase, 'active');
});

test('missing tracking hides hands with finite matrices and blocks false catches', async () => {
   const { net, a, b } = await pair();
   const hand = net.clientState.hand; net.clientState.hand = () => null;
   settle(a, b, 10);
   for (const s of [a, b]) for (const n of s.nodes) assert.ok(n.getMatrix().every(Number.isFinite));
   start(a, b); settle(a, b, 10); assert.equal(a.env[GAME].winner, null);
   net.clientState.hand = hand;
});

test('client list reordering preserves roles and the active round during authority handoff', async () => {
   const { net, a, b } = await pair(); start(a, b);
   const round = a.env[GAME].round, remaining = a.env[GAME].remaining;
   net.ids.reverse(); settle(a, b, 20);
   assert.equal(b.env[GAME].host, 1); assert.equal(b.env[GAME].phase, 'active');
   assert.equal(b.env[GAME].roles.giant, 0); assert.equal(b.env[GAME].roles.ballerina, 1);
   assert.equal(b.env[GAME].round, round); assert.ok(b.env[GAME].remaining < remaining);
});

test('actual scene bridges calibrated Clay tracking roots without double-transforming poses', async () => {
   const net = network(), room = cg.mMultiply(cg.mTranslate(.2, .1, -.3), cg.mRotateY(.4));
   const a = await scene(0, net, room), b = await scene(1, net, room);
   a.env.clay.inverseRootMatrix = cg.mInverse(room); b.env.clay.inverseRootMatrix = cg.mInverse(room);
   a.controllerMatrix.left = cg.mTranslate(-.5, 1.3, .3); a.controllerMatrix.right = cg.mTranslate(.5, 1.3, .3);
   b.headMatrix.splice(0, 16, ...cg.mMultiply(cg.mTranslate(.3, 1.7, .5), cg.mMultiply(cg.mRotateY(.8), cg.mRotateX(.2))));
   settle(a, b);
   const remote = stagePose(cg, a.env[PLAYERS][1].toStage, net.clientState.head(1));
   near(remote, cg.mMultiply(cg.mInverse(b.box.getGlobalMatrix()), b.headMatrix));
   near([Math.hypot(...remote.slice(0, 3))], [1 / 12]);
   start(a, b);
   const current = stagePose(cg, a.env[PLAYERS][1].toStage, net.clientState.head(1));
   a.controllerMatrix.right = visibleMarkerAt(cg.mTransform(a.box.getGlobalMatrix(), current.slice(12, 15)));
   settle(a, b, 10); assert.equal(a.env[GAME].winner, 'giant'); assert.equal(b.env[GAME].winner, 'giant');
});

test('reloading a participant on the same client ID aborts the old round', async () => {
   const { net, a, b } = await pair(); start(a, b);
   b.env.end(); const replacement = await scene(1, net); settle(a, replacement, 20);
   assert.equal(a.env[GAME].phase, 'waiting'); assert.equal(a.env[GAME].winner, null);
   assert.equal(a.env[GAME].roles.giant, 0); assert.equal(a.env[GAME].roles.ballerina, 1);
});

async function desktopPair(reverse = false) {
   const net = network();
   const first = await scene(0, net, cg.mIdentity(), reverse);
   const second = await scene(1, net, cg.mIdentity(), !reverse);
   settle(first, second);
   return { net, desktop: reverse ? second : first, vr: reverse ? first : second };
}

test('computer and one headset receive their device roles in either join order', async () => {
   for (const reverse of [false, true]) {
      const { net, desktop, vr } = await desktopPair(reverse);
      const giant = desktop.env.clientID, ballerina = vr.env.clientID;
      assert.equal(desktop.env[GAME].roles.giant, giant);
      assert.equal(desktop.env[GAME].roles.ballerina, ballerina);
      assert.equal(net.clientState.head(giant), null); // Desktop has no XR tracking.
      start(desktop, vr);
      near([Math.hypot(...vr.box.getGlobalMatrix().slice(0, 3))], [12]);
      assert.equal(vr.env[GAME].phase, 'active');
   }
});

test('mouse and wheel drive a visible shared hand and a contact catch without XR on the computer', async () => {
   const { desktop, vr } = await desktopPair(); start(desktop, vr);
   for (let i = 0; i < 5; i++) desktop.wheel(1); // .20 -> .14 m above the stage.
   desktop.mouseAt([0, .14, .025]);
   const before = desktop.env[PLAYERS][0].desktop.right.slice(12, 15);
   settle(desktop, vr, 4);
   const after = desktop.env[PLAYERS][0].desktop.right.slice(12, 15);
   assert.ok(cg.distance(before, after) < .03); // No cursor teleport/instant capture.
   assert.equal(desktop.env[GAME].winner, null);
   settle(desktop, vr, 120);
   assert.equal(desktop.env[GAME].winner, 'giant'); assert.equal(vr.env[GAME].winner, 'giant');
   const hand = vr.box.children.find(n => n.children.length === 1 && n.children[0].form === 'sphere'
      && n.children[0].m[0] === .02 && n.getMatrix()[0] !== 0);
   assert.ok(hand); near(hand.getMatrix(), desktop.env[PLAYERS][0].desktop.right);
   desktop.env.end(); vr.env.end();
   assert.equal(desktop.listeners.size, 0); assert.equal(desktop.canvasListeners.size, 0);
});

test('desktop keyboard moves the hand in three dimensions and keeps it in reach', async () => {
   const { desktop, vr } = await desktopPair();
   const before = desktop.env[PLAYERS][0].desktop.right.slice(12, 15);
   desktop.key('a'); desktop.key('w'); desktop.key('f'); settle(desktop, vr, 30);
   desktop.release('a'); desktop.release('w'); desktop.release('f');
   const after = desktop.env[PLAYERS][0].desktop.right.slice(12, 15);
   assert.ok(after.every((v, i) => v < before[i]));
   desktop.key('d'); desktop.key('r'); settle(desktop, vr, 300);
   desktop.release('d'); desktop.release('r');
   const bounded = desktop.env[PLAYERS][0].desktop.right.slice(12, 15);
   assert.ok(Math.hypot(bounded[0], bounded[2]) <= .32 + 1e-7);
   assert.ok(bounded[1] <= .25 + 1e-7);
});

test('computer/VR timeout, restart and disconnect share the same outcome', async () => {
   const { net, desktop, vr } = await desktopPair(); start(desktop, vr);
   settle(desktop, vr, 2000);
   assert.equal(desktop.env[GAME].winner, 'ballerina'); assert.equal(vr.env[GAME].winner, 'ballerina');
   vr.key('Enter'); settle(desktop, vr, 20);
   assert.equal(desktop.env[GAME].round, 2); assert.equal(desktop.env[GAME].phase, 'countdown');
   net.disconnect(0); for (let i = 0; i < 20; i++) vr.frame();
   assert.equal(vr.env[GAME].phase, 'waiting'); assert.equal(vr.env[GAME].winner, null);
});

test('two computers cannot start without the VR Ballerina', async () => {
   const net = network(), a = await scene(0, net, cg.mIdentity(), false), b = await scene(1, net, cg.mIdentity(), false);
   settle(a, b); a.key('Enter'); settle(a, b, 240);
   assert.equal(a.env[GAME].phase, 'waiting'); assert.equal(a.env[GAME].roles.ballerina, undefined);
});
