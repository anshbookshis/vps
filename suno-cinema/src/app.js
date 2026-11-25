import {
  PLAYER_PROVIDERS,
  buildPlayerEmbedUrl,
  parseDirectTarget,
  parseAnyPlayerMessage,
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
  renderSunoCinemaDesktopWordmark,
} from './components/icons.js';
import {
  escapeHtml,
  resolveArtUrl,
  attachFallbackImgAttr,
  formatTime,
  renderPosterCard,
  renderDesktopWideCard,
  renderShelf,
} from './components/cards.js';
import {
  renderAndroidBillboard,
  renderDesktopBillboard,
  renderDesktopFooter,
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
  fetchDynamicHomeFeeds,
  fetchLanguageCatalog,
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
  liveGenreLabelA: 'Action',
  liveGenreFeedA: [],
  liveGenreLabelB: 'Thriller',
  liveGenreFeedB: [],
  liveAnimeTrending: [],
  homeFeedOffset: 0,
  homeRefreshing: false,
  heroIndex: 0,
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
  tab: 'home', // 'home' | 'clips' | 'discover' | 'search' | 'mysuno' | 'detail' | 'downloads' | 'languages'
  langPref: 'Original Language',
  langValue: 'English',
  langItems: [],
  langLoading: false,
  desktopSearchOpen: false,
  isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
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

function isDesktopMode() {
  return Boolean(state.isDesktop && !state.prefs.phoneFrameOnDesktop);
}

let toastTimer = null;
let searchDebounce = null;
let heroTimer = null;
let resizeTimer = null;

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
  return buildPlayerEmbedUrl(state.activeItem, {
    provider: state.prefs.playerProvider || 'vidlink',
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

async function loadLanguageFeed(lang = state.langValue) {
  state.langValue = lang;
  state.langLoading = true;
  render();
  try {
    const items = await fetchLanguageCatalog(lang);
    registerItems(items);
    state.langItems = items;
  } finally {
    state.langLoading = false;
    render();
  }
}

function renderDesktopTopbar() {
  const navItems = [
    { id: 'home', label: 'Home', active: state.tab === 'home' && state.homeFilter === 'all', attr: 'data-reset-home="true"' },
    { id: 'tv', label: 'Shows', active: state.tab === 'home' && state.homeFilter === 'tv', attr: 'data-dk-filter="tv"' },
    { id: 'movie', label: 'Movies', active: state.tab === 'home' && state.homeFilter === 'movie', attr: 'data-dk-filter="movie"' },
    { id: 'anime', label: 'Anime', active: state.tab === 'home' && state.homeFilter === 'anime', attr: 'data-dk-filter="anime"' },
    { id: 'hot', label: 'New & Popular', active: state.tab === 'discover', attr: 'data-nav-tab="discover"' },
    { id: 'mysuno', label: 'My Suno', active: state.tab === 'mysuno' || state.tab === 'downloads', attr: 'data-nav-tab="mysuno"' },
    { id: 'languages', label: 'Browse by Languages', active: state.tab === 'languages', attr: 'data-open-languages="true"' },
  ];

  const searchExpanded = state.desktopSearchOpen || state.tab === 'search';

  return `<header class="dk-topbar">
    <div class="dk-topbar-left">
      <button type="button" data-reset-home="true" aria-label="Suno Cinema Home">
        ${renderSunoCinemaDesktopWordmark()}
      </button>
      <nav class="dk-nav-list" aria-label="Primary">
        ${navItems
          .map((n) => `<button type="button" class="dk-nav-link ${n.active ? 'is-active' : ''}" ${n.attr}>${n.label}</button>`)
          .join('')}
      </nav>
    </div>
    <div class="dk-topbar-right">
      ${
        searchExpanded
          ? `<form class="dk-search-expand" id="dk-search-form">
              ${svgIcon('search', 17)}
              <input
                id="dk-search-input"
                type="text"
                placeholder="Titles, anime, or TMDB ID"
                value="${escapeHtml(state.searchQuery)}"
                autocomplete="off"
              />
              <button type="button" id="dk-search-close" aria-label="Close search">
                ${svgIcon('close', 15)}
              </button>
            </form>`
          : `<button type="button" class="icon-btn" id="dk-search-toggle" title="Search" aria-label="Search">
              ${svgIcon('search', 20)}
            </button>`
      }
      <button type="button" class="icon-btn" id="open-notifications-btn" title="Notifications" aria-label="Notifications">
        ${svgIcon('bell', 20)}
        <span class="notif-badge">4</span>
      </button>
      <button type="button" class="dk-avatar-btn" id="open-settings-profile-btn" title="Profile, Ad-Shield & Phone Mode" aria-label="Account Settings">
        ${renderSunoMascotSvg(28)}
        ${svgIcon('chevronDown', 14)}
      </button>
    </div>
  </header>`;
}

function renderDesktopHome({
  spotlightList,
  continueEntries,
  trendingMovies,
  trendingSeries,
  genreShelfA,
  genreShelfB,
  regionalCinema,
  animeShelf,
  myListSet,
  likedSet,
  progressMap,
}) {
  const subLabels = {
    tv: 'Shows',
    movie: 'Movies',
    anime: 'Anime',
  };
  const subLabel = subLabels[state.homeFilter];

  const top10Pool = [];
  const top10Seen = new Set();
  for (const item of [...regionalCinema, ...trendingMovies, ...trendingSeries]) {
    const k = getMediaKey(item);
    if (!top10Seen.has(k) && item.poster) {
      top10Seen.add(k);
      top10Pool.push(item);
    }
    if (top10Pool.length >= 10) break;
  }

  return `
    ${renderDesktopTopbar()}

    ${
      subLabel
        ? `<div class="dk-subhead">
            <div class="dk-subhead-left">
              <h1 class="dk-subhead-title">${subLabel}</h1>
              <button type="button" class="dk-genres-pill" id="open-categories-btn">
                Genres ${svgIcon('chevronDown', 14)}
              </button>
            </div>
            <button type="button" class="dk-genres-pill" id="refresh-home-feed-btn" ${state.homeRefreshing ? 'disabled' : ''}>
              ${svgIcon('refresh', 13)} ${state.homeRefreshing ? 'Refreshing...' : 'Refresh Feed'}
            </button>
          </div>`
        : ''
    }

    ${renderDesktopBillboard(spotlightList, state.heroIndex, { myListSet })}

    ${
      continueEntries.length > 0
        ? renderShelf({
            id: 'dk-cw',
            title: `Continue Watching for ${state.profile.name || 'Ansh'}`,
            items: continueEntries.slice(0, 14),
            kind: 'dk-wide',
            myListSet,
            likedSet,
            progressMap,
          })
        : ''
    }

    ${renderShelf({
      id: 'dk-top-picks',
      title: `Today's Top Picks for You`,
      items: genreShelfA.slice(0, 18),
      kind: 'dk-wide',
      top10Indices: new Set([0, 1, 4, 5]),
      recentIndices: new Set([1, 2, 3, 4]),
      myListSet,
      likedSet,
      progressMap,
    })}

    ${
      top10Pool.length > 0
        ? renderShelf({
            id: 'dk-top10',
            title: 'Top 10 Titles in India Today',
            items: top10Pool,
            kind: 'dk-top10',
            recentIndices: new Set([0, 1, 2, 3, 4, 5, 6, 7]),
          })
        : ''
    }

    ${renderShelf({
      id: 'dk-trending-movies',
      title: 'Trending Movies Now',
      items: trendingMovies.slice(0, 20),
      kind: 'dk-wide',
      top10Indices: new Set([0, 2]),
      recentIndices: new Set([0, 3]),
      myListSet,
      likedSet,
      progressMap,
    })}

    ${renderShelf({
      id: 'dk-trending-shows',
      title: 'Only on Suno Cinema • Popular Shows',
      items: trendingSeries.slice(0, 20),
      kind: 'dk-wide',
      top10Indices: new Set([0, 3]),
      recentIndices: new Set([1, 2]),
      myListSet,
      likedSet,
      progressMap,
    })}

    ${renderShelf({
      id: 'dk-india',
      title: 'South Indian & Bollywood Hits',
      items: regionalCinema.slice(0, 20),
      kind: 'dk-wide',
      top10Indices: new Set([0, 2]),
      recentIndices: new Set([1, 3]),
      myListSet,
      likedSet,
      progressMap,
    })}

    ${renderShelf({
      id: 'dk-genre-b',
      title: `${state.liveGenreLabelB} & Suspense Spotlight`,
      items: genreShelfB.slice(0, 20),
      kind: 'dk-wide',
      recentIndices: new Set([0, 2]),
      myListSet,
      likedSet,
      progressMap,
    })}

    ${renderShelf({
      id: 'dk-anime',
      title: 'Trending Anime & Soundtracks',
      items: animeShelf.slice(0, 20),
      kind: 'dk-wide',
      top10Indices: new Set([0, 1]),
      recentIndices: new Set([0, 2]),
      myListSet,
      likedSet,
      progressMap,
    })}

    ${renderDesktopFooter()}
  `;
}

function renderDesktopLanguagesTab() {
  const myListSet = getCollectionSet(MY_LIST_COLLECTION_ID);
  const likedSet = getCollectionSet(LIKED_COLLECTION_ID);
  const items = state.langItems.length ? state.langItems : getAllKnownPool();

  const filtered =
    state.langPref === 'Dubbing'
      ? [...items].sort((a, b) => (b.mediaType === 'anime' ? 1 : 0) - (a.mediaType === 'anime' ? 1 : 0))
      : items;

  const languages = ['English', 'Hindi', 'South Indian', 'Japanese', 'Korean', 'Spanish'];
  const prefs = ['Original Language', 'Dubbing', 'Subtitles'];

  return `
    ${renderDesktopTopbar()}
    <div class="dk-lang-header">
      <h1 class="dk-lang-title">Browse by Languages</h1>
      <div class="dk-lang-controls">
        <span class="dim" style="font-size:13px;font-weight:500;">Select Your Preferences</span>
        <select id="lang-pref-select" class="dk-lang-select" aria-label="Audio or Subtitle Preference">
          ${prefs
            .map(
              (p) => `<option value="${escapeHtml(p)}" ${state.langPref === p ? 'selected' : ''}>${escapeHtml(p)}</option>`
            )
            .join('')}
        </select>
        <select id="lang-val-select" class="dk-lang-select" aria-label="Language">
          ${languages
            .map(
              (l) => `<option value="${escapeHtml(l)}" ${state.langValue === l ? 'selected' : ''}>${escapeHtml(l)}</option>`
            )
            .join('')}
        </select>
      </div>
    </div>

    ${
      state.langLoading && filtered.length === 0
        ? `<p class="dim" style="padding:30px 36px;">Loading ${escapeHtml(state.langValue)} catalog...</p>`
        : `<div class="dk-grid-6">
            ${filtered
              .slice(0, 36)
              .map((item, idx) =>
                renderDesktopWideCard(item, {
                  top10: idx === 0 || idx === 4 || idx === 17,
                  recentlyAdded: idx === 0 || idx === 4,
                  progress: state.progressMap[getMediaKey(item)],
                  inMyList: myListSet.has(getMediaKey(item)),
                  isLiked: likedSet.has(getMediaKey(item)),
                })
              )
              .join('')}
          </div>`
    }

    ${renderDesktopFooter()}
  `;
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

  // Dynamic Rotating Billboard Spotlight from live trending feeds (never fixed!)
  const dynamicSpotlightSource = [
    ...state.liveMovies.slice(0, 6),
    ...state.liveSeries.slice(0, 3),
    ...state.liveAnimeTrending.slice(0, 2),
    ...pool,
  ].filter(matchesFilter);
  const spotSeen = new Set();
  const spotlightList = dynamicSpotlightSource
    .filter((item) => {
      const k = getMediaKey(item);
      if (spotSeen.has(k) || !item.poster) return false;
      spotSeen.add(k);
      return true;
    })
    .slice(0, 8);

  const continueEntries = Object.values(state.progressMap)
    .filter((e) => e?.item && e.currentTime > 0 && matchesFilter(e.item))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const trendingMovies = (state.liveMovies.length
    ? state.liveMovies
    : state.catalog.filter((x) => x.mediaType === 'movie')
  ).filter(matchesFilter);

  const trendingSeries = (state.liveSeries.length
    ? state.liveSeries
    : state.catalog.filter((x) => x.mediaType === 'tv')
  ).filter(matchesFilter);

  const genreShelfA = (state.liveGenreFeedA.length
    ? state.liveGenreFeedA
    : pool.filter((x) => (x.genres || []).includes(state.liveGenreLabelA))
  ).filter(matchesFilter);

  const genreShelfB = (state.liveGenreFeedB.length
    ? state.liveGenreFeedB
    : pool.filter((x) => (x.genres || []).includes(state.liveGenreLabelB))
  ).filter(matchesFilter);

  const regionalCinema = state.catalog
    .filter((x) => (x.regionTag === 'south-india' || x.regionTag === 'india' || x.country?.includes('India')) && matchesFilter(x));

  const animeShelf = (state.liveAnimeTrending.length
    ? state.liveAnimeTrending
    : state.catalog.filter((x) => x.mediaType === 'anime')
  ).filter(matchesFilter);

  if (isDesktopMode()) {
    return renderDesktopHome({
      spotlightList,
      continueEntries,
      trendingMovies,
      trendingSeries,
      genreShelfA,
      genreShelfB,
      regionalCinema,
      animeShelf,
      myListSet,
      likedSet: getCollectionSet(LIKED_COLLECTION_ID),
      progressMap: state.progressMap,
    });
  }

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
      <button type="button" class="outline-chip" id="refresh-home-feed-btn" ${state.homeRefreshing ? 'disabled' : ''}>
        ${svgIcon('refresh', 13)} ${state.homeRefreshing ? 'Loading...' : 'Refresh'}
      </button>
    </div>

    ${renderAndroidBillboard(spotlightList, state.heroIndex, { myListSet })}

    ${
      continueEntries.length > 0
        ? renderShelf({
            id: 'home-cw',
            title: 'Continue Watching',
            items: continueEntries.slice(0, 12),
            kind: 'continue',
          })
        : ''
    }

    ${renderShelf({
      id: 'trending-movies',
      title: 'Trending Movies Now',
      items: trendingMovies.slice(0, 22),
      top10Indices: new Set([0, 1, 2]),
      recentIndices: new Set([0, 3]),
      seeAllAttr: 'data-open-discover="movie"',
    })}

    ${renderShelf({
      id: 'trending-series',
      title: 'Top TV Shows Today',
      items: trendingSeries.slice(0, 22),
      top10Indices: new Set([0, 2]),
      recentIndices: new Set([1]),
      seeAllAttr: 'data-open-discover="tv"',
    })}

    ${renderShelf({
      id: 'genre-a',
      title: `${state.liveGenreLabelA} Spotlight`,
      items: genreShelfA.slice(0, 20),
      top10Indices: new Set([1, 4]),
      recentIndices: new Set([0]),
    })}

    ${renderShelf({
      id: 'genre-b',
      title: `${state.liveGenreLabelB} & Suspense`,
      items: genreShelfB.slice(0, 20),
      recentIndices: new Set([1, 2]),
    })}

    ${renderShelf({
      id: 'india-cinema',
      title: 'South Indian & Bollywood Hits',
      items: regionalCinema.slice(0, 20),
      top10Indices: new Set([0, 2]),
      recentIndices: new Set([1]),
    })}

    ${renderShelf({
      id: 'anime-row',
      title: 'Trending Anime & Soundtracks',
      items: animeShelf.slice(0, 20),
      top10Indices: new Set([0, 1]),
      seeAllAttr: 'data-open-discover="anime"',
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

  if (isDesktopMode()) {
    const myListSet = getCollectionSet(MY_LIST_COLLECTION_ID);
    const likedSet = getCollectionSet(LIKED_COLLECTION_ID);
    return `
      ${renderDesktopTopbar()}
      <div class="dk-subhead">
        <div class="dk-subhead-left">
          <h1 class="dk-subhead-title">New &amp; Popular</h1>
          <button type="button" class="dk-genres-pill" id="open-categories-btn">
            Genres ${svgIcon('chevronDown', 14)}
          </button>
        </div>
        <button type="button" class="dk-genres-pill" id="open-quicklaunch-btn">
          ${svgIcon('link', 14)} Quick Launch ID
        </button>
      </div>

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
          ? `<p class="dim" style="padding:28px 36px;">Loading free catalog from Cinemeta &amp; AniList...</p>`
          : `<div class="dk-grid-6">
              ${visible
                .map((item, idx) =>
                  renderDesktopWideCard(item, {
                    top10: idx < 3,
                    recentlyAdded: idx < 6,
                    progress: state.progressMap[getMediaKey(item)],
                    inMyList: myListSet.has(getMediaKey(item)),
                    isLiked: likedSet.has(getMediaKey(item)),
                  })
                )
                .join('')}
            </div>`
      }

      <div style="display:flex;justify-content:center;padding:8px 36px 24px;">
        <button type="button" class="btn-dark" id="discover-load-more-btn" style="width:100%;max-width:320px;" ${
          state.discoverLoading ? 'disabled' : ''
        }>
          ${state.discoverLoading ? 'Loading more...' : 'Load More Titles'}
        </button>
      </div>

      ${renderDesktopFooter()}
    `;
  }

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

  if (isDesktopMode()) {
    const myListSet = getCollectionSet(MY_LIST_COLLECTION_ID);
    const likedSet = getCollectionSet(LIKED_COLLECTION_ID);
    const displayList = state.searchQuery.trim() ? state.searchResults : topRecommended;
    const heading = state.searchQuery.trim()
      ? `Results for "${state.searchQuery.trim()}"`
      : 'Explore Popular Searches';

    return `
      ${renderDesktopTopbar()}
      <div class="dk-subhead">
        <div class="dk-subhead-left">
          <h1 class="dk-subhead-title">${escapeHtml(heading)}</h1>
        </div>
        <button type="button" class="dk-genres-pill" id="open-quicklaunch-btn">
          ${svgIcon('link', 14)} Quick Launch ID
        </button>
      </div>

      ${
        direct
          ? `<div style="padding:4px 36px 14px;">
              <button type="button" class="btn-white" style="max-width:340px;padding:0 20px;" data-launch-direct="true">
                ${svgIcon('play', 16)} Stream ${escapeHtml(direct.mediaType.toUpperCase())} #${escapeHtml(
              direct.tmdbId || direct.anilistId
            )}
              </button>
            </div>`
          : ''
      }

      ${
        state.searchLoading
          ? `<p class="dim" style="padding:28px 36px;">Searching free Cinemeta &amp; AniList...</p>`
          : displayList.length > 0
          ? `<div class="dk-grid-6">
              ${displayList
                .slice(0, 36)
                .map((item, idx) =>
                  renderDesktopWideCard(item, {
                    top10: idx < 2,
                    progress: state.progressMap[getMediaKey(item)],
                    inMyList: myListSet.has(getMediaKey(item)),
                    isLiked: likedSet.has(getMediaKey(item)),
                  })
                )
                .join('')}
            </div>`
          : `<div style="padding:28px 36px;display:flex;flex-direction:column;gap:12px;max-width:440px;">
              <p class="dim">No exact matches found for "${escapeHtml(state.searchQuery)}".</p>
              <button type="button" class="btn-dark" id="open-quicklaunch-btn">Launch by TMDB / AniList ID</button>
            </div>`
      }

      ${renderDesktopFooter()}
    `;
  }

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

  if (isDesktopMode()) {
    const myListSet = getCollectionSet(MY_LIST_COLLECTION_ID);
    const likedSet = getCollectionSet(LIKED_COLLECTION_ID);
    return `
      ${renderDesktopTopbar()}
      <div class="dk-subhead">
        <div class="dk-subhead-left">
          <span style="display:inline-flex;align-items:center;gap:12px;">
            ${renderSunoMascotSvg(34)}
            <h1 class="dk-subhead-title">My Suno • ${escapeHtml(state.profile.name || 'Ansh')}</h1>
          </span>
        </div>
        <button type="button" class="dk-genres-pill" id="open-settings-profile-btn">
          Profile &amp; Shield Settings
        </button>
      </div>

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
              : 'Movies and shows that you save appear here.'
          }</div>
        </div>
      </button>

      ${
        continueEntries.length > 0
          ? renderShelf({
              id: 'dk-mysuno-cw',
              title: 'Continue Watching',
              items: continueEntries,
              kind: 'dk-wide',
              myListSet,
              likedSet,
              progressMap: state.progressMap,
            })
          : `<section class="nf-shelf is-dk-shelf">
              <div class="nf-shelf-head"><h2 class="nf-shelf-title">Continue Watching</h2></div>
              <p class="dim" style="padding:0 36px;font-size:13px;">Movies &amp; shows you start watching appear here automatically.</p>
            </section>`
      }

      ${
        likedItems.length > 0
          ? renderShelf({
              id: 'dk-mysuno-liked',
              title: "TV Shows & Movies You've Liked",
              items: likedItems,
              kind: 'dk-wide',
              myListSet,
              likedSet,
              progressMap: state.progressMap,
            })
          : `<section class="nf-shelf is-dk-shelf">
              <div class="nf-shelf-head"><h2 class="nf-shelf-title">TV Shows &amp; Movies You've Liked</h2></div>
              <p class="dim" style="padding:0 36px;font-size:13px;">Click Like (👍) on any title to save favorites here.</p>
            </section>`
      }

      ${renderShelf({
        id: 'dk-mysuno-mylist',
        title: myListItems.length > 0 ? 'My List' : 'Recommended Picks to Add',
        items: myListItems.length > 0 ? myListItems : getAllKnownPool().slice(0, 12),
        kind: 'dk-wide',
        myListSet,
        likedSet,
        progressMap: state.progressMap,
      })}

      ${renderDesktopFooter()}
    `;
  }

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

    ${
      continueEntries.length > 0
        ? renderShelf({
            id: 'mysuno-cw',
            title: 'Continue Watching',
            items: continueEntries,
            kind: 'continue',
          })
        : `<section class="nf-shelf">
            <div class="nf-shelf-head"><h2 class="nf-shelf-title">Continue Watching</h2></div>
            <p class="dim" style="padding:0 14px;font-size:13px;">Movies &amp; shows you start watching appear here automatically.</p>
          </section>`
    }

    ${
      likedItems.length > 0
        ? renderShelf({
            id: 'mysuno-liked',
            title: "TV Shows & Movies You've Liked",
            items: likedItems,
            kind: 'liked',
          })
        : `<section class="nf-shelf">
            <div class="nf-shelf-head"><h2 class="nf-shelf-title">TV Shows &amp; Movies You've Liked</h2></div>
            <p class="dim" style="padding:0 14px;font-size:13px;">Tap Rate (👍) on any title to save favorites here.</p>
          </section>`
    }

    ${
      myListItems.length > 0
        ? renderShelf({
            id: 'mysuno-mylist',
            title: 'My List',
            items: myListItems,
            seeAllAttr: 'data-nav-tab="discover"',
          })
        : renderShelf({
            id: 'mysuno-suggested',
            title: 'Trending Picks to Add',
            items: getAllKnownPool().slice(0, 10),
            seeAllAttr: 'data-nav-tab="discover"',
          })
    }
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
  const provider = state.prefs.playerProvider || 'vidlink';
  const useSandbox = provider === 'vidrift-direct' ? false : state.shield.strictFrameMode;
  if (useSandbox) {
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
  const provider = state.prefs.playerProvider || 'vidlink';
  const isSandboxed = provider !== 'vidrift-direct' && state.shield.strictFrameMode;
  const existingFrame = document.getElementById('vidrift-player');

  if (!existingFrame) {
    mount.innerHTML = `<section class="player-fullscreen" aria-label="Suno Cinema Player">
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
                : 'HD Stream'
            }</div>
          </div>
        </div>
        <button type="button" class="shield-pill ${isSandboxed ? '' : 'is-warn'}" id="toggle-strict-shield-btn">
          ${svgIcon('shield', 13)}
          <span>${isSandboxed ? 'No-Redirect ON' : 'Sandbox OFF'}</span>
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
    if (forceReload || existingFrame.dataset.embedUrl !== embedUrl || prevSandbox !== isSandboxed) {
      existingFrame.src = embedUrl;
      existingFrame.dataset.embedUrl = embedUrl;
    }
  }

  const strip = document.getElementById('player-bottom-strip');
  if (strip) {
    const saved = state.progressMap[getMediaKey(item)];
    strip.innerHTML = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
      ${PLAYER_PROVIDERS.map(
        (p) => `<button type="button" class="outline-chip ${
          provider === p.id ? 'is-active' : ''
        }" data-switch-provider="${p.id}" style="height:30px;padding:0 10px;font-size:11px;">${escapeHtml(
          p.label
        )}</button>`
      ).join('')}
      ${
        saved?.currentTime > 15 && provider !== 'vidlink'
          ? `<button type="button" class="outline-chip" id="cmd-resume-btn" style="height:30px;font-size:11px;">Resume ${formatTime(
              saved.currentTime
            )}</button>`
          : ''
      }
      <button type="button" class="outline-chip" id="reload-player-btn" style="height:30px;font-size:11px;">${svgIcon(
        'refresh',
        12
      )} Reload</button>
      ${
        item.mediaType !== 'movie'
          ? `<button type="button" class="outline-chip" id="next-ep-btn" style="height:30px;font-size:11px;">Next Ep ${svgIcon(
              'next',
              12
            )}</button>`
          : ''
      }
      ${
        item.mediaType === 'anime'
          ? `<button type="button" class="outline-chip ${state.prefs.dub ? 'is-active' : ''}" id="toggle-dub-btn" style="height:30px;font-size:11px;">${
              state.prefs.dub ? 'Dub ON' : 'Sub'
            }</button>`
          : ''
      }
    </div>
    <span class="dim" style="font-size:11px;">${
      state.livePlayback.currentTime > 0 ? `Synced ${formatTime(state.livePlayback.currentTime)}` : 'Popups Blocked'
    }</span>`;
  }
}

function renderActiveView() {
  const dk = isDesktopMode();
  switch (state.tab) {
    case 'languages':
      return dk ? renderDesktopLanguagesTab() : renderDiscoverTab();
    case 'clips':
      return dk
        ? `${renderDesktopTopbar()}${renderClipsTab()}${renderDesktopFooter()}`
        : renderClipsTab();
    case 'discover':
      return renderDiscoverTab();
    case 'search':
      return renderSearchTab();
    case 'mysuno':
      return renderMySunoTab();
    case 'downloads':
      return dk
        ? `${renderDesktopTopbar()}${renderDownloadsView()}${renderDesktopFooter()}`
        : renderDownloadsView();
    case 'detail': {
      const item = getItemByKey(state.detailKey);
      const key = item ? getMediaKey(item) : '';
      const seasons =
        item?.mediaType === 'tv'
          ? state.seasonsCache.get(String(item.tmdbId || item.imdbId)) ||
            item.seasonsList || [{ seasonNumber: 1, name: 'Season 1', episodeCount: item.totalEpisodes || 10 }]
          : [];
      const related = getAllKnownPool().filter((x) => getMediaKey(x) !== key);
      const detailHtml = renderDetailView({
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
      return dk ? `${renderDesktopTopbar()}${detailHtml}${renderDesktopFooter()}` : detailHtml;
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
  document.getElementById('nav-mount').innerHTML =
    state.playerOpen || isDesktopMode() ? '' : renderFloatingBottomNav();
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
      state.desktopSearchOpen = false;
      window.scrollTo({ top: 0, behavior: 'instant' });
      render();
      return;
    }

    const dkFilterBtn = target.closest('[data-dk-filter]');
    if (dkFilterBtn) {
      state.tab = 'home';
      state.homeFilter = dkFilterBtn.dataset.dkFilter;
      state.desktopSearchOpen = false;
      window.scrollTo({ top: 0, behavior: 'instant' });
      render();
      return;
    }

    if (target.closest('[data-open-languages="true"]')) {
      state.prevTab = state.tab;
      state.tab = 'languages';
      state.desktopSearchOpen = false;
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (state.langItems.length === 0) {
        loadLanguageFeed(state.langValue);
      } else {
        render();
      }
      return;
    }

    if (target.closest('#dk-search-toggle')) {
      state.desktopSearchOpen = true;
      render();
      setTimeout(() => document.getElementById('dk-search-input')?.focus(), 20);
      return;
    }

    if (target.closest('#dk-search-close')) {
      state.desktopSearchOpen = false;
      if (state.tab === 'search' && !state.searchQuery.trim()) {
        state.tab = state.prevTab || 'home';
      }
      render();
      return;
    }

    const scrollRowBtn = target.closest('[data-scroll-row]');
    if (scrollRowBtn) {
      const row = document.getElementById(`row-${scrollRowBtn.dataset.scrollRow}`);
      if (row) {
        const dir = Number(scrollRowBtn.dataset.dir) || 1;
        row.scrollBy({ left: dir * Math.max(480, row.clientWidth * 0.78), behavior: 'smooth' });
      }
      return;
    }

    const heroStep = target.closest('[data-hero-step]');
    if (heroStep) {
      state.heroIndex = (state.heroIndex + Number(heroStep.dataset.heroStep) + 8) % 8;
      render();
      return;
    }

    if (target.closest('#refresh-home-feed-btn')) {
      state.homeFeedOffset += 1;
      loadHomeDynamicFeeds();
      return;
    }

    const openDiscBtn = target.closest('[data-open-discover]');
    if (openDiscBtn) {
      state.tab = 'discover';
      state.discoverType = openDiscBtn.dataset.openDiscover;
      refreshDiscoverFeed({ reset: true });
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
      showToast(next ? 'No-Redirect Sandbox ON (blocks all popups)' : 'Sandbox OFF (unrestricted)');
      render({ forceReload: true });
      return;
    }
    const switchProvBtn = target.closest('[data-switch-provider]');
    if (switchProvBtn) {
      const prov = switchProvBtn.dataset.switchProvider;
      state.prefs = savePlayerPrefs({ playerProvider: prov });
      if (prov === 'vidrift-direct') {
        antiRedirectGuard.setStrictFrameMode(false);
      } else {
        antiRedirectGuard.setStrictFrameMode(true);
      }
      state.shield = antiRedirectGuard.getSnapshot();
      showToast(`Switched stream to ${PLAYER_PROVIDERS.find((x) => x.id === prov)?.label || prov}`);
      render({ forceReload: true });
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
      const playerProvider = document.getElementById('pref-provider')?.value || 'vidlink';

      state.profile = saveProfile({ name });
      antiRedirectGuard.setNavigationLock(navLock);
      antiRedirectGuard.setStrictFrameMode(strictSandbox);
      state.shield = antiRedirectGuard.getSnapshot();
      state.prefs = savePlayerPrefs({ autoplay, dub, sub, tmdbApiKey, phoneFrameOnDesktop, playerProvider });
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
      return;
    }
    if (t.id === 'lang-pref-select') {
      state.langPref = t.value;
      render();
      return;
    }
    if (t.id === 'lang-val-select') {
      loadLanguageFeed(t.value);
    }
  });

  rootEl.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'global-search-input' || t.id === 'dk-search-input') {
      const sourceId = t.id;
      const isDk = sourceId === 'dk-search-input';
      state.searchQuery = t.value;
      if (isDk && state.tab !== 'search') {
        state.prevTab = state.tab;
        state.tab = 'search';
      }
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        const pos = t.selectionStart;
        runSearch(state.searchQuery).then(() => {
          const fresh = document.getElementById(sourceId);
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
    if (e.target.id === 'global-search-form' || e.target.id === 'dk-search-form') {
      if (e.target.id === 'dk-search-form') {
        state.tab = 'search';
        state.desktopSearchOpen = true;
      }
      const val =
        e.target.querySelector('input')?.value ??
        document.getElementById('global-search-input')?.value ??
        state.searchQuery;
      runSearch(val);
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
    const parsed = parseAnyPlayerMessage(event);
    if (!parsed) return;
    if (parsed.eventType === 'progress' && state.activeItem) {
      const currentTime = Number(parsed.currentTime || 0);
      const duration = Number(parsed.duration || 0);
      state.livePlayback = { currentTime, duration };
      state.progressMap = saveMediaProgress(state.activeItem, {
        currentTime,
        duration,
        season: state.activeSeason,
        episode: state.activeEpisode,
      });
    } else if (parsed.eventType === 'exit') {
      state.playerOpen = false;
      antiRedirectGuard.setTheaterActive(false);
      render();
    }
  });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const next = window.innerWidth >= 900;
      if (next !== state.isDesktop) {
        state.isDesktop = next;
        render();
      }
    }, 120);
  });
}

async function loadHomeDynamicFeeds() {
  state.homeRefreshing = true;
  if (state.tab === 'home') render();
  try {
    const feeds = await fetchDynamicHomeFeeds({ pageOffset: state.homeFeedOffset });
    for (const list of [feeds.trendingMovies, feeds.trendingSeries, feeds.genreFeedA, feeds.genreFeedB, feeds.trendingAnime]) {
      registerItems(list);
    }
    if (feeds.trendingMovies.length) state.liveMovies = feeds.trendingMovies;
    if (feeds.trendingSeries.length) state.liveSeries = feeds.trendingSeries;
    state.liveGenreLabelA = feeds.genreLabelA;
    if (feeds.genreFeedA.length) state.liveGenreFeedA = feeds.genreFeedA;
    state.liveGenreLabelB = feeds.genreLabelB;
    if (feeds.genreFeedB.length) state.liveGenreFeedB = feeds.genreFeedB;
    if (feeds.trendingAnime.length) state.liveAnimeTrending = feeds.trendingAnime;
    state.heroIndex = 0;
  } finally {
    state.homeRefreshing = false;
    if (state.tab === 'home') render();
  }
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
  state.progressMap = loadProgressMap();
  render();

  clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    const busyHover = typeof document !== 'undefined' && document.querySelector('.dk-card:hover, #dk-search-input:focus');
    if (state.tab === 'home' && !state.playerOpen && !state.modal && !busyHover) {
      state.heroIndex = (state.heroIndex + 1) % 8;
      render();
    }
  }, 10000);

  await loadHomeDynamicFeeds();
}

init();
