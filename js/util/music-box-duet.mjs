import { MINI_SCALE, WALK_RADIUS, segmentDistance } from './living-music-box.mjs';
export { assignRoles, stagePose, validMatrix } from './catch-the-ballerina.mjs';

export const WIND_REQUIRED = Math.PI;
export const KEY_POSITION = [.285, -.032, 0];
export const BELL_NAMES = ['MELODY', 'CHIMES', 'HARMONY', 'BELLS'];
export function generateMelody(random = Math.random) {
   const notes = [0, 1, 2, 3];
   for (let i = 3; i > 0; i--) {
      const j = Math.max(0, Math.min(i, Math.floor(random() * (i + 1))));
      [notes[i], notes[j]] = [notes[j], notes[i]];
   }
   return notes;
}
export function initialDuet() {
   return { schema: 1, host: null, roles: {}, round: 0, phase: 'waiting', sequence: [],
      progress: 0, mistakes: 0, serial: 0, feedback: [], acks: {}, sessions: {}, reason: '' };
}
export function interruptDuet(state, reason = 'Partner disconnected - wind again when ready') {
   return { ...state, phase: 'waiting', sequence: [], progress: 0, sessions: {}, reason };
}
// The outbox is resent until acknowledged. Require contiguous IDs so delayed or
// repeated snapshots cannot lose or double-apply a note, including on host handoff.
export function applyDuetEvent(state, actor, event, context = {}) {
   if (!event || !Number.isSafeInteger(event.id) || event.id < 1 || typeof event.session !== 'string') return state;
   const key = `${actor}:${event.session}`, last = state.acks[key] || 0;
   if (event.id !== last + 1) return state;
   let next = { ...state, acks: { ...state.acks, [key]: event.id } };
   if (event.round !== state.round || !context.ready) return next;
   if (event.type === 'wind' && actor === state.roles.giant && state.phase !== 'active'
       && Number.isFinite(event.angle) && event.angle >= WIND_REQUIRED) {
      return { ...next, round: state.round + 1, phase: 'active', sequence: generateMelody(context.random),
         progress: 0, mistakes: 0, sessions: { ...context.sessions }, reason: '' };
   }
   if (event.type !== 'bell' || actor !== state.roles.ballerina || state.phase !== 'active'
       || !context.contact || !Number.isInteger(event.bell) || event.bell < 0 || event.bell > 3
       || state.sessions[actor] !== event.session) return next;
   const correct = event.bell === state.sequence[state.progress];
   const progress = correct ? state.progress + 1 : 0;
   const kind = progress === 4 ? 'victory' : correct ? 'correct' : 'mistake';
   const feedback = { serial: state.serial + 1, bell: event.bell, kind, hand: event.hand, round: state.round };
   return { ...next, progress, phase: progress === 4 ? 'won' : 'active',
      mistakes: state.mistakes + Number(!correct), serial: feedback.serial,
      feedback: [...state.feedback, feedback].slice(-32), reason: correct ? '' : 'Wrong note - start again at note 1' };
}
const validPoint = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
// Validate the same tip sweep used by HW7. Also require the miniature performer
// to approach the bell rather than touching from across the stage.
export function validBellContact(event, center) {
   const { tip, previousTip, head } = event.contact || {};
   if (!validPoint(tip) || !validPoint(previousTip) || !validPoint(head) || !validPoint(center)) return false;
   if (!['left', 'right'].includes(event.hand)) return false;
   if (Math.hypot(head[0], head[2]) > WALK_RADIUS + .002) return false;
   if (Math.hypot(head[0] - center[0], head[2] - center[2]) > .10) return false;
   if (Math.hypot(...tip.map((v, i) => v - head[i])) > .13) return false;
   const gap = Math.hypot(...tip.map((v, i) => v - center[i]));
   const travel = Math.hypot(...tip.map((v, i) => v - previousTip[i]));
   const sweep = travel < .35 * MINI_SCALE ? segmentDistance(center, previousTip, tip) : gap;
   return Math.min(gap, sweep) < .027 + .014 * MINI_SCALE;
}
export function sequenceForRole(state, role) {
   return role === 'giant' ? state.sequence.map(i => BELL_NAMES[i]) : [];
}
