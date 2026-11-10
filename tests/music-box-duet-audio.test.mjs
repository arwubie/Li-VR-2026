import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { SOURCES, fillMusicLayer, fillBellStrike } from '../js/util/living-music-box.mjs';

test('duet correct/mistake/victory cues use the existing spatial sources, keep loops alive, and dispose cleanly', async () => {
   const starts = [], stops = [], rooms = [];
   class AudioContext {
      constructor() { this.sampleRate = 8000; this.currentTime = 1; this.state = 'running'; }
      resume() { return Promise.resolve(); }
      createGain() { return { gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime() {} }, connect(to) { this.to = to; }, disconnect() {} }; }
      createBuffer(channels, length) {
         const samples = new Float32Array(length); return { getChannelData: () => samples };
      }
      createBufferSource() { return { connect(to) { this.to = to; }, disconnect() {}, start() { starts.push(this); }, stop() { stops.push(this); } }; }
   }
   class ResonanceAudio {
      constructor() { this.sources = []; this.output = { connect() {}, disconnect() {} }; rooms.push(this); }
      setRoomProperties() {} setListenerFromMatrix() {}
      createSource() { const source = { input: {}, setPosition(...p) { this.position = p; }, setGain() {} }; this.sources.push(source); return source; }
   }
   const env = vm.createContext({ AudioContext, ResonanceAudio }); env.window = env;
   const source = fs.readFileSync(new URL('../js/util/spatial-audio.js', import.meta.url), 'utf8').replaceAll('export ', '');
   vm.runInContext(source + '\nglobalThis.make = createMusicBoxAudio;', env);
   const audio = env.make(SOURCES, fillMusicLayer, fillBellStrike);
   await audio.start(); assert.equal(starts.length, 4);
   audio.enabled(2, false); audio.position(2, [.1, .2, .3]);
   for (const kind of ['correct', 'mistake', 'victory']) audio.cue(kind, 2);
   assert.equal(starts.length, 7); assert.equal(stops.length, 0);
   const cues = starts.slice(4);
   for (const player of cues) {
      const samples = player.buffer.getChannelData(0);
      assert.ok(samples.some(v => Math.abs(v) > .01));
      assert.ok(samples.every(v => Number.isFinite(v) && Math.abs(v) <= .11));
      assert.equal(samples[0], 0); assert.ok(Math.abs(samples.at(-1)) < .001);
      assert.equal(player.to.to, rooms.at(-1).sources[2].input);
   }
   assert.notDeepEqual(cues[0].buffer.getChannelData(0), cues[1].buffer.getChannelData(0));
   assert.ok(cues[2].buffer.getChannelData(0).length > cues[0].buffer.getChannelData(0).length);
   await audio.start(); assert.equal(starts.length, 7);
   audio.dispose(); assert.equal(stops.length, 7);
   audio.cue('victory'); assert.equal(starts.length, 7);
});
