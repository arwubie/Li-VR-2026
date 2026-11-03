// Spatial Audio Wrapper

let audioContext = new AudioContext();

export let resonanceScene;
let resonanceSources = [];

if (window.ResonanceAudio) {
    resonanceScene = new ResonanceAudio(audioContext);
    resonanceScene.output.connect(audioContext.destination);
}


// Room Acoustic Simulation
// Units: Meter
// FLR XR Room Preset
let roomDimensions = {
  width : 6,
  height : 2.5,
  depth : 6
};

// Simplified view of the materials that make up the scene.
// dry room presets
let roomMaterials = {
  left : 'curtain-heavy', // walls
  right : 'curtain-heavy',
  front : 'curtain-heavy',
  back : 'curtain-heavy', 
  down : 'polished-concrete-or-tile', // floor
  up : 'wood-ceiling'
};

if (resonanceScene)
   resonanceScene.setRoomProperties(roomDimensions, roomMaterials);


export async function createSoundSource(index = 0, url, position, loop = false, gain = 1.0) {
    if (resonanceScene && !resonanceSources[index]) {
        resonanceSources[index] = {
            source: resonanceScene.createSource(),
            bufferSource: null,
            loop: loop,
            stopped: true
        };
    }
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        let bufferSource = audioContext.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.loop = loop;
        bufferSource.connect(resonanceSources[index].source.input);
        resonanceSources[index].source.setPosition(position[0], position[1], position[2]);
        resonanceSources[index].bufferSource = bufferSource;
        resonanceSources[index].source.setGain(gain);
        console.log(`Source at index ${index} created and buffer loaded successfully from ${url}`);
    } catch (error) {
        console.error(`Error loading sound from ${url}:`, error);
    }
}

export function playSound(sourceIndex = 0) {
    if (resonanceSources[sourceIndex] && resonanceSources[sourceIndex].bufferSource) {
        audioContext.resume();
        if (resonanceSources[sourceIndex].bufferSource.loop) {
            if (!resonanceSources[sourceIndex].stopped) {
                console.warn('Attempted to play a sound that is already playing. No action taken.');
                return;
            }
            resonanceSources[sourceIndex].bufferSource.disconnect();
        }
        const oldBuffer = resonanceSources[sourceIndex].bufferSource.buffer;
        const oldLoop = resonanceSources[sourceIndex].bufferSource.loop;
        let bufferSource = audioContext.createBufferSource();
        bufferSource.buffer = oldBuffer;
        bufferSource.loop = oldLoop;
        bufferSource.connect(resonanceSources[sourceIndex].source.input);
        resonanceSources[sourceIndex].bufferSource = bufferSource;
        bufferSource.start(0);
        resonanceSources[sourceIndex].stopped = false;
        console.log('Sound Played at index', sourceIndex, 'Looping:', oldLoop);
    } else {
        console.error(`No audio source prepared or available at index ${sourceIndex}`);
    }
}



export function updatePosition(sourceIndex, newPosition) {
    if (resonanceSources[sourceIndex] && resonanceSources[sourceIndex].source) {
        resonanceSources[sourceIndex].source.setPosition(newPosition[0], newPosition[1], newPosition[2]);
    } 
}

export function stopSound(sourceIndex = 0) {
    if (resonanceSources[sourceIndex] && resonanceSources[sourceIndex].bufferSource) {
        if (!resonanceSources[sourceIndex].stopped) { 
            resonanceSources[sourceIndex].bufferSource.stop();
            resonanceSources[sourceIndex].stopped = true; 
            console.log('Sound Stopped at index', sourceIndex);
        }
        // resonanceSources[sourceIndex].bufferSource = null; 
    }
}

export function stopAllSounds() {
    resonanceSources.forEach((source, index) => {
        if (source.bufferSource && !source.stopped) { 
            source.bufferSource.stop();
            source.stopped = true;
            console.log('Sound Stopped at index', index);
        }
        // source.bufferSource = null; 
    });
    console.log('All Sound Stops');
}

// Scene-owned, synchronized procedural layers using the existing context and
// Resonance scene. Unlike indexed clip helpers, these can fade without restarting.
export function createMusicBoxAudio(layers, fillLayer, fillStrike) {
    if (!window.ResonanceAudio) return null;
    // Same context and Resonance framework, but a scene-owned dry renderer:
    // shared classroom reflections otherwise mask the miniature source directions.
    // Its listener is updated explicitly, independently of the engine's shared room.
    const room = new ResonanceAudio(audioContext);
    room.setRoomProperties({ width: 12, height: 6, depth: 12 }, {
        left: 'transparent', right: 'transparent', front: 'transparent',
        back: 'transparent', down: 'transparent', up: 'transparent',
    });
    room.output.connect(audioContext.destination);
    let started = false, disposed = false;
    const impacts = new Set();
    const voices = layers.map((layer, i) => {
        const spatial = room.createSource({ minDistance: .35, maxDistance: 8, rolloff: 'logarithmic' });
        const gain = audioContext.createGain();
        gain.gain.value = .9;
        gain.connect(spatial.input);
        const buffer = audioContext.createBuffer(1, Math.round(audioContext.sampleRate * 4), audioContext.sampleRate);
        fillLayer(buffer.getChannelData(0), audioContext.sampleRate, layer.notes, i);
        const strikeBuffer = audioContext.createBuffer(1, Math.round(audioContext.sampleRate * 1.3), audioContext.sampleRate);
        fillStrike?.(strikeBuffer.getChannelData(0), audioContext.sampleRate, layer.notes, i);
        const player = audioContext.createBufferSource();
        player.buffer = buffer;
        player.loop = true;
        player.connect(gain);
        return { spatial, gain, player, strikeBuffer };
    });
    return {
        async start() {
            if (disposed) return false;
            await audioContext.resume();
            if (disposed) return false;
            if (!started) {
                const at = audioContext.currentTime + .03;
                voices.forEach(v => v.player.start(at));
                started = true;
            }
            return audioContext.state === 'running';
        },
        listener(matrix) { if (!disposed) room.setListenerFromMatrix({ elements: matrix }); },
        position(i, p) { voices[i].spatial.setPosition(...p); },
        strike(i, strength = 1) {
            if (disposed || !fillStrike || impacts.size >= 8) return;
            const player = audioContext.createBufferSource(), gain = audioContext.createGain();
            player.buffer = voices[i].strikeBuffer;
            gain.gain.value = Math.max(.5, Math.min(1.4, strength));
            player.connect(gain);
            // Connect separately so muting a musical layer still allows striking it.
            gain.connect(voices[i].spatial.input);
            const impact = { player, gain };
            impacts.add(impact);
            player.onended = () => { player.disconnect(); gain.disconnect(); impacts.delete(impact); };
            player.start(audioContext.currentTime + .005);
        },
        enabled(i, on) {
            const param = voices[i].gain.gain;
            param.cancelScheduledValues(audioContext.currentTime);
            param.setTargetAtTime(on ? .9 : 0, audioContext.currentTime, .025);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            impacts.forEach(v => { v.player.stop(); v.player.disconnect(); v.gain.disconnect(); });
            impacts.clear();
            voices.forEach(v => {
                if (started) v.player.stop();
                v.player.disconnect();
                v.gain.disconnect();
                v.spatial.setGain(0);
            });
            room.output.disconnect();
        },
    };
}
