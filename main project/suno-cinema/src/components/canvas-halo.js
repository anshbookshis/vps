import { sonicCurtain } from '../utils/audio-curtain.js';

/**
 * Animated Canvas Fluid Halo inspired by Suno Music's organic ambient visualizer.
 * Reacts live to the Web Audio Sonic Curtain FFT bins when auditioning a track mood.
 */
export function mountFluidHalo(canvas, getPalette) {
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const size = (canvas.width = 240);
  canvas.height = 240;
  let rafId = 0;
  let phase = 0;
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.08);
    last = now;

    const freq = sonicCurtain.getFrequencyData();
    let bass = 0;
    let mid = 0;
    if (sonicCurtain.isPlaying && freq.length) {
      for (let i = 0; i < 6; i += 1) bass += freq[i] || 0;
      for (let i = 6; i < 20; i += 1) mid += freq[i] || 0;
      bass /= 6 * 255;
      mid /= 14 * 255;
    } else {
      bass = 0.14 + Math.sin(now * 0.0014) * 0.05;
      mid = 0.12 + Math.cos(now * 0.0011) * 0.04;
    }

    phase += dt * (sonicCurtain.isPlaying ? 1.8 + bass * 2.4 : 0.45);
    const colors = getPalette() || ['#ff0033', '#ff4d6d', '#00f0ff'];

    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;

    // 3 orbiting fluid energy lobes
    for (let i = 0; i < 3; i += 1) {
      const angle = phase + (i * Math.PI * 2) / 3;
      const orbit = 14 + bass * 20;
      const lx = cx + Math.cos(angle) * orbit;
      const ly = cy + Math.sin(angle * 1.2) * orbit;
      const radius = 64 + mid * 28 + i * 8;

      const grad = ctx.createRadialGradient(lx, ly, 4, lx, ly, radius);
      grad.addColorStop(0, colors[i % colors.length] + '99');
      grad.addColorStop(0.55, colors[(i + 1) % colors.length] + '33');
      grad.addColorStop(1, 'transparent');

      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lx, ly, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp outer acoustic ring
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 62 + bass * 10, 0, Math.PI * 2);
    ctx.stroke();

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}
