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

/**
 * Resolves available stream sources for a media item (Method 3 & Method 4 architecture).
 * Queries the local /api/resolve/stream endpoint when available, and provides client-side fallbacks.
 *
 * @param {object} item
 * @param {object} [options]
 * @returns {Promise<Array<{id: string, name: string, type: string, url: string, quality: string, shielded: boolean}>>}
 */
export async function fetchStreamSources(item, options = {}) {
  if (!item) return [];
  const season = Math.max(1, Number(options.season ?? item.season ?? 1));
  const episode = Math.max(1, Number(options.episode ?? item.episode ?? 1));
  const tmdbId = item.tmdbId || (item.mediaType !== 'anime' ? item.id : '');
  const anilistId = item.anilistId || (item.mediaType === 'anime' ? item.id : '');

  // 1. If running with Node server, ask the stream resolver
  try {
    const q = new URLSearchParams();
    if (tmdbId) q.set('tmdbId', String(tmdbId));
    if (anilistId) q.set('anilistId', String(anilistId));
    if (item.mediaType) q.set('mediaType', item.mediaType);
    q.set('season', String(season));
    q.set('episode', String(episode));
    if (item.hlsStreamUrl) q.set('directUrl', item.hlsStreamUrl);

    const resp = await fetch(`./api/resolve/stream?${q.toString()}`);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data.sources) && data.sources.length) {
        return data.sources;
      }
    }
  } catch {
    // Static hosting fallback (e.g. GitHub Pages)
  }

  // 2. Client-side fallback sources
  const list = [];
  if (item.hlsStreamUrl) {
    list.push({
      id: 'catalog-hls',
      name: 'Direct HLS Stream (Zero Ads)',
      type: 'hls',
      url: item.hlsStreamUrl,
      quality: '1080p UHD',
      shielded: true,
      direct: true,
    });
  }

  const vidlinkUrl = buildVidlinkEmbedUrl(item, options);
  list.push({
    id: 'vidlink-shield',
    name: 'VidLink (No-Redirect Shield)',
    type: 'embed',
    url: vidlinkUrl,
    quality: '1080p',
    shielded: true,
    sandboxed: true,
  });

  const vidriftUrl = buildVidriftEmbedUrl(item, options);
  list.push({
    id: 'vidrift-sandboxed',
    name: 'VidRift (Sandboxed)',
    type: 'embed',
    url: vidriftUrl,
    quality: '720p/1080p',
    shielded: true,
    sandboxed: true,
  });

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
  if (provider === 'vidlink') {
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
