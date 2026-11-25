import {
  SONIC_PROFILES,
  SCORE_MOODS,
  inferSonicProfileFromText,
  buildAfterTrackMatches,
} from './utils/sonic-engine.js';
import {
  buildVidriftEmbedUrl,
  parseDirectTarget,
  parseVidriftMessage,
  buildVidriftCommand,
  VIDRIFT_ORIGIN,
} from './utils/vidrift.js';
import { sonicCurtain } from './utils/audio-curtain.js';
import {
  APPEARANCE_THEMES,
  LIKED_COLLECTION_ID,
  loadAppearanceSettings,
  saveAppearanceSettings,
  loadPlayerPrefs,
  savePlayerPrefs,
  getMediaKey,
  loadProgressMap,
  saveMediaProgress,
  loadCollections,
  saveCollections,
  loadSearchHistory,
  rememberSearch,
  forgetSearch,
} from './utils/storage.js';
import { svgIcon, renderWordmarkSvg } from './components/icons.js';
import { mountFluidHalo } from './components/canvas-halo.js';
import { buildCinemaFallbackArt } from './utils/poster-art.js';
import {
  escapeHtml,
  resolveArtUrl,
  attachFallbackImgAttr,
  formatTime,
  renderMediaCard,
  renderShelf,
  renderSongFilmRow,
  renderMoodTiles,
} from './components/cards.js';
import { renderSettingsModal, renderQuickLaunchModal } from './components/modals.js';
import {
  loadCatalogData,
  loadTrendingAnime,
  searchAllMedia,
  fetchTvSeasonsData,
} from './utils/client-api.js';

const rootEl = document.getElementById('app');

const state = {
  catalog: [],
  catalogMap: new Map(),
  liveAnimeTrending: [],
  searchResults: [],
  searchLoading: false,
  searchOpen: false,
  searchQuery: '',
  route: 'home', // 'home' | 'bridge' | 'explore' | 'library' | 'detail' | 'collection' | 'search'
  detailKey: null,
  collectionId: null,
  exploreFilter: 'all',
  sidebarCollapsed: false,
  mobileDrawerOpen: false,
  creatingMixtape: false,
  ecosystemOpen: false,
  modal: null, // 'settings' | 'quicklaunch' | null
  appearance: loadAppearanceSettings(),
  prefs: loadPlayerPrefs(),
  progressMap: loadProgressMap(),
  collections: loadCollections(),
  searchHistory: loadSearchHistory(),
  activeItem: null,
  activeSeason: 1,
  activeEpisode: 1,
  isExpanded: false,
  isPaused: false,
  panelTab: 'upnext', // 'upnext' | 'episodes' | 'sonic'
  queue: [],
  livePlayback: { currentTime: 0, duration: 0 },
  afterCreditsItem: null,
  vidriftLog: [],
  toast: '',
  seasonsCache: new Map(),
};

let cleanupHalo = null;
let toastTimer = null;
let searchDebounce = null;

function showToast(msg) {
  state.toast = msg;
  renderToastOnly();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = '';
    renderToastOnly();
  }, 2600);
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
    const enriched = { ...item, id: key };
    if (!state.catalogMap.has(key) || !state.catalogMap.get(key).poster) {
      state.catalogMap.set(key, enriched);
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

function getLikedSet() {
  const col = state.collections.find((c) => c.id === LIKED_COLLECTION_ID);
  return new Set(col?.items || []);
}

function getActiveSonicProfile() {
  if (state.prefs.customTrackQuery) {
    return inferSonicProfileFromText(state.prefs.customTrackQuery);
  }
  return SONIC_PROFILES.find((p) => p.id === state.prefs.activeMoodId) || SONIC_PROFILES[0];
}

function getActivePalette() {
  const t = APPEARANCE_THEMES.find((x) => x.id === state.appearance.theme) || APPEARANCE_THEMES[0];
  return t.colors;
}

function getCurrentEmbedUrl() {
  if (!state.activeItem) return '';
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
  state.vidriftLog = [`→ Sent ${action} ${JSON.stringify(payload)}`, ...state.vidriftLog].slice(0, 12);
  return true;
}

function launchStream(item, { season, episode, expand = true, resumeSeconds } = {}) {
  if (!item) return;
  const key = getMediaKey(item);
  registerItems([item]);

  // Smoothly crossfade out Sonic Curtain audio before entering cinema
  if (sonicCurtain.isPlaying) {
    sonicCurtain.stop(600);
  }

  const saved = state.progressMap[key];
  const resolvedSeason = season ?? saved?.season ?? item.season ?? 1;
  const resolvedEpisode = episode ?? saved?.episode ?? item.episode ?? 1;

  state.activeItem = getItemByKey(key) || item;
  state.activeSeason = resolvedSeason;
  state.activeEpisode = resolvedEpisode;
  state.isExpanded = expand;
  state.isPaused = false;
  state.afterCreditsItem = null;
  state.livePlayback = {
    currentTime: saved?.currentTime || 0,
    duration: saved?.duration || 0,
  };

  // Populate sonic-matched Up Next queue automatically
  const profile = getActiveSonicProfile();
  const { ranked } = buildAfterTrackMatches(state.catalog, profile);
  const upNext = ranked.filter((x) => getMediaKey(x) !== key).slice(0, 12);
  state.queue = [state.activeItem, ...upNext];
  state.panelTab = item.mediaType === 'tv' || item.mediaType === 'anime' ? 'episodes' : 'upnext';

  if (item.mediaType === 'tv' && item.tmdbId) {
    loadTvSeasons(item.tmdbId);
  }

  saveMediaProgress(state.activeItem, {
    season: resolvedSeason,
    episode: resolvedEpisode,
    currentTime: saved?.currentTime || 0,
    duration: saved?.duration || 0,
  });
  state.progressMap = loadProgressMap();

  render();

  const targetResume = resumeSeconds ?? (saved?.currentTime > 15 ? Math.floor(saved.currentTime) : 0);
  if (targetResume > 0) {
    setTimeout(() => {
      sendPlayerCommand('resume', { currentTime: targetResume });
      showToast(`Resumed at ${formatTime(targetResume)}`);
    }, 1100);
  }
}

async function loadTvSeasons(tmdbId) {
  if (state.seasonsCache.has(String(tmdbId))) return;
  const seasons = await fetchTvSeasonsData(tmdbId, state.prefs.tmdbApiKey);
  if (Array.isArray(seasons)) {
    state.seasonsCache.set(String(tmdbId), seasons);
    if (state.isExpanded || state.route === 'detail') render();
  }
}

function toggleLike(key) {
  const col = state.collections.find((c) => c.id === LIKED_COLLECTION_ID);
  if (!col) return;
  const exists = col.items.includes(key);
  col.items = exists ? col.items.filter((x) => x !== key) : [key, ...col.items];
  state.collections = saveCollections([...state.collections]);
  showToast(exists ? 'Removed from Liked Films' : 'Saved to Liked Films');
  render();
}

function addToMixtape(collectionId, key) {
  const col = state.collections.find((c) => c.id === collectionId);
  if (!col) return;
  if (!col.items.includes(key)) {
    col.items = [...col.items, key];
    state.collections = saveCollections([...state.collections]);
    showToast(`Added to "${col.name}"`);
  } else {
    showToast(`Already in "${col.name}"`);
  }
  render();
}

function renderSidebar() {
  const navItems = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'bridge', label: 'Sonic Bridge', icon: 'wave' },
    { id: 'explore', label: 'Explore', icon: 'compass' },
    { id: 'library', label: 'Library', icon: 'library' },
  ];

  return `<aside class="sidebar ${state.sidebarCollapsed ? 'is-collapsed' : ''} ${
    state.mobileDrawerOpen ? 'is-open' : ''
  }" aria-label="Main navigation">
    <nav class="sidebar-nav">
      ${navItems
        .map(
          (n) => `<button type="button" class="nav-item ${
            state.route === n.id ? 'is-active' : ''
          }" data-nav="${n.id}">
            ${svgIcon(n.icon, 21)}
            <span class="nav-label">${n.label}</span>
          </button>`
        )
        .join('')}
    </nav>

    ${
      !state.sidebarCollapsed
        ? `<div class="sidebar-divider"></div>
        ${
          state.creatingMixtape
            ? `<form class="sidebar-new" id="new-mixtape-form">
                <input id="new-mixtape-input" placeholder="Mixtape name..." maxlength="60" autofocus />
              </form>`
            : `<button type="button" class="pill-button sidebar-new-button" id="start-mixtape-btn">
                ${svgIcon('plus', 17)} New mixtape
              </button>`
        }
        <div class="sidebar-playlists">
          ${state.collections
            .map(
              (c) => `<button type="button" class="playlist-item ${
                state.route === 'collection' && state.collectionId === c.id ? 'is-active' : ''
              }" data-open-collection="${escapeHtml(c.id)}">
                <span class="playlist-name">${escapeHtml(c.name)}</span>
                <span class="playlist-sub">${c.auto ? 'Auto mixtape' : `${c.items.length} titles`}</span>
              </button>`
            )
            .join('')}
        </div>
        <div class="sidebar-footer">
          <a class="sidebar-eco-link" href="https://sunov2.vercel.app/app" target="_blank" rel="noopener noreferrer">
            <div>
              <div style="font-weight:600;">Suno Music</div>
              <div class="dim" style="font-size:11px;">Open audio player</div>
            </div>
            ${svgIcon('external', 15)}
          </a>
        </div>`
        : ''
    }
  </aside>`;
}

function renderTopbar() {
  const direct = parseDirectTarget(state.searchQuery);
  const showHistory = !state.searchQuery.trim() && state.searchHistory.length > 0;
  const quickSuggestions = state.searchQuery.trim()
    ? state.catalog
        .filter((x) => x.title.toLowerCase().includes(state.searchQuery.trim().toLowerCase()))
        .slice(0, 6)
    : [];
  const sugOpen = state.searchOpen && (showHistory || quickSuggestions.length > 0 || Boolean(direct));

  return `<header class="topbar">
    <div class="topbar-left">
      <button type="button" class="icon-button" id="toggle-sidebar-btn" aria-label="Menu">
        ${svgIcon('menu', 21)}
      </button>
      <div class="wordmark" data-nav="home" role="button" tabindex="0">
        <span class="wordmark-badge">${renderWordmarkSvg()}</span>
        <span class="wordmark-text">Suno <span class="wordmark-light">Cinema</span></span>
        <span class="suno-product-tag">a Suno Product</span>
      </div>
    </div>

    <div class="searchbox ${sugOpen ? 'is-open' : ''}" id="searchbox-wrap">
      <form class="searchbox-field" id="global-search-form">
        <span class="searchbox-icon">${svgIcon('search', 18)}</span>
        <input
          id="global-search-input"
          type="text"
          autocomplete="off"
          placeholder="Search movies, series, anime, song moods, or paste TMDB/AniList ID..."
          value="${escapeHtml(state.searchQuery)}"
        />
        ${
          state.searchQuery
            ? `<button type="button" class="icon-button" id="clear-search-btn" style="width:30px;height:30px;" aria-label="Clear search">
                ${svgIcon('close', 16)}
              </button>`
            : ''
        }
      </form>
      ${
        sugOpen
          ? `<ul class="suggestions">
              ${
                direct
                  ? `<li class="sug-row" data-launch-direct="true">
                      <span class="sug-main">${svgIcon('play', 16)} <span>Stream <strong>${escapeHtml(
                      direct.mediaType.toUpperCase()
                    )} #${escapeHtml(direct.tmdbId || direct.anilistId)}</strong> directly via VidRift</span></span>
                      <span class="sug-meta">Instant</span>
                    </li>`
                  : ''
              }
              ${
                showHistory
                  ? state.searchHistory
                      .map(
                        (h) => `<li class="sug-row">
                          <button type="button" class="sug-main" data-run-search="${escapeHtml(h)}">
                            ${svgIcon('search', 15)} <span>${escapeHtml(h)}</span>
                          </button>
                          <button type="button" class="icon-button" data-forget-search="${escapeHtml(
                            h
                          )}" style="width:28px;height:28px;" aria-label="Remove">${svgIcon('close', 14)}</button>
                        </li>`
                      )
                      .join('')
                  : quickSuggestions
                      .map(
                        (item) => `<li class="sug-row" data-open-detail="${escapeHtml(getMediaKey(item))}">
                          <span class="sug-main">${svgIcon('film', 15)} <span>${escapeHtml(item.title)}</span></span>
                          <span class="sug-meta">${escapeHtml(item.year || '')} • ${escapeHtml(
                          item.mediaType.toUpperCase()
                        )}</span>
                        </li>`
                      )
                      .join('')
              }
            </ul>`
          : ''
      }
    </div>

    <div class="topbar-right">
      <button type="button" class="icon-button" id="open-quicklaunch-btn" title="Stream by TMDB / AniList ID or URL" aria-label="Quick Stream">
        ${svgIcon('link', 19)}
      </button>
      <button type="button" class="icon-button" id="toggle-eco-btn" title="Suno Ecosystem" aria-label="Suno Ecosystem">
        ${svgIcon('music', 19)}
      </button>
      <button type="button" class="icon-button" id="open-settings-btn" title="Themes & VidRift Settings" aria-label="Settings">
        ${svgIcon('settings', 19)}
      </button>
      <button type="button" class="avatar" id="avatar-settings-btn" title="Suno Appearance">S</button>

      ${
        state.ecosystemOpen
          ? `<div class="account-pop" role="menu">
              <div class="provider-pop-title">Suno Ecosystem</div>
              <button type="button" class="menu-item" data-nav="bridge">
                <span class="menu-item-mark">${svgIcon('check', 16)}</span>
                <span class="menu-item-text">
                  <span class="menu-item-name">Suno Cinema (Active)</span>
                  <span class="menu-item-desc">Watch movies, series & anime after listening via VidRift</span>
                </span>
              </button>
              <a class="menu-item" href="https://sunov2.vercel.app/app" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;">
                <span class="menu-item-mark">${svgIcon('music', 16)}</span>
                <span class="menu-item-text">
                  <span class="menu-item-name">Suno Music ↗</span>
                  <span class="menu-item-desc">Listen to tracks first on sunov2.vercel.app/app</span>
                </span>
              </a>
              <div class="provider-pop-note">
                Appearance settings (<code>suno:appearance_settings</code>) &amp; themes stay aligned across Suno Cinema.
              </div>
            </div>`
          : ''
      }
    </div>
  </header>`;
}

function renderSonicBridgeHero(profile, arc, { compact = false } = {}) {
  const playingThis = sonicCurtain.isPlaying && sonicCurtain.activeMoodId === profile.curtainPatch;
  const topDrop = arc[0]?.item;

  return `<section class="sonic-bridge-card">
    <div class="sonic-bridge-main">
      <div class="sonic-eyebrow">
        <span class="sonic-live-dot"></span>
        <span>After-Track Cinema Engine • a Suno Product</span>
      </div>
      <h1 class="sonic-bridge-title">${
        compact ? 'What song just ended on Suno?' : `Just finished "${escapeHtml(profile.trackTitle)}"?`
      }</h1>
      <p class="sonic-bridge-desc">
        ${escapeHtml(profile.description)} Pick a sonic cue or type any track/artist you just heard — Suno Cinema tunes the catalog and transitions smoothly into your next film.
      </p>

      <form class="sonic-input-row" id="sonic-prompt-form">
        <div class="sonic-prompt-box">
          ${svgIcon('music', 16)}
          <input
            id="sonic-track-input"
            type="text"
            placeholder="Type any track or vibe (e.g. Nightcall, Radiohead, 3 AM rain jazz)..."
            value="${escapeHtml(state.prefs.customTrackQuery || '')}"
          />
        </div>
        <button type="button" class="pill-button ${playingThis ? 'is-accent' : ''}" id="audition-curtain-btn" data-curtain="${escapeHtml(
    profile.curtainPatch
  )}">
          ${svgIcon(playingThis ? 'pause' : 'wave', 16)}
          ${playingThis ? 'Stop Sonic Curtain' : 'Audition Vibe'}
        </button>
        ${
          topDrop
            ? `<button type="button" class="primary-button" data-play-key="${escapeHtml(getMediaKey(topDrop))}">
                ${svgIcon('play', 16)} Drop Into ${escapeHtml(topDrop.title)}
              </button>`
            : ''
        }
      </form>

      <div class="sonic-preset-chips">
        ${SONIC_PROFILES.map(
          (p) => `<button type="button" class="sonic-chip ${
            !state.prefs.customTrackQuery && state.prefs.activeMoodId === p.id ? 'is-active' : ''
          }" data-pick-sonic="${escapeHtml(p.id)}">
            <span>${escapeHtml(p.trackTitle)}</span>
          </button>`
        ).join('')}
      </div>

      ${
        arc.length > 0
          ? `<div class="arc-strip">
              ${arc
                .map(
                  (step) => `<button type="button" class="arc-card" data-play-key="${escapeHtml(
                    getMediaKey(step.item)
                  )}">
                    <div class="arc-thumb">
                      <img src="${escapeHtml(resolveArtUrl(step.item, 'wide'))}" alt="" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
                    step.item,
                    'wide'
                  )} />
                    </div>
                    <div class="arc-meta">
                      <span class="arc-stage">${escapeHtml(step.stage)}</span>
                      <span class="arc-title">${escapeHtml(step.item.title)}</span>
                      <span class="arc-sub">${escapeHtml(step.item.sonicMatch?.reason || step.note)}</span>
                    </div>
                  </button>`
                )
                .join('')}
            </div>`
          : ''
      }
    </div>

    <div class="sonic-halo-panel">
      <div class="sonic-halo-canvas-wrap">
        <canvas class="sonic-halo-canvas" id="sonic-halo-canvas"></canvas>
        <div class="sonic-halo-center">
          <div class="sonic-halo-bpm">${profile.bpm} BPM</div>
          <div class="sonic-halo-key">${escapeHtml(profile.keySignature)}</div>
        </div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:13px;font-weight:600;">${escapeHtml(profile.moodLabel)}</div>
        <div class="dim" style="font-size:11px;margin-top:2px;">${escapeHtml(profile.artistCue)}</div>
      </div>
    </div>
  </section>`;
}

function renderHomePage() {
  const profile = getActiveSonicProfile();
  const { ranked, arc } = buildAfterTrackMatches(state.catalog, profile);
  const likedIds = getLikedSet();

  const continueItems = Object.values(state.progressMap)
    .filter((entry) => entry?.item && entry.currentTime > 5)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((entry) => getItemByKey(getMediaKey(entry.item)) || entry.item);

  const movies = ranked.filter((x) => x.mediaType === 'movie');
  const series = ranked.filter((x) => x.mediaType === 'tv');
  const anime = state.liveAnimeTrending.length
    ? state.liveAnimeTrending
    : ranked.filter((x) => x.mediaType === 'anime');

  const filterChips = [
    { id: 'all', label: 'All After-Track' },
    { id: 'movie', label: 'Feature Films' },
    { id: 'tv', label: 'Prestige Series' },
    { id: 'anime', label: 'Anime & OST' },
    { id: 'bridge', label: 'Sonic Bridge Lab' },
  ];

  return `<div class="page">
    <div class="chip-row">
      ${filterChips
        .map(
          (c) => `<button type="button" class="chip ${
            c.id === 'all' ? 'is-active' : ''
          }" data-home-chip="${c.id}">${c.label}</button>`
        )
        .join('')}
    </div>

    ${renderSonicBridgeHero(profile, arc)}

    ${
      continueItems.length > 0
        ? renderShelf({
            id: 'continue',
            title: 'Continue watching',
            items: continueItems,
            wide: true,
            progressMap: state.progressMap,
            likedIds,
            moreRoute: 'library',
          })
        : ''
    }

    ${renderShelf({
      id: 'matched-wide',
      title: `Matched to "${profile.trackTitle}"`,
      items: ranked.slice(0, 12),
      wide: true,
      ranked: true,
      progressMap: state.progressMap,
      likedIds,
      moreRoute: 'bridge',
    })}

    <section class="shelf">
      <div class="shelf-head">
        <h2 class="shelf-title">After-track queue picks</h2>
        <button type="button" class="pill-button" style="height:32px;padding:0 14px;font-size:12px;" data-nav="bridge">Open Sonic Bridge</button>
      </div>
      <div class="track-list">
        ${ranked
          .slice(0, 5)
          .map((item, idx) =>
            renderSongFilmRow(item, idx, {
              activeKey: state.activeItem ? getMediaKey(state.activeItem) : '',
            })
          )
          .join('')}
      </div>
    </section>

    <section class="shelf">
      <div class="shelf-head">
        <h2 class="shelf-title">Score moods & sonic textures</h2>
      </div>
      ${renderMoodTiles(SCORE_MOODS, profile.id)}
    </section>

    ${renderShelf({
      id: 'movies-shelf',
      title: 'Essential cinema features',
      items: movies,
      wide: false,
      progressMap: state.progressMap,
      likedIds,
      moreRoute: 'explore',
    })}

    ${renderShelf({
      id: 'series-shelf',
      title: 'Late-night prestige series',
      items: series,
      wide: false,
      progressMap: state.progressMap,
      likedIds,
      moreRoute: 'explore',
    })}

    ${renderShelf({
      id: 'anime-shelf',
      title: 'Anime & iconic soundtracks (AniList Live)',
      items: anime,
      wide: false,
      progressMap: state.progressMap,
      likedIds,
      moreRoute: 'explore',
    })}
  </div>`;
}

function renderBridgePage() {
  const profile = getActiveSonicProfile();
  const { ranked, arc } = buildAfterTrackMatches(state.catalog, profile);

  return `<div class="page">
    ${renderSonicBridgeHero(profile, arc, { compact: true })}

    <section class="shelf">
      <div class="shelf-head">
        <h2 class="shelf-title">Acoustic affinity ranking (${ranked.length} titles scored)</h2>
      </div>
      <div class="track-list">
        ${ranked
          .slice(0, 18)
          .map((item, idx) =>
            renderSongFilmRow(item, idx, {
              activeKey: state.activeItem ? getMediaKey(state.activeItem) : '',
            })
          )
          .join('')}
      </div>
    </section>
  </div>`;
}

function renderExplorePage() {
  const likedIds = getLikedSet();
  const profile = getActiveSonicProfile();
  const { ranked } = buildAfterTrackMatches(state.catalog, profile);
  const filtered =
    state.exploreFilter === 'all'
      ? ranked
      : ranked.filter((x) => x.mediaType === state.exploreFilter);

  const tabs = [
    { id: 'all', label: `All (${ranked.length})` },
    { id: 'movie', label: 'Movies' },
    { id: 'tv', label: 'TV Series' },
    { id: 'anime', label: 'Anime' },
  ];

  return `<div class="page">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <h1 style="font-size:28px;font-weight:700;letter-spacing:-0.5px;">Explore Suno Cinema</h1>
      <button type="button" class="pill-button" id="explore-quicklaunch-btn">
        ${svgIcon('link', 16)} Launch TMDB / AniList ID
      </button>
    </div>

    <div class="chip-row">
      ${tabs
        .map(
          (t) => `<button type="button" class="chip ${
            state.exploreFilter === t.id ? 'is-active' : ''
          }" data-explore-filter="${t.id}">${t.label}</button>`
        )
        .join('')}
    </div>

    <section class="shelf">
      <div class="shelf-head"><h2 class="shelf-title">Score moods</h2></div>
      ${renderMoodTiles(SCORE_MOODS, profile.id)}
    </section>

    <div class="card-grid">
      ${filtered
        .map((item) => {
          const key = getMediaKey(item);
          return renderMediaCard(item, {
            progress: state.progressMap[key],
            liked: likedIds.has(key),
          });
        })
        .join('')}
    </div>
  </div>`;
}

function renderLibraryPage() {
  const likedIds = getLikedSet();
  const continueItems = Object.values(state.progressMap)
    .filter((e) => e?.item && e.currentTime > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((e) => getItemByKey(getMediaKey(e.item)) || e.item);

  const likedItems = Array.from(likedIds)
    .map((k) => getItemByKey(k))
    .filter(Boolean);

  return `<div class="page">
    <h1 style="font-size:28px;font-weight:700;letter-spacing:-0.5px;">Your Cinema Library</h1>

    ${
      continueItems.length > 0
        ? renderShelf({
            id: 'lib-continue',
            title: 'Continue watching (synced from VidRift)',
            items: continueItems,
            wide: true,
            progressMap: state.progressMap,
            likedIds,
          })
        : `<div class="season-ep-box"><p class="dim">Start streaming any movie, series, or anime — VidRift playback timestamps appear here automatically.</p></div>`
    }

    <section class="shelf">
      <div class="shelf-head"><h2 class="shelf-title">Double-feature mixtapes</h2></div>
      <div class="mood-grid">
        ${state.collections
          .map(
            (c) => `<button type="button" class="mood-tile" data-open-collection="${escapeHtml(
              c.id
            )}" style="--mood:var(--accent)">
              <span class="mood-bar"></span>
              <span class="mood-label">${escapeHtml(c.name)} (${c.items.length})</span>
            </button>`
          )
          .join('')}
      </div>
    </section>

    <section class="shelf">
      <div class="shelf-head"><h2 class="shelf-title">Liked films (${likedItems.length})</h2></div>
      ${
        likedItems.length > 0
          ? `<div class="card-grid">
              ${likedItems
                .map((item) => {
                  const key = getMediaKey(item);
                  return renderMediaCard(item, {
                    progress: state.progressMap[key],
                    liked: true,
                  });
                })
                .join('')}
            </div>`
          : `<p class="dim">Tap the heart on any film card to save it here.</p>`
      }
    </section>
  </div>`;
}

function renderCollectionPage() {
  const col = state.collections.find((c) => c.id === state.collectionId) || state.collections[0];
  const likedIds = getLikedSet();
  const items = (col?.items || []).map((k) => getItemByKey(k)).filter(Boolean);

  return `<div class="page">
    <div class="hero">
      <div class="hero-art">
        <img src="${escapeHtml(
          items[0]
            ? resolveArtUrl(items[0], 'poster')
            : buildCinemaFallbackArt({ title: col?.name || 'Mixtape', creator: 'Suno Double Feature', mediaType: 'movie' }, 'poster')
        )}" alt="" referrerpolicy="no-referrer" />
      </div>
      <div class="hero-body">
        <span class="sonic-eyebrow">Suno Double-Feature Mixtape</span>
        <h1 class="hero-title">${escapeHtml(col?.name || 'Mixtape')}</h1>
        <p class="hero-meta">${items.length} curated titles • ${escapeHtml(col?.subtitle || 'Custom arc')}</p>
        <div class="hero-actions">
          ${
            items[0]
              ? `<button type="button" class="primary-button" data-play-key="${escapeHtml(
                  getMediaKey(items[0])
                )}">${svgIcon('play', 16)} Play Feature Arc</button>`
              : ''
          }
        </div>
      </div>
    </div>

    <div class="track-list">
      ${
        items.length > 0
          ? items.map((item, idx) => renderSongFilmRow(item, idx)).join('')
          : `<p class="dim">This mixtape is empty. Open any film and add it to "${escapeHtml(col?.name || '')}".</p>`
      }
    </div>
  </div>`;
}

function renderSearchPage() {
  const likedIds = getLikedSet();
  const direct = parseDirectTarget(state.searchQuery);

  return `<div class="page">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div>
        <h1 style="font-size:26px;font-weight:700;">Results for "${escapeHtml(state.searchQuery)}"</h1>
        <p class="dim" style="font-size:13px;margin-top:4px;">Searching Suno Cinema catalog, AniList live & Wikidata/TMDB</p>
      </div>
      ${
        direct
          ? `<button type="button" class="primary-button" data-launch-direct="true">
              ${svgIcon('play', 16)} Stream ${escapeHtml(direct.mediaType.toUpperCase())} #${escapeHtml(
              direct.tmdbId || direct.anilistId
            )}
            </button>`
          : ''
      }
    </div>

    ${
      state.searchLoading
        ? `<p class="dim">Querying catalog & live databases...</p>`
        : state.searchResults.length > 0
        ? `<div class="card-grid">
            ${state.searchResults
              .map((item) => {
                const key = getMediaKey(item);
                return renderMediaCard(item, {
                  progress: state.progressMap[key],
                  liked: likedIds.has(key),
                });
              })
              .join('')}
          </div>`
        : `<div class="season-ep-box">
            <p>No direct catalog match found. You can still stream <strong>any</strong> TMDB or AniList title immediately using the Direct ID Launcher!</p>
            <div>
              <button type="button" class="pill-button" id="search-open-ql">${svgIcon('link', 16)} Launch by TMDB / AniList ID</button>
            </div>
          </div>`
    }
  </div>`;
}

function renderDetailPage() {
  const item = getItemByKey(state.detailKey);
  if (!item) {
    return `<div class="page"><p class="dim">Title not found.</p></div>`;
  }
  const key = getMediaKey(item);
  const saved = state.progressMap[key];
  const liked = getLikedSet().has(key);
  const profile = getActiveSonicProfile();
  const { ranked } = buildAfterTrackMatches(state.catalog, profile);
  const related = ranked.filter((x) => getMediaKey(x) !== key).slice(0, 8);

  const seasons =
    item.mediaType === 'tv'
      ? state.seasonsCache.get(String(item.tmdbId)) ||
        item.seasonsList || [{ seasonNumber: 1, name: 'Season 1', episodeCount: item.totalEpisodes || 10 }]
      : [];
  const activeSeasonObj = seasons.find((s) => s.seasonNumber === state.activeSeason) || seasons[0];
  const epCount =
    item.mediaType === 'anime' ? item.totalEpisodes || 12 : activeSeasonObj?.episodeCount || 10;

  return `<div class="page">
    <div class="hero">
      <div class="hero-art">
        <img src="${escapeHtml(resolveArtUrl(item, 'poster'))}" alt="${escapeHtml(
    item.title
  )}" referrerpolicy="no-referrer" ${attachFallbackImgAttr(item, 'poster')} />
      </div>
      <div class="hero-body">
        <span class="sonic-eyebrow">${escapeHtml(item.mediaType.toUpperCase())} • ${escapeHtml(
    item.year || 'Feature'
  )} • ★ ${escapeHtml(item.rating || '8.4')}</span>
        <h1 class="hero-title">${escapeHtml(item.title)}</h1>
        <p class="hero-meta">${escapeHtml(item.creator || 'Suno Cinema')} • ${escapeHtml(
    item.runtime || ''
  )} • ${escapeHtml((item.genres || []).join(', '))}</p>
        <p class="hero-description">${escapeHtml(item.overview || 'Stream seamlessly through VidRift with Suno Sonic pairing.')}</p>

        <div class="hero-sonic-strip">
          <div><span class="dim">Sonic DNA:</span> <strong>${escapeHtml(
            item.sonic?.texture || 'Atmospheric Score'
          )}</strong></div>
          <div><span class="dim">Listen First:</span> <strong>${escapeHtml(
            item.sonic?.listenBefore || 'Suno Night Mix'
          )}</strong></div>
          <div><span class="dim">After-Credits:</span> <strong>${escapeHtml(
            item.sonic?.cooldownCue || 'Ambient Reverb'
          )}</strong></div>
        </div>

        <div class="hero-actions">
          <button type="button" class="primary-button" data-play-key="${escapeHtml(key)}">
            ${svgIcon('play', 16)} ${
    saved?.currentTime > 15 ? `Resume (${formatTime(saved.currentTime)})` : 'Stream on VidRift'
  }
          </button>
          <button type="button" class="pill-button" id="detail-audition-btn" data-curtain="${escapeHtml(
            item.sonic?.moodId || 'midnight-synth'
          )}">
            ${svgIcon('wave', 16)} Audition Score Mood
          </button>
          <button type="button" class="pill-button" data-toggle-like="${escapeHtml(key)}">
            ${svgIcon(liked ? 'heartFill' : 'heart', 16)} ${liked ? 'Liked' : 'Save'}
          </button>
          <select class="field-select" style="height:38px;" data-add-mixtape="${escapeHtml(key)}">
            <option value="">+ Add to Mixtape...</option>
            ${state.collections
              .filter((c) => !c.auto)
              .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
              .join('')}
          </select>
        </div>
      </div>
    </div>

    ${
      item.mediaType === 'tv' || item.mediaType === 'anime'
        ? `<section class="season-ep-box">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
              <h2 style="font-size:17px;font-weight:700;">Episodes</h2>
              <div style="display:flex;gap:8px;align-items:center;">
                ${
                  item.mediaType === 'tv' && seasons.length > 0
                    ? `<select class="field-select" id="detail-season-select" style="height:34px;">
                        ${seasons
                          .map(
                            (s) => `<option value="${s.seasonNumber}" ${
                              s.seasonNumber === state.activeSeason ? 'selected' : ''
                            }>${escapeHtml(s.name)} (${s.episodeCount} eps)</option>`
                          )
                          .join('')}
                      </select>`
                    : ''
                }
                ${
                  item.mediaType === 'anime'
                    ? `<button type="button" class="pill-button ${
                        state.prefs.dub ? 'is-accent' : ''
                      }" id="toggle-dub-btn" style="height:34px;font-size:12px;">
                        ${state.prefs.dub ? 'English Dub (?dub=1)' : 'Original Sub'}
                      </button>`
                    : ''
                }
              </div>
            </div>
            <div class="episode-grid">
              ${Array.from({ length: Math.min(epCount, 36) }, (_, i) => i + 1)
                .map(
                  (ep) => `<button type="button" class="ep-btn ${
                    ep === state.activeEpisode ? 'is-active' : ''
                  }" data-play-episode="${ep}" data-ep-key="${escapeHtml(key)}">
                    <span>Ep ${ep}</span>
                    ${svgIcon('play', 13)}
                  </button>`
                )
                .join('')}
            </div>
          </section>`
        : ''
    }

    ${renderShelf({
      id: 'detail-related',
      title: 'Continue the sonic arc with',
      items: related,
      wide: true,
      progressMap: state.progressMap,
      likedIds: getLikedSet(),
    })}
  </div>`;
}

function renderTheaterContent() {
  if (!state.activeItem) return { panelHtml: '', toolbarHtml: '', afterHtml: '' };
  const item = state.activeItem;
  const key = getMediaKey(item);
  const embedUrl = getCurrentEmbedUrl();
  const saved = state.progressMap[key];
  const seasons =
    item.mediaType === 'tv'
      ? state.seasonsCache.get(String(item.tmdbId)) ||
        item.seasonsList || [{ seasonNumber: 1, name: 'Season 1', episodeCount: item.totalEpisodes || 10 }]
      : [];
  const activeSeasonObj = seasons.find((s) => s.seasonNumber === state.activeSeason) || seasons[0];
  const epCount =
    item.mediaType === 'anime' ? item.totalEpisodes || 12 : activeSeasonObj?.episodeCount || 10;

  const afterHtml = state.afterCreditsItem
    ? `<div class="after-credits-banner">
        <div>
          <div class="sonic-eyebrow">After-Credits Transition</div>
          <div style="font-size:15px;font-weight:700;margin-top:3px;">Up Next: ${escapeHtml(
            state.afterCreditsItem.title
          )}</div>
          <div class="dim" style="font-size:12px;">Or ease out with an ambient Suno cooldown tone</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="pill-button" id="cooldown-audio-btn">
            ${svgIcon('wave', 15)} Audio Cooldown
          </button>
          <button type="button" class="primary-button" data-play-key="${escapeHtml(
            getMediaKey(state.afterCreditsItem)
          )}">
            ${svgIcon('play', 15)} Stream Next
          </button>
        </div>
      </div>`
    : '';

  const toolbarHtml = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <strong style="font-size:15px;">${escapeHtml(item.title)}</strong>
      ${
        item.mediaType !== 'movie'
          ? `<span class="row-match-pill">${
              item.mediaType === 'tv' ? `S${state.activeSeason} E${state.activeEpisode}` : `Ep ${state.activeEpisode}`
            }</span>`
          : ''
      }
      <span class="dim" style="font-size:12px;">
        ${
          state.livePlayback.currentTime > 0
            ? `VidRift Synced: ${formatTime(state.livePlayback.currentTime)}`
            : 'VidRift Ready'
        }
      </span>
    </div>

    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      ${
        saved?.currentTime > 15
          ? `<button type="button" class="pill-button" id="cmd-resume-btn" style="height:34px;font-size:12px;">
              Resume ${formatTime(saved.currentTime)}
            </button>`
          : ''
      }
      <button type="button" class="pill-button" id="cmd-play-btn" style="height:34px;font-size:12px;">Play</button>
      <button type="button" class="pill-button" id="cmd-pause-btn" style="height:34px;font-size:12px;">Pause</button>
      ${
        item.mediaType !== 'movie'
          ? `<button type="button" class="pill-button" id="next-ep-btn" style="height:34px;font-size:12px;">Next Ep ${svgIcon(
              'next',
              13
            )}</button>`
          : ''
      }
      <button type="button" class="pill-button" id="collapse-theater-btn" style="height:34px;font-size:12px;">
        ${svgIcon('chevronDown', 15)} Mini Dock
      </button>
    </div>`;

  const panelHtml = `<div class="panel-tabs">
      <button type="button" class="panel-tab ${
        state.panelTab === 'upnext' ? 'is-active' : ''
      }" data-panel-tab="upnext">Up Next</button>
      ${
        item.mediaType !== 'movie'
          ? `<button type="button" class="panel-tab ${
              state.panelTab === 'episodes' ? 'is-active' : ''
            }" data-panel-tab="episodes">Episodes</button>`
          : ''
      }
      <button type="button" class="panel-tab ${
        state.panelTab === 'sonic' ? 'is-active' : ''
      }" data-panel-tab="sonic">Sonic &amp; Embed</button>
    </div>

    <div class="panel-scroll">
      ${
        state.panelTab === 'upnext'
          ? state.queue.map((q, idx) => renderSongFilmRow(q, idx, { activeKey: key })).join('')
          : state.panelTab === 'episodes'
          ? `<div style="display:flex;flex-direction:column;gap:12px;">
              ${
                item.mediaType === 'tv' && seasons.length > 0
                  ? `<select class="field-select" id="theater-season-select" style="height:36px;">
                      ${seasons
                        .map(
                          (s) => `<option value="${s.seasonNumber}" ${
                            s.seasonNumber === state.activeSeason ? 'selected' : ''
                          }>${escapeHtml(s.name)}</option>`
                        )
                        .join('')}
                    </select>`
                  : ''
              }
              ${
                item.mediaType === 'anime'
                  ? `<button type="button" class="pill-button ${
                      state.prefs.dub ? 'is-accent' : ''
                    }" id="toggle-dub-btn" style="height:34px;font-size:12px;">
                      ${state.prefs.dub ? 'Audio: English Dub (?dub=1)' : 'Audio: Subtitled'}
                    </button>`
                  : ''
              }
              <div class="episode-grid" style="grid-template-columns:repeat(3,1fr);">
                ${Array.from({ length: Math.min(epCount, 36) }, (_, i) => i + 1)
                  .map(
                    (ep) => `<button type="button" class="ep-btn ${
                      ep === state.activeEpisode ? 'is-active' : ''
                    }" data-play-episode="${ep}" data-ep-key="${escapeHtml(key)}">
                      <span>Ep ${ep}</span>
                    </button>`
                  )
                  .join('')}
              </div>
            </div>`
          : `<div style="display:flex;flex-direction:column;gap:12px;font-size:12px;">
              <div class="season-ep-box" style="padding:12px;">
                <div style="font-weight:700;margin-bottom:4px;">Sonic Pairing</div>
                <div class="dim">Listen first: ${escapeHtml(item.sonic?.listenBefore || 'Suno Night Mix')}</div>
                <div class="dim" style="margin-top:4px;">After credits: ${escapeHtml(
                  item.sonic?.cooldownCue || 'Ambient Pad'
                )}</div>
              </div>
              <div class="season-ep-box" style="padding:12px;">
                <div style="font-weight:700;margin-bottom:4px;">Active VidRift Embed URL</div>
                <div class="dim" style="word-break:break-all;font-size:11px;line-height:1.4;">${escapeHtml(
                  embedUrl
                )}</div>
              </div>
              <div class="season-ep-box" style="padding:12px;">
                <div style="font-weight:700;margin-bottom:4px;">postMessage Bridge Log</div>
                ${
                  state.vidriftLog.length
                    ? state.vidriftLog
                        .map((l) => `<div class="dim" style="font-size:11px;">${escapeHtml(l)}</div>`)
                        .join('')
                    : `<div class="dim" style="font-size:11px;">Listening for vidrift:progress / ended / exit events...</div>`
                }
              </div>
            </div>`
      }
    </div>`;

  return { panelHtml, toolbarHtml, afterHtml, embedUrl };
}

function renderPlayerBar() {
  const item = state.activeItem;
  const curtainOnly = !item && sonicCurtain.isPlaying;
  if (!item && !curtainOnly) return '';

  const pct =
    state.livePlayback.duration > 0
      ? Math.min(100, Math.round((state.livePlayback.currentTime / state.livePlayback.duration) * 100))
      : sonicCurtain.isPlaying
      ? 100
      : 0;

  const title = item ? item.title : `Sonic Curtain • ${sonicCurtain.activeLabel || 'Mood Synth'}`;
  const sub = item
    ? `${item.mediaType === 'tv' ? `S${state.activeSeason} E${state.activeEpisode} • ` : ''}${
        item.sonic?.texture || item.creator || 'VidRift Stream'
      }`
    : 'Listening bridge active — pick a movie to transition';
  const art = item ? resolveArtUrl(item, 'poster') : '';
  const liked = item ? getLikedSet().has(getMediaKey(item)) : false;

  return `<footer class="playerbar" aria-label="Suno Cinema Player Dock">
    <div class="scrubber-track" title="VidRift playback progress">
      <div class="scrubber-fill" style="width:${pct}%"></div>
    </div>
    <div class="playerbar-inner">
      <div class="playerbar-controls">
        <button type="button" class="icon-button" id="dock-prev-btn" aria-label="Previous">${svgIcon('prev', 18)}</button>
        <button type="button" class="play-button" id="dock-toggle-btn" aria-label="${
          state.isPaused ? 'Play' : 'Pause'
        }">
          ${svgIcon(state.isPaused && !sonicCurtain.isPlaying ? 'play' : 'pause', 18)}
        </button>
        <button type="button" class="icon-button" id="dock-next-btn" aria-label="Next">${svgIcon('next', 18)}</button>
        <span class="playerbar-time">
          ${formatTime(state.livePlayback.currentTime)} <span class="dim">/ ${formatTime(
    state.livePlayback.duration
  )}</span>
        </span>
      </div>

      <div class="playerbar-now" id="dock-expand-trigger" role="button" tabindex="0">
        ${
          art
            ? `<div class="now-art"><img src="${escapeHtml(art)}" alt="" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
                item,
                'poster'
              )} /></div>`
            : `<div class="now-art" style="display:grid;place-items:center;background:var(--accent);color:#fff;">${svgIcon(
                'wave',
                20
              )}</div>`
        }
        <div class="now-text">
          <div class="now-title">${escapeHtml(title)}</div>
          <div class="now-sub">${escapeHtml(sub)}</div>
        </div>
      </div>

      <div class="playerbar-actions">
        <button type="button" class="icon-button hide-sm ${
          sonicCurtain.isPlaying ? 'is-on' : ''
        }" id="dock-curtain-btn" title="Toggle Sonic Curtain" aria-label="Toggle Sonic Curtain">
          ${svgIcon('wave', 18)}
        </button>
        ${
          item
            ? `<button type="button" class="icon-button hide-sm" data-toggle-like="${escapeHtml(
                getMediaKey(item)
              )}" aria-label="Like">
                ${svgIcon(liked ? 'heartFill' : 'heart', 18)}
              </button>`
            : ''
        }
        <button type="button" class="icon-button" id="dock-expand-btn" aria-label="Toggle Theater">
          ${svgIcon(state.isExpanded ? 'chevronDown' : 'chevronUp', 20)}
        </button>
        <button type="button" class="icon-button" id="dock-close-btn" title="Close player dock" aria-label="Close player dock">
          ${svgIcon('close', 18)}
        </button>
      </div>
    </div>
  </footer>`;
}

function renderMobileNav() {
  const items = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'bridge', label: 'Bridge', icon: 'wave' },
    { id: 'explore', label: 'Explore', icon: 'compass' },
    { id: 'library', label: 'Library', icon: 'library' },
  ];
  return `<nav class="mobile-bottom-bar" aria-label="Mobile navigation">
    ${items
      .map(
        (n) => `<button type="button" class="mobile-nav-tab ${
          state.route === n.id ? 'is-active' : ''
        }" data-nav="${n.id}">
          ${svgIcon(n.icon, 20)}
          <span>${n.label}</span>
        </button>`
      )
      .join('')}
  </nav>`;
}

function renderPage() {
  switch (state.route) {
    case 'bridge':
      return renderBridgePage();
    case 'explore':
      return renderExplorePage();
    case 'library':
      return renderLibraryPage();
    case 'collection':
      return renderCollectionPage();
    case 'search':
      return renderSearchPage();
    case 'detail':
      return renderDetailPage();
    case 'home':
    default:
      return renderHomePage();
  }
}

function ensureShellMounts() {
  if (document.getElementById('app-shell')) return;
  rootEl.innerHTML = `<div class="app" id="app-shell">
    <div class="page-wash"></div>
    <div id="shell-mount" style="display:flex;flex-direction:column;flex:1;min-height:0;"></div>
    <div id="theater-mount"></div>
    <div id="dock-mount"></div>
    <div id="mobile-nav-mount"></div>
    <div id="modal-mount"></div>
  </div>`;
}

function syncTheaterMount() {
  const mount = document.getElementById('theater-mount');
  if (!mount) return;
  if (!state.activeItem) {
    mount.innerHTML = '';
    return;
  }

  const { panelHtml, toolbarHtml, afterHtml, embedUrl } = renderTheaterContent();
  let overlay = mount.querySelector('.theater-overlay');

  if (!overlay) {
    mount.innerHTML = `<section class="theater-overlay ${
      state.isExpanded ? '' : 'is-hidden'
    }" aria-label="VidRift Theater Stage">
      <div class="theater-stage-left">
        <div class="theater-video-wrap">
          <iframe
            id="vidrift-player"
            src="${escapeHtml(embedUrl)}"
            title="${escapeHtml(state.activeItem.title)}"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
          <div id="after-credits-mount"></div>
        </div>
        <div class="theater-toolbar" id="theater-toolbar-mount"></div>
      </div>
      <aside class="theater-panel" id="theater-panel-mount"></aside>
    </section>`;
    overlay = mount.querySelector('.theater-overlay');
    const iframe = document.getElementById('vidrift-player');
    if (iframe) iframe.dataset.embedUrl = embedUrl;
  } else {
    overlay.classList.toggle('is-hidden', !state.isExpanded);
    const iframe = document.getElementById('vidrift-player');
    if (iframe && iframe.dataset.embedUrl !== embedUrl) {
      iframe.src = embedUrl;
      iframe.title = state.activeItem.title;
      iframe.dataset.embedUrl = embedUrl;
    }
  }

  const afterEl = document.getElementById('after-credits-mount');
  const toolbarEl = document.getElementById('theater-toolbar-mount');
  const panelEl = document.getElementById('theater-panel-mount');
  if (afterEl) afterEl.innerHTML = afterHtml;
  if (toolbarEl) toolbarEl.innerHTML = toolbarHtml;
  if (panelEl) panelEl.innerHTML = panelHtml;
}

function render() {
  if (cleanupHalo) {
    cleanupHalo();
    cleanupHalo = null;
  }

  ensureShellMounts();
  const shell = document.getElementById('app-shell');
  const hasPlayer = Boolean(state.activeItem || sonicCurtain.isPlaying);
  shell.className = [
    'app',
    hasPlayer ? 'has-player' : '',
    state.sidebarCollapsed ? 'rail-collapsed' : '',
    state.isExpanded ? 'player-expanded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const shellMount = document.getElementById('shell-mount');
  const prevScroll = document.getElementById('main-content')?.scrollTop || 0;
  shellMount.innerHTML = `${renderTopbar()}
    <div class="app-body">
      ${renderSidebar()}
      ${
        state.mobileDrawerOpen
          ? `<button type="button" style="position:fixed;inset:0;z-index:70;background:#0009;" id="close-drawer-scrim" aria-label="Close navigation"></button>`
          : ''
      }
      <main class="content" id="main-content">
        ${renderPage()}
      </main>
    </div>`;

  syncTheaterMount();
  document.getElementById('dock-mount').innerHTML = renderPlayerBar();
  document.getElementById('mobile-nav-mount').innerHTML = renderMobileNav();
  document.getElementById('modal-mount').innerHTML =
    state.modal === 'settings'
      ? renderSettingsModal({ appearance: state.appearance, prefs: state.prefs })
      : state.modal === 'quicklaunch'
      ? renderQuickLaunchModal()
      : '';

  const haloCanvas = document.getElementById('sonic-halo-canvas');
  if (haloCanvas) {
    cleanupHalo = mountFluidHalo(haloCanvas, getActivePalette);
  }

  const contentEl = document.getElementById('main-content');
  if (contentEl) {
    contentEl.scrollTop = prevScroll;
    contentEl.addEventListener(
      'scroll',
      () => {
        shell.style.setProperty('--wash-fade', String(Math.min(1, contentEl.scrollTop / 260)));
      },
      { passive: true }
    );
  }
}

async function runSearch(query) {
  const clean = String(query || '').trim();
  if (!clean) return;
  state.searchQuery = clean;
  state.searchOpen = false;
  state.searchHistory = rememberSearch(clean);

  const direct = parseDirectTarget(clean);
  if (direct && /^\d+$/.test(clean) === false && (clean.includes('themoviedb.org') || clean.includes('anilist.co') || /^(movie|tv|anime|anilist|tmdb)[:/]/i.test(clean))) {
    launchStream({
      id: `${direct.mediaType}:${direct.tmdbId || direct.anilistId}`,
      tmdbId: direct.tmdbId,
      anilistId: direct.anilistId,
      mediaType: direct.mediaType,
      title: `${direct.mediaType.toUpperCase()} #${direct.tmdbId || direct.anilistId}`,
      year: '',
      genres: ['Direct VidRift'],
    }, { season: direct.season || 1, episode: direct.episode || 1 });
    return;
  }

  state.route = 'search';
  state.searchLoading = true;
  state.isExpanded = false;
  render();

  try {
    const items = await searchAllMedia(clean, state.prefs.tmdbApiKey);
    registerItems(items);
    state.searchResults = items;
  } catch {
    state.searchResults = state.catalog.filter((x) =>
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

    // Close modal backdrop
    if (target.closest('[data-close-modal="true"]') && (target.matches('[data-close-modal="true"]') || target.closest('button[data-close-modal="true"]'))) {
      state.modal = null;
      render();
      return;
    }

    // Sidebar / Topbar toggles
    if (target.closest('#toggle-sidebar-btn')) {
      if (window.matchMedia('(max-width: 760px)').matches) {
        state.mobileDrawerOpen = !state.mobileDrawerOpen;
      } else {
        state.sidebarCollapsed = !state.sidebarCollapsed;
      }
      render();
      return;
    }

    if (target.closest('#close-drawer-scrim')) {
      state.mobileDrawerOpen = false;
      render();
      return;
    }

    if (target.closest('#toggle-eco-btn')) {
      state.ecosystemOpen = !state.ecosystemOpen;
      render();
      return;
    }

    if (target.closest('#open-settings-btn') || target.closest('#avatar-settings-btn')) {
      state.ecosystemOpen = false;
      state.modal = 'settings';
      render();
      return;
    }

    if (target.closest('#open-quicklaunch-btn') || target.closest('#explore-quicklaunch-btn') || target.closest('#search-open-ql')) {
      state.modal = 'quicklaunch';
      render();
      return;
    }

    if (target.closest('#clear-search-btn')) {
      state.searchQuery = '';
      state.searchOpen = false;
      render();
      return;
    }

    // Navigation
    const navBtn = target.closest('[data-nav]');
    if (navBtn) {
      state.route = navBtn.dataset.nav;
      state.mobileDrawerOpen = false;
      state.isExpanded = false;
      state.ecosystemOpen = false;
      render();
      return;
    }

    // Home filter chips
    const homeChip = target.closest('[data-home-chip]');
    if (homeChip) {
      const val = homeChip.dataset.homeChip;
      if (val === 'bridge') state.route = 'bridge';
      else if (val === 'all') state.route = 'home';
      else {
        state.route = 'explore';
        state.exploreFilter = val;
      }
      render();
      return;
    }

    const expFilter = target.closest('[data-explore-filter]');
    if (expFilter) {
      state.exploreFilter = expFilter.dataset.exploreFilter;
      render();
      return;
    }

    // Collections
    const openCol = target.closest('[data-open-collection]');
    if (openCol) {
      state.route = 'collection';
      state.collectionId = openCol.dataset.openCollection;
      state.mobileDrawerOpen = false;
      state.isExpanded = false;
      render();
      return;
    }

    if (target.closest('#start-mixtape-btn')) {
      state.creatingMixtape = true;
      render();
      document.getElementById('new-mixtape-input')?.focus();
      return;
    }

    // Search history actions
    const runSug = target.closest('[data-run-search]');
    if (runSug) {
      runSearch(runSug.dataset.runSearch);
      return;
    }
    const forgetSug = target.closest('[data-forget-search]');
    if (forgetSug) {
      e.stopPropagation();
      state.searchHistory = forgetSearch(forgetSug.dataset.forgetSearch);
      render();
      return;
    }
    if (target.closest('[data-launch-direct="true"]')) {
      const parsed = parseDirectTarget(state.searchQuery);
      if (parsed) {
        launchStream({
          id: `${parsed.mediaType}:${parsed.tmdbId || parsed.anilistId}`,
          tmdbId: parsed.tmdbId,
          anilistId: parsed.anilistId,
          mediaType: parsed.mediaType,
          title: `${parsed.mediaType.toUpperCase()} #${parsed.tmdbId || parsed.anilistId}`,
          genres: ['Direct VidRift'],
        }, { season: parsed.season || 1, episode: parsed.episode || 1 });
      }
      return;
    }

    // Sonic mood selection & Web Audio Curtain
    const pickSonic = target.closest('[data-pick-sonic]') || target.closest('[data-select-mood]');
    if (pickSonic) {
      const moodId = pickSonic.dataset.pickSonic || pickSonic.dataset.selectMood;
      state.prefs = savePlayerPrefs({ activeMoodId: moodId, customTrackQuery: '' });
      render();
      return;
    }

    const curtainBtn = target.closest('#audition-curtain-btn') || target.closest('#detail-audition-btn');
    if (curtainBtn) {
      const patch = curtainBtn.dataset.curtain || 'midnight-synth';
      sonicCurtain.playMood(patch);
      render();
      return;
    }

    // Play or Open Detail
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
      state.detailKey = detailBtn.dataset.openDetail;
      state.route = 'detail';
      state.isExpanded = false;
      state.searchOpen = false;
      const item = getItemByKey(state.detailKey);
      if (item?.mediaType === 'tv' && item.tmdbId) loadTvSeasons(item.tmdbId);
      const saved = state.progressMap[state.detailKey];
      state.activeSeason = saved?.season || 1;
      state.activeEpisode = saved?.episode || 1;
      render();
      return;
    }

    const likeBtn = target.closest('[data-toggle-like]');
    if (likeBtn) {
      e.stopPropagation();
      toggleLike(likeBtn.dataset.toggleLike);
      return;
    }

    // Shelf scroll arrows
    const scrollBtn = target.closest('[data-scroll-shelf]');
    if (scrollBtn) {
      const scroller = document.getElementById(`shelf-${scrollBtn.dataset.scrollShelf}`);
      if (scroller) {
        scroller.scrollBy({
          left: Number(scrollBtn.dataset.dir) * Math.max(320, scroller.clientWidth * 0.78),
          behavior: 'smooth',
        });
      }
      return;
    }

    // Theater controls & postMessage commands
    if (target.closest('#collapse-theater-btn')) {
      state.isExpanded = false;
      render();
      return;
    }
    if (target.closest('#cmd-play-btn')) {
      state.isPaused = false;
      sendPlayerCommand('play');
      render();
      return;
    }
    if (target.closest('#cmd-pause-btn')) {
      state.isPaused = true;
      sendPlayerCommand('pause');
      render();
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
      showToast(state.prefs.dub ? 'Switched to English Dub (?dub=1)' : 'Switched to Subtitled');
      render();
      return;
    }
    if (target.closest('#cooldown-audio-btn')) {
      sonicCurtain.playMood('lofi-rain', 'After-Credits Cooldown');
      state.isExpanded = false;
      render();
      return;
    }

    const panelTab = target.closest('[data-panel-tab]');
    if (panelTab) {
      state.panelTab = panelTab.dataset.panelTab;
      render();
      return;
    }

    // Dock controls
    if (target.closest('#dock-expand-btn') || target.closest('#dock-expand-trigger')) {
      if (state.activeItem) {
        state.isExpanded = !state.isExpanded;
        render();
      }
      return;
    }
    if (target.closest('#dock-close-btn')) {
      state.activeItem = null;
      state.isExpanded = false;
      state.afterCreditsItem = null;
      if (sonicCurtain.isPlaying) sonicCurtain.stop(250);
      render();
      return;
    }
    if (target.closest('#dock-curtain-btn')) {
      const profile = getActiveSonicProfile();
      sonicCurtain.playMood(profile.curtainPatch);
      render();
      return;
    }
    if (target.closest('#dock-toggle-btn')) {
      if (sonicCurtain.isPlaying && !state.activeItem) {
        sonicCurtain.stop(300);
        render();
        return;
      }
      state.isPaused = !state.isPaused;
      sendPlayerCommand(state.isPaused ? 'pause' : 'play');
      render();
      return;
    }
    if (target.closest('#dock-next-btn') && state.queue.length > 1) {
      const idx = state.queue.findIndex((x) => getMediaKey(x) === getMediaKey(state.activeItem));
      const next = state.queue[(idx + 1) % state.queue.length];
      if (next) launchStream(next, { expand: state.isExpanded });
      return;
    }
    if (target.closest('#dock-prev-btn') && state.queue.length > 1) {
      const idx = state.queue.findIndex((x) => getMediaKey(x) === getMediaKey(state.activeItem));
      const prev = state.queue[(idx - 1 + state.queue.length) % state.queue.length];
      if (prev) launchStream(prev, { expand: state.isExpanded });
      return;
    }

    // Settings theme picker
    const themeCard = target.closest('[data-pick-theme]');
    if (themeCard) {
      state.appearance = saveAppearanceSettings({
        ...state.appearance,
        theme: themeCard.dataset.pickTheme,
      });
      render();
      return;
    }
    if (target.closest('#save-settings-btn')) {
      const amoled = Boolean(document.getElementById('pref-amoled')?.checked);
      const autoplay = Boolean(document.getElementById('pref-autoplay')?.checked);
      const dub = Boolean(document.getElementById('pref-dub')?.checked);
      const sub = document.getElementById('pref-sub')?.value || 'en';
      const uiScale = Number(document.getElementById('pref-uiscale')?.value || 1);
      const tmdbApiKey = (document.getElementById('pref-tmdb-key')?.value || '').trim();

      state.appearance = saveAppearanceSettings({ ...state.appearance, amoled });
      state.prefs = savePlayerPrefs({ autoplay, dub, sub, uiScale, tmdbApiKey });
      state.modal = null;
      showToast('Settings synced to Suno Cinema & VidRift');
      render();
    }
  });

  rootEl.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('#detail-season-select') || t.matches('#theater-season-select')) {
      state.activeSeason = Number(t.value) || 1;
      state.activeEpisode = 1;
      if (state.isExpanded && state.activeItem) {
        launchStream(state.activeItem, { season: state.activeSeason, episode: 1 });
      } else {
        render();
      }
    }
    if (t.matches('[data-add-mixtape]')) {
      const colId = t.value;
      const key = t.dataset.addMixtape;
      if (colId && key) addToMixtape(colId, key);
      t.value = '';
    }
  });

  rootEl.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'global-search-input') {
      state.searchQuery = t.value;
      state.searchOpen = true;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        const box = document.getElementById('searchbox-wrap');
        if (box && document.activeElement?.id === 'global-search-input') {
          // Keep focus smoothly while updating suggestions
          const pos = t.selectionStart;
          render();
          const fresh = document.getElementById('global-search-input');
          if (fresh) {
            fresh.focus();
            try {
              fresh.setSelectionRange(pos, pos);
            } catch {}
          }
        }
      }, 160);
    }
  });

  rootEl.addEventListener('focusin', (e) => {
    if (e.target.id === 'global-search-input') {
      state.searchOpen = true;
    }
  });

  rootEl.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'global-search-form') {
      runSearch(document.getElementById('global-search-input')?.value || state.searchQuery);
    } else if (e.target.id === 'sonic-prompt-form') {
      const q = (document.getElementById('sonic-track-input')?.value || '').trim();
      state.prefs = savePlayerPrefs({ customTrackQuery: q });
      const profile = getActiveSonicProfile();
      showToast(`Tuned cinema to "${profile.trackTitle}"`);
      render();
    } else if (e.target.id === 'new-mixtape-form') {
      const name = (document.getElementById('new-mixtape-input')?.value || '').trim();
      state.creatingMixtape = false;
      if (name) {
        const id = `mix-${Date.now()}`;
        state.collections = saveCollections([
          ...state.collections,
          { id, name, subtitle: 'Double feature', auto: false, items: [] },
        ]);
        state.route = 'collection';
        state.collectionId = id;
        showToast(`Created mixtape "${name}"`);
      }
      render();
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
          genres: ['Direct Stream'],
          sonic: {
            moodId: 'midnight-synth',
            bpm: 96,
            texture: 'Custom VidRift Stream',
            listenBefore: 'Any Suno track',
            cooldownCue: 'Ambient reverb',
          },
        },
        { season: parsed.season || 1, episode: parsed.episode || 1 }
      );
    }
  });

  // Close search/ecosystem popovers when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (state.searchOpen && !e.target.closest('#searchbox-wrap')) {
      state.searchOpen = false;
      render();
    }
    if (state.ecosystemOpen && !e.target.closest('.topbar-right')) {
      state.ecosystemOpen = false;
      render();
    }
  });

  // Keyboard shortcuts matching sunov2.vercel.app/app
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      state.modal = state.modal === 'settings' ? null : 'settings';
      render();
      return;
    }
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('global-search-input')?.focus();
    } else if (e.key === 'Escape') {
      if (state.modal) {
        state.modal = null;
        render();
      } else if (state.isExpanded) {
        state.isExpanded = false;
        render();
      }
    }
  });

  // Two-way VidRift postMessage listener (verified origin)
  window.addEventListener('message', (event) => {
    const msg = parseVidriftMessage(event);
    if (!msg) return;

    state.vidriftLog = [
      `← ${msg.type} ${msg.currentTime != null ? `@ ${formatTime(msg.currentTime)}` : ''}`,
      ...state.vidriftLog,
    ].slice(0, 12);

    if (msg.type === 'vidrift:progress' && state.activeItem) {
      const currentTime = Number(msg.currentTime || 0);
      const duration = Number(msg.duration || 0);
      state.livePlayback = { currentTime, duration };
      saveMediaProgress(state.activeItem, {
        currentTime,
        duration,
        season: state.activeSeason,
        episode: state.activeEpisode,
      });
      state.progressMap = loadProgressMap();

      // Update dock scrubber & timer smoothly without destroying iframe!
      const fill = document.querySelector('.scrubber-fill');
      const timeEl = document.querySelector('.playerbar-time');
      if (fill && duration > 0) {
        fill.style.width = `${Math.min(100, Math.round((currentTime / duration) * 100))}%`;
      }
      if (timeEl) {
        timeEl.innerHTML = `${formatTime(currentTime)} <span class="dim">/ ${formatTime(duration)}</span>`;
      }
    } else if (msg.type === 'vidrift:ended' && state.activeItem) {
      const currentKey = getMediaKey(state.activeItem);
      const next = state.queue.find((q) => getMediaKey(q) !== currentKey) || null;
      state.afterCreditsItem = next;
      render();
    } else if (msg.type === 'vidrift:exit') {
      state.isExpanded = false;
      render();
    }
  });
}

async function init() {
  bindEvents();
  state.catalog = await loadCatalogData();
  registerItems(state.catalog);
  render();

  // Fetch live AniList trending anime asynchronously (works on both server.js & static GitHub Pages)
  try {
    const items = await loadTrendingAnime();
    if (Array.isArray(items) && items.length > 0) {
      registerItems(items);
      state.liveAnimeTrending = items;
      if (state.route === 'home') render();
    }
  } catch {
    // Catalog already holds verified anime fallback
  }
}

init();
