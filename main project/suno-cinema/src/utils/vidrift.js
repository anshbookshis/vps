import { fetchArchiveOrgDirectStream } from './client-api.js';

export const VIDRIFT_ORIGIN = 'https://embed.vidrift.net';
export const VIDLINK_ORIGIN = 'https://vidlink.pro';

export const PLAYER_PROVIDERS = [
  {
    id: 'hls-direct',
    label: 'Native HLS (Zero Ads)',
    sandboxed: true,
    description: 'Direct MPEG-TS / HLS stream via native HTML5 video player (zero ads/popups)',
  },
  {
    id: 'vidlink',
    label: 'VidLink (No-Redirect)',
    sandboxed: true,
    description: 'Clean ad-free player inside browser sandbox (blocks popups & redirects)',
  },
  {
    id: 'vidrift',
    label: 'VidRift (Sandboxed)',
    sandboxed: true,
    description: 'VidRift player with browser popup & redirect sandbox enabled',
  },
  {
    id: 'vidrift-direct',
    label: 'VidRift (Unrestricted)',
    sandboxed: false,
    description: 'VidRift without iframe sandbox (use only if a stream refuses sandbox)',
  },
];

export const THEME_ACCENT_HEX = {
  default: 'e50914',
  cyberpunk: '00f0ff',
  sunset: 'ff5e62',
  emerald: '1db954',
  gold: 'f59e0b',
};

/**
 * Normalize a configured HLS Edge Proxy base URL (Cloudflare Worker or local Node server).
 * Strips trailing slashes and accidental /api/proxy/* suffixes.
 * @param {string} rawUrl
 * @returns {string}
 */
export function cleanProxyUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return '';
  return trimmed
    .replace(/\/api\/(?:proxy\/(?:hls|subtitles)|resolve\/stream)\/?$/i, '')
    .replace(/\/+$/, '');
}

/**
 * Normalize a configured Stremio addon URL (converts stremio:// -> https://, strips /manifest.json and trailing slashes).
 * @param {string} rawUrl
 * @returns {string}
 */
export function cleanAddonUrl(rawUrl) {
  let trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (/^stremio:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed.slice('stremio://'.length)}`;
  }
  if (!/^https?:\/\//i.test(trimmed)) return '';
  return trimmed.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '');
}

/**
 * Normalize a Stremio addon URL into its full https://.../manifest.json URL (converts stremio:// -> https://).
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeAddonManifestUrl(rawUrl) {
  let trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (/^stremio:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed.slice('stremio://'.length)}`;
  }
  if (!/^https?:\/\//i.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    const cleanPath = parsed.pathname.replace(/\/+$/, '').replace(/\/manifest\.json$/i, '');
    parsed.hash = '';
    parsed.pathname = `${cleanPath}/manifest.json`;
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Collect, normalize, and deduplicate enabled Stremio addon base URLs from `stremioAddons` + legacy options.
 * Respects `enabled === false` entries in `stremioAddons`.
 * @param {object|Array} [input]
 * @returns {string[]}
 */
export function collectStremioAddonUrls(input = {}) {
  const opts = Array.isArray(input) ? { stremioAddons: input } : input && typeof input === 'object' ? input : {};
  const disabledUrls = new Set();
  const seen = new Set();
  const urls = [];

  if (Array.isArray(opts.stremioAddons)) {
    for (const entry of opts.stremioAddons) {
      if (entry && typeof entry === 'object' && entry.enabled === false) {
        const disabled = cleanAddonUrl(entry.url || entry.transportUrl || '');
        if (disabled) disabledUrls.add(disabled);
      }
    }
  }

  const pushAddon = (raw) => {
    const clean = cleanAddonUrl(raw);
    if (clean && !disabledUrls.has(clean) && !seen.has(clean)) {
      seen.add(clean);
      urls.push(clean);
    }
  };

  if (Array.isArray(opts.stremioAddons)) {
    for (const entry of opts.stremioAddons) {
      if (typeof entry === 'string') {
        pushAddon(entry);
      } else if (entry && typeof entry === 'object' && entry.enabled !== false) {
        pushAddon(entry.url || entry.transportUrl || '');
      }
    }
  }

  if (Array.isArray(opts.addonUrls)) {
    for (const u of opts.addonUrls) pushAddon(u);
  } else if (typeof opts.addonUrls === 'string' && opts.addonUrls.trim()) {
    const raw = opts.addonUrls.trim();
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const u of parsed) pushAddon(u);
        }
      } catch {
        for (const u of raw.split(',')) pushAddon(u);
      }
    } else {
      for (const u of raw.split(',')) pushAddon(u);
    }
  }

  if (opts.stremioAddonUrl) pushAddon(opts.stremioAddonUrl);
  if (opts.addonUrl) pushAddon(opts.addonUrl);

  return urls;
}

/**
 * Build a proxy URL for HLS manifests/segments using either a configured Edge Proxy or relative ./api/proxy/hls.
 * Avoids double-wrapping already-proxied or blob/data URLs.
 * @param {string} streamUrl
 * @param {{ hlsProxyUrl?: string, referer?: string }} [options]
 * @returns {string}
 */
export function buildHlsProxyUrl(streamUrl, { hlsProxyUrl = '', referer = '' } = {}) {
  const trimmed = String(streamUrl || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed;

  const base = cleanProxyUrl(hlsProxyUrl);
  const endpoint = base ? `${base}/api/proxy/hls` : './api/proxy/hls';

  if (trimmed.startsWith('/api/proxy/hls?') || trimmed.startsWith('./api/proxy/hls?')) {
    const queryPart = trimmed.slice(trimmed.indexOf('?'));
    return `${endpoint}${queryPart}`;
  }
  if (trimmed.includes('/api/proxy/hls?url=')) {
    return trimmed;
  }

  return `${endpoint}?url=${encodeURIComponent(trimmed)}${
    referer ? `&referer=${encodeURIComponent(referer)}` : ''
  }`;
}

/**
 * Build a proxy URL for external SRT/VTT subtitle conversion using either Edge Proxy or relative ./api/proxy/subtitles.
 * @param {string} subUrl
 * @param {{ hlsProxyUrl?: string, referer?: string }} [options]
 * @returns {string}
 */
export function buildSubtitleProxyUrl(subUrl, { hlsProxyUrl = '', referer = '' } = {}) {
  const trimmed = String(subUrl || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed;

  const base = cleanProxyUrl(hlsProxyUrl);
  const endpoint = base ? `${base}/api/proxy/subtitles` : './api/proxy/subtitles';
  if (trimmed.includes('/api/proxy/subtitles?url=')) return trimmed;

  return `${endpoint}?url=${encodeURIComponent(trimmed)}${
    referer ? `&referer=${encodeURIComponent(referer)}` : ''
  }`;
}

/**
 * Normalize relative /api/proxy/* URLs returned by server.js for GitHub Pages / subpath / Edge Proxy compatibility.
 * @param {string} sourceUrl
 * @param {string} [hlsProxyUrl='']
 * @returns {string}
 */
export function normalizeResolveApiUrl(sourceUrl, hlsProxyUrl = '') {
  const raw = String(sourceUrl || '').trim();
  if (!raw) return '';
  const base = cleanProxyUrl(hlsProxyUrl);
  if (raw.startsWith('/api/proxy/')) {
    return base ? `${base}${raw}` : `.${raw}`;
  }
  if (raw.startsWith('./api/proxy/')) {
    return base ? `${base}${raw.slice(1)}` : raw;
  }
  return raw;
}

/**
 * Checks whether a given URL is a direct media stream (HLS m3u8, MP4, or proxied HLS stream)
 * and not an HTML webpage or iframe embed player.
 * @param {string} url
 * @returns {boolean}
 */
export function isDirectStreamUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (
    trimmed.includes('embed.vidrift.net') ||
    trimmed.includes('vidlink.pro') ||
    trimmed.includes('/embed/') ||
    trimmed.endsWith('.html') ||
    trimmed.endsWith('.htm')
  ) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('.m3u8') ||
    lower.includes('.mp4') ||
    lower.includes('.m4s') ||
    lower.includes('.webm') ||
    lower.includes('/api/proxy/hls') ||
    lower.startsWith('blob:') ||
    lower.startsWith('data:video/')
  ) {
    return true;
  }
  // Support root-mounted Cloudflare Worker proxies (e.g. https://proxy.workers.dev/?url=...)
  if (/^https?:\/\/[^?]+\?url=https?/i.test(trimmed)) {
    try {
      const inner = new URL(trimmed).searchParams.get('url') || '';
      if (inner && inner !== trimmed) return isDirectStreamUrl(inner);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Resolve theme accent hex (6 chars, no leading #) for embed branding.
 * @param {string} themeId
 * @returns {string}
 */
export function resolveThemeAccentHex(themeId = 'default') {
  return THEME_ACCENT_HEX[themeId] || THEME_ACCENT_HEX.default;
}

/**
 * Parse a direct TMDB / AniList URL or shorthand ID into a playable target.
 * @param {string} rawInput
 * @param {'movie'|'tv'|'anime'} [fallbackType='movie']
 */
export function parseDirectTarget(rawInput, fallbackType = 'movie') {
  const input = String(rawInput || '').trim();
  if (!input) return null;

  const tmdbTvUrl = input.match(
    /themoviedb\.org\/tv\/(\d+)(?:-[^/?#]*)?(?:\/season\/(\d+)(?:\/episode\/(\d+))?)?/i
  );
  if (tmdbTvUrl) {
    return {
      mediaType: 'tv',
      tmdbId: tmdbTvUrl[1],
      season: Math.max(1, Number(tmdbTvUrl[2] || 1)),
      episode: Math.max(1, Number(tmdbTvUrl[3] || 1)),
    };
  }

  const tmdbMovieUrl = input.match(/themoviedb\.org\/movie\/(\d+)/i);
  if (tmdbMovieUrl) {
    return {
      mediaType: 'movie',
      tmdbId: tmdbMovieUrl[1],
    };
  }

  const anilistUrl = input.match(/anilist\.co\/anime\/(\d+)/i);
  if (anilistUrl) {
    return {
      mediaType: 'anime',
      anilistId: anilistUrl[1],
      episode: 1,
    };
  }

  const tvShort = input.match(/^tv[:/](\d+)(?:[:/](\d+))?(?:[:/](\d+))?$/i);
  if (tvShort) {
    return {
      mediaType: 'tv',
      tmdbId: tvShort[1],
      season: Math.max(1, Number(tvShort[2] || 1)),
      episode: Math.max(1, Number(tvShort[3] || 1)),
    };
  }

  const movieShort = input.match(/^(?:movie|tmdb)[:/](\d+)$/i);
  if (movieShort) {
    return {
      mediaType: 'movie',
      tmdbId: movieShort[1],
    };
  }

  const animeShort = input.match(/^(?:anilist|anime)[:/](\d+)(?:[:/](\d+))?$/i);
  if (animeShort) {
    return {
      mediaType: 'anime',
      anilistId: animeShort[1],
      episode: Math.max(1, Number(animeShort[2] || 1)),
    };
  }

  if (/^\d{1,10}$/.test(input)) {
    if (fallbackType === 'anime') {
      return { mediaType: 'anime', anilistId: input, episode: 1 };
    }
    if (fallbackType === 'tv') {
      return { mediaType: 'tv', tmdbId: input, season: 1, episode: 1 };
    }
    return { mediaType: 'movie', tmdbId: input };
  }

  if (/^https?:\/\/[^\s]+\.(m3u8|mp4)(\?[^\s]*)?$/i.test(input)) {
    return {
      mediaType: 'hls',
      hlsUrl: input,
      format: input.toLowerCase().includes('.mp4') ? 'mp4' : 'hls',
    };
  }

  // Magnet link or torrent infohash support (Method 3: Torrent-to-HLS pipeline)
  const magnetMatch = input.match(/^magnet:\?xt=urn:btih:([a-zA-Z0-9]+)/i);
  if (magnetMatch) {
    return {
      mediaType: 'hls',
      infoHash: magnetMatch[1],
      magnetUri: input,
      hlsUrl: `./api/resolve/stream?magnet=${encodeURIComponent(input)}`,
      format: 'hls',
    };
  }

  if (/^[a-fA-F0-9]{40}$/.test(input)) {
    return {
      mediaType: 'hls',
      infoHash: input,
      hlsUrl: `./api/resolve/stream?hash=${encodeURIComponent(input)}`,
      format: 'hls',
    };
  }

  return null;
}

function buildStremioStreamUrl(addonUrl, item, { season = 1, episode = 1 } = {}) {
  const base = cleanAddonUrl(addonUrl);
  if (!base || !item) return '';
  const mediaType = item.mediaType || 'movie';
  const stremioType = mediaType === 'tv' || mediaType === 'series' ? 'series' : mediaType === 'anime' && !item.imdbId ? 'anime' : 'movie';
  const imdbId = item.imdbId || '';
  const tmdbId = item.tmdbId || (mediaType !== 'anime' ? item.id : '');
  const anilistId = item.anilistId || (mediaType === 'anime' ? item.id : '');

  let stremioId = '';
  if (stremioType === 'series') {
    stremioId = imdbId ? `${imdbId}:${season}:${episode}` : tmdbId ? `tmdb:${tmdbId}:${season}:${episode}` : '';
  } else if (stremioType === 'anime') {
    stremioId = anilistId ? `anilist:${anilistId}:${episode}` : '';
  } else {
    stremioId = imdbId || (tmdbId ? `tmdb:${tmdbId}` : '');
  }

  return stremioId ? `${base}/stream/${stremioType}/${encodeURIComponent(stremioId)}.json` : '';
}

/**
 * Checks if a resolved source entry is a directly playable HLS / MP4 / Debrid media node (non-iframe).
 * @param {object} source
 * @returns {boolean}
 */
export function isPlayableDirectSource(source) {
  if (!source || typeof source !== 'object' || !source.url) return false;
  if (source.type === 'embed') return false;
  return Boolean(
    (source.type === 'hls' || source.type === 'direct' || source.type === 'debrid' || source.direct) &&
      isDirectStreamUrl(source.url)
  );
}

/**
 * Filter an ordered source list to playable direct/HLS/debrid mirror nodes.
 * @param {Array<object>} sources
 * @returns {Array<object>}
 */
export function getPlayableHlsNodes(sources = []) {
  return (Array.isArray(sources) ? sources : []).filter(isPlayableDirectSource);
}

/**
 * Filter an ordered source list to shielded iframe embed fallbacks.
 * @param {Array<object>} sources
 * @returns {Array<object>}
 */
export function getEmbedFallbackNodes(sources = []) {
  return (Array.isArray(sources) ? sources : []).filter((s) => s && s.url && s.type === 'embed');
}

/**
 * Select the next untried stream mirror node: prioritizes remaining HLS/direct nodes before falling back to embeds.
 * @param {Array<object>} sources
 * @param {number} [currentIndex=-1]
 * @param {Set<number>|Array<number>} [failedIndices=[]]
 * @returns {{ source: object, index: number, kind: 'hls'|'embed' } | null}
 */
export function selectNextStreamMirror(sources = [], currentIndex = -1, failedIndices = []) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const failed = failedIndices instanceof Set ? failedIndices : new Set(failedIndices);
  const n = sources.length;
  const start = currentIndex >= 0 ? (currentIndex + 1) % n : 0;

  // 1. Scan forward (wrapping) for next untried HLS / direct node
  for (let offset = 0; offset < n; offset += 1) {
    const idx = (start + offset) % n;
    if (failed.has(idx)) continue;
    if (isPlayableDirectSource(sources[idx])) {
      return { source: sources[idx], index: idx, kind: 'hls' };
    }
  }

  // 2. No HLS nodes remain -> choose first untried embed fallback (preferring VidLink shield)
  const embedOrder = [];
  for (let i = 0; i < n; i += 1) {
    if (!failed.has(i) && sources[i]?.type === 'embed' && sources[i]?.url) {
      embedOrder.push(i);
    }
  }
  if (embedOrder.length > 0) {
    embedOrder.sort((a, b) => {
      const aVidlink = sources[a].id === 'vidlink-shield' ? 0 : 1;
      const bVidlink = sources[b].id === 'vidlink-shield' ? 0 : 1;
      return aVidlink - bVidlink;
    });
    const idx = embedOrder[0];
    return { source: sources[idx], index: idx, kind: 'embed' };
  }

  return null;
}

/**
 * Initialize failover tracking state for an ordered mirror list.
 * @param {Array<object>} sources
 * @param {number} [initialIndex=0]
 */
export function createFailoverState(sources = [], initialIndex = 0) {
  return {
    sources: Array.isArray(sources) ? [...sources] : [],
    activeIndex: initialIndex,
    failedIndices: new Set(),
    retriesOnCurrent: 0,
    maxRetriesPerNode: 2,
    history: [],
  };
}

/**
 * Mark the active node as failed and advance to the next mirror node (or embed fallback).
 * @param {object} failoverState
 * @param {string} [reason='error']
 * @returns {{ next: { source: object, index: number, kind: 'hls'|'embed' } | null, exhaustedHls: boolean }}
 */
export function recordFailoverAttempt(failoverState, reason = 'error') {
  if (!failoverState) return { next: null, exhaustedHls: true };
  const idx = failoverState.activeIndex;
  if (idx >= 0 && idx < failoverState.sources.length) {
    failoverState.failedIndices.add(idx);
    failoverState.history.push({
      index: idx,
      id: failoverState.sources[idx]?.id || `node-${idx}`,
      reason,
      at: Date.now(),
    });
  }
  const next = selectNextStreamMirror(failoverState.sources, idx, failoverState.failedIndices);
  failoverState.retriesOnCurrent = 0;
  if (next) {
    failoverState.activeIndex = next.index;
  }
  return {
    next,
    exhaustedHls: !next || next.kind === 'embed',
  };
}

function deriveAddonDisplayName(addonUrl, stremioAddons = []) {
  const clean = cleanAddonUrl(addonUrl);
  const match = (Array.isArray(stremioAddons) ? stremioAddons : []).find(
    (a) => a && typeof a === 'object' && cleanAddonUrl(a.url || a.transportUrl || '') === clean
  );
  if (match?.name) return String(match.name);
  try {
    return new URL(clean).hostname.replace(/^www\./i, '') || 'Addon';
  } catch {
    return 'Addon';
  }
}

function expandCustomResolverTemplate(template, item, { season = 1, episode = 1 } = {}) {
  const raw = String(template || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return '';
  const tmdbId = String(item?.tmdbId || (item?.mediaType !== 'anime' && item?.mediaType !== 'hls' ? item?.id : '') || '');
  const imdbId = String(item?.imdbId || '');
  const anilistId = String(item?.anilistId || (item?.mediaType === 'anime' ? item?.id : '') || '');
  const malId = String(item?.malId || '');
  const mediaType = String(item?.mediaType || 'movie');
  const title = String(item?.title || '');
  const year = String(item?.year || '');

  const pathPart = raw.split('?')[0];
  if (pathPart.includes('{imdbId}') && !imdbId) return '';
  if (pathPart.includes('{tmdbId}') && !tmdbId) return '';
  if (pathPart.includes('{anilistId}') && !anilistId) return '';
  if (raw.includes('{') && !imdbId && !tmdbId && !anilistId && !malId && !title) return '';

  return raw
    .replace(/\{tmdbId\}/g, encodeURIComponent(tmdbId))
    .replace(/\{imdbId\}/g, encodeURIComponent(imdbId))
    .replace(/\{anilistId\}/g, encodeURIComponent(anilistId))
    .replace(/\{malId\}/g, encodeURIComponent(malId))
    .replace(/\{mediaType\}/g, encodeURIComponent(mediaType))
    .replace(/\{season\}/g, encodeURIComponent(String(season)))
    .replace(/\{episode\}/g, encodeURIComponent(String(episode)))
    .replace(/\{title\}/g, encodeURIComponent(title))
    .replace(/\{year\}/g, encodeURIComponent(year));
}

function inferStreamQuality(label = '') {
  if (/2160|4k/i.test(label)) return '4K UHD';
  if (/1080/i.test(label)) return '1080p';
  if (/720/i.test(label)) return '720p';
  return 'HD';
}

function mapStremioStreamEntry(stream, { apiBase = '', addonLabel = '', nextIndex = 0 }) {
  if (!stream?.url || !/^https?:\/\//i.test(stream.url)) return null;
  const lower = stream.url.toLowerCase();
  const isMp4 = lower.includes('.mp4') && !lower.includes('.m3u8');
  if (stream.behaviorHints?.notWebReady === true && !lower.includes('.m3u8') && !isMp4) return null;

  const reqHeaders = stream.behaviorHints?.proxyHeaders?.request || {};
  const streamReferer = reqHeaders.Referer || reqHeaders.referer || stream.referer || '';
  const baseLabel =
    [stream.name, stream.title].filter(Boolean).join(' — ').split('\n')[0].slice(0, 80) ||
    (addonLabel ? `${addonLabel} Stream` : 'Addon HLS Stream');
  const quality = stream.quality || inferStreamQuality(baseLabel);
  const id = nextIndex === 0 ? 'addon-hls' : `addon-hls-${nextIndex + 1}`;

  if (apiBase) {
    return {
      id,
      name: `${baseLabel} (Edge Proxy)`,
      type: isMp4 ? 'direct' : 'hls',
      url: buildHlsProxyUrl(stream.url, { hlsProxyUrl: apiBase, referer: streamReferer }),
      rawUrl: stream.url,
      referer: streamReferer || undefined,
      addonName: addonLabel || undefined,
      proxied: true,
      quality,
      shielded: true,
      direct: true,
      node: 'addon-edge-proxy',
    };
  }

  if (isDirectStreamUrl(stream.url)) {
    return {
      id,
      name: baseLabel,
      type: isMp4 ? 'direct' : 'hls',
      url: stream.url,
      rawUrl: stream.url,
      addonName: addonLabel || undefined,
      quality,
      shielded: true,
      direct: true,
      node: 'addon-direct',
    };
  }

  return null;
}

function buildArchiveOrgSourceNode(ao, { apiBase = '', backendActive = false } = {}) {
  if (!ao?.url) return null;
  const shouldProxy = Boolean(apiBase || backendActive);
  const url = shouldProxy ? buildHlsProxyUrl(ao.url, { hlsProxyUrl: apiBase }) : ao.url;
  return {
    id: shouldProxy ? 'archive-org-proxy' : 'archive-org-direct',
    name: shouldProxy ? 'Archive.org (Edge Proxy)' : 'Archive.org (Public Domain)',
    type: ao.type || (ao.url.toLowerCase().includes('.m3u8') ? 'hls' : 'direct'),
    url,
    rawUrl: ao.url,
    proxied: shouldProxy,
    quality: ao.quality || 'HD',
    shielded: true,
    direct: true,
    node: 'archive-org',
    source: 'archive.org',
  };
}

/**
 * Resolves available stream sources for a media item into an ordered multi-node mirror list:
 * Direct HLS / Edge Proxy HLS / Multi-Addon HLS / Custom Resolver / Debrid / Archive.org / VidLink Shield / VidRift Sandboxed.
 *
 * @param {object} item
 * @param {object} [options]
 * @returns {Promise<Array<{id: string, name: string, type: string, url: string, quality: string, shielded: boolean}>>}
 */
export async function fetchStreamSources(item, options = {}) {
  if (!item) return [];
  const season = Math.max(1, Number(options.season ?? item.season ?? 1));
  const episode = Math.max(1, Number(options.episode ?? item.episode ?? 1));
  const tmdbId = item.tmdbId || (item.mediaType !== 'anime' && item.mediaType !== 'hls' ? item.id : '');
  const imdbId = item.imdbId || '';
  const anilistId = item.anilistId || (item.mediaType === 'anime' ? item.id : '');
  const malId = item.malId || '';
  const apiBase = cleanProxyUrl(options.hlsProxyUrl || '');
  const addonUrls = collectStremioAddonUrls(options);
  const customResolverUrl = String(options.customResolverUrl || '').trim();
  const debridKey = String(options.debridKey || options.debridApiKey || '').trim();
  const debridProvider = String(options.debridProvider || 'realdebrid').trim().toLowerCase();

  // 1. Query Node server or configured Cloudflare Worker Edge Proxy /api/resolve/stream
  try {
    const q = new URLSearchParams();
    if (tmdbId) q.set('tmdbId', String(tmdbId));
    if (imdbId) q.set('imdbId', String(imdbId));
    if (anilistId) q.set('anilistId', String(anilistId));
    if (malId) q.set('malId', String(malId));
    if (item.mediaType) q.set('mediaType', item.mediaType);
    if (item.title) q.set('title', item.title);
    if (item.year) q.set('year', String(item.year));
    q.set('season', String(season));
    q.set('episode', String(episode));

    const primaryDirect =
      item.hlsStreamUrl || (item.hlsUrl && isDirectStreamUrl(item.hlsUrl) ? item.hlsUrl : '');
    if (primaryDirect) q.set('directUrl', primaryDirect);
    if (item.magnetUri) q.set('magnet', item.magnetUri);
    if (item.infoHash) q.set('hash', item.infoHash);
    if (addonUrls.length > 0) q.set('addonUrls', JSON.stringify(addonUrls));
    if (customResolverUrl && /^https?:\/\//i.test(customResolverUrl)) {
      q.set('customResolverUrl', customResolverUrl);
    }

    const headers = {};
    if (addonUrls.length > 0) {
      headers['X-Addon-Url'] = addonUrls[0];
      headers['X-Addon-Urls'] = JSON.stringify(addonUrls);
    }
    if (customResolverUrl && /^https?:\/\//i.test(customResolverUrl)) {
      headers['X-Custom-Resolver'] = customResolverUrl;
    }
    if (debridKey) {
      headers['X-Debrid-Key'] = debridKey;
      headers['X-Debrid-Provider'] = debridProvider;
    }

    const resolveEndpoint = apiBase ? `${apiBase}/api/resolve/stream` : './api/resolve/stream';
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
      const resp = await fetch(`${resolveEndpoint}?${q.toString()}`, {
        headers,
        signal: controller?.signal,
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data?.sources) && data.sources.length) {
          const mapped = data.sources.map((src) => {
            if (src.id === 'vidlink-shield' && (tmdbId || imdbId || (item.mediaType === 'anime' && malId))) {
              return { ...src, url: buildVidlinkEmbedUrl(item, { ...options, season, episode }) };
            }
            if (src.id === 'vidrift-sandboxed' && (tmdbId || imdbId || anilistId)) {
              return { ...src, url: buildVidriftEmbedUrl(item, { ...options, season, episode }) };
            }
            return {
              ...src,
              url: normalizeResolveApiUrl(src.url, apiBase),
            };
          });

          const hasDirect = mapped.some(isPlayableDirectSource);
          if (
            !hasDirect &&
            options.includeArchiveFallback !== false &&
            (!item.mediaType || item.mediaType === 'movie') &&
            item.title
          ) {
            const ao = await fetchArchiveOrgDirectStream(item.title, item.year).catch(() => null);
            const aoNode = buildArchiveOrgSourceNode(ao, { apiBase, backendActive: true });
            if (aoNode) {
              const firstEmbedIdx = mapped.findIndex((s) => s.type === 'embed');
              if (firstEmbedIdx >= 0) mapped.splice(firstEmbedIdx, 0, aoNode);
              else mapped.push(aoNode);
            }
          }
          return mapped;
        }
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    // Static hosting fallback (e.g. GitHub Pages without Node backend)
  }

  // 2. Client-side multi-node fallback (static GitHub Pages & direct CORS execution)
  const list = [];
  const seenUrls = new Set();
  const candidateUrls = [
    item.hlsUrl && isDirectStreamUrl(item.hlsUrl) ? item.hlsUrl : '',
    item.hlsStreamUrl || '',
    ...(Array.isArray(item.hlsMirrors) ? item.hlsMirrors : []),
  ].filter((u) => typeof u === 'string' && u.trim() && isDirectStreamUrl(u));

  const uniqueDirectUrls = [];
  for (const u of candidateUrls) {
    const clean = u.trim();
    if (!seenUrls.has(clean)) {
      seenUrls.add(clean);
      uniqueDirectUrls.push(clean);
    }
  }

  uniqueDirectUrls.forEach((streamUrl, idx) => {
    const isMp4 = streamUrl.toLowerCase().includes('.mp4') && !streamUrl.toLowerCase().includes('.m3u8');
    const isPrimary = idx === 0;
    list.push({
      id: isPrimary ? 'catalog-hls' : `catalog-hls-mirror-${idx}`,
      name: isPrimary ? 'Direct HLS Stream (Zero Ads)' : `Direct HLS Mirror #${idx}`,
      type: isMp4 ? 'direct' : 'hls',
      url: streamUrl,
      rawUrl: streamUrl,
      quality: isPrimary ? '1080p UHD' : '1080p',
      shielded: true,
      direct: true,
      node: isPrimary ? 'catalog-direct' : 'catalog-mirror-direct',
    });

    if (apiBase && /^https?:\/\//i.test(streamUrl)) {
      list.push({
        id: isPrimary ? 'edge-proxy-hls' : `edge-proxy-hls-mirror-${idx}`,
        name: isPrimary ? 'Edge Proxy HLS (CORS Relay)' : `Edge Proxy Mirror #${idx}`,
        type: isMp4 ? 'direct' : 'hls',
        url: buildHlsProxyUrl(streamUrl, { hlsProxyUrl: apiBase }),
        rawUrl: streamUrl,
        proxied: true,
        quality: isPrimary ? '1080p UHD' : '1080p',
        shielded: true,
        direct: true,
        node: 'edge-proxy',
      });
    }
  });

  // 3. Client-side parallel Stremio addons + custom resolver template resolution
  const addonTasks = addonUrls.map(async (baseAddonUrl) => {
    const endpoint = buildStremioStreamUrl(baseAddonUrl, item, { season, episode });
    if (!endpoint) return [];
    const addonLabel = deriveAddonDisplayName(baseAddonUrl, options.stremioAddons);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
      const resp = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
        signal: controller?.signal,
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      const streams = Array.isArray(data?.streams) ? data.streams : [];
      return streams.map((stream) => ({ stream, addonLabel }));
    } catch {
      return [];
    } finally {
      if (timer) clearTimeout(timer);
    }
  });

  const expandedResolverUrl = expandCustomResolverTemplate(customResolverUrl, item, { season, episode });
  const customResolverTask = (async () => {
    if (!expandedResolverUrl) return [];
    if (isDirectStreamUrl(expandedResolverUrl)) {
      return [{ directResolverUrl: expandedResolverUrl }];
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 4500) : null;
    try {
      const resp = await fetch(expandedResolverUrl, {
        headers: { Accept: 'application/json' },
        signal: controller?.signal,
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      if (Array.isArray(data?.streams)) {
        return data.streams.map((stream) => ({ stream, addonLabel: 'Custom Resolver' }));
      }
      if (Array.isArray(data?.sources)) {
        return data.sources.map((src) => ({ resolverSource: src }));
      }
      if (data?.url && /^https?:\/\//i.test(data.url)) {
        return [{ stream: data, addonLabel: 'Custom Resolver' }];
      }
      return [];
    } catch {
      return [];
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();

  const [addonResults, customResults] = await Promise.all([
    Promise.allSettled(addonTasks),
    customResolverTask.catch(() => []),
  ]);

  let addonNodeCounter = 0;
  for (const res of addonResults) {
    if (res.status !== 'fulfilled' || !Array.isArray(res.value)) continue;
    let perAddonCount = 0;
    for (const entry of res.value) {
      if (perAddonCount >= 6) break;
      const streamUrl = String(entry?.stream?.url || '').trim();
      if (!streamUrl || seenUrls.has(streamUrl)) continue;
      const mapped = mapStremioStreamEntry(entry.stream, {
        apiBase,
        addonLabel: entry.addonLabel,
        nextIndex: addonNodeCounter,
      });
      if (!mapped) continue;
      seenUrls.add(streamUrl);
      list.push(mapped);
      addonNodeCounter += 1;
      perAddonCount += 1;
    }
  }

  let customCounter = 0;
  for (const entry of customResults) {
    if (entry.directResolverUrl) {
      const u = entry.directResolverUrl;
      if (!seenUrls.has(u)) {
        seenUrls.add(u);
        const isMp4 = u.toLowerCase().includes('.mp4') && !u.toLowerCase().includes('.m3u8');
        list.push({
          id: customCounter === 0 ? 'custom-resolver' : `custom-resolver-${customCounter + 1}`,
          name: apiBase ? 'Custom Resolver (Edge Proxy)' : 'Custom Resolver Stream',
          type: isMp4 ? 'direct' : 'hls',
          url: apiBase ? buildHlsProxyUrl(u, { hlsProxyUrl: apiBase }) : u,
          rawUrl: u,
          proxied: Boolean(apiBase),
          quality: 'Original',
          shielded: true,
          direct: true,
          node: 'custom-resolver',
        });
        customCounter += 1;
      }
    } else if (entry.resolverSource?.url) {
      const s = entry.resolverSource;
      if (s.type !== 'embed' && /^https?:\/\//i.test(s.url) && !seenUrls.has(s.url)) {
        const lower = s.url.toLowerCase();
        const isMp4 = lower.includes('.mp4') && !lower.includes('.m3u8');
        const resolvedUrl = apiBase
          ? buildHlsProxyUrl(s.url, { hlsProxyUrl: apiBase, referer: s.referer || '' })
          : s.url;
        if (apiBase || isDirectStreamUrl(s.url)) {
          seenUrls.add(s.url);
          list.push({
            ...s,
            id: s.id || (customCounter === 0 ? 'custom-resolver' : `custom-resolver-${customCounter + 1}`),
            name: s.name || (apiBase ? 'Custom Resolver (Edge Proxy)' : 'Custom Resolver Stream'),
            type: s.type || (isMp4 ? 'direct' : 'hls'),
            url: resolvedUrl,
            rawUrl: s.rawUrl || s.url,
            proxied: Boolean(apiBase || s.proxied),
            quality: s.quality || inferStreamQuality(s.name || ''),
            shielded: true,
            direct: true,
            node: s.node || 'custom-resolver',
          });
          customCounter += 1;
        }
      }
    } else if (entry.stream?.url) {
      const u = String(entry.stream.url).trim();
      if (!seenUrls.has(u)) {
        const mapped = mapStremioStreamEntry(entry.stream, {
          apiBase,
          addonLabel: entry.addonLabel,
          nextIndex: addonNodeCounter,
        });
        if (mapped) {
          seenUrls.add(u);
          list.push({
            ...mapped,
            id: customCounter === 0 ? 'custom-resolver' : `custom-resolver-${customCounter + 1}`,
            node: 'custom-resolver',
          });
          customCounter += 1;
        }
      }
    }
  }

  // 4. Archive.org direct public-domain fallback when directUrl & addons yield no playable stream
  const hasPlayableDirect = list.some(isPlayableDirectSource);
  if (
    !hasPlayableDirect &&
    options.includeArchiveFallback !== false &&
    (!item.mediaType || item.mediaType === 'movie') &&
    item.title
  ) {
    const ao = await fetchArchiveOrgDirectStream(item.title, item.year).catch(() => null);
    const aoNode = buildArchiveOrgSourceNode(ao, { apiBase, backendActive: false });
    if (aoNode && !seenUrls.has(aoNode.rawUrl)) {
      seenUrls.add(aoNode.rawUrl);
      list.push(aoNode);
    }
  }

  // 5. Shielded embed fallbacks (skip when item has no TMDB/MAL/AniList IDs, e.g. raw direct stream)
  if (tmdbId || imdbId || (item.mediaType === 'anime' && malId)) {
    list.push({
      id: 'vidlink-shield',
      name: 'VidLink (No-Redirect Shield)',
      type: 'embed',
      url: buildVidlinkEmbedUrl(item, { ...options, season, episode }),
      quality: '1080p',
      shielded: true,
      sandboxed: true,
      direct: false,
      node: 'vidlink',
    });
  }

  if (tmdbId || imdbId || anilistId) {
    list.push({
      id: 'vidrift-sandboxed',
      name: 'VidRift (Sandboxed)',
      type: 'embed',
      url: buildVidriftEmbedUrl(item, { ...options, season, episode }),
      quality: '720p/1080p',
      shielded: true,
      sandboxed: true,
      direct: false,
      node: 'vidrift',
    });
  }

  return list;
}

/**
 * Build an authentic VidRift embed URL with Suno Cinema theme synchronization.
 * @param {object} item
 * @param {object} [options]
 * @returns {string}
 */
export function buildVidriftEmbedUrl(item, options = {}) {
  if (!item) throw new Error('A media item is required to build a VidRift URL.');

  const mediaType = item.mediaType || 'movie';
  let path;

  if (mediaType === 'anime' && item.anilistId) {
    const ep = Math.max(1, Number(options.episode ?? item.episode ?? 1));
    path = `/embed/anilist/${encodeURIComponent(String(item.anilistId))}/${ep}`;
  } else if (mediaType === 'tv') {
    const id = item.tmdbId || item.id;
    if (!id) throw new Error('TV embed requires a tmdbId.');
    const season = Math.max(1, Number(options.season ?? item.season ?? 1));
    const episode = Math.max(1, Number(options.episode ?? item.episode ?? 1));
    path = `/embed/tv/${encodeURIComponent(String(id))}/${season}/${episode}`;
  } else {
    const id = item.tmdbId || item.id;
    if (!id) throw new Error('Movie embed requires a tmdbId.');
    path = `/embed/movie/${encodeURIComponent(String(id))}`;
  }

  const params = new URLSearchParams();
  params.set('brand', options.brand || 'Suno Cinema');

  const brandColor = String(
    options.brandColor || resolveThemeAccentHex(options.themeId || 'default')
  ).replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(brandColor)) {
    params.set('brandColor', brandColor.toLowerCase());
  }

  params.set('font', options.font || 'Roboto');
  params.set('controlBg', options.controlBg || 'solid');
  params.set('autoplay', options.autoplay === false ? '0' : '1');

  if (options.muted) {
    params.set('muted', '1');
  }

  if (item.title) {
    params.set('title', item.title);
  }

  if (options.sub && options.sub !== 'auto') {
    params.set('sub', options.sub);
  }

  if (options.uiScale && Number(options.uiScale) !== 1) {
    params.set('uiScale', String(options.uiScale));
  }

  if (mediaType === 'anime' && options.dub) {
    params.set('dub', '1');
  }

  const posterCandidate = options.poster || item.backdrop || item.poster;
  if (typeof posterCandidate === 'string' && posterCandidate.startsWith('https://')) {
    params.set('poster', posterCandidate);
  }

  return `${VIDRIFT_ORIGIN}${path}?${params.toString()}`;
}

/**
 * Build a clean VidLink embed URL (works inside browser sandbox with zero popups/redirects).
 * Falls back to VidRift automatically for anime that lack a MAL ID.
 * @param {object} item
 * @param {object} [options]
 * @returns {string}
 */
export function buildVidlinkEmbedUrl(item, options = {}) {
  if (!item) throw new Error('A media item is required to build a VidLink URL.');
  const mediaType = item.mediaType || 'movie';
  const accent = String(
    options.brandColor || resolveThemeAccentHex(options.themeId || 'default')
  ).replace(/^#/, '');

  let path;
  if (mediaType === 'anime') {
    if (!item.malId) {
      return buildVidriftEmbedUrl(item, options);
    }
    const ep = Math.max(1, Number(options.episode ?? item.episode ?? 1));
    const subOrDub = options.dub ? 'dub' : 'sub';
    path = `/anime/${encodeURIComponent(String(item.malId))}/${ep}/${subOrDub}`;
  } else if (mediaType === 'tv') {
    const id = item.tmdbId || item.id;
    if (!id) throw new Error('TV embed requires a tmdbId.');
    const season = Math.max(1, Number(options.season ?? item.season ?? 1));
    const episode = Math.max(1, Number(options.episode ?? item.episode ?? 1));
    path = `/tv/${encodeURIComponent(String(id))}/${season}/${episode}`;
  } else {
    const id = item.tmdbId || item.id;
    if (!id) throw new Error('Movie embed requires a tmdbId.');
    path = `/movie/${encodeURIComponent(String(id))}`;
  }

  const params = new URLSearchParams();
  params.set('primaryColor', accent);
  params.set('secondaryColor', '27272a');
  params.set('autoplay', options.autoplay === false ? 'false' : 'true');
  params.set('nextbutton', mediaType === 'tv' || mediaType === 'anime' ? 'true' : 'false');
  if (mediaType === 'anime') params.set('fallback', 'true');

  return `${VIDLINK_ORIGIN}${path}?${params.toString()}`;
}

/**
 * Unified embed URL builder supporting VidLink (No-Redirect) & VidRift providers.
 */
export function buildPlayerEmbedUrl(item, options = {}) {
  const provider = options.provider || 'vidlink';
  if (provider === 'vidlink' || provider === 'hls-direct') {
    return buildVidlinkEmbedUrl(item, options);
  }
  return buildVidriftEmbedUrl(item, options);
}

/**
 * Safely parse incoming postMessage from VidRift.
 */
export function parseVidriftMessage(event) {
  if (!event || event.origin !== VIDRIFT_ORIGIN) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') return null;
  if (!data.type.startsWith('vidrift:')) return null;
  return data;
}

/**
 * Parse playback progress/events from either VidRift or VidLink safely.
 * @param {MessageEvent} event
 * @returns {{ source: 'vidrift'|'vidlink', eventType: string, currentTime?: number, duration?: number } | null}
 */
export function parseAnyPlayerMessage(event) {
  if (!event || !event.data || typeof event.data !== 'object') return null;

  if (event.origin === VIDRIFT_ORIGIN) {
    const d = parseVidriftMessage(event);
    if (!d) return null;
    if (d.type === 'vidrift:progress') {
      return {
        source: 'vidrift',
        eventType: 'progress',
        currentTime: Number(d.currentTime || 0),
        duration: Number(d.duration || 0),
      };
    }
    if (d.type === 'vidrift:ended') return { source: 'vidrift', eventType: 'ended' };
    if (d.type === 'vidrift:exit') return { source: 'vidrift', eventType: 'exit' };
    return null;
  }

  if (event.origin === VIDLINK_ORIGIN) {
    const d = event.data;
    if (d.type === 'MEDIA_DATA' && d.data) {
      const firstKey = Object.keys(d.data)[0];
      const itemData = d.data.progress ? d.data : firstKey ? d.data[firstKey] : null;
      const watched = Number(itemData?.progress?.watched ?? 0);
      const duration = Number(itemData?.progress?.duration ?? 0);
      if (duration > 0) {
        return {
          source: 'vidlink',
          eventType: 'progress',
          currentTime: watched,
          duration,
        };
      }
    }
    if (d.type === 'PLAYER_EVENT' && d.data) {
      const ev = d.data.event;
      if (ev === 'timeupdate' && d.data.duration > 0) {
        return {
          source: 'vidlink',
          eventType: 'progress',
          currentTime: Number(d.data.currentTime || 0),
          duration: Number(d.data.duration || 0),
        };
      }
      if (ev === 'ended') return { source: 'vidlink', eventType: 'ended' };
    }
  }

  return null;
}

export function buildVidriftCommand(action, payload = {}) {
  return {
    type: `vidrift:${action}`,
    ...payload,
  };
}
