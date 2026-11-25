import { VIDEO_QUALITY_PRESETS } from './config.js';

/**
 * List available media input/output devices safely across browsers.
 */
export async function listMediaDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { audioInputs: [], videoInputs: [], audioOutputs: [] };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    audioInputs: devices.filter((d) => d.kind === 'audioinput'),
    videoInputs: devices.filter((d) => d.kind === 'videoinput'),
    audioOutputs: devices.filter((d) => d.kind === 'audiooutput'),
  };
}

/**
 * Create a crisp, animated broadcast test-pattern MediaStream (video + quiet optional audio track)
 * so users without a camera or in headless environments can join and test calls seamlessly.
 */
export function createStudioTestStream({ label = 'Studio Test Card', withAudio = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');

  let frame = 0;
  const bars = ['#E8ECF2', '#E59A3C', '#4AB8B8', '#3EB478', '#B85D8E', '#DC4C46', '#3B6FB6'];

  const draw = () => {
    frame += 1;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#0D1014';
    ctx.fillRect(0, 0, w, h);

    // Subtle studio grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // SMPTE-inspired top calibration strip
    const barW = Math.floor((w - 160) / bars.length);
    bars.forEach((color, idx) => {
      ctx.fillStyle = color;
      ctx.fillRect(80 + idx * barW, 84, barW - 4, 24);
    });

    // Center crosshair & animated radar sweep ring
    const cx = w / 2;
    const cy = h / 2 + 12;
    ctx.strokeStyle = '#27303D';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 124, 0, Math.PI * 2);
    ctx.stroke();

    const angle = (frame * 0.04) % (Math.PI * 2);
    ctx.strokeStyle = '#E59A3C';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 124, angle, angle + 0.9);
    ctx.stroke();

    ctx.fillStyle = '#EFF2F6';
    ctx.font = '600 34px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('OPENLINE // STUDIO SLATE', cx, cy - 8);

    ctx.fillStyle = '#8C98A9';
    ctx.font = '500 22px "IBM Plex Mono", ui-monospace, monospace';
    const now = new Date();
    const clock = now.toTimeString().slice(0, 8);
    ctx.fillText(`${label}  ·  ${clock}  ·  720p24`, cx, cy + 32);

    // Tally pulse dot
    const pulse = 0.55 + 0.45 * Math.sin(frame * 0.12);
    ctx.fillStyle = `rgba(229, 154, 60, ${pulse.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(96, h - 68, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8C98A9';
    ctx.textAlign = 'left';
    ctx.font = '500 18px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('SYNTHETIC TEST FEED ACTIVE', 116, h - 62);
  };

  draw();
  const intervalId = setInterval(draw, 1000 / 15);
  const stream = canvas.captureStream(15);

  let audioCtx = null;
  if (withAudio && typeof AudioContext !== 'undefined') {
    try {
      audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 440;
      gain.gain.value = 0.0001; // Virtually silent keep-alive audio unless test ping triggered
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch {
      // AudioContext may require user gesture
    }
  }

  return {
    stream,
    mode: 'synthetic',
    stop() {
      clearInterval(intervalId);
      stream.getTracks().forEach((t) => t.stop());
      audioCtx?.close().catch(() => {});
    },
  };
}

/**
 * Acquire user camera & microphone with intelligent fallbacks:
 * 1. Video + Audio
 * 2. Audio only (if camera missing/busy)
 * 3. Video only (if microphone missing)
 * 4. Null (listen-only / screen-share ready)
 */
export async function acquireLocalMedia({
  audioDeviceId = '',
  videoDeviceId = '',
  quality = 'balanced',
  wantAudio = true,
  wantVideo = true,
  echoCancellation = true,
  noiseSuppression = true,
} = {}) {
  const preset = VIDEO_QUALITY_PRESETS[quality] || VIDEO_QUALITY_PRESETS.balanced;

  const audioConstraint = wantAudio
    ? {
        ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
        echoCancellation,
        noiseSuppression,
        autoGainControl: true,
      }
    : false;

  const videoConstraint = wantVideo
    ? {
        ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {}),
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        frameRate: { ideal: preset.frameRate },
      }
    : false;

  if (!navigator.mediaDevices?.getUserMedia || (!audioConstraint && !videoConstraint)) {
    return { stream: null, hasAudio: false, hasVideo: false, warning: 'Joined in listen-only mode.' };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraint,
      video: videoConstraint,
    });
    return {
      stream,
      hasAudio: stream.getAudioTracks().length > 0,
      hasVideo: stream.getVideoTracks().length > 0,
      warning: null,
    };
  } catch (primaryErr) {
    if (audioConstraint && videoConstraint) {
      // Fallback to audio-only
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
        return {
          stream: audioOnly,
          hasAudio: true,
          hasVideo: false,
          warning: 'Camera unavailable — joined with microphone audio only.',
        };
      } catch {
        // Fallback to video-only
        try {
          const videoOnly = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraint });
          return {
            stream: videoOnly,
            hasAudio: false,
            hasVideo: true,
            warning: 'Microphone unavailable — joined with camera video only.',
          };
        } catch {
          return {
            stream: null,
            hasAudio: false,
            hasVideo: false,
            warning: primaryErr?.name === 'NotAllowedError'
              ? 'Camera & mic permissions denied — joined in listen-only mode.'
              : 'No camera or microphone found — you can use Studio Test Card or Screen Share.',
          };
        }
      }
    }

    return {
      stream: null,
      hasAudio: false,
      hasVideo: false,
      warning: 'Requested media device unavailable — joined in listen-only mode.',
    };
  }
}

/**
 * Monitor live audio level (0..1) and speaking boolean for any MediaStream.
 */
export class AudioLevelMonitor {
  constructor(stream, onLevel, { threshold = 0.055 } = {}) {
    this.onLevel = onLevel;
    this.threshold = threshold;
    this.rafId = null;
    this.ctx = null;
    this.source = null;
    this.analyser = null;

    if (!stream || stream.getAudioTracks().length === 0 || typeof AudioContext === 'undefined') {
      return;
    }

    try {
      this.ctx = new AudioContext();
      this.source = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;
      this.source.connect(this.analyser);

      const data = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i += 1) {
          const norm = (data[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / data.length);
        const level = Math.min(1, rms * 3.8);
        this.onLevel?.(level, level > this.threshold);
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    } catch {
      this.stop();
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    try {
      this.source?.disconnect();
    } catch {
      // ignore
    }
    this.analyser = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

/**
 * Play a short subtle studio tone (for mic/speaker verification or call chime).
 */
export function playStudioChime(freq = 587.33, durationMs = 140) {
  if (typeof AudioContext === 'undefined') return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
    setTimeout(() => ctx.close().catch(() => {}), durationMs + 100);
  } catch {
    // ignore
  }
}
