/**
 * Web Audio invigilator cue synthesizer + MediaRecorder voice practice wrapper.
 * Zero external audio assets required; degrades gracefully in muted or headless contexts.
 */

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(freq, durationSec, startOffset = 0, volume = 0.16, type = 'sine') {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/**
 * Play authentic SSB test-hall audible bell/tone cues.
 * @param {'start'|'transition'|'warning'|'cutoff'} kind
 * @param {boolean} [muted]
 */
export function playCue(kind, muted = false) {
  if (muted) return;
  try {
    if (kind === 'start') {
      playTone(660, 0.18, 0, 0.14);
      playTone(880, 0.25, 0.16, 0.16);
    } else if (kind === 'transition') {
      playTone(784, 0.14, 0, 0.13);
    } else if (kind === 'warning') {
      playTone(620, 0.1, 0, 0.12);
      playTone(620, 0.1, 0.16, 0.12);
    } else if (kind === 'cutoff') {
      playTone(520, 0.28, 0, 0.18, 'triangle');
      playTone(392, 0.38, 0.24, 0.16, 'triangle');
    }
  } catch {
    // Audio playback may be blocked prior to gesture
  }
}

/**
 * Create a lightweight browser voice recorder for PPDT narration, Lecturette, and CIQ practice.
 */
export function createVoiceRecorder() {
  let mediaRecorder = null;
  let stream = null;
  let chunks = [];
  let startTs = 0;
  let currentUrl = null;

  function revokeCurrentUrl() {
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
  }

  async function start() {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      return { ok: false, reason: 'unsupported' };
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      startTs = Date.now();
      mediaRecorder.start(250);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'denied' };
    }
  }

  function stop() {
    return new Promise((resolve) => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve({ ok: false, audioUrl: null, durationSec: 0 });
        return;
      }

      const elapsedSec = Math.max(1, Math.round((Date.now() - startTs) / 1000));
      mediaRecorder.onstop = () => {
        revokeCurrentUrl();
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        currentUrl = URL.createObjectURL(blob);
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
        }
        resolve({ ok: true, audioUrl: currentUrl, durationSec: elapsedSec });
      };
      mediaRecorder.stop();
    });
  }

  function dispose() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    revokeCurrentUrl();
  }

  return { start, stop, dispose };
}
