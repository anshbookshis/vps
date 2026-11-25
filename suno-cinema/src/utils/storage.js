export const APPEARANCE_KEY = 'suno:appearance_settings';
export const PLAYER_PREFS_KEY = 'suno_cinema:player_prefs';
export const PROGRESS_KEY = 'suno_cinema:progress';
export const COLLECTIONS_KEY = 'suno_cinema:collections';
export const DOWNLOADS_KEY = 'suno_cinema:downloads';
export const PROFILE_KEY = 'suno_cinema:profile';
export const SEARCH_HISTORY_KEY = 'suno_cinema:searches';
export const LIKED_COLLECTION_ID = 'liked-films';
export const MY_LIST_COLLECTION_ID = 'my-list';

export const APPEARANCE_THEMES = [
  {
    id: 'default',
    name: 'Suno Cinema Red',
    accent: '#e50914',
    secondary: '#ff2b38',
    glow: 'rgba(229, 9, 20, 0.45)',
    description: 'Pure AMOLED black & signature Suno red',
    colors: ['#e50914', '#b20710', '#ff3b47'],
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
    return { theme: 'default', amoled: true, fluidVisualizer: false };
  }
  const parsed = safeParse(localStorage.getItem(APPEARANCE_KEY), {});
  return {
    theme: parsed?.theme || 'default',
    amoled: parsed?.amoled !== false,
    fluidVisualizer: Boolean(parsed?.fluidVisualizer),
  };
}

export function saveAppearanceSettings(next) {
  const clean = {
    theme: next?.theme || 'default',
    amoled: next?.amoled !== false,
    fluidVisualizer: Boolean(next?.fluidVisualizer),
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(clean));
    } catch {}
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
    phoneFrameOnDesktop: false,
  };
  if (typeof localStorage === 'undefined') return defaults;
  return { ...defaults, ...safeParse(localStorage.getItem(PLAYER_PREFS_KEY), {}) };
}

export function savePlayerPrefs(next) {
  const merged = { ...loadPlayerPrefs(), ...next };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify(merged));
    } catch {}
  }
  return merged;
}

export function loadProfile() {
  const defaults = { name: 'Ansh', smartDownloads: false };
  if (typeof localStorage === 'undefined') return defaults;
  return { ...defaults, ...safeParse(localStorage.getItem(PROFILE_KEY), {}) };
}

export function saveProfile(next) {
  const merged = { ...loadProfile(), ...next };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
    } catch {}
  }
  return merged;
}

export function getMediaKey(item) {
  if (!item) return '';
  if (item.mediaType === 'anime' && item.anilistId) return `anime:${item.anilistId}`;
  if (item.tmdbId) return `${item.mediaType || 'movie'}:${item.tmdbId}`;
  if (item.imdbId) return `${item.mediaType || 'movie'}:imdb:${item.imdbId}`;
  return String(item.id || '');
}

export function loadProgressMap(seedCatalog = []) {
  if (typeof localStorage === 'undefined') return {};
  const existing = safeParse(localStorage.getItem(PROGRESS_KEY), null);
  if (existing && typeof existing === 'object') return existing;

  // Seed starter Continue Watching entries cleanly on very first visit so My Suno mirrors the Android layout
  const seedKeys = ['movie:1068452', 'movie:102382', 'movie:157336'];
  const seeded = {};
  const times = [
    { currentTime: 2420, duration: 9300 },
    { currentTime: 4680, duration: 8520 },
    { currentTime: 1850, duration: 10140 },
  ];
  seedKeys.forEach((k, i) => {
    const found = seedCatalog.find((x) => getMediaKey(x) === k);
    if (found) {
      seeded[k] = {
        ...times[i],
        season: 1,
        episode: 1,
        updatedAt: Date.now() - i * 3600000,
        item: found,
        badge: i === 0 ? 'Watch Now' : '',
      };
    }
  });
  if (Object.keys(seeded).length > 0) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(seeded));
    } catch {}
  }
  return seeded;
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
      id: key,
      tmdbId: item.tmdbId,
      imdbId: item.imdbId,
      anilistId: item.anilistId,
      mediaType: item.mediaType,
      title: item.title,
      year: item.year,
      creator: item.creator,
      cast: item.cast,
      runtime: item.runtime,
      rating: item.rating,
      overview: item.overview,
      poster: item.poster,
      backdrop: item.backdrop,
      logo: item.logo,
      trailerId: item.trailerId,
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
    } catch {}
  }
  return map;
}

export function removeMediaProgress(key) {
  const map = loadProgressMap();
  delete map[key];
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
    } catch {}
  }
  return map;
}

export function loadCollections() {
  const defaults = [
    {
      id: LIKED_COLLECTION_ID,
      name: 'Liked',
      subtitle: 'Auto liked list',
      auto: true,
      items: ['movie:1239511', 'movie:1163194', 'movie:579974'],
    },
    {
      id: MY_LIST_COLLECTION_ID,
      name: 'My List',
      subtitle: 'Saved watchlist',
      auto: true,
      items: ['movie:26815', 'movie:157336', 'movie:438631', 'tv:89113'],
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
    } catch {}
  }
  return collections;
}

export function loadDownloads() {
  if (typeof localStorage === 'undefined') return [];
  const saved = safeParse(localStorage.getItem(DOWNLOADS_KEY), []);
  return Array.isArray(saved) ? saved : [];
}

export function saveDownloads(list) {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(list));
    } catch {}
  }
  return list;
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
    } catch {}
  }
  return next;
}

export function forgetSearch(term) {
  const next = loadSearchHistory().filter((x) => x !== term);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch {}
  }
  return next;
}
