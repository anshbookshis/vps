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

async function fetchJsonSafe(url, options = {}) {
  const resp = await fetch(url, options);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('Expected JSON');
  return resp.json();
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

async function resolveTmdbFromWikidataImdb(imdbId, mediaType) {
  if (!imdbId) return '';
  const prop = mediaType === 'tv' ? 'wdt:P4983' : 'wdt:P4947';
  const query = `SELECT ?tmdb WHERE { ?item wdt:P345 "${imdbId}" ; ${prop} ?tmdb . } LIMIT 1`;
  try {
    const res = await fetchJsonSafe(
      `https://query.wikidata.org/sparql?origin=*&format=json&query=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/sparql-results+json' } }
    );
    return res?.results?.bindings?.[0]?.tmdb?.value || '';
  } catch {
    return '';
  }
}

/**
 * Hydrate any item (e.g. a Cinemeta search hit lacking moviedb_id or full episodes)
 * into a VidRift-ready playable object with TMDB ID, HD backdrop, logo, cast, and episodes.
 */
export async function resolveFullMetadata(item) {
  if (!item || item.mediaType === 'anime') return item;
  const cacheKey = item.imdbId ? `${item.mediaType}:${item.imdbId}` : item.id;
  if (metaCache.has(cacheKey)) return { ...item, ...metaCache.get(cacheKey) };

  // Already has both tmdbId and (if movie, logo/backdrop; if tv, seasonsList with episodes)
  const needsCinemetaMeta =
    Boolean(item.imdbId) &&
    (!item.tmdbId ||
      !item.backdrop ||
      (item.mediaType === 'tv' && (!item.seasonsList || !item.seasonsList[0]?.episodes)));

  if (needsCinemetaMeta) {
    try {
      const cmType = item.mediaType === 'tv' ? 'series' : 'movie';
      const data = await fetchJsonSafe(`${CINEMETA_BASE}/meta/${cmType}/${encodeURIComponent(item.imdbId)}.json`);
      if (data?.meta) {
        const hydrated = normalizeCinemetaItem(data.meta, cmType);
        // Preserve handcrafted sonic DNA if item came from curated catalog
        const merged = {
          ...hydrated,
          sonic: item.source === 'cinemeta' ? hydrated.sonic : item.sonic || hydrated.sonic,
          palette: item.source === 'cinemeta' ? hydrated.palette : item.palette || hydrated.palette,
        };
        if (!merged.tmdbId && item.imdbId) {
          merged.tmdbId = await resolveTmdbFromWikidataImdb(item.imdbId, item.mediaType);
          if (merged.tmdbId) merged.id = `${merged.mediaType}:${merged.tmdbId}`;
        }
        metaCache.set(cacheKey, merged);
        return merged;
      }
    } catch {
      // Fall through to Wikidata IMDb->TMDB fallback
    }
  }

  if (!item.tmdbId && item.imdbId) {
    const tmdbId = await resolveTmdbFromWikidataImdb(item.imdbId, item.mediaType);
    if (tmdbId) {
      const resolved = { ...item, tmdbId, id: `${item.mediaType}:${tmdbId}` };
      metaCache.set(cacheKey, resolved);
      return resolved;
    }
  }

  return item;
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
export async function searchAllMedia(query, tmdbApiKey = '', type = 'all') {
  const clean = String(query || '').trim();
  if (!clean) return [];

  const local = searchLocalItems(clean, type);
  const parallel = [
    searchCinemetaBrowser(clean, type).catch(() => []),
    type === 'all' || type === 'anime' ? searchAniListBrowser(clean).catch(() => []) : Promise.resolve([]),
    tmdbApiKey ? searchTmdbBrowser(clean, tmdbApiKey).catch(() => []) : Promise.resolve([]),
  ];

  // Also check local server /api/search if running under Node server.js
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    parallel.push(
      fetchJsonSafe(`./api/search?q=${encodeURIComponent(clean)}&type=${encodeURIComponent(type)}`, {
        headers: tmdbApiKey ? { 'x-tmdb-key': tmdbApiKey } : {},
      })
        .then((d) => d?.items || [])
        .catch(() => [])
    );
  }

  const external = await Promise.all(parallel);
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
