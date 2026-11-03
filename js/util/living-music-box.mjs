// All stored dimensions are metres at human scale; presentation alone changes.
export const MINI_SCALE = 1 / 12;
export const STAGE_RADIUS = .225;
export const WALK_RADIUS = .195;
export const TABLE_Y = .76;
export const SOURCES = [
   { name: 'MELODY', p: [0, .075, -.165], color: [1, .70, .77], notes: [72, 76, 0, 0, 79, 76, 0, 0] },
   { name: 'CHIMES', p: [.165, .075, 0], color: [.70, .86, 1], notes: [0, 0, 84, 0, 0, 0, 88, 0] },
   { name: 'HARMONY', p: [0, .075, .165], color: [.80, .72, 1], notes: [0, 0, 0, 67, 0, 0, 0, 64] },
   { name: 'BELLS', p: [-.165, .075, 0], color: [1, .87, .53], notes: [0, 79, 0, 0, 0, 81, 0, 0] },
];
export function boundStage(p) {
   const r = Math.hypot(p[0], p[2]), k = r > WALK_RADIUS ? WALK_RADIUS / r : 1;
   return [p[0] * k, p[1], p[2] * k];
}
// Original, eight-beat C-major phrases. Shared by all looping voices, no downloads.
export function fillMusicLayer(samples, sampleRate, notes, layer) {
   const beat = .5;
   for (let n = 0; n < notes.length; n++) {
      if (!notes[n]) continue;
      const f = 440 * 2 ** ((notes[n] - 69) / 12);
      const start = Math.round(n * beat * sampleRate);
      const duration = layer === 2 ? .95 : .43;
      for (let j = 0; j < duration * sampleRate && start + j < samples.length; j++) {
         const t = j / sampleRate;
         const envelope = Math.min(1, t / .008) * Math.exp(-t * (layer === 2 ? 4 : 10))
            * Math.min(1, (duration - t) / .03)
            * Math.min(1, (samples.length - start - j - 1) / (sampleRate * .03));
         // Higher partials and a short bright attack make HRTF localization
         // easier than the old near-pure low-frequency sine tones.
         samples[start + j] += .12 * envelope * (Math.sin(2 * Math.PI * f * t)
            + .38 * Math.sin(2 * Math.PI * f * 2.756 * t)
            + .20 * Math.sin(2 * Math.PI * f * 5.404 * t)
            + .15 * Math.sin(2 * Math.PI * 4300 * t) * Math.exp(-60 * t));
      }
   }
}

// A separate, clearly audible impact; independent of the looping layer's mute.
export function fillBellStrike(samples, sampleRate, notes, layer) {
   const f = 440 * 2 ** (([84, 88, 79, 91][layer] - 69) / 12);
   for (let j = 0; j < samples.length; j++) {
      const t = j / sampleRate, end = Math.min(1, (samples.length - j - 1) / (sampleRate * .04));
      samples[j] = .28 * Math.min(1, t / .002) * end * (
         Math.sin(2 * Math.PI * f * t) * Math.exp(-5 * t)
         + .45 * Math.sin(2 * Math.PI * f * 2.756 * t) * Math.exp(-9 * t)
         + .25 * Math.sin(2 * Math.PI * f * 5.404 * t) * Math.exp(-16 * t));
   }
}

export function segmentDistance(p, a, b) {
   const d = b.map((v, i) => v - a[i]), v = p.map((x, i) => x - a[i]);
   const len2 = d.reduce((sum, x) => sum + x * x, 0);
   const t = len2 ? Math.max(0, Math.min(1, v.reduce((sum, x, i) => sum + x * d[i], 0) / len2)) : 0;
   return Math.hypot(...p.map((x, i) => x - a[i] - t * d[i]));
}
