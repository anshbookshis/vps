/**
 * Suno Acoustic Curtain: zero-dependency Web Audio API harmonic synthesizer.
 * Lets listeners audition the sonic mood of a song/film pairing before dropping
 * into the VidRift player, and exposes an AnalyserNode for the Canvas Fluid Halo.
 */

const SOUND_PATCHES = {
  'midnight-synth': {
    bpm: 96,
    freqs: [110, 164.81, 196, 246.94, 293.66], // A minor 9
    cutoff: 880,
    wave: 'sawtooth',
    pulseRate: 1.6,
    label: 'Analog 80s Polysynth • A Minor 9',
  },
  'lofi-rain': {
    bpm: 74,
    freqs: [130.81, 164.81, 196, 246.94, 293.66], // Cmaj9
    cutoff: 560,
    wave: 'triangle',
    pulseRate: 0.75,
    label: 'Warm Tape Keys • C Maj9',
  },
  'imax-sub': {
    bpm: 82,
    freqs: [55, 82.41, 110, 164.81, 220], // Deep A5 sub organ
    cutoff: 440,
    wave: 'sawtooth',
    pulseRate: 1.1,
    label: 'Sub-Bass Brass & Organ • 55 Hz Drone',
  },
  'jazz-smoke': {
    bpm: 118,
    freqs: [146.83, 174.61, 220, 261.63, 329.63], // Dm9
    cutoff: 720,
    wave: 'sine',
    pulseRate: 1.9,
    label: 'Velvet Upright & Rhodes • D Minor 9',
  },
  'anime-neon': {
    bpm: 128,
    freqs: [146.83, 220, 261.63, 329.63, 392.0], // Dm11 shimmer
    cutoff: 1250,
    wave: 'triangle',
    pulseRate: 2.2,
    label: 'Tokyo Overdrive Shimmer • 128 BPM',
  },
  'indie-tape': {
    bpm: 88,
    freqs: [123.47, 185.0, 220, 277.18, 329.63], // Bm11
    cutoff: 650,
    wave: 'triangle',
    pulseRate: 0.9,
    label: 'Nostalgic 16mm Tape Pad • B Minor 11',
  },
};

export class SonicCurtainEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.masterGain = null;
    this.activeNodes = [];
    this.pulseTimer = null;
    this.activeMoodId = null;
    this.isPlaying = false;
    this.freqBuffer = new Uint8Array(64);
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    const snapshot = {
      isPlaying: this.isPlaying,
      activeMoodId: this.activeMoodId,
    };
    for (const fn of this.listeners) fn(snapshot);
  }

  ensureContext() {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.84;
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.0001;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.freqBuffer = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playMood(moodId = 'midnight-synth', titleLabel = '') {
    const ctx = this.ensureContext();
    if (!ctx) return false;

    if (this.isPlaying && this.activeMoodId === moodId) {
      this.stop(350);
      return false;
    }

    this.teardownOscillators();
    const patch = SOUND_PATCHES[moodId] || SOUND_PATCHES['midnight-synth'];
    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(patch.cutoff, now);
    filter.Q.value = 1.6;
    filter.connect(this.masterGain);

    // LFO breathing filter sweep
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = patch.pulseRate * 0.25;
    lfoGain.gain.value = patch.cutoff * 0.32;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(now);
    this.activeNodes.push(lfo, lfoGain, filter);

    patch.freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? 'sine' : patch.wave;
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime((idx % 2 === 0 ? 1 : -1) * (idx * 3.5), now);
      gain.gain.setValueAtTime(idx === 0 ? 0.26 : 0.11 / Math.sqrt(idx + 1), now);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(now);
      this.activeNodes.push(osc, gain);
    });

    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.exponentialRampToValueAtTime(0.24, now + 0.65);

    this.activeMoodId = moodId;
    this.activeLabel = titleLabel || patch.label;
    this.isPlaying = true;
    this.notify();
    return true;
  }

  stop(fadeMs = 450) {
    if (!this.ctx || !this.isPlaying) {
      this.isPlaying = false;
      this.notify();
      return;
    }
    const now = this.ctx.currentTime;
    const secs = Math.max(0.05, fadeMs / 1000);
    try {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + secs);
    } catch {
      // Ignore scheduling edge cases
    }
    this.isPlaying = false;
    this.notify();
    setTimeout(() => {
      if (!this.isPlaying) this.teardownOscillators();
    }, fadeMs + 60);
  }

  teardownOscillators() {
    for (const node of this.activeNodes) {
      try {
        if (typeof node.stop === 'function') node.stop();
        if (typeof node.disconnect === 'function') node.disconnect();
      } catch {
        // Node already stopped
      }
    }
    this.activeNodes = [];
  }

  getFrequencyData() {
    if (!this.analyser || !this.isPlaying) {
      this.freqBuffer.fill(0);
      return this.freqBuffer;
    }
    this.analyser.getByteFrequencyData(this.freqBuffer);
    return this.freqBuffer;
  }
}

export const sonicCurtain = new SonicCurtainEngine();
