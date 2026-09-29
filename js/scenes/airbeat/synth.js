// Audio-clock wrapper. It can play a user-supplied local file, while retaining
// a 113 BPM synthesized fallback so the project always remains demonstrable.
export class AirBeatSynth {
   constructor(options = {}) {
      this.audioPath = options.audioPath || null;
      this.audioStartOffset = options.audioStartOffset || 0;
      this.bpm = options.bpm || 113;
      this.context = null;
      this.master = null;
      this.buffer = null;
      this.sources = [];
      this.startTime = null;
      this.localAudioFailed = false;
   }

   async prepare() {
      try {
         if (!this.context) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext)
               throw new Error('Web Audio is unavailable');
            this.context = new AudioContext();
            this.master = this.context.createGain();
            this.master.gain.value = 0.20;
            this.master.connect(this.context.destination);
         }
         if (this.context.state === 'suspended')
            await this.context.resume();

         if (this.audioPath && !this.buffer && !this.localAudioFailed) {
            try {
               const response = await fetch(this.audioPath);
               if (!response.ok)
                  throw new Error(`HTTP ${response.status}`);
               this.buffer = await this.context.decodeAudioData(await response.arrayBuffer());
            }
            catch (error) {
               console.warn(`AirBeat could not load ${this.audioPath}; using synth fallback.`, error);
               this.localAudioFailed = true;
            }
         }
         return this.context.state === 'running';
      }
      catch (error) {
         console.warn('AirBeat audio clock unavailable:', error);
         return false;
      }
   }

   tone(when, frequency, toneDuration, volume, type = 'sine', endFrequency = null) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, when);
      if (endFrequency)
         oscillator.frequency.exponentialRampToValueAtTime(endFrequency, when + toneDuration);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(volume, when + .008);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + toneDuration);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(when);
      oscillator.stop(when + toneDuration + .02);
      this.sources.push(oscillator);
   }

   scheduleFallback(duration) {
      const beat = 60 / this.bpm;
      const bass = [110, 110, 146.83, 130.81, 110, 164.81, 146.83, 130.81];
      for (let index = 0, t = 0; t < duration; index++, t += beat) {
         const when = this.startTime + t;
         this.tone(when, 105, .16, .52, 'sine', 48);
         this.tone(when, bass[index % bass.length], .32, .17, 'triangle');
         this.tone(when + beat / 2, 880, .040, .05, 'square');
         if (index % 4 === 2)
            this.tone(when, 220, .11, .07, 'sawtooth');
      }
   }

   start(duration) {
      if (!this.context || this.context.state !== 'running')
         return null;
      this.stop();
      this.startTime = this.context.currentTime + .05;
      if (this.buffer) {
         const source = this.context.createBufferSource();
         source.buffer = this.buffer;
         source.connect(this.master);
         const playable = Math.max(0, this.buffer.duration - this.audioStartOffset);
         source.start(this.startTime, this.audioStartOffset, Math.min(duration, playable));
         this.sources.push(source);
      }
      else
         this.scheduleFallback(duration);
      return this.startTime;
   }

   stop() {
      for (let source of this.sources) {
         try { source.stop(); }
         catch (_) {}
         try { source.disconnect(); }
         catch (_) {}
      }
      this.sources.length = 0;
      this.startTime = null;
   }

   songTime(fallbackTime) {
      return this.startTime === null || !this.context
           ? fallbackTime
           : Math.max(0, this.context.currentTime - this.startTime);
   }

   get modeLabel() {
      return this.buffer ? 'LOCAL AUDIO' : '113 BPM PRACTICE MIX';
   }

   async dispose() {
      this.stop();
      if (this.context) {
         try { await this.context.close(); }
         catch (_) {}
      }
      this.context = null;
      this.master = null;
      this.buffer = null;
   }
}

