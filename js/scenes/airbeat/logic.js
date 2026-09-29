import { GAME_CONFIG } from './config.js';

const mix = (a, b, t) => a + (b - a) * t;

// The lane is a constant-X line on a flat rectangular highway. Only Z changes.
// The camera projection therefore gives the track and notes identical
// perspective, including their apparent growth toward the player.
export const getNotePosition = (lane, noteTime, songTime, config = GAME_CONFIG) => {
   const progress = 1 - (noteTime - songTime) / config.spawnLeadTime;
   return [
      config.laneX[lane],
      config.noteY,
      mix(config.spawnZ, config.hitZ, progress),
   ];
};

export const calculateAccuracy = counts => {
   const total = counts.perfect + counts.good + counts.miss;
   return total ? 100 * (counts.perfect + .5 * counts.good) / total : 0;
};
