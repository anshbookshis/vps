/**
 * Shared UI utilities: safe HTML escaping, mm:ss formatting, timer lifecycle, and local image loading.
 */

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Managed interval timer that guarantees clean teardown on view unmount.
 */
export class TimerHandle {
  constructor() {
    this.id = null;
  }

  start(onTick, intervalMs = 250) {
    this.stop();
    this.id = window.setInterval(onTick, intervalMs);
  }

  stop() {
    if (this.id !== null) {
      window.clearInterval(this.id);
      this.id = null;
    }
  }
}

/**
 * Load user-selected local image files as Image elements (zero server upload).
 * @param {FileList|File[]} fileList
 * @returns {Promise<Array<{ label: string, imageEl: HTMLImageElement }>>}
 */
export async function loadLocalImages(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
  const results = [];

  for (const file of files.slice(0, 12)) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Image load failed'));
        el.src = url;
      });
      results.push({ label: file.name.replace(/\.[^.]+$/, ''), imageEl: img });
    } catch {
      URL.revokeObjectURL(url);
    }
  }
  return results;
}
