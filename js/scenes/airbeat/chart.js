// Thirty-second chart authored on a 113 BPM grid. It is intended for a legally
// supplied chorus clip that begins exactly on a strong downbeat. Until that
// clip is added, the built-in synth plays the same tempo for reliable testing.
const BPM = 113;
const BEAT = 60 / BPM;
const LEAD_IN = 1.0;
const at = beat => LEAD_IN + beat * BEAT;
const duration = beats => beats * BEAT;

// Lanes 0-1 use the left hand; lanes 2-3 use the right hand.
export const DEMO_CHART = [
   { time: at(0), lane: 0, type: 'tap' },
   { time: at(1), lane: 2, type: 'tap' },
   { time: at(2), lane: 1, type: 'tap' },
   { time: at(3), lane: 3, type: 'tap' },
   { time: at(4), lane: 0, type: 'tap' },
   { time: at(4), lane: 3, type: 'tap' },
   { time: at(5), lane: 1, type: 'flickUp' },
   { time: at(6), lane: 2, type: 'tap' },
   { time: at(7), lane: 0, type: 'tap' },

   { time: at(8), lane: 3, type: 'hold', duration: duration(2) },
   { time: at(9), lane: 0, type: 'tap' },
   { time: at(10), lane: 1, type: 'tap' },
   { time: at(11), lane: 2, type: 'tap' },
   { time: at(12), lane: 0, type: 'flickUp' },
   { time: at(13), lane: 3, type: 'tap' },
   { time: at(14), lane: 1, type: 'tap' },
   { time: at(15), lane: 2, type: 'tap' },

   { time: at(16), lane: 0, type: 'hold', duration: duration(3), curve: 'sweep' },
   { time: at(17), lane: 3, type: 'tap' },
   { time: at(18), lane: 2, type: 'tap' },
   { time: at(20), lane: 1, type: 'tap' },
   { time: at(21), lane: 3, type: 'flickUp' },
   { time: at(22), lane: 0, type: 'tap' },
   { time: at(23), lane: 2, type: 'tap' },
   { time: at(24), lane: 1, type: 'tap' },

   // Denser eighth-note phrase.
   { time: at(26.0), lane: 0, type: 'tap' },
   { time: at(26.5), lane: 2, type: 'tap' },
   { time: at(27.0), lane: 1, type: 'tap' },
   { time: at(27.5), lane: 3, type: 'tap' },
   { time: at(28.0), lane: 0, type: 'tap' },
   { time: at(28.5), lane: 2, type: 'tap' },
   { time: at(29.0), lane: 1, type: 'tap' },
   { time: at(29.5), lane: 3, type: 'tap' },
   { time: at(30.0), lane: 0, type: 'tap' },
   { time: at(30.0), lane: 3, type: 'tap' },
   { time: at(31.0), lane: 1, type: 'flickUp' },
   { time: at(31.0), lane: 2, type: 'flickUp' },

   { time: at(33), lane: 0, type: 'tap' },
   { time: at(34), lane: 2, type: 'tap' },
   { time: at(35), lane: 1, type: 'tap' },
   { time: at(36), lane: 3, type: 'tap' },
   { time: at(37), lane: 0, type: 'hold', duration: duration(2) },
   { time: at(38), lane: 2, type: 'tap' },
   { time: at(40), lane: 3, type: 'flickUp' },
   { time: at(41), lane: 1, type: 'tap' },
   { time: at(42), lane: 0, type: 'tap' },
   { time: at(42), lane: 3, type: 'tap' },
   { time: at(44), lane: 1, type: 'hold', duration: duration(2) },
   { time: at(45), lane: 3, type: 'tap' },
   { time: at(47), lane: 0, type: 'flickUp' },
   { time: at(48), lane: 2, type: 'tap' },
   { time: at(49), lane: 1, type: 'tap' },
   { time: at(50), lane: 3, type: 'tap' },
   { time: at(52), lane: 0, type: 'tap' },
   { time: at(52), lane: 3, type: 'tap' },
];

export const SONG_DURATION = 30.0;
export const CHART_BPM = BPM;

