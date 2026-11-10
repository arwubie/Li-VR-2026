import { MINI_SCALE, segmentDistance } from './living-music-box.mjs';

export const ROUND_SECONDS = 30;
export const COUNTDOWN_SECONDS = 3;
export const HAND_RADIUS = .020; // Matches the visible course hand marker, in metres.
export const CONTACT_TOLERANCE = .002;
export const validMatrix = m => Array.isArray(m) && m.length === 16 && m.every(Number.isFinite);

// Preserve occupied slots even if the framework's client list changes order.
export function assignRoles(previous = {}, ids = [], xrByID = null) {
   if (xrByID) {
      const desktop = ids.filter(id => !xrByID[id]), xr = ids.filter(id => xrByID[id]);
      if (!desktop.length) return assignRoles(previous, xr);
      const giants = desktop.length ? desktop : xr;
      const giant = giants.includes(previous.giant) ? previous.giant : giants[0];
      const dancers = xr.filter(id => id !== giant);
      return { giant, ballerina: dancers.includes(previous.ballerina) ? previous.ballerina : dancers[0] };
   }
   const roles = {};
   for (const role of ['giant', 'ballerina'])
      if (ids.includes(previous[role])) roles[role] = previous[role];
   for (const role of ['giant', 'ballerina'])
      if (roles[role] === undefined) roles[role] = ids.find(id => !Object.values(roles).includes(id));
   return roles;
}
export function newRoundState() {
   return { version: 1, round: 0, roles: {}, phase: 'waiting', remaining: ROUND_SECONDS,
      countdown: COUNTDOWN_SECONDS, winner: null, reason: '', host: null };
}
export function beginRound(state) {
   if (state.roles.giant === undefined || state.roles.ballerina === undefined
       || ['active', 'countdown'].includes(state.phase)) return state;
   return { ...state, round: state.round + 1, phase: 'countdown', countdown: COUNTDOWN_SECONDS,
      remaining: ROUND_SECONDS, winner: null, reason: '' };
}
// Only the elected authority calls this reducer. Timeout takes precedence at the deadline.
export function advanceRound(state, dt, { connected = true, ready = true, caught = false } = {}) {
   if (!['active', 'countdown'].includes(state.phase)) return state;
   if (!connected) return { ...state, phase: 'waiting', winner: null, reason: 'Player left or tracking unavailable' };
   if (!ready) return state;
   if (state.phase === 'countdown') {
      const countdown = Math.max(0, state.countdown - dt);
      return { ...state, countdown, phase: countdown === 0 ? 'active' : 'countdown' };
   }
   const remaining = Math.max(0, state.remaining - dt);
   if (remaining === 0) return { ...state, remaining, phase: 'finished', winner: 'ballerina', reason: 'Time survived' };
   if (caught) return { ...state, remaining, phase: 'finished', winner: 'giant', reason: 'Caught!' };
   return { ...state, remaining };
}

// Pose matrices retain their scale: mini poses have basis length 1/12;
// giant poses have basis length 1. Both translations are stage-local metres.
export function stagePose(cg, trackingToStage, tracked) {
   return validMatrix(trackingToStage) && validMatrix(tracked) ? cg.mMultiply(trackingToStage, tracked) : null;
}
export function collisionSpheres(cg, head) {
   if (!validMatrix(head)) return [];
   const p = head.slice(12, 15), yaw = Math.atan2(-head[8], -head[10]) - Math.PI;
   const body = cg.mMultiply(cg.mTranslate(p[0], 0, p[2]), cg.mRotateY(yaw));
   // Dress, torso, legs and tracked head. Radii follow the existing visible geometry.
   return [
      { p: cg.mTransform(body, [0, .64 * MINI_SCALE, 0]), r: .025 },
      { p: cg.mTransform(body, [0, .94 * MINI_SCALE, 0]), r: .019 },
      { p: cg.mTransform(body, [0, .25 * MINI_SCALE, 0]), r: .021 },
      { p, r: .13 * MINI_SCALE },
   ];
}
export function catches(cg, head, hand, previousHand = null, previousHead = null) {
   if (!validMatrix(head) || !validMatrix(hand)) return false;
   const current = collisionSpheres(cg, head), prior = collisionSpheres(cg, previousHead || head);
   const end = hand.slice(12, 15), start = validMatrix(previousHand) ? previousHand.slice(12, 15) : end;
   // Reject tracking jumps; a normal fast reach between network samples still sweeps.
   const sweep = Math.hypot(...end.map((v, i) => v - start[i])) < .5;
   return current.some((s, i) => {
      const relEnd = end.map((v, j) => v - s.p[j]);
      const relStart = sweep ? start.map((v, j) => v - prior[i].p[j]) : relEnd;
      return segmentDistance([0, 0, 0], relStart, relEnd) <= s.r + HAND_RADIUS + CONTACT_TOLERANCE;
   });
}
