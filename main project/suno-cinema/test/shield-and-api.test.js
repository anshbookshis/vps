import test from 'node:test';
import assert from 'node:assert/strict';
import { AntiRedirectGuard, isAllowedExternalUrl } from '../src/utils/anti-redirect.js';
import { normalizeCinemetaItem, searchLocalItems } from '../src/utils/client-api.js';
import { getMediaKey } from '../src/utils/storage.js';

test('isAllowedExternalUrl allows Suno ecosystem domains and rejects unknown popup destinations', () => {
  assert.equal(isAllowedExternalUrl('https://sunov2.vercel.app/app'), true);
  assert.equal(isAllowedExternalUrl('https://www.themoviedb.org/movie/438631'), true);
  assert.equal(isAllowedExternalUrl('https://anilist.co/anime/1535'), true);
  assert.equal(isAllowedExternalUrl('https://evil-popup.example/ad'), false);
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
});

test('AntiRedirectGuard defaults to sandboxed strictFrameMode ON and tracks blocked popups', () => {
  const guard = new AntiRedirectGuard();
  assert.equal(guard.strictFrameMode, true);
  guard.recordBlock('Blocked popup / window.open', 'https://ad.example/pop');
  guard.setNavigationLock(true);
  const snap = guard.getSnapshot();
  assert.equal(snap.blockedCount, 1);
  assert.equal(snap.navigationLock, true);
  assert.equal(snap.strictFrameMode, true);
  assert.equal(snap.recentEvents[0].reason, 'Blocked popup / window.open');
});

test('normalizeCinemetaItem extracts moviedb_id, logo, backdrop, trailers, and multi-season episodes', () => {
  const movie = normalizeCinemetaItem({
    id: 'tt1375666',
    imdb_id: 'tt1375666',
    moviedb_id: 27205,
    type: 'movie',
    name: 'Inception',
    year: '2010',
    imdbRating: '8.8',
    genres: ['Action', 'Sci-Fi'],
    director: ['Christopher Nolan'],
    cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt'],
    poster: 'https://images.metahub.space/poster/medium/tt1375666/img',
    background: 'https://images.metahub.space/background/medium/tt1375666/img',
    logo: 'https://images.metahub.space/logo/medium/tt1375666/img',
    trailers: [{ source: 'YoHD9XEInc0', type: 'Trailer' }],
  });

  assert.equal(movie.tmdbId, '27205');
  assert.equal(movie.id, 'movie:27205');
  assert.equal(getMediaKey(movie), 'movie:27205');
  assert.equal(movie.trailerId, 'YoHD9XEInc0');
  assert.equal(movie.logo, 'https://images.metahub.space/logo/medium/tt1375666/img');

  const series = normalizeCinemetaItem(
    {
      id: 'tt0903747',
      moviedb_id: 1396,
      type: 'series',
      name: 'Breaking Bad',
      releaseInfo: '2008-2013',
      videos: [
        { season: 1, episode: 1, name: 'Pilot', thumbnail: 'https://episodes.metahub.space/tt0903747/1/1/w780.jpg' },
        { season: 1, episode: 2, name: "Cat's in the Bag..." },
        { season: 2, episode: 1, name: 'Seven Thirty-Seven' },
      ],
    },
    'series'
  );

  assert.equal(series.mediaType, 'tv');
  assert.equal(series.tmdbId, '1396');
  assert.equal(series.seasonsList.length, 2);
  assert.equal(series.seasonsList[0].episodes[0].name, 'Pilot');
  assert.equal(series.seasonsList[1].episodeCount, 1);

  const searchHit = normalizeCinemetaItem({ id: 'tt1160419', type: 'movie', name: 'Dune' });
  assert.equal(getMediaKey(searchHit), 'movie:imdb:tt1160419');

  assert.ok(searchLocalItems('interstellar').length >= 1);
});
