import {
  buildVidriftEmbedUrl,
  parseDirectTarget,
  parseVidriftMessage,
  buildVidriftCommand,
  VIDRIFT_ORIGIN,
} from './utils/vidrift.js';
import { antiRedirectGuard } from './utils/anti-redirect.js';
import {
  LIKED_COLLECTION_ID,
  MY_LIST_COLLECTION_ID,
  loadAppearanceSettings,
  saveAppearanceSettings,
  loadPlayerPrefs,
  savePlayerPrefs,
  loadProfile,
  saveProfile,
  getMediaKey,
  loadProgressMap,
  saveMediaProgress,
  removeMediaProgress,
  loadCollections,
  saveCollections,
  loadDownloads,
  saveDownloads,
  loadSearchHistory,
  rememberSearch,
  forgetSearch,
} from './utils/storage.js';
import {
  svgIcon,
  renderSunoRibbonSvg,
  renderSunoMascotSvg,
} from './components/icons.js';
import {
  escapeHtml,
  resolveArtUrl,
  attachFallbackImgAttr,
  formatTime,
  renderPosterCard,
  renderShelf,
} from './components/cards.js';
import {
  renderAndroidBillboard,
  renderDetailView,
} from './components/showcase.js';
import {
  renderSettingsSheet,
  renderCategoriesSheet,
  renderNotificationsSheet,
  renderContinueMenuSheet,
  renderQuickLaunchSheet,
} from './components/modals.js';
import {
  BROWSE_GENRES,
  loadCatalogData,
  loadTrendingAnime,
  fetchCinemetaCatalog,
  resolveFullMetadata,
  searchAllMedia,
  fetchTvSeasonsData,
} from './utils/client-api.js';

const rootEl = document.getElementById('app');

const state = {
  catalog: [],
  catalogMap: new Map(),
  liveMovies: [],
  liveSeries: [],
  liveAnimeTrending: [],
  discoverItems: [],
  discoverLoading: false,
  discoverSkip: 0,
  discoverAnimePage: 1,
  discoverType: 'all',
  discoverGenre: 'All Genres',
  discoverYear: 'all',
  discoverMinRating: 0,
  discoverSort: 'trending',
  homeFilter: 'all', // 'all' | 'tv' | 'movie' | 'anime' | 'hot'
  tab: 'home', // 'home' | 'clips' | 'discover' | 'search' | 'mysuno' | 'detail' | 'downloads'
  prevTab: 'home',
  detailKey: null,
  detailTab: 'episodes',
  detailTrailerPlaying: false,
  detailTrailerMuted: true,
  activeClipTrailerKey: null,
  searchResults: [],
  searchLoading: false,
  searchQuery: '',
  appearance: loadAppearanceSettings(),
  prefs: loadPlayerPrefs(),
  profile: loadProfile(),
  progressMap: {},
  collections: loadCollections(),
  downloads: loadDownloads(),
  searchHistory: loadSearchHistory(),
  shield: antiRedirectGuard.getSnapshot(),
  modal: null, // 'settings' | 'categories' | 'notifications' | 'cwmenu' | 'quicklaunch' | null
  cwMenuKey: null,
  activeItem: null,
  activeSeason: 1,
  activeEpisode: 1,
  playerOpen: false,
  livePlayback: { currentTime: 0, duration: 0 },
  seasonsCache: new Map(),
  toast: '',
};

let toastTimer = null;
let searchDebounce = null;

function showToast(msg) {
  state.toast = msg;
  renderToastOnly();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = '';
    renderToastOnly();
  }, 2400);
}

function renderToastOnly() {
  let el = document.getElementById('suno-toast');
  if (!state.toast) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'suno-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = state.toast;
}

function registerItems(items) {
  for (const item of items || []) {
    if (!item) continue;
    const key = getMediaKey(item);
    if (!key) continue;
    const prev = state.catalogMap.get(key);
    const merged = prev
      ? {
          ...prev,
          ...item,
          id: key,
          poster: item.poster || prev.poster,
          backdrop: item.backdrop || prev.backdrop,
          logo: item.logo || prev.logo,
          trailerId: item.trailerId || prev.trailerId,
          seasonsList: item.seasonsList || prev.seasonsList,
          cast: item.cast?.length ? item.cast : prev.cast,
        }
      : { ...item, id: key };
    state.catalogMap.set(key, merged);
    if (item.imdbId && item.tmdbId) {
      state.catalogMap.set(`${item.mediaType}:imdb:${item.imdbId}`, merged);
    }
  }
}

function getItemByKey(key) {
  if (state.catalogMap.has(key)) return state.catalogMap.get(key);
  const prog = state.progressMap[key]?.item;
  if (prog) {
    state.catalogMap.set(key, prog);
    return prog;
  }
  return null;
}

function getCollectionSet(colId) {
  const col = state.collections.find((c) => c.id === colId);
  return new Set(col?.items || []);
}

function toggleCollectionItem(colId, key, addedMsg, removedMsg) {
  const col = state.collections.find((c) => c.id === colId);
  if (!col) return;
  const exists = col.items.includes(key);
  col.items = exists ? col.items.filter((x) => x !== key) : [key, ...col.items];
  state.collections = saveCollections([...state.collections]);
  showToast(exists ? removedMsg : addedMsg);
  render();
}

function toggleDownload(key) {
  const exists = state.downloads.includes(key);
  state.downloads = saveDownloads(
    exists ? state.downloads.filter((x) => x !== key) : [key, ...state.downloads]
  );
  showToast(exists ? 'Removed from Downloads' : 'Saved to Downloads queue');
  render();
}

function getAllKnownPool() {
  const seen = new Set();
  const list = [];
  for (const src of [state.catalog, state.liveMovies, state.liveSeries, state.liveAnimeTrending]) {
    for (const item of src) {
      const k = getMediaKey(item);
      if (k && !seen.has(k)) {
        seen.add(k);
        list.push(state.catalogMap.get(k) || item);
      }
    }
  }
  return list;
}

function getCurrentEmbedUrl() {
  if (!state.activeItem) return '';
  if (state.activeItem.mediaType !== 'anime' && !state.activeItem.tmdbId) return '';
  return buildVidriftEmbedUrl(state.activeItem, {
    themeId: state.appearance.theme,
    autoplay: state.prefs.autoplay,
    sub: state.prefs.sub,
    dub: state.prefs.dub,
    uiScale: state.prefs.uiScale,
    season: state.activeSeason,
    episode: state.activeEpisode,
  });
}

function sendPlayerCommand(action, payload = {}) {
  const iframe = document.getElementById('vidrift-player');
  if (!iframe || !iframe.contentWindow) return false;
  iframe.contentWindow.postMessage(buildVidriftCommand(action, payload), VIDRIFT_ORIGIN);
  return true;
}

async function launchStream(rawItem, { season, episode, resumeSeconds } = {}) {
  if (!rawItem) return;
  let item = rawItem;
  if (item.mediaType !== 'anime' && !item.tmdbId) {
    showToast(`Loading "${item.title}" stream...`);
    item = await resolveFullMetadata(item);
    registerItems([item]);
  }
  if (item.mediaType !== 'anime' && !item.tmdbId) {
    showToast('Stream ID unavailable for this entry — try Quick Launch');
    return;
  }

  const key = getMediaKey(item);
  registerItems([item]);
  const saved = state.progressMap[key];
  const resolvedSeason = season ?? saved?.season ?? item.season ?? 1;
  const resolvedEpisode = episode ?? saved?.episode ?? item.episode ?? 1;

  state.activeItem = getItemByKey(key) || item;
  state.activeSeason = resolvedSeason;
  state.activeEpisode = resolvedEpisode;
  state.playerOpen = true;
  state.modal = null;
  antiRedirectGuard.setTheaterActive(true);
  state.livePlayback = {
    currentTime: saved?.currentTime || 0,
    duration: saved?.duration || 0,
  };

  if (item.mediaType === 'tv' && (item.tmdbId || item.imdbId)) {
    loadTvSeasons(item.tmdbId, item.imdbId);
  }

  state.progressMap = saveMediaProgress(state.activeItem, {
    season: resolvedSeason,
    episode: resolvedEpisode,
    currentTime: saved?.currentTime || 0,
    duration: saved?.duration || 0,
  });

  render();

  const targetResume = resumeSeconds ?? (saved?.currentTime > 15 ? Math.floor(saved.currentTime) : 0);
  if (targetResume > 0) {
    setTimeout(() => {
      sendPlayerCommand('resume', { currentTime: targetResume });
      showToast(`Resumed at ${formatTime(targetResume)}`);
    }, 1100);
  }
}

async function openDetailView(key) {
  if (state.tab !== 'detail') state.prevTab = state.tab;
  state.detailKey = key;
  state.tab = 'detail';
  state.detailTrailerPlaying = false;
  state.detailTrailerMuted = true;
  state.modal = null;

  let item = getItemByKey(key);
  const saved = state.progressMap[key];
  state.activeSeason = saved?.season || 1;
  state.activeEpisode = saved?.episode || 1;
  state.detailTab = item?.mediaType === 'movie' ? 'more' : 'episodes';

  if (
    item &&
    item.mediaType !== 'anime' &&
    item.imdbId &&
    (!item.tmdbId || !item.cast?.length || (item.mediaType === 'tv' && !item.seasonsList))
  ) {
    render();
    const hydrated = await resolveFullMetadata(item);
    registerItems([hydrated]);
    state.detailKey = getMediaKey(hydrated);
    item = hydrated;
  }

  if (item?.mediaType === 'tv' && (item.tmdbId || item.imdbId)) {
    loadTvSeasons(item.tmdbId, item.imdbId);
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
  render();
}

async function loadTvSeasons(tmdbId, imdbId = '') {
  const cacheKey = String(tmdbId || imdbId);
  if (!cacheKey || state.seasonsCache.has(cacheKey)) return;
  const seasons = await fetchTvSeasonsData(tmdbId, state.prefs.tmdbApiKey, imdbId);
  if (Array.isArray(seasons) && seasons.length > 0) {
    state.seasonsCache.set(cacheKey, seasons);
    if (state.tab === 'detail' || state.playerOpen) render();
  }
}

async function refreshDiscoverFeed({ reset = true } = {}) {
  state.discoverLoading = true;
  if (reset) {
    state.discoverSkip = 0;
    state.discoverAnimePage = 1;
  }
  render();

  try {
    const genre = state.discoverGenre;
    const type = state.discoverType;
    const tasks = [];

    if (type === 'all' || type === 'movie') {
      tasks.push(fetchCinemetaCatalog('movie', { genre, skip: state.discoverSkip }).catch(() => []));
    }
    if (type === 'all' || type === 'tv') {
      tasks.push(fetchCinemetaCatalog('series', { genre, skip: state.discoverSkip }).catch(() => []));
    }
    if (type === 'all' || type === 'anime') {
      tasks.push(loadTrendingAnime({ genre, page: state.discoverAnimePage }).catch(() => []));
    }

    const incoming = (await Promise.all(tasks)).flat();
    registerItems(incoming);

    if (reset) {
      const curatedMatching = state.catalog.filter((item) => {
        if (type !== 'all' && item.mediaType !== type) return false;
        if (genre !== 'All Genres' && !(item.genres || []).some((g) => g.toLowerCase() === genre.toLowerCase())) {
          return false;
        }
        return true;
      });
      const seen = new Set();
      state.discoverItems = [...incoming, ...curatedMatching].filter((x) => {
        const k = getMediaKey(x);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    } else {
      const seen = new Set(state.discoverItems.map((x) => getMediaKey(x)));
      state.discoverItems = [
        ...state.discoverItems,
        ...incoming.filter((x) => {
          const k = getMediaKey(x);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }),
      ];
    }
  } finally {
    state.discoverLoading = false;
    render();
  }
}

async function shareItem(item) {
  if (!item) return;
  const url = window.location.href.split('#')[0];
  const text = `Watch "${item.title}" on Suno Cinema`;
  if (navigator.share) {
    try {
      await navigator.share({ title: item.title, text, url });
      return;
    } catch {}
  }
  try {
    await navigator.clipboard.writeText(`${text} — ${url}`);
    showToast(`Copied share link for "${item.title}"`);
  } catch {
    showToast(`Ready to share "${item.title}"`);
  }
}

function renderTopHeader({ leftHtml, rightExtras = '' }) {
  return `<header class="sc-topbar">
    <div class="sc-topbar-left">${leftHtml}</div>
    <div class="sc-topbar-actions">
      ${rightExtras}
      <button type="button" class="icon-btn" id="open-settings-btn" title="Shield, Cast & Theme" aria-label="Cast and Settings">
        ${svgIcon('cast', 21)}
      </button>
      <button type="button" class="icon-btn" id="open-downloads-btn" title="Downloads" aria-label="Downloads">
        ${svgIcon('download', 21)}
      </button>
      <button type="button" class="icon-btn" id="open-notifications-btn" title="Notifications" aria-label="Notifications">
        ${svgIcon('bell', 21)}
        <span class="notif-badge">4</span>
      </button>
    </div>
  </header>`;
}

function renderHomeTab() {
  const myListSet = getCollectionSet(MY_LIST_COLLECTION_ID);
  const pool = getAllKnownPool();

  const matchesFilter = (item) => {
    if (state.homeFilter === 'tv') return item.mediaType === 'tv';
    if (state.homeFilter === 'movie') return item.mediaType === 'movie';
    if (state.homeFilter === 'anime') return item.mediaType === 'anime';
    return true;
  };

  // Spotlight billboard (defaults to Rocket Singh like screenshot 5, or first filtered title)
  const rocketSingh = getItemByKey('movie:26815');
  const spotlightPool = pool.filter(matchesFilter);
  const featured =
    state.homeFilter === 'all' && rocketSingh
      ? rocketSingh
      : spotlightPool.find((x) => x.poster) || spotlightPool[0];

  const southIndia = state.catalog.filter((x) => x.regionTag === 'south-india' && matchesFilter(x));
  const indiaMoviesShows = state.catalog.filter(
    (x) => (x.regionTag === 'india' || x.country?.includes('India')) && matchesFilter(x)
  );
  const englishMovies = [
    ...state.catalog.filter(
      (x) => x.mediaType === 'movie' && x.regionTag !== 'south-india' && x.regionTag !== 'india'
    ),
    ...state.liveMovies,
  ].filter(matchesFilter);

  const continueEntries = Object.values(state.progressMap)
    .filter((e) => e?.item && e.currentTime > 0 && matchesFilter(e.item))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const seriesShelf = [
    ...state.catalog.filter((x) => x.mediaType === 'tv'),
    ...state.liveSeries,
  ].filter(matchesFilter);

  const animeShelf = (state.liveAnimeTrending.length
    ? state.liveAnimeTrending
    : state.catalog.filter((x) => x.mediaType === 'anime')
  ).filter(matchesFilter);

  const chips = [
    { id: 'tv', label: 'Shows' },
    { id: 'movie', label: 'Movies' },
    { id: 'anime', label: 'Anime' },
    { id: 'hot', label: 'New & Hot' },
  ];

  return `
    ${renderTopHeader({
      leftHtml: `
        <button type="button" style="display:inline-flex;align-items:center;gap:8px;" data-reset-home="true">
          ${renderSunoRibbonSvg(22, 26)}
          <span class="sc-topbar-title">Home</span>
        </button>
      `,
    })}

    <div class="pill-chips-row">
      ${chips
        .map(
          (c) => `<button type="button" class="outline-chip ${
            state.homeFilter === c.id ? 'is-active' : ''
          }" data-home-filter="${c.id}">${c.label}</button>`
        )
        .join('')}
      <button type="button" class="outline-chip" id="open-categories-btn">
        Categories ${svgIcon('chevronDown', 14)}
      </button>
    </div>

    ${renderAndroidBillboard(featured, {
      inMyList: featured ? myListSet.has(getMediaKey(featured)) : false,
    })}

    ${renderShelf({
      id: 'south-india',
      title: 'South Indian Cinema',
      items: southIndia.slice(0, 14),
      top10Indices: new Set([1, 2]),
      recentIndices: new Set([1, 2]),
    })}

    ${renderShelf({
      id: 'india-cinema',
      title: 'Movies & TV Shows set in India',
      items: indiaMoviesShows.slice(0, 16),
      top10Indices: new Set([0, 3]),
      recentIndices: new Set([1]),
    })}

    ${renderShelf({
      id: 'english-movies',
      title: 'English Movies',
      items: englishMovies.slice(0, 20),
      top10Indices: new Set([3, 5]),
      recentIndices: new Set([1, 3]),
    })}

    ${
      continueEntries.length > 0
        ? renderShelf({
            id: 'home-cw',
            title: 'Continue Watching',
            items: continueEntries.slice(0, 10),
            kind: 'continue',
          })
        : ''
    }

    ${renderShelf({
      id: 'series-row',
      title: 'Trending TV Series',
      items: seriesShelf.slice(0, 20),
      top10Indices: new Set([0, 2]),
      recentIndices: new Set([0]),
    })}

    ${renderShelf({
      id: 'anime-row',
      title: 'Anime & Soundtracks',
      items: animeShelf.slice(0, 20),
      top10Indices: new Set([0, 1]),
    })}
  `;
}

function renderClipsTab() {
  const pool = getAllKnownPool().filter((x) => x.trailerId || x.backdrop);
  const myListSet = getCollectionSet(MY_LIST_COLLECTION_ID);

  return `
    ${renderTopHeader({
      leftHtml: `
        ${renderSunoRibbonSvg(22, 26)}
        <span class="sc-topbar-title">Clips</span>
      `,
    })}
    <div class="clips-feed">
      ${pool.slice(0, 14).map((item) => {
        const key = getMediaKey(item);
        const playingClip = state.activeClipTrailerKey === key && item.trailerId;
        const inList = myListSet.has(key);
        return `<article class="clip-card">
          <div class="clip-media">
            ${
              playingClip
                ? `<iframe
                    src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.trailerId)}?autoplay=1&rel=0"
                    title="${escapeHtml(item.title)}"
                    allow="autoplay; encrypted-media; fullscreen"
                    allowfullscreen
                    referrerpolicy="strict-origin-when-cross-origin"
                  ></iframe>`
                : `<img src="${escapeHtml(resolveArtUrl(item, 'wide'))}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
                    item,
                    'wide'
                  )} />`
            }
          </div>
          <div class="clip-body">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
              <div>
                <div style="font-size:16px;font-weight:700;">${escapeHtml(item.title)}</div>
                <div class="dim" style="font-size:12px;margin-top:2px;">${escapeHtml(
                  [item.year, item.rating ? `★ ${item.rating}` : '', ...(item.genres || []).slice(0, 2)]
                    .filter(Boolean)
                    .join(' • ')
                )}</div>
              </div>
              ${
                item.trailerId
                  ? `<button type="button" class="outline-chip" data-play-clip="${escapeHtml(key)}">
                      ${svgIcon('trailer', 14)} ${playingClip ? 'Poster' : 'Preview'}
                    </button>`
                  : ''
              }
            </div>
            <p class="dim" style="font-size:12px;line-height:1.4;">${escapeHtml(
              (item.overview || '').slice(0, 140)
            )}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-top:2px;">
              <button type="button" class="btn-white" style="height:36px;font-size:13px;" data-play-key="${escapeHtml(key)}">
                ${svgIcon('play', 15)} Play
              </button>
              <button type="button" class="btn-dark" style="height:36px;font-size:13px;" data-toggle-mylist="${escapeHtml(key)}">
                ${svgIcon(inList ? 'check' : 'plus', 15)} My List
              </button>
              <button type="button" class="btn-dark" style="height:36px;padding:0 12px;" data-share-key="${escapeHtml(key)}" aria-label="Share">
                ${svgIcon('share', 15)}
              </button>
            </div>
          </div>
        </article>`;
      }).join('')}
    </div>
  `;
}

function applyDiscoverFilters(items) {
  const filtered = items.filter((item) => {
    if (state.discoverType !== 'all' && item.mediaType !== state.discoverType) return false;
    if (state.discoverGenre !== 'All Genres') {
      const has = (item.genres || []).some((g) => g.toLowerCase() === state.discoverGenre.toLowerCase());
      if (!has) return false;
    }
    const y = Number(item.year || 0);
    if (state.discoverYear === '2026' && y !== 2026) return false;
    if (state.discoverYear === '2025' && y !== 2025) return false;
    if (state.discoverYear === '2024' && y !== 2024) return false;
    if (state.discoverYear === '2020s' && (y < 2020 || y > 2029)) return false;
    if (state.discoverYear === '2010s' && (y < 2010 || y > 2019)) return false;
    if (state.discoverYear === 'classic' && (y === 0 || y >= 2010)) return false;
    if (state.discoverMinRating > 0 && Number(item.rating || 0) < state.discoverMinRating) return false;
    return true;
  });

  if (state.discoverSort === 'rating') {
    return [...filtered].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
  }
  if (state.discoverSort === 'year') {
    return [...filtered].sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  }
  return filtered;
}

function renderDiscoverTab() {
  const baseList = state.discoverItems.length ? state.discoverItems : getAllKnownPool();
  const visible = applyDiscoverFilters(baseList);

  return `
    ${renderTopHeader({
      leftHtml: `
        ${renderSunoRibbonSvg(22, 26)}
        <span class="sc-topbar-title">Discover</span>
      `,
      rightExtras: `
        <button type="button" class="icon-btn" id="open-quicklaunch-btn" title="Stream by TMDB / AniList ID" aria-label="Quick Launch">
          ${svgIcon('link', 19)}
        </button>
      `,
    })}

    <div class="discover-bar">
      <select id="disc-type" class="field-select" aria-label="Type">
        <option value="all" ${state.discoverType === 'all' ? 'selected' : ''}>All Types</option>
        <option value="movie" ${state.discoverType === 'movie' ? 'selected' : ''}>Movies</option>
        <option value="tv" ${state.discoverType === 'tv' ? 'selected' : ''}>TV Shows</option>
        <option value="anime" ${state.discoverType === 'anime' ? 'selected' : ''}>Anime</option>
      </select>
      <select id="disc-genre" class="field-select" aria-label="Genre">
        ${BROWSE_GENRES.map(
          (g) => `<option value="${escapeHtml(g)}" ${
            state.discoverGenre === g ? 'selected' : ''
          }>${escapeHtml(g)}</option>`
        ).join('')}
      </select>
      <select id="disc-year" class="field-select" aria-label="Year">
        <option value="all" ${state.discoverYear === 'all' ? 'selected' : ''}>All Years</option>
        <option value="2026" ${state.discoverYear === '2026' ? 'selected' : ''}>2026</option>
        <option value="2025" ${state.discoverYear === '2025' ? 'selected' : ''}>2025</option>
        <option value="2024" ${state.discoverYear === '2024' ? 'selected' : ''}>2024</option>
        <option value="2020s" ${state.discoverYear === '2020s' ? 'selected' : ''}>2020s</option>
        <option value="2010s" ${state.discoverYear === '2010s' ? 'selected' : ''}>2010s</option>
        <option value="classic" ${state.discoverYear === 'classic' ? 'selected' : ''}>Classics</option>
      </select>
      <select id="disc-sort" class="field-select" aria-label="Sort">
        <option value="trending" ${state.discoverSort === 'trending' ? 'selected' : ''}>Trending</option>
        <option value="rating" ${state.discoverSort === 'rating' ? 'selected' : ''}>Top Rated</option>
        <option value="year" ${state.discoverSort === 'year' ? 'selected' : ''}>Newest</option>
      </select>
    </div>

    ${
      state.discoverLoading && visible.length === 0
        ? `<p class="dim" style="padding:18px 14px;">Loading free catalog from Cinemeta &amp; AniList...</p>`
        : `<div class="poster-grid-3">${visible.map((item) => renderPosterCard(item)).join('')}</div>`
    }

    <div style="display:flex;justify-content:center;padding:8px 14px 16px;">
      <button type="button" class="btn-dark" id="discover-load-more-btn" style="width:100%;max-width:340px;" ${
        state.discoverLoading ? 'disabled' : ''
      }>
        ${state.discoverLoading ? 'Loading more...' : 'Load More Titles'}
      </button>
    </div>
  `;
}

function renderSearchTab() {
  const direct = parseDirectTarget(state.searchQuery);
  const topRecommended = getAllKnownPool().slice(0, 14);

  return `
    <div class="search-bar-sticky">
      <button type="button" class="icon-btn" data-nav-tab="home" aria-label="Back">
        ${svgIcon('back', 21)}
      </button>
      <form class="search-input-pill" id="global-search-form">
        ${svgIcon('search', 18)}
        <input
          id="global-search-input"
          type="text"
          placeholder="Search movies, shows, anime, or TMDB ID..."
          value="${escapeHtml(state.searchQuery)}"
          autocomplete="off"
        />
        ${
          state.searchQuery
            ? `<button type="button" class="icon-btn" id="clear-search-btn" style="width:28px;height:28px;">
                ${svgIcon('close', 16)}
              </button>`
            : ''
        }
      </form>
    </div>

    ${
      direct
        ? `<div style="padding:4px 14px 10px;">
            <button type="button" class="btn-white" style="width:100%;" data-launch-direct="true">
              ${svgIcon('play', 16)} Stream ${escapeHtml(direct.mediaType.toUpperCase())} #${escapeHtml(
            direct.tmdbId || direct.anilistId
          )} via VidRift
            </button>
          </div>`
        : ''
    }

    ${
      !state.searchQuery.trim()
        ? `<div style="padding:4px 0 12px;">
            <h2 class="nf-shelf-title" style="padding:6px 14px 10px;">Recommended Shows &amp; Movies</h2>
            ${topRecommended
              .map((item) => {
                const key = getMediaKey(item);
                return `<div class="top-search-row" data-open-detail="${escapeHtml(key)}">
                  <div class="top-search-thumb">
                    <img src="${escapeHtml(resolveArtUrl(item, 'wide'))}" alt="" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
                  item,
                  'wide'
                )} />
                  </div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(
                      item.title
                    )}</div>
                    <div class="dim" style="font-size:12px;">${escapeHtml(item.year || '')} • ${escapeHtml(
                  item.mediaType.toUpperCase()
                )}</div>
                  </div>
                  <button type="button" class="icon-btn" data-play-key="${escapeHtml(key)}" onclick="event.stopPropagation()" aria-label="Play ${escapeHtml(
                  item.title
                )}">
                    ${svgIcon('play', 18)}
                  </button>
                </div>`;
              })
              .join('')}
          </div>`
        : state.searchLoading
        ? `<p class="dim" style="padding:20px 14px;">Searching free Cinemeta &amp; AniList...</p>`
        : state.searchResults.length > 0
        ? `<div>
            <h2 class="nf-shelf-title" style="padding:6px 14px 4px;">Top Results</h2>
            <div class="poster-grid-3">${state.searchResults.map((x) => renderPosterCard(x)).join('')}</div>
          </div>`
        : `<div style="padding:22px 14px;display:flex;flex-direction:column;gap:12px;">
            <p class="dim">No exact matches found for "${escapeHtml(state.searchQuery)}".</p>
            <button type="button" class="btn-dark" id="open-quicklaunch-btn">Launch by TMDB / AniList ID</button>
          </div>`
    }
  `;
}

function renderMySunoTab() {
  const continueEntries = Object.values(state.progressMap)
    .filter((e) => e?.item && e.currentTime > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const likedItems = Array.from(getCollectionSet(LIKED_COLLECTION_ID))
    .map((k) => getItemByKey(k))
    .filter(Boolean);

  const myListItems = Array.from(getCollectionSet(MY_LIST_COLLECTION_ID))
    .map((k) => getItemByKey(k))
    .filter(Boolean);

  return `
    ${renderTopHeader({
      leftHtml: `
        <button type="button" style="display:inline-flex;align-items:center;gap:10px;" id="open-settings-profile-btn">
          ${renderSunoMascotSvg(28)}
          <span class="sc-topbar-title">${escapeHtml(state.profile.name || 'Ansh')} ${svgIcon('chevronDown', 16)}</span>
        </button>
      `,
    })}

    <button type="button" class="downloads-banner" id="open-downloads-card">
      <span style="padding-top:2px;">${svgIcon('download', 22)}</span>
      <div class="downloads-banner-body">
        <div class="downloads-banner-title">
          <span>Downloads</span>
          ${svgIcon('chevronRight', 20)}
        </div>
        <div class="downloads-banner-sub">${
          state.downloads.length > 0
            ? `${state.downloads.length} saved title(s) in your offline &amp; quick-watch queue.`
            : 'Movies and shows that you download appear here.'
        }</div>
      </div>
    </button>

    ${renderShelf({
      id: 'mysuno-cw',
      title: 'Continue Watching',
      items: continueEntries,
      kind: 'continue',
    })}

    ${renderShelf({
      id: 'mysuno-liked',
      title: "TV Shows & Movies You've Liked",
      items: likedItems,
      kind: 'liked',
    })}

    ${renderShelf({
      id: 'mysuno-mylist',
      title: 'My List',
      items: myListItems,
      seeAllAttr: 'data-nav-tab="discover"',
    })}
  `;
}

function renderDownloadsView() {
  const downloadedItems = state.downloads.map((k) => getItemByKey(k)).filter(Boolean);
  const collageLeft = getItemByKey('movie:157336') || state.catalog[0];
  const collageCenter = getItemByKey('movie:26815') || state.catalog[1];
  const collageRight = getItemByKey('movie:1163194') || state.catalog[2];

  return `
    ${renderTopHeader({
      leftHtml: `
        <button type="button" class="icon-btn" id="downloads-back-btn" aria-label="Back">
          ${svgIcon('back', 22)}
        </button>
        <span class="sc-topbar-title">Downloads</span>
      `,
    })}

    <div class="downloads-page">
      <button type="button" id="toggle-smart-downloads-btn" style="display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;padding:4px 0;">
        ${svgIcon('settings', 20)}
        <span>Smart Downloads ${state.profile.smartDownloads ? '(On)' : ''}</span>
      </button>

      <div>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px;">Turn on Downloads for You</h2>
        <p class="dim" style="font-size:14px;line-height:1.45;">
          We'll queue movies and shows just for you, so you'll always have something ready to watch.
        </p>
      </div>

      <div class="collage-wrap">
        <div class="collage-circle"></div>
        ${
          collageLeft
            ? `<div class="collage-poster left"><img src="${escapeHtml(resolveArtUrl(collageLeft, 'poster'))}" alt="" referrerpolicy="no-referrer" /></div>`
            : ''
        }
        ${
          collageCenter
            ? `<div class="collage-poster center"><img src="${escapeHtml(resolveArtUrl(collageCenter, 'poster'))}" alt="" referrerpolicy="no-referrer" /></div>`
            : ''
        }
        ${
          collageRight
            ? `<div class="collage-poster right"><img src="${escapeHtml(resolveArtUrl(collageRight, 'poster'))}" alt="" referrerpolicy="no-referrer" /></div>`
            : ''
        }
      </div>

      <button type="button" class="btn-blue" id="setup-smart-dl-btn" style="width:100%;">
        ${state.profile.smartDownloads ? 'Smart Queue Active ✓' : 'Set up'}
      </button>
      <button type="button" class="btn-dark" data-nav-tab="discover" style="width:100%;height:44px;">
        Find More to Download
      </button>

      ${
        downloadedItems.length > 0
          ? `<div style="margin-top:8px;">
              <h3 style="font-size:16px;font-weight:700;margin-bottom:10px;">Saved Queue (${downloadedItems.length})</h3>
              <div class="poster-grid-3" style="padding:0;">
                ${downloadedItems.map((item) => renderPosterCard(item)).join('')}
              </div>
            </div>`
          : ''
      }
    </div>
  `;
}

function renderFloatingBottomNav() {
  const activeTab =
    state.tab === 'detail' || state.tab === 'downloads' ? state.prevTab : state.tab;
  const items = [
    { id: 'home', label: 'Home', iconHtml: svgIcon('home', 21) },
    { id: 'clips', label: 'Clips', iconHtml: svgIcon('clips', 21) },
    { id: 'discover', label: 'Discover', iconHtml: svgIcon('compass', 21) },
    { id: 'search', label: 'Search', iconHtml: svgIcon('search', 21) },
    { id: 'mysuno', label: 'My Suno', iconHtml: renderSunoMascotSvg(22) },
  ];

  return `<nav class="floating-nav-wrap" aria-label="Bottom Navigation">
    <div class="floating-nav-pill">
      ${items
        .map(
          (n) => `<button type="button" class="nav-pill-tab ${
            activeTab === n.id ? 'is-active' : ''
          }" data-nav-tab="${n.id}">
            ${n.iconHtml}
            <span>${n.label}</span>
          </button>`
        )
        .join('')}
    </div>
  </nav>`;
}

function applySandboxAttr(iframe) {
  if (!iframe) return;
  if (state.shield.strictFrameMode) {
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
  } else {
    iframe.removeAttribute('sandbox');
  }
}

function syncPlayerMount({ forceReload = false } = {}) {
  const mount = document.getElementById('player-mount');
  if (!mount) return;
  if (!state.playerOpen || !state.activeItem) {
    mount.innerHTML = '';
    return;
  }

  const embedUrl = getCurrentEmbedUrl();
  const item = state.activeItem;
  const existingFrame = document.getElementById('vidrift-player');

  if (!existingFrame) {
    mount.innerHTML = `<section class="player-fullscreen" aria-label="VidRift Player">
      <div class="player-top-bar">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <button type="button" class="icon-btn" id="close-player-btn" aria-label="Close player">
            ${svgIcon('back', 22)}
          </button>
          <div style="min-width:0;">
            <div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(
              item.title
            )}</div>
            <div class="dim" style="font-size:11px;">${
              item.mediaType === 'tv'
                ? `Season ${state.activeSeason} • Episode ${state.activeEpisode}`
                : item.mediaType === 'anime'
                ? `Episode ${state.activeEpisode}`
                : 'VidRift HD Stream'
            }</div>
          </div>
        </div>
        <button type="button" class="shield-pill ${state.shield.strictFrameMode ? 'is-warn' : ''}" id="toggle-strict-shield-btn">
          ${svgIcon('shield', 13)}
          <span>${state.shield.strictFrameMode ? 'Sandbox ON' : `Shield • ${state.shield.blockedCount}`}</span>
        </button>
      </div>

      <div class="player-frame-box">
        <iframe
          id="vidrift-player"
          src="${escapeHtml(embedUrl)}"
          title="${escapeHtml(item.title)}"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      </div>

      <div class="player-bottom-strip" id="player-bottom-strip"></div>
    </section>`;

    const frame = document.getElementById('vidrift-player');
    if (frame) {
      frame.dataset.embedUrl = embedUrl;
      applySandboxAttr(frame);
    }
  } else {
    const prevSandbox = existingFrame.hasAttribute('sandbox');
    applySandboxAttr(existingFrame);
    if (forceReload || existingFrame.dataset.embedUrl !== embedUrl || prevSandbox !== state.shield.strictFrameMode) {
      existingFrame.src = embedUrl;
      existingFrame.dataset.embedUrl = embedUrl;
    }
  }

  const strip = document.getElementById('player-bottom-strip');
  if (strip) {
    const saved = state.progressMap[getMediaKey(item)];
    strip.innerHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      ${
        saved?.currentTime > 15
          ? `<button type="button" class="outline-chip" id="cmd-resume-btn">Resume ${formatTime(saved.currentTime)}</button>`
          : ''
      }
      <button type="button" class="outline-chip" id="reload-player-btn">${svgIcon('refresh', 13)} Reload</button>
      ${
        item.mediaType !== 'movie'
          ? `<button type="button" class="outline-chip" id="next-ep-btn">Next Ep ${svgIcon('next', 13)}</button>`
          : ''
      }
      ${
        item.mediaType === 'anime'
          ? `<button type="button" class="outline-chip ${state.prefs.dub ? 'is-active' : ''}" id="toggle-dub-btn">${
              state.prefs.dub ? 'Dub ON' : 'Sub'
            }</button>`
          : ''
      }
    </div>
    <span class="dim" style="font-size:11px;">${
      state.livePlayback.currentTime > 0 ? `Synced ${formatTime(state.livePlayback.currentTime)}` : 'Zero-Ad Host'
    }</span>`;
  }
}

function renderActiveView() {
  switch (state.tab) {
    case 'clips':
      return renderClipsTab();
    case 'discover':
      return renderDiscoverTab();
    case 'search':
      return renderSearchTab();
    case 'mysuno':
      return renderMySunoTab();
    case 'downloads':
      return renderDownloadsView();
    case 'detail': {
      const item = getItemByKey(state.detailKey);
      const key = item ? getMediaKey(item) : '';
      const seasons =
        item?.mediaType === 'tv'
          ? state.seasonsCache.get(String(item.tmdbId || item.imdbId)) ||
            item.seasonsList || [{ seasonNumber: 1, name: 'Season 1', episodeCount: item.totalEpisodes || 10 }]
          : [];
      const related = getAllKnownPool().filter((x) => getMediaKey(x) !== key);
      return renderDetailView({
        item,
        inMyList: getCollectionSet(MY_LIST_COLLECTION_ID).has(key),
        isLiked: getCollectionSet(LIKED_COLLECTION_ID).has(key),
        isDownloaded: state.downloads.includes(key),
        savedProgress: state.progressMap[key],
        trailerMuted: state.detailTrailerMuted,
        trailerPlaying: state.detailTrailerPlaying,
        detailTab: state.detailTab,
        seasons,
        activeSeason: state.activeSeason,
        activeEpisode: state.activeEpisode,
        relatedItems: related,
        dubEnabled: state.prefs.dub,
      });
    }
    case 'home':
    default:
      return renderHomeTab();
  }
}

function ensureMounts() {
  if (document.getElementById('sc-root')) return;
  rootEl.innerHTML = `<div id="sc-root">
    <main id="view-mount"></main>
    <div id="nav-mount"></div>
    <div id="player-mount"></div>
    <div id="modal-mount"></div>
  </div>`;
}

function render(options = {}) {
  ensureMounts();
  const root = document.getElementById('sc-root');
  root.className = `sc-shell ${state.prefs.phoneFrameOnDesktop ? 'is-phone-preview' : ''}`;

  document.getElementById('view-mount').innerHTML = renderActiveView();
  document.getElementById('nav-mount').innerHTML = state.playerOpen ? '' : renderFloatingBottomNav();
  syncPlayerMount(options);

  const modalMount = document.getElementById('modal-mount');
  if (state.modal === 'settings') {
    modalMount.innerHTML = renderSettingsSheet({
      appearance: state.appearance,
      prefs: state.prefs,
      shield: state.shield,
      profile: state.profile,
    });
  } else if (state.modal === 'categories') {
    modalMount.innerHTML = renderCategoriesSheet(state.discoverGenre);
  } else if (state.modal === 'notifications') {
    modalMount.innerHTML = renderNotificationsSheet(getAllKnownPool());
  } else if (state.modal === 'cwmenu') {
    modalMount.innerHTML = renderContinueMenuSheet(getItemByKey(state.cwMenuKey));
  } else if (state.modal === 'quicklaunch') {
    modalMount.innerHTML = renderQuickLaunchSheet();
  } else {
    modalMount.innerHTML = '';
  }
}

async function runSearch(query) {
  const clean = String(query || '').trim();
  state.searchQuery = clean;
  if (!clean) {
    state.searchResults = [];
    render();
    return;
  }
  state.searchHistory = rememberSearch(clean);
  state.searchLoading = true;
  render();

  try {
    const items = await searchAllMedia(clean, state.prefs.tmdbApiKey);
    registerItems(items);
    state.searchResults = items;
  } catch {
    state.searchResults = getAllKnownPool().filter((x) =>
      x.title.toLowerCase().includes(clean.toLowerCase())
    );
  } finally {
    state.searchLoading = false;
    render();
  }
}

function bindEvents() {
  rootEl.addEventListener('click', (e) => {
    const target = e.target;

    if (
      target.closest('[data-close-modal="true"]') &&
      (target.matches('[data-close-modal="true"]') || target.closest('button[data-close-modal="true"]'))
    ) {
      state.modal = null;
      render();
      return;
    }

    const navBtn = target.closest('[data-nav-tab]');
    if (navBtn) {
      const nextTab = navBtn.dataset.navTab;
      state.prevTab = state.tab;
      state.tab = nextTab;
      if (nextTab === 'discover' && state.discoverItems.length === 0) {
        refreshDiscoverFeed({ reset: true });
        return;
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
      render();
      return;
    }

    if (target.closest('[data-reset-home="true"]')) {
      state.tab = 'home';
      state.homeFilter = 'all';
      render();
      return;
    }

    const homeFilterBtn = target.closest('[data-home-filter]');
    if (homeFilterBtn) {
      const val = homeFilterBtn.dataset.homeFilter;
      if (val === 'hot') {
        state.tab = 'discover';
        state.discoverSort = 'year';
        refreshDiscoverFeed({ reset: true });
        return;
      }
      state.homeFilter = state.homeFilter === val ? 'all' : val;
      render();
      return;
    }

    if (target.closest('#open-categories-btn')) {
      state.modal = 'categories';
      render();
      return;
    }

    const pickCat = target.closest('[data-pick-category]');
    if (pickCat) {
      state.modal = null;
      state.tab = 'discover';
      state.discoverGenre = pickCat.dataset.pickCategory;
      refreshDiscoverFeed({ reset: true });
      return;
    }

    if (
      target.closest('#open-settings-btn') ||
      target.closest('#open-settings-profile-btn') ||
      target.closest('#open-shield-settings-btn')
    ) {
      state.modal = 'settings';
      render();
      return;
    }

    if (target.closest('#open-downloads-btn') || target.closest('#open-downloads-card')) {
      state.prevTab = state.tab === 'downloads' ? 'mysuno' : state.tab;
      state.tab = 'downloads';
      render();
      return;
    }

    if (target.closest('#downloads-back-btn')) {
      state.tab = state.prevTab || 'mysuno';
      render();
      return;
    }

    if (target.closest('#open-notifications-btn')) {
      state.modal = 'notifications';
      render();
      return;
    }

    if (target.closest('#open-quicklaunch-btn')) {
      state.modal = 'quicklaunch';
      render();
      return;
    }

    if (target.closest('#detail-back-btn')) {
      state.tab = state.prevTab || 'home';
      render();
      return;
    }

    if (target.closest('#detail-trailer-toggle')) {
      if (!state.detailTrailerPlaying) {
        state.detailTrailerPlaying = true;
        state.detailTrailerMuted = false;
      } else {
        state.detailTrailerMuted = !state.detailTrailerMuted;
      }
      render();
      return;
    }

    const detailTabBtn = target.closest('[data-detail-tab]');
    if (detailTabBtn) {
      state.detailTab = detailTabBtn.dataset.detailTab;
      render();
      return;
    }

    const playClipBtn = target.closest('[data-play-clip]');
    if (playClipBtn) {
      const k = playClipBtn.dataset.playClip;
      state.activeClipTrailerKey = state.activeClipTrailerKey === k ? null : k;
      render();
      return;
    }

    const playBtn = target.closest('[data-play-key]');
    if (playBtn) {
      e.stopPropagation();
      const item = getItemByKey(playBtn.dataset.playKey);
      if (item) launchStream(item);
      return;
    }

    const epBtn = target.closest('[data-play-episode]');
    if (epBtn) {
      const ep = Number(epBtn.dataset.playEpisode);
      const item = getItemByKey(epBtn.dataset.epKey);
      if (item) launchStream(item, { season: state.activeSeason, episode: ep });
      return;
    }

    const detailBtn = target.closest('[data-open-detail]');
    if (detailBtn) {
      openDetailView(detailBtn.dataset.openDetail);
      return;
    }

    const myListBtn = target.closest('[data-toggle-mylist]');
    if (myListBtn) {
      e.stopPropagation();
      toggleCollectionItem(
        MY_LIST_COLLECTION_ID,
        myListBtn.dataset.toggleMylist,
        'Added to My List',
        'Removed from My List'
      );
      return;
    }

    const likeBtn = target.closest('[data-toggle-like]');
    if (likeBtn) {
      e.stopPropagation();
      toggleCollectionItem(
        LIKED_COLLECTION_ID,
        likeBtn.dataset.toggleLike,
        'Added to Liked',
        'Removed from Liked'
      );
      return;
    }

    const dlBtn = target.closest('[data-toggle-download]');
    if (dlBtn) {
      toggleDownload(dlBtn.dataset.toggleDownload);
      return;
    }

    const shareBtn = target.closest('[data-share-key]');
    if (shareBtn) {
      e.stopPropagation();
      shareItem(getItemByKey(shareBtn.dataset.shareKey));
      return;
    }

    const cwMenuBtn = target.closest('[data-cw-menu]');
    if (cwMenuBtn) {
      e.stopPropagation();
      state.cwMenuKey = cwMenuBtn.dataset.cwMenu;
      state.modal = 'cwmenu';
      render();
      return;
    }

    const removeCwBtn = target.closest('[data-remove-cw]');
    if (removeCwBtn) {
      state.progressMap = removeMediaProgress(removeCwBtn.dataset.removeCw);
      state.modal = null;
      showToast('Removed from Continue Watching');
      render();
      return;
    }

    if (target.closest('#setup-smart-dl-btn') || target.closest('#toggle-smart-downloads-btn')) {
      state.profile = saveProfile({ smartDownloads: !state.profile.smartDownloads });
      showToast(state.profile.smartDownloads ? 'Smart Downloads Queue enabled' : 'Smart Downloads paused');
      render();
      return;
    }

    if (target.closest('#discover-load-more-btn')) {
      state.discoverSkip += 50;
      state.discoverAnimePage += 1;
      refreshDiscoverFeed({ reset: false });
      return;
    }

    if (target.closest('#clear-search-btn')) {
      state.searchQuery = '';
      state.searchResults = [];
      render();
      return;
    }

    if (target.closest('[data-launch-direct="true"]')) {
      const parsed = parseDirectTarget(state.searchQuery);
      if (parsed) {
        launchStream(
          {
            id: `${parsed.mediaType}:${parsed.tmdbId || parsed.anilistId}`,
            tmdbId: parsed.tmdbId,
            anilistId: parsed.anilistId,
            mediaType: parsed.mediaType,
            title: `${parsed.mediaType.toUpperCase()} #${parsed.tmdbId || parsed.anilistId}`,
          },
          { season: parsed.season || 1, episode: parsed.episode || 1 }
        );
      }
      return;
    }

    // Player controls
    if (target.closest('#close-player-btn')) {
      state.playerOpen = false;
      antiRedirectGuard.setTheaterActive(false);
      render();
      return;
    }
    if (target.closest('#toggle-strict-shield-btn')) {
      const next = !state.shield.strictFrameMode;
      antiRedirectGuard.setStrictFrameMode(next);
      state.shield = antiRedirectGuard.getSnapshot();
      showToast(next ? 'Strict Sandbox ON' : 'Strict Sandbox OFF (Default VidRift)');
      render();
      return;
    }
    if (target.closest('#reload-player-btn')) {
      render({ forceReload: true });
      showToast('Reloaded stream');
      return;
    }
    if (target.closest('#cmd-resume-btn')) {
      const saved = state.progressMap[getMediaKey(state.activeItem)];
      if (saved?.currentTime) sendPlayerCommand('resume', { currentTime: Math.floor(saved.currentTime) });
      return;
    }
    if (target.closest('#next-ep-btn')) {
      launchStream(state.activeItem, {
        season: state.activeSeason,
        episode: state.activeEpisode + 1,
      });
      return;
    }
    if (target.closest('#toggle-dub-btn')) {
      state.prefs = savePlayerPrefs({ dub: !state.prefs.dub });
      showToast(state.prefs.dub ? 'Switched to English Dub' : 'Switched to Subtitled');
      render();
      return;
    }

    const themeChip = target.closest('[data-pick-theme]');
    if (themeChip) {
      state.appearance = saveAppearanceSettings({
        ...state.appearance,
        theme: themeChip.dataset.pickTheme,
      });
      render();
      return;
    }

    if (target.closest('#save-settings-btn')) {
      const name = (document.getElementById('pref-profile-name')?.value || 'Ansh').trim() || 'Ansh';
      const sub = document.getElementById('pref-sub')?.value || 'en';
      const autoplay = Boolean(document.getElementById('pref-autoplay')?.checked);
      const dub = Boolean(document.getElementById('pref-dub')?.checked);
      const phoneFrameOnDesktop = Boolean(document.getElementById('pref-phone-frame')?.checked);
      const tmdbApiKey = (document.getElementById('pref-tmdb-key')?.value || '').trim();
      const navLock = Boolean(document.getElementById('pref-navlock')?.checked);
      const strictSandbox = Boolean(document.getElementById('pref-strict-sandbox')?.checked);

      state.profile = saveProfile({ name });
      antiRedirectGuard.setNavigationLock(navLock);
      antiRedirectGuard.setStrictFrameMode(strictSandbox);
      state.shield = antiRedirectGuard.getSnapshot();
      state.prefs = savePlayerPrefs({ autoplay, dub, sub, tmdbApiKey, phoneFrameOnDesktop });
      state.modal = null;
      showToast('Settings saved');
      render();
    }
  });

  rootEl.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'detail-season-select') {
      state.activeSeason = Number(t.value) || 1;
      state.activeEpisode = 1;
      render();
      return;
    }
    if (t.id === 'disc-type') {
      state.discoverType = t.value;
      refreshDiscoverFeed({ reset: true });
      return;
    }
    if (t.id === 'disc-genre') {
      state.discoverGenre = t.value;
      refreshDiscoverFeed({ reset: true });
      return;
    }
    if (t.id === 'disc-year') {
      state.discoverYear = t.value;
      render();
      return;
    }
    if (t.id === 'disc-sort') {
      state.discoverSort = t.value;
      render();
    }
  });

  rootEl.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'global-search-input') {
      state.searchQuery = t.value;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        const pos = t.selectionStart;
        runSearch(state.searchQuery).then(() => {
          const fresh = document.getElementById('global-search-input');
          if (fresh && state.tab === 'search') {
            fresh.focus();
            try {
              fresh.setSelectionRange(pos, pos);
            } catch {}
          }
        });
      }, 320);
    }
  });

  rootEl.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'global-search-form') {
      runSearch(document.getElementById('global-search-input')?.value || state.searchQuery);
    } else if (e.target.id === 'quick-launch-form') {
      const raw = document.getElementById('ql-input')?.value || '';
      const fallbackType = document.getElementById('ql-type')?.value || 'movie';
      const customTitle = (document.getElementById('ql-title')?.value || '').trim();
      const parsed = parseDirectTarget(raw, fallbackType);
      if (!parsed) {
        showToast('Enter a valid TMDB/AniList ID or URL');
        return;
      }
      state.modal = null;
      launchStream(
        {
          id: `${parsed.mediaType}:${parsed.tmdbId || parsed.anilistId}`,
          tmdbId: parsed.tmdbId,
          anilistId: parsed.anilistId,
          mediaType: parsed.mediaType,
          title: customTitle || `${parsed.mediaType.toUpperCase()} #${parsed.tmdbId || parsed.anilistId}`,
        },
        { season: parsed.season || 1, episode: parsed.episode || 1 }
      );
    }
  });

  window.addEventListener('message', (event) => {
    const msg = parseVidriftMessage(event);
    if (!msg) return;
    if (msg.type === 'vidrift:progress' && state.activeItem) {
      const currentTime = Number(msg.currentTime || 0);
      const duration = Number(msg.duration || 0);
      state.livePlayback = { currentTime, duration };
      state.progressMap = saveMediaProgress(state.activeItem, {
        currentTime,
        duration,
        season: state.activeSeason,
        episode: state.activeEpisode,
      });
    } else if (msg.type === 'vidrift:exit') {
      state.playerOpen = false;
      antiRedirectGuard.setTheaterActive(false);
      render();
    }
  });
}

async function init() {
  antiRedirectGuard.install();
  antiRedirectGuard.subscribe((snapshot) => {
    state.shield = snapshot;
    const pill = document.getElementById('toggle-strict-shield-btn');
    if (pill && !snapshot.strictFrameMode) {
      const span = pill.querySelector('span');
      if (span) span.textContent = `Shield • ${snapshot.blockedCount}`;
    }
  });

  bindEvents();
  state.catalog = await loadCatalogData();
  registerItems(state.catalog);
  state.progressMap = loadProgressMap(state.catalog);
  render();

  try {
    const [movies, series, anime] = await Promise.all([
      fetchCinemetaCatalog('movie').catch(() => []),
      fetchCinemetaCatalog('series').catch(() => []),
      loadTrendingAnime().catch(() => []),
    ]);
    if (movies.length) {
      registerItems(movies);
      state.liveMovies = movies;
    }
    if (series.length) {
      registerItems(series);
      state.liveSeries = series;
    }
    if (anime.length) {
      registerItems(anime);
      state.liveAnimeTrending = anime;
    }
    if (state.tab === 'home') render();
  } catch {}
}

init();
