export const VIDRIFT_ORIGIN = 'https://embed.vidrift.net';

export const THEME_ACCENT_HEX = {
  default: 'ff0033',
  cyberpunk: '00f0ff',
  sunset: 'ff5e62',
  emerald: '1db954',
  gold: 'f59e0b',
};

/**
 * Resolve theme accent hex (6 chars, no leading #) for VidRift `brandColor`.
 * @param {string} themeId
 * @returns {string}
 */
export function resolveThemeAccentHex(themeId = 'default') {
  return THEME_ACCENT_HEX[themeId] || THEME_ACCENT_HEX.default;
}

/**
 * Parse a direct TMDB / AniList URL or shorthand ID into a playable VidRift target.
 * Examples:
 * - "https://www.themoviedb.org/movie/438631-dune"
 * - "https://www.themoviedb.org/tv/1396-breaking-bad/season/2/episode/5"
 * - "https://anilist.co/anime/1535/Death-Note"
 * - "tv/1396/1/1" or "movie/438631" or "anilist/1535/1"
 * - "438631" (defaults to movie unless fallbackType specifies otherwise)
 * @param {string} rawInput
 * @param {'movie'|'tv'|'anime'} [fallbackType='movie']
 * @returns {{ mediaType: 'movie'|'tv'|'anime', tmdbId?: string, anilistId?: string, season?: number, episode?: number } | null}
 */
export function parseDirectTarget(rawInput, fallbackType = 'movie') {
  const input = String(rawInput || '').trim();
  if (!input) return null;

  // TMDB TV URL with optional season/episode
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

  // TMDB Movie URL
  const tmdbMovieUrl = input.match(/themoviedb\.org\/movie\/(\d+)/i);
  if (tmdbMovieUrl) {
    return {
      mediaType: 'movie',
      tmdbId: tmdbMovieUrl[1],
    };
  }

  // AniList URL
  const anilistUrl = input.match(/anilist\.co\/anime\/(\d+)/i);
  if (anilistUrl) {
    return {
      mediaType: 'anime',
      anilistId: anilistUrl[1],
      episode: 1,
    };
  }

  // Shorthand: tv/1396/2/5 or tv:1396:2:5
  const tvShort = input.match(/^tv[:/](\d+)(?:[:/](\d+))?(?:[:/](\d+))?$/i);
  if (tvShort) {
    return {
      mediaType: 'tv',
      tmdbId: tvShort[1],
      season: Math.max(1, Number(tvShort[2] || 1)),
      episode: Math.max(1, Number(tvShort[3] || 1)),
    };
  }

  // Shorthand: movie/438631 or tmdb/438631
  const movieShort = input.match(/^(?:movie|tmdb)[:/](\d+)$/i);
  if (movieShort) {
    return {
      mediaType: 'movie',
      tmdbId: movieShort[1],
    };
  }

  // Shorthand: anilist/1535/2 or anime/1535/2
  const animeShort = input.match(/^(?:anilist|anime)[:/](\d+)(?:[:/](\d+))?$/i);
  if (animeShort) {
    return {
      mediaType: 'anime',
      anilistId: animeShort[1],
      episode: Math.max(1, Number(animeShort[2] || 1)),
    };
  }

  // Pure numeric ID
  if (/^\d{1,10}$/.test(input)) {
    if (fallbackType === 'anime') {
      return { mediaType: 'anime', anilistId: input, episode: 1 };
    }
    if (fallbackType === 'tv') {
      return { mediaType: 'tv', tmdbId: input, season: 1, episode: 1 };
    }
    return { mediaType: 'movie', tmdbId: input };
  }

  return null;
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
 * Safely parse an incoming postMessage event from embed.vidrift.net.
 * Rejects any message from an untrusted origin.
 * @param {MessageEvent} event
 * @returns {object | null}
 */
export function parseVidriftMessage(event) {
  if (!event || event.origin !== VIDRIFT_ORIGIN) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') return null;
  if (!data.type.startsWith('vidrift:')) return null;
  return data;
}

/**
 * Construct a VidRift parent -> player command payload.
 * @param {'play'|'pause'|'resume'|'set'|'get-state'|'nextup-info'} action
 * @param {object} [payload]
 * @returns {object}
 */
export function buildVidriftCommand(action, payload = {}) {
  return {
    type: `vidrift:${action}`,
    ...payload,
  };
}
