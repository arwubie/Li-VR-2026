// AirBeat's gameplay and spatial tuning lives here so headset calibration does
// not require editing the game loop.
export const GAME_CONFIG = Object.freeze({
   debug: false,

   // User-supplied 30-second chorus clip. The original MP3 remains untouched.
   // The chart expects this clip to start on a strong downbeat at 113 BPM.
   audioPath: './media/sound/airbeat/nevergonnagiveyouup-30s.mp3',
   audioStartOffset: 0,
   bpm: 113,

   // Timing values are seconds.
   spawnLeadTime: 2.6,
   perfectWindow: 0.080,
   goodWindow: 0.160,
   flickGestureWindow: 0.220,
   holdGraceTime: 0.180,

   // Motion and collision values are meters / meters per second.
   // The compact playfield keeps every lane inside a relaxed two-hand reach.
   // Collision volumes stay slightly generous even though the visuals are smaller.
   hitRadius: 0.15,
   holdRadius: 0.19,
   minimumHitSpeed: 0.16,
   strongHitSpeed: 0.42,
   flickMinVelocity: 0.72,
   flickMinDistance: 0.060,
   maxTrackedSpeed: 4.0,

   startHealth: 100,
   missDamage: 10,
   perfectScore: 1000,
   goodScore: 500,
   holdCompletionBonus: 500,

   // The highway is a real, flat, constant-width rectangle in the XZ plane.
   // Perspective alone makes its far end (and far-away notes) look narrower.
   spawnZ: -3.60,
   hitZ: -0.40,
   trackY: 1.045,
   noteY: 1.080,
   trackHalfWidth: 0.40,
   laneWidth: 0.20,
   laneX: [-0.30, -0.10, 0.10, 0.30],
});

export const COLORS = Object.freeze({
   background: [0.006, 0.010, 0.030],
   panel: [0.018, 0.028, 0.075],
   rail: [0.11, 0.26, 0.50],
   text: [0.92, 0.96, 1.00],
   muted: [0.44, 0.57, 0.70],
   accent: [0.12, 0.92, 1.00],
   perfect: [0.18, 1.00, 0.82],
   good: [1.00, 0.78, 0.24],
   miss: [1.00, 0.20, 0.36],
   lanes: [
      [0.12, 0.55, 1.00],
      [0.20, 0.88, 1.00],
      [1.00, 0.32, 0.76],
      [0.76, 0.22, 1.00],
   ],
});
