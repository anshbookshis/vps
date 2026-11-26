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

function normalizeAddonBaseUrl(rawUrl) {
  let trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (/^stremio:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed.slice('stremio://'.length)}`;
  }
  if (!/^https?:\/\//i.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    parsed.pathname = parsed.pathname.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '') || '/';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function deriveAddonName(baseUrl) {
  try {
    return new URL(baseUrl).hostname.replace(/^www\./i, '') || 'Stremio Addon';
  } catch {
    return 'Stremio Addon';
  }
}

/**
 * Normalize a Stremio addon descriptor object or URL into canonical storage format.
 * @param {string|object} entry
 * @returns {{ url: string, name: string, version: string, description: string, types: string[], idPrefixes: string[], enabled: boolean } | null}
 */
export function normalizeStremioAddon(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const url = normalizeAddonBaseUrl(entry);
    if (!url) return null;
    return {
      url,
      name: deriveAddonName(url),
      version: '',
      description: '',
      types: ['movie', 'series'],
      idPrefixes: ['tt'],
      enabled: true,
    };
  }
  if (typeof entry !== 'object') return null;
  const url = normalizeAddonBaseUrl(entry.url || entry.transportUrl || '');
  if (!url) return null;
  const fallbackName = deriveAddonName(url);
  return {
    url,
    name: String(entry.name || fallbackName).trim() || fallbackName,
    version: String(entry.version || '').trim(),
    description: String(entry.description || '').trim(),
    types: Array.isArray(entry.types) ? entry.types.map((t) => String(t).trim()).filter(Boolean) : [],
    idPrefixes: Array.isArray(entry.idPrefixes) ? entry.idPrefixes.map((p) => String(p).trim()).filter(Boolean) : [],
    enabled: entry.enabled !== false,
  };
}

function dedupeStremioAddons(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const norm = normalizeStremioAddon(item);
    if (!norm || seen.has(norm.url)) continue;
    seen.add(norm.url);
    out.push(norm);
  }
  return out;
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
    playerProvider: 'vidlink',
    hlsProxyUrl: '',
    debridProvider: 'realdebrid',
    debridApiKey: '',
    stremioAddonUrl: '',
    stremioAddons: [],
    customResolverUrl: '',
    bootstrapMirrors: [],
    jellyfinUrl: '',
    jellyfinApiKey: '',
  };
  if (typeof localStorage === 'undefined') {
    return { ...defaults, stremioAddons: [] };
  }
  const saved = safeParse(localStorage.getItem(PLAYER_PREFS_KEY), {});
  const merged = { ...defaults, ...(saved && typeof saved === 'object' ? saved : {}) };
  const legacyUrl = normalizeAddonBaseUrl(merged.stremioAddonUrl || '');
  let addons = dedupeStremioAddons(merged.stremioAddons);
  let migrated = false;

  if (addons.length === 0 && legacyUrl) {
    addons = [
      {
        url: legacyUrl,
        name: deriveAddonName(legacyUrl),
        version: '',
        description: 'Migrated from legacy Stremio Addon URL',
        types: ['movie', 'series'],
        idPrefixes: ['tt'],
        enabled: true,
      },
    ];
    migrated = true;
  }

  let bootstrapMirrors = [];
  if (Array.isArray(merged.bootstrapMirrors)) {
    bootstrapMirrors = merged.bootstrapMirrors
      .map((m) => String(m || '').trim())
      .filter((m) => /^https?:\/\//i.test(m));
  } else if (typeof merged.bootstrapMirrors === 'string' && merged.bootstrapMirrors.trim()) {
    bootstrapMirrors = merged.bootstrapMirrors
      .split(/[\r\n,]+/)
      .map((m) => m.trim())
      .filter((m) => /^https?:\/\//i.test(m));
  }

  const result = {
    ...merged,
    stremioAddonUrl: legacyUrl,
    stremioAddons: addons,
    customResolverUrl: String(merged.customResolverUrl || '').trim(),
    bootstrapMirrors,
    jellyfinUrl: String(merged.jellyfinUrl || '').trim().replace(/\/+$/, ''),
    jellyfinApiKey: String(merged.jellyfinApiKey || '').trim(),
  };

  if (migrated) {
    try {
      localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify(result));
    } catch {}
  }
  return result;
}

export function savePlayerPrefs(next) {
  const prev = loadPlayerPrefs();
  const patch = next && typeof next === 'object' ? next : {};
  const merged = { ...prev, ...patch };

  if (Array.isArray(patch.stremioAddons)) {
    merged.stremioAddons = dedupeStremioAddons(patch.stremioAddons);
    if (patch.stremioAddonUrl === undefined) {
      merged.stremioAddonUrl =
        merged.stremioAddons.find((a) => a.enabled !== false)?.url || merged.stremioAddons[0]?.url || '';
    } else {
      merged.stremioAddonUrl = normalizeAddonBaseUrl(patch.stremioAddonUrl);
    }
  } else if (patch.stremioAddonUrl !== undefined) {
    const normLegacy = normalizeAddonBaseUrl(patch.stremioAddonUrl);
    merged.stremioAddonUrl = normLegacy;
    let addons = dedupeStremioAddons(prev.stremioAddons);
    if (normLegacy) {
      const existingIdx = addons.findIndex((a) => a.url === normLegacy);
      if (existingIdx >= 0) {
        addons[existingIdx] = { ...addons[existingIdx], enabled: true };
      } else {
        const entry = normalizeStremioAddon(normLegacy);
        if (entry) addons = [entry, ...addons];
      }
    } else if (prev.stremioAddonUrl && addons.length === 1 && addons[0].url === normalizeAddonBaseUrl(prev.stremioAddonUrl)) {
      addons = [];
    }
    merged.stremioAddons = addons;
  } else {
    merged.stremioAddons = dedupeStremioAddons(merged.stremioAddons);
    merged.stremioAddonUrl = normalizeAddonBaseUrl(merged.stremioAddonUrl);
  }

  merged.customResolverUrl = String(merged.customResolverUrl || '').trim();

  if (patch.bootstrapMirrors !== undefined) {
    if (Array.isArray(patch.bootstrapMirrors)) {
      merged.bootstrapMirrors = patch.bootstrapMirrors
        .map((m) => String(m || '').trim())
        .filter((m) => /^https?:\/\//i.test(m));
    } else if (typeof patch.bootstrapMirrors === 'string') {
      merged.bootstrapMirrors = patch.bootstrapMirrors
        .split(/[\r\n,]+/)
        .map((m) => m.trim())
        .filter((m) => /^https?:\/\//i.test(m));
    } else {
      merged.bootstrapMirrors = [];
    }
  }

  if (patch.jellyfinUrl !== undefined) {
    merged.jellyfinUrl = String(patch.jellyfinUrl || '').trim().replace(/\/+$/, '');
  }
  if (patch.jellyfinApiKey !== undefined) {
    merged.jellyfinApiKey = String(patch.jellyfinApiKey || '').trim();
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify(merged));
    } catch {}
  }
  return merged;
}

/**
 * Load persisted Stremio addon descriptors (auto-migrating any legacy stremioAddonUrl).
 * @returns {Array<{ url: string, name: string, version: string, description: string, types: string[], idPrefixes: string[], enabled: boolean }>}
 */
export function loadStremioAddons() {
  return loadPlayerPrefs().stremioAddons;
}

/**
 * Persist the Stremio addons list (deduplicated & normalized) into player prefs.
 * @param {Array<object|string>} addons
 * @returns {Array<{ url: string, name: string, version: string, description: string, types: string[], idPrefixes: string[], enabled: boolean }>}
 */
export function saveStremioAddons(addons) {
  return savePlayerPrefs({ stremioAddons: Array.isArray(addons) ? addons : [] }).stremioAddons;
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

export function loadProgressMap() {
  if (typeof localStorage === 'undefined') return {};
  const existing = safeParse(localStorage.getItem(PROGRESS_KEY), null);
  return existing && typeof existing === 'object' ? existing : {};
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
      items: [],
    },
    {
      id: MY_LIST_COLLECTION_ID,
      name: 'My List',
      subtitle: 'Saved watchlist',
      auto: true,
      items: [],
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

export const NOTIF_SEEN_KEY = 'suno_cinema:notif_seen';

/**
 * Load dismissed/seen notification IDs from localStorage.
 * @returns {string[]}
 */
export function loadNotifSeenIds() {
  if (typeof localStorage === 'undefined') return [];
  const saved = safeParse(localStorage.getItem(NOTIF_SEEN_KEY), []);
  return Array.isArray(saved) ? saved : [];
}

/**
 * Persist seen notification IDs to localStorage.
 * @param {string[]} ids
 * @returns {string[]}
 */
export function saveNotifSeenIds(ids) {
  const clean = Array.from(new Set(Array.isArray(ids) ? ids : [])).slice(0, 60);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(NOTIF_SEEN_KEY, JSON.stringify(clean));
    } catch {}
  }
  return clean;
}
