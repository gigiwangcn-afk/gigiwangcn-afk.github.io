export class AudioController {
  constructor(memories) {
    this.memories = memories;
    this.context = null;
    this.currentId = null;
    this.clarity = 0;
    this.armed = true;
    this.activeScene = null;
    this.audioFiles = new Map();
    this.decodedFiles = new Map();
    this.analyser = null;
    this.cueCount = 0;
    this.onCue = () => {};
  }

  async prepare() {
    await Promise.all(this.memories.map(async (memory) => {
      const tracks = memory.audio?.tracks
        || (memory.audio?.url ? [{ url: memory.audio.url }] : []);
      const loaded = await Promise.all(tracks.map(async (track) => {
        try {
          const response = await fetch(track.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return { track, arrayBuffer: await response.arrayBuffer() };
        } catch (error) {
          console.warn(`Audio archive unavailable: ${track.url}`, error);
          return null;
        }
      }));
      const available = loaded.filter(Boolean);
      if (available.length) this.audioFiles.set(memory.id, available);
    }));
  }

  createNoiseBuffer(seconds = 2) {
    const length = Math.ceil(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * .84 + white * .16;
      data[index] = white * .67 + last * .33;
    }
    return buffer;
  }

  async start() {
    if (!this.context) this.buildGraph();
    if (this.context.state !== 'running') await this.context.resume();
  }

  buildGraph() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext();
    const now = this.context.currentTime;

    this.master = this.context.createGain();
    this.master.gain.setValueAtTime(.68, now);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.master.connect(this.analyser).connect(this.context.destination);

    this.staticSource = this.context.createBufferSource();
    this.staticSource.buffer = this.createNoiseBuffer(2.4);
    this.staticSource.loop = true;
    this.staticFilter = this.context.createBiquadFilter();
    this.staticFilter.type = 'bandpass';
    this.staticFilter.frequency.value = 2100;
    this.staticFilter.Q.value = .55;
    this.staticGain = this.context.createGain();
    this.staticGain.gain.value = .09;
    this.staticSource.connect(this.staticFilter).connect(this.staticGain).connect(this.master);
    this.staticSource.start();
  }

  setMemory(id) {
    if (id === this.currentId) return;
    this.stopScene(.18);
    this.currentId = id;
    this.armed = Boolean(id);
    if (this.context) this.updateStatic();
  }

  setClarity(value) {
    this.clarity = Math.max(0, Math.min(1, value));
    if (this.clarity < .04) {
      this.armed = true;
      this.stopScene(.22);
    }
    if (!this.context) return;
    this.updateStatic();
    if (this.currentId && this.clarity >= .88 && this.armed) {
      this.armed = false;
      this.triggerScene();
    }
  }

  updateStatic() {
    const now = this.context.currentTime;
    const staticLevel = .006 + Math.pow(1 - this.clarity, 1.55) * .1;
    this.staticGain.gain.cancelScheduledValues(now);
    this.staticGain.gain.setTargetAtTime(staticLevel, now, .07);
    this.staticFilter.frequency.setTargetAtTime(820 + (1 - this.clarity) * 3200, now, .1);
  }

  triggerScene() {
    const memory = this.memories.find((candidate) => candidate.id === this.currentId);
    if (!memory || !memory.audio || memory.audio.type === 'silent') return;

    const audioTracks = this.audioFiles.get(memory.id);
    if (audioTracks?.length) {
      this.playAudioTracks(memory, audioTracks);
      return;
    }

    this.announceCue(memory);
    if (memory.audio.type === 'bus') this.playBusScene();
    else if (memory.audio.type === 'desk') this.playCatScene();
    else if (memory.audio.type === 'chimes') this.playChimeScene();
    else this.playMusicScene();
  }

  announceCue(memory) {
    this.cueCount += 1;
    this.onCue({ id: memory.id, count: this.cueCount });
  }

  createScene(duration) {
    this.stopScene(.04);
    const output = this.context.createGain();
    const start = this.context.currentTime + .025;
    output.gain.setValueAtTime(.0001, start);
    output.gain.exponentialRampToValueAtTime(.96, start + .09);
    output.gain.setValueAtTime(.96, start + Math.max(.12, duration - .85));
    output.gain.exponentialRampToValueAtTime(.0001, start + duration);
    output.connect(this.master);
    const scene = { output, start, duration, nodes: [] };
    this.activeScene = scene;
    return scene;
  }

  register(scene, source, stopAt) {
    scene.nodes.push(source);
    if (stopAt) source.stop(stopAt);
    return source;
  }

  envelope(gain, start, attack, peak, end) {
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), start + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, end);
  }

  addNoise(scene, offset, duration, filterType, frequency, q, peak) {
    const source = this.context.createBufferSource();
    source.buffer = this.createNoiseBuffer(duration + .1);
    const filter = this.context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.context.createGain();
    const start = scene.start + offset;
    const end = start + duration;
    this.envelope(gain, start, Math.min(.18, duration * .16), peak, end);
    source.connect(filter).connect(gain).connect(scene.output);
    source.start(start);
    this.register(scene, source, end + .03);
  }

  addGlidingTone(scene, options) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = scene.start + (options.offset || 0);
    const end = start + options.duration;
    oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(options.from, start);
    oscillator.frequency.exponentialRampToValueAtTime(options.to, end);
    this.envelope(gain, start, options.attack || .08, options.peak, end);
    oscillator.connect(gain).connect(scene.output);
    oscillator.start(start);
    this.register(scene, oscillator, end + .03);
    return { oscillator, gain, start, end };
  }

  playBusScene() {
    const scene = this.createScene(6.6);
    this.addNoise(scene, 0, 6.2, 'lowpass', 1050, .7, .048);
    this.addNoise(scene, .18, 5.7, 'bandpass', 430, 1.2, .032);

    const engine = this.addGlidingTone(scene, {
      from: 34, to: 68, duration: 5.9, type: 'sawtooth', peak: .07, attack: .3,
    });
    engine.oscillator.frequency.setValueAtTime(34, engine.start);
    engine.oscillator.frequency.exponentialRampToValueAtTime(76, engine.start + 2.1);
    engine.oscillator.frequency.exponentialRampToValueAtTime(57, engine.end);

    this.addGlidingTone(scene, {
      from: 68, to: 116, duration: 5.5, type: 'sine', peak: .055, attack: .24,
    });

    const voices = [164, 196, 223, 251, 287];
    voices.forEach((frequency, index) => {
      const voice = this.addGlidingTone(scene, {
        offset: .2 + index * .16,
        from: frequency,
        to: frequency * (index % 2 ? .86 : 1.16),
        duration: 3.8 + index * .28,
        type: index % 2 ? 'triangle' : 'sine',
        peak: .0065,
        attack: .35,
      });
      voice.oscillator.detune.value = (index - 2) * 9;
    });
  }

  playCatScene() {
    const scene = this.createScene(2.7);
    const voice = this.addGlidingTone(scene, {
      offset: .08, from: 760, to: 510, duration: 1.42, type: 'sawtooth', peak: .055, attack: .13,
    });
    voice.oscillator.frequency.setValueAtTime(760, voice.start);
    voice.oscillator.frequency.exponentialRampToValueAtTime(470, voice.start + .5);
    voice.oscillator.frequency.exponentialRampToValueAtTime(640, voice.start + .94);
    voice.oscillator.frequency.exponentialRampToValueAtTime(420, voice.end);

    const formant = this.addGlidingTone(scene, {
      offset: .08, from: 1260, to: 880, duration: 1.36, type: 'triangle', peak: .026, attack: .11,
    });
    formant.oscillator.frequency.exponentialRampToValueAtTime(1510, formant.start + .76);
    formant.oscillator.frequency.exponentialRampToValueAtTime(820, formant.end);
    this.addNoise(scene, .09, 1.12, 'bandpass', 1780, 3.8, .012);
  }

  addChimeStrike(scene, offset, fundamental, peak = .055) {
    const partials = [
      { ratio: 1, gain: 1, decay: 3.8 },
      { ratio: 2.71, gain: .42, decay: 2.9 },
      { ratio: 5.18, gain: .18, decay: 2.1 },
    ];
    partials.forEach((partial) => {
      this.addGlidingTone(scene, {
        offset,
        from: fundamental * partial.ratio * 1.008,
        to: fundamental * partial.ratio,
        duration: partial.decay,
        type: 'sine',
        peak: peak * partial.gain,
        attack: .012,
      });
    });
  }

  playChimeScene() {
    const scene = this.createScene(7.4);
    this.addNoise(scene, 0, 6.6, 'bandpass', 2400, .65, .009);
    this.addChimeStrike(scene, .06, 523.25, .05);
    this.addChimeStrike(scene, .72, 659.25, .044);
    this.addChimeStrike(scene, 1.48, 783.99, .04);
    this.addChimeStrike(scene, 2.42, 587.33, .034);
  }

  playMusicScene() {
    const scene = this.createScene(9.2);
    const notes = [261.63, 329.63, 392, 493.88, 440, 392, 329.63, 293.66, 261.63];
    notes.forEach((frequency, index) => {
      const offset = index * .72;
      this.addGlidingTone(scene, {
        offset, from: frequency, to: frequency * .997, duration: 2.35,
        type: 'sine', peak: index === notes.length - 1 ? .035 : .027, attack: .16,
      });
      this.addGlidingTone(scene, {
        offset: offset + .018, from: frequency * 2, to: frequency * 1.994, duration: 1.75,
        type: 'triangle', peak: .006, attack: .2,
      });
    });
    this.addGlidingTone(scene, {
      from: 130.81, to: 130.2, duration: 7.9, type: 'sine', peak: .015, attack: .8,
    });
  }

  async playAudioTracks(memory, audioTracks) {
    try {
      const decoded = await Promise.all(audioTracks.map(async ({ track, arrayBuffer }, index) => {
        const key = `${memory.id}:${index}`;
        let buffer = this.decodedFiles.get(key);
        if (!buffer) {
          buffer = await this.context.decodeAudioData(arrayBuffer.slice(0));
          this.decodedFiles.set(key, buffer);
        }
        return { track, buffer };
      }));
      if (this.currentId !== memory.id || this.clarity < .88) return;

      const duration = Math.max(...decoded.map(({ track, buffer }) =>
        (track.offset || 0) + Math.min(buffer.duration, track.duration || 18)));
      const scene = this.createScene(duration + .25);
      decoded.forEach(({ track, buffer }) => {
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        const offset = track.offset || 0;
        const playDuration = Math.min(buffer.duration, track.duration || 18);
        source.buffer = buffer;
        source.loop = false;
        gain.gain.value = track.gain ?? 1;
        source.connect(gain).connect(scene.output);
        source.start(scene.start + offset, 0, playDuration);
        this.register(scene, source, scene.start + offset + playDuration + .03);
      });
      this.announceCue(memory);
    } catch (error) {
      console.warn(`Cannot decode audio archive: ${memory.id}`, error);
      this.announceCue(memory);
      if (memory.audio.type === 'bus') this.playBusScene();
      else this.playCatScene();
    }
  }

  stopScene(fade = .18) {
    if (!this.activeScene || !this.context) return;
    const scene = this.activeScene;
    const now = this.context.currentTime;
    scene.output.gain.cancelScheduledValues(now);
    scene.output.gain.setTargetAtTime(.0001, now, Math.max(.012, fade / 3));
    scene.nodes.forEach((node) => {
      try { node.stop(now + fade + .04); } catch { /* source already ended */ }
    });
    this.activeScene = null;
  }

  async suspend() {
    this.stopScene(.1);
    if (this.context?.state === 'running') await this.context.suspend();
  }
}
