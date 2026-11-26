import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDRIFT_ORIGIN,
  VIDLINK_ORIGIN,
  parseDirectTarget,
  buildVidriftEmbedUrl,
  buildPlayerEmbedUrl,
  parseVidriftMessage,
  parseAnyPlayerMessage,
  buildVidriftCommand,
  isDirectStreamUrl,
  fetchStreamSources,
  cleanProxyUrl,
  cleanAddonUrl,
  buildHlsProxyUrl,
  buildSubtitleProxyUrl,
  normalizeResolveApiUrl,
  isPlayableDirectSource,
  getPlayableHlsNodes,
  getEmbedFallbackNodes,
  selectNextStreamMirror,
  createFailoverState,
  recordFailoverAttempt,
} from '../src/utils/vidrift.js';

test('parseDirectTarget handles TMDB movie, TMDB TV, AniList URLs, and shorthands', () => {
  assert.deepEqual(parseDirectTarget('https://www.themoviedb.org/movie/438631-dune'), {
    mediaType: 'movie',
    tmdbId: '438631',
  });

  assert.deepEqual(
    parseDirectTarget('https://www.themoviedb.org/tv/1396-breaking-bad/season/2/episode/5'),
    {
      mediaType: 'tv',
      tmdbId: '1396',
      season: 2,
      episode: 5,
    }
  );

  assert.deepEqual(parseDirectTarget('https://anilist.co/anime/1535/Death-Note'), {
    mediaType: 'anime',
    anilistId: '1535',
    episode: 1,
  });

  assert.deepEqual(parseDirectTarget('tv/95396/2/4'), {
    mediaType: 'tv',
    tmdbId: '95396',
    season: 2,
    episode: 4,
  });

  assert.deepEqual(parseDirectTarget('anilist/120377/7'), {
    mediaType: 'anime',
    anilistId: '120377',
    episode: 7,
  });

  assert.deepEqual(parseDirectTarget('157336', 'movie'), {
    mediaType: 'movie',
    tmdbId: '157336',
  });

  assert.deepEqual(parseDirectTarget('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'), {
    mediaType: 'hls',
    hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    format: 'hls',
  });

  assert.equal(parseDirectTarget('not a valid url'), null);
});

test('buildVidriftEmbedUrl constructs valid VidRift embed URLs with synced Suno theme params', () => {
  const movieUrl = new URL(
    buildVidriftEmbedUrl(
      { mediaType: 'movie', tmdbId: '438631', title: 'Dune', poster: 'https://example.com/dune.jpg' },
      { themeId: 'cyberpunk', autoplay: false, sub: 'es', uiScale: 1.25 }
    )
  );
  assert.equal(movieUrl.origin, VIDRIFT_ORIGIN);
  assert.equal(movieUrl.pathname, '/embed/movie/438631');
  assert.equal(movieUrl.searchParams.get('brand'), 'Suno Cinema');
  assert.equal(movieUrl.searchParams.get('brandColor'), '00f0ff');
  assert.equal(movieUrl.searchParams.get('autoplay'), '0');
  assert.equal(movieUrl.searchParams.get('sub'), 'es');
  assert.equal(movieUrl.searchParams.get('uiScale'), '1.25');
  assert.equal(movieUrl.searchParams.get('poster'), 'https://example.com/dune.jpg');

  const tvUrl = new URL(
    buildVidriftEmbedUrl(
      { mediaType: 'tv', tmdbId: '1396', title: 'Breaking Bad' },
      { themeId: 'emerald', season: 3, episode: 7 }
    )
  );
  assert.equal(tvUrl.pathname, '/embed/tv/1396/3/7');
  assert.equal(tvUrl.searchParams.get('brandColor'), '1db954');

  const animeUrl = new URL(
    buildVidriftEmbedUrl(
      { mediaType: 'anime', anilistId: '1', title: 'Cowboy Bebop' },
      { episode: 5, dub: true }
    )
  );
  assert.equal(animeUrl.pathname, '/embed/anilist/1/5');
  assert.equal(animeUrl.searchParams.get('dub'), '1');
});

test('parseVidriftMessage strictly validates origin and message prefix', () => {
  assert.equal(
    parseVidriftMessage({ origin: 'https://evil.example', data: { type: 'vidrift:progress' } }),
    null
  );
  assert.equal(
    parseVidriftMessage({ origin: VIDRIFT_ORIGIN, data: { type: 'other:event' } }),
    null
  );

  const valid = parseVidriftMessage({
    origin: VIDRIFT_ORIGIN,
    data: { type: 'vidrift:progress', currentTime: 420, duration: 7200 },
  });
  assert.equal(valid.type, 'vidrift:progress');
  assert.equal(valid.currentTime, 420);

  assert.deepEqual(buildVidriftCommand('resume', { currentTime: 812 }), {
    type: 'vidrift:resume',
    currentTime: 812,
  });
});

test('buildPlayerEmbedUrl & parseAnyPlayerMessage support VidLink No-Redirect and VidRift fallback', () => {
  const vlMovie = new URL(
    buildPlayerEmbedUrl({ mediaType: 'movie', tmdbId: '27205' }, { provider: 'vidlink', themeId: 'default' })
  );
  assert.equal(vlMovie.origin, VIDLINK_ORIGIN);
  assert.equal(vlMovie.pathname, '/movie/27205');
  assert.equal(vlMovie.searchParams.get('primaryColor'), 'e50914');

  const vlAnime = new URL(
    buildPlayerEmbedUrl(
      { mediaType: 'anime', anilistId: '1', malId: '1', title: 'Cowboy Bebop' },
      { provider: 'vidlink', episode: 3, dub: true }
    )
  );
  assert.equal(vlAnime.origin, VIDLINK_ORIGIN);
  assert.equal(vlAnime.pathname, '/anime/1/3/dub');

  // Falls back to VidRift if MAL ID is absent on anime
  const fallbackAnime = new URL(
    buildPlayerEmbedUrl({ mediaType: 'anime', anilistId: '154587' }, { provider: 'vidlink', episode: 2 })
  );
  assert.equal(fallbackAnime.origin, VIDRIFT_ORIGIN);

  const vlMsg = parseAnyPlayerMessage({
    origin: VIDLINK_ORIGIN,
    data: { type: 'MEDIA_DATA', data: { progress: { watched: 310, duration: 5400 } } },
  });
  assert.deepEqual(vlMsg, { source: 'vidlink', eventType: 'progress', currentTime: 310, duration: 5400 });

  assert.equal(
    parseAnyPlayerMessage({ origin: 'https://evil.example', data: { type: 'MEDIA_DATA' } }),
    null
  );
});

test('isDirectStreamUrl identifies genuine stream URLs and rejects HTML/embed URLs', () => {
  assert.equal(isDirectStreamUrl('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'), true);
  assert.equal(isDirectStreamUrl('https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8'), true);
  assert.equal(isDirectStreamUrl('https://example.com/video.mp4'), true);
  assert.equal(isDirectStreamUrl('/api/proxy/hls?url=https%3A%2F%2Fexample.com%2Fstream.m3u8'), true);
  assert.equal(isDirectStreamUrl('blob:http://localhost:3000/12345'), true);

  // Rejects HTML pages and embed player origins
  assert.equal(isDirectStreamUrl('https://embed.vidrift.net/embed/movie/26815?brand=Suno+Cinema'), false);
  assert.equal(isDirectStreamUrl('https://vidlink.pro/movie/26815'), false);
  assert.equal(isDirectStreamUrl('https://example.com/embed/player.html'), false);
  assert.equal(isDirectStreamUrl('https://example.com/index.html'), false);
  assert.equal(isDirectStreamUrl(''), false);
  assert.equal(isDirectStreamUrl(null), false);
  assert.equal(isDirectStreamUrl(undefined), false);
});

test('buildPlayerEmbedUrl safely falls back to VidLink when provider is hls-direct', () => {
  const url = buildPlayerEmbedUrl(
    { mediaType: 'movie', tmdbId: '26815' },
    { provider: 'hls-direct', themeId: 'cyberpunk' }
  );
  assert.ok(url.startsWith(VIDLINK_ORIGIN));
  assert.ok(url.includes('/movie/26815'));
  assert.equal(url.includes(VIDRIFT_ORIGIN), false);
});

test('Edge Proxy URL formatting helpers normalize bases, preserve relative paths, and avoid double-wrapping', () => {
  assert.equal(cleanProxyUrl('https://edge.workers.dev///'), 'https://edge.workers.dev');
  assert.equal(cleanProxyUrl('https://edge.workers.dev/api/proxy/hls/'), 'https://edge.workers.dev');
  assert.equal(cleanProxyUrl('http://localhost:3000/api/resolve/stream'), 'http://localhost:3000');
  assert.equal(cleanProxyUrl('not-a-url'), '');

  assert.equal(cleanAddonUrl('https://addon.example/manifest.json/'), 'https://addon.example');

  assert.equal(
    buildHlsProxyUrl('https://cdn.example/master.m3u8', { referer: 'https://site.example' }),
    './api/proxy/hls?url=https%3A%2F%2Fcdn.example%2Fmaster.m3u8&referer=https%3A%2F%2Fsite.example'
  );
  assert.equal(
    buildHlsProxyUrl('https://cdn.example/master.m3u8', {
      hlsProxyUrl: 'https://edge.workers.dev/api/proxy/hls',
      referer: 'https://site.example',
    }),
    'https://edge.workers.dev/api/proxy/hls?url=https%3A%2F%2Fcdn.example%2Fmaster.m3u8&referer=https%3A%2F%2Fsite.example'
  );
  // Avoid double-wrapping and pass through blob/data URLs
  assert.equal(
    buildHlsProxyUrl('/api/proxy/hls?url=https%3A%2F%2Fcdn.example%2Fa.m3u8', {
      hlsProxyUrl: 'https://edge.workers.dev',
    }),
    'https://edge.workers.dev/api/proxy/hls?url=https%3A%2F%2Fcdn.example%2Fa.m3u8'
  );
  assert.equal(buildHlsProxyUrl('blob:https://suno.example/123'), 'blob:https://suno.example/123');

  assert.equal(
    buildSubtitleProxyUrl('https://subs.example/movie.srt', { hlsProxyUrl: 'https://edge.workers.dev/' }),
    'https://edge.workers.dev/api/proxy/subtitles?url=https%3A%2F%2Fsubs.example%2Fmovie.srt'
  );
  assert.equal(
    buildSubtitleProxyUrl('https://subs.example/movie.srt'),
    './api/proxy/subtitles?url=https%3A%2F%2Fsubs.example%2Fmovie.srt'
  );

  // GitHub Pages subpath & Edge Proxy normalization
  assert.equal(normalizeResolveApiUrl('/api/proxy/hls?url=x'), './api/proxy/hls?url=x');
  assert.equal(
    normalizeResolveApiUrl('/api/proxy/hls?url=x', 'https://edge.workers.dev/'),
    'https://edge.workers.dev/api/proxy/hls?url=x'
  );
  assert.equal(
    normalizeResolveApiUrl('./api/proxy/hls?url=x', 'https://edge.workers.dev'),
    'https://edge.workers.dev/api/proxy/hls?url=x'
  );
});

test('HlsPlayer failover & mirror selection cycles untried HLS mirrors before falling back to VidLink shield', () => {
  const sources = [
    { id: 'catalog-hls', type: 'hls', direct: true, url: 'https://a.example/master.m3u8' },
    { id: 'catalog-hls-mirror-1', type: 'hls', direct: true, url: 'https://b.example/master.m3u8' },
    { id: 'debrid-instant-cache', type: 'debrid', direct: true, url: 'https://c.example/movie.mp4' },
    { id: 'vidrift-sandboxed', type: 'embed', direct: false, url: 'https://embed.vidrift.net/embed/movie/1' },
    { id: 'vidlink-shield', type: 'embed', direct: false, url: 'https://vidlink.pro/movie/1' },
  ];

  assert.equal(getPlayableHlsNodes(sources).length, 3);
  assert.equal(getEmbedFallbackNodes(sources).length, 2);
  assert.equal(isPlayableDirectSource({ type: 'embed', url: 'https://vidlink.pro/movie/1' }), false);

  const fsState = createFailoverState(sources, 0);
  const step1 = recordFailoverAttempt(fsState, 'Network error');
  assert.equal(step1.exhaustedHls, false);
  assert.equal(step1.next.index, 1);
  assert.equal(step1.next.source.id, 'catalog-hls-mirror-1');

  const step2 = recordFailoverAttempt(fsState, 'Stalled >6s');
  assert.equal(step2.exhaustedHls, false);
  assert.equal(step2.next.index, 2);
  assert.equal(step2.next.source.id, 'debrid-instant-cache');

  // Once all HLS/direct nodes fail, prefers vidlink-shield even if listed after vidrift-sandboxed
  const step3 = recordFailoverAttempt(fsState, 'Decode error');
  assert.equal(step3.exhaustedHls, true);
  assert.equal(step3.next.kind, 'embed');
  assert.equal(step3.next.source.id, 'vidlink-shield');

  // If user started on index 1 and index 1 failed, wrap-around still catches untried index 0
  const wrapped = selectNextStreamMirror(sources, 1, new Set([1, 2]));
  assert.equal(wrapped.index, 0);
  assert.equal(wrapped.kind, 'hls');

  //Exhausting all nodes returns null
  const done = selectNextStreamMirror(sources, 4, new Set([0, 1, 2, 3, 4]));
  assert.equal(done, null);
});

test('fetchStreamSources provides direct HLS sources and static GitHub Pages Edge Proxy + Stremio addon nodes', async () => {
  const itemWithHls = {
    id: 'movie:test-tos',
    tmdbId: 'test-tos',
    imdbId: 'tt2285752',
    mediaType: 'movie',
    title: 'Tears of Steel',
    hlsStreamUrl: 'https://test-streams.mux.dev/tos_ismc/main.m3u8',
    hlsMirrors: ['https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8'],
  };

  const origFetch = globalThis.fetch;
  let capturedResolveUrl = '';
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/api/resolve/stream')) {
      capturedResolveUrl = href;
      throw new Error('Static GitHub Pages has no backend');
    }
    if (href === 'https://addon.example/stream/movie/tt2285752.json') {
      return new Response(
        JSON.stringify({
          streams: [
            {
              name: 'Addon 1080p',
              url: 'https://cdn.addon.example/tos/master.m3u8',
              behaviorHints: { proxyHeaders: { request: { Referer: 'https://ref.addon.example' } } },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected URL ${href}`);
  };

  try {
    const sources = await fetchStreamSources(itemWithHls, {
      hlsProxyUrl: 'https://edge.workers.dev/',
      stremioAddonUrl: 'https://addon.example/manifest.json',
    });

    assert.ok(capturedResolveUrl.startsWith('https://edge.workers.dev/api/resolve/stream?'));
    assert.ok(capturedResolveUrl.includes('imdbId=tt2285752'));

    assert.ok(sources.some((s) => s.id === 'catalog-hls' && s.type === 'hls' && s.direct === true));
    assert.ok(
      sources.some(
        (s) =>
          s.id === 'edge-proxy-hls' &&
          s.url.startsWith('https://edge.workers.dev/api/proxy/hls?url=')
      )
    );
    assert.ok(sources.some((s) => s.id === 'catalog-hls-mirror-1'));
    const addonSrc = sources.find((s) => s.id === 'addon-hls');
    assert.ok(addonSrc, 'Must include client-side Stremio addon node on static fallback');
    assert.ok(addonSrc.url.includes(encodeURIComponent('https://ref.addon.example')));
    assert.ok(sources.some((s) => s.id === 'vidlink-shield' && s.sandboxed === true));
  } finally {
    globalThis.fetch = origFetch;
  }
});
