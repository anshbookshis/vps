export const APPEARANCE_KEY = 'suno:appearance_settings';
export const PLAYER_PREFS_KEY = 'suno_cinema:player_prefs';
export const PROGRESS_KEY = 'suno_cinema:progress';
export const COLLECTIONS_KEY = 'suno_cinema:collections';
export const SEARCH_HISTORY_KEY = 'suno_cinema:searches';
export const LIKED_COLLECTION_ID = 'liked-films';

export const APPEARANCE_THEMES = [
  {
    id: 'default',
    name: 'Suno Crimson',
    accent: '#ff0033',
    secondary: '#ff4d6d',
    glow: 'rgba(255, 0, 51, 0.45)',
    description: 'Signature Suno red & obsidian ink',
    colors: ['#ff0033', '#990022', '#ff4d6d'],
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    accent: '#00f0ff',
    secondary: '#ff007f',
    glow: 'rgba(0, 240, 255, 0.45)',
    description: 'Neon cyan & magenta night drive',
    colors: ['#00f0ff', '#ff007f', '#120826'],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    accent: '#ff5e62',
    secondary: '#ff9966',
    glow: 'rgba(255, 94, 98, 0.45)',
    description: 'Warm coral dusk & golden hour',
    colors: ['#ff5e62', '#ff9966', '#3a1418'],
  },
  {
    id: 'emerald',
    name: 'Emerald',
    accent: '#1db954',
    secondary: '#10b981',
    glow: 'rgba(29, 185, 84, 0.45)',
    description: 'Emerald resonance & deep jade',
    colors: ['#1db954', '#10b981', '#064e3b'],
  },
  {
    id: 'gold',
    name: 'Retro Gold',
    accent: '#f59e0b',
    secondary: '#fbbf24',
    glow: 'rgba(245, 158, 11, 0.45)',
    description: '35mm analog champagne & amber',
    colors: ['#f59e0b', '#fbbf24', '#451a03'],
  },
];

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function loadAppearanceSettings() {
  if (typeof localStorage === 'undefined') {
    return { theme: 'default', amoled: false, fluidVisualizer: true };
  }
  const parsed = safeParse(localStorage.getItem(APPEARANCE_KEY), {});
  return {
    theme: parsed?.theme || 'default',
    amoled: Boolean(parsed?.amoled),
    fluidVisualizer: parsed?.fluidVisualizer !== false,
  };
}

export function saveAppearanceSettings(next) {
  const clean = {
    theme: next?.theme || 'default',
    amoled: Boolean(next?.amoled),
    fluidVisualizer: next?.fluidVisualizer !== false,
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(clean));
    } catch {
      // Ignore storage quota issues
    }
  }
  applyAppearanceSettings(clean);
  return clean;
}

export function applyAppearanceSettings(settings) {
  if (typeof document === 'undefined') return;
  const s = settings || loadAppearanceSettings();
  const root = document.documentElement;
  if (s.theme && s.theme !== 'default') {
    root.setAttribute('data-theme', s.theme);
  } else {
    root.removeAttribute('data-theme');
  }
  if (s.amoled) {
    root.setAttribute('data-amoled', 'true');
  } else {
    root.removeAttribute('data-amoled');
  }
}

export function loadPlayerPrefs() {
  const defaults = {
    autoplay: true,
    sub: 'en',
    dub: false,
    uiScale: 1,
    tmdbApiKey: '',
    activeMoodId: 'midnight-synth',
    customTrackQuery: '',
  };
  if (typeof localStorage === 'undefined') return defaults;
  return { ...defaults, ...safeParse(localStorage.getItem(PLAYER_PREFS_KEY), {}) };
}

export function savePlayerPrefs(next) {
  const merged = { ...loadPlayerPrefs(), ...next };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify(merged));
    } catch {
      // Ignore
    }
  }
  return merged;
}

export function getMediaKey(item) {
  if (!item) return '';
  if (item.mediaType === 'anime' && item.anilistId) return `anime:${item.anilistId}`;
  return `${item.mediaType || 'movie'}:${item.tmdbId || item.id}`;
}

export function loadProgressMap() {
  if (typeof localStorage === 'undefined') return {};
  return safeParse(localStorage.getItem(PROGRESS_KEY), {});
}

export function saveMediaProgress(item, patch) {
  const key = getMediaKey(item);
  if (!key) return loadProgressMap();
  const map = loadProgressMap();
  const prev = map[key] || {};
  map[key] = {
    ...prev,
    ...patch,
    item: {
      id: item.id,
      tmdbId: item.tmdbId,
      anilistId: item.anilistId,
      mediaType: item.mediaType,
      title: item.title,
      year: item.year,
      creator: item.creator,
      poster: item.poster,
      backdrop: item.backdrop,
      genres: item.genres,
      sonic: item.sonic,
      totalSeasons: item.totalSeasons,
      totalEpisodes: item.totalEpisodes,
    },
    updatedAt: Date.now(),
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
    } catch {
      // Ignore
    }
  }
  return map;
}

export function loadCollections() {
  const defaults = [
    {
      id: LIKED_COLLECTION_ID,
      name: 'Liked Films',
      subtitle: 'Auto mixtape',
      auto: true,
      items: [],
    },
    {
      id: 'after-midnight-drive',
      name: 'After Midnight Synth Arc',
      subtitle: 'Curated double feature',
      auto: false,
      items: ['movie:335984', 'movie:64690', 'anime:1'],
    },
    {
      id: 'sub-bass-imax',
      name: 'Sub-Bass & IMAX Night',
      subtitle: 'Curated double feature',
      auto: false,
      items: ['movie:438631', 'movie:157336', 'movie:27205'],
    },
  ];
  if (typeof localStorage === 'undefined') return defaults;
  const saved = safeParse(localStorage.getItem(COLLECTIONS_KEY), null);
  return Array.isArray(saved) && saved.length > 0 ? saved : defaults;
}

export function saveCollections(collections) {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    } catch {
      // Ignore
    }
  }
  return collections;
}

export function loadSearchHistory() {
  if (typeof localStorage === 'undefined') return [];
  const saved = safeParse(localStorage.getItem(SEARCH_HISTORY_KEY), []);
  return Array.isArray(saved) ? saved : [];
}

export function rememberSearch(term) {
  const clean = String(term || '').trim();
  if (!clean) return loadSearchHistory();
  const prev = loadSearchHistory().filter((x) => x.toLowerCase() !== clean.toLowerCase());
  const next = [clean, ...prev].slice(0, 10);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
  }
  return next;
}

export function forgetSearch(term) {
  const next = loadSearchHistory().filter((x) => x !== term);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
  }
  return next;
}
