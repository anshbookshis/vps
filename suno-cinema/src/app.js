import {
  PLAYER_PROVIDERS,
  buildPlayerEmbedUrl,
  parseDirectTarget,
  parseAnyPlayerMessage,
  buildVidriftCommand,
  VIDRIFT_ORIGIN,
  isDirectStreamUrl,
  fetchStreamSources,
  cleanProxyUrl,
  cleanAddonUrl,
  isPlayableDirectSource,
  getPlayableHlsNodes,
  createFailoverState,
  recordFailoverAttempt,
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
  renderSkeletonShelf,
  renderShelf,
} from './components/cards.js';
import {
  STUDIO_HUBS,
  renderStudioHubStrip,
  renderAndroidBillboard,
  renderDesktopBillboard,
  renderDesktopFooter,
  renderDetailView,
  renderDesktopDetailModal,
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
  fetchFreeSubtitles,
  loadSubtitleTrackAsVttUrl,
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
  activeHub: 'all',
  hubItems: [],
  playerEpisodesOpen: false,
  tab: 'home', // 'home' | 'clips' | 'discover' | 'search' | 'mysuno' | 'detail' | 'downloads' | 'languages'
  langPref: 'Original Language',
  langValue: 'English',
  langItems: [],
  langLoading: false,
  desktopSearchOpen: false,
  isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
  prevTab: 'home',
  lastRenderedTab: 'home',
  detailKey: null,
  detailModalKey: null,
  detailTab: 'episodes',
  detailTrailerPlaying: false,
  detailTrailerMuted: true,
  heroTrailerPlaying: false,
  heroTrailerMuted: true,
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
  resolvedSources: [],
  activeSourceIndex: 0,
  failoverState: null,
  resolvingStream: false,
  subtitlesList: [],
  activeExternalSubId: 'off',
  activeExternalSubBlobUrl: null,
  hudOpenMenu: null,
  hudVisible: true,
  hlsTelemetry: {
    height: 0,
    width: 0,
    bitrateMbps: 0,
    bufferSec: 0,
    levelIndex: -1,
    levels: [],
    audioTracks: [],
    audioTrackIndex: -1,
    subtitleTracks: [],
    subtitleTrackIndex: -1,
    speed: 1,
    nodeName: '',
    loading: false,
    stalled: false,
  },
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

let activeHlsInstance = null;
let hlsSessionSeq = 0;
let activeLaunchSeq = 0;
let stallWatchdogTimer = null;
let telemetryTimer = null;
let hudIdleTimer = null;
let lastExternalSubId = '';

function revokeActiveExternalSubBlob() {
  if (state.activeExternalSubBlobUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(state.activeExternalSubBlobUrl);
    } catch {}
  }
  state.activeExternalSubBlobUrl = null;
}

function clearPlayerTimers() {
  clearInterval(stallWatchdogTimer);
  clearInterval(telemetryTimer);
  clearTimeout(hudIdleTimer);
  stallWatchdogTimer = null;
  telemetryTimer = null;
  hudIdleTimer = null;
}

function destroyHlsInstance() {
  hlsSessionSeq += 1;
  clearPlayerTimers();
  if (activeHlsInstance) {
    try {
      activeHlsInstance.destroy();
    } catch {}
    activeHlsInstance = null;
  }
}

function loadHlsScriptOnce() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.Hls) return Promise.resolve(window.Hls);
  return new Promise((resolve) => {
    const existing = document.getElementById('suno-hlsjs-cdn');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Hls || null), { once: true });
      return;
    }
    const sc = document.createElement('script');
    sc.id = 'suno-hlsjs-cdn';
    sc.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
    sc.onload = () => resolve(window.Hls || null);
    sc.onerror = () => resolve(null);
    document.head.appendChild(sc);
  });
}

function getActiveResolvedSource() {
  if (!Array.isArray(state.resolvedSources) || !state.resolvedSources.length) return null;
  return state.resolvedSources[state.activeSourceIndex] || state.resolvedSources[0] || null;
}

function computeBufferedSeconds(videoEl) {
  if (!videoEl || !videoEl.buffered || videoEl.buffered.length === 0) return 0;
  const cur = Number(videoEl.currentTime || 0);
  for (let i = 0; i < videoEl.buffered.length; i += 1) {
    const start = videoEl.buffered.start(i);
    const end = videoEl.buffered.end(i);
    if (cur >= start - 0.5 && cur <= end + 0.5) {
      return Math.max(0, end - cur);
    }
  }
  return Math.max(0, videoEl.buffered.end(videoEl.buffered.length - 1) - cur);
}

function wakePlayerHud(keepOpen = false) {
  state.hudVisible = true;
  const playerRoot = document.getElementById('n77-player');
  if (playerRoot) playerRoot.classList.add('is-hud-visible');
  clearTimeout(hudIdleTimer);
  const videoEl = document.getElementById('hls-video-player');
  if (keepOpen || !videoEl || videoEl.paused || state.hudOpenMenu) return;
  hudIdleTimer = setTimeout(() => {
    const v = document.getElementById('hls-video-player');
    if (v && !v.paused && !state.hudOpenMenu) {
      state.hudVisible = false;
      document.getElementById('n77-player')?.classList.remove('is-hud-visible');
    }
  }, 3000);
}

function updateHudControlsVisuals() {
  const videoEl = document.getElementById('hls-video-player');
  if (!videoEl) return;

  const isPaused = videoEl.paused;
  const playIcon = svgIcon(isPaused ? 'play' : 'pause', 20);
  const centerIcon = svgIcon(isPaused ? 'play' : 'pause', 32);
  const barBtn = document.getElementById('n77-play-btn');
  const centerBtn = document.getElementById('n77-center-play-btn');
  if (barBtn) barBtn.innerHTML = playIcon;
  if (centerBtn) centerBtn.innerHTML = centerIcon;

  const playerRoot = document.getElementById('n77-player');
  if (playerRoot) {
    playerRoot.classList.toggle('is-paused', isPaused);
    if (isPaused) wakePlayerHud(true);
  }

  const muteBtn = document.getElementById('n77-mute-btn');
  const volSlider = document.getElementById('n77-vol-slider');
  if (muteBtn) muteBtn.innerHTML = svgIcon(videoEl.muted || videoEl.volume === 0 ? 'volumeOff' : 'volumeOn', 19);
  if (volSlider) volSlider.value = videoEl.muted ? '0' : String(videoEl.volume ?? 1);

  const cur = Number(videoEl.currentTime || 0);
  const dur = Number(videoEl.duration || 0);
  const readout = document.getElementById('n77-time-readout');
  if (readout) {
    readout.textContent = dur > 0 && Number.isFinite(dur) ? `${formatTime(cur)} / ${formatTime(dur)}` : `${formatTime(cur)} / LIVE`;
  }

  const pct = dur > 0 && Number.isFinite(dur) ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
  const progBar = document.getElementById('n77-timeline-progress');
  if (progBar) progBar.style.width = `${pct.toFixed(2)}%`;

  const bufAhead = computeBufferedSeconds(videoEl);
  const bufEnd = cur + bufAhead;
  const bufPct = dur > 0 && Number.isFinite(dur) ? Math.min(100, Math.max(0, (bufEnd / dur) * 100)) : 0;
  const bufBar = document.getElementById('n77-timeline-buffered');
  if (bufBar) bufBar.style.width = `${bufPct.toFixed(2)}%`;

  const wrap = document.getElementById('n77-timeline-wrap');
  if (wrap) wrap.setAttribute('aria-valuenow', String(Math.round(pct)));

  updateTelemetryBadge(videoEl, bufAhead);
}

function updateTelemetryBadge(videoEl, precomputedBuf) {
  const badge = document.getElementById('n77-telemetry-badge');
  if (!badge) return;
  const t = state.hlsTelemetry;
  const buf = typeof precomputedBuf === 'number' ? precomputedBuf : computeBufferedSeconds(videoEl);
  t.bufferSec = buf;

  const h = t.height || videoEl?.videoHeight || 0;
  const resText = h > 0 ? `${h}p` : 'HLS';
  const mbpsText = t.bitrateMbps > 0 ? `${t.bitrateMbps.toFixed(1)} Mbps` : '';
  const bufText = `${buf.toFixed(1)}s buf`;
  const activeSrc = getActiveResolvedSource();
  const nodeTag = activeSrc?.node || t.nodeName || 'Direct';

  badge.textContent = [resText, mbpsText, bufText, nodeTag].filter(Boolean).join(' • ');
  badge.classList.toggle('is-warn', Boolean(t.stalled || (videoEl && !videoEl.paused && buf < 2)));

  const qLabel = document.getElementById('n77-quality-label');
  if (qLabel) {
    if (t.levelIndex === -1 || !activeHlsInstance) {
      qLabel.textContent = h > 0 ? `Auto (${h}p)` : 'Auto';
    } else {
      const lvl = t.levels.find((l) => l.index === t.levelIndex);
      qLabel.textContent = lvl ? `${lvl.height}p` : 'Auto';
    }
  }

  const aLabel = document.getElementById('n77-audio-label');
  if (aLabel) {
    const tr = t.audioTracks.find((x) => x.id === t.audioTrackIndex);
    aLabel.textContent = tr ? (tr.lang || tr.name || 'Audio').slice(0, 8) : 'Audio';
  }

  const ccLabel = document.getElementById('n77-cc-label');
  const ccBtn = document.getElementById('n77-menu-subtitles');
  const hasSubOn = t.subtitleTrackIndex >= 0 || state.activeExternalSubId !== 'off';
  if (ccLabel) ccLabel.textContent = hasSubOn ? 'CC ON' : 'CC';
  if (ccBtn) ccBtn.classList.toggle('is-active', hasSubOn);

  const spLabel = document.getElementById('n77-speed-label');
  if (spLabel) spLabel.textContent = `${t.speed}x`;

  const mLabel = document.getElementById('n77-mirror-label');
  if (mLabel) {
    const shortName = activeSrc?.name ? activeSrc.name.split('(')[0].trim().slice(0, 14) : 'Node';
    mLabel.textContent = shortName;
  }
}

function setSpinnerState(visible, label = 'Buffering stream...') {
  const el = document.getElementById('n77-spinner');
  const lbl = document.getElementById('n77-spinner-label');
  if (lbl) lbl.textContent = label;
  if (el) el.hidden = !visible;
}

function flashSeekFeedback(side) {
  const el = document.getElementById(side === 'left' ? 'n77-seek-fb-left' : 'n77-seek-fb-right');
  if (!el) return;
  el.classList.remove('is-flash');
  void el.offsetWidth;
  el.classList.add('is-flash');
}

function seekVideoBy(deltaSeconds) {
  const videoEl = document.getElementById('hls-video-player');
  if (!videoEl) return;
  const dur = Number.isFinite(videoEl.duration) ? videoEl.duration : Infinity;
  const next = Math.max(0, Math.min(dur, (videoEl.currentTime || 0) + deltaSeconds));
  try {
    videoEl.currentTime = next;
  } catch {}
  flashSeekFeedback(deltaSeconds < 0 ? 'left' : 'right');
  wakePlayerHud();
  updateHudControlsVisuals();
}

function toggleVideoPlayPause() {
  const videoEl = document.getElementById('hls-video-player');
  if (!videoEl) return;
  if (videoEl.paused) {
    videoEl.play().catch(() => {});
  } else {
    videoEl.pause();
  }
  wakePlayerHud();
  updateHudControlsVisuals();
}

async function applyExternalSubtitleTrack(trackId) {
  const videoEl = document.getElementById('hls-video-player');
  if (!videoEl) return;

  // Remove old external <track>
  videoEl.querySelectorAll('track[data-suno-ext-sub="true"]').forEach((t) => t.remove());
  revokeActiveExternalSubBlob();

  if (trackId === 'off') {
    state.activeExternalSubId = 'off';
    if (activeHlsInstance) {
      activeHlsInstance.subtitleTrack = -1;
      activeHlsInstance.subtitleDisplay = false;
    }
    state.hlsTelemetry.subtitleTrackIndex = -1;
    Array.from(videoEl.textTracks || []).forEach((tt) => {
      tt.mode = 'disabled';
    });
    updateHudControlsVisuals();
    return;
  }

  const track = state.subtitlesList.find((s) => s.id === trackId);
  if (!track) return;

  showToast(`Loading ${track.label}...`);
  const vttData = await loadSubtitleTrackAsVttUrl(track, { hlsProxyUrl: state.prefs.hlsProxyUrl });
  if (!vttData?.url) {
    showToast('Unable to load subtitle track');
    return;
  }

  if (activeHlsInstance) {
    activeHlsInstance.subtitleTrack = -1;
    activeHlsInstance.subtitleDisplay = false;
  }
  state.hlsTelemetry.subtitleTrackIndex = -1;
  Array.from(videoEl.textTracks || []).forEach((tt) => {
    tt.mode = 'disabled';
  });

  if (vttData.isBlob) state.activeExternalSubBlobUrl = vttData.url;
  state.activeExternalSubId = track.id;
  lastExternalSubId = track.id;

  const trackEl = document.createElement('track');
  trackEl.kind = 'subtitles';
  trackEl.label = track.label;
  trackEl.srclang = track.lang || 'en';
  trackEl.src = vttData.url;
  trackEl.default = true;
  trackEl.setAttribute('data-suno-ext-sub', 'true');
  videoEl.appendChild(trackEl);

  if (trackEl.track) {
    trackEl.track.mode = 'showing';
  }
  updateHudControlsVisuals();
  showToast(`Subtitles: ${track.label}`);
}

function toggleClosedCaptionsShortcut() {
  const videoEl = document.getElementById('hls-video-player');
  if (!videoEl) return;
  const t = state.hlsTelemetry;
  const currentlyOn = t.subtitleTrackIndex >= 0 || state.activeExternalSubId !== 'off';
  if (currentlyOn) {
    applyExternalSubtitleTrack('off');
    showToast('Subtitles OFF');
    return;
  }
  if (t.subtitleTracks.length > 0 && activeHlsInstance) {
    activeHlsInstance.subtitleTrack = 0;
    activeHlsInstance.subtitleDisplay = true;
    t.subtitleTrackIndex = 0;
    updateHudControlsVisuals();
    showToast(`Subtitles: ${t.subtitleTracks[0].name || t.subtitleTracks[0].lang || 'Track 1'}`);
    return;
  }
  if (state.subtitlesList.length > 0) {
    const preferred =
      state.subtitlesList.find((s) => s.id === lastExternalSubId) || state.subtitlesList[0];
    applyExternalSubtitleTrack(preferred.id);
    return;
  }
  showToast('No subtitle tracks available for this stream');
}

function renderHudPopupMenu() {
  const container = document.getElementById('n77-hud-popups');
  if (!container) return;
  const menu = state.hudOpenMenu;
  if (!menu) {
    container.innerHTML = '';
    return;
  }

  const t = state.hlsTelemetry;
  let title = '';
  let bodyHtml = '';

  if (menu === 'quality') {
    title = 'Video Quality (ABR)';
    const opts = [
      `<button type="button" class="n77-menu-opt ${t.levelIndex === -1 ? 'is-active' : ''}" data-hls-level="-1">
        <span>Auto (Adaptive)${t.height && t.levelIndex === -1 ? ` • ${t.height}p` : ''}</span>
        <span>${t.levelIndex === -1 ? '✓' : ''}</span>
      </button>`,
      ...t.levels.map(
        (lvl) => `<button type="button" class="n77-menu-opt ${t.levelIndex === lvl.index ? 'is-active' : ''}" data-hls-level="${lvl.index}">
          <span>${lvl.height ? `${lvl.height}p` : `Level ${lvl.index + 1}`}${lvl.bitrate ? ` (${(lvl.bitrate / 1e6).toFixed(1)} Mbps)` : ''}</span>
          <span>${t.levelIndex === lvl.index ? '✓' : ''}</span>
        </button>`
      ),
    ];
    bodyHtml = opts.join('');
  } else if (menu === 'audio') {
    title = 'Audio Track';
    bodyHtml =
      t.audioTracks.length > 0
        ? t.audioTracks
            .map(
              (tr) => `<button type="button" class="n77-menu-opt ${t.audioTrackIndex === tr.id ? 'is-active' : ''}" data-hls-audio="${tr.id}">
                <span>${escapeHtml(tr.name || tr.lang || `Audio ${tr.id + 1}`)}</span>
                <span>${t.audioTrackIndex === tr.id ? '✓' : ''}</span>
              </button>`
            )
            .join('')
        : `<div class="dim" style="padding:8px 10px;font-size:12px;">Default stream audio</div>`;
  } else if (menu === 'subtitles') {
    title = 'Subtitles / CC (SRT→VTT)';
    const offActive = t.subtitleTrackIndex < 0 && state.activeExternalSubId === 'off';
    const items = [
      `<button type="button" class="n77-menu-opt ${offActive ? 'is-active' : ''}" data-hls-sub-off="true">
        <span>Off</span><span>${offActive ? '✓' : ''}</span>
      </button>`,
      ...t.subtitleTracks.map(
        (st) => `<button type="button" class="n77-menu-opt ${t.subtitleTrackIndex === st.id ? 'is-active' : ''}" data-hls-sub="${st.id}">
          <span>[HLS] ${escapeHtml(st.name || st.lang || `CC ${st.id + 1}`)}</span>
          <span>${t.subtitleTrackIndex === st.id ? '✓' : ''}</span>
        </button>`
      ),
      ...state.subtitlesList.map(
        (ext) => `<button type="button" class="n77-menu-opt ${state.activeExternalSubId === ext.id ? 'is-active' : ''}" data-ext-sub="${escapeHtml(ext.id)}">
          <span>[OS] ${escapeHtml(ext.label)}</span>
          <span>${state.activeExternalSubId === ext.id ? '✓' : ''}</span>
        </button>`
      ),
    ];
    bodyHtml = items.join('');
  } else if (menu === 'speed') {
    title = 'Playback Speed';
    bodyHtml = [0.5, 0.75, 1, 1.25, 1.5, 2]
      .map(
        (sp) => `<button type="button" class="n77-menu-opt ${t.speed === sp ? 'is-active' : ''}" data-hls-speed="${sp}">
          <span>${sp === 1 ? 'Normal (1x)' : `${sp}x`}</span>
          <span>${t.speed === sp ? '✓' : ''}</span>
        </button>`
      )
      .join('');
  } else if (menu === 'mirrors') {
    title = 'Stream Mirrors & Nodes';
    const failed = state.failoverState?.failedIndices || new Set();
    bodyHtml =
      state.resolvedSources.length > 0
        ? state.resolvedSources
            .map((src, idx) => {
              const isAct = idx === state.activeSourceIndex;
              const isFailed = failed.has(idx);
              return `<button type="button" class="n77-menu-opt ${isAct ? 'is-active' : ''} ${isFailed ? 'is-failed' : ''}" data-pick-mirror="${idx}">
                <span style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;">
                  <span>${escapeHtml(src.name || src.id)}</span>
                  <span class="dim" style="font-size:10px;">${escapeHtml(src.quality || src.type)}${isFailed ? ' • Failed' : ''}</span>
                </span>
                <span>${isAct ? '✓' : ''}</span>
              </button>`;
            })
            .join('')
        : `<div class="dim" style="padding:8px 10px;font-size:12px;">No alternate mirrors resolved</div>`;
  }

  container.innerHTML = `<div class="n77-popup-card" role="menu">
    <div class="n77-popup-head">
      <span>${escapeHtml(title)}</span>
      <button type="button" class="icon-btn" data-close-hud-menu="true" aria-label="Close menu" style="width:24px;height:24px;">
        ${svgIcon('close', 14)}
      </button>
    </div>
    <div class="n77-popup-list">${bodyHtml}</div>
  </div>`;
}

function togglePlayerFullscreen() {
  const target = document.getElementById('n77-player') || document.querySelector('.player-fullscreen');
  if (!target || typeof document === 'undefined') return;
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  } else {
    target.requestFullscreen?.().catch(() => {});
  }
}

async function triggerHlsFailover(item, reason = 'Playback failed') {
  if (!state.playerOpen || !item) return;
  if (!state.failoverState && state.resolvedSources.length > 0) {
    state.failoverState = createFailoverState(state.resolvedSources, state.activeSourceIndex);
  }
  const { next } = recordFailoverAttempt(state.failoverState, reason);
  if (next && next.kind === 'hls') {
    state.activeSourceIndex = next.index;
    showToast(`Failover: ${next.source.name}`);
    const videoEl = document.getElementById('hls-video-player');
    if (videoEl) {
      videoEl.dataset.embedUrl = next.source.url;
      attachDirectVideoStream(videoEl, next.source.url, item, next.source);
      renderHudPopupMenu();
      updateHudControlsVisuals();
      return;
    }
    syncPlayerMount({ forceReload: true });
    return;
  }

  const embedUrl = next?.kind === 'embed' ? next.source.url : '';
  fallbackToEmbedPlayer(
    item,
    'HLS mirrors unavailable or stalled. Switched to VidLink shield player.',
    embedUrl
  );
}

function fallbackToEmbedPlayer(item, message = 'Switched to VidLink shield player.', explicitUrl = '') {
  destroyHlsInstance();
  revokeActiveExternalSubBlob();
  if (message) {
    showToast(message);
  }

  const fallbackUrl =
    explicitUrl ||
    buildPlayerEmbedUrl(item, {
      provider: 'vidlink',
      themeId: state.appearance.theme,
      autoplay: state.prefs.autoplay,
      sub: state.prefs.sub,
      dub: state.prefs.dub,
      uiScale: state.prefs.uiScale,
      season: state.activeSeason,
      episode: state.activeEpisode,
    });

  const frameBox = document.getElementById('player-frame-box');
  if (frameBox) {
    frameBox.innerHTML = `<iframe
      id="vidrift-player"
      src="${escapeHtml(fallbackUrl)}"
      title="${escapeHtml(item.title)}"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
    ${renderPlayerEpisodesDrawer(item)}`;

    const frame = document.getElementById('vidrift-player');
    if (frame) {
      frame.dataset.embedUrl = fallbackUrl;
      applySandboxAttr(frame);
    }
  }

  const topBar = document.querySelector('.player-top-bar');
  if (topBar) {
    const shieldMount = topBar.querySelector('.shield-pill');
    if (shieldMount) {
      shieldMount.outerHTML = `<button type="button" class="shield-pill" id="toggle-strict-shield-btn">
        ${svgIcon('shield', 13)}
        <span>No-Redirect ON</span>
      </button>`;
    }
  }

  const strip = document.getElementById('player-bottom-strip');
  if (strip) {
    strip.innerHTML = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
      ${PLAYER_PROVIDERS.map(
        (p) => `<button type="button" class="outline-chip ${
          state.prefs.playerProvider === p.id ? 'is-active' : ''
        }" data-switch-provider="${p.id}" style="height:30px;padding:0 10px;font-size:11px;">${escapeHtml(
          p.label
        )}</button>`
      ).join('')}
      <button type="button" class="outline-chip" id="reload-player-btn" style="height:30px;font-size:11px;">${svgIcon(
        'refresh',
        12
      )} Reload</button>
    </div>
    <span class="dim" style="font-size:11px;">Popups Blocked</span>`;
  }
}

async function attachDirectVideoStream(videoEl, streamUrl, item, sourceMeta = null) {
  if (!videoEl || !streamUrl) return;

  // Never feed non-stream or HTML embed URLs to Hls.js or video element
  if (!isDirectStreamUrl(streamUrl)) {
    console.warn('[Player] Rejecting non-stream URL for video player:', streamUrl);
    triggerHlsFailover(item, 'Non-stream URL rejected');
    return;
  }

  destroyHlsInstance();
  const sessionSeq = hlsSessionSeq;
  const key = getMediaKey(item);
  const saved = state.progressMap[key];
  let lastSavedSec = 0;

  state.hlsTelemetry = {
    height: 0,
    width: 0,
    bitrateMbps: 0,
    bufferSec: 0,
    levelIndex: -1,
    levels: [],
    audioTracks: [],
    audioTrackIndex: -1,
    subtitleTracks: [],
    subtitleTrackIndex: -1,
    speed: Number(videoEl.playbackRate || 1),
    nodeName: sourceMeta?.node || 'Direct',
    loading: true,
    stalled: false,
  };
  setSpinnerState(true, `Connecting ${sourceMeta?.name || 'HLS stream'}...`);
  wakePlayerHud(true);

  let lastMediaTime = Number(videoEl.currentTime || 0);
  let lastProgressAt = Date.now();
  let bufferingSince = Date.now();
  let didFailover = false;

  const markPlayingHealthy = () => {
    bufferingSince = 0;
    lastProgressAt = Date.now();
    state.hlsTelemetry.loading = false;
    state.hlsTelemetry.stalled = false;
    setSpinnerState(false);
    updateHudControlsVisuals();
  };

  videoEl.ontimeupdate = () => {
    if (sessionSeq !== hlsSessionSeq) return;
    const cur = Number(videoEl.currentTime || 0);
    const dur = Number(videoEl.duration || 0);
    if (Math.abs(cur - lastMediaTime) > 0.05) {
      lastMediaTime = cur;
      lastProgressAt = Date.now();
      bufferingSince = 0;
      state.hlsTelemetry.stalled = false;
      state.hlsTelemetry.loading = false;
      setSpinnerState(false);
    }
    state.livePlayback = { currentTime: cur, duration: dur };
    if (Math.abs(cur - lastSavedSec) >= 5 && dur > 0) {
      lastSavedSec = cur;
      state.progressMap = saveMediaProgress(item, {
        currentTime: cur,
        duration: dur,
        season: state.activeSeason,
        episode: state.activeEpisode,
      });
    }
    updateHudControlsVisuals();
  };

  videoEl.onplaying = markPlayingHealthy;
  videoEl.oncanplay = () => {
    if (sessionSeq !== hlsSessionSeq) return;
    setSpinnerState(false);
    updateHudControlsVisuals();
  };
  videoEl.onplay = () => wakePlayerHud();
  videoEl.onpause = () => {
    bufferingSince = 0;
    wakePlayerHud(true);
    updateHudControlsVisuals();
  };
  videoEl.onwaiting = () => {
    if (sessionSeq !== hlsSessionSeq) return;
    if (!bufferingSince) bufferingSince = Date.now();
    state.hlsTelemetry.loading = true;
    setSpinnerState(true, 'Buffering stream...');
  };
  videoEl.onstalled = () => {
    if (sessionSeq !== hlsSessionSeq) return;
    if (!bufferingSince) bufferingSince = Date.now();
    state.hlsTelemetry.stalled = true;
  };
  videoEl.onvolumechange = () => updateHudControlsVisuals();
  videoEl.onratechange = () => {
    state.hlsTelemetry.speed = Number(videoEl.playbackRate || 1);
    updateHudControlsVisuals();
  };
  videoEl.onprogress = () => updateHudControlsVisuals();

  videoEl.addEventListener(
    'loadedmetadata',
    () => {
      if (sessionSeq !== hlsSessionSeq) return;
      if (saved?.currentTime > 15 && saved.currentTime < (videoEl.duration || Infinity)) {
        try {
          videoEl.currentTime = saved.currentTime;
        } catch {}
      }
      updateHudControlsVisuals();
    },
    { once: true }
  );

  videoEl.onerror = () => {
    if (sessionSeq !== hlsSessionSeq || didFailover) return;
    didFailover = true;
    console.error('[Player] Direct video element error. Triggering failover.');
    triggerHlsFailover(item, 'Direct video error');
  };

  // >6s Playback Stall Watchdog & 1s Telemetry updater
  stallWatchdogTimer = setInterval(() => {
    if (sessionSeq !== hlsSessionSeq || didFailover) return;
    const now = Date.now();
    const isPlayingIntent = !videoEl.paused && !videoEl.ended && !videoEl.seeking;
    const stallRef = bufferingSince || lastProgressAt;
    if (isPlayingIntent && videoEl.readyState < 3 && now - stallRef > 6000) {
      didFailover = true;
      console.warn('[HLS Watchdog] Playback stalled >6s. Failing over to next mirror...');
      triggerHlsFailover(item, 'Playback stalled >6s');
      return;
    }
    if (activeHlsInstance?.bandwidthEstimate) {
      state.hlsTelemetry.bitrateMbps = activeHlsInstance.bandwidthEstimate / 1e6;
    }
    updateTelemetryBadge(videoEl);
  }, 1000);

  const lowerUrl = streamUrl.toLowerCase();
  if (lowerUrl.includes('.mp4') && !lowerUrl.includes('.m3u8')) {
    videoEl.src = streamUrl;
    return;
  }

  const Hls = await loadHlsScriptOnce();
  if (sessionSeq !== hlsSessionSeq) return;

  if (Hls && Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 60,
      maxBufferLength: 30,
    });
    activeHlsInstance = hls;

    let networkRetries = 0;
    let mediaRetries = 0;
    const MAX_RETRIES = 2;

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      if (sessionSeq !== hlsSessionSeq) return;
      const rawLevels = Array.isArray(data?.levels) ? data.levels : hls.levels || [];
      const mappedLevels = rawLevels
        .map((lvl, index) => ({
          index,
          height: Number(lvl.height || 0),
          width: Number(lvl.width || 0),
          bitrate: Number(lvl.bitrate || 0),
        }))
        .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
      state.hlsTelemetry.levels = mappedLevels;
      state.hlsTelemetry.levelIndex = hls.currentLevel;
      setSpinnerState(false);
      updateHudControlsVisuals();
      if (state.hudOpenMenu === 'quality') renderHudPopupMenu();
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
      if (sessionSeq !== hlsSessionSeq) return;
      const lvl = hls.levels?.[data.level];
      if (lvl) {
        state.hlsTelemetry.height = Number(lvl.height || 0);
        state.hlsTelemetry.width = Number(lvl.width || 0);
        if (lvl.bitrate) state.hlsTelemetry.bitrateMbps = lvl.bitrate / 1e6;
      }
      state.hlsTelemetry.levelIndex = hls.autoLevelEnabled ? -1 : data.level;
      updateHudControlsVisuals();
    });

    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
      if (sessionSeq !== hlsSessionSeq) return;
      const tracks = Array.isArray(data?.audioTracks) ? data.audioTracks : hls.audioTracks || [];
      state.hlsTelemetry.audioTracks = tracks.map((tr, i) => ({
        id: tr.id ?? i,
        name: tr.name || tr.lang || `Audio ${i + 1}`,
        lang: tr.lang || '',
      }));
      state.hlsTelemetry.audioTrackIndex = hls.audioTrack;
      updateHudControlsVisuals();
      if (state.hudOpenMenu === 'audio') renderHudPopupMenu();
    });

    hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
      if (sessionSeq !== hlsSessionSeq) return;
      state.hlsTelemetry.audioTrackIndex = data.id;
      updateHudControlsVisuals();
    });

    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
      if (sessionSeq !== hlsSessionSeq) return;
      const tracks = Array.isArray(data?.subtitleTracks) ? data.subtitleTracks : hls.subtitleTracks || [];
      state.hlsTelemetry.subtitleTracks = tracks.map((st, i) => ({
        id: st.id ?? i,
        name: st.name || st.lang || `Subtitle ${i + 1}`,
        lang: st.lang || '',
      }));
      state.hlsTelemetry.subtitleTrackIndex = hls.subtitleTrack;
      updateHudControlsVisuals();
      if (state.hudOpenMenu === 'subtitles') renderHudPopupMenu();
    });

    hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_, data) => {
      if (sessionSeq !== hlsSessionSeq) return;
      state.hlsTelemetry.subtitleTrackIndex = data.id;
      updateHudControlsVisuals();
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (sessionSeq !== hlsSessionSeq || didFailover || !data.fatal) return;

      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          if (networkRetries < MAX_RETRIES) {
            networkRetries += 1;
            console.warn(`[HLS] Network error retry ${networkRetries}/${MAX_RETRIES}...`);
            hls.startLoad();
          } else {
            didFailover = true;
            console.error('[HLS] Fatal network error after retries. Failing over.');
            triggerHlsFailover(item, 'HLS network error');
          }
          break;

        case Hls.ErrorTypes.MEDIA_ERROR:
          if (mediaRetries < MAX_RETRIES) {
            mediaRetries += 1;
            console.warn(`[HLS] Media error retry ${mediaRetries}/${MAX_RETRIES}...`);
            hls.recoverMediaError();
          } else {
            didFailover = true;
            console.error('[HLS] Fatal media error after retries. Failing over.');
            triggerHlsFailover(item, 'HLS media error');
          }
          break;

        default:
          didFailover = true;
          console.error('[HLS] Unrecoverable fatal error:', data.type, data.details);
          triggerHlsFailover(item, data.details || 'Fatal HLS error');
          break;
      }
    });

    hls.loadSource(streamUrl);
    hls.attachMedia(videoEl);
  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    videoEl.src = streamUrl;
  } else {
    didFailover = true;
    triggerHlsFailover(item, 'HLS unsupported in browser');
  }
}

function getHubFilteredItems(hubId, pool) {
  const list = pool || getAllKnownPool();
  switch (hubId) {
    case 'hollywood':
      return list.filter((x) => x.mediaType === 'movie' && !(x.regionTag || '').includes('india'));
    case 'bollywood':
      return list.filter((x) => x.regionTag === 'india' || (x.country || '').includes('India'));
    case 'south':
      return list.filter((x) => x.regionTag === 'south-india');
    case 'anime':
      return list.filter((x) => x.mediaType === 'anime');
    case 'korean':
      return list.filter((x) =>
        /korea|korean|seoul|squid|parasite|vincenzo|proposal|queen|train/i.test(
          `${x.country || ''} ${x.title || ''}`
        )
      );
    case 'scifi':
      return list.filter((x) =>
        (x.genres || []).some((g) => /sci-fi|science fiction|action/i.test(g))
      );
    default:
      return [];
  }
}

async function selectStudioHub(hubId) {
  state.activeHub = state.activeHub === hubId && hubId !== 'all' ? 'all' : hubId;
  state.heroIndex = 0;
  if (state.activeHub === 'all') {
    state.hubItems = [];
    render();
    return;
  }
  const immediate = getHubFilteredItems(state.activeHub);
  state.hubItems = immediate;
  render();

  if (state.activeHub === 'korean' || state.activeHub === 'south' || state.activeHub === 'anime') {
    const langMap = { korean: 'Korean', south: 'South Indian', anime: 'Japanese' };
    try {
      const live = await fetchLanguageCatalog(langMap[state.activeHub]);
      registerItems(live);
      if (state.activeHub === hubId) {
        state.hubItems = live.length ? live : getHubFilteredItems(state.activeHub);
        render();
      }
    } catch {}
  }
}

function getCurrentEmbedUrl() {
  if (!state.activeItem) return '';
  const item = state.activeItem;
  const activeSrc = getActiveResolvedSource();
  const provider = state.prefs.playerProvider || 'vidlink';

  if (activeSrc?.url && !state.activeSourceOverride) {
    if (isPlayableDirectSource(activeSrc)) return activeSrc.url;
    if (activeSrc.type === 'embed') return activeSrc.url;
  }

  // 1. Direct HLS link via Quick Launch or mediaType === 'hls'
  if (item.mediaType === 'hls') {
    return item.hlsUrl || item.hlsStreamUrl || '';
  }

  // 2. Direct HLS stream candidate
  const directStream = item.hlsStreamUrl || (item.hlsUrl && isDirectStreamUrl(item.hlsUrl) ? item.hlsUrl : '');

  // If user selected Native HLS and title has a verified direct stream, return it
  if (provider === 'hls-direct' && directStream && isDirectStreamUrl(directStream)) {
    return directStream;
  }

  // 3. Fallback to sandboxed embed URL (always VidLink when provider is hls-direct without a direct stream)
  if (item.mediaType !== 'anime' && !item.tmdbId) return '';
  return buildPlayerEmbedUrl(item, {
    provider: provider === 'hls-direct' ? 'vidlink' : provider,
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
  if (item.mediaType !== 'anime' && item.mediaType !== 'hls' && !item.tmdbId && !item.hlsStreamUrl) {
    showToast(`Loading "${item.title}" stream...`);
    item = await resolveFullMetadata(item);
    registerItems([item]);
  }
  if (item.mediaType !== 'anime' && item.mediaType !== 'hls' && !item.tmdbId && !item.hlsStreamUrl) {
    showToast('Stream ID unavailable for this entry — try Quick Launch');
    return;
  }

  const launchSeq = ++activeLaunchSeq;
  const key = getMediaKey(item);
  registerItems([item]);
  const saved = state.progressMap[key];
  const resolvedSeason = season ?? saved?.season ?? item.season ?? 1;
  const resolvedEpisode = episode ?? saved?.episode ?? item.episode ?? 1;

  destroyHlsInstance();
  revokeActiveExternalSubBlob();

  state.activeItem = getItemByKey(key) || item;
  state.activeSeason = resolvedSeason;
  state.activeEpisode = resolvedEpisode;
  state.playerOpen = true;
  state.playerEpisodesOpen = false;
  state.modal = null;
  state._hlsFallbackNotifiedItem = null;
  state.resolvedSources = [];
  state.activeSourceIndex = 0;
  state.activeSourceOverride = null;
  state.failoverState = null;
  state.resolvingStream = true;
  state.subtitlesList = [];
  state.activeExternalSubId = 'off';
  state.hudOpenMenu = null;
  state.hudVisible = true;
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

  const resolveOpts = {
    season: resolvedSeason,
    episode: resolvedEpisode,
    hlsProxyUrl: state.prefs.hlsProxyUrl,
    debridKey: state.prefs.debridApiKey,
    debridProvider: state.prefs.debridProvider,
    stremioAddonUrl: state.prefs.stremioAddonUrl,
    themeId: state.appearance.theme,
    autoplay: state.prefs.autoplay,
    sub: state.prefs.sub,
    dub: state.prefs.dub,
    uiScale: state.prefs.uiScale,
  };

  // Resolve ordered multi-node mirror list + free CORS subtitles in parallel
  const subsPromise = fetchFreeSubtitles(state.activeItem, {
    season: resolvedSeason,
    episode: resolvedEpisode,
    preferredLang: state.prefs.sub,
  })
    .then((subs) => {
      if (launchSeq !== activeLaunchSeq || !state.playerOpen) return;
      state.subtitlesList = subs;
      if (state.hudOpenMenu === 'subtitles') renderHudPopupMenu();
    })
    .catch(() => {});

  const sourcesPromise = fetchStreamSources(state.activeItem, resolveOpts)
    .then((sources) => {
      if (launchSeq !== activeLaunchSeq || !state.playerOpen) return;
      state.resolvingStream = false;
      state.resolvedSources = Array.isArray(sources) ? sources : [];

      const prov = state.prefs.playerProvider || 'vidlink';
      const firstHlsIdx = state.resolvedSources.findIndex(isPlayableDirectSource);
      const vidlinkIdx = state.resolvedSources.findIndex((s) => s.id === 'vidlink-shield');
      const vidriftIdx = state.resolvedSources.findIndex((s) => s.id === 'vidrift-sandboxed');
      const isShowcaseOrRaw =
        state.activeItem.mediaType === 'hls' || String(state.activeItem.tmdbId || '').startsWith('test-');

      let pickedIndex = 0;
      if ((prov === 'vidrift' || prov === 'vidrift-direct') && !isShowcaseOrRaw) {
        pickedIndex = vidriftIdx >= 0 ? vidriftIdx : 0;
      } else if (firstHlsIdx >= 0) {
        pickedIndex = firstHlsIdx;
      } else {
        if (prov === 'hls-direct') {
          state._hlsFallbackNotifiedItem = getMediaKey(state.activeItem);
          showToast('Direct HLS stream unavailable for this title. Switched to VidLink shield player.');
        }
        pickedIndex = vidlinkIdx >= 0 ? vidlinkIdx : 0;
      }

      state.activeSourceIndex = Math.max(0, pickedIndex);
      state.failoverState = createFailoverState(state.resolvedSources, state.activeSourceIndex);
      syncPlayerMount();
    })
    .catch(() => {
      if (launchSeq !== activeLaunchSeq || !state.playerOpen) return;
      state.resolvingStream = false;
      syncPlayerMount();
    });

  await Promise.allSettled([sourcesPromise, subsPromise]);

  if (launchSeq !== activeLaunchSeq || !state.playerOpen) return;
  const targetResume = resumeSeconds ?? (saved?.currentTime > 15 ? Math.floor(saved.currentTime) : 0);
  if (targetResume > 0 && !isPlayableDirectSource(getActiveResolvedSource())) {
    setTimeout(() => {
      sendPlayerCommand('resume', { currentTime: targetResume });
      showToast(`Resumed at ${formatTime(targetResume)}`);
    }, 1100);
  }
}

async function openDetailView(key) {
  const dk = isDesktopMode();
  if (dk) {
    state.detailModalKey = key;
  } else {
    if (state.tab !== 'detail') state.prevTab = state.tab;
    state.detailKey = key;
    state.tab = 'detail';
    state.detailModalKey = null;
  }
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
    if (dk) {
      state.detailModalKey = getMediaKey(hydrated);
    } else {
      state.detailKey = getMediaKey(hydrated);
    }
    item = hydrated;
  }

  if (item?.mediaType === 'tv' && (item.tmdbId || item.imdbId)) {
    loadTvSeasons(item.tmdbId, item.imdbId);
  }
  if (!dk) window.scrollTo({ top: 0, behavior: 'instant' });
  render();
}

async function loadTvSeasons(tmdbId, imdbId = '') {
  const cacheKey = String(tmdbId || imdbId);
  if (!cacheKey || state.seasonsCache.has(cacheKey)) return;
  const seasons = await fetchTvSeasonsData(tmdbId, state.prefs.tmdbApiKey, imdbId);
  if (Array.isArray(seasons) && seasons.length > 0) {
    state.seasonsCache.set(cacheKey, seasons);
    if (state.tab === 'detail' || state.detailModalKey || state.playerOpen) render();
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
      <button type="button" class="icon-btn" id="open-quicklaunch-btn" title="Quick Launch ID or HLS URL" aria-label="Quick Launch">
        ${svgIcon('link', 19)}
      </button>
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
  openCinemaItems,
  trendingMovies,
  trendingSeries,
  genreShelfA,
  genreShelfB,
  regionalCinema,
  animeShelf,
  myListSet,
  likedSet,
  progressMap,
  activeHubItems,
  activeHubMeta,
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

    ${renderDesktopBillboard(spotlightList, state.heroIndex, {
      myListSet,
      trailerPlaying: state.heroTrailerPlaying,
      trailerMuted: state.heroTrailerMuted,
    })}

    ${renderStudioHubStrip(state.activeHub)}

    ${
      activeHubMeta && activeHubItems?.length
        ? renderShelf({
            id: 'dk-hub-focus',
            title: `${activeHubMeta.title} • ${activeHubMeta.sub}`,
            items: activeHubItems.slice(0, 24),
            kind: 'dk-wide',
            top10Indices: new Set([0, 1]),
            recentIndices: new Set([0, 2, 3]),
            myListSet,
            likedSet,
            progressMap,
          })
        : ''
    }

    ${
      continueEntries.length > 0
        ? renderShelf({
            id: 'dk-cw',
            title: `Continue Watching for ${state.profile.name || 'Ansh'}`,
            items: continueEntries.slice(0, 14),
            kind: 'dk-wide',
            splitIndices: new Set([1]),
            myListSet,
            likedSet,
            progressMap,
          })
        : ''
    }

    ${
      openCinemaItems?.length > 0
        ? renderShelf({
            id: 'dk-open-cinema',
            title: 'Open Cinema • Instant Native HLS Showcase',
            items: openCinemaItems,
            kind: 'dk-wide',
            recentIndices: new Set([0, 1, 2, 3]),
            myListSet,
            likedSet,
            progressMap,
          })
        : ''
    }

    ${
      state.homeRefreshing && state.liveMovies.length === 0
        ? renderSkeletonShelf({ count: 6, desktop: true })
        : ''
    }

    ${renderShelf({
      id: 'dk-top-picks',
      title: `Today's Top Picks for You`,
      items: genreShelfA.slice(0, 18),
      kind: 'dk-wide',
      top10Indices: new Set([0, 1, 4, 5]),
      recentIndices: new Set([1, 2, 3, 4]),
      splitIndices: new Set([2]),
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
      recentIndices: new Set([1, 3]),
      splitIndices: new Set([0, 2]),
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

  const openCinemaItems = state.catalog.filter((x) => Boolean(x.hlsStreamUrl) && matchesFilter(x));

  const activeHubMeta = state.activeHub !== 'all' ? STUDIO_HUBS.find((h) => h.id === state.activeHub) : null;
  const activeHubItems = activeHubMeta
    ? (state.hubItems.length ? state.hubItems : getHubFilteredItems(state.activeHub, pool)).filter(matchesFilter)
    : [];

  if (isDesktopMode()) {
    return renderDesktopHome({
      spotlightList,
      continueEntries,
      openCinemaItems,
      trendingMovies,
      trendingSeries,
      genreShelfA,
      genreShelfB,
      regionalCinema,
      animeShelf,
      myListSet,
      likedSet: getCollectionSet(LIKED_COLLECTION_ID),
      progressMap: state.progressMap,
      activeHubItems,
      activeHubMeta,
    });
  }

  const chips = [
    { id: 'tv', label: 'Shows' },
    { id: 'movie', label: 'Movies' },
    { id: 'anime', label: 'Anime' },
    { id: 'hot', label: 'New & Hot' },
  ];
  const activeChip = chips.find((c) => c.id === state.homeFilter);
  const displayedChips = activeChip ? [activeChip] : chips;

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
      ${
        activeChip
          ? `<button type="button" class="outline-chip is-dismiss-x" data-reset-home="true" aria-label="Clear filter">
              ${svgIcon('close', 14)}
            </button>`
          : ''
      }
      ${displayedChips
        .map(
          (c) => `<button type="button" class="outline-chip ${
            state.homeFilter === c.id ? 'is-active' : ''
          }" data-home-filter="${c.id}">${c.label}</button>`
        )
        .join('')}
      <button type="button" class="outline-chip" id="open-categories-btn">
        ${activeChip ? `${activeChip.label} Categories` : 'Categories'} ${svgIcon('chevronDown', 14)}
      </button>
      <button type="button" class="outline-chip" id="refresh-home-feed-btn" ${state.homeRefreshing ? 'disabled' : ''}>
        ${svgIcon('refresh', 13)} ${state.homeRefreshing ? 'Loading...' : 'Refresh'}
      </button>
    </div>

    ${renderAndroidBillboard(spotlightList, state.heroIndex, { myListSet })}

    ${renderStudioHubStrip(state.activeHub)}

    ${
      activeHubMeta && activeHubItems.length > 0
        ? renderShelf({
            id: 'mob-hub-focus',
            title: `${activeHubMeta.title} • ${activeHubMeta.sub}`,
            items: activeHubItems.slice(0, 22),
            top10Indices: new Set([0, 1]),
            recentIndices: new Set([0, 2]),
          })
        : ''
    }

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

    ${
      openCinemaItems.length > 0
        ? renderShelf({
            id: 'mob-open-cinema',
            title: 'Open Cinema • Native HLS Showcase',
            items: openCinemaItems,
            recentIndices: new Set([0, 1, 2, 3]),
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

function renderPlayerEpisodesDrawer(item) {
  if (!state.playerEpisodesOpen || !item || (item.mediaType !== 'tv' && item.mediaType !== 'anime')) {
    return '';
  }
  const key = getMediaKey(item);
  const seasons =
    item.mediaType === 'tv'
      ? state.seasonsCache.get(String(item.tmdbId || item.imdbId)) ||
        item.seasonsList || [{ seasonNumber: 1, name: 'Season 1', episodeCount: item.totalEpisodes || 10 }]
      : [];
  const seasonObj =
    seasons.find((s) => s.seasonNumber === state.activeSeason) ||
    seasons[0] || { seasonNumber: 1, name: 'Season 1', episodeCount: item.totalEpisodes || 12 };
  const epList =
    Array.isArray(seasonObj.episodes) && seasonObj.episodes.length
      ? seasonObj.episodes
      : Array.from({ length: Math.min(seasonObj.episodeCount || item.totalEpisodes || 12, 48) }, (_, i) => ({
          episode: i + 1,
          name: `Episode ${i + 1}`,
        }));

  return `<aside class="player-ep-drawer" aria-label="Episodes Drawer">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <strong style="font-size:15px;">Episodes</strong>
      <button type="button" class="icon-btn" id="toggle-player-ep-drawer-btn" aria-label="Close Episodes Drawer" style="width:30px;height:30px;">
        ${svgIcon('close', 16)}
      </button>
    </div>
    ${
      item.mediaType === 'tv' && seasons.length > 0
        ? `<select class="field-select" id="player-ep-season-select">
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
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${epList
        .map((ep) => {
          const isCurr = ep.episode === state.activeEpisode;
          return `<button type="button" class="dk-ep-item" style="padding:8px;${
            isCurr ? 'background:rgba(255,255,255,0.14);' : ''
          }" data-play-episode="${ep.episode}" data-ep-key="${escapeHtml(key)}">
            <span class="dk-ep-num" style="font-size:14px;">${ep.episode}</span>
            <div class="dk-ep-text">
              <div style="font-size:13px;font-weight:600;color:#fff;">${escapeHtml(
                ep.name || `Episode ${ep.episode}`
              )}</div>
            </div>
          </button>`;
        })
        .join('')}
    </div>
  </aside>`;
}

function renderProHlsPlayerStage(item) {
  return `<div class="n77-player is-hud-visible is-paused" id="n77-player" tabindex="0">
    <video id="hls-video-player" playsinline autoplay crossorigin="anonymous"></video>
    <div class="n77-tap-layer" id="n77-tap-layer">
      <div class="n77-tap-zone n77-tap-left" data-tap-side="left" aria-hidden="true"></div>
      <div class="n77-tap-zone n77-tap-center" data-tap-side="center" aria-hidden="true"></div>
      <div class="n77-tap-zone n77-tap-right" data-tap-side="right" aria-hidden="true"></div>
    </div>
    <div class="n77-seek-feedback is-left" id="n77-seek-fb-left">↺ 10s</div>
    <div class="n77-seek-feedback is-right" id="n77-seek-fb-right">10s ↻</div>
    <div class="n77-spinner-overlay" id="n77-spinner">
      <div class="n77-spinner"></div>
      <span class="n77-spinner-label" id="n77-spinner-label">Connecting stream...</span>
    </div>
    <div class="n77-center-controls" id="n77-center-controls">
      <button type="button" class="n77-center-btn n77-skip-btn" id="n77-back10" aria-label="Rewind 10 seconds" title="Rewind 10s (J / Left)">
        <span class="n77-skip-num">-10</span>
      </button>
      <button type="button" class="n77-center-btn n77-play-btn" id="n77-center-play-btn" aria-label="Play or Pause" title="Play/Pause (Space / K)">
        ${svgIcon('play', 32)}
      </button>
      <button type="button" class="n77-center-btn n77-skip-btn" id="n77-fwd10" aria-label="Forward 10 seconds" title="Forward 10s (L / Right)">
        <span class="n77-skip-num">+10</span>
      </button>
    </div>
    <div class="n77-hud" id="n77-hud">
      <div class="n77-hud-telemetry-row">
        <span class="n77-telemetry-badge" id="n77-telemetry-badge">HLS • Connecting...</span>
        <div class="n77-hud-popups" id="n77-hud-popups"></div>
      </div>
      <div class="n77-timeline-wrap" id="n77-timeline-wrap" role="slider" aria-label="Seek timeline" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
        <div class="n77-timeline-tooltip" id="n77-timeline-tooltip">0:00</div>
        <div class="n77-timeline-track">
          <div class="n77-timeline-buffered" id="n77-timeline-buffered"></div>
          <div class="n77-timeline-progress" id="n77-timeline-progress">
            <span class="n77-timeline-thumb"></span>
          </div>
        </div>
      </div>
      <div class="n77-controls-row">
        <div class="n77-controls-left">
          <button type="button" class="n77-ctrl-btn" id="n77-play-btn" aria-label="Play or Pause">${svgIcon('play', 20)}</button>
          <button type="button" class="n77-ctrl-btn n77-hide-xs" id="n77-bar-back10" title="Rewind 10s">-10s</button>
          <button type="button" class="n77-ctrl-btn n77-hide-xs" id="n77-bar-fwd10" title="Forward 10s">+10s</button>
          <div class="n77-vol-group">
            <button type="button" class="n77-ctrl-btn" id="n77-mute-btn" aria-label="Mute or Unmute (M)">${svgIcon('volumeOn', 19)}</button>
            <input type="range" class="n77-vol-slider" id="n77-vol-slider" min="0" max="1" step="0.05" value="1" aria-label="Volume" />
          </div>
          <span class="n77-time-readout" id="n77-time-readout">0:00 / 0:00</span>
        </div>
        <div class="n77-controls-right">
          <button type="button" class="n77-pill-btn" id="n77-menu-mirrors" data-hud-menu="mirrors" title="Switch Stream Mirror / Node">
            <span id="n77-mirror-label">Node</span>
          </button>
          <button type="button" class="n77-pill-btn" id="n77-menu-quality" data-hud-menu="quality" title="ABR Video Quality">
            <span id="n77-quality-label">Auto</span>
          </button>
          <button type="button" class="n77-pill-btn" id="n77-menu-audio" data-hud-menu="audio" title="Audio Track">
            <span id="n77-audio-label">Audio</span>
          </button>
          <button type="button" class="n77-pill-btn" id="n77-menu-subtitles" data-hud-menu="subtitles" title="Subtitles / CC (C)">
            <span id="n77-cc-label">CC</span>
          </button>
          <button type="button" class="n77-pill-btn" id="n77-menu-speed" data-hud-menu="speed" title="Playback Speed">
            <span id="n77-speed-label">1x</span>
          </button>
          <button type="button" class="n77-ctrl-btn n77-hide-xs" id="n77-pip-btn" title="Picture in Picture" aria-label="Picture in Picture">PiP</button>
          <button type="button" class="n77-ctrl-btn" id="n77-fullscreen-btn" title="Fullscreen (F)" aria-label="Fullscreen">⛶</button>
        </div>
      </div>
    </div>
    ${renderPlayerEpisodesDrawer(item)}
  </div>`;
}

function syncPlayerMount({ forceReload = false } = {}) {
  const mount = document.getElementById('player-mount');
  if (!mount) return;
  if (!state.playerOpen || !state.activeItem) {
    destroyHlsInstance();
    mount.innerHTML = '';
    return;
  }

  const item = state.activeItem;
  const provider = state.prefs.playerProvider || 'vidlink';
  const activeSrc = getActiveResolvedSource();
  const hlsNodes = getPlayableHlsNodes(state.resolvedSources);

  // Determine whether current view should render Pro HLS video vs sandboxed iframe vs resolving splash
  let isHls = false;
  let streamUrl = '';
  let effectiveProvider = provider;

  if (state.activeSourceOverride === 'vidlink' || state.activeSourceOverride === 'vidrift' || state.activeSourceOverride === 'vidrift-direct') {
    isHls = false;
    effectiveProvider = state.activeSourceOverride;
    streamUrl = buildPlayerEmbedUrl(item, {
      provider: effectiveProvider,
      themeId: state.appearance.theme,
      autoplay: state.prefs.autoplay,
      sub: state.prefs.sub,
      dub: state.prefs.dub,
      uiScale: state.prefs.uiScale,
      season: state.activeSeason,
      episode: state.activeEpisode,
    });
  } else if (activeSrc && isPlayableDirectSource(activeSrc)) {
    isHls = true;
    streamUrl = activeSrc.url;
    effectiveProvider = 'hls-direct';
  } else if (activeSrc && activeSrc.type === 'embed') {
    isHls = false;
    streamUrl = activeSrc.url;
    effectiveProvider = activeSrc.id === 'vidrift-sandboxed' ? (provider === 'vidrift-direct' ? 'vidrift-direct' : 'vidrift') : 'vidlink';
  } else {
    const directStreamUrl =
      (item.mediaType === 'hls' && item.hlsUrl) ||
      item.hlsStreamUrl ||
      (item.hlsUrl && isDirectStreamUrl(item.hlsUrl) ? item.hlsUrl : null);
    const hasDirectStream = Boolean(directStreamUrl && isDirectStreamUrl(directStreamUrl));
    const isShowcase = String(item.tmdbId || '').startsWith('test-');
    isHls = hasDirectStream && (provider === 'hls-direct' || item.mediaType === 'hls' || isShowcase);

    if (provider === 'hls-direct' && !hasDirectStream && !state.resolvingStream) {
      const itemKey = getMediaKey(item);
      if (state._hlsFallbackNotifiedItem !== itemKey) {
        state._hlsFallbackNotifiedItem = itemKey;
        showToast('Direct HLS stream unavailable for this title. Switched to VidLink shield player.');
      }
    }

    streamUrl = isHls ? directStreamUrl : getCurrentEmbedUrl();
    effectiveProvider = isHls ? 'hls-direct' : provider === 'hls-direct' ? 'vidlink' : provider;
  }

  const stillResolving = Boolean(state.resolvingStream && !isHls && hlsNodes.length === 0 && !item.hlsStreamUrl && item.mediaType !== 'hls');
  const isSandboxed = effectiveProvider !== 'vidrift-direct' && state.shield.strictFrameMode;
  const existingFrame = document.getElementById('vidrift-player');
  const existingVideo = document.getElementById('hls-video-player');
  const existingResolving = document.getElementById('n77-resolving-box');
  const modeMismatch = stillResolving
    ? !existingResolving
    : (isHls && !existingVideo) || (!isHls && !existingFrame);

  if (modeMismatch || forceReload) {
    destroyHlsInstance();
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
            <div class="dim" id="player-stream-subtitle" style="font-size:11px;">${
              item.mediaType === 'tv'
                ? `Season ${state.activeSeason} • Episode ${state.activeEpisode}`
                : item.mediaType === 'anime'
                ? `Episode ${state.activeEpisode}`
                : isHls
                ? escapeHtml(activeSrc?.name || 'Pro HLS Stream')
                : 'HD Stream'
            }</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${
            item.mediaType === 'tv' || item.mediaType === 'anime'
              ? `<button type="button" class="outline-chip ${
                  state.playerEpisodesOpen ? 'is-active' : ''
                }" id="toggle-player-ep-drawer-btn" style="height:28px;font-size:11px;">
                  Episodes
                </button>`
              : ''
          }
          ${
            isHls
              ? `<span class="shield-pill" id="player-hls-pill">${svgIcon('shield', 13)}<span>Pro HLS${
                  hlsNodes.length > 1 ? ` • ${hlsNodes.length} Nodes` : ''
                }</span></span>`
              : `<button type="button" class="shield-pill ${isSandboxed ? '' : 'is-warn'}" id="toggle-strict-shield-btn">
                  ${svgIcon('shield', 13)}
                  <span>${isSandboxed ? 'No-Redirect ON' : 'Sandbox OFF'}</span>
                </button>`
          }
        </div>
      </div>

      <div class="player-frame-box" id="player-frame-box">
        ${
          stillResolving
            ? `<div class="n77-resolving-box" id="n77-resolving-box">
                <div class="n77-spinner"></div>
                <span class="n77-spinner-label">Resolving stream nodes &amp; mirrors...</span>
              </div>`
            : isHls
            ? renderProHlsPlayerStage(item)
            : `<iframe
                id="vidrift-player"
                src="${escapeHtml(streamUrl)}"
                title="${escapeHtml(item.title)}"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowfullscreen
                referrerpolicy="strict-origin-when-cross-origin"
              ></iframe>
              ${renderPlayerEpisodesDrawer(item)}`
        }
      </div>

      <div class="player-bottom-strip" id="player-bottom-strip"></div>
    </section>`;

    if (!stillResolving && isHls) {
      const videoEl = document.getElementById('hls-video-player');
      attachDirectVideoStream(videoEl, streamUrl, item, activeSrc);
      if (videoEl) videoEl.dataset.embedUrl = streamUrl;
    } else if (!stillResolving) {
      const frame = document.getElementById('vidrift-player');
      if (frame) {
        frame.dataset.embedUrl = streamUrl;
        applySandboxAttr(frame);
      }
    }
  } else if (!stillResolving) {
    if (!isHls && existingFrame) {
      const prevSandbox = existingFrame.hasAttribute('sandbox');
      applySandboxAttr(existingFrame);
      if (existingFrame.dataset.embedUrl !== streamUrl || prevSandbox !== isSandboxed) {
        existingFrame.src = streamUrl;
        existingFrame.dataset.embedUrl = streamUrl;
      }
    } else if (isHls && existingVideo && existingVideo.dataset.embedUrl !== streamUrl) {
      existingVideo.dataset.embedUrl = streamUrl;
      attachDirectVideoStream(existingVideo, streamUrl, item, activeSrc);
    }

    const hostBox = isHls ? document.getElementById('n77-player') : document.getElementById('player-frame-box');
    if (hostBox) {
      const prevDrawer = hostBox.querySelector('.player-ep-drawer');
      if (prevDrawer) prevDrawer.remove();
      const drawerHtml = renderPlayerEpisodesDrawer(item);
      if (drawerHtml) hostBox.insertAdjacentHTML('beforeend', drawerHtml);
    }
    const epToggle = document.getElementById('toggle-player-ep-drawer-btn');
    if (epToggle) epToggle.classList.toggle('is-active', Boolean(state.playerEpisodesOpen));

    const hlsPillSpan = document.querySelector('#player-hls-pill span');
    if (hlsPillSpan && isHls) {
      hlsPillSpan.textContent = `Pro HLS${hlsNodes.length > 1 ? ` • ${hlsNodes.length} Nodes` : ''}`;
    }
    const subLabelEl = document.getElementById('player-stream-subtitle');
    if (subLabelEl && isHls && item.mediaType !== 'tv' && item.mediaType !== 'anime') {
      subLabelEl.textContent = activeSrc?.name || 'Pro HLS Stream';
    }
  }

  const strip = document.getElementById('player-bottom-strip');
  if (strip) {
    const saved = state.progressMap[getMediaKey(item)];
    strip.innerHTML = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
      ${
        isHls && state.resolvedSources.length > 0
          ? `<span class="dim" style="font-size:11.5px;">Node ${state.activeSourceIndex + 1}/${state.resolvedSources.length}</span>`
          : ''
      }
      ${PLAYER_PROVIDERS.map(
        (p) => `<button type="button" class="outline-chip ${
          effectiveProvider === p.id ? 'is-active' : ''
        }" data-switch-provider="${p.id}" style="height:30px;padding:0 10px;font-size:11px;">${escapeHtml(
          p.label
        )}</button>`
      ).join('')}
      ${
        saved?.currentTime > 15 && provider !== 'vidlink' && !isHls
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
        item.mediaType !== 'movie' && item.mediaType !== 'hls'
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
    <div id="detail-modal-mount"></div>
    <div id="player-mount"></div>
    <div id="modal-mount"></div>
  </div>`;
}

function render(options = {}) {
  ensureMounts();
  const dk = isDesktopMode();
  const root = document.getElementById('sc-root');
  root.className = `sc-shell ${state.prefs.phoneFrameOnDesktop ? 'is-phone-preview' : ''}`;

  const viewMount = document.getElementById('view-mount');
  viewMount.innerHTML = renderActiveView();
  if (state.lastRenderedTab !== state.tab) {
    state.lastRenderedTab = state.tab;
    viewMount.classList.remove('view-enter');
    void viewMount.offsetWidth;
    viewMount.classList.add('view-enter');
  }

  document.getElementById('nav-mount').innerHTML =
    state.playerOpen || dk ? '' : renderFloatingBottomNav();
  syncPlayerMount(options);

  const detailMount = document.getElementById('detail-modal-mount');
  if (dk && state.detailModalKey && !state.playerOpen) {
    const item = getItemByKey(state.detailModalKey);
    const key = item ? getMediaKey(item) : '';
    const seasons =
      item?.mediaType === 'tv'
        ? state.seasonsCache.get(String(item.tmdbId || item.imdbId)) ||
          item.seasonsList || [{ seasonNumber: 1, name: 'Season 1', episodeCount: item.totalEpisodes || 10 }]
        : [];
    const related = getAllKnownPool().filter((x) => getMediaKey(x) !== key);
    detailMount.innerHTML = renderDesktopDetailModal({
      item,
      inMyList: getCollectionSet(MY_LIST_COLLECTION_ID).has(key),
      isLiked: getCollectionSet(LIKED_COLLECTION_ID).has(key),
      savedProgress: state.progressMap[key],
      trailerMuted: state.detailTrailerMuted,
      trailerPlaying: state.detailTrailerPlaying,
      seasons,
      activeSeason: state.activeSeason,
      relatedItems: related,
      myListSet: getCollectionSet(MY_LIST_COLLECTION_ID),
      dubEnabled: state.prefs.dub,
    });
  } else {
    detailMount.innerHTML = '';
  }

  const modalMount = document.getElementById('modal-mount');
  if (state.modal === 'settings') {
    modalMount.innerHTML = renderSettingsSheet({
      appearance: state.appearance,
      prefs: state.prefs,
      shield: state.shield,
      profile: state.profile,
    });
  } else if (state.modal === 'categories') {
    modalMount.innerHTML = renderCategoriesSheet(state.discoverGenre, { desktop: dk });
  } else if (state.modal === 'notifications') {
    modalMount.innerHTML = renderNotificationsSheet(getAllKnownPool(), { desktop: dk });
  } else if (state.modal === 'cwmenu') {
    modalMount.innerHTML = renderContinueMenuSheet(getItemByKey(state.cwMenuKey));
  } else if (state.modal === 'quicklaunch') {
    modalMount.innerHTML = renderQuickLaunchSheet();
  } else {
    modalMount.innerHTML = '';
  }

  const topbar = document.querySelector('.dk-topbar');
  if (topbar && typeof window !== 'undefined') {
    topbar.classList.toggle('is-scrolled', window.scrollY > 18);
  }
  if (typeof document !== 'undefined') {
    document.body.style.overflow = state.playerOpen || (dk && state.detailModalKey) || state.modal ? 'hidden' : '';
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

function buildDirectStreamItem(parsed, customTitle = '') {
  if (parsed.mediaType === 'hls') {
    return {
      id: `hls:${parsed.infoHash || parsed.hlsUrl}`,
      mediaType: 'hls',
      hlsUrl: parsed.hlsUrl,
      magnetUri: parsed.magnetUri,
      infoHash: parsed.infoHash,
      title: customTitle || (parsed.infoHash ? `Debrid Torrent #${parsed.infoHash.slice(0, 8)}` : `Direct ${parsed.format.toUpperCase()} Stream`),
    };
  }
  return {
    id: `${parsed.mediaType}:${parsed.tmdbId || parsed.anilistId}`,
    tmdbId: parsed.tmdbId,
    anilistId: parsed.anilistId,
    mediaType: parsed.mediaType,
    title: customTitle || `${parsed.mediaType.toUpperCase()} #${parsed.tmdbId || parsed.anilistId}`,
  };
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
      state.heroTrailerPlaying = false;
      render();
      return;
    }

    const heroSetBtn = target.closest('[data-hero-set]');
    if (heroSetBtn) {
      state.heroIndex = Number(heroSetBtn.dataset.heroSet) || 0;
      state.heroTrailerPlaying = false;
      render();
      return;
    }

    const pickHubBtn = target.closest('[data-pick-hub]');
    if (pickHubBtn) {
      selectStudioHub(pickHubBtn.dataset.pickHub);
      return;
    }

    if (target.closest('#hero-trailer-toggle')) {
      if (!state.heroTrailerPlaying) {
        state.heroTrailerPlaying = true;
        state.heroTrailerMuted = false;
      } else {
        state.heroTrailerMuted = !state.heroTrailerMuted;
      }
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
      if (state.homeFilter === 'movie' || state.homeFilter === 'tv' || state.homeFilter === 'anime') {
        state.discoverType = state.homeFilter;
      } else {
        state.discoverType = 'all';
      }
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

    if (
      target.closest('#detail-back-btn') ||
      target.matches('[data-close-detail-modal="true"]')
    ) {
      if (state.detailModalKey) {
        state.detailModalKey = null;
        state.detailTrailerPlaying = false;
      } else {
        state.tab = state.prevTab || 'home';
      }
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

    const hoverSoundBtn = target.closest('[data-toggle-hover-sound]');
    if (hoverSoundBtn) {
      e.stopPropagation();
      state.heroTrailerMuted = !state.heroTrailerMuted;
      showToast(state.heroTrailerMuted ? 'Muted' : 'Audio Preview ON');
      render();
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
        launchStream(buildDirectStreamItem(parsed), { season: parsed.season || 1, episode: parsed.episode || 1 });
      }
      return;
    }

    // Player controls
    if (target.closest('#close-player-btn')) {
      destroyHlsInstance();
      revokeActiveExternalSubBlob();
      activeLaunchSeq += 1;
      state.playerOpen = false;
      state.playerEpisodesOpen = false;
      state.resolvingStream = false;
      state.resolvedSources = [];
      state.activeSourceOverride = null;
      state.hudOpenMenu = null;
      antiRedirectGuard.setTheaterActive(false);
      render();
      return;
    }
    if (target.closest('#toggle-player-ep-drawer-btn')) {
      state.playerEpisodesOpen = !state.playerEpisodesOpen;
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

    // Net77 Pro HLS HUD interactions
    if (target.closest('#n77-play-btn') || target.closest('#n77-center-play-btn')) {
      toggleVideoPlayPause();
      return;
    }
    if (target.closest('#n77-back10') || target.closest('#n77-bar-back10')) {
      seekVideoBy(-10);
      return;
    }
    if (target.closest('#n77-fwd10') || target.closest('#n77-bar-fwd10')) {
      seekVideoBy(10);
      return;
    }
    if (target.closest('#n77-mute-btn')) {
      const videoEl = document.getElementById('hls-video-player');
      if (videoEl) {
        videoEl.muted = !videoEl.muted;
        wakePlayerHud();
        updateHudControlsVisuals();
      }
      return;
    }
    if (target.closest('#n77-pip-btn')) {
      const videoEl = document.getElementById('hls-video-player');
      if (videoEl && document.pictureInPictureEnabled) {
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture?.().catch(() => {});
        } else {
          videoEl.requestPictureInPicture?.().catch(() => showToast('PiP unavailable'));
        }
      } else {
        showToast('Picture-in-Picture unavailable in this browser');
      }
      return;
    }
    if (target.closest('#n77-fullscreen-btn')) {
      togglePlayerFullscreen();
      return;
    }
    if (target.closest('[data-close-hud-menu="true"]')) {
      state.hudOpenMenu = null;
      renderHudPopupMenu();
      wakePlayerHud();
      return;
    }
    const hudMenuBtn = target.closest('[data-hud-menu]');
    if (hudMenuBtn) {
      const nextMenu = hudMenuBtn.dataset.hudMenu;
      state.hudOpenMenu = state.hudOpenMenu === nextMenu ? null : nextMenu;
      renderHudPopupMenu();
      wakePlayerHud(Boolean(state.hudOpenMenu));
      return;
    }
    const levelBtn = target.closest('[data-hls-level]');
    if (levelBtn) {
      const lvl = Number(levelBtn.dataset.hlsLevel);
      if (activeHlsInstance) {
        activeHlsInstance.currentLevel = lvl;
        state.hlsTelemetry.levelIndex = lvl;
      }
      state.hudOpenMenu = null;
      renderHudPopupMenu();
      updateHudControlsVisuals();
      showToast(lvl === -1 ? 'Quality: Auto (ABR)' : `Quality locked: ${levelBtn.textContent.trim().split(' ')[0]}`);
      return;
    }
    const audioBtn = target.closest('[data-hls-audio]');
    if (audioBtn) {
      const trackId = Number(audioBtn.dataset.hlsAudio);
      if (activeHlsInstance) {
        activeHlsInstance.audioTrack = trackId;
        state.hlsTelemetry.audioTrackIndex = trackId;
      }
      state.hudOpenMenu = null;
      renderHudPopupMenu();
      updateHudControlsVisuals();
      return;
    }
    if (target.closest('[data-hls-sub-off="true"]')) {
      applyExternalSubtitleTrack('off');
      state.hudOpenMenu = null;
      renderHudPopupMenu();
      return;
    }
    const hlsSubBtn = target.closest('[data-hls-sub]');
    if (hlsSubBtn) {
      const trackId = Number(hlsSubBtn.dataset.hlsSub);
      const videoEl = document.getElementById('hls-video-player');
      videoEl?.querySelectorAll('track[data-suno-ext-sub="true"]').forEach((t) => t.remove());
      revokeActiveExternalSubBlob();
      state.activeExternalSubId = 'off';
      if (activeHlsInstance) {
        activeHlsInstance.subtitleTrack = trackId;
        activeHlsInstance.subtitleDisplay = true;
        state.hlsTelemetry.subtitleTrackIndex = trackId;
      }
      state.hudOpenMenu = null;
      renderHudPopupMenu();
      updateHudControlsVisuals();
      return;
    }
    const extSubBtn = target.closest('[data-ext-sub]');
    if (extSubBtn) {
      applyExternalSubtitleTrack(extSubBtn.dataset.extSub);
      state.hudOpenMenu = null;
      renderHudPopupMenu();
      return;
    }
    const speedBtn = target.closest('[data-hls-speed]');
    if (speedBtn) {
      const sp = Number(speedBtn.dataset.hlsSpeed) || 1;
      const videoEl = document.getElementById('hls-video-player');
      if (videoEl) videoEl.playbackRate = sp;
      state.hlsTelemetry.speed = sp;
      state.hudOpenMenu = null;
      renderHudPopupMenu();
      updateHudControlsVisuals();
      return;
    }
    const mirrorBtn = target.closest('[data-pick-mirror]');
    if (mirrorBtn) {
      const idx = Number(mirrorBtn.dataset.pickMirror);
      const src = state.resolvedSources[idx];
      if (src) {
        state.activeSourceOverride = null;
        state.activeSourceIndex = idx;
        state.failoverState = createFailoverState(state.resolvedSources, idx);
        state.hudOpenMenu = null;
        renderHudPopupMenu();
        if (isPlayableDirectSource(src)) {
          showToast(`Switched mirror: ${src.name}`);
          syncPlayerMount();
        } else {
          fallbackToEmbedPlayer(state.activeItem, `Switched to ${src.name}`, src.url);
        }
      }
      return;
    }

    const switchProvBtn = target.closest('[data-switch-provider]');
    if (switchProvBtn) {
      const prov = switchProvBtn.dataset.switchProvider;
      if (prov === 'hls-direct') {
        const item = state.activeItem;
        const firstHlsIdx = state.resolvedSources.findIndex(isPlayableDirectSource);
        const directUrl =
          (firstHlsIdx >= 0 && state.resolvedSources[firstHlsIdx]?.url) ||
          (item?.mediaType === 'hls' && item?.hlsUrl) ||
          item?.hlsStreamUrl ||
          (item?.hlsUrl && isDirectStreamUrl(item.hlsUrl) ? item.hlsUrl : null);
        const hasDirect = Boolean(directUrl && isDirectStreamUrl(directUrl));
        if (!hasDirect) {
          state.prefs = savePlayerPrefs({ playerProvider: 'vidlink' });
          state.activeSourceOverride = 'vidlink';
          antiRedirectGuard.setStrictFrameMode(true);
          state.shield = antiRedirectGuard.getSnapshot();
          showToast('Direct HLS stream unavailable for this title. Switched to VidLink shield player.');
          render({ forceReload: true });
          return;
        }
        state.activeSourceOverride = null;
        if (firstHlsIdx >= 0) {
          state.activeSourceIndex = firstHlsIdx;
          state.failoverState = createFailoverState(state.resolvedSources, firstHlsIdx);
        }
      } else {
        state.activeSourceOverride = prov;
        const matchIdx = state.resolvedSources.findIndex((s) =>
          prov === 'vidlink' ? s.id === 'vidlink-shield' : s.id === 'vidrift-sandboxed'
        );
        if (matchIdx >= 0) state.activeSourceIndex = matchIdx;
      }
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
      const hlsProxyUrl = cleanProxyUrl(document.getElementById('pref-hls-proxy')?.value || '');
      const stremioAddonUrl = cleanAddonUrl(document.getElementById('pref-stremio-addon')?.value || '');
      const debridProvider = document.getElementById('pref-debrid-provider')?.value || 'realdebrid';
      const debridApiKey = (document.getElementById('pref-debrid-key')?.value || '').trim();

      state.profile = saveProfile({ name });
      antiRedirectGuard.setNavigationLock(navLock);
      antiRedirectGuard.setStrictFrameMode(strictSandbox);
      state.shield = antiRedirectGuard.getSnapshot();
      state.prefs = savePlayerPrefs({
        autoplay,
        dub,
        sub,
        tmdbApiKey,
        phoneFrameOnDesktop,
        playerProvider,
        hlsProxyUrl,
        stremioAddonUrl,
        debridProvider,
        debridApiKey,
      });
      state.modal = null;
      showToast('Settings saved');
      render();
    }
  });

  rootEl.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'detail-season-select' || t.id === 'player-ep-season-select') {
      state.activeSeason = Number(t.value) || 1;
      if (t.id === 'detail-season-select') state.activeEpisode = 1;
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
    if (t.id === 'n77-vol-slider') {
      const videoEl = document.getElementById('hls-video-player');
      if (videoEl) {
        const vol = Math.max(0, Math.min(1, Number(t.value)));
        videoEl.volume = vol;
        videoEl.muted = vol === 0;
        wakePlayerHud();
        updateHudControlsVisuals();
      }
      return;
    }
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
        showToast('Enter a valid TMDB/AniList ID or https:// stream URL');
        return;
      }
      state.modal = null;
      launchStream(buildDirectStreamItem(parsed, customTitle), {
        season: parsed.season || 1,
        episode: parsed.episode || 1,
      });
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

  window.addEventListener(
    'scroll',
    () => {
      const topbar = document.querySelector('.dk-topbar');
      if (topbar) topbar.classList.toggle('is-scrolled', window.scrollY > 18);
    },
    { passive: true }
  );

  rootEl.addEventListener(
    'mouseenter',
    (e) => {
      const card = e.target?.closest?.('.dk-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const row = card.closest('.nf-row');
      const bounds = row ? row.getBoundingClientRect() : { left: 0, right: window.innerWidth };
      const leftEdge = Math.max(16, bounds.left + 44);
      const rightEdge = Math.min(window.innerWidth - 16, bounds.right - 44);
      card.classList.toggle('is-edge-left', rect.left <= leftEdge);
      card.classList.toggle('is-edge-right', rect.right >= rightEdge);
    },
    true
  );

  rootEl.addEventListener(
    'scroll',
    (e) => {
      const row = e.target;
      if (!row?.classList?.contains('nf-row') || !row.dataset.shelfRow) return;
      const indWrap = document.getElementById(`ind-${row.dataset.shelfRow}`);
      if (!indWrap || indWrap.children.length === 0) return;
      const dashes = indWrap.children;
      const maxScroll = Math.max(1, row.scrollWidth - row.clientWidth);
      const ratio = Math.min(1, Math.max(0, row.scrollLeft / maxScroll));
      const activeIdx = Math.min(dashes.length - 1, Math.round(ratio * (dashes.length - 1)));
      Array.from(dashes).forEach((d, idx) => d.classList.toggle('is-active', idx === activeIdx));
    },
    true
  );

  // Net77 Player HUD gesture, timeline scrubbing & keyboard shortcut handlers
  let timelineDragging = false;
  let lastTapAt = 0;
  let lastTapSide = '';
  let singleTapTimer = null;

  const updateSeekFromPointer = (clientX, commitSeek = false) => {
    const wrap = document.getElementById('n77-timeline-wrap');
    const videoEl = document.getElementById('hls-video-player');
    if (!wrap || !videoEl) return;
    const rect = wrap.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const dur = Number(videoEl.duration || 0);
    const tooltip = document.getElementById('n77-timeline-tooltip');
    if (tooltip) {
      tooltip.style.left = `${(ratio * 100).toFixed(2)}%`;
      tooltip.textContent = dur > 0 && Number.isFinite(dur) ? formatTime(ratio * dur) : '--:--';
    }
    if (commitSeek && dur > 0 && Number.isFinite(dur)) {
      try {
        videoEl.currentTime = ratio * dur;
      } catch {}
      updateHudControlsVisuals();
    }
  };

  rootEl.addEventListener('pointerdown', (e) => {
    const wrap = e.target?.closest?.('#n77-timeline-wrap');
    if (wrap) {
      timelineDragging = true;
      wrap.classList.add('is-dragging');
      try {
        wrap.setPointerCapture?.(e.pointerId);
      } catch {}
      wakePlayerHud(true);
      updateSeekFromPointer(e.clientX, true);
      return;
    }
    if (e.target?.closest?.('#n77-player')) {
      wakePlayerHud();
    }
  });

  rootEl.addEventListener('pointermove', (e) => {
    if (e.target?.closest?.('#n77-player')) {
      wakePlayerHud();
    }
    if (timelineDragging || e.target?.closest?.('#n77-timeline-wrap')) {
      updateSeekFromPointer(e.clientX, timelineDragging);
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (timelineDragging) {
      timelineDragging = false;
      const wrap = document.getElementById('n77-timeline-wrap');
      wrap?.classList.remove('is-dragging');
      updateSeekFromPointer(e.clientX, true);
      wakePlayerHud();
    }
  });

  rootEl.addEventListener('click', (e) => {
    const tapZone = e.target?.closest?.('.n77-tap-zone');
    if (!tapZone) return;
    if (state.hudOpenMenu) {
      state.hudOpenMenu = null;
      renderHudPopupMenu();
      wakePlayerHud();
      return;
    }
    const side = tapZone.dataset.tapSide;
    const now = Date.now();
    if (side !== 'center' && side === lastTapSide && now - lastTapAt < 320) {
      clearTimeout(singleTapTimer);
      lastTapAt = 0;
      seekVideoBy(side === 'left' ? -10 : 10);
      return;
    }
    lastTapAt = now;
    lastTapSide = side;
    if (side === 'center') {
      toggleVideoPlayPause();
    } else {
      clearTimeout(singleTapTimer);
      singleTapTimer = setTimeout(() => {
        if (state.hudVisible) {
          wakePlayerHud();
        } else {
          wakePlayerHud();
        }
      }, 240);
    }
  });

  window.addEventListener('keydown', (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;

    if (e.key === 'Escape') {
      if (state.playerOpen && state.hudOpenMenu) {
        state.hudOpenMenu = null;
        renderHudPopupMenu();
        wakePlayerHud();
      } else if (state.playerOpen && document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      } else if (state.playerOpen) {
        destroyHlsInstance();
        revokeActiveExternalSubBlob();
        activeLaunchSeq += 1;
        state.playerOpen = false;
        state.resolvingStream = false;
        state.resolvedSources = [];
        antiRedirectGuard.setTheaterActive(false);
        render();
      } else if (state.modal) {
        state.modal = null;
        render();
      } else if (state.detailModalKey) {
        state.detailModalKey = null;
        state.detailTrailerPlaying = false;
        render();
      } else if (state.desktopSearchOpen) {
        state.desktopSearchOpen = false;
        render();
      }
      return;
    }

    if (!state.playerOpen || isTyping) return;
    const videoEl = document.getElementById('hls-video-player');
    if (!videoEl) return;

    const k = e.key.toLowerCase();
    if (e.key === ' ' || k === 'k') {
      e.preventDefault();
      toggleVideoPlayPause();
    } else if (e.key === 'ArrowLeft' || k === 'j') {
      e.preventDefault();
      seekVideoBy(-10);
    } else if (e.key === 'ArrowRight' || k === 'l') {
      e.preventDefault();
      seekVideoBy(10);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      videoEl.muted = false;
      videoEl.volume = Math.min(1, Number((videoEl.volume + 0.1).toFixed(2)));
      wakePlayerHud();
      updateHudControlsVisuals();
      showToast(`Volume ${Math.round(videoEl.volume * 100)}%`);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      videoEl.volume = Math.max(0, Number((videoEl.volume - 0.1).toFixed(2)));
      if (videoEl.volume === 0) videoEl.muted = true;
      wakePlayerHud();
      updateHudControlsVisuals();
      showToast(`Volume ${Math.round(videoEl.volume * 100)}%`);
    } else if (k === 'm') {
      e.preventDefault();
      videoEl.muted = !videoEl.muted;
      wakePlayerHud();
      updateHudControlsVisuals();
      showToast(videoEl.muted ? 'Muted' : 'Unmuted');
    } else if (k === 'f') {
      e.preventDefault();
      togglePlayerFullscreen();
    } else if (k === 'c') {
      e.preventDefault();
      toggleClosedCaptionsShortcut();
    }
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
    if (
      state.tab === 'home' &&
      !state.playerOpen &&
      !state.modal &&
      !state.detailModalKey &&
      !state.heroTrailerPlaying &&
      !busyHover
    ) {
      state.heroIndex = (state.heroIndex + 1) % 8;
      render();
    }
  }, 10000);

  await loadHomeDynamicFeeds();
}

init();
