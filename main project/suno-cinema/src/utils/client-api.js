import { CATALOG_ITEMS } from '../data/catalog.js';

/**
 * Dual-mode API client: uses local Node `/api/*` endpoints when served by `server.js`,
 * and seamlessly falls back to bundled catalog + CORS-enabled public APIs (AniList,
 * TMDB with user key, Wikidata `origin=*`) when hosted statically on GitHub Pages.
 */

function normalizeAniListItem(m) {
  return {
    id: `anime:${m.id}`,
    anilistId: String(m.id),
    mediaType: 'anime',
    title: m.title?.english || m.title?.romaji || 'Anime',
    year: m.seasonYear ? String(m.seasonYear) : '',
    creator: m.studios?.nodes?.[0]?.name || 'Anime Studio',
    runtime: m.duration ? `${m.duration}m` : '24m/ep',
    totalEpisodes: m.episodes || 12,
    rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.2',
    genres: m.genres || ['Anime'],
    overview: (m.description || '').replace(/<[^>]+>/g, '').slice(0, 280),
    poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
    backdrop: m.bannerImage || m.coverImage?.extraLarge || '',
    palette: [m.coverImage?.color || '#ff4d6d', '#00f0ff', '#141418'],
    sonic: {
      moodId: 'anime-neon',
      bpm: 124,
      texture: 'Anime OST & Synth Percussion',
      listenBefore: 'YOASOBI, Kenshi Yonezu, Yoko Kanno, or RADWIMPS',
      cooldownCue: 'After-credits Japanese city pop or acoustic piano',
      vector: { pulse: 0.85, nocturne: 0.72, warmth: 0.58, scale: 0.74, tension: 0.76 },
    },
    source: 'anilist-live',
  };
}

async function fetchJsonSafe(url, options = {}) {
  const resp = await fetch(url, options);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('Not JSON');
  return resp.json();
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
    // Static hosting (GitHub Pages): use bundled verified catalog directly
  }
  return CATALOG_ITEMS;
}

export async function loadTrendingAnime() {
  try {
    const data = await fetchJsonSafe('./api/anilist/trending');
    if (Array.isArray(data.items) && data.items.length > 0) return data.items;
  } catch {
    // Fallback to direct browser CORS query against AniList GraphQL
  }

  try {
    const gql = `
      query {
        Page(page: 1, perPage: 16) {
          media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
            id
            title { romaji english }
            episodes
            duration
            seasonYear
            averageScore
            genres
            description(asHtml: false)
            coverImage { extraLarge large color }
            bannerImage
            studios(isMain: true) { nodes { name } }
          }
        }
      }
    `;
    const json = await fetchJsonSafe('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: gql }),
    });
    const media = json?.data?.Page?.media || [];
    if (media.length > 0) return media.map(normalizeAniListItem);
  } catch {
    // Offline fallback
  }

  return CATALOG_ITEMS.filter((x) => x.mediaType === 'anime');
}

async function searchAniListBrowser(query) {
  const gql = `
    query ($search: String) {
      Page(page: 1, perPage: 12) {
        media(search: $search, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id
          title { romaji english }
          episodes
          duration
          seasonYear
          averageScore
          genres
          description(asHtml: false)
          coverImage { extraLarge large color }
          bannerImage
          studios(isMain: true) { nodes { name } }
        }
      }
    }
  `;
  const json = await fetchJsonSafe('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
  });
  return (json?.data?.Page?.media || []).map(normalizeAniListItem);
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
        sonic: {
          moodId: mediaType === 'tv' ? 'midnight-synth' : 'imax-sub',
          bpm: 94,
          texture: 'Atmospheric Score',
          listenBefore: 'Matched to your current Suno listening session',
          cooldownCue: 'Late-night ambient synth drift',
          vector: { pulse: 0.65, nocturne: 0.72, warmth: 0.52, scale: 0.68, tension: 0.66 },
        },
        source: 'tmdb-live',
      };
    });
}

export async function searchAllMedia(query, tmdbApiKey = '') {
  const clean = String(query || '').trim();
  if (!clean) return [];

  try {
    const headers = tmdbApiKey ? { 'x-tmdb-key': tmdbApiKey } : {};
    const data = await fetchJsonSafe(`./api/search?q=${encodeURIComponent(clean)}`, { headers });
    if (Array.isArray(data.items)) return data.items;
  } catch {
    // Static hosting fallback: combine local catalog + direct browser AniList + optional TMDB
  }

  const local = searchLocalItems(clean);
  const external = await Promise.all([
    searchAniListBrowser(clean).catch(() => []),
    searchTmdbBrowser(clean, tmdbApiKey).catch(() => []),
  ]);

  const merged = [...local];
  const seen = new Set(merged.map((x) => x.id));
  for (const list of external) {
    for (const item of list) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
  }
  return merged;
}

export async function fetchTvSeasonsData(tmdbId, tmdbApiKey = '') {
  try {
    const headers = tmdbApiKey ? { 'x-tmdb-key': tmdbApiKey } : {};
    const data = await fetchJsonSafe(`./api/tv/${encodeURIComponent(tmdbId)}/seasons`, { headers });
    if (Array.isArray(data.seasons)) return data.seasons;
  } catch {
    // Static hosting fallback if user entered TMDB key
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
      // Fall through to catalog default
    }
  }

  return null;
}
