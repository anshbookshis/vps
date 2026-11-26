import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { CATALOG_ITEMS } from './src/data/catalog.js';
import { SONIC_PROFILES, SCORE_MOODS } from './src/utils/sonic-engine.js';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT || 3000);
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_RETRY_BACKOFF_MS = [250, 600];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
};

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...CORS_HEADERS,
    ...extraHeaders,
  });
  if (res.req?.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(err) {
  return Boolean(err && (err.name === 'AbortError' || err.name === 'TimeoutError' || /timeout/i.test(err.message || '')));
}

/**
 * Fetch wrapper with per-attempt timeout and automatic backoff retries on 5xx, 429, or network/timeout errors.
 * Clears timeout once headers arrive so large streaming responses are not aborted mid-transfer.
 *
 * @param {string} url
 * @param {RequestInit & { signal?: AbortSignal }} [options]
 * @param {{ timeoutMs?: number, maxRetries?: number, backoffMs?: number[] }} [config]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, config = {}) {
  const timeoutMs = config.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxRetries = config.maxRetries ?? 2;
  const backoffMs = config.backoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
  const callerSignal = options.signal;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (callerSignal?.aborted) {
      throw callerSignal.reason || new Error('Client aborted request');
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`Upstream request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onCallerAbort = () => controller.abort(callerSignal.reason || new Error('Client aborted request'));
    if (callerSignal) {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const resp = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);

      const retryableStatus = resp.status === 429 || resp.status >= 500;
      if (retryableStatus && attempt < maxRetries) {
        await resp.body?.cancel?.().catch(() => {});
        await delay(backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 250);
        continue;
      }

      return resp;
    } catch (err) {
      clearTimeout(timer);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
      if (callerSignal?.aborted) throw err;

      lastError = timedOut ? new Error(`Upstream request timed out after ${timeoutMs}ms`) : err;
      if (timedOut) lastError.name = 'TimeoutError';

      if (attempt < maxRetries) {
        await delay(backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 250);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error('Upstream request failed');
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 6000) {
  const resp = await fetchWithRetry(
    url,
    {
      ...options,
      headers: {
        'User-Agent': 'SunoCinema/1.0',
        ...(options.headers || {}),
      },
    },
    { timeoutMs, maxRetries: 1, backoffMs: [200] }
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

function isAlreadyProxiedUri(rawUri, absHref, proxyEndpoint) {
  if (!rawUri) return false;
  if (
    rawUri.startsWith('/api/proxy/hls?') ||
    rawUri.startsWith('/api/proxy/subtitles?') ||
    rawUri.startsWith(`${proxyEndpoint}?`)
  ) {
    return true;
  }
  try {
    const parsed = new URL(absHref);
    const epPath = new URL(proxyEndpoint, 'http://127.0.0.1').pathname;
    if (
      epPath !== '/' &&
      (parsed.pathname === epPath || parsed.pathname === '/api/proxy/hls' || parsed.pathname === '/api/proxy/subtitles') &&
      parsed.searchParams.has('url')
    ) {
      return true;
    }
  } catch {
    // Ignore parse error
  }
  return false;
}

function buildProxyUrl(absHref, proxyEndpoint, referer = '') {
  return `${proxyEndpoint}?url=${encodeURIComponent(absHref)}${
    referer ? `&referer=${encodeURIComponent(referer)}` : ''
  }`;
}

/**
 * Rewrite HLS M3U8 manifest content to route all child playlists, chunks, audio/subtitle media tracks, and keys
 * through the HLS proxy while avoiding double-wrapping already proxied URIs.
 *
 * @param {string} manifestText
 * @param {string} baseUrl
 * @param {string} [proxyEndpoint='/api/proxy/hls']
 * @param {string} [referer='']
 * @returns {string}
 */
export function rewriteHlsManifest(manifestText, baseUrl, proxyEndpoint = '/api/proxy/hls', referer = '') {
  if (typeof manifestText !== 'string') return '';
  const lines = manifestText.split(/\r?\n/);
  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Rewrite tags containing URI="..." (#EXT-X-MEDIA, #EXT-X-KEY, #EXT-X-MAP, #EXT-X-I-FRAME-STREAM-INF, etc.)
    if (trimmed.startsWith('#') && /URI="[^"]+"/i.test(line)) {
      return line.replace(/URI="([^"]+)"/gi, (match, uri) => {
        try {
          const abs = new URL(uri, baseUrl).href;
          if (isAlreadyProxiedUri(uri, abs, proxyEndpoint)) {
            return match;
          }
          return `URI="${buildProxyUrl(abs, proxyEndpoint, referer)}"`;
        } catch {
          return match;
        }
      });
    }

    // Rewrite segment and child playlist URI lines (do not start with #)
    if (!trimmed.startsWith('#')) {
      try {
        const abs = new URL(trimmed, baseUrl).href;
        if (isAlreadyProxiedUri(trimmed, abs, proxyEndpoint)) {
          return line;
        }
        return buildProxyUrl(abs, proxyEndpoint, referer);
      } catch {
        return line;
      }
    }

    return line;
  });

  return rewritten.join('\n');
}

/**
 * Convert an SRT subtitle payload to clean WebVTT on the fly (stripping UTF-8 BOM and normalizing timestamps).
 * Passes existing WEBVTT content through unchanged except line-ending/BOM normalization.
 *
 * @param {string} rawText
 * @returns {string}
 */
export function convertSrtToVtt(rawText) {
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

/**
 * Unmasks MPEG-TS / MP4 segments disguised with fake image headers or font wrappers (Method 4 CDN abuse mitigation).
 * Detects PNG (89 50 4E 47), JPEG (FF D8 FF), and wOFF2 headers prepended to segment chunks,
 * locating the 188-byte MPEG-TS 0x47 sync packet cadence or fragmented MP4 boxes.
 *
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
export function unmaskDisguisedSegment(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 188) return buffer;

  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWoff = buffer[0] === 0x77 && buffer[1] === 0x4f && buffer[2] === 0x46 && buffer[3] === 0x32;

  if (isPng || isJpg || isWoff) {
    // Scan for repeating 188-byte MPEG-TS sync byte (0x47) across 3 consecutive packet headers
    const scanLimit = Math.min(buffer.length - 376, 16384);
    for (let i = 0; i < scanLimit; i++) {
      if (
        buffer[i] === 0x47 &&
        buffer[i + 188] === 0x47 &&
        buffer[i + 376] === 0x47
      ) {
        return buffer.subarray(i);
      }
    }

    // Scan for fragmented MP4 box header ('ftyp', 'moof', 'styp')
    const boxLimit = Math.min(buffer.length - 8, 4096);
    for (let i = 0; i < boxLimit; i++) {
      const tag = buffer.toString('ascii', i + 4, i + 8);
      if (tag === 'ftyp' || tag === 'moof' || tag === 'styp') {
        return buffer.subarray(i);
      }
    }
  }

  return buffer;
}

export function searchLocalCatalog(query, type = 'all') {
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

async function searchAniListLive(query) {
  const gql = `
    query ($search: String) {
      Page(page: 1, perPage: 12) {
        media(search: $search, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id
          title { romaji english }
          format
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
  const json = await fetchJsonWithTimeout('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
  });
  const list = json?.data?.Page?.media || [];
  return list.map((m) => ({
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
  }));
}

async function searchTmdbLive(query, type, apiKey) {
  if (!apiKey) return [];
  const isV4Token = apiKey.length > 45;
  const headers = isV4Token ? { Authorization: `Bearer ${apiKey}` } : {};
  const keyParam = isV4Token ? '' : `&api_key=${encodeURIComponent(apiKey)}`;
  const endpoint =
    type === 'movie'
      ? `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false${keyParam}`
      : type === 'tv'
      ? `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(query)}&include_adult=false${keyParam}`
      : `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&include_adult=false${keyParam}`;

  const data = await fetchJsonWithTimeout(endpoint, { headers });
  const rows = (data?.results || []).filter((r) => {
    const mt = r.media_type || (type === 'tv' ? 'tv' : 'movie');
    return mt === 'movie' || mt === 'tv';
  });

  return rows.slice(0, 14).map((r) => {
    const mediaType = r.media_type === 'tv' || type === 'tv' ? 'tv' : 'movie';
    const title = r.title || r.name || 'Untitled';
    const year = (r.release_date || r.first_air_date || '').slice(0, 4);
    return {
      id: `${mediaType}:${r.id}`,
      tmdbId: String(r.id),
      mediaType,
      title,
      year,
      creator: mediaType === 'tv' ? 'TMDB Series' : 'TMDB Feature',
      runtime: mediaType === 'tv' ? 'Series' : 'Feature',
      totalSeasons: mediaType === 'tv' ? 3 : undefined,
      totalEpisodes: mediaType === 'tv' ? 10 : undefined,
      rating: r.vote_average ? r.vote_average.toFixed(1) : '7.5',
      genres: mediaType === 'tv' ? ['Series', 'Drama'] : ['Cinema'],
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

async function searchCinemetaLive(query, type) {
  const tasks = [];
  if (type === 'all' || type === 'movie') {
    tasks.push(
      fetchJsonWithTimeout(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(query)}.json`)
        .then((d) =>
          (d?.metas || []).slice(0, 12).map((m) => ({
            id: m.moviedb_id ? `movie:${m.moviedb_id}` : `movie:imdb:${m.id}`,
            tmdbId: m.moviedb_id ? String(m.moviedb_id) : '',
            imdbId: m.id,
            mediaType: 'movie',
            title: m.name || 'Untitled',
            year: String(m.releaseInfo || '').slice(0, 4),
            creator: 'Feature Film',
            runtime: '',
            rating: m.imdbRating ? String(m.imdbRating) : '7.8',
            genres: m.genres || ['Movie'],
            overview: m.description || '',
            poster: m.poster || '',
            backdrop: m.background || m.poster || '',
            palette: ['#ff0033', '#27272a', '#09090b'],
            sonic: {
              moodId: 'midnight-synth',
              bpm: 96,
              texture: 'Cinema Score',
              listenBefore: 'Any Suno track',
              cooldownCue: 'Ambient synth fade',
              vector: { pulse: 0.68, nocturne: 0.72, warmth: 0.52, scale: 0.68, tension: 0.68 },
            },
            source: 'cinemeta',
          }))
        )
        .catch(() => [])
    );
  }
  if (type === 'all' || type === 'tv') {
    tasks.push(
      fetchJsonWithTimeout(`https://v3-cinemeta.strem.io/catalog/series/top/search=${encodeURIComponent(query)}.json`)
        .then((d) =>
          (d?.metas || []).slice(0, 12).map((m) => ({
            id: m.moviedb_id ? `tv:${m.moviedb_id}` : `tv:imdb:${m.id}`,
            tmdbId: m.moviedb_id ? String(m.moviedb_id) : '',
            imdbId: m.id,
            mediaType: 'tv',
            title: m.name || 'Untitled Series',
            year: String(m.releaseInfo || '').slice(0, 4),
            creator: 'Series',
            runtime: 'Series',
            rating: m.imdbRating ? String(m.imdbRating) : '7.9',
            genres: m.genres || ['Series'],
            overview: m.description || '',
            poster: m.poster || '',
            backdrop: m.background || m.poster || '',
            palette: ['#ff0033', '#27272a', '#09090b'],
            sonic: {
              moodId: 'midnight-synth',
              bpm: 94,
              texture: 'Series Score',
              listenBefore: 'Any Suno track',
              cooldownCue: 'Ambient synth fade',
              vector: { pulse: 0.66, nocturne: 0.74, warmth: 0.54, scale: 0.66, tension: 0.7 },
            },
            source: 'cinemeta',
          }))
        )
        .catch(() => [])
    );
  }
  const lists = await Promise.all(tasks);
  return lists.flat();
}

async function searchWikidataKeyless(query, type) {
  // Keyless Wikidata + iTunes/TVmaze lookup so users can discover movies/shows beyond the starter catalog even without a TMDB key
  const sr = await fetchJsonWithTimeout(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
      query
    )}&language=en&type=item&limit=6&format=json`
  );
  const qids = (sr?.search || []).map((x) => x.id).filter(Boolean);
  if (!qids.length) return [];

  const values = qids.map((q) => `wd:${q}`).join(' ');
  const sparql = `
    SELECT ?item ?itemLabel ?movieTmdb ?tvTmdb ?date ?duration WHERE {
      VALUES ?item { ${values} }
      OPTIONAL { ?item wdt:P4947 ?movieTmdb . }
      OPTIONAL { ?item wdt:P4983 ?tvTmdb . }
      OPTIONAL { ?item wdt:P577 ?date . }
      OPTIONAL { ?item wdt:P580 ?date . }
      OPTIONAL { ?item wdt:P2047 ?duration . }
      FILTER(BOUND(?movieTmdb) || BOUND(?tvTmdb))
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 8
  `;
  const sp = await fetchJsonWithTimeout(
    `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,
    { headers: { Accept: 'application/sparql-results+json' } }
  );
  const bindings = sp?.results?.bindings || [];
  const results = [];
  const seen = new Set();

  for (const row of bindings) {
    const isTv = Boolean(row.tvTmdb?.value) && type !== 'movie';
    const mediaType = isTv ? 'tv' : row.movieTmdb?.value && type !== 'tv' ? 'movie' : null;
    if (!mediaType) continue;
    const tmdbId = isTv ? row.tvTmdb.value : row.movieTmdb.value;
    const key = `${mediaType}:${tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const title = row.itemLabel?.value || query;
    const year = (row.date?.value || '').slice(0, 4);
    let poster = '';
    let overview = '';

    try {
      if (mediaType === 'movie') {
        const it = await fetchJsonWithTimeout(
          `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=movie&limit=2&country=US`,
          {},
          3000
        );
        const match = it?.results?.[0];
        if (match) {
          poster = (match.artworkUrl100 || '').replace('100x100bb', '600x900bb');
          overview = match.longDescription || match.shortDescription || '';
        }
      } else {
        const tv = await fetchJsonWithTimeout(
          `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}`,
          {},
          3000
        );
        poster = tv?.image?.original || tv?.image?.medium || '';
        overview = (tv?.summary || '').replace(/<[^>]+>/g, '');
      }
    } catch {
      // Keep Wikidata entry with generative art fallback
    }

    results.push({
      id: key,
      tmdbId: String(tmdbId),
      mediaType,
      title,
      year,
      creator: mediaType === 'tv' ? 'Series (VidRift TMDB)' : 'Feature Film (VidRift TMDB)',
      runtime: row.duration?.value ? `${Math.round(Number(row.duration.value))}m` : mediaType === 'tv' ? 'Series' : 'Feature',
      totalSeasons: mediaType === 'tv' ? 3 : undefined,
      totalEpisodes: mediaType === 'tv' ? 10 : undefined,
      rating: '8.0',
      genres: [mediaType === 'tv' ? 'Series' : 'Feature Film'],
      overview: overview.slice(0, 260),
      poster,
      backdrop: poster,
      palette: ['#ff0033', '#00f0ff', '#121216'],
      sonic: {
        moodId: 'midnight-synth',
        bpm: 92,
        texture: 'Curated Sonic Match',
        listenBefore: 'Pair with late-night synth or soundtrack scores',
        cooldownCue: 'Ambient piano decompression',
        vector: { pulse: 0.62, nocturne: 0.72, warmth: 0.56, scale: 0.64, tension: 0.64 },
      },
      source: 'wikidata-live',
    });
  }
  return results;
}

function hasDisguisedHeader(buffer) {
  if (!buffer || buffer.length < 4) return false;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWoff = buffer[0] === 0x77 && buffer[1] === 0x4f && buffer[2] === 0x46 && buffer[3] === 0x32;
  return isPng || isJpg || isWoff;
}

function resolveSegmentMimeType(targetUrl, upstreamContentType = '') {
  let cleanPath = '';
  try {
    cleanPath = new URL(targetUrl).pathname.toLowerCase();
  } catch {
    cleanPath = String(targetUrl || '').toLowerCase();
  }
  const ctLower = String(upstreamContentType || '').toLowerCase();

  if (cleanPath.endsWith('.vtt') || ctLower.includes('text/vtt')) return 'text/vtt; charset=utf-8';
  if (cleanPath.endsWith('.m4s') || cleanPath.endsWith('.mp4') || cleanPath.endsWith('.m4v') || cleanPath.endsWith('.cmfv')) {
    return 'video/mp4';
  }
  if (cleanPath.endsWith('.m4a') || cleanPath.endsWith('.cmfa')) return 'audio/mp4';
  if (cleanPath.endsWith('.aac')) return 'audio/aac';
  if (cleanPath.endsWith('.mp3')) return 'audio/mpeg';
  if (cleanPath.endsWith('.key')) return 'application/octet-stream';
  if (cleanPath.endsWith('.ts')) return 'video/mp2t';

  if (
    ctLower &&
    !ctLower.startsWith('image/') &&
    !ctLower.startsWith('font/') &&
    ctLower !== 'application/octet-stream'
  ) {
    return upstreamContentType;
  }
  return 'video/mp2t';
}

function buildProxyUpstreamHeaders(referer = '', rangeHeader = '', identityEncoding = true) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: '*/*',
  };
  if (identityEncoding) {
    headers['Accept-Encoding'] = 'identity';
  }
  if (referer) {
    headers['Referer'] = referer;
    try {
      headers['Origin'] = new URL(referer).origin;
    } catch {
      // Ignore invalid referer
    }
  }
  if (rangeHeader) {
    headers['Range'] = rangeHeader;
  }
  return headers;
}

async function* streamPrefetchedChunks(headBuf, reader) {
  if (headBuf && headBuf.length > 0) {
    yield headBuf;
  }
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value && value.length > 0) {
      yield Buffer.from(value);
    }
  }
}

async function handleHlsProxyRequest(req, res, reqUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' });
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const targetUrl = reqUrl.searchParams.get('url') || '';
  const referer = reqUrl.searchParams.get('referer') || '';
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return sendJson(res, 400, { error: 'Valid http/https "url" query parameter required' });
  }
  try {
    new URL(targetUrl);
  } catch {
    return sendJson(res, 400, { error: 'Malformed target "url" query parameter' });
  }

  const abortController = new AbortController();
  const onResClose = () => {
    if (!res.writableFinished) {
      abortController.abort(new Error('Client disconnected'));
    }
  };
  res.on('close', onResClose);

  try {
    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : '';
    const upstreamHeaders = buildProxyUpstreamHeaders(referer, rangeHeader, true);

    let upstreamResp = await fetchWithRetry(targetUrl, {
      method: req.method,
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: abortController.signal,
    });

    if (req.method === 'HEAD' && upstreamResp.status === 405) {
      await upstreamResp.body?.cancel?.().catch(() => {});
      upstreamResp = await fetchWithRetry(targetUrl, {
        method: 'GET',
        headers: upstreamHeaders,
        redirect: 'follow',
        signal: abortController.signal,
      });
    }

    if (upstreamResp.status === 416) {
      const contentRange = upstreamResp.headers.get('content-range');
      await upstreamResp.body?.cancel?.().catch(() => {});
      return sendJson(
        res,
        416,
        { error: 'Requested range not satisfiable', targetUrl },
        contentRange ? { 'Content-Range': contentRange } : {}
      );
    }

    if (!upstreamResp.ok) {
      await upstreamResp.body?.cancel?.().catch(() => {});
      return sendJson(res, upstreamResp.status, {
        error: `Upstream HTTP ${upstreamResp.status} ${upstreamResp.statusText}`.trim(),
        targetUrl,
      });
    }

    const finalUrl = upstreamResp.url || targetUrl;
    let cleanPath = '';
    try {
      cleanPath = new URL(finalUrl).pathname.toLowerCase();
    } catch {
      cleanPath = finalUrl.toLowerCase();
    }

    const contentType = upstreamResp.headers.get('content-type') || '';
    const ctLower = contentType.toLowerCase();
    const isManifest =
      ctLower.includes('mpegurl') ||
      cleanPath.endsWith('.m3u8') ||
      cleanPath.endsWith('.m3u') ||
      finalUrl.toLowerCase().includes('.m3u8');

    if (isManifest) {
      if (req.method === 'HEAD') {
        await upstreamResp.body?.cancel?.().catch(() => {});
        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS,
        });
        return res.end();
      }
      const text = await upstreamResp.text();
      const rewritten = rewriteHlsManifest(text, finalUrl, '/api/proxy/hls', referer || finalUrl);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...CORS_HEADERS,
      });
      return res.end(rewritten);
    }

    const status = upstreamResp.status === 206 ? 206 : 200;
    const upstreamContentRange = upstreamResp.headers.get('content-range');
    const upstreamContentEncoding = upstreamResp.headers.get('content-encoding');
    const upstreamContentLength = !upstreamContentEncoding ? upstreamResp.headers.get('content-length') : null;
    const acceptRanges = upstreamResp.headers.get('accept-ranges') || 'bytes';

    const outHeaders = {
      'Content-Type': resolveSegmentMimeType(finalUrl, contentType),
      'Accept-Ranges': acceptRanges,
      'Cache-Control': status === 206 ? 'no-cache' : 'public, max-age=3600',
      ...CORS_HEADERS,
    };
    if (upstreamContentRange) outHeaders['Content-Range'] = upstreamContentRange;
    if (upstreamContentLength !== null) outHeaders['Content-Length'] = upstreamContentLength;

    if (req.method === 'HEAD' || !upstreamResp.body) {
      await upstreamResp.body?.cancel?.().catch(() => {});
      res.writeHead(status, outHeaders);
      return res.end();
    }

    // Stream 206 partial content directly without buffering or altering byte offsets
    if (status === 206) {
      res.writeHead(206, outHeaders);
      await pipeline(Readable.fromWeb(upstreamResp.body), res);
      return;
    }

    // For 200 responses, peek initial bytes only to handle text/plain M3U8 or disguised image/font prefixes
    const reader = upstreamResp.body.getReader();
    const initialChunks = [];
    let initialLen = 0;

    while (initialLen < 8) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        const buf = Buffer.from(value);
        initialChunks.push(buf);
        initialLen += buf.length;
      }
    }

    if (initialLen === 0) {
      outHeaders['Content-Length'] = '0';
      res.writeHead(200, outHeaders);
      return res.end();
    }

    let headBuf = initialChunks.length === 1 ? initialChunks[0] : Buffer.concat(initialChunks);

    if (ctLower.startsWith('text/plain') && !cleanPath.endsWith('.vtt') && !cleanPath.endsWith('.srt')) {
      const probe = headBuf.subarray(0, 32).toString('utf8');
      if (probe.trimStart().startsWith('#EXTM3U')) {
        const restChunks = [headBuf];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length > 0) restChunks.push(Buffer.from(value));
        }
        const text = Buffer.concat(restChunks).toString('utf8');
        const rewritten = rewriteHlsManifest(text, finalUrl, '/api/proxy/hls', referer || finalUrl);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS,
        });
        return res.end(rewritten);
      }
    }

    if (hasDisguisedHeader(headBuf)) {
      const scanChunks = [headBuf];
      let total = headBuf.length;
      while (total < 20480) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length > 0) {
          const buf = Buffer.from(value);
          scanChunks.push(buf);
          total += buf.length;
        }
      }
      const rawHead = scanChunks.length === 1 ? scanChunks[0] : Buffer.concat(scanChunks);
      const unmasked = unmaskDisguisedSegment(rawHead);
      const stripped = rawHead.length - unmasked.length;
      headBuf = unmasked;
      if (stripped > 0) {
        if (upstreamContentLength !== null && Number.isFinite(Number(upstreamContentLength))) {
          outHeaders['Content-Length'] = Math.max(0, Number(upstreamContentLength) - stripped);
        }
        outHeaders['Content-Type'] = resolveSegmentMimeType(finalUrl, '');
      }
    }

    res.writeHead(200, outHeaders);
    await pipeline(Readable.from(streamPrefetchedChunks(headBuf, reader)), res);
  } catch (err) {
    if (res.destroyed || abortController.signal.aborted || err?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
      return;
    }
    if (!res.headersSent) {
      return sendJson(res, isTimeoutError(err) ? 504 : 502, {
        error: isTimeoutError(err) ? 'HLS proxy upstream timeout' : 'HLS proxy upstream gateway error',
        message: err.message,
        targetUrl,
      });
    }
    res.destroy();
  } finally {
    res.off('close', onResClose);
  }
}

async function handleSubtitleProxyRequest(req, res, reqUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' });
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const targetUrl = reqUrl.searchParams.get('url') || '';
  const referer = reqUrl.searchParams.get('referer') || '';
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return sendJson(res, 400, { error: 'Valid http/https "url" query parameter required' });
  }
  try {
    new URL(targetUrl);
  } catch {
    return sendJson(res, 400, { error: 'Malformed target "url" query parameter' });
  }

  const abortController = new AbortController();
  const onResClose = () => {
    if (!res.writableFinished) {
      abortController.abort(new Error('Client disconnected'));
    }
  };
  res.on('close', onResClose);

  try {
    const upstreamHeaders = buildProxyUpstreamHeaders(referer, '', false);
    let upstreamResp = await fetchWithRetry(targetUrl, {
      method: req.method,
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: abortController.signal,
    });

    if (req.method === 'HEAD' && upstreamResp.status === 405) {
      await upstreamResp.body?.cancel?.().catch(() => {});
      upstreamResp = await fetchWithRetry(targetUrl, {
        method: 'GET',
        headers: upstreamHeaders,
        redirect: 'follow',
        signal: abortController.signal,
      });
    }

    if (!upstreamResp.ok) {
      await upstreamResp.body?.cancel?.().catch(() => {});
      return sendJson(res, upstreamResp.status, {
        error: `Upstream HTTP ${upstreamResp.status} ${upstreamResp.statusText}`.trim(),
        targetUrl,
      });
    }

    const vttHeaders = {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      ...CORS_HEADERS,
    };

    if (req.method === 'HEAD') {
      await upstreamResp.body?.cancel?.().catch(() => {});
      res.writeHead(200, vttHeaders);
      return res.end();
    }

    const rawText = await upstreamResp.text();
    const vttText = convertSrtToVtt(rawText);
    res.writeHead(200, vttHeaders);
    return res.end(vttText);
  } catch (err) {
    if (res.destroyed || abortController.signal.aborted) return;
    return sendJson(res, isTimeoutError(err) ? 504 : 502, {
      error: isTimeoutError(err) ? 'Subtitle proxy upstream timeout' : 'Subtitle proxy upstream error',
      message: err.message,
      targetUrl,
    });
  } finally {
    res.off('close', onResClose);
  }
}

function extractInfoHash(magnet, rawHash = '') {
  const cleanHash = String(rawHash || '').trim();
  if (/^[a-fA-F0-9]{40}$/.test(cleanHash)) return cleanHash.toLowerCase();
  const match = String(magnet || '').match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
  return match ? match[1].toLowerCase() : '';
}

function makeProxyHlsUrl(targetUrl, referer = '') {
  if (!targetUrl) return '';
  if (targetUrl.startsWith('/api/proxy/hls?') || targetUrl.startsWith('./api/proxy/hls?')) {
    return targetUrl;
  }
  return `/api/proxy/hls?url=${encodeURIComponent(targetUrl)}${
    referer ? `&referer=${encodeURIComponent(referer)}` : ''
  }`;
}

async function resolveRealDebridStream(apiKey, magnetUri) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const addResp = await fetchWithRetry(
    'https://api.real-debrid.com/rest/1.0/torrents/addMagnet',
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ magnet: magnetUri }).toString(),
    },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!addResp.ok) return null;
  const added = await addResp.json();
  if (!added?.id) return null;

  const torrentId = added.id;
  await fetchWithRetry(
    `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${encodeURIComponent(torrentId)}`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ files: 'all' }).toString(),
    },
    { timeoutMs: 6000, maxRetries: 1 }
  ).catch(() => null);

  const infoResp = await fetchWithRetry(
    `https://api.real-debrid.com/rest/1.0/torrents/info/${encodeURIComponent(torrentId)}`,
    { headers },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!infoResp.ok) return null;
  const info = await infoResp.json();
  if (info?.status !== 'downloaded' || !Array.isArray(info.links) || !info.links[0]) {
    await fetch(`https://api.real-debrid.com/rest/1.0/torrents/delete/${encodeURIComponent(torrentId)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => {});
    return null;
  }

  const unrestrictResp = await fetchWithRetry(
    'https://api.real-debrid.com/rest/1.0/unrestrict/link',
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ link: info.links[0] }).toString(),
    },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!unrestrictResp.ok) return null;
  const unrestrict = await unrestrictResp.json();
  return unrestrict?.download && /^https?:\/\//i.test(unrestrict.download) ? unrestrict.download : null;
}

async function resolveTorBoxStream(apiKey, magnetUri, infoHash, preferredFileIdx) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (infoHash) {
    const checkResp = await fetchWithRetry(
      `https://api.torbox.app/v1/api/torrents/checkcached?hash=${encodeURIComponent(infoHash)}&format=list`,
      { headers },
      { timeoutMs: 5000, maxRetries: 1 }
    ).catch(() => null);
    if (checkResp?.ok) {
      const checkJson = await checkResp.json().catch(() => null);
      if (Array.isArray(checkJson?.data) && checkJson.data.length === 0) return null;
    }
  }

  const createResp = await fetchWithRetry(
    'https://api.torbox.app/v1/api/torrents/createtorrent',
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ magnet: magnetUri }).toString(),
    },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!createResp.ok) return null;
  const created = await createResp.json();
  const torrentId = created?.data?.torrent_id;
  if (!torrentId) return null;

  const listResp = await fetchWithRetry(
    `https://api.torbox.app/v1/api/torrents/mylist?id=${encodeURIComponent(torrentId)}`,
    { headers },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!listResp.ok) return null;
  const listJson = await listResp.json();
  const torrentObj = Array.isArray(listJson?.data) ? listJson.data[0] : listJson?.data;
  const files = Array.isArray(torrentObj?.files) ? torrentObj.files : [];
  if (!files.length) return null;

  const picked =
    (Number.isInteger(preferredFileIdx) ? files[preferredFileIdx] : null) ||
    files.reduce((best, f) => (!best || (f.size || 0) > (best.size || 0) ? f : best), null);
  if (!picked?.id) return null;

  const dlResp = await fetchWithRetry(
    `https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${encodeURIComponent(
      torrentId
    )}&file_id=${encodeURIComponent(picked.id)}`,
    { headers },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!dlResp.ok) return null;
  const dlJson = await dlResp.json();
  return dlJson?.data && /^https?:\/\//i.test(dlJson.data) ? dlJson.data : null;
}

export async function resolveDebridStream({ provider = 'realdebrid', apiKey, magnet, infoHash, fileIdx }) {
  if (!apiKey) return null;
  const hash = extractInfoHash(magnet, infoHash);
  const magnetUri = magnet && magnet.startsWith('magnet:') ? magnet : hash ? `magnet:?xt=urn:btih:${hash}` : '';
  if (!magnetUri) return null;

  const normProvider = String(provider || 'realdebrid').toLowerCase().replace(/[-_\s]/g, '');
  try {
    if (normProvider === 'torbox') {
      return await resolveTorBoxStream(apiKey, magnetUri, hash, fileIdx);
    }
    return await resolveRealDebridStream(apiKey, magnetUri);
  } catch {
    return null;
  }
}

function buildAddonStreamEndpoint({ addonUrl, tmdbId, imdbId, anilistId, mediaType, season, episode }) {
  if (!addonUrl || !/^https?:\/\//i.test(addonUrl)) return '';
  if (addonUrl.includes('{')) {
    return addonUrl
      .replace(/\{tmdbId\}/g, encodeURIComponent(tmdbId || ''))
      .replace(/\{imdbId\}/g, encodeURIComponent(imdbId || ''))
      .replace(/\{anilistId\}/g, encodeURIComponent(anilistId || ''))
      .replace(/\{mediaType\}/g, encodeURIComponent(mediaType || 'movie'))
      .replace(/\{season\}/g, encodeURIComponent(String(season || 1)))
      .replace(/\{episode\}/g, encodeURIComponent(String(episode || 1)));
  }
  const addonBase = addonUrl.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '');
  const stremioType =
    mediaType === 'tv' || mediaType === 'series' ? 'series' : mediaType === 'anime' && !imdbId ? 'anime' : 'movie';
  const stremioId =
    stremioType === 'series'
      ? imdbId
        ? `${imdbId}:${season}:${episode}`
        : tmdbId
        ? `tmdb:${tmdbId}:${season}:${episode}`
        : ''
      : stremioType === 'anime'
      ? anilistId
        ? `anilist:${anilistId}:${episode}`
        : ''
      : imdbId || (tmdbId ? `tmdb:${tmdbId}` : '');

  return stremioId ? `${addonBase}/stream/${stremioType}/${encodeURIComponent(stremioId)}.json` : '';
}

async function handleResolveStreamRequest(req, res, reqUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' });
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const tmdbId = reqUrl.searchParams.get('tmdbId') || '';
  const imdbIdParam = reqUrl.searchParams.get('imdbId') || '';
  const anilistId = reqUrl.searchParams.get('anilistId') || '';
  const malIdParam = reqUrl.searchParams.get('malId') || '';
  const mediaType = reqUrl.searchParams.get('mediaType') || 'movie';
  const season = Math.max(1, Number(reqUrl.searchParams.get('season') || 1));
  const episode = Math.max(1, Number(reqUrl.searchParams.get('episode') || 1));
  const directUrl = reqUrl.searchParams.get('directUrl') || '';
  const referer = reqUrl.searchParams.get('referer') || '';
  const magnet = reqUrl.searchParams.get('magnet') || '';
  const hash = (reqUrl.searchParams.get('hash') || reqUrl.searchParams.get('infoHash') || '').trim();

  const addonUrl = (
    reqUrl.searchParams.get('addonUrl') ||
    req.headers['x-addon-url'] ||
    process.env.STREMIO_ADDON_URL ||
    ''
  ).trim();
  const debridKey = (
    reqUrl.searchParams.get('debridKey') ||
    reqUrl.searchParams.get('debridToken') ||
    req.headers['x-debrid-key'] ||
    process.env.DEBRID_API_KEY ||
    ''
  ).trim();
  const debridProvider = (
    reqUrl.searchParams.get('debridProvider') ||
    req.headers['x-debrid-provider'] ||
    process.env.DEBRID_PROVIDER ||
    'realdebrid'
  )
    .trim()
    .toLowerCase();

  const localItem = CATALOG_ITEMS.find(
    (x) =>
      (tmdbId && String(x.tmdbId) === String(tmdbId)) ||
      (imdbIdParam && String(x.imdbId) === String(imdbIdParam)) ||
      (anilistId && String(x.anilistId) === String(anilistId))
  );
  const imdbId = imdbIdParam || localItem?.imdbId || '';
  const malId = malIdParam || localItem?.malId || '';

  const sources = [];
  const warnings = [];

  // 1. Custom Direct stream URL (skip duplicate if identical to localItem primary catalog URL)
  if (directUrl && /^https?:\/\//i.test(directUrl) && directUrl !== localItem?.hlsStreamUrl) {
    const isHls = directUrl.toLowerCase().includes('.m3u8');
    sources.push({
      id: 'custom-stream',
      name: isHls ? 'Direct HLS Stream (Proxy)' : 'Direct MP4 Video',
      type: isHls ? 'hls' : 'direct',
      url: isHls ? makeProxyHlsUrl(directUrl, referer) : directUrl,
      rawUrl: directUrl,
      referer: referer || undefined,
      quality: 'Original Quality',
      shielded: true,
      direct: true,
      node: isHls ? 'proxy' : 'direct',
    });
    if (isHls) {
      sources.push({
        id: 'custom-stream-direct',
        name: 'Direct HLS Stream (CORS)',
        type: 'hls',
        url: directUrl,
        rawUrl: directUrl,
        quality: 'Original Quality',
        shielded: true,
        direct: true,
        node: 'direct',
      });
    }
  }

  // 2. Catalog HLS primary + mirrors (both proxied and direct CORS nodes)
  const catalogUrls = Array.from(
    new Set(
      [localItem?.hlsStreamUrl, ...(Array.isArray(localItem?.hlsMirrors) ? localItem.hlsMirrors : [])].filter(
        (u) => typeof u === 'string' && /^https?:\/\//i.test(u)
      )
    )
  );
  catalogUrls.forEach((streamUrl, idx) => {
    const isPrimary = idx === 0;
    const baseId = isPrimary ? 'catalog-hls' : `catalog-hls-mirror-${idx}`;
    const labelPrefix = isPrimary ? 'Direct HLS Stream' : `Catalog Mirror ${idx}`;
    sources.push({
      id: baseId,
      name: `${labelPrefix} (Proxy Node)`,
      type: 'hls',
      url: makeProxyHlsUrl(streamUrl),
      rawUrl: streamUrl,
      quality: isPrimary ? '1080p UHD' : '1080p',
      shielded: true,
      direct: true,
      node: isPrimary ? 'catalog-proxy' : 'catalog-mirror-proxy',
    });
    sources.push({
      id: `${baseId}-direct`,
      name: `${labelPrefix} (Direct CORS)`,
      type: 'hls',
      url: streamUrl,
      rawUrl: streamUrl,
      quality: isPrimary ? '1080p UHD' : '1080p',
      shielded: true,
      direct: true,
      node: isPrimary ? 'catalog-direct' : 'catalog-mirror-direct',
    });
  });

  // 3. Configurable Stremio addon / external HLS extractor
  let pendingDebridCandidate = null;
  const addonEndpoint = buildAddonStreamEndpoint({
    addonUrl,
    tmdbId,
    imdbId,
    anilistId,
    mediaType,
    season,
    episode,
  });
  if (addonEndpoint) {
    try {
      const addonData = await fetchJsonWithTimeout(
        addonEndpoint,
        { headers: { Accept: 'application/json' } },
        6000
      );
      const streams = Array.isArray(addonData?.streams) ? addonData.streams : [];
      let addedCount = 0;
      for (const stream of streams) {
        if (addedCount >= 6) break;
        if (stream?.url && /^https?:\/\//i.test(stream.url)) {
          const reqProxyHeaders = stream.behaviorHints?.proxyHeaders?.request || {};
          const streamReferer = reqProxyHeaders.Referer || reqProxyHeaders.referer || '';
          const lowerUrl = stream.url.toLowerCase();
          const isMp4 = lowerUrl.includes('.mp4') && !lowerUrl.includes('.m3u8');
          if (stream.behaviorHints?.notWebReady === true && !lowerUrl.includes('.m3u8') && !isMp4) {
            continue;
          }
          const label =
            [stream.name, stream.title].filter(Boolean).join(' — ').split('\n')[0].slice(0, 80) ||
            'Addon HLS Stream';
          sources.push({
            id: addedCount === 0 ? 'addon-hls' : `addon-hls-${addedCount + 1}`,
            name: label,
            type: isMp4 ? 'direct' : 'hls',
            url: makeProxyHlsUrl(stream.url, streamReferer),
            rawUrl: stream.url,
            referer: streamReferer || undefined,
            quality: /2160|4k/i.test(label) ? '4K UHD' : /1080/i.test(label) ? '1080p' : /720/i.test(label) ? '720p' : 'HD',
            shielded: true,
            direct: true,
            node: 'addon-proxy',
          });
          addedCount += 1;
        } else if (stream?.infoHash && !pendingDebridCandidate) {
          pendingDebridCandidate = { infoHash: stream.infoHash, fileIdx: stream.fileIdx };
        }
      }
    } catch (err) {
      warnings.push(`Addon lookup failed: ${err.message}`);
    }
  }

  // 4. Configurable Debrid instant-cache resolution (only emit when an actual playable URL resolves)
  const resolvedHash = extractInfoHash(magnet, hash || pendingDebridCandidate?.infoHash || '');
  if (debridKey && (magnet || resolvedHash)) {
    const playable = await resolveDebridStream({
      provider: debridProvider,
      apiKey: debridKey,
      magnet,
      infoHash: resolvedHash,
      fileIdx: pendingDebridCandidate?.fileIdx,
    });
    if (playable) {
      const isHls = playable.toLowerCase().includes('.m3u8');
      sources.push({
        id: 'debrid-instant-cache',
        name: `Instant Cached Stream (${debridProvider.toUpperCase()})`,
        type: isHls ? 'hls' : 'direct',
        url: makeProxyHlsUrl(playable),
        rawUrl: playable,
        provider: debridProvider,
        quality: '1080p Remux',
        shielded: true,
        direct: true,
        node: 'debrid',
      });
    }
  }

  // 5. Fallback Shielded Embeds (VidLink, VidRift)
  if (tmdbId || imdbId || (mediaType === 'anime' && malId)) {
    let vidlinkUrl;
    if (mediaType === 'anime' && malId) {
      vidlinkUrl = `https://vidlink.pro/anime/${encodeURIComponent(malId)}/${episode}/sub?primaryColor=ff4d6d&secondaryColor=00f0ff&autoplay=false&fallback=true`;
    } else if (mediaType === 'tv') {
      const idVal = tmdbId || imdbId;
      vidlinkUrl = `https://vidlink.pro/tv/${encodeURIComponent(idVal)}/${season}/${episode}?primaryColor=ff4d6d&secondaryColor=00f0ff&iconColor=ff4d6d&title=false&poster=true&autoplay=false`;
    } else {
      const idVal = tmdbId || imdbId;
      vidlinkUrl = `https://vidlink.pro/movie/${encodeURIComponent(idVal)}?primaryColor=ff4d6d&secondaryColor=00f0ff&iconColor=ff4d6d&title=false&poster=true&autoplay=false`;
    }

    sources.push({
      id: 'vidlink-shield',
      name: 'VidLink (No-Redirect Shield)',
      type: 'embed',
      url: vidlinkUrl,
      quality: '1080p',
      shielded: true,
      sandboxed: true,
      direct: false,
    });
  }

  if (tmdbId || imdbId || anilistId) {
    let vidriftUrl;
    if (mediaType === 'anime' && anilistId) {
      vidriftUrl = `https://embed.vidrift.net/embed/anilist/${encodeURIComponent(anilistId)}/${episode}?primaryColor=ff4d6d&autoplay=false`;
    } else if (mediaType === 'tv' && (tmdbId || imdbId)) {
      const idVal = tmdbId || imdbId;
      vidriftUrl = `https://embed.vidrift.net/embed/tv/${encodeURIComponent(idVal)}/${season}/${episode}?primaryColor=ff4d6d&autoplay=false`;
    } else {
      const idVal = tmdbId || imdbId;
      vidriftUrl = `https://embed.vidrift.net/embed/movie/${encodeURIComponent(idVal)}?primaryColor=ff4d6d&autoplay=false`;
    }

    sources.push({
      id: 'vidrift-sandboxed',
      name: 'VidRift (Sandboxed)',
      type: 'embed',
      url: vidriftUrl,
      quality: '720p/1080p',
      shielded: true,
      sandboxed: true,
      direct: false,
    });
  }

  return sendJson(res, 200, {
    ok: true,
    tmdbId,
    imdbId,
    anilistId,
    mediaType,
    season,
    episode,
    sources,
    ...(warnings.length ? { warnings } : {}),
  });
}

/**
 * Create the Suno Cinema HTTP server.
 * @param {string} [rootDir]
 * @returns {http.Server}
 */
export function createSunoCinemaServer(rootDir = ROOT_DIR) {
  const normalizedRoot = path.resolve(rootDir);

  return http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    let pathname;
    try {
      pathname = decodeURIComponent(reqUrl.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    // API routes
    if (pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        product: 'Suno Cinema',
        embedOrigin: 'https://embed.vidrift.net',
        tmdbConfigured: Boolean(process.env.TMDB_API_KEY),
        debridConfigured: Boolean(process.env.DEBRID_API_KEY),
        addonConfigured: Boolean(process.env.STREMIO_ADDON_URL),
        hlsProxyEnabled: true,
        subtitleProxyEnabled: true,
        rangeForwardingEnabled: true,
        streamResolverEnabled: true,
        catalogCount: CATALOG_ITEMS.length,
      });
    }

    if (pathname === '/api/proxy/hls') {
      return handleHlsProxyRequest(req, res, reqUrl);
    }

    if (pathname === '/api/proxy/subtitles') {
      return handleSubtitleProxyRequest(req, res, reqUrl);
    }

    if (pathname === '/api/resolve/stream') {
      return handleResolveStreamRequest(req, res, reqUrl);
    }

    if (pathname === '/api/catalog') {
      return sendJson(res, 200, {
        items: CATALOG_ITEMS,
        sonicProfiles: SONIC_PROFILES,
        moods: SCORE_MOODS,
      });
    }

    if (pathname === '/api/search') {
      const q = (reqUrl.searchParams.get('q') || '').trim();
      const type = reqUrl.searchParams.get('type') || 'all';
      const localMatches = searchLocalCatalog(q, type);

      if (!q || q.length < 2) {
        return sendJson(res, 200, { items: localMatches, sources: ['local'] });
      }

      const tmdbKey = req.headers['x-tmdb-key'] || process.env.TMDB_API_KEY || '';
      const tasks = [];
      const sources = ['local'];

      if (type === 'all' || type === 'anime') {
        tasks.push(
          searchAniListLive(q)
            .then((items) => {
              sources.push('anilist');
              return items;
            })
            .catch(() => [])
        );
      }

      if (type !== 'anime') {
        tasks.push(
          searchCinemetaLive(q, type)
            .then((items) => {
              sources.push('cinemeta');
              return items;
            })
            .catch(() => [])
        );
        if (tmdbKey) {
          tasks.push(
            searchTmdbLive(q, type, tmdbKey)
              .then((items) => {
                sources.push('tmdb');
                return items;
              })
              .catch(() => [])
          );
        } else {
          tasks.push(
            searchWikidataKeyless(q, type)
              .then((items) => {
                sources.push('wikidata');
                return items;
              })
              .catch(() => [])
          );
        }
      }

      const externalLists = await Promise.all(tasks);
      const merged = [...localMatches];
      const seenIds = new Set(merged.map((x) => x.id));
      for (const list of externalLists) {
        for (const item of list) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            merged.push(item);
          }
        }
      }

      return sendJson(res, 200, { items: merged, sources });
    }

    if (pathname === '/api/anilist/trending') {
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
        const json = await fetchJsonWithTimeout('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: gql }),
        });
        const items = (json?.data?.Page?.media || []).map((m) => ({
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
          overview: (m.description || '').replace(/<[^>]+>/g, '').slice(0, 260),
          poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
          backdrop: m.bannerImage || m.coverImage?.extraLarge || '',
          palette: [m.coverImage?.color || '#ff4d6d', '#00f0ff', '#141418'],
          sonic: {
            moodId: 'anime-neon',
            bpm: 126,
            texture: 'Tokyo Anime OST',
            listenBefore: 'YOASOBI, Sawano Hiroyuki, or Kensuke Ushio',
            cooldownCue: 'City pop sunset outro',
            vector: { pulse: 0.86, nocturne: 0.72, warmth: 0.56, scale: 0.78, tension: 0.78 },
          },
        }));
        return sendJson(res, 200, { items });
      } catch {
        return sendJson(res, 200, {
          items: CATALOG_ITEMS.filter((x) => x.mediaType === 'anime'),
          fallback: true,
        });
      }
    }

    const tvMatch = pathname.match(/^\/api\/tv\/(\d+)\/seasons$/);
    if (tvMatch) {
      const tmdbId = tvMatch[1];
      const tmdbKey = req.headers['x-tmdb-key'] || process.env.TMDB_API_KEY || '';
      const localShow = CATALOG_ITEMS.find((x) => x.mediaType === 'tv' && String(x.tmdbId) === tmdbId);

      if (tmdbKey) {
        try {
          const isV4 = tmdbKey.length > 45;
          const headers = isV4 ? { Authorization: `Bearer ${tmdbKey}` } : {};
          const suffix = isV4 ? '' : `?api_key=${encodeURIComponent(tmdbKey)}`;
          const data = await fetchJsonWithTimeout(`https://api.themoviedb.org/3/tv/${tmdbId}${suffix}`, { headers });
          const seasons = (data?.seasons || [])
            .filter((s) => s.season_number >= 1)
            .map((s) => ({
              seasonNumber: s.season_number,
              name: s.name || `Season ${s.season_number}`,
              episodeCount: s.episode_count || 10,
            }));
          if (seasons.length) {
            return sendJson(res, 200, { tmdbId, seasons, source: 'tmdb' });
          }
        } catch {
          // Fall through to local/TVmaze metadata
        }
      }

      const fallbackSeasons = localShow?.seasonsList || [
        { seasonNumber: 1, name: 'Season 1', episodeCount: localShow?.totalEpisodes || 10 },
      ];
      return sendJson(res, 200, { tmdbId, seasons: fallbackSeasons, source: 'catalog' });
    }

    // Static file serving
    const safeRel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const resolved = path.resolve(normalizedRoot, safeRel);
    if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.readFile(resolved, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
    });
  });
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  const server = createSunoCinemaServer();
  server.listen(DEFAULT_PORT, () => {
    console.log(`Suno Cinema running at http://localhost:${DEFAULT_PORT}`);
  });
}
