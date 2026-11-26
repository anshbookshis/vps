import { CATALOG_ITEMS } from '../data/catalog.js';
import { SONIC_PROFILES } from './sonic-engine.js';

/**
 * Dual-mode, zero-key-required media API client.
 * Combines:
 *  - Verified local curated catalog (66 titles with handcrafted Sonic DNA)
 *  - Cinemeta (https://v3-cinemeta.strem.io) — keyless CORS API for all movies & TV series,
 *    including TMDB IDs (moviedb_id), HD backdrops, transparent title logos, trailers, and episodes
 *  - AniList GraphQL (https://graphql.anilist.co) — keyless CORS API for all anime
 *  - Wikidata CORS fallback (IMDb P345 -> TMDB P4947 / P4983) when Cinemeta search items need TMDB lookup
 *  - Optional user-configured TMDB API key
 */

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';
const ANILIST_URL = 'https://graphql.anilist.co';

export const BROWSE_GENRES = [
  'All Genres',
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
];

const metaCache = new Map();
const catalogCache = new Map();

async function fetchJsonSafe(url, options = {}, timeoutMs = 8000) {
  const controller = !options.signal && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(url, controller ? { ...options, signal: controller.signal } : options);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) throw new Error('Expected JSON');
    return await resp.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function inferSonicFromGenres(genres = [], type = 'movie', seed = 0) {
  const gText = genres.join(' ').toLowerCase();
  let moodId = 'midnight-synth';
  let bpm = 96;
  let texture = 'Atmospheric Cinema Score';
  let listenBefore = 'M83, Kavinsky, or Nicholas Britell';
  let cooldownCue = 'Ambient midnight synth pad';
  let vector = { pulse: 0.68, nocturne: 0.72, warmth: 0.52, scale: 0.68, tension: 0.68 };

  if (type === 'anime' || gText.includes('animation')) {
    moodId = 'anime-neon';
    bpm = 126;
    texture = 'Vibrant Synth & Percussion';
    listenBefore = 'RADWIMPS, Yoko Kanno, or Metro Boomin';
    cooldownCue = 'Tokyo city pop dusk outro';
    vector = { pulse: 0.86, nocturne: 0.72, warmth: 0.62, scale: 0.78, tension: 0.74 };
  } else if (gText.includes('sci-fi') || gText.includes('adventure') || gText.includes('action')) {
    moodId = 'imax-sub';
    bpm = 88;
    texture = 'Sub-Bass & Orchestral Scale';
    listenBefore = 'Hans Zimmer, Ludwig Göransson, or Gesaffelstein';
    cooldownCue = 'Deep analog sub-bass fade';
    vector = { pulse: 0.84, nocturne: 0.64, warmth: 0.40, scale: 0.94, tension: 0.88 };
  } else if (gText.includes('music') || gText.includes('jazz') || gText.includes('crime')) {
    moodId = 'jazz-smoke';
    bpm = 114;
    texture = 'Syncopated Brass & Groove';
    listenBefore = 'Miles Davis, Justin Hurwitz, or Khruangbin';
    cooldownCue = 'Warm brushed snare & Rhodes';
    vector = { pulse: 0.82, nocturne: 0.74, warmth: 0.72, scale: 0.56, tension: 0.76 };
  } else if (gText.includes('romance') || gText.includes('drama')) {
    moodId = 'lofi-rain';
    bpm = 76;
    texture = 'Felt Piano & Intimate Strings';
    listenBefore = 'Frank Ocean, Ryuichi Sakamoto, or Max Richter';
    cooldownCue = '3 AM rain on glass piano';
    vector = { pulse: 0.36, nocturne: 0.82, warmth: 0.88, scale: 0.44, tension: 0.44 };
  } else if (gText.includes('comedy') || gText.includes('family')) {
    moodId = 'indie-tape';
    bpm = 104;
    texture = 'Warm Indie Guitar & Tape';
    listenBefore = 'Phoebe Bridgers, Vampire Weekend, or Jon Brion';
    cooldownCue = 'Sun-bleached acoustic chords';
    vector = { pulse: 0.62, nocturne: 0.40, warmth: 0.86, scale: 0.42, tension: 0.38 };
  } else if (gText.includes('horror') || gText.includes('thriller') || gText.includes('mystery')) {
    moodId = 'midnight-synth';
    bpm = 92;
    texture = 'Noir Synth Pulse & Tension';
    listenBefore = 'Oneohtrix Point Never, Trent Reznor, or Thom Yorke';
    cooldownCue = 'Minimal low-pass vinyl drone';
    vector = { pulse: 0.74, nocturne: 0.94, warmth: 0.30, scale: 0.70, tension: 0.92 };
  }

  // Slight deterministic variance so every film gets organic ranking separation
  const tweak = ((seed % 7) - 3) * 0.02;
  vector.pulse = Math.max(0.1, Math.min(0.99, vector.pulse + tweak));
  const profile = SONIC_PROFILES.find((p) => p.id === moodId) || SONIC_PROFILES[0];

  return {
    moodId,
    bpm,
    texture,
    listenBefore,
    cooldownCue,
    palette: [profile.color, '#27272a', '#09090b'],
    vector,
  };
}

function parseSeasonsFromVideos(videos = []) {
  const bySeason = new Map();
  for (const v of videos) {
    const s = Number(v.season ?? 0);
    if (s <= 0) continue; // Skip specials unless needed
    if (!bySeason.has(s)) bySeason.set(s, []);
    bySeason.get(s).push({
      season: s,
      episode: Number(v.episode ?? v.number ?? bySeason.get(s).length + 1),
      name: v.name || v.title || `Episode ${v.episode || bySeason.get(s).length + 1}`,
      overview: v.overview || v.description || '',
      thumbnail: v.thumbnail || '',
      released: (v.firstAired || v.released || '').slice(0, 10),
      rating: v.rating || '',
    });
  }
  return Array.from(bySeason.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([seasonNumber, episodes]) => ({
      seasonNumber,
      name: `Season ${seasonNumber}`,
      episodeCount: episodes.length,
      episodes: episodes.sort((a, b) => a.episode - b.episode),
    }));
}

export function normalizeCinemetaItem(raw, fallbackType = 'movie') {
  const mediaType = raw.type === 'series' || fallbackType === 'series' ? 'tv' : 'movie';
  const imdbId = raw.imdb_id || (String(raw.id || '').startsWith('tt') ? raw.id : '');
  const tmdbId = raw.moviedb_id ? String(raw.moviedb_id) : '';
  const genres = Array.isArray(raw.genres) && raw.genres.length ? raw.genres : Array.isArray(raw.genre) ? raw.genre : [mediaType === 'tv' ? 'Series' : 'Movie'];
  const yearMatch = String(raw.year || raw.releaseInfo || '').match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : '';
  const seed = (imdbId || raw.name || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const sonic = inferSonicFromGenres(genres, mediaType, seed);
  const seasonsList = Array.isArray(raw.videos) && raw.videos.length ? parseSeasonsFromVideos(raw.videos) : null;
  const trailerId =
    Array.isArray(raw.trailers) && raw.trailers[0]?.source
      ? raw.trailers[0].source
      : Array.isArray(raw.trailerStreams) && raw.trailerStreams[0]?.ytId
      ? raw.trailerStreams[0].ytId
      : '';

  const key = tmdbId ? `${mediaType}:${tmdbId}` : imdbId ? `${mediaType}:imdb:${imdbId}` : `${mediaType}:${raw.id}`;

  return {
    id: key,
    tmdbId,
    imdbId,
    mediaType,
    title: raw.name || raw.title || 'Untitled',
    year,
    creator: Array.isArray(raw.director) && raw.director.length
      ? raw.director.join(', ')
      : Array.isArray(raw.writer) && raw.writer.length
      ? raw.writer[0]
      : mediaType === 'tv'
      ? 'Series'
      : 'Feature Film',
    cast: Array.isArray(raw.cast) ? raw.cast.slice(0, 8) : [],
    runtime: raw.runtime || (mediaType === 'tv' ? 'Series' : ''),
    rating: raw.imdbRating ? String(raw.imdbRating) : '7.8',
    genres,
    country: raw.country || '',
    awards: raw.awards || '',
    overview: raw.description || '',
    poster: raw.poster || (imdbId ? `https://images.metahub.space/poster/medium/${imdbId}/img` : ''),
    backdrop: raw.background || (imdbId ? `https://images.metahub.space/background/medium/${imdbId}/img` : ''),
    logo: raw.logo || '',
    trailerId,
    seasonsList,
    totalEpisodes: seasonsList?.[0]?.episodeCount || (mediaType === 'tv' ? 10 : undefined),
    palette: sonic.palette,
    sonic: {
      moodId: sonic.moodId,
      bpm: sonic.bpm,
      texture: sonic.texture,
      listenBefore: sonic.listenBefore,
      cooldownCue: sonic.cooldownCue,
      vector: sonic.vector,
    },
    source: 'cinemeta',
  };
}

function normalizeAniListItem(m) {
  return {
    id: `anime:${m.id}`,
    anilistId: String(m.id),
    malId: m.idMal ? String(m.idMal) : '',
    mediaType: 'anime',
    title: m.title?.english || m.title?.romaji || 'Anime',
    year: m.seasonYear ? String(m.seasonYear) : '',
    creator: m.studios?.nodes?.[0]?.name || 'Anime Studio',
    cast: [],
    runtime: m.duration ? `${m.duration}m` : '24m/ep',
    totalEpisodes: m.episodes || 12,
    rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.2',
    genres: m.genres || ['Anime'],
    overview: (m.description || '').replace(/<[^>]+>/g, '').slice(0, 320),
    poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
    backdrop: m.bannerImage || m.coverImage?.extraLarge || '',
    logo: '',
    trailerId: m.trailer?.site === 'youtube' ? m.trailer.id : '',
    palette: [m.coverImage?.color || '#ff4d6d', '#00f0ff', '#141418'],
    sonic: {
      moodId: 'anime-neon',
      bpm: 126,
      texture: 'Anime OST & Synth Percussion',
      listenBefore: 'YOASOBI, Kenshi Yonezu, Yoko Kanno, or RADWIMPS',
      cooldownCue: 'After-credits Japanese city pop or acoustic piano',
      vector: { pulse: 0.85, nocturne: 0.72, warmth: 0.58, scale: 0.74, tension: 0.76 },
    },
    source: 'anilist-live',
  };
}

export function searchLocalItems(query, type = 'all') {
  const q = String(query || '').trim().toLowerCase();
  return CATALOG_ITEMS.filter((item) => {
    if (type !== 'all' && item.mediaType !== type) return false;
    if (!q) return true;
    const hay = [
      item.title,
      item.creator,
      item.year,
      item.overview,
      ...(item.genres || []),
      item.sonic?.listenBefore || '',
      item.sonic?.texture || '',
      item.sonic?.moodId || '',
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export async function loadCatalogData() {
  try {
    const data = await fetchJsonSafe('./api/catalog');
    if (Array.isArray(data.items) && data.items.length > 0) return data.items;
  } catch {
    // Static GitHub Pages fallback
  }
  return CATALOG_ITEMS;
}

/**
 * Fetch live movies or TV series from Cinemeta (free, keyless, CORS-enabled).
 * Supports genre filtering and skip pagination across thousands of titles.
 */
export async function fetchCinemetaCatalog(type = 'movie', { genre = '', skip = 0 } = {}) {
  const cmType = type === 'tv' || type === 'series' ? 'series' : 'movie';
  const cacheKey = `${cmType}:${genre}:${skip}`;
  if (catalogCache.has(cacheKey)) return catalogCache.get(cacheKey);

  const parts = [];
  if (genre && genre !== 'All Genres') parts.push(`genre=${encodeURIComponent(genre)}`);
  if (skip > 0) parts.push(`skip=${skip}`);
  const extra = parts.length ? `/${parts.join('&')}` : '';
  const url = `${CINEMETA_BASE}/catalog/${cmType}/top${extra}.json`;

  const data = await fetchJsonSafe(url);
  const items = (data?.metas || []).map((m) => normalizeCinemetaItem(m, cmType));
  catalogCache.set(cacheKey, items);
  return items;
}

/**
 * Fetch live trending or genre-filtered anime from AniList GraphQL (keyless CORS).
 */
export async function loadTrendingAnime({ genre = '', page = 1 } = {}) {
  if (!genre && page === 1) {
    try {
      const data = await fetchJsonSafe('./api/anilist/trending');
      if (Array.isArray(data.items) && data.items.length > 0) return data.items;
    } catch {
      // Fall through to direct browser AniList request
    }
  }

  try {
    const gql = `
      query ($page: Int, $genre: String) {
        Page(page: $page, perPage: 20) {
          media(type: ANIME, sort: TRENDING_DESC, isAdult: false, genre: $genre) {
            id
            idMal
            title { romaji english }
            episodes
            duration
            seasonYear
            averageScore
            genres
            description(asHtml: false)
            coverImage { extraLarge large color }
            bannerImage
            trailer { id site }
            studios(isMain: true) { nodes { name } }
          }
        }
      }
    `;
    const variables = { page };
    if (genre && genre !== 'All Genres') variables.genre = genre;
    const json = await fetchJsonSafe(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: gql, variables }),
    });
    const media = json?.data?.Page?.media || [];
    if (media.length > 0) return media.map(normalizeAniListItem);
  } catch {
    // Offline fallback
  }

  return CATALOG_ITEMS.filter((x) => x.mediaType === 'anime');
}

function normalizeLookupTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getWikidataHeaders() {
  const headers = { Accept: 'application/sparql-results+json' };
  if (typeof window === 'undefined') {
    headers['User-Agent'] = 'SunoCinema/1.0';
  }
  return headers;
}

async function resolveTmdbFromWikidataImdb(imdbId, mediaType) {
  if (!imdbId) return '';
  const prop = mediaType === 'tv' || mediaType === 'series' ? 'wdt:P4983' : 'wdt:P4947';
  const query = `SELECT ?tmdb WHERE { ?item wdt:P345 "${imdbId}" ; ${prop} ?tmdb . } LIMIT 1`;
  try {
    const res = await fetchJsonSafe(
      `https://query.wikidata.org/sparql?origin=*&format=json&query=${encodeURIComponent(query)}`,
      { headers: getWikidataHeaders() },
      4500
    );
    return res?.results?.bindings?.[0]?.tmdb?.value || '';
  } catch {
    return '';
  }
}

async function resolveImdbFromWikidataTmdb(tmdbId, mediaType) {
  const cleanId = String(tmdbId || '').trim();
  if (!/^\d+$/.test(cleanId)) return '';
  const prop = mediaType === 'tv' || mediaType === 'series' ? 'wdt:P4983' : 'wdt:P4947';
  const query = `SELECT ?imdb WHERE { ?item ${prop} "${cleanId}" ; wdt:P345 ?imdb . } LIMIT 1`;
  try {
    const res = await fetchJsonSafe(
      `https://query.wikidata.org/sparql?origin=*&format=json&query=${encodeURIComponent(query)}`,
      { headers: getWikidataHeaders() },
      4500
    );
    const imdb = String(res?.results?.bindings?.[0]?.imdb?.value || '').trim();
    return /^tt\d+$/i.test(imdb) ? imdb : '';
  } catch {
    return '';
  }
}

async function resolveImdbFromCinemetaSearch(item) {
  const rawTitle = String(item?.title || '').trim();
  if (!rawTitle || /^(movie|tv)\s*#\d+$/i.test(rawTitle)) return '';
  const cmType = item.mediaType === 'tv' || item.mediaType === 'series' ? 'series' : 'movie';
  const targetTitle = normalizeLookupTitle(rawTitle);
  const targetYear = String(item.year || '').match(/\d{4}/)?.[0] || '';
  const targetTmdb = String(item.tmdbId || '').trim();

  const extractImdb = (m) => {
    const candidate = m?.imdb_id || (String(m?.id || '').startsWith('tt') ? m.id : '');
    return /^tt\d+$/i.test(String(candidate || '')) ? String(candidate) : '';
  };

  try {
    const data = await fetchJsonSafe(
      `${CINEMETA_BASE}/catalog/${cmType}/top/search=${encodeURIComponent(rawTitle)}.json`,
      {},
      4500
    );
    const metas = Array.isArray(data?.metas) ? data.metas : [];
    if (!metas.length) return '';

    if (targetTmdb) {
      const byTmdb = metas.find((m) => String(m?.moviedb_id || '') === targetTmdb && extractImdb(m));
      if (byTmdb) return extractImdb(byTmdb);
    }

    if (targetYear) {
      const exactYear = metas.find((m) => {
        const mYear = String(m?.year || m?.releaseInfo || '').match(/\d{4}/)?.[0] || '';
        return normalizeLookupTitle(m?.name) === targetTitle && mYear === targetYear && extractImdb(m);
      });
      if (exactYear) return extractImdb(exactYear);

      const nearYear = metas.find((m) => {
        const mYear = String(m?.year || m?.releaseInfo || '').match(/\d{4}/)?.[0] || '';
        return (
          normalizeLookupTitle(m?.name) === targetTitle &&
          mYear &&
          Math.abs(Number(mYear) - Number(targetYear)) <= 1 &&
          extractImdb(m)
        );
      });
      if (nearYear) return extractImdb(nearYear);
    }

    const exactTitle = metas.find((m) => normalizeLookupTitle(m?.name) === targetTitle && extractImdb(m));
    if (exactTitle) return extractImdb(exactTitle);

    return '';
  } catch {
    return '';
  }
}

/**
 * Hydrate any item (e.g. a Cinemeta search hit lacking moviedb_id, or a TMDB-only / Quick Launch item lacking imdbId)
 * into a stream-ready object with IMDb ID, TMDB ID, HD backdrop, logo, cast, and episodes.
 */
export async function resolveFullMetadata(item) {
  if (!item || item.mediaType === 'anime' || item.mediaType === 'hls') return item;

  const cacheKey = item.imdbId
    ? `${item.mediaType || 'movie'}:${item.imdbId}`
    : item.tmdbId
    ? `${item.mediaType || 'movie'}:tmdb:${item.tmdbId}`
    : item.id;
  if (cacheKey && metaCache.has(cacheKey)) {
    const cached = metaCache.get(cacheKey);
    return {
      ...item,
      ...cached,
      tmdbId: cached.tmdbId || item.tmdbId || '',
      imdbId: cached.imdbId || item.imdbId || '',
    };
  }

  let working = { ...item };

  // Resolve missing imdbId even when tmdbId is already present (needed by Stremio addons & OpenSubtitles v3)
  if (!working.imdbId) {
    const [wikidataImdb, cinemetaImdb] = await Promise.all([
      working.tmdbId ? resolveImdbFromWikidataTmdb(working.tmdbId, working.mediaType) : Promise.resolve(''),
      resolveImdbFromCinemetaSearch(working),
    ]);
    const resolvedImdbId = wikidataImdb || cinemetaImdb;
    if (resolvedImdbId) {
      working.imdbId = resolvedImdbId;
    }
  }

  const isPlaceholderTitle = !working.title || /^(movie|tv)\s*#\d+$/i.test(String(working.title).trim());
  const needsCinemetaMeta =
    Boolean(working.imdbId) &&
    (!working.tmdbId ||
      !working.backdrop ||
      isPlaceholderTitle ||
      (working.mediaType === 'tv' && (!working.seasonsList || !working.seasonsList[0]?.episodes)));

  if (needsCinemetaMeta) {
    try {
      const cmType = working.mediaType === 'tv' || working.mediaType === 'series' ? 'series' : 'movie';
      const data = await fetchJsonSafe(
        `${CINEMETA_BASE}/meta/${cmType}/${encodeURIComponent(working.imdbId)}.json`,
        {},
        5000
      );
      if (data?.meta) {
        const hydrated = normalizeCinemetaItem(data.meta, cmType);
        const preservedTmdb = hydrated.tmdbId || working.tmdbId || '';
        const merged = {
          ...working,
          ...hydrated,
          id: preservedTmdb ? `${hydrated.mediaType}:${preservedTmdb}` : hydrated.id,
          tmdbId: preservedTmdb,
          imdbId: hydrated.imdbId || working.imdbId,
          title: isPlaceholderTitle ? hydrated.title : working.title || hydrated.title,
          poster: working.poster || hydrated.poster,
          backdrop: hydrated.backdrop || working.backdrop,
          sonic: working.source === 'cinemeta' ? hydrated.sonic : working.sonic || hydrated.sonic,
          palette: working.source === 'cinemeta' ? hydrated.palette : working.palette || hydrated.palette,
        };
        if (!merged.tmdbId && merged.imdbId) {
          merged.tmdbId = await resolveTmdbFromWikidataImdb(merged.imdbId, merged.mediaType);
          if (merged.tmdbId) merged.id = `${merged.mediaType}:${merged.tmdbId}`;
        }
        working = merged;
      }
    } catch {
      // Keep resolved imdbId and fall through to Wikidata IMDb->TMDB fallback if needed
    }
  }

  if (!working.tmdbId && working.imdbId) {
    const tmdbId = await resolveTmdbFromWikidataImdb(working.imdbId, working.mediaType);
    if (tmdbId) {
      working = { ...working, tmdbId, id: `${working.mediaType || 'movie'}:${tmdbId}` };
    }
  }

  if (working.imdbId || (item.imdbId && working.tmdbId)) {
    const mediaType = working.mediaType || 'movie';
    if (cacheKey) metaCache.set(cacheKey, working);
    if (working.imdbId) metaCache.set(`${mediaType}:${working.imdbId}`, working);
    if (working.tmdbId) metaCache.set(`${mediaType}:tmdb:${working.tmdbId}`, working);
  }

  return working;
}

async function searchAniListBrowser(query) {
  const gql = `
    query ($search: String) {
      Page(page: 1, perPage: 12) {
        media(search: $search, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id
          idMal
          title { romaji english }
          episodes
          duration
          seasonYear
          averageScore
          genres
          description(asHtml: false)
          coverImage { extraLarge large color }
          bannerImage
          trailer { id site }
          studios(isMain: true) { nodes { name } }
        }
      }
    }
  `;
  const json = await fetchJsonSafe(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
  });
  return (json?.data?.Page?.media || []).map(normalizeAniListItem);
}

async function searchCinemetaBrowser(query, type = 'all') {
  const tasks = [];
  if (type === 'all' || type === 'movie') {
    tasks.push(
      fetchJsonSafe(`${CINEMETA_BASE}/catalog/movie/top/search=${encodeURIComponent(query)}.json`)
        .then((d) => (d?.metas || []).slice(0, 14).map((m) => normalizeCinemetaItem(m, 'movie')))
        .catch(() => [])
    );
  }
  if (type === 'all' || type === 'tv') {
    tasks.push(
      fetchJsonSafe(`${CINEMETA_BASE}/catalog/series/top/search=${encodeURIComponent(query)}.json`)
        .then((d) => (d?.metas || []).slice(0, 14).map((m) => normalizeCinemetaItem(m, 'series')))
        .catch(() => [])
    );
  }
  const lists = await Promise.all(tasks);
  return lists.flat();
}

async function searchTmdbBrowser(query, apiKey) {
  if (!apiKey) return [];
  const isV4 = apiKey.length > 45;
  const headers = isV4 ? { Authorization: `Bearer ${apiKey}` } : {};
  const keyParam = isV4 ? '' : `&api_key=${encodeURIComponent(apiKey)}`;
  const data = await fetchJsonSafe(
    `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&include_adult=false${keyParam}`,
    { headers }
  );
  return (data?.results || [])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 14)
    .map((r) => {
      const mediaType = r.media_type === 'tv' ? 'tv' : 'movie';
      return {
        id: `${mediaType}:${r.id}`,
        tmdbId: String(r.id),
        mediaType,
        title: r.title || r.name || 'Untitled',
        year: (r.release_date || r.first_air_date || '').slice(0, 4),
        creator: mediaType === 'tv' ? 'TMDB Series' : 'TMDB Feature',
        runtime: mediaType === 'tv' ? 'Series' : 'Feature',
        totalSeasons: mediaType === 'tv' ? 3 : undefined,
        totalEpisodes: mediaType === 'tv' ? 10 : undefined,
        rating: r.vote_average ? r.vote_average.toFixed(1) : '7.5',
        genres: [mediaType === 'tv' ? 'Series' : 'Cinema'],
        overview: r.overview || '',
        poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '',
        backdrop: r.backdrop_path ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}` : '',
        palette: ['#ff0033', '#27272a', '#09090b'],
        sonic: inferSonicFromGenres([], mediaType, r.id),
        source: 'tmdb-live',
      };
    });
}

/**
 * Search across ALL movies, TV shows, and anime using free keyless APIs
 * (Cinemeta + AniList + curated local + optional TMDB key).
 */
export async function searchAllMedia(query, tmdbApiKey = '', type = 'all', hlsProxyUrl = '') {
  const clean = String(query || '').trim();
  if (!clean) return [];

  const local = searchLocalItems(clean, type);
  const parallel = [
    searchCinemetaBrowser(clean, type).catch(() => []),
    type === 'all' || type === 'anime' ? searchAniListBrowser(clean).catch(() => []) : Promise.resolve([]),
    tmdbApiKey ? searchTmdbBrowser(clean, tmdbApiKey).catch(() => []) : Promise.resolve([]),
  ];

  // Query configured Edge Proxy or same-origin Node /api/search so server-side TMDB key & IMDb fuzzy lookup can enrich results
  const cleanProxy = String(hlsProxyUrl || '').trim().replace(/\/+$/, '');
  const searchEndpoints = [];
  if (cleanProxy && /^https?:\/\//i.test(cleanProxy)) {
    searchEndpoints.push(`${cleanProxy}/api/search?q=${encodeURIComponent(clean)}&type=${encodeURIComponent(type)}`);
  } else if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    searchEndpoints.push(`./api/search?q=${encodeURIComponent(clean)}&type=${encodeURIComponent(type)}`);
  }
  for (const endpoint of searchEndpoints) {
    parallel.push(
      fetchJsonSafe(endpoint, {
        headers: tmdbApiKey ? { 'x-tmdb-key': tmdbApiKey } : {},
      })
        .then((d) => d?.items || [])
        .catch(() => [])
    );
  }

  let external = await Promise.all(parallel);
  const merged = [...local];
  const seenKeys = new Set(merged.map((x) => x.id));
  const seenTitles = new Set(merged.map((x) => `${x.mediaType}:${x.title.toLowerCase()}:${x.year}`));

  for (const list of external) {
    for (const item of list) {
      const titleSig = `${item.mediaType}:${(item.title || '').toLowerCase()}:${item.year || ''}`;
      if (!seenKeys.has(item.id) && !seenTitles.has(titleSig)) {
        seenKeys.add(item.id);
        seenTitles.add(titleSig);
        merged.push(item);
      }
    }
  }

  // Typo/prefix fallback if primary queries returned very few hits (e.g. "ramanayan" -> "ramana")
  if (merged.length < 2 && clean.length >= 5) {
    const trimmedPrefix = clean.slice(0, Math.max(4, clean.length - 3));
    if (trimmedPrefix !== clean) {
      const fallbackLists = await Promise.all([
        searchCinemetaBrowser(trimmedPrefix, type).catch(() => []),
        tmdbApiKey ? searchTmdbBrowser(trimmedPrefix, tmdbApiKey).catch(() => []) : Promise.resolve([]),
      ]);
      for (const list of fallbackLists) {
        for (const item of list) {
          const titleSig = `${item.mediaType}:${(item.title || '').toLowerCase()}:${item.year || ''}`;
          if (!seenKeys.has(item.id) && !seenTitles.has(titleSig)) {
            seenKeys.add(item.id);
            seenTitles.add(titleSig);
            merged.push(item);
          }
        }
      }
    }
  }
  return merged;
}

export async function fetchDynamicHomeFeeds({ pageOffset = 0 } = {}) {
  const genrePairs = [
    ['Action', 'Thriller'],
    ['Sci-Fi', 'Comedy'],
    ['Crime', 'Drama'],
    ['Adventure', 'Mystery'],
  ];
  const [genreLabelA, genreLabelB] = genrePairs[pageOffset % genrePairs.length];
  const skip = (pageOffset % 4) * 25;

  const [trendingMovies, trendingSeries, genreFeedA, genreFeedB, trendingAnime] = await Promise.all([
    fetchCinemetaCatalog('movie', { skip }).catch(() => []),
    fetchCinemetaCatalog('series', { skip }).catch(() => []),
    fetchCinemetaCatalog('movie', { genre: genreLabelA, skip: pageOffset > 0 ? 25 : 0 }).catch(() => []),
    fetchCinemetaCatalog('movie', { genre: genreLabelB, skip: pageOffset > 0 ? 25 : 0 }).catch(() => []),
    loadTrendingAnime({ page: 1 + (pageOffset % 3) }).catch(() => []),
  ]);

  return {
    trendingMovies,
    trendingSeries,
    genreLabelA,
    genreFeedA,
    genreLabelB,
    genreFeedB,
    trendingAnime,
  };
}

export async function fetchLanguageCatalog(language = 'English') {
  const lang = String(language || 'English');
  if (lang === 'Japanese') {
    return loadTrendingAnime({ page: 1 });
  }
  if (lang === 'Hindi' || lang === 'South Indian') {
    const regional = CATALOG_ITEMS.filter(
      (x) => x.regionTag === 'south-india' || x.regionTag === 'india' || (x.country || '').includes('India')
    );
    const extra = await Promise.all([
      searchCinemetaBrowser('RRR', 'movie').catch(() => []),
      searchCinemetaBrowser('Shah Rukh Khan', 'movie').catch(() => []),
    ]);
    return [...regional, ...extra.flat()];
  }
  if (lang === 'Korean') {
    const res = await Promise.all([
      searchCinemetaBrowser('Squid', 'tv').catch(() => []),
      searchCinemetaBrowser('Parasite', 'movie').catch(() => []),
      searchCinemetaBrowser('Business Proposal', 'tv').catch(() => []),
      searchCinemetaBrowser('Train to Busan', 'movie').catch(() => []),
    ]);
    return res.flat();
  }
  if (lang === 'Spanish') {
    const res = await Promise.all([
      searchCinemetaBrowser('Money Heist', 'tv').catch(() => []),
      searchCinemetaBrowser('Elite', 'tv').catch(() => []),
      searchCinemetaBrowser('Pan', 'movie').catch(() => []),
    ]);
    return res.flat();
  }
  // English / All Languages -> live Cinemeta mixed movies & series
  const [movies, series] = await Promise.all([
    fetchCinemetaCatalog('movie').catch(() => []),
    fetchCinemetaCatalog('series').catch(() => []),
  ]);
  const combined = [];
  const max = Math.max(movies.length, series.length);
  for (let i = 0; i < max; i += 1) {
    if (movies[i]) combined.push(movies[i]);
    if (series[i]) combined.push(series[i]);
  }
  return combined;
}

export function srtToVtt(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) return 'WEBVTT\n\n';
  const clean = rawText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const trimmedStart = clean.trimStart();
  if (/^WEBVTT(?:[ \t\n]|$)/i.test(trimmedStart)) {
    return trimmedStart;
  }
  const converted = trimmedStart.replace(
    /^(\d{1,2}):(\d{2}:\d{2})[,.](\d{3})([ \t]*-->[ \t]*)(\d{1,2}):(\d{2}:\d{2})[,.](\d{3})(.*)$/gm,
    (_, h1, ms1, f1, arrow, h2, ms2, f2, rest) =>
      `${h1.padStart(2, '0')}:${ms1}.${f1}${arrow}${h2.padStart(2, '0')}:${ms2}.${f2}${rest}`
  );
  return `WEBVTT\n\n${converted}`;
}

const SUB_LANG_ALIASES = {
  en: ['eng', 'en', 'english'],
  hi: ['hin', 'hi', 'hindi'],
  es: ['spa', 'es', 'spanish'],
  ja: ['jpn', 'ja', 'japanese'],
  fr: ['fre', 'fra', 'fr', 'french'],
  de: ['ger', 'deu', 'de', 'german'],
  it: ['ita', 'it', 'italian'],
  pt: ['por', 'pt', 'portuguese'],
  ko: ['kor', 'ko', 'korean'],
  zh: ['chi', 'zho', 'zh', 'chinese'],
};

function normalizeSubtitleLang(lang) {
  const lower = String(lang || 'und').trim().toLowerCase();
  for (const [iso2, list] of Object.entries(SUB_LANG_ALIASES)) {
    if (list.includes(lower)) return { iso2, label: list[2].charAt(0).toUpperCase() + list[2].slice(1), raw: lower };
  }
  return { iso2: lower.slice(0, 2) || 'en', label: String(lang || 'Subtitles').toUpperCase(), raw: lower };
}

/**
 * Fetch free CORS-enabled subtitles from OpenSubtitles v3 Stremio addon (zero API key required).
 */
export async function fetchFreeSubtitles(item, { season = 1, episode = 1, preferredLang = 'en' } = {}) {
  if (!item?.imdbId) return [];
  const isSeries = item.mediaType === 'tv' || item.mediaType === 'series';
  const stremioType = isSeries ? 'series' : 'movie';
  const stremioId = isSeries ? `${item.imdbId}:${Math.max(1, Number(season))}:${Math.max(1, Number(episode))}` : item.imdbId;
  const endpoint = `https://opensubtitles-v3.strem.io/subtitles/${stremioType}/${encodeURIComponent(stremioId)}.json`;

  try {
    const data = await fetchJsonSafe(endpoint);
    const subs = Array.isArray(data?.subtitles) ? data.subtitles : [];
    const prefNorm = normalizeSubtitleLang(preferredLang).iso2;

    const mapped = subs
      .filter((s) => s?.url && /^https?:\/\//i.test(s.url))
      .map((s, idx) => {
        const norm = normalizeSubtitleLang(s.lang);
        const rawUrl = String(s.url);
        const format = rawUrl.toLowerCase().includes('.vtt') ? 'vtt' : 'srt';
        return {
          id: String(s.id || `os-${idx}`),
          lang: norm.iso2,
          rawLang: String(s.lang || ''),
          label: `${norm.label}${s.subtitleFileName ? ` • ${String(s.subtitleFileName).slice(0, 28)}` : ''}`,
          url: rawUrl,
          format,
          source: 'opensubtitles-v3',
          priority: norm.iso2 === prefNorm ? 0 : norm.iso2 === 'en' ? 1 : 2,
        };
      })
      .sort((a, b) => a.priority - b.priority);

    // Keep up to 18 tracks with max 3 per language to keep HUD picker clean
    const counts = new Map();
    const trimmed = [];
    for (const track of mapped) {
      const c = counts.get(track.lang) || 0;
      if (c >= 3) continue;
      counts.set(track.lang, c + 1);
      trimmed.push(track);
      if (trimmed.length >= 18) break;
    }
    return trimmed;
  } catch {
    return [];
  }
}

/**
 * Fetch an external .srt or .vtt track, convert SRT to WebVTT in-browser, and return a playable VTT URL.
 * Falls back to configurable Edge Proxy /api/proxy/subtitles if direct CORS fetch fails.
 */
export async function loadSubtitleTrackAsVttUrl(track, { hlsProxyUrl = '' } = {}) {
  if (!track?.url) return null;
  const cleanBase = String(hlsProxyUrl || '')
    .trim()
    .replace(/\/api\/proxy\/(hls|subtitles)\/?$/i, '')
    .replace(/\/+$/, '');
  const proxyUrl = cleanBase
    ? `${cleanBase}/api/proxy/subtitles?url=${encodeURIComponent(track.url)}`
    : `./api/proxy/subtitles?url=${encodeURIComponent(track.url)}`;

  let payloadText = '';
  try {
    const resp = await fetch(track.url);
    if (resp.ok) {
      payloadText = await resp.text();
    }
  } catch {
    // Fallback to subtitle proxy
  }

  if (!payloadText) {
    try {
      const proxyResp = await fetch(proxyUrl);
      if (proxyResp.ok) {
        payloadText = await proxyResp.text();
      }
    } catch {
      return null;
    }
  }

  if (!payloadText || !payloadText.trim()) return null;
  const vttText = srtToVtt(payloadText);

  if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const blob = new Blob([vttText], { type: 'text/vtt;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    return { vttText, url: blobUrl, isBlob: true };
  }

  return {
    vttText,
    url: `data:text/vtt;charset=utf-8,${encodeURIComponent(vttText)}`,
    isBlob: false,
  };
}

export async function fetchTvSeasonsData(tmdbId, tmdbApiKey = '', imdbId = '') {
  if (imdbId) {
    try {
      const data = await fetchJsonSafe(`${CINEMETA_BASE}/meta/series/${encodeURIComponent(imdbId)}.json`);
      if (data?.meta?.videos?.length) {
        return parseSeasonsFromVideos(data.meta.videos);
      }
    } catch {
      // Fall through
    }
  }

  try {
    const headers = tmdbApiKey ? { 'x-tmdb-key': tmdbApiKey } : {};
    const data = await fetchJsonSafe(`./api/tv/${encodeURIComponent(tmdbId)}/seasons`, { headers });
    if (Array.isArray(data.seasons)) return data.seasons;
  } catch {
    // Fall through
  }

  if (tmdbApiKey) {
    try {
      const isV4 = tmdbApiKey.length > 45;
      const headers = isV4 ? { Authorization: `Bearer ${tmdbApiKey}` } : {};
      const suffix = isV4 ? '' : `?api_key=${encodeURIComponent(tmdbApiKey)}`;
      const data = await fetchJsonSafe(`https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}${suffix}`, {
        headers,
      });
      const seasons = (data?.seasons || [])
        .filter((s) => s.season_number >= 1)
        .map((s) => ({
          seasonNumber: s.season_number,
          name: s.name || `Season ${s.season_number}`,
          episodeCount: s.episode_count || 10,
        }));
      if (seasons.length > 0) return seasons;
    } catch {
      // Fall through
    }
  }

  return null;
}

function normalizeManifestUrls(rawUrl) {
  let trimmed = String(rawUrl || '').trim();
  if (!trimmed) return { baseUrl: '', manifestUrl: '' };
  if (/^stremio:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed.slice('stremio://'.length)}`;
  }
  if (!/^https?:\/\//i.test(trimmed)) return { baseUrl: '', manifestUrl: '' };
  try {
    const parsed = new URL(trimmed);
    const cleanPath = parsed.pathname.replace(/\/+$/, '').replace(/\/manifest\.json$/i, '');
    parsed.hash = '';
    parsed.pathname = cleanPath || '/';
    const baseUrl = parsed.toString().replace(/\/+$/, '');
    parsed.pathname = `${cleanPath}/manifest.json`;
    const manifestUrl = parsed.toString();
    return { baseUrl, manifestUrl };
  } catch {
    return { baseUrl: '', manifestUrl: '' };
  }
}

/**
 * Fetch and validate a Stremio addon manifest.json.
 * Normalizes `stremio://` links to `https://`, fetches `manifest.json` directly first,
 * and falls back to Edge Proxy `/api/resolve/addon-manifest` if CORS or upstream blocks browser fetch.
 *
 * @param {string} rawUrl
 * @param {{ hlsProxyUrl?: string }} [options]
 * @returns {Promise<{ id: string, url: string, manifestUrl: string, name: string, version: string, description: string, logo: string, types: string[], idPrefixes: string[], resources: Array, enabled: boolean }>}
 */
export async function fetchAddonManifest(rawUrl, { hlsProxyUrl = '' } = {}) {
  const { baseUrl, manifestUrl } = normalizeManifestUrls(rawUrl);
  if (!baseUrl || !manifestUrl) {
    throw new Error('Enter a valid Stremio addon URL (https://... or stremio://...)');
  }

  let payload = null;
  let directError = null;

  try {
    payload = await fetchJsonSafe(manifestUrl, { headers: { Accept: 'application/json' } }, 6000);
  } catch (err) {
    directError = err;
  }

  if (!payload) {
    const cleanProxy = String(hlsProxyUrl || '')
      .trim()
      .replace(/\/api\/(?:proxy\/(?:hls|subtitles)|resolve\/(?:stream|addon-manifest))\/?$/i, '')
      .replace(/\/+$/, '');
    const proxyEndpoint =
      cleanProxy && /^https?:\/\//i.test(cleanProxy)
        ? `${cleanProxy}/api/resolve/addon-manifest?url=${encodeURIComponent(manifestUrl)}`
        : `./api/resolve/addon-manifest?url=${encodeURIComponent(manifestUrl)}`;

    try {
      payload = await fetchJsonSafe(proxyEndpoint, { headers: { Accept: 'application/json' } }, 6000);
    } catch (proxyErr) {
      throw new Error(
        `Failed to load addon manifest (${directError?.message || proxyErr?.message || 'CORS or network error'})`
      );
    }
  }

  const manifest = payload?.manifest && typeof payload.manifest === 'object' ? payload.manifest : payload;
  if (!manifest || typeof manifest !== 'object' || (!manifest.name && !manifest.id && !Array.isArray(manifest.resources))) {
    throw new Error('Response is not a valid Stremio addon manifest.json');
  }

  let fallbackName = 'Stremio Addon';
  try {
    fallbackName = new URL(baseUrl).hostname.replace(/^www\./i, '') || fallbackName;
  } catch {}

  return {
    id: String(manifest.id || baseUrl),
    url: baseUrl,
    manifestUrl,
    name: String(manifest.name || fallbackName).trim() || fallbackName,
    version: String(manifest.version || '1.0.0').trim(),
    description: String(manifest.description || '').trim(),
    logo: typeof manifest.logo === 'string' ? manifest.logo : '',
    types: Array.isArray(manifest.types) ? manifest.types.map(String) : ['movie', 'series'],
    idPrefixes: Array.isArray(manifest.idPrefixes) ? manifest.idPrefixes.map(String) : ['tt'],
    resources: Array.isArray(manifest.resources) ? manifest.resources : ['stream'],
    enabled: true,
  };
}

function isArchiveTitleMatch(queryTitle, docTitle) {
  const q = normalizeLookupTitle(queryTitle);
  const d = normalizeLookupTitle(docTitle);
  if (!q || !d) return false;
  if (d === q) return true;
  const stripped = d
    .replace(
      /\b(?:19\d{2}|20\d{2}|full movie|full film|hd|uhd|4k|1080p|720p|480p|remastered|restored|colorized|uncut)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  return stripped === q;
}

function isOpenArchiveDoc(doc, queryTitle, targetYear) {
  if (!doc?.identifier) return false;
  const docTitle = String(doc.title || '');
  const wantsJunk = /\b(trailer|teaser|featurette|soundtrack|ost|extrait|clip|promo|reaction|review)\b/i.test(queryTitle);
  if (!wantsJunk && /\b(trailer|teaser|featurette|soundtrack|ost|extrait|clip|promo|behind the scenes|reaction|review)\b/i.test(docTitle)) {
    return false;
  }
  if (!isArchiveTitleMatch(queryTitle, docTitle)) return false;

  if (targetYear && doc.year) {
    const docYear = String(doc.year).match(/\d{4}/)?.[0] || '';
    if (docYear && Math.abs(Number(docYear) - Number(targetYear)) > 2) return false;
  }

  const collections = Array.isArray(doc.collection) ? doc.collection.map((c) => String(c).toLowerCase()) : null;
  if (collections && collections.some((c) => /movie_trailers|social-media-video|mirrortube/i.test(c))) {
    return false;
  }

  const lic = String(doc.licenseurl || '').toLowerCase();
  if (lic) {
    return /publicdomain|creativecommons|cc0|zero/i.test(lic);
  }
  // On live Archive.org (where collection metadata exists), require an explicit open/PD licenseurl
  // unless from a trusted public-domain government/prelinger archive, avoiding unverified community uploads.
  if (collections) {
    return collections.some((c) => /^(?:prelinger|usgovfilms|nasa)$/i.test(c));
  }
  return true;
}

function pickBestArchiveMediaFile(files = []) {
  if (!Array.isArray(files) || files.length === 0) return null;
  const hlsFile = files.find(
    (f) => typeof f?.name === 'string' && /\.m3u8$/i.test(f.name) && !/trailer|sample|preview/i.test(f.name)
  );
  if (hlsFile) return hlsFile;

  const mp4Files = files.filter(
    (f) =>
      typeof f?.name === 'string' &&
      /\.mp4$/i.test(f.name) &&
      !/trailer|sample|preview/i.test(f.name)
  );
  if (!mp4Files.length) return null;

  mp4Files.sort((a, b) => {
    const a512 = /512kb/i.test(`${a.format || ''} ${a.name || ''}`) ? 1 : 0;
    const b512 = /512kb/i.test(`${b.format || ''} ${b.name || ''}`) ? 1 : 0;
    if (a512 !== b512) return a512 - b512;
    const aHeight = Number(a.height || 0);
    const bHeight = Number(b.height || 0);
    if (aHeight !== bHeight) return bHeight - aHeight;
    return Number(b.size || 0) - Number(a.size || 0);
  });

  return mp4Files[0];
}

/**
 * Keyless Archive.org public-domain / open-license film lookup.
 * Searches `archive.org/advancedsearch.php` and verifies `/metadata/{id}` files,
 * returning a direct `.mp4` or `.m3u8` URL when a verified open-license match exists.
 *
 * @param {string} title
 * @param {string|number} [year='']
 * @returns {Promise<{ identifier: string, title: string, year: string, url: string, format: 'hls'|'mp4', type: 'hls'|'direct', quality: string, licenseUrl: string, source: 'archive.org' } | null>}
 */
export async function fetchArchiveOrgDirectStream(title, year = '') {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle || cleanTitle.length < 2 || /^(movie|tv)\s*#\d+$/i.test(cleanTitle)) return null;
  const cleanYear = String(year || '').match(/\d{4}/)?.[0] || '';

  try {
    const safeTitle = cleanTitle.replace(/["\\]/g, ' ').trim();
    const searchQuery = `title:("${safeTitle}") AND mediatype:(movies)`;
    const searchUrl =
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(searchQuery)}` +
      `&fl[]=identifier&fl[]=title&fl[]=year&fl[]=licenseurl&fl[]=collection&fl[]=downloads` +
      `&sort[]=downloads+desc&rows=12&output=json`;

    const searchData = await fetchJsonSafe(searchUrl, {}, 4000);
    const docs = Array.isArray(searchData?.response?.docs) ? searchData.response.docs : [];
    const candidates = docs.filter((d) => isOpenArchiveDoc(d, cleanTitle, cleanYear)).slice(0, 2);
    if (!candidates.length) return null;

    for (const doc of candidates) {
      try {
        const meta = await fetchJsonSafe(
          `https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`,
          {},
          4500
        );
        const metaLic = String(meta?.metadata?.licenseurl || doc.licenseurl || '').toLowerCase();
        if (metaLic && !/publicdomain|creativecommons|cc0|zero/i.test(metaLic)) {
          continue;
        }
        const chosen = pickBestArchiveMediaFile(meta?.files || []);
        if (!chosen?.name) continue;

        const encodedPath = chosen.name
          .split('/')
          .map((seg) => encodeURIComponent(seg))
          .join('/');
        const host = meta?.d1 || meta?.server || '';
        const dir = meta?.dir || '';
        const directUrl =
          host && dir
            ? `https://${host}${dir.startsWith('/') ? '' : '/'}${dir.replace(/\/+$/, '')}/${encodedPath}`
            : `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodedPath}`;

        const isHls = /\.m3u8$/i.test(chosen.name);
        const height = Number(chosen.height || 0);
        return {
          identifier: String(doc.identifier),
          title: String(meta?.metadata?.title || doc.title || cleanTitle),
          year: String(meta?.metadata?.year || doc.year || cleanYear),
          url: directUrl,
          format: isHls ? 'hls' : 'mp4',
          type: isHls ? 'hls' : 'direct',
          quality: height >= 2160 ? '4K UHD' : height >= 1080 ? '1080p' : height >= 720 ? '720p' : 'HD',
          licenseUrl: String(meta?.metadata?.licenseurl || doc.licenseurl || ''),
          source: 'archive.org',
        };
      } catch {
        // Try next candidate
      }
    }
    return null;
  } catch {
    return null;
  }
}
