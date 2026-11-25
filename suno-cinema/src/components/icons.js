/**
 * Crisp inline SVG icons for Suno Cinema Android Mobile Experience.
 */

export function svgIcon(name, size = 20, cls = '') {
  const s = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true"`;
  switch (name) {
    case 'home':
      return `<svg ${s}><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5z"/></svg>`;
    case 'clips':
      return `<svg ${s}><rect x="4" y="5" width="14" height="16" rx="2"/><path d="M9 10.5l5 3-5 3v-6z" fill="currentColor" stroke="none"/><path d="M8 2h10a2 2 0 0 1 2 2v13"/></svg>`;
    case 'compass':
      return `<svg ${s}><circle cx="12" cy="12" r="9.5"/><polygon points="16 8 13.8 13.8 8 16 10.2 10.2 16 8"/></svg>`;
    case 'search':
      return `<svg ${s}><circle cx="11" cy="11" r="7.5"/><line x1="20.5" y1="20.5" x2="16.3" y2="16.3"/></svg>`;
    case 'cast':
      return `<svg ${s}><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><line x1="2" y1="20" x2="2.01" y2="20"/></svg>`;
    case 'download':
      return `<svg ${s}><path d="M12 4v11"/><polyline points="7 11 12 16 17 11"/><path d="M4 20h16"/></svg>`;
    case 'bell':
      return `<svg ${s}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
    case 'back':
      return `<svg ${s}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
    case 'play':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" class="${cls}" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>`;
    case 'pause':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" class="${cls}" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
    case 'plus':
      return `<svg ${s}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    case 'check':
      return `<svg ${s}><polyline points="20 6 9 17 4 12"/></svg>`;
    case 'thumbsUp':
      return `<svg ${s}><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>`;
    case 'share':
      return `<svg ${s}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
    case 'infoCircle':
      return `<svg ${s}><circle cx="12" cy="12" r="9.5"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    case 'moreVert':
      return `<svg ${s}><circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/></svg>`;
    case 'chevronLeft':
      return `<svg ${s}><polyline points="15 18 9 12 15 6"/></svg>`;
    case 'chevronRight':
      return `<svg ${s}><polyline points="9 18 15 12 9 6"/></svg>`;
    case 'chevronDown':
      return `<svg ${s}><polyline points="6 9 12 15 18 9"/></svg>`;
    case 'volumeOff':
      return `<svg ${s}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
    case 'volumeOn':
      return `<svg ${s}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    case 'settings':
      return `<svg ${s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    case 'shield':
      return `<svg ${s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`;
    case 'close':
      return `<svg ${s}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    case 'refresh':
      return `<svg ${s}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
    case 'next':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" class="${cls}" aria-hidden="true"><polygon points="5 4 15 12 5 20 5 4"/><rect x="16.5" y="4" width="2.5" height="16"/></svg>`;
    case 'phone':
      return `<svg ${s}><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="10" y1="18" x2="14" y2="18"/></svg>`;
    case 'link':
      return `<svg ${s}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
    case 'trailer':
      return `<svg ${s}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`;
    default:
      return `<svg ${s}><circle cx="12" cy="12" r="9"/></svg>`;
  }
}

/**
 * Bold crimson "S" ribbon monogram for Suno Cinema (replaces Netflix N mark).
 */
export function renderSunoRibbonSvg(width = 24, height = 28) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 24 28" aria-hidden="true">
    <defs>
      <linearGradient id="sunoRibbonGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ff1a2d"/>
        <stop offset="55%" stop-color="#e50914"/>
        <stop offset="100%" stop-color="#9e040c"/>
      </linearGradient>
    </defs>
    <path d="M5 3.5C5 2.4 5.9 1.5 7 1.5h11.5v5.2H10.2c-.8 0-1.3.5-1.3 1.2 0 .7.5 1.1 1.4 1.4l5.1 1.7c2.8.9 4.4 2.7 4.4 5.6 0 4.3-3.2 7.2-8.2 7.2H4.5v-5.2h8.1c1 0 1.6-.6 1.6-1.4 0-.8-.5-1.3-1.6-1.7L7.5 13.7C4.8 12.7 3.5 10.9 3.5 8c0-2 .6-3.4 1.5-4.5z" fill="url(#sunoRibbonGrad)"/>
  </svg>`;
}

/**
 * Cute rounded-square red Suno Cinema profile mascot icon (for My Suno tab & header).
 */
export function renderSunoMascotSvg(size = 24) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="6" fill="#e50914"/>
    <circle cx="10.5" cy="12.5" r="1.9" fill="#180406"/>
    <circle cx="21.5" cy="12.5" r="1.9" fill="#180406"/>
    <path d="M11 19.5c2.2 2.4 7.8 2.4 10 0" stroke="#180406" stroke-width="2.1" stroke-linecap="round" fill="none"/>
  </svg>`;
}

export function renderWordmarkSvg() {
  return renderSunoRibbonSvg(22, 26);
}

/**
 * Desktop navbar crimson wordmark replacing Netflix text logo with SUNO CINEMA.
 */
export function renderSunoCinemaDesktopWordmark() {
  return `<span class="dk-wordmark" aria-label="Suno Cinema">SUNO CINEMA</span>`;
}
