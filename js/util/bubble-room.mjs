// Shared, renderer-independent rules. Only the elected room host advances these.
export const COLORS = {
   1: { name: 'ROSE', rgb: [1, .32, .48], hex: '#ff527b' },
   2: { name: 'SUNSHINE', rgb: [1, .85, .28], hex: '#ffd947' },
   3: { name: 'PEACH', rgb: [1, .58, .30], hex: '#ff944d' },
   4: { name: 'SKY', rgb: [.28, .64, 1], hex: '#47a3ff' },
   5: { name: 'LAVENDER', rgb: [.72, .45, 1], hex: '#b873ff' },
   6: { name: 'MINT', rgb: [.32, .91, .66], hex: '#52e8a8' },
   7: { name: 'PEARL', rgb: [.94, .91, 1], hex: '#f0e8ff' },
};
export const LIMIT = 42;
export const LO = [-1.85, .55, -1.65], HI = [1.85, 2.65, .85];
export const SOURCES = [[-1.18, .88, -.85], [0, .78, -1.15], [1.18, .88, -.85]];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const vector = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const speedLimit = v => {
   const n = Math.hypot(...v);
   return v.map(x => x * Math.min(1, 1.6 / (n || 1)));
};
const constrain = (p, r) => p.map((x, i) => clamp(x, LO[i] + r, HI[i] - r));
export const heldBubble = (s, actor, hand) => s.bubbles.find(b => b.owner === actor && b.hand === hand);

export function initialRoom() {
   const s = { bubbles: [], sizes: [.5, .5, .5], next: 1, mix: null };
   // Fixed initial arrangement: every client has the same preview before joining.
   for (let i = 0; i < 24; i++) {
      const mask = [1, 2, 4, 3, 5, 6][i % 6];
      const drift = [.40 * Math.sin(i * 2.3), .26 * Math.cos(i), .34 * Math.cos(i * 1.7)];
      const boost = Math.max(1, .28 / Math.hypot(...drift));
      s.bubbles.push({ id: s.next++, mask, r: .105 + .016 * (i % 4),
         p: [-1.5 + (i % 6) * .60, 1.2 + Math.floor(i / 6) * .34, -.1 - (i % 3) * .43],
         v: drift.map(x => x * boost),
         owner: null, hand: null, touched: 0 });
   }
   return s;
}

function fuse(s, moving, from, now) {
   if (!moving.owner) return;
   const d = moving.p.map((x, i) => x - from[i]);
   const dd = d.reduce((n, x) => n + x * x, 0);
   for (const b of s.bubbles) {
      if (b === moving || !b.owner) continue;
      // Sweep the held sphere along its drag path, so a fast hand cannot skip a merge.
      const t = dd ? clamp(d.reduce((n, x, i) => n + x * (b.p[i] - from[i]), 0) / dd, 0, 1) : 0;
      const q = from.map((x, i) => x + d[i] * t);
      if (distance(q, b.p) > (moving.r + b.r) * .82) continue;
      moving.mask |= b.mask;
      moving.r = Math.min(.245, Math.cbrt(moving.r ** 3 + b.r ** 3));
      moving.p = constrain(moving.p, moving.r);
      s.bubbles.splice(s.bubbles.indexOf(b), 1);
      s.mix = { id: moving.id + ':' + now, p: [...moving.p], mask: moving.mask, at: now };
      return;
   }
}

export function applyAction(s, m, actor, now) {
   if (!m || typeof actor !== 'string') return false;
   if (m.op === 'size' && Number.isInteger(m.source) && m.source >= 0 && m.source < 3 && Number.isFinite(m.value)) {
      s.sizes[m.source] = clamp(m.value, 0, 1);
      return true;
   }
   if (m.op === 'spawn' && Number.isInteger(m.source) && SOURCES[m.source]) {
      if (s.bubbles.length >= LIMIT) return false;
      const i = m.source, r = .085 + .105 * s.sizes[i], n = s.next++;
      s.bubbles.push({ id: n, mask: [1, 2, 4][i], r,
         p: [SOURCES[i][0], SOURCES[i][1] + .46, SOURCES[i][2]],
         v: [.30 * Math.sin(n * 2.4), .50, .22], owner: null, hand: null, touched: now });
      return true;
   }
   if (!['left', 'right', 'mouse'].includes(m.hand)) return false;
   if (m.op === 'grab') {
      const b = s.bubbles.find(b => b.id === m.id);
      if (!b || b.owner || heldBubble(s, actor, m.hand) || !vector(m.pos) || distance(b.p, m.pos) > b.r + .20) return false;
      b.owner = actor; b.hand = m.hand; b.touched = now; b.v = [0, 0, 0];
      return true;
   }
   const b = heldBubble(s, actor, m.hand);
   if (!b) return false;
   if (m.op === 'move' && vector(m.pos)) {
      const from = b.p;
      const dt = clamp((now - b.touched) / 1000, .016, .15);
      b.p = constrain(m.pos, b.r);
      b.v = speedLimit(b.p.map((x, i) => (x - from[i]) / dt));
      b.touched = now;
      fuse(s, b, from, now);
      return true;
   }
   if (m.op === 'release') {
      b.owner = null; b.hand = null;
      b.v[1] += .035;
      b.v = speedLimit(b.v);
      return true;
   }
   return false;
}

export function stepRoom(s, dt, now) {
   dt = clamp(dt, 0, .05);
   for (const b of s.bubbles) {
      if (b.owner && now - b.touched > 1800) { b.owner = null; b.hand = null; }
      if (b.owner) continue;
      // Light currents and very low drag keep the room lively between throws.
      b.v[0] += .025 * Math.sin(now * .0003 + b.id) * dt;
      b.v[1] += (.018 * Math.sin(now * .0007 + b.id) - .012 * b.v[1]) * dt;
      const speed = Math.hypot(...b.v);
      // Collisions should not gradually leave the room full of almost-stationary bubbles.
      if (speed < .24) b.v = speed > .001 ? b.v.map(x => x * .24 / speed) : [.16, .12, .14];
      b.v = speedLimit(b.v.map(x => x * Math.exp(-.008 * dt)));
      for (let j = 0; j < 3; j++) {
         b.p[j] += b.v[j] * dt;
         if (b.p[j] < LO[j] + b.r) { b.p[j] = LO[j] + b.r; b.v[j] = Math.abs(b.v[j]); }
         if (b.p[j] > HI[j] - b.r) { b.p[j] = HI[j] - b.r; b.v[j] = -Math.abs(b.v[j]); }
      }
   }
   for (let i = 0; i < s.bubbles.length; i++) for (let j = i + 1; j < s.bubbles.length; j++) {
      const a = s.bubbles[i], b = s.bubbles[j];
      const d = b.p.map((x, k) => x - a.p[k]), n = Math.hypot(...d), overlap = a.r + b.r - n;
      if (overlap <= 0 || (a.owner && b.owner)) continue;
      const axis = n > .0001 ? d.map(x => x / n) : [1, 0, 0];
      const closing = a.v.reduce((sum, x, k) => sum + (x - b.v[k]) * axis[k], 0);
      const wa = a.owner ? 0 : b.owner ? 1 : .5, wb = b.owner ? 0 : a.owner ? 1 : .5;
      for (let k = 0; k < 3; k++) {
         a.p[k] -= axis[k] * overlap * wa; b.p[k] += axis[k] * overlap * wb;
         if (closing > 0) { a.v[k] -= axis[k] * closing * 1.96 * wa; b.v[k] += axis[k] * closing * 1.96 * wb; }
      }
      a.p = constrain(a.p, a.r); b.p = constrain(b.p, b.r);
      a.v = speedLimit(a.v); b.v = speedLimit(b.v);
   }
}

// Pure election helper: only people currently in this scene can host it.
export function roomLeader(peers, now) {
   return [...peers].filter(([, seen]) => now - seen < 3500).map(([id]) => id).sort()[0] || null;
}
