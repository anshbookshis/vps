/**
 * Generative Cinema Key-Art SVG fallback so movie/series cards never show broken images
 * when offline or when a remote poster host blocks hotlinking.
 */

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hashSeed(input) {
  let h = 2166136261;
  const str = String(input || 'suno');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function wrapTitle(title, maxChars = 16) {
  const words = String(title || 'Untitled').split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + ' ' + w).length <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
    if (lines.length === 3) break;
  }
  if (current && lines.length < 3) lines.push(current);
  return lines;
}

/**
 * Create a deterministic SVG data URI poster/backdrop tailored to a film's Sonic DNA.
 * @param {object} item
 * @param {'poster'|'wide'} [variant='wide']
 * @returns {string}
 */
export function buildCinemaFallbackArt(item, variant = 'wide') {
  const title = item?.title || 'Suno Cinema';
  const director = item?.creator || item?.director || 'Suno Feature';
  const year = item?.year || '';
  const typeLabel =
    item?.mediaType === 'tv' ? 'SERIES' : item?.mediaType === 'anime' ? 'ANIME' : 'FILM';
  const seed = hashSeed(`${title}:${item?.tmdbId || item?.anilistId || year}`);
  const palette = item?.palette || ['#ff0033', '#ff4d6d', '#151518'];
  const c1 = palette[0] || '#ff0033';
  const c2 = palette[1] || '#ff4d6d';

  const w = variant === 'poster' ? 400 : 640;
  const h = variant === 'poster' ? 600 : 360;
  const cx1 = 18 + (seed % 64);
  const cy1 = 18 + ((seed >> 4) % 52);
  const cx2 = 25 + ((seed >> 8) % 55);
  const cy2 = 30 + ((seed >> 12) % 52);

  // Build deterministic sonic waveform bars along the bottom edge
  const bars = [];
  const barCount = variant === 'poster' ? 28 : 42;
  const startX = 28;
  const step = (w - 56) / barCount;
  const baseY = h - 28;
  for (let i = 0; i < barCount; i += 1) {
    const wave = Math.sin(i * 0.45 + (seed % 11)) * 0.5 + 0.5;
    const pulse = ((seed >> (i % 16)) & 7) / 7;
    const bh = Math.round(6 + (wave * 0.65 + pulse * 0.35) * 26);
    bars.push(
      `<rect x="${(startX + i * step).toFixed(1)}" y="${baseY - bh}" width="${Math.max(
        2,
        step * 0.52
      ).toFixed(1)}" height="${bh}" rx="1.5" fill="${i % 5 === 0 ? c1 : '#ffffff'}" opacity="${(
        0.22 +
        wave * 0.55
      ).toFixed(2)}"/>`
    );
  }

  const lines = wrapTitle(title, variant === 'poster' ? 14 : 24);
  const fontSize = variant === 'poster' ? (lines.length > 2 ? 28 : 34) : lines.length > 2 ? 28 : 34;
  const titleYStart = variant === 'poster' ? h * 0.48 : h * 0.44;
  const titleSvg = lines
    .map(
      (line, idx) =>
        `<text x="28" y="${titleYStart + idx * (fontSize * 1.15)}" fill="#ffffff" font-family="Roboto,system-ui,sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="-0.6">${escapeXml(
          line
        )}</text>`
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="g1" cx="${cx1}%" cy="${cy1}%" r="72%">
      <stop offset="0%" stop-color="${c1}" stop-opacity="0.48"/>
      <stop offset="55%" stop-color="${c2}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#070709" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="g2" cx="${cx2}%" cy="${cy2}%" r="60%">
      <stop offset="0%" stop-color="${c2}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#070709" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#070709"/>
  <rect width="${w}" height="${h}" fill="url(#g1)"/>
  <rect width="${w}" height="${h}" fill="url(#g2)"/>
  <rect x="16" y="16" width="${w - 32}" height="${h - 32}" rx="8" fill="none" stroke="#ffffff" stroke-opacity="0.1"/>
  <text x="28" y="42" fill="#ffffff" fill-opacity="0.72" font-family="Roboto,system-ui,sans-serif" font-size="11" font-weight="700" letter-spacing="2.2">SUNO CINEMA • ${escapeXml(
    typeLabel
  )}</text>
  ${
    year
      ? `<text x="${w - 28}" y="42" text-anchor="end" fill="#ffffff" fill-opacity="0.6" font-family="Roboto,system-ui,sans-serif" font-size="12" font-weight="500">${escapeXml(
          year
        )}</text>`
      : ''
  }
  ${titleSvg}
  <text x="28" y="${titleYStart + lines.length * (fontSize * 1.15) + 12}" fill="#ffffff" fill-opacity="0.68" font-family="Roboto,system-ui,sans-serif" font-size="13" font-weight="500">${escapeXml(
    director
  )}</text>
  ${bars.join('')}
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
