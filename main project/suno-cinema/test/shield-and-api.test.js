import test from 'node:test';
import assert from 'node:assert/strict';
import { AntiRedirectGuard, isAllowedExternalUrl } from '../src/utils/anti-redirect.js';
import { normalizeCinemetaItem, searchLocalItems, fetchLanguageCatalog } from '../src/utils/client-api.js';
import { getMediaKey } from '../src/utils/storage.js';
import { renderDesktopWideCard, renderDesktopTop10Card, renderShelf, computeMatchPercent, renderSkeletonShelf } from '../src/components/cards.js';
import { renderDesktopBillboard, renderDesktopFooter, renderDesktopDetailModal } from '../src/components/showcase.js';
import { renderCategoriesSheet, renderNotificationsSheet } from '../src/components/modals.js';
import { renderSunoCinemaDesktopWordmark } from '../src/components/icons.js';

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

test('desktop UI renderers and language catalog maintain Suno Cinema branding', async () => {
  const sampleItem = {
    id: 'movie:157336',
    tmdbId: '157336',
    imdbId: 'tt0816692',
    mediaType: 'movie',
    title: 'Interstellar',
    year: 2014,
    runtime: '2h 49m',
    genres: ['Sci-Fi', 'Drama'],
    cast: ['Matthew McConaughey', 'Anne Hathaway'],
    overview: 'Explorers travel through a wormhole in space.',
    poster: 'https://images.metahub.space/poster/medium/tt0816692/img',
    backdrop: 'https://images.metahub.space/background/medium/tt0816692/img',
  };

  const wordmark = renderSunoCinemaDesktopWordmark();
  assert.ok(wordmark.includes('SUNO CINEMA'));
  assert.equal(/netflix/i.test(wordmark), false);

  const hero = renderDesktopBillboard([sampleItem], 0, { myListSet: new Set(['movie:157336']) });
  assert.ok(hero.includes('dk-hero-card'));
  assert.ok(hero.includes('More Info'));
  assert.ok(hero.includes('Matthew McConaughey'));

  const card = renderDesktopWideCard(sampleItem, {
    top10: true,
    recentlyAdded: true,
    progress: { currentTime: 1200, duration: 3600 },
    inMyList: true,
    isLiked: false,
  });
  assert.ok(card.includes('dk-hover-panel'));
  assert.ok(card.includes('dk-progress-bar'));
  assert.ok(card.includes('Recently Added'));

  const top10 = renderDesktopTop10Card(sampleItem, 1, { recentlyAdded: true });
  assert.ok(top10.includes('dk-top10-num'));

  const shelf = renderShelf({ id: 's1', title: 'Top Picks', items: [sampleItem], kind: 'dk-wide' });
  assert.ok(shelf.includes('data-scroll-row="s1"'));

  const footer = renderDesktopFooter();
  assert.ok(footer.includes('Suno Cinema'));
  assert.equal(/netflix/i.test(footer), false);

  const regional = await fetchLanguageCatalog('South Indian');
  assert.ok(Array.isArray(regional) && regional.length >= 1);

  assert.ok(computeMatchPercent(sampleItem) >= 82 && computeMatchPercent(sampleItem) <= 99);
  assert.ok(top10.includes('<svg'));
  assert.ok(shelf.includes('dk-row-handle') && shelf.includes('dk-carousel-wrap'));

  const splitCard = renderDesktopWideCard(sampleItem, { splitBadge: true });
  assert.ok(splitCard.includes('dk-badge-split') && splitCard.includes('dk-match-score'));

  const skel = renderSkeletonShelf({ count: 4, desktop: true });
  assert.ok(skel.includes('sk-shimmer'));

  const dkModal = renderDesktopDetailModal({ item: sampleItem, relatedItems: [sampleItem] });
  assert.ok(dkModal.includes('dk-detail-modal') && dkModal.includes('More Like This'));

  const dkCat = renderCategoriesSheet('Action', { desktop: true });
  const mobCat = renderCategoriesSheet('Action', { desktop: false });
  assert.ok(dkCat.includes('dk-genres-popover') && mobCat.includes('android-cat-overlay'));

  const dkNotif = renderNotificationsSheet([sampleItem], { desktop: true });
  const mobNotif = renderNotificationsSheet([sampleItem], { desktop: false });
  assert.ok(dkNotif.includes('dk-notif-popover') && mobNotif.includes('sheet-grab-bar'));
});
