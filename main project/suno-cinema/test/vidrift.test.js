import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDRIFT_ORIGIN,
  parseDirectTarget,
  buildVidriftEmbedUrl,
  parseVidriftMessage,
  buildVidriftCommand,
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
