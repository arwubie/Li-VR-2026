import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const asDataModule = source =>
   `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

const configSource = await readFile(
   new URL('../js/scenes/airbeat/config.js', import.meta.url), 'utf8');
const configUrl = asDataModule(configSource);
const { GAME_CONFIG } = await import(configUrl);

const logicSource = (await readFile(
   new URL('../js/scenes/airbeat/logic.js', import.meta.url), 'utf8'))
   .replace("'./config.js'", `'${configUrl}'`);
const { getNotePosition, calculateAccuracy } = await import(asDataModule(logicSource));

const chartSource = await readFile(
   new URL('../js/scenes/airbeat/chart.js', import.meta.url), 'utf8');
const { DEMO_CHART, SONG_DURATION, CHART_BPM } = await import(asDataModule(chartSource));

test('notes and the rectangular track share one constant-X perspective', () => {
   for (let lane = 0; lane < 4; lane++) {
      const noteTime = 10;
      const spawn = getNotePosition(lane, noteTime,
                                    noteTime - GAME_CONFIG.spawnLeadTime);
      const hit = getNotePosition(lane, noteTime, noteTime);
      assert.ok(Math.abs(spawn[0] - GAME_CONFIG.laneX[lane]) < 1e-9);
      assert.ok(Math.abs(hit[0] - GAME_CONFIG.laneX[lane]) < 1e-9);
      assert.equal(spawn[0], hit[0], 'lane must stay parallel in world space');
      assert.equal(spawn[1], GAME_CONFIG.noteY);
      assert.equal(hit[1], GAME_CONFIG.noteY);
      assert.ok(Math.abs(spawn[2] - GAME_CONFIG.spawnZ) < 1e-9);
      assert.ok(Math.abs(hit[2] - GAME_CONFIG.hitZ) < 1e-9);
      assert.ok(hit[2] > spawn[2], 'note should move toward the player along +Z');
   }
});

test('position comes directly from song time and is frame-rate independent', () => {
   const direct = getNotePosition(3, 8, 7.25);
   const repeated = getNotePosition(3, 8, 7.25);
   assert.deepEqual(direct, repeated);
   assert.ok(direct.every(Number.isFinite));
});

test('compact hit line stays inside a relaxed standing reach', () => {
   assert.ok(Math.max(...GAME_CONFIG.laneX.map(Math.abs)) <= .32);
   assert.ok(GAME_CONFIG.trackHalfWidth <= .42);
   assert.ok(GAME_CONFIG.hitZ >= -.45);
   assert.ok(GAME_CONFIG.noteY >= .95 && GAME_CONFIG.noteY <= 1.15);
});

test('demo chart is ordered, valid, and demonstrates every required note type', () => {
   assert.ok(DEMO_CHART.length >= 40);
   for (let index = 0; index < DEMO_CHART.length; index++) {
      const note = DEMO_CHART[index];
      assert.ok(note.time >= (DEMO_CHART[index - 1]?.time ?? 0));
      assert.ok(Number.isInteger(note.lane) && note.lane >= 0 && note.lane < 4);
      assert.ok(['tap', 'flickUp', 'hold'].includes(note.type));
      if (note.type === 'hold')
         assert.ok(note.duration > 0);
   }
   assert.ok(DEMO_CHART.filter(note => note.type === 'flickUp').length >= 2);
   assert.ok(DEMO_CHART.filter(note => note.type === 'hold').length >= 2);
   assert.ok(DEMO_CHART.some(note => note.curve === 'sweep'));
   const lastEnd = Math.max(...DEMO_CHART.map(note => note.time + (note.duration || 0)));
   assert.ok(SONG_DURATION > lastEnd);
   assert.equal(SONG_DURATION, 30);
   assert.equal(CHART_BPM, 113);
});

test('weighted accuracy handles perfect, good, miss, and zero judgments', () => {
   assert.equal(calculateAccuracy({ perfect: 0, good: 0, miss: 0 }), 0);
   assert.equal(calculateAccuracy({ perfect: 2, good: 1, miss: 1 }), 62.5);
   assert.equal(calculateAccuracy({ perfect: 4, good: 0, miss: 0 }), 100);
});
