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

test('fetchStreamSources provides direct HLS sources with client and proxy fallbacks', async () => {
  const itemWithHls = {
    id: 'movie:test-bbb',
    tmdbId: 'test-bbb',
    mediaType: 'movie',
    title: 'Big Buck Bunny',
    hlsStreamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  };
  const sources = await fetchStreamSources(itemWithHls);
  assert.ok(Array.isArray(sources));
  assert.ok(sources.some((s) => s.id === 'catalog-hls' && s.type === 'hls' && s.direct === true));
  assert.ok(sources.some((s) => s.id === 'vidlink-shield' && s.sandboxed === true));
});
