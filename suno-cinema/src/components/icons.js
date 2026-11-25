/**
 * Crisp inline SVG icons matching Suno Music's clean stroke aesthetic.
 */

export function svgIcon(name, size = 20, cls = '') {
  const s = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true"`;
  switch (name) {
    case 'menu':
      return `<svg ${s}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
    case 'home':
      return `<svg ${s}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z"/></svg>`;
    case 'compass':
      return `<svg ${s}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`;
    case 'wave':
      return `<svg ${s}><path d="M2 12h3l2-6 4 12 4-10 3 7 2-3h2"/></svg>`;
    case 'film':
      return `<svg ${s}><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="7" y1="4" x2="7" y2="20"/><line x1="17" y1="4" x2="17" y2="20"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`;
    case 'library':
      return `<svg ${s}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`;
    case 'search':
      return `<svg ${s}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
    case 'play':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" class="${cls}" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>`;
    case 'pause':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" class="${cls}" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
    case 'prev':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" class="${cls}" aria-hidden="true"><polygon points="19 20 9 12 19 4 19 20"/><rect x="5" y="4" width="2.5" height="16"/></svg>`;
    case 'next':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" class="${cls}" aria-hidden="true"><polygon points="5 4 15 12 5 20 5 4"/><rect x="16.5" y="4" width="2.5" height="16"/></svg>`;
    case 'plus':
      return `<svg ${s}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    case 'check':
      return `<svg ${s}><polyline points="20 6 9 17 4 12"/></svg>`;
    case 'heart':
      return `<svg ${s}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    case 'heartFill':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" class="${cls}" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    case 'chevronLeft':
      return `<svg ${s}><polyline points="15 18 9 12 15 6"/></svg>`;
    case 'chevronRight':
      return `<svg ${s}><polyline points="9 18 15 12 9 6"/></svg>`;
    case 'chevronUp':
      return `<svg ${s}><polyline points="18 15 12 9 6 15"/></svg>`;
    case 'chevronDown':
      return `<svg ${s}><polyline points="6 9 12 15 18 9"/></svg>`;
    case 'settings':
      return `<svg ${s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    case 'music':
      return `<svg ${s}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    case 'sparkles':
      return `<svg ${s}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></svg>`;
    case 'close':
      return `<svg ${s}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    case 'more':
      return `<svg ${s}><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>`;
    case 'external':
      return `<svg ${s}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    case 'tv':
      return `<svg ${s}><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>`;
    case 'link':
      return `<svg ${s}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
    case 'shield':
      return `<svg ${s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`;
    case 'sliders':
      return `<svg ${s}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`;
    case 'refresh':
      return `<svg ${s}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
    case 'info':
      return `<svg ${s}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    case 'trailer':
      return `<svg ${s}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`;
    default:
      return `<svg ${s}><circle cx="12" cy="12" r="9"/></svg>`;
  }
}

export function renderWordmarkSvg() {
  return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="var(--accent, #ff0033)"/>
    <path d="M9.4 7.7v8.6l6.8-4.3z" fill="#ffffff"/>
    <circle cx="17.2" cy="7.3" r="1.6" fill="#ffffff" opacity="0.9"/>
  </svg>`;
}
