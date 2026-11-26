import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { CATALOG_ITEMS } from './src/data/catalog.js';
import { SONIC_PROFILES, SCORE_MOODS } from './src/utils/sonic-engine.js';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Lightweight .env parser to populate process.env without external npm dependencies.
 *
 * @param {string} [envFilePath]
 * @returns {Record<string, string>}
 */
export function loadDotEnv(envFilePath = path.join(ROOT_DIR, '.env')) {
  try {
    if (!fs.existsSync(envFilePath)) return {};
    const content = fs.readFileSync(envFilePath, 'utf8');
    const parsed = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      parsed[key] = val;
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

loadDotEnv();
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
  'Access-Control-Allow-Headers':
    '*, Authorization, Range, Content-Type, X-Addon-Url, X-Addon-Urls, X-Debrid-Key, X-Debrid-Provider, X-Custom-Resolver, X-Tmdb-Key',
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
 * Sign a playback token using HMAC-SHA256.
 *
 * @param {string} streamUrl
 * @param {object} [options]
 * @returns {string}
 */
export function signPlayToken(streamUrl, options = {}) {
  const secret = options.secret || process.env.SUNO_PLAY_SECRET || 'suno-cinema-secret-token-key-2026';
  const expiresInSeconds = Number.isFinite(options.expiresInSeconds) ? options.expiresInSeconds : 7200;
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = options.exp || nowSec + expiresInSeconds;
  const payload = {
    url: String(streamUrl || ''),
    exp,
    iat: nowSec,
    ...(options.id ? { id: options.id } : {}),
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

/**
 * Verify an HMAC-SHA256 playback token against the target URL and current time.
 *
 * @param {string} tokenString
 * @param {string} [targetUrl]
 * @param {object} [options]
 * @returns {{ valid: boolean, error?: string, payload?: object }}
 */
export function verifyPlayToken(tokenString, targetUrl, options = {}) {
  if (!tokenString || typeof tokenString !== 'string') {
    return { valid: false, error: 'Token missing' };
  }
  const parts = tokenString.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed token format' };
  }
  const [payloadB64, signature] = parts;
  const secret = options.secret || process.env.SUNO_PLAY_SECRET || 'suno-cinema-secret-token-key-2026';
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: 'Invalid token signature' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, error: 'Invalid token payload' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSec) {
    return { valid: false, error: 'Token expired', payload };
  }

  if (targetUrl && payload.url) {
    const normTarget = String(targetUrl).trim();
    const normTokenUrl = String(payload.url).trim();
    if (normTarget !== normTokenUrl) {
      try {
        const tObj = new URL(normTarget);
        const pObj = new URL(normTokenUrl);
        const pBasePath = pObj.pathname.substring(0, pObj.pathname.lastIndexOf('/') + 1);
        if (tObj.origin !== pObj.origin || !tObj.pathname.startsWith(pBasePath)) {
          return { valid: false, error: 'Token scope mismatch', payload };
        }
      } catch {
        return { valid: false, error: 'Token scope mismatch', payload };
      }
    }
  }

  return { valid: true, payload };
}

/**
 * Parse an HTTP Range header into numeric start and end byte offsets.
 *
 * @param {string} rangeHeader
 * @param {number} totalSize
 * @returns {{ start: number, end: number } | null}
 */
export function parseByteRange(rangeHeader, totalSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string' || !Number.isFinite(totalSize) || totalSize <= 0) return null;
  const match = rangeHeader.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  let start = match[1] ? parseInt(match[1], 10) : null;
  let end = match[2] ? parseInt(match[2], 10) : null;

  if (start === null && end !== null) {
    start = Math.max(0, totalSize - end);
    end = totalSize - 1;
  } else if (start !== null && end === null) {
    end = totalSize - 1;
  }

  if (start === null || end === null || isNaN(start) || isNaN(end) || start > end || start >= totalSize) {
    return null;
  }
  end = Math.min(end, totalSize - 1);
  return { start, end };
}

/**
 * Create an in-memory bounded LRU cache for HLS video/audio segments.
 *
 * @param {{ maxBytes?: number, maxEntries?: number }} [config]
 */
export function createHlsSegmentCache({ maxBytes = 48 * 1024 * 1024, maxEntries = 120 } = {}) {
  const cache = new Map();
  let currentBytes = 0;
  let hits = 0;
  let misses = 0;
  let accessSeq = 0;

  function evict(neededBytes = 0) {
    while ((currentBytes + neededBytes > maxBytes || cache.size >= maxEntries) && cache.size > 0) {
      let oldestKey = null;
      let oldestSeq = Infinity;
      for (const [k, v] of cache.entries()) {
        if (v.accessedSeq < oldestSeq) {
          oldestSeq = v.accessedSeq;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        const item = cache.get(oldestKey);
        currentBytes -= item.size;
        cache.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  return {
    get(url) {
      const entry = cache.get(url);
      if (entry) {
        entry.accessedSeq = ++accessSeq;
        hits++;
        return entry;
      }
      misses++;
      return null;
    },
    set(url, buffer, headers = {}) {
      if (!buffer || !Buffer.isBuffer(buffer)) return;
      const size = buffer.length;
      if (size > 12 * 1024 * 1024) return;
      if (cache.has(url)) {
        currentBytes -= cache.get(url).size;
        cache.delete(url);
      }
      evict(size);
      cache.set(url, {
        buffer,
        contentType: headers['content-type'] || 'video/MP2T',
        contentLength: size,
        etag: headers['etag'] || `"${size}-${Date.now().toString(36)}"`,
        size,
        accessedSeq: ++accessSeq,
      });
      currentBytes += size;
    },
    has(url) {
      return cache.has(url);
    },
    delete(url) {
      if (cache.has(url)) {
        currentBytes -= cache.get(url).size;
        return cache.delete(url);
      }
      return false;
    },
    clear() {
      cache.clear();
      currentBytes = 0;
      hits = 0;
      misses = 0;
    },
    getStats() {
      return {
        entries: cache.size,
        bytes: currentBytes,
        maxBytes,
        hits,
        misses,
        hitRate: hits + misses > 0 ? Number((hits / (hits + misses)).toFixed(3)) : 0,
      };
    },
  };
}

export const defaultSegmentCache = createHlsSegmentCache();

const inFlightPrefetches = new Set();

/**
 * Asynchronously pre-warm the next 1-2 video segments into memory from an active HLS playlist.
 *
 * @param {string} manifestText
 * @param {string} baseUrl
 * @param {string} [referer]
 * @param {object} [cache]
 * @param {string} [token]
 */
export function triggerLookaheadPrefetch(
  manifestText,
  baseUrl,
  referer = '',
  cache = defaultSegmentCache,
  token = ''
) {
  if (!manifestText || typeof manifestText !== 'string' || !cache) return;
  const lines = manifestText.split(/\r?\n/);
  const segmentUris = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const lower = trimmed.toLowerCase();
    if (
      lower.endsWith('.ts') ||
      lower.endsWith('.m4s') ||
      lower.endsWith('.mp4') ||
      lower.includes('/segment') ||
      lower.includes('/chunk')
    ) {
      segmentUris.push(trimmed);
      if (segmentUris.length >= 2) break;
    }
  }

  for (const uri of segmentUris) {
    try {
      const absUrl = new URL(uri, baseUrl).href;
      if (cache.has(absUrl) || inFlightPrefetches.has(absUrl)) continue;
      inFlightPrefetches.add(absUrl);

      const upstreamHeaders = buildProxyUpstreamHeaders(referer || absUrl, '', true);
      fetchWithRetry(
        absUrl,
        { method: 'GET', headers: upstreamHeaders, redirect: 'follow' },
        { timeoutMs: 6000, maxRetries: 1 }
      )
        .then(async (resp) => {
          if (!resp.ok) return;
          const arrayBuf = await resp.arrayBuffer();
          let buf = Buffer.from(arrayBuf);
          if (hasDisguisedHeader(buf)) {
            buf = unmaskDisguisedSegment(buf);
          }
          const ct = resolveSegmentMimeType(absUrl, resp.headers.get('content-type') || '');
          cache.set(absUrl, buf, { 'content-type': ct });
        })
        .catch(() => {})
        .finally(() => {
          inFlightPrefetches.delete(absUrl);
        });
    } catch {
      // Ignore prefetch parsing errors
    }
  }
}

/**
 * Stream prefetched peek chunks and incoming reader chunks while accumulating full buffer for caching.
 *
 * @param {Buffer} headBuf
 * @param {ReadableStreamDefaultReader} reader
 * @param {(fullBuffer: Buffer) => void} [onComplete]
 */
async function* streamPrefetchedAndCacheChunks(headBuf, reader, onComplete) {
  const chunks = [];
  let totalBytes = 0;
  let canCache = true;
  if (headBuf && headBuf.length > 0) {
    chunks.push(headBuf);
    totalBytes += headBuf.length;
    yield headBuf;
  }
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value && value.length > 0) {
      const b = Buffer.from(value);
      if (canCache) {
        chunks.push(b);
        totalBytes += b.length;
        if (totalBytes > 12 * 1024 * 1024) {
          canCache = false;
          chunks.length = 0;
        }
      }
      yield b;
    }
  }
  if (canCache && chunks.length > 0 && typeof onComplete === 'function') {
    const full = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    onComplete(full);
  }
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

function buildProxyUrl(absHref, proxyEndpoint, referer = '', token = '') {
  let url = `${proxyEndpoint}?url=${encodeURIComponent(absHref)}`;
  if (referer) url += `&referer=${encodeURIComponent(referer)}`;
  if (token) url += `&token=${encodeURIComponent(token)}`;
  return url;
}

/**
 * Rewrite HLS M3U8 manifest content to route all child playlists, chunks, audio/subtitle media tracks, and keys
 * through the HLS proxy while avoiding double-wrapping already proxied URIs, forwarding signed play tokens.
 *
 * @param {string} manifestText
 * @param {string} baseUrl
 * @param {string} [proxyEndpoint='/api/proxy/hls']
 * @param {string} [referer='']
 * @param {string} [token='']
 * @returns {string}
 */
export function rewriteHlsManifest(
  manifestText,
  baseUrl,
  proxyEndpoint = '/api/proxy/hls',
  referer = '',
  token = ''
) {
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
            if (token && !uri.includes('token=')) {
              const delim = uri.includes('?') ? '&' : '?';
              return `URI="${uri}${delim}token=${encodeURIComponent(token)}"`;
            }
            return match;
          }
          return `URI="${buildProxyUrl(abs, proxyEndpoint, referer, token)}"`;
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
          if (token && !trimmed.includes('token=')) {
            const delim = trimmed.includes('?') ? '&' : '?';
            return `${trimmed}${delim}token=${encodeURIComponent(token)}`;
          }
          return line;
        }
        return buildProxyUrl(abs, proxyEndpoint, referer, token);
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
  if (cleanPath.endsWith('.mkv')) return 'video/x-matroska';
  if (cleanPath.endsWith('.webm')) return 'video/webm';
  if (cleanPath.endsWith('.mov')) return 'video/quicktime';
  if (cleanPath.endsWith('.m4a') || cleanPath.endsWith('.cmfa')) return 'audio/mp4';
  if (cleanPath.endsWith('.aac')) return 'audio/aac';
  if (cleanPath.endsWith('.mp3')) return 'audio/mpeg';
  if (cleanPath.endsWith('.key')) return 'application/octet-stream';
  if (cleanPath.endsWith('.ts')) return 'video/mp2t';

  if (
    ctLower &&
    !ctLower.startsWith('image/') &&
    !ctLower.startsWith('font/') &&
    ctLower !== 'application/octet-stream' &&
    ctLower !== 'application/force-download'
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
  const token = reqUrl.searchParams.get('token') || '';
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return sendJson(res, 400, { error: 'Valid http/https "url" query parameter required' });
  }
  try {
    new URL(targetUrl);
  } catch {
    return sendJson(res, 400, { error: 'Malformed target "url" query parameter' });
  }

  const requireToken = process.env.REQUIRE_PLAY_TOKEN === 'true' || process.env.REQUIRE_PLAY_TOKEN === '1';
  if (requireToken || token) {
    const verified = verifyPlayToken(token, targetUrl);
    if (!verified.valid) {
      return sendJson(res, 403, {
        error: 'Invalid or expired playback token',
        reason: verified.error,
        targetUrl,
      });
    }
  }

  const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : '';
  const cachedSegment = defaultSegmentCache.get(targetUrl);
  if (cachedSegment) {
    const totalSize = cachedSegment.buffer.length;
    if (rangeHeader) {
      const parsed = parseByteRange(rangeHeader, totalSize);
      if (parsed) {
        const { start, end } = parsed;
        const slice = cachedSegment.buffer.subarray(start, end + 1);
        res.writeHead(206, {
          'Content-Type': cachedSegment.contentType || 'video/MP2T',
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Content-Length': slice.length,
          'Accept-Ranges': 'bytes',
          'X-Suno-Cache': 'HIT-RANGE',
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS,
        });
        if (req.method === 'HEAD') return res.end();
        return res.end(slice);
      }
    }
    res.writeHead(200, {
      'Content-Type': cachedSegment.contentType || 'video/MP2T',
      'Content-Length': totalSize,
      'Accept-Ranges': 'bytes',
      'X-Suno-Cache': 'HIT',
      'Cache-Control': 'public, max-age=3600',
      ...CORS_HEADERS,
    });
    if (req.method === 'HEAD') return res.end();
    return res.end(cachedSegment.buffer);
  }

  const abortController = new AbortController();
  const onResClose = () => {
    if (!res.writableFinished) {
      abortController.abort(new Error('Client disconnected'));
    }
  };
  res.on('close', onResClose);

  try {
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
      const rewritten = rewriteHlsManifest(text, finalUrl, '/api/proxy/hls', referer || finalUrl, token);
      triggerLookaheadPrefetch(text, finalUrl, referer || finalUrl, defaultSegmentCache, token);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Suno-Cache': 'MISS',
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
      'X-Suno-Cache': 'MISS',
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
        const rewritten = rewriteHlsManifest(text, finalUrl, '/api/proxy/hls', referer || finalUrl, token);
        triggerLookaheadPrefetch(text, finalUrl, referer || finalUrl, defaultSegmentCache, token);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Suno-Cache': 'MISS',
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
    await pipeline(
      Readable.from(
        streamPrefetchedAndCacheChunks(headBuf, reader, (fullBuf) => {
          defaultSegmentCache.set(finalUrl, fullBuf, {
            'content-type': outHeaders['Content-Type'],
          });
        })
      ),
      res
    );
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

const MAX_ADDONS = 12;
const MAX_DIRECT_ADDON_STREAMS = 12;
const MAX_DEBRID_CANDIDATES = 10;

function extractInfoHash(magnet, rawHash = '') {
  const cleanHash = String(rawHash || '').trim();
  if (/^[a-fA-F0-9]{40}$/.test(cleanHash) || /^[A-Za-z2-7]{32}$/.test(cleanHash)) {
    return cleanHash.toLowerCase();
  }
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

/**
 * Normalize a Stremio addon URL (converting stremio:// links to https://) and validate its scheme.
 * Preserves template braces ({tmdbId}, etc.) when present.
 *
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeAddonUrl(rawUrl) {
  let s = String(rawUrl || '').trim();
  if (!s) return '';
  if (/^stremio:\/\/https?:\/\//i.test(s)) {
    s = s.replace(/^stremio:\/\//i, '');
  } else if (/^stremio:\/\//i.test(s)) {
    s = s.replace(/^stremio:\/\//i, 'https://');
  }
  if (!/^https?:\/\//i.test(s)) return '';
  try {
    new URL(s.replace(/\{[^}]+\}/g, 'placeholder'));
    return s;
  } catch {
    return '';
  }
}

/**
 * Normalize a Stremio addon URL to its canonical manifest.json URL.
 *
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeAddonManifestUrl(rawUrl) {
  const normalized = normalizeAddonUrl(rawUrl);
  if (!normalized || normalized.includes('{')) return '';
  try {
    const u = new URL(normalized);
    if (!u.pathname.toLowerCase().endsWith('/manifest.json') && !u.pathname.toLowerCase().endsWith('.json')) {
      u.pathname = `${u.pathname.replace(/\/+$/, '')}/manifest.json`;
    }
    return u.href;
  } catch {
    return '';
  }
}

/**
 * Parse single, comma-separated, or JSON-array Stremio addon inputs (strings or { url, name, enabled } objects),
 * normalizing stremio:// links, filtering disabled entries, and deduplicating by addon base URL.
 *
 * @param {string|string[]} inputs
 * @returns {Array<{ url: string, name: string }>}
 */
export function parseAddonUrls(inputs) {
  const rawValues = Array.isArray(inputs) ? inputs : [inputs];
  const entries = [];
  const seen = new Set();

  const pushEntry = (rawUrl, name = '') => {
    const normalized = normalizeAddonUrl(rawUrl);
    if (!normalized) return;
    const dedupeKey = normalized.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '').toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    entries.push({ url: normalized, name: String(name || '').trim() });
  };

  for (const raw of rawValues) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string') {
              pushEntry(item);
            } else if (item && typeof item === 'object') {
              if (item.enabled === false) continue;
              pushEntry(item.url || item.manifestUrl || '', item.name || '');
            }
          }
          continue;
        }
      } catch {
        // Fall through to delimiter split
      }
    }

    // Split only before URL schemes so commas inside addon config paths (e.g. providers=yts,eztv) stay intact
    const parts = trimmed.split(/[\r\n]+|,\s*(?=(?:https?|stremio):\/\/)/i);
    for (const part of parts) {
      pushEntry(part);
    }
  }

  return entries.slice(0, MAX_ADDONS);
}

function detectStreamQuality(text) {
  const s = String(text || '');
  if (/\b(?:cam|hdcam|ts|telesync|hdts)\b/i.test(s)) {
    return { quality: 'CAM', score: 1 };
  }
  if (/(?:2160p?|4k|uhd)/i.test(s)) {
    return { quality: '4K UHD', score: 40 };
  }
  if (/(?:1080p?|fhd)/i.test(s)) {
    return { quality: '1080p', score: 30 };
  }
  if (/(?:720p?|hd)/i.test(s)) {
    return { quality: /720p?/i.test(s) ? '720p' : 'HD', score: 20 };
  }
  if (/(?:480p?|sd)/i.test(s)) {
    return { quality: '480p', score: 10 };
  }
  return { quality: 'HD', score: 15 };
}

function extractSeederTiebreaker(text) {
  const match = String(text || '').match(/👤\s*(\d+)/);
  if (!match) return 0;
  return Math.min(Number(match[1]) || 0, 900) / 1000;
}

function extractProxyReferer(stream) {
  const reqHeaders = stream?.behaviorHints?.proxyHeaders?.request;
  if (!reqHeaders || typeof reqHeaders !== 'object') return '';
  for (const [k, v] of Object.entries(reqHeaders)) {
    if (k.toLowerCase() === 'referer' && typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return '';
}

function substituteTemplateParams(templateUrl, { tmdbId, imdbId, anilistId, malId, mediaType, season, episode }) {
  return templateUrl
    .replace(/\{tmdbId\}/g, encodeURIComponent(tmdbId || ''))
    .replace(/\{imdbId\}/g, encodeURIComponent(imdbId || ''))
    .replace(/\{anilistId\}/g, encodeURIComponent(anilistId || ''))
    .replace(/\{malId\}/g, encodeURIComponent(malId || ''))
    .replace(/\{mediaType\}/g, encodeURIComponent(mediaType || 'movie'))
    .replace(/\{season\}/g, encodeURIComponent(String(season || 1)))
    .replace(/\{episode\}/g, encodeURIComponent(String(episode || 1)));
}

function isDirectMediaUrl(rawUrl) {
  const lower = String(rawUrl || '').toLowerCase();
  return (
    lower.includes('.m3u8') ||
    /\.(mp4|m4s|webm|m4v|mov)(\?|#|$)/i.test(lower)
  );
}

function isArchiveOrNonMediaUrl(rawUrl) {
  return /\.(rar|zip|7z|iso|tar|gz|nfo|txt|srt|ass)(?:$|\?|#)/i.test(String(rawUrl || '').trim());
}

function scoreTorrentFileForPlayback(f) {
  const p = String(f?.path || f?.name || '').toLowerCase();
  if (/\.(rar|zip|7z|iso|tar|nfo|txt|srt|ass|sub|idx)(?:$|\?)/i.test(p)) return -1;
  const isSample = /\bsample\b/i.test(p) && (f?.bytes || 0) < 120 * 1024 * 1024;
  if (isSample) return 0;
  if (/\.(mp4|m4v)(?:$|\?)/i.test(p)) return 2e15 + (f?.bytes || 0);
  if (/\.(webm|mov|mkv|avi)(?:$|\?)/i.test(p)) return 1e15 + (f?.bytes || 0);
  return f?.bytes || 0;
}

function computeBrowserCompatibilityBonus(metaText, filename) {
  const combined = `${filename || ''} ${metaText || ''}`;
  let bonus = 0;
  if (/\.(rar|zip|7z|iso|tar)\b/i.test(combined)) return -100;
  if (/\b(?:vvc|h\.?266|vvenc)\b/i.test(combined)) return -200;
  if (/\.(mp4|m4v)\b/i.test(combined)) bonus += 30;
  if (/\.(mkv|avi|wmv)\b/i.test(combined)) bonus -= 35;
  if (/\b(?:x264|h\.?264|avc|aac)\b/i.test(combined)) bonus += 20;
  if (/\b(?:4320p|8k)\b/i.test(combined)) bonus -= 50;
  if (/\b(?:dts(?:-hd)?|truehd|ac3|eac3|ddp?5\.?1)\b/i.test(combined)) bonus -= 30;
  if (/\b(?:hevc|x265|h\.?265|av1|dolby[\s.-]?vision|dovi)\b/i.test(combined)) {
    bonus -= 25;
  }
  return bonus;
}

async function resolveRealDebridStream(apiKey, magnetUri, preferredFileIdx, diagOut = null) {
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
  if (!addResp.ok) {
    if (diagOut && !diagOut.error) {
      const errJson = await addResp.json().catch(() => null);
      if (errJson?.error) diagOut.error = errJson.error;
    }
    return null;
  }
  const added = await addResp.json();
  if (!added?.id) return null;

  const torrentId = added.id;
  const cleanupTorrent = () =>
    fetch(`https://api.real-debrid.com/rest/1.0/torrents/delete/${encodeURIComponent(torrentId)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => {});

  // Check file list before selection so multi-file torrents select only 1 video file (avoids .rar bundling)
  let filesParam = 'all';
  const preInfoResp = await fetchWithRetry(
    `https://api.real-debrid.com/rest/1.0/torrents/info/${encodeURIComponent(torrentId)}`,
    { headers },
    { timeoutMs: 6000, maxRetries: 1 }
  ).catch(() => null);

  let info = preInfoResp?.ok ? await preInfoResp.json().catch(() => null) : null;
  if (info?.status === 'waiting_files_selection' && Array.isArray(info.files) && info.files.length > 0) {
    const preferred = Number.isInteger(preferredFileIdx) ? info.files[preferredFileIdx] : null;
    if (preferred && preferred.id !== undefined && scoreTorrentFileForPlayback(preferred) >= 1e15) {
      filesParam = String(preferred.id);
    } else {
      let bestFile = null;
      let bestScore = 0;
      for (const f of info.files) {
        const s = scoreTorrentFileForPlayback(f);
        if (s > bestScore) {
          bestScore = s;
          bestFile = f;
        }
      }
      if (bestFile && bestFile.id !== undefined && bestScore >= 1e15) {
        filesParam = String(bestFile.id);
      } else {
        await cleanupTorrent();
        return null;
      }
    }
    info = null;
  }

  if (!info || info.status !== 'downloaded' || !Array.isArray(info.links) || !info.links[0]) {
    await fetchWithRetry(
      `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${encodeURIComponent(torrentId)}`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ files: filesParam }).toString(),
      },
      { timeoutMs: 6000, maxRetries: 1 }
    ).catch(() => null);

    const infoResp = await fetchWithRetry(
      `https://api.real-debrid.com/rest/1.0/torrents/info/${encodeURIComponent(torrentId)}`,
      { headers },
      { timeoutMs: 6000, maxRetries: 1 }
    );
    if (!infoResp.ok) {
      await cleanupTorrent();
      return null;
    }
    info = await infoResp.json();
  }

  if (info?.status !== 'downloaded' || !Array.isArray(info.links) || !info.links[0]) {
    await cleanupTorrent();
    return null;
  }

  let chosenLink = info.links[0];
  if (info.links.length > 1 && Array.isArray(info.files)) {
    const selectedFiles = info.files.filter((f) => f.selected === 1);
    const preferred = Number.isInteger(preferredFileIdx) ? info.files[preferredFileIdx] : null;
    if (preferred && preferred.selected === 1 && scoreTorrentFileForPlayback(preferred) >= 1e15) {
      const selIdx = selectedFiles.indexOf(preferred);
      if (selIdx >= 0 && info.links[selIdx]) {
        chosenLink = info.links[selIdx];
      }
    } else if (selectedFiles.length > 0) {
      let bestIdx = 0;
      let bestScore = -1;
      selectedFiles.forEach((f, idx) => {
        if (!info.links[idx]) return;
        const score = scoreTorrentFileForPlayback(f);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });
      chosenLink = info.links[bestIdx] || info.links[0];
    }
  }

  const unrestrictResp = await fetchWithRetry(
    'https://api.real-debrid.com/rest/1.0/unrestrict/link',
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ link: chosenLink }).toString(),
    },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!unrestrictResp.ok) {
    if (diagOut && !diagOut.error) {
      const errJson = await unrestrictResp.json().catch(() => null);
      if (errJson?.error) diagOut.error = errJson.error;
    }
    await cleanupTorrent();
    return null;
  }
  const unrestrict = await unrestrictResp.json();
  if (
    unrestrict?.download &&
    /^https?:\/\//i.test(unrestrict.download) &&
    !isArchiveOrNonMediaUrl(unrestrict.download) &&
    !isArchiveOrNonMediaUrl(unrestrict.filename)
  ) {
    return unrestrict.download;
  }
  await cleanupTorrent();
  return null;
}

async function resolveTorBoxStream(apiKey, magnetUri, infoHash, preferredFileIdx, { skipCacheCheck = false } = {}) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (!skipCacheCheck && infoHash) {
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
    files.reduce((best, f) => {
      const isVideo = /\.(mp4|mkv|webm|m4v|avi|mov)$/i.test(f.name || f.short_name || '');
      const fScore = (isVideo ? 1e15 : 0) + (f.size || 0);
      const bestIsVideo = best ? /\.(mp4|mkv|webm|m4v|avi|mov)$/i.test(best.name || best.short_name || '') : false;
      const bestScore = best ? (bestIsVideo ? 1e15 : 0) + (best.size || 0) : -1;
      return fScore > bestScore ? f : best;
    }, null);
  if (picked?.id === undefined || picked?.id === null || picked?.id === '') return null;

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
    return await resolveRealDebridStream(apiKey, magnetUri, fileIdx);
  } catch {
    return null;
  }
}

function buildMagnetUri(candidate) {
  if (candidate?.magnet && candidate.magnet.startsWith('magnet:')) return candidate.magnet;
  if (candidate?.infoHash) return `magnet:?xt=urn:btih:${candidate.infoHash}`;
  return '';
}

/**
 * Batch-check TorBox candidates via `checkcached?hash=h1,h2,...` or iterate top Real-Debrid candidates
 * until a cached playable stream resolves.
 *
 * @param {{ provider?: string, apiKey: string, candidates: Array<object> }} params
 * @returns {Promise<{ url: string, candidate: object } | null>}
 */
export async function resolveDebridCandidates({ provider = 'realdebrid', apiKey, candidates = [] }) {
  if (!apiKey || !Array.isArray(candidates) || !candidates.length) return null;
  const normProvider = String(provider || 'realdebrid').toLowerCase().replace(/[-_\s]/g, '');

  let orderedCandidates = candidates.filter((c) => c && (c.infoHash || c.magnet));
  if (!orderedCandidates.length) return null;

  if (normProvider === 'torbox') {
    const headers = { Authorization: `Bearer ${apiKey}` };
    const hashes = [...new Set(orderedCandidates.map((c) => c.infoHash).filter(Boolean))];
    if (hashes.length > 0) {
      const checkResp = await fetchWithRetry(
        `https://api.torbox.app/v1/api/torrents/checkcached?hash=${hashes.map((h) => encodeURIComponent(h)).join(',')}&format=list`,
        { headers },
        { timeoutMs: 5000, maxRetries: 1 }
      ).catch(() => null);

      if (checkResp?.ok) {
        const checkJson = await checkResp.json().catch(() => null);
        const data = checkJson?.data;
        if (Array.isArray(data)) {
          if (data.length === 0) return null;
          const cachedSet = new Set(
            data.map((row) => String(row?.hash || row?.info_hash || '').toLowerCase()).filter(Boolean)
          );
          if (cachedSet.size > 0) {
            orderedCandidates = orderedCandidates.filter(
              (c) => c.infoHash && cachedSet.has(c.infoHash.toLowerCase())
            );
            if (!orderedCandidates.length) return null;
          }
        } else if (data && typeof data === 'object') {
          const cachedSet = new Set(
            Object.entries(data)
              .filter(([, val]) => Boolean(val) && val?.cached !== false)
              .map(([k]) => k.toLowerCase())
          );
          orderedCandidates = orderedCandidates.filter(
            (c) => c.infoHash && cachedSet.has(c.infoHash.toLowerCase())
          );
          if (!orderedCandidates.length) return null;
        } else if (data === null || data === false) {
          return null;
        }
      }
    }

    for (const candidate of orderedCandidates) {
      const magnetUri = buildMagnetUri(candidate);
      if (!magnetUri) continue;
      try {
        const playable = await resolveTorBoxStream(apiKey, magnetUri, candidate.infoHash, candidate.fileIdx, {
          skipCacheCheck: true,
        });
        if (playable) return { url: playable, candidate };
      } catch {
        // Try next cached candidate
      }
    }
    return null;
  }

  const MAX_RD_PROBES = 7;
  const existingByHash = new Map();
  try {
    const listResp = await fetchWithRetry(
      'https://api.real-debrid.com/rest/1.0/torrents?limit=50',
      { headers: { Authorization: `Bearer ${apiKey}` } },
      { timeoutMs: 4000, maxRetries: 0 }
    );
    if (listResp?.ok) {
      const listData = await listResp.json().catch(() => null);
      if (Array.isArray(listData)) {
        for (const t of listData) {
          const h = String(t?.hash || '').toLowerCase();
          if (!h || t?.status !== 'downloaded' || !Array.isArray(t?.links) || !t.links.length) continue;
          if (isArchiveOrNonMediaUrl(t.filename)) continue;
          if (!existingByHash.has(h)) existingByHash.set(h, t);
        }
      }
    }
  } catch {
    // Proceed cleanly if active torrents list lookup is unavailable
  }

  for (const candidate of orderedCandidates) {
    const existing = candidate.infoHash ? existingByHash.get(candidate.infoHash.toLowerCase()) : null;
    if (!existing) continue;
    try {
      const link = existing.links[0];
      const unrestrictResp = await fetchWithRetry(
        'https://api.real-debrid.com/rest/1.0/unrestrict/link',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ link }).toString(),
        },
        { timeoutMs: 6000, maxRetries: 1 }
      );
      if (unrestrictResp?.ok) {
        const unrestrict = await unrestrictResp.json().catch(() => null);
        if (
          unrestrict?.download &&
          /^https?:\/\//i.test(unrestrict.download) &&
          !isArchiveOrNonMediaUrl(unrestrict.download) &&
          !isArchiveOrNonMediaUrl(unrestrict.filename)
        ) {
          return { url: unrestrict.download, candidate };
        }
      }
    } catch {
      // Fall through to fresh resolution if reuse unrestrict fails
    }
  }

  const rdDiag = {};
  for (const candidate of orderedCandidates.slice(0, MAX_RD_PROBES)) {
    const magnetUri = buildMagnetUri(candidate);
    if (!magnetUri) continue;
    try {
      const playable = await resolveRealDebridStream(apiKey, magnetUri, candidate.fileIdx, rdDiag);
      if (playable) return { url: playable, candidate };
      if (rdDiag.error === 'bad_token' || rdDiag.error === 'hoster_not_free' || rdDiag.error === 'traffic_exhausted') {
        return { url: null, debridError: rdDiag.error };
      }
    } catch {
      // Try next candidate
    }
  }
  return rdDiag.error ? { url: null, debridError: rdDiag.error } : null;
}

function buildAddonStreamEndpoint({ addonUrl, tmdbId, imdbId, anilistId, malId, mediaType, season, episode }) {
  const normalized = normalizeAddonUrl(addonUrl);
  if (!normalized) return '';
  if (normalized.includes('{')) {
    return substituteTemplateParams(normalized, { tmdbId, imdbId, anilistId, malId, mediaType, season, episode });
  }
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

  if (!stremioId) return '';
  try {
    const u = new URL(normalized);
    const basePath = u.pathname.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '');
    return `${u.origin}${basePath}/stream/${stremioType}/${encodeURIComponent(stremioId)}.json${u.search}`;
  } catch {
    const addonBase = normalized.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '');
    return `${addonBase}/stream/${stremioType}/${encodeURIComponent(stremioId)}.json`;
  }
}

export function isRateLimitOrFakeStream(stream, rawLabel = '') {
  const url = String(stream?.url || '').toLowerCase();
  const label = `${rawLabel} ${stream?.name || ''} ${stream?.title || ''} ${stream?.description || ''}`.toLowerCase();
  if (/public-rate-limit-exceeded|rate[-_]?limit[-_]?exceeded|elfhosted\.com\/assets\//i.test(url)) {
    return true;
  }
  if (/🐢|rate[- ]?limit\s*exceeded|too many requests|public instance.*limit/i.test(label)) {
    return true;
  }
  return false;
}

function collectStreamsAndCandidates(streams, { addonName = '', maxDirect = 6, seenUrls, candidateMap }) {
  const directStreams = [];
  let added = 0;

  for (const stream of Array.isArray(streams) ? streams : []) {
    const rawLabel = [stream?.name, stream?.title, stream?.description]
      .filter(Boolean)
      .join(' — ')
      .split('\n')[0]
      .trim()
      .slice(0, 80);
    if (isRateLimitOrFakeStream(stream, rawLabel)) {
      continue;
    }
    const qualityMeta = [
      stream?.name,
      stream?.title,
      stream?.description,
      stream?.behaviorHints?.filename,
    ]
      .filter(Boolean)
      .join(' ');
    const { quality, score: baseScore } = detectStreamQuality(qualityMeta);

    if (stream?.url && /^https?:\/\//i.test(stream.url)) {
      if (added >= maxDirect) continue;
      const lowerUrl = stream.url.toLowerCase();
      const isDirectVideo = /\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(lowerUrl) || (lowerUrl.includes('.mp4') && !lowerUrl.includes('.m3u8'));
      if (stream.behaviorHints?.notWebReady === true && !lowerUrl.includes('.m3u8') && !isDirectVideo) {
        continue;
      }
      if (seenUrls.has(stream.url)) continue;
      seenUrls.add(stream.url);

      const streamReferer = extractProxyReferer(stream);
      directStreams.push({
        name: rawLabel || (addonName ? `${addonName} Stream` : 'Addon HLS Stream'),
        type: isDirectVideo ? 'direct' : 'hls',
        url: makeProxyHlsUrl(stream.url, streamReferer),
        rawUrl: stream.url,
        referer: streamReferer || undefined,
        quality,
        addonName: addonName || undefined,
        shielded: true,
        direct: true,
        node: 'addon-proxy',
      });
      added += 1;
      continue;
    }

    const magnetInStream = /^magnet:\?xt=urn:btih:/i.test(stream?.url || '')
      ? stream.url
      : /^magnet:\?xt=urn:btih:/i.test(stream?.magnet || '')
      ? stream.magnet
      : '';
    const infoHash = extractInfoHash(magnetInStream, stream?.infoHash || '');
    if (infoHash && !candidateMap.has(infoHash)) {
      const filename = stream?.behaviorHints?.filename || '';
      const browserBonus = computeBrowserCompatibilityBonus(qualityMeta, filename);
      const seederBonus = extractSeederTiebreaker(`${stream?.title || ''} ${stream?.description || ''}`);
      candidateMap.set(infoHash, {
        infoHash,
        magnet: magnetInStream,
        fileIdx: Number.isInteger(stream?.fileIdx) ? stream.fileIdx : undefined,
        title: rawLabel || filename || 'Torrent Stream',
        quality,
        qualityScore: baseScore + browserBonus + seederBonus,
        addonName: addonName || undefined,
        order: candidateMap.size,
      });
    }
  }

  return directStreams;
}

function buildCustomResolverPair(rawUrl, isHls, { name = '', quality = 'Original Quality', referer = '', includeDirect = true } = {}) {
  const out = [
    {
      id: 'custom-resolver',
      name: name || (isHls ? 'Custom Resolver HLS (Proxy)' : 'Custom Resolver Stream'),
      type: isHls ? 'hls' : 'direct',
      url: makeProxyHlsUrl(rawUrl, referer),
      rawUrl,
      ...(referer ? { referer } : {}),
      quality,
      shielded: true,
      direct: true,
      node: 'custom-resolver',
    },
  ];
  if (isHls && includeDirect && !referer) {
    out.push({
      id: 'custom-resolver-direct',
      name: 'Custom Resolver HLS (Direct)',
      type: 'hls',
      url: rawUrl,
      rawUrl,
      quality,
      shielded: true,
      direct: true,
      node: 'custom-resolver-direct',
    });
  }
  return out;
}

function extractCustomResolverJsonSources(data, originBase, seenUrls, candidateMap) {
  if (Array.isArray(data?.streams)) {
    return collectStreamsAndCandidates(data.streams, {
      addonName: 'Custom Resolver',
      maxDirect: 6,
      seenUrls,
      candidateMap,
    }).map((s, idx) => ({
      ...s,
      id: idx === 0 ? 'custom-resolver' : `custom-resolver-${idx + 1}`,
      node: 'custom-resolver',
    }));
  }

  const out = [];
  if (Array.isArray(data?.sources)) {
    for (const s of data.sources.slice(0, 6)) {
      if (!s?.url || !/^https?:\/\//i.test(s.url) || seenUrls.has(s.url) || isRateLimitOrFakeStream({ url: s.url, name: s.name }, s.name)) continue;
      seenUrls.add(s.url);
      const isDirectVideo = /\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(s.url);
      const idx = out.length;
      out.push({
        id: idx === 0 ? 'custom-resolver' : `custom-resolver-${idx + 1}`,
        name: s.name || 'Custom Resolver Stream',
        type: s.type === 'direct' || isDirectVideo ? 'direct' : 'hls',
        url: makeProxyHlsUrl(s.url, s.referer || ''),
        rawUrl: s.url,
        referer: s.referer || undefined,
        quality: s.quality || 'HD',
        shielded: true,
        direct: true,
        node: 'custom-resolver',
      });
    }
    return out;
  }

  if (Array.isArray(data?.MediaSources)) {
    for (const ms of data.MediaSources.slice(0, 4)) {
      const rawMediaUrl =
        ms?.TranscodingUrl || ms?.DirectStreamUrl || (ms?.Path && /^https?:\/\//i.test(ms.Path) ? ms.Path : '');
      if (!rawMediaUrl) continue;
      let absUrl = '';
      try {
        absUrl = new URL(rawMediaUrl, originBase).href;
      } catch {
        continue;
      }
      if (seenUrls.has(absUrl)) continue;
      seenUrls.add(absUrl);
      const idx = out.length;
      out.push({
        id: idx === 0 ? 'custom-resolver' : `custom-resolver-${idx + 1}`,
        name: ms.Name ? `Media Server — ${ms.Name}` : 'Media Server Stream',
        type: absUrl.toLowerCase().includes('.m3u8') ? 'hls' : 'direct',
        url: makeProxyHlsUrl(absUrl),
        rawUrl: absUrl,
        quality: detectStreamQuality(ms.Name || '').quality,
        shielded: true,
        direct: true,
        node: 'custom-resolver',
      });
    }
    return out;
  }

  const singleUrl = data?.url || data?.hlsUrl || data?.streamUrl || data?.playbackUrl || data?.masterUrl || '';
  if (singleUrl && /^https?:\/\//i.test(singleUrl) && !seenUrls.has(singleUrl)) {
    seenUrls.add(singleUrl);
    const isHls = singleUrl.toLowerCase().includes('.m3u8') || !/\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(singleUrl);
    const ref = typeof data?.referer === 'string' ? data.referer : '';
    return buildCustomResolverPair(singleUrl, isHls, {
      name: data?.name || 'Custom Resolver Stream',
      quality: data?.quality || 'Original Quality',
      referer: ref,
      includeDirect: false,
    });
  }
  return out;
}

async function resolveCustomEndpoint({
  customResolverUrl,
  tmdbId,
  imdbId,
  anilistId,
  malId,
  mediaType,
  season,
  episode,
  seenUrls,
  candidateMap,
}) {
  const normalized = normalizeAddonUrl(customResolverUrl);
  if (!normalized) return { sources: [], warning: '' };

  const expanded = substituteTemplateParams(normalized, {
    tmdbId,
    imdbId,
    anilistId,
    malId,
    mediaType,
    season,
    episode,
  });

  let parsedUrl;
  try {
    parsedUrl = new URL(expanded);
  } catch {
    return { sources: [], warning: 'Invalid custom resolver URL template' };
  }

  if (seenUrls.has(expanded)) return { sources: [], warning: '' };

  if (isDirectMediaUrl(expanded)) {
    seenUrls.add(expanded);
    const isHls = expanded.toLowerCase().includes('.m3u8');
    return {
      sources: buildCustomResolverPair(expanded, isHls, {
        name: isHls ? 'Custom Resolver HLS (Proxy)' : 'Custom Resolver Video',
      }),
      warning: '',
    };
  }

  try {
    const resp = await fetchWithRetry(
      expanded,
      {
        headers: {
          Accept: 'application/json, application/vnd.apple.mpegurl, */*',
          'User-Agent': 'SunoCinema/1.0',
        },
        redirect: 'follow',
      },
      { timeoutMs: 6000, maxRetries: 1, backoffMs: [200] }
    );
    if (!resp.ok) {
      await resp.body?.cancel?.().catch(() => {});
      return { sources: [], warning: `Custom resolver HTTP ${resp.status}` };
    }

    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('mpegurl') || ct.startsWith('video/') || ct.startsWith('audio/') || ct === 'application/octet-stream') {
      await resp.body?.cancel?.().catch(() => {});
      seenUrls.add(expanded);
      const isHls = ct.includes('mpegurl') || expanded.toLowerCase().includes('.m3u8');
      return { sources: buildCustomResolverPair(expanded, isHls), warning: '' };
    }

    const text = await resp.text();
    if (text.trimStart().startsWith('#EXTM3U')) {
      seenUrls.add(expanded);
      return { sources: buildCustomResolverPair(expanded, true), warning: '' };
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { sources: [], warning: 'Custom resolver returned non-JSON response' };
    }

    return {
      sources: extractCustomResolverJsonSources(data, parsedUrl.origin, seenUrls, candidateMap),
      warning: '',
    };
  } catch (err) {
    return { sources: [], warning: `Custom resolver failed: ${err.message}` };
  }
}

async function handleAddonManifestRequest(req, res, reqUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' });
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const rawUrl = reqUrl.searchParams.get('url') || reqUrl.searchParams.get('addonUrl') || '';
  const manifestUrl = normalizeAddonManifestUrl(rawUrl);
  if (!manifestUrl) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Valid http/https/stremio addon "url" query parameter required',
    });
  }

  const abortController = new AbortController();
  const onResClose = () => {
    if (!res.writableFinished) {
      abortController.abort(new Error('Client disconnected'));
    }
  };
  res.on('close', onResClose);

  try {
    let resp = await fetchWithRetry(
      manifestUrl,
      {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SunoCinema/1.0',
        },
        redirect: 'follow',
        signal: abortController.signal,
      },
      { timeoutMs: 7000, maxRetries: 1, backoffMs: [200] }
    );

    if (req.method === 'HEAD' && resp.status === 405) {
      await resp.body?.cancel?.().catch(() => {});
      resp = await fetchWithRetry(
        manifestUrl,
        {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': 'SunoCinema/1.0' },
          redirect: 'follow',
          signal: abortController.signal,
        },
        { timeoutMs: 7000, maxRetries: 1, backoffMs: [200] }
      );
    }

    if (!resp.ok) {
      await resp.body?.cancel?.().catch(() => {});
      return sendJson(res, resp.status, {
        ok: false,
        error: `Upstream HTTP ${resp.status} ${resp.statusText}`.trim(),
        manifestUrl,
      });
    }

    if (req.method === 'HEAD') {
      await resp.body?.cancel?.().catch(() => {});
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      });
      return res.end();
    }

    const rawText = await resp.text();
    let manifest;
    try {
      manifest = JSON.parse(rawText);
    } catch {
      return sendJson(res, 502, {
        ok: false,
        error: 'Addon manifest did not return valid JSON',
        manifestUrl,
      });
    }

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || (!manifest.id && !manifest.name)) {
      return sendJson(res, 422, {
        ok: false,
        error: 'Invalid Stremio addon manifest (missing id or name)',
        manifestUrl,
      });
    }

    const baseUrl = manifestUrl.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '');
    return sendJson(res, 200, {
      ok: true,
      manifestUrl,
      baseUrl,
      manifest,
      id: manifest.id || '',
      name: manifest.name || 'Stremio Addon',
      version: manifest.version || '1.0.0',
      description: manifest.description || '',
      logo: manifest.logo || '',
      types: Array.isArray(manifest.types) ? manifest.types : [],
      resources: Array.isArray(manifest.resources) ? manifest.resources : [],
      idPrefixes: Array.isArray(manifest.idPrefixes) ? manifest.idPrefixes : [],
    });
  } catch (err) {
    if (res.destroyed || abortController.signal.aborted) return;
    return sendJson(res, isTimeoutError(err) ? 504 : 502, {
      ok: false,
      error: isTimeoutError(err) ? 'Addon manifest request timed out' : `Addon manifest fetch failed: ${err.message}`,
      manifestUrl,
    });
  } finally {
    res.off('close', onResClose);
  }
}

async function resolveTorrentioDebridDirect({
  addonEntries = [],
  debridProvider = 'realdebrid',
  debridKey = '',
  tmdbId = '',
  imdbId = '',
  mediaType = 'movie',
  season = 1,
  episode = 1,
}) {
  if (debridProvider !== 'realdebrid' || !debridKey || (!imdbId && !tmdbId)) return null;
  const hasTorrentio = addonEntries.some((e) => {
    const u = String(e?.url || '').toLowerCase();
    return u.includes('torrentio.strem.fun') && !u.includes('realdebrid=');
  });
  if (!hasTorrentio) return null;

  const stremioType = mediaType === 'tv' || mediaType === 'series' ? 'series' : mediaType === 'anime' && !imdbId ? 'anime' : 'movie';
  if (stremioType === 'anime') return null;
  const stremioId =
    stremioType === 'series'
      ? imdbId
        ? `${imdbId}:${season}:${episode}`
        : `tmdb:${tmdbId}:${season}:${episode}`
      : imdbId || `tmdb:${tmdbId}`;

  try {
    const endpoint = `https://torrentio.strem.fun/realdebrid=${encodeURIComponent(
      debridKey
    )}/stream/${stremioType}/${encodeURIComponent(stremioId)}.json`;
    const data = await fetchJsonWithTimeout(
      endpoint,
      { headers: { Accept: 'application/json', 'User-Agent': 'Stremio/4.4.168' } },
      4500
    ).catch(() => null);
    const streams = Array.isArray(data?.streams) ? data.streams : [];
    const ranked = streams
      .filter((s) => s?.url && /^https?:\/\//i.test(s.url) && !isRateLimitOrFakeStream(s, s.title || s.name))
      .map((s, order) => {
        const meta = [s.name, s.title, s.description, s.behaviorHints?.filename].filter(Boolean).join(' ');
        const { quality, score } = detectStreamQuality(meta);
        const compat = computeBrowserCompatibilityBonus(meta, s.behaviorHints?.filename || '');
        const seeds = extractSeederTiebreaker(meta);
        return { s, quality, totalScore: score + compat + seeds, order };
      })
      .filter((r) => !isArchiveOrNonMediaUrl(r.s.behaviorHints?.filename || r.s.url))
      .sort((a, b) => b.totalScore - a.totalScore || a.order - b.order);

    for (const item of ranked.slice(0, 2)) {
      let resolveResp = await fetchWithRetry(
        item.s.url,
        { method: 'HEAD', headers: { 'User-Agent': 'Stremio/4.4.168' }, redirect: 'manual' },
        { timeoutMs: 4000, maxRetries: 0 }
      ).catch(() => null);
      if (resolveResp && resolveResp.status === 405) {
        await resolveResp.body?.cancel?.().catch(() => {});
        resolveResp = await fetchWithRetry(
          item.s.url,
          { method: 'GET', headers: { 'User-Agent': 'Stremio/4.4.168' }, redirect: 'manual' },
          { timeoutMs: 4000, maxRetries: 0 }
        ).catch(() => null);
      }
      const loc = resolveResp?.headers?.get('location') || '';
      await resolveResp?.body?.cancel?.().catch(() => {});
      if (
        loc &&
        /^https?:\/\//i.test(loc) &&
        !loc.includes(debridKey) &&
        !/failed_access/i.test(loc) &&
        !isArchiveOrNonMediaUrl(loc)
      ) {
        const hashMatch = item.s.url.match(/\/([a-fA-F0-9]{40})\//);
        return {
          url: loc,
          candidate: {
            infoHash: hashMatch ? hashMatch[1].toLowerCase() : '',
            title: String(item.s.title || item.s.name || 'Torrentio Cached').split('\n')[0].trim().slice(0, 64),
            quality: item.quality,
            isExplicit: false,
          },
        };
      }
    }
  } catch {
    // Fall back cleanly
  }
  return null;
}

async function searchOpenTorrentIndexers({ title = '', year = '', candidateMap }) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return;
  const query = year && !cleanTitle.includes(String(year)) ? `${cleanTitle} ${year}` : cleanTitle;

  const pushHashCandidate = (rawHash, label, sizeBytes = 0, seeders = 0) => {
    const infoHash = extractInfoHash('', rawHash);
    if (!infoHash || candidateMap.has(infoHash)) return;
    const { quality, score } = detectStreamQuality(label);
    const bonus = computeBrowserCompatibilityBonus(label, label);
    const seederBonus = Math.min(Number(seeders) || 0, 900) / 1000;
    const sizePenalty = sizeBytes > 12 * 1024 * 1024 * 1024 ? -15 : 0;
    candidateMap.set(infoHash, {
      infoHash,
      magnet: `magnet:?xt=urn:btih:${infoHash}`,
      title: String(label || 'Open Torrent').slice(0, 80),
      quality,
      qualityScore: score + bonus + seederBonus + sizePenalty,
      order: candidateMap.size,
    });
  };

  await Promise.allSettled([
    fetchWithRetry(
      `https://torrents-csv.com/service/search?q=${encodeURIComponent(query)}&size=10`,
      { headers: { Accept: 'application/json' } },
      { timeoutMs: 3200, maxRetries: 0 }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        for (const row of Array.isArray(data?.torrents) ? data.torrents : []) {
          pushHashCandidate(row?.infohash, row?.name, row?.size_bytes, row?.seeders);
        }
      })
      .catch(() => {}),
    fetchWithRetry(
      'https://api.knaben.org/v1',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, size: 10 }),
      },
      { timeoutMs: 3200, maxRetries: 0 }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        for (const row of Array.isArray(data?.hits) ? data.hits : []) {
          pushHashCandidate(row?.hash, row?.title || row?.description || '', row?.bytes, row?.seeders);
        }
      })
      .catch(() => {}),
  ]);
}

async function handleResolveStreamRequest(req, res, reqUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' });
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const getHeader = (name) => {
    const val = req.headers[name];
    return Array.isArray(val) ? val.join(',') : typeof val === 'string' ? val : '';
  };

  const tmdbId = reqUrl.searchParams.get('tmdbId') || '';
  const imdbIdParam = reqUrl.searchParams.get('imdbId') || '';
  const anilistId = reqUrl.searchParams.get('anilistId') || '';
  const malIdParam = reqUrl.searchParams.get('malId') || '';
  const mediaType = reqUrl.searchParams.get('mediaType') || 'movie';
  const title = reqUrl.searchParams.get('title') || '';
  const year = reqUrl.searchParams.get('year') || '';
  const season = Math.max(1, Number(reqUrl.searchParams.get('season') || 1));
  const episode = Math.max(1, Number(reqUrl.searchParams.get('episode') || 1));
  const directUrl = reqUrl.searchParams.get('directUrl') || '';
  const referer = reqUrl.searchParams.get('referer') || '';
  const magnet = reqUrl.searchParams.get('magnet') || '';
  const hash = (reqUrl.searchParams.get('hash') || reqUrl.searchParams.get('infoHash') || '').trim();
  const clientHashesRaw = reqUrl.searchParams.get('hashes') || '';

  const requestAddonInputs = [
    ...reqUrl.searchParams.getAll('addonUrls'),
    ...reqUrl.searchParams.getAll('addonUrl'),
    getHeader('x-addon-urls'),
    getHeader('x-addon-url'),
  ].filter((v) => typeof v === 'string' && v.trim() !== '');
  const addonEntries =
    requestAddonInputs.length > 0
      ? parseAddonUrls(requestAddonInputs)
      : parseAddonUrls([process.env.STREMIO_ADDON_URLS || '', process.env.STREMIO_ADDON_URL || '']);

  const customResolverUrl = (
    reqUrl.searchParams.get('customResolverUrl') ||
    getHeader('x-custom-resolver') ||
    process.env.CUSTOM_RESOLVER_URL ||
    ''
  ).trim();

  const debridKey = (
    reqUrl.searchParams.get('debridKey') ||
    reqUrl.searchParams.get('debridToken') ||
    getHeader('x-debrid-key') ||
    process.env.DEBRID_API_KEY ||
    process.env.REALDEBRID_API_KEY ||
    process.env.TORBOX_API_KEY ||
    ''
  ).trim();
  const inferredEnvProvider =
    process.env.DEBRID_PROVIDER ||
    (process.env.TORBOX_API_KEY && !process.env.REALDEBRID_API_KEY ? 'torbox' : 'realdebrid');
  const debridProvider = (
    reqUrl.searchParams.get('debridProvider') ||
    getHeader('x-debrid-provider') ||
    inferredEnvProvider ||
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
  let imdbId = imdbIdParam || localItem?.imdbId || '';
  const malId = malIdParam || localItem?.malId || '';

  let resolvedTmdbId = tmdbId;
  const tmdbKey = process.env.TMDB_API_KEY || '';
  if (resolvedTmdbId && !imdbId && tmdbKey && (mediaType === 'movie' || mediaType === 'tv' || mediaType === 'series')) {
    try {
      const tmdbPath = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
      const extResp = await fetchWithRetry(
        `https://api.themoviedb.org/3/${tmdbPath}/${encodeURIComponent(resolvedTmdbId)}/external_ids?api_key=${encodeURIComponent(
          tmdbKey
        )}`,
        { headers: { Accept: 'application/json' } },
        { timeoutMs: 2500, maxRetries: 0 }
      );
      if (extResp.ok) {
        const extData = await extResp.json().catch(() => null);
        if (extData?.imdb_id) imdbId = String(extData.imdb_id);
      } else {
        await extResp.body?.cancel?.().catch(() => {});
      }
    } catch {
      // Proceed smoothly
    }
  } else if (imdbId && !resolvedTmdbId && tmdbKey && (mediaType === 'movie' || mediaType === 'tv' || mediaType === 'series')) {
    try {
      const findResp = await fetchWithRetry(
        `https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}?external_source=imdb_id&api_key=${encodeURIComponent(
          tmdbKey
        )}`,
        { headers: { Accept: 'application/json' } },
        { timeoutMs: 2500, maxRetries: 0 }
      );
      if (findResp.ok) {
        const findData = await findResp.json().catch(() => null);
        const isTv = mediaType === 'tv' || mediaType === 'series';
        const hit = isTv ? findData?.tv_results?.[0] : findData?.movie_results?.[0];
        if (hit?.id) resolvedTmdbId = String(hit.id);
      } else {
        await findResp.body?.cancel?.().catch(() => {});
      }
    } catch {
      // Proceed cleanly
    }
  }

  const sources = [];
  const warnings = [];
  const seenUrls = new Set();
  const candidateMap = new Map();

  // 1. Custom Direct stream URL (skip duplicate if identical to localItem primary catalog URL)
  if (directUrl && /^https?:\/\//i.test(directUrl) && directUrl !== localItem?.hlsStreamUrl) {
    const isHls = directUrl.toLowerCase().includes('.m3u8');
    seenUrls.add(directUrl);
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
    seenUrls.add(streamUrl);
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

  // 3. Query all enabled Stremio addons & optional custom resolver template in parallel
  const addonTasks = addonEntries.map(async (entry) => {
    const endpoint = buildAddonStreamEndpoint({
      addonUrl: entry.url,
      tmdbId: resolvedTmdbId,
      imdbId,
      anilistId,
      malId,
      mediaType,
      season,
      episode,
    });
    if (!endpoint) return { directStreams: [] };

    let addonHost = entry.name;
    if (!addonHost) {
      try {
        addonHost = new URL(endpoint).hostname;
      } catch {
        addonHost = 'Addon';
      }
    }

    const addonData = await fetchJsonWithTimeout(endpoint, { headers: { Accept: 'application/json' } }, 6000);
    const streams = Array.isArray(addonData?.streams) ? addonData.streams : [];
    return {
      addonHost,
      directStreams: collectStreamsAndCandidates(streams, {
        addonName: addonHost,
        maxDirect: 6,
        seenUrls,
        candidateMap,
      }),
    };
  });

  const customTask = customResolverUrl
    ? resolveCustomEndpoint({
        customResolverUrl,
        tmdbId: resolvedTmdbId,
        imdbId,
        anilistId,
        malId,
        mediaType,
        season,
        episode,
        seenUrls,
        candidateMap,
      })
    : Promise.resolve({ sources: [], warning: '' });

  const torrentioDebridTask =
    debridKey && debridProvider === 'realdebrid' && !magnet && !hash
      ? resolveTorrentioDebridDirect({
          addonEntries,
          debridProvider,
          debridKey,
          tmdbId: resolvedTmdbId,
          imdbId,
          mediaType,
          season,
          episode,
        })
      : Promise.resolve(null);

  const [customOutcome, addonOutcomes, torrentioDebridResult] = await Promise.all([
    customTask,
    Promise.allSettled(addonTasks),
    torrentioDebridTask,
  ]);

  if (customOutcome.warning) {
    warnings.push(customOutcome.warning);
  }
  for (const s of customOutcome.sources) {
    sources.push(s);
  }

  let addonDirectCount = 0;
  addonOutcomes.forEach((outcome, idx) => {
    if (outcome.status === 'rejected') {
      const msg = String(outcome.reason?.message || 'Error');
      if (/HTTP 404\b/i.test(msg)) return;
      const label = addonEntries[idx]?.name || addonEntries[idx]?.url || `Addon ${idx + 1}`;
      warnings.push(`Addon lookup failed (${label}): ${msg}`);
      return;
    }
    for (const s of outcome.value?.directStreams || []) {
      if (addonDirectCount >= MAX_DIRECT_ADDON_STREAMS) break;
      sources.push({
        ...s,
        id: addonDirectCount === 0 ? 'addon-hls' : `addon-hls-${addonDirectCount + 1}`,
      });
      addonDirectCount += 1;
    }
  });

  if (clientHashesRaw) {
    for (const hRaw of clientHashesRaw.split(',')) {
      const ch = extractInfoHash('', hRaw);
      if (ch && !candidateMap.has(ch)) {
        candidateMap.set(ch, {
          infoHash: ch,
          magnet: `magnet:?xt=urn:btih:${ch}`,
          title: title || 'Client Discovered Stream',
          quality: '1080p',
          qualityScore: 35,
          order: candidateMap.size,
        });
      }
    }
  }

  const explicitHash = extractInfoHash(magnet, hash);
  const isMockAddonEnv = addonEntries.some((e) => /127\.0\.0\.1|localhost|\.example/i.test(e.url || ''));
  if (!torrentioDebridResult?.url && debridKey && candidateMap.size < 2 && !explicitHash && !magnet && title && !isMockAddonEnv) {
    await searchOpenTorrentIndexers({ title, year, candidateMap });
  }

  // 4. Configurable Debrid instant-cache resolution (batch TorBox checkcached or multi-candidate RD iteration)
  const debridCandidates = [];
  if (explicitHash || (magnet && magnet.startsWith('magnet:'))) {
    const matchedAddonCandidate = explicitHash ? candidateMap.get(explicitHash) : null;
    debridCandidates.push({
      infoHash: explicitHash,
      magnet,
      fileIdx: matchedAddonCandidate?.fileIdx,
      title: matchedAddonCandidate?.title || 'Magnet / InfoHash',
      quality: matchedAddonCandidate?.quality || 'Original',
      qualityScore: 100,
      isExplicit: true,
    });
  }

  const rankedAddonCandidates = Array.from(candidateMap.values())
    .filter((c) => !explicitHash || c.infoHash !== explicitHash)
    .sort((a, b) => b.qualityScore - a.qualityScore || a.order - b.order);

  for (const c of rankedAddonCandidates) {
    if (debridCandidates.length >= MAX_DEBRID_CANDIDATES) break;
    debridCandidates.push(c);
  }

  let debridResult = torrentioDebridResult?.url ? torrentioDebridResult : null;
  if (!debridResult && debridKey && debridCandidates.length > 0) {
    debridResult = await resolveDebridCandidates({
      provider: debridProvider,
      apiKey: debridKey,
      candidates: debridCandidates,
    });
  }
  let debridWarning = '';
  if (!debridResult?.url && debridResult?.debridError) {
    if (debridResult.debridError === 'hoster_not_free') {
      debridWarning = 'Real-Debrid account is on Free tier — switched to Cloud Stream Servers.';
    } else if (debridResult.debridError === 'bad_token') {
      debridWarning = 'Debrid API key is invalid or expired — switched to Cloud Stream Servers.';
    } else {
      debridWarning = `Debrid unavailable (${debridResult.debridError}) — switched to Cloud Stream Servers.`;
    }
    warnings.push(debridWarning);
  }
  if (debridResult?.url) {
    const playable = debridResult.url;
    const winning = debridResult.candidate;
    const isHls = playable.toLowerCase().includes('.m3u8');
    const resolvedQuality =
      winning?.quality && winning.quality !== 'Original' ? winning.quality : '1080p Remux';
    sources.push({
      id: 'debrid-instant-cache',
      name:
        winning?.title && !winning?.isExplicit
          ? `Instant Cached (${debridProvider.toUpperCase()}) — ${winning.title.slice(0, 48)}`
          : `Instant Cached Stream (${debridProvider.toUpperCase()})`,
      type: isHls ? 'hls' : 'direct',
      url: makeProxyHlsUrl(playable),
      rawUrl: playable,
      provider: debridProvider,
      quality: resolvedQuality,
      infoHash: winning?.infoHash || undefined,
      shielded: true,
      direct: true,
      node: 'debrid',
    });
    if (!isHls && /^https:\/\//i.test(playable)) {
      sources.push({
        id: 'debrid-instant-cache-direct',
        name: `Instant Cached Direct (${debridProvider.toUpperCase()})`,
        type: 'direct',
        url: playable,
        rawUrl: playable,
        provider: debridProvider,
        quality: resolvedQuality,
        infoHash: winning?.infoHash || undefined,
        shielded: true,
        direct: true,
        node: 'debrid',
      });
    }
  }

  // 5. Fallback Shielded Embeds (VidLink, VidFast, VidSrc Pro, VidSrc.to, VidRift)
  if (resolvedTmdbId || imdbId || (mediaType === 'anime' && malId)) {
    let vidlinkUrl;
    if (mediaType === 'anime' && malId) {
      vidlinkUrl = `https://vidlink.pro/anime/${encodeURIComponent(malId)}/${episode}/sub?primaryColor=e50914&secondaryColor=00f0ff&autoplay=true&fallback=true`;
    } else if (mediaType === 'tv') {
      const idVal = resolvedTmdbId || imdbId;
      vidlinkUrl = `https://vidlink.pro/tv/${encodeURIComponent(idVal)}/${season}/${episode}?primaryColor=e50914&secondaryColor=00f0ff&iconColor=e50914&title=false&poster=true&autoplay=true`;
    } else {
      const idVal = resolvedTmdbId || imdbId;
      vidlinkUrl = `https://vidlink.pro/movie/${encodeURIComponent(idVal)}?primaryColor=e50914&secondaryColor=00f0ff&iconColor=e50914&title=false&poster=true&autoplay=true`;
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

  if (resolvedTmdbId || imdbId) {
    const idVal = resolvedTmdbId || imdbId;
    const toIdVal = imdbId || resolvedTmdbId;
    const isTv = mediaType === 'tv' || mediaType === 'series';
    sources.push({
      id: 'vidfast-shield',
      name: 'VidFast HD (Cloud Server)',
      type: 'embed',
      url: isTv
        ? `https://vidfast.vc/tv/${encodeURIComponent(idVal)}/${season}/${episode}?autoPlay=true&theme=e50914&nextButton=true`
        : `https://vidfast.vc/movie/${encodeURIComponent(idVal)}?autoPlay=true&theme=e50914`,
      quality: '1080p',
      shielded: true,
      sandboxed: true,
      direct: false,
    });
    sources.push({
      id: 'vidsrc-pro',
      name: 'VidSrc Pro (Cloud Server)',
      type: 'embed',
      url: isTv
        ? `https://vidsrc.su/embed/tv/${encodeURIComponent(idVal)}/${season}/${episode}`
        : `https://vidsrc.su/embed/movie/${encodeURIComponent(idVal)}`,
      quality: '1080p',
      shielded: true,
      sandboxed: false,
      direct: false,
    });
    sources.push({
      id: 'vidsrc-to',
      name: 'VidSrc.to (Cloud Server)',
      type: 'embed',
      url: isTv
        ? `https://vidsrc.to/embed/tv/${encodeURIComponent(toIdVal)}/${season}/${episode}`
        : `https://vidsrc.to/embed/movie/${encodeURIComponent(toIdVal)}`,
      quality: '1080p',
      shielded: true,
      sandboxed: true,
      direct: false,
    });
  }

  if (resolvedTmdbId || imdbId || anilistId) {
    let vidriftUrl;
    if (mediaType === 'anime' && anilistId) {
      vidriftUrl = `https://embed.vidrift.net/embed/anilist/${encodeURIComponent(anilistId)}/${episode}?primaryColor=ff4d6d&autoplay=false`;
    } else if (mediaType === 'tv' && (resolvedTmdbId || imdbId)) {
      const idVal = resolvedTmdbId || imdbId;
      vidriftUrl = `https://embed.vidrift.net/embed/tv/${encodeURIComponent(idVal)}/${season}/${episode}?primaryColor=ff4d6d&autoplay=false`;
    } else {
      const idVal = resolvedTmdbId || imdbId;
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
    tmdbId: resolvedTmdbId,
    imdbId,
    anilistId,
    mediaType,
    season,
    episode,
    addonCount: addonEntries.length,
    sources,
    ...(debridWarning ? { debridWarning } : {}),
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
        debridConfigured: Boolean(process.env.DEBRID_API_KEY || process.env.REALDEBRID_API_KEY || process.env.TORBOX_API_KEY),
        addonConfigured: Boolean(process.env.STREMIO_ADDON_URLS || process.env.STREMIO_ADDON_URL),
        customResolverConfigured: Boolean(process.env.CUSTOM_RESOLVER_URL),
        hlsProxyEnabled: true,
        subtitleProxyEnabled: true,
        rangeForwardingEnabled: true,
        streamResolverEnabled: true,
        addonManifestResolverEnabled: true,
        multiAddonEnabled: true,
        catalogCount: CATALOG_ITEMS.length,
      });
    }

    if (pathname === '/api/bootstrap') {
      const activeHost = req.headers.host || `localhost:${DEFAULT_PORT}`;
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const activeOrigin = `${proto}://${activeHost}`;
      const rawMirrors = process.env.SUNO_BOOTSTRAP_MIRRORS || '';
      const mirrors = rawMirrors
        ? rawMirrors.split(',').map((m) => m.trim()).filter(Boolean)
        : [activeOrigin];
      if (!mirrors.includes(activeOrigin)) {
        mirrors.unshift(activeOrigin);
      }
      const descriptor = Buffer.from(
        JSON.stringify({
          activeOrigin,
          mirrors,
          timestamp: Date.now(),
          version: '1.0.0',
        }),
        'utf8'
      ).toString('base64');
      return sendJson(res, 200, {
        version: '1.0.0',
        activeOrigin,
        mirrors,
        descriptor,
        timestamp: Date.now(),
      });
    }

    if (pathname === '/api/play') {
      const targetUrl = reqUrl.searchParams.get('url') || '';
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return sendJson(res, 400, { error: 'Valid http/https "url" query parameter required' });
      }
      const expSec = Number(reqUrl.searchParams.get('exp')) || 7200;
      const mediaId = reqUrl.searchParams.get('id') || '';
      const referer = reqUrl.searchParams.get('referer') || '';
      const token = signPlayToken(targetUrl, { expiresInSeconds: expSec, id: mediaId });
      const nowSec = Math.floor(Date.now() / 1000);
      return sendJson(res, 200, {
        token,
        streamUrl: targetUrl,
        expiresAt: nowSec + expSec,
        proxyUrl: `/api/proxy/hls?url=${encodeURIComponent(targetUrl)}${
          referer ? `&referer=${encodeURIComponent(referer)}` : ''
        }&token=${encodeURIComponent(token)}`,
      });
    }

    if (pathname === '/api/backend/status') {
      const debridConfigured = Boolean(
        process.env.DEBRID_API_KEY || process.env.REALDEBRID_API_KEY || process.env.TORBOX_API_KEY
      );
      const debridProvider = process.env.TORBOX_API_KEY && !process.env.REALDEBRID_API_KEY
        ? 'torbox'
        : process.env.REALDEBRID_API_KEY || process.env.DEBRID_API_KEY
        ? 'realdebrid'
        : process.env.DEBRID_PROVIDER || 'none';
      const tokenVerification = Boolean(
        process.env.REQUIRE_PLAY_TOKEN === 'true' || process.env.REQUIRE_PLAY_TOKEN === '1'
      );
      const envAddons = parseAddonUrls([process.env.STREMIO_ADDON_URLS || '', process.env.STREMIO_ADDON_URL || '']).map((a) => {
        let hostname = a.url;
        try {
          hostname = new URL(a.url).hostname;
        } catch {}
        return {
          url: a.url,
          name: a.name || hostname,
          enabled: true,
          serverManaged: true,
        };
      });
      return sendJson(res, 200, {
        status: 'ready',
        version: '1.0.0',
        timestamp: Date.now(),
        tmdb: { configured: Boolean(process.env.TMDB_API_KEY) },
        debrid: { configured: debridConfigured, provider: debridProvider, serverManaged: debridConfigured },
        stremio: {
          configured: true,
          addonCount: envAddons.length,
          addons: envAddons,
          maxAddons: MAX_ADDONS,
        },
        jellyfin: {
          configured: Boolean(process.env.JELLYFIN_URL),
          url: process.env.JELLYFIN_URL ? process.env.JELLYFIN_URL.replace(/\/+$/, '') : '',
        },
        vodOrigin: {
          configured: Boolean(process.env.SUNO_VOD_ORIGIN),
          origin: process.env.SUNO_VOD_ORIGIN || '',
        },
        tokenVerification: { enabled: tokenVerification },
        cache: defaultSegmentCache.getStats(),
      });
    }

    if (pathname === '/api/proxy/hls') {
      return handleHlsProxyRequest(req, res, reqUrl);
    }

    if (pathname === '/api/proxy/subtitles') {
      return handleSubtitleProxyRequest(req, res, reqUrl);
    }

    if (pathname === '/api/resolve/addon-manifest') {
      return handleAddonManifestRequest(req, res, reqUrl);
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

      // Fuzzy / typo fallback via IMDb suggestion API (e.g. "ramanayan" -> "Ramayana")
      if (merged.length === 0 && type !== 'anime') {
        try {
          const firstChar = q.toLowerCase().replace(/[^a-z0-9]/g, '').charAt(0) || 'x';
          const sugResp = await fetchWithRetry(
            `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(q)}.json`,
            { headers: { Accept: 'application/json' } },
            { timeoutMs: 3500, maxRetries: 0 }
          ).catch(() => null);
          if (sugResp?.ok) {
            const sugJson = await sugResp.json().catch(() => null);
            const sugList = (Array.isArray(sugJson?.d) ? sugJson.d : []).filter(
              (x) => /^tt\d+$/i.test(x?.id || '') && /feature|movie|tv/i.test(x?.q || x?.qid || '')
            );
            const topTitle = sugList[0]?.l || '';
            if (topTitle && topTitle.toLowerCase() !== q.toLowerCase()) {
              const correctedLists = await Promise.all([
                searchCinemetaLive(topTitle, type).catch(() => []),
                tmdbKey ? searchTmdbLive(topTitle, type, tmdbKey).catch(() => []) : Promise.resolve([]),
              ]);
              for (const list of correctedLists) {
                for (const item of list) {
                  if (!seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    merged.push(item);
                  }
                }
              }
            }
            for (const s of sugList.slice(0, 6)) {
              const isTv = /tv|series/i.test(s.q || s.qid || '');
              const mediaType = isTv ? 'tv' : 'movie';
              if (type !== 'all' && type !== mediaType) continue;
              const id = `${mediaType}:imdb:${s.id}`;
              if (seenIds.has(id)) continue;
              seenIds.add(id);
              merged.push({
                id,
                imdbId: s.id,
                mediaType,
                title: s.l || 'Untitled',
                year: s.y ? String(s.y) : '',
                creator: mediaType === 'tv' ? 'TV Series' : 'Feature Film',
                runtime: mediaType === 'tv' ? 'Series' : 'Feature',
                rating: '7.6',
                genres: [mediaType === 'tv' ? 'Series' : 'Cinema'],
                overview: s.s || '',
                poster: s.i?.imageUrl || '',
                backdrop: '',
                palette: ['#ff0033', '#27272a', '#09090b'],
                source: 'imdb-suggest',
              });
            }
            if (sugList.length) sources.push('imdb-suggest');
          }
        } catch {
          // Ignore typo fallback error cleanly
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
