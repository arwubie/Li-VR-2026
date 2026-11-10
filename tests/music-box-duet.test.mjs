import test from 'node:test';
import assert from 'node:assert/strict';
import { duetScene, network, cg, near } from './hw8-harness.mjs';
import { SOURCES } from '../js/util/living-music-box.mjs';
import { initialDuet, applyDuetEvent, generateMelody, sequenceForRole, validBellContact,
   WIND_REQUIRED, KEY_POSITION, stagePose } from '../js/util/music-box-duet.mjs';
const GAME = 'hw8DuetGame', PLAYERS = 'hw8DuetPlayers';
const frames = (a, b, count = 20) => { for (let i = 0; i < count; i++) { a.frame(); b.frame(); } };
async function pair(reverse = false, room = cg.mIdentity()) {
   const net = network(), a = await duetScene(0, net, room, reverse), b = await duetScene(1, net, room, !reverse);
   frames(a, b);
   return { net, giant: reverse ? b : a, dancer: reverse ? a : b };
}
function wind(giant, dancer) {
   giant.key('k'); frames(giant, dancer, 80); giant.release('k'); frames(giant, dancer);
   assert.equal(giant.env[GAME].phase, 'active');
}
function tap(giant, dancer, bell, hand = 'right') {
   const hands = hand === 'both' ? ['left', 'right'] : [hand];
   const center = SOURCES[bell].p.map((v, i) => v - (i === 1 ? .005 : 0));
   // Move the tracked head to the bell, then touch with the actual raw controller
   // tip. These are real HW7 transformations and collision callbacks, not injected notes.
   for (const h of hands) dancer.controllerMatrix[h] = cg.mTranslate(5, 5, 5);
   dancer.headMatrix.splice(0, 16, ...cg.mTranslate(cg.mTransform(dancer.box.getGlobalMatrix(), [center[0], .14, center[2]])));
   frames(giant, dancer, 20);
   const raw = cg.mMultiply(dancer.box.getGlobalMatrix(), cg.mTranslate(center));
   for (let i = 0; i < 12; i++) raw[i] /= 12;
   for (const h of hands) dancer.controllerMatrix[h] = cg.mMultiply(raw, cg.mTranslate(0, .02, .075));
   frames(giant, dancer, 10);
}
const seed = () => ({ ...initialDuet(), roles: { giant: 0, ballerina: 1 } });
const ready = { ready: true, sessions: { 0: 'g', 1: 'b' }, random: () => .99, contact: true };
const startEvent = { type: 'wind', id: 1, round: 0, session: 'g', angle: WIND_REQUIRED };
const note = (id, bell) => ({ type: 'bell', id, round: 1, session: 'b', bell, hand: 'right' });

test('melodies are random four-bell permutations and the performer receives no sequence UI', () => {
   assert.deepEqual(generateMelody(() => .99), [0, 1, 2, 3]);
   assert.notDeepEqual(generateMelody(() => 0), generateMelody(() => .99));
   for (let i = 0; i < 100; i++) assert.deepEqual(generateMelody().toSorted(), [0, 1, 2, 3]);
   const s = { ...initialDuet(), sequence: [0, 1, 2, 3] };
   assert.equal(sequenceForRole(s, 'giant').length, 4);
   assert.deepEqual(sequenceForRole(s, 'ballerina'), []); assert.deepEqual(sequenceForRole(s, 'spectator'), []);
});

test('only Giant winding starts; only Ballerina contact plays; mistakes reset the same melody', () => {
   assert.equal(applyDuetEvent(seed(), 1, { ...startEvent, session: 'b' }, ready).phase, 'waiting');
   assert.equal(applyDuetEvent(seed(), 0, startEvent, { ...ready, ready: false }).phase, 'waiting');
   let s = applyDuetEvent(seed(), 0, startEvent, ready);
   assert.equal(s.phase, 'active'); assert.deepEqual(s.sequence, [0, 1, 2, 3]);
   s = applyDuetEvent(s, 0, { ...note(2, 0), session: 'g' }, ready); assert.equal(s.progress, 0);
   s = applyDuetEvent(s, 1, note(1, 0), ready); assert.equal(s.progress, 1);
   s = applyDuetEvent(s, 1, note(2, 3), ready); assert.equal(s.progress, 0); assert.equal(s.mistakes, 1);
   assert.deepEqual(s.sequence, [0, 1, 2, 3]); assert.equal(s.feedback.at(-1).kind, 'mistake');
   for (let i = 0; i < 4; i++) s = applyDuetEvent(s, 1, note(i + 3, i), ready);
   assert.equal(s.phase, 'won'); assert.equal(s.progress, 4); assert.equal(s.feedback.at(-1).kind, 'victory');
   const restart = applyDuetEvent(s, 0, { ...startEvent, id: 3, round: 1 }, ready);
   assert.equal(restart.round, 2); assert.equal(restart.progress, 0); assert.equal(restart.phase, 'active');
});

test('acknowledgements reject duplicates, hold out-of-order events, and reject stale rounds', () => {
   let s = applyDuetEvent(seed(), 0, startEvent, ready);
   const unchanged = applyDuetEvent(s, 1, note(2, 1), ready); assert.equal(unchanged, s);
   s = applyDuetEvent(s, 1, note(1, 0), ready); assert.equal(s.progress, 1);
   assert.equal(applyDuetEvent(s, 1, note(1, 0), ready), s);
   s = applyDuetEvent(s, 1, note(2, 1), ready); assert.equal(s.progress, 2);
   s = applyDuetEvent(s, 1, { ...note(3, 2), round: 0 }, ready); assert.equal(s.progress, 2);
   s = applyDuetEvent(s, 1, note(4, 2), { ...ready, contact: false }); assert.equal(s.progress, 2);
});

test('bell evidence requires approach, real tip contact and valid swept motion', () => {
   const p = SOURCES[0].p.map((v, i) => v - (i === 1 ? .005 : 0));
   const event = { hand: 'right', contact: { head: [0, .14, -.165], tip: p, previousTip: p } };
   assert.equal(validBellContact(event, p), true);
   assert.equal(validBellContact({ ...event, contact: { ...event.contact, head: [0, .14, .1] } }, p), false);
   assert.equal(validBellContact({ ...event, contact: { ...event.contact, tip: [.1, .07, -.165] } }, p), false);
   assert.equal(validBellContact({ ...event, hand: null }, p), false);
   assert.equal(validBellContact({ ...event, contact: { ...event.contact, head: [NaN, 0, 0] } }, p), false);
});

test('computer and VR get stable roles in either join order; Enter and A/X cannot start', async () => {
   for (const reverse of [false, true]) {
      const { net, giant, dancer } = await pair(reverse);
      assert.equal(giant.env[GAME].roles.giant, giant.env.clientID);
      assert.equal(giant.env[GAME].roles.ballerina, dancer.env.clientID);
      giant.key('Enter'); dancer.key('Enter'); dancer.key('k');
      dancer.env.buttonState.right[4] = { pressed: true }; frames(giant, dancer, 90);
      dancer.release('k'); assert.equal(giant.env[GAME].phase, 'waiting');
      wind(giant, dancer);
      net.ids.reverse(); frames(giant, dancer);
      assert.equal(dancer.env[GAME].roles.ballerina, dancer.env.clientID);
      assert.equal(giant.env[GAME].phase, 'active');
   }
});

test('dragging the actual gold key starts and animates one shared round', async () => {
   const { giant, dancer } = await pair();
   giant.mouse('mousedown', { clientX: -100, clientY: -100 });
   giant.mouse('mousemove', { clientX: 300, clientY: -100 }); giant.mouse('mouseup', {});
   frames(giant, dancer); assert.equal(giant.env[GAME].round, 0);
   giant.dragKey(150); frames(giant, dancer);
   assert.equal(giant.env[GAME].phase, 'active'); assert.equal(dancer.env[GAME].round, 1);
   frames(giant, dancer, 100); assert.equal(giant.env[GAME].round, 1);
});

test('Giant sees four named colored notes and Ballerina cannot see that panel', async () => {
   const { giant, dancer } = await pair(); wind(giant, dancer);
   const secret = s => s.nodes.filter(n => /^[1-4]\. (MELODY|CHIMES|HARMONY|BELLS)$/.test(n.text || ''));
   assert.equal(secret(giant).length, 4); assert.equal(secret(dancer).length, 0);
   assert.equal(JSON.stringify(giant.env[GAME].sequence), JSON.stringify(dancer.env[GAME].sequence));
   giant.key('1'); dancer.key('1'); frames(giant, dancer); assert.equal(giant.env[GAME].progress, 0);
   assert.equal(giant.strikes.length, 0); assert.equal(dancer.strikes.length, 0);
});

test('physical VR bell contact advances once; resting, duplicate outboxes and both hands do not double count', async () => {
   const { giant, dancer } = await pair(); wind(giant, dancer);
   const first = giant.env[GAME].sequence[0]; tap(giant, dancer, first, 'both');
   assert.equal(giant.env[GAME].progress, 1); assert.equal(dancer.env[GAME].progress, 1);
   frames(giant, dancer, 50);
   assert.equal(giant.env[GAME].progress, 1); assert.equal(giant.env[GAME].mistakes, 0);
   assert.equal(giant.env[GAME].serial, 1);
   const serial = giant.env[GAME].serial;
   frames(giant, dancer, 60); assert.equal(giant.env[GAME].serial, serial);
});

test('mistake resets progress; both players hear and see the same successful duet', async () => {
   const { giant, dancer } = await pair(); wind(giant, dancer);
   const notes = [...giant.env[GAME].sequence];
   tap(giant, dancer, notes[0]); assert.equal(giant.env[GAME].progress, 1);
   tap(giant, dancer, notes[3]); assert.equal(giant.env[GAME].progress, 0);
   assert.equal(giant.env[GAME].mistakes, 1); assert.equal(dancer.env[GAME].mistakes, 1);
   assert.ok(giant.cues.some(c => c[0] === 'mistake')); assert.ok(dancer.cues.some(c => c[0] === 'mistake'));
   for (const bell of notes) tap(giant, dancer, bell);
   assert.equal(giant.env[GAME].phase, 'won'); assert.equal(dancer.env[GAME].phase, 'won');
   assert.equal(giant.env[GAME].progress, 4); assert.equal(dancer.env[GAME].progress, 4);
   assert.equal(giant.strikes.length, 6); assert.equal(dancer.strikes.length, 6);
   assert.ok(giant.cues.some(c => c[0] === 'victory')); assert.ok(dancer.cues.some(c => c[0] === 'victory'));
   assert.ok(dancer.haptics.length); wind(giant, dancer);
   assert.equal(giant.env[GAME].round, 2); assert.equal(giant.env[GAME].progress, 0);
});

test('full cartoon Giant has head, coat, two legs, shoes, arms and tracked gloves at 12:1 scale', async () => {
   const { giant, dancer } = await pair();
   const cartoon = dancer.box.children.find(n => n.children.length === 8 && n.children[1]?.children.length === 10);
   assert.ok(cartoon); assert.ok(cartoon.children[0].children.length >= 13);
   const head = cartoon.children[1];
   near([Math.hypot(...head.getMatrix().slice(0, 3))], [1]);
   const mini = stagePose(cg, giant.env[PLAYERS][dancer.env.clientID].toStage, dancer.env.clientState.head(dancer.env.clientID));
   near([Math.hypot(...head.getMatrix().slice(0, 3)) / Math.hypot(...mini.slice(0, 3))], [12]);
   near(cg.mMultiply(giant.box.getGlobalMatrix(), head.getMatrix()), giant.headMatrix);
   assert.equal(giant.audioPositions.length, 4); assert.equal(dancer.audioPositions.length, 4);
   near([cg.distance(dancer.audioPositions[0], dancer.audioPositions[2])], [12 * cg.distance(giant.audioPositions[0], giant.audioPositions[2])]);
   for (const n of dancer.nodes) assert.ok(n.getMatrix().every(Number.isFinite));
});

test('box translation/rotation keeps duet contact, key picking and calibrated avatars consistent', async () => {
   const room = cg.mMultiply(cg.mTranslate(.2, .1, -.3), cg.mRotateY(.4));
   const { giant, dancer } = await pair(false, room);
   giant.env.clay.inverseRootMatrix = cg.mInverse(room); dancer.env.clay.inverseRootMatrix = cg.mInverse(room);
   giant.key('arrowright'); giant.key('q'); frames(giant, dancer, 25);
   giant.release('arrowright'); giant.release('q'); frames(giant, dancer);
   near(giant.box.getMatrix(), dancer.box.getMatrix());
   giant.dragKey(150); frames(giant, dancer);
   assert.equal(giant.env[GAME].phase, 'active');
   tap(giant, dancer, giant.env[GAME].sequence[0]); assert.equal(giant.env[GAME].progress, 1);
});

test('disconnects and stale participants interrupt safely; no solo round; cleanup releases inputs/audio', async () => {
   const { net, giant, dancer } = await pair(); wind(giant, dancer);
   for (let i = 0; i < 150; i++) giant.frame();
   assert.equal(giant.env[GAME].phase, 'waiting'); frames(giant, dancer);
   wind(giant, dancer); net.disconnect(dancer.env.clientID); giant.frame();
   assert.equal(giant.env[GAME].phase, 'waiting');
   giant.key('k'); for (let i = 0; i < 100; i++) giant.frame(); giant.release('k');
   assert.equal(giant.env[GAME].phase, 'waiting');
   giant.env.end(); dancer.env.end();
   assert.equal(giant.listeners.size, 0); assert.equal(giant.canvasListeners.size, 0);
   assert.equal(dancer.listeners.size, 0); assert.equal(giant.stopped(), true); assert.equal(dancer.stopped(), true);
});

test('two XR clients can twist the winding key without grabbing the entire box; Giant contact cannot play bells', async () => {
   const net = network(), giant = await duetScene(0, net), dancer = await duetScene(1, net);
   frames(giant, dancer);
   const box = giant.box.getMatrix().slice();
   const markerOffset = cg.mMultiply(cg.mTranslate(0, -.049, -.079), cg.mRotateX(-Math.PI / 4));
   const atKey = angle => cg.mMultiply(giant.box.getGlobalMatrix(), cg.mMultiply(cg.mTranslate(KEY_POSITION), cg.mMultiply(cg.mRotateX(angle), cg.mInverse(markerOffset))));
   giant.controllerMatrix.right = atKey(0);
   giant.env.buttonState.right[0] = { pressed: true }; giant.env.inputEvents.onPress('right');
   frames(giant, dancer, 4);
   for (let i = 1; i <= 9; i++) { giant.controllerMatrix.right = atKey(i * .4); frames(giant, dancer, 4); }
   giant.env.buttonState.right[0].pressed = false; giant.env.inputEvents.onRelease('right'); frames(giant, dancer);
   assert.equal(giant.env[GAME].phase, 'active'); near(giant.box.getMatrix(), box);
   giant.controllerMatrix.right = cg.mMultiply(giant.box.getGlobalMatrix(), cg.mTranslate(0, .09, -.165));
   frames(giant, dancer);
   assert.equal(giant.env[GAME].progress, 0); assert.equal(giant.env[GAME].serial, 0);
   assert.equal(giant.strikes.length, 0);
});

test('authority handoff and repeated metadata cannot replay an already acknowledged note', async () => {
   const { net, giant, dancer } = await pair(); wind(giant, dancer);
   const bell = giant.env[GAME].sequence[0]; tap(giant, dancer, bell);
   const session = dancer.env[PLAYERS][1].session;
   const duplicate = { ...note(1, bell), session };
   giant.env[PLAYERS][1].events = [duplicate, duplicate]; giant.frame();
   assert.equal(giant.env[GAME].progress, 1); assert.equal(giant.env[GAME].serial, 1);
   net.ids.reverse(); frames(giant, dancer);
   dancer.env[PLAYERS][1].events = [duplicate]; dancer.frame();
   frames(giant, dancer);
   assert.equal(dancer.env[GAME].host, 1); assert.equal(dancer.env[GAME].progress, 1);
   assert.equal(dancer.env[GAME].serial, 1);
   for (const i of giant.env[GAME].sequence.slice(1)) tap(giant, dancer, i);
   assert.equal(giant.env[GAME].phase, 'won'); assert.equal(dancer.env[GAME].phase, 'won');
});

test('missing hands remain finite; restarting the same client session interrupts safely', async () => {
   const { net, giant, dancer } = await pair(); wind(giant, dancer);
   net.clientState.hand = () => null; frames(giant, dancer);
   for (const s of [giant, dancer]) for (const n of s.nodes) assert.ok(n.getMatrix().every(Number.isFinite));
   assert.equal(giant.env[GAME].progress, 0);
   dancer.env.end(); const replacement = await duetScene(1, net); frames(giant, replacement);
   assert.equal(giant.env[GAME].phase, 'waiting'); assert.equal(giant.env[GAME].sequence.length, 0);
});

test('both remote avatars retain head/hand rotations, room motion and miniature locomotion', async () => {
   const { giant, dancer } = await pair();
   const original = stagePose(cg, giant.env[PLAYERS][1].toStage, dancer.env.clientState.head(1));
   dancer.headMatrix[12] += .12;
   dancer.headMatrix.splice(0, 16, ...cg.mMultiply(dancer.headMatrix, cg.mMultiply(cg.mRotateY(.5), cg.mRotateX(.2))));
   dancer.env.joyStickState.left.y = -1; frames(giant, dancer, 100); dancer.env.joyStickState.left.y = 0; frames(giant, dancer);
   const remote = stagePose(cg, giant.env[PLAYERS][1].toStage, dancer.env.clientState.head(1));
   assert.ok(cg.distance(original.slice(12, 15), remote.slice(12, 15)) > .03);
   const face = giant.box.children.find(n => n.children.length === 6 && n.children[0].getMatrix()[0] === .115);
   assert.ok(face); near(face.getMatrix(), remote);
   const hands = giant.box.children.filter(n => n.children.length === 2 && n.children[0].getMatrix()[0] === .065);
   assert.equal(hands.length, 2);
   near(hands[1].getMatrix(), stagePose(cg, giant.env[PLAYERS][1].toStage, dancer.env.clientState.hand(1, 'right')));
   giant.headMatrix.splice(0, 16, ...cg.mMultiply(giant.headMatrix, cg.mMultiply(cg.mRotateY(.7), cg.mRotateX(-.2))));
   frames(giant, dancer);
   const cartoon = dancer.box.children.find(n => n.children.length === 8 && n.children[1]?.children.length === 10);
   near(cg.mMultiply(giant.box.getGlobalMatrix(), cartoon.children[1].getMatrix()), giant.headMatrix);
   near([Math.hypot(...cartoon.children[1].getMatrix().slice(0, 3))], [1]);
});
