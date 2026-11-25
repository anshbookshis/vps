import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_ITEMS } from './src/data/catalog.js';
import { SONIC_PROFILES, SCORE_MOODS } from './src/utils/sonic-engine.js';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT || 3000);

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

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'SunoCinema/1.0',
        ...(options.headers || {}),
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rewrite HLS M3U8 manifest content to route all child playlists, chunks, and keys through the local HLS proxy.
 * Implements Method 3/4 front-end pipeline requirements:
 * - Rewrites segment URIs with upstream base URL resolution
 * - Preserves upstream Referer/Origin tokens
 * - Rewrites #EXT-X-KEY and #EXT-X-MAP URI attributes
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

    // Rewrite tags containing URI="..." such as #EXT-X-KEY or #EXT-X-MAP
    if (trimmed.startsWith('#') && trimmed.includes('URI=')) {
      return line.replace(/URI="([^"]+)"/g, (match, uri) => {
        try {
          const abs = new URL(uri, baseUrl).href;
          const param = `${proxyEndpoint}?url=${encodeURIComponent(abs)}${
            referer ? `&referer=${encodeURIComponent(referer)}` : ''
          }`;
          return `URI="${param}"`;
        } catch {
          return match;
        }
      });
    }

    // Rewrite segment and child playlist URI lines (do not start with #)
    if (!trimmed.startsWith('#')) {
      try {
        const abs = new URL(trimmed, baseUrl).href;
        return `${proxyEndpoint}?url=${encodeURIComponent(abs)}${
          referer ? `&referer=${encodeURIComponent(referer)}` : ''
        }`;
      } catch {
        return line;
      }
    }

    return line;
  });

  return rewritten.join('\n');
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
    // Scan for repeating 188-byte MPEG-TS sync byte (0x47)
    const scanLimit = Math.min(buffer.length - 188 * 3, 16384);
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
        hlsProxyEnabled: true,
        streamResolverEnabled: true,
        catalogCount: CATALOG_ITEMS.length,
      });
    }

    if (pathname === '/api/proxy/hls') {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        });
        return res.end();
      }

      const targetUrl = reqUrl.searchParams.get('url');
      const referer = reqUrl.searchParams.get('referer') || '';
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return sendJson(res, 400, { error: 'Valid http/https "url" query parameter required' });
      }

      try {
        const upstreamHeaders = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: '*/*',
        };
        if (referer) {
          upstreamHeaders['Referer'] = referer;
          try {
            upstreamHeaders['Origin'] = new URL(referer).origin;
          } catch {}
        }

        const upstreamResp = await fetch(targetUrl, {
          headers: upstreamHeaders,
          redirect: 'follow',
        });

        if (!upstreamResp.ok) {
          return sendJson(res, upstreamResp.status, {
            error: `Upstream HTTP ${upstreamResp.status} ${upstreamResp.statusText}`,
            targetUrl,
          });
        }

        const contentType = upstreamResp.headers.get('content-type') || '';
        const isManifest =
          contentType.includes('mpegurl') ||
          contentType.includes('application/x-mpegURL') ||
          targetUrl.includes('.m3u8');

        if (isManifest) {
          const text = await upstreamResp.text();
          const rewritten = rewriteHlsManifest(text, targetUrl, '/api/proxy/hls', referer || targetUrl);
          res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Cache-Control': 'no-cache',
          });
          return res.end(rewritten);
        }

        const arrayBuf = await upstreamResp.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        const unmasked = unmaskDisguisedSegment(buf);

        let outMime = 'video/mp2t';
        if (targetUrl.includes('.m4s') || targetUrl.includes('.mp4')) {
          outMime = 'video/mp4';
        } else if (targetUrl.includes('.aac')) {
          outMime = 'audio/aac';
        }

        res.writeHead(200, {
          'Content-Type': outMime,
          'Content-Length': unmasked.length,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
          'Cache-Control': 'public, max-age=3600',
        });
        return res.end(unmasked);
      } catch (err) {
        return sendJson(res, 502, {
          error: 'HLS proxy upstream gateway error',
          message: err.message,
          targetUrl,
        });
      }
    }

    if (pathname === '/api/resolve/stream') {
      const tmdbId = reqUrl.searchParams.get('tmdbId') || '';
      const imdbId = reqUrl.searchParams.get('imdbId') || '';
      const anilistId = reqUrl.searchParams.get('anilistId') || '';
      const mediaType = reqUrl.searchParams.get('mediaType') || 'movie';
      const season = Math.max(1, Number(reqUrl.searchParams.get('season') || 1));
      const episode = Math.max(1, Number(reqUrl.searchParams.get('episode') || 1));
      const directUrl = reqUrl.searchParams.get('directUrl') || '';

      const sources = [];

      // Custom Direct stream URL
      if (directUrl) {
        const isHls = directUrl.includes('.m3u8');
        sources.push({
          id: 'custom-stream',
          name: isHls ? 'Direct HLS Stream' : 'Direct MP4 Video',
          type: isHls ? 'hls' : 'direct',
          url: isHls ? `/api/proxy/hls?url=${encodeURIComponent(directUrl)}` : directUrl,
          rawUrl: directUrl,
          quality: 'Original Quality',
          shielded: true,
          direct: true,
        });
      }

      // Catalog stream reference (demo/tested direct streams)
      const localItem = CATALOG_ITEMS.find(
        (x) =>
          (tmdbId && String(x.tmdbId) === String(tmdbId)) ||
          (imdbId && String(x.imdbId) === String(imdbId)) ||
          (anilistId && String(x.anilistId) === String(anilistId))
      );

      if (localItem?.hlsStreamUrl) {
        sources.push({
          id: 'catalog-hls',
          name: 'Direct HLS Stream (Zero Ads)',
          type: 'hls',
          url: `/api/proxy/hls?url=${encodeURIComponent(localItem.hlsStreamUrl)}`,
          rawUrl: localItem.hlsStreamUrl,
          quality: '1080p UHD',
          shielded: true,
          direct: true,
        });
      }

      // Method 3: Debrid / Torrent cache configuration
      const debridApiKey = process.env.DEBRID_API_KEY || '';
      const debridProvider = (process.env.DEBRID_PROVIDER || 'realdebrid').toLowerCase();
      if (debridApiKey) {
        sources.push({
          id: 'debrid-instant-cache',
          name: `Instant Cached Stream (${debridProvider.toUpperCase()})`,
          type: 'debrid',
          configured: true,
          provider: debridProvider,
          quality: '1080p Remux',
          shielded: true,
          direct: true,
        });
      }

      // VidLink No-Redirect Pro Player (sandboxed ad-free shield)
      if (tmdbId || imdbId) {
        const idVal = tmdbId || imdbId;
        const vidlinkUrl =
          mediaType === 'tv'
            ? `https://vidlink.pro/tv/${encodeURIComponent(idVal)}/${season}/${episode}?primaryColor=ff4d6d&secondaryColor=00f0ff&iconColor=ff4d6d&title=false&poster=true&autoplay=false`
            : `https://vidlink.pro/movie/${encodeURIComponent(idVal)}?primaryColor=ff4d6d&secondaryColor=00f0ff&iconColor=ff4d6d&title=false&poster=true&autoplay=false`;

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

      // VidRift Sandboxed
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
      });
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
