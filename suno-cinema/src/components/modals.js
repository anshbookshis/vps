import { APPEARANCE_THEMES } from '../utils/storage.js';
import { PLAYER_PROVIDERS } from '../utils/vidrift.js';
import { BROWSE_GENRES } from '../utils/client-api.js';
import { getMediaKey } from '../utils/storage.js';
import { svgIcon } from './icons.js';
import { escapeHtml } from './cards.js';

export function renderSettingsSheet({ appearance, prefs, shield, profile }) {
  const s = shield || { blockedCount: 0, navigationLock: true, strictFrameMode: false };
  return `<div class="sheet-backdrop" data-close-modal="true">
    <div class="sheet-card" role="dialog" aria-modal="true" aria-label="Suno Cinema Settings">
      <div class="sheet-grab-bar" aria-hidden="true"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h2 style="font-size:18px;font-weight:700;">Suno Cinema Settings</h2>
        <button type="button" class="icon-btn" data-close-modal="true" aria-label="Close">
          ${svgIcon('close', 20)}
        </button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="display:flex;flex-direction:column;gap:5px;">
          <label class="dim" style="font-size:12px;" for="pref-profile-name">Profile Name</label>
          <input id="pref-profile-name" class="field-input" value="${escapeHtml(profile?.name || 'Ansh')}" maxlength="24" />
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;">
          <label class="dim" style="font-size:12px;" for="pref-sub">Default Subtitles</label>
          <select id="pref-sub" class="field-select">
            <option value="en" ${prefs.sub === 'en' ? 'selected' : ''}>English (en)</option>
            <option value="auto" ${prefs.sub === 'auto' ? 'selected' : ''}>Auto</option>
            <option value="hi" ${prefs.sub === 'hi' ? 'selected' : ''}>Hindi (hi)</option>
            <option value="es" ${prefs.sub === 'es' ? 'selected' : ''}>Spanish (es)</option>
            <option value="ja" ${prefs.sub === 'ja' ? 'selected' : ''}>Japanese (ja)</option>
          </select>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;">
        <span class="dim" style="font-size:12px;">Suno Accent Theme</span>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${APPEARANCE_THEMES.map(
            (t) => `<button type="button" class="outline-chip ${
              appearance.theme === t.id ? 'is-active' : ''
            }" data-pick-theme="${t.id}">
              <span style="width:10px;height:10px;border-radius:50%;background:${t.accent};display:inline-block;"></span>
              ${escapeHtml(t.name)}
            </button>`
          ).join('')}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:10px;background:#101013;border:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;">
            ${svgIcon('shield', 16)} Zero-Ad &amp; Anti-Redirect Shield
          </span>
          <span class="shield-pill">${s.blockedCount} blocked</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;">
          <label class="dim" style="font-size:11px;" for="pref-provider">Default Stream Player</label>
          <select id="pref-provider" class="field-select">
            ${PLAYER_PROVIDERS.map(
              (p) => `<option value="${p.id}" ${
                (prefs.playerProvider || 'vidlink') === p.id ? 'selected' : ''
              }>${escapeHtml(p.label)}</option>`
            ).join('')}
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
          <input type="checkbox" id="pref-navlock" ${s.navigationLock ? 'checked' : ''} />
          Lock page navigation during playback
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
          <input type="checkbox" id="pref-strict-sandbox" ${s.strictFrameMode ? 'checked' : ''} />
          Sandbox player iframe (blocks 100% of ad popups &amp; redirects)
        </label>
      </div>

      <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;">
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;">
          <input type="checkbox" id="pref-autoplay" ${prefs.autoplay ? 'checked' : ''} /> Autoplay VidRift
        </label>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;">
          <input type="checkbox" id="pref-dub" ${prefs.dub ? 'checked' : ''} /> Anime English Dub
        </label>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;">
          <input type="checkbox" id="pref-phone-frame" ${prefs.phoneFrameOnDesktop ? 'checked' : ''} /> Android Phone Frame (Desktop)
        </label>
      </div>

      <div style="display:flex;flex-direction:column;gap:5px;">
        <label class="dim" style="font-size:12px;" for="pref-tmdb-key">Optional TMDB Key (free Cinemeta &amp; AniList already active)</label>
        <input id="pref-tmdb-key" class="field-input" type="password" placeholder="Optional" value="${escapeHtml(prefs.tmdbApiKey || '')}" />
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:10px;background:#101013;border:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:13px;font-weight:700;">Pro HLS Edge Proxy, Addon &amp; Debrid</span>
          <span class="dim" style="font-size:11px;">Static / Local Node</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;">
          <label class="dim" style="font-size:11px;" for="pref-hls-proxy">HLS Edge Proxy URL (Cloudflare Worker or Local Node)</label>
          <input id="pref-hls-proxy" class="field-input" type="url" placeholder="e.g. https://your-proxy.workers.dev or http://localhost:3000" value="${escapeHtml(prefs.hlsProxyUrl || '')}" />
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;">
          <label class="dim" style="font-size:11px;" for="pref-stremio-addon">Optional Stremio Stream Addon URL</label>
          <input id="pref-stremio-addon" class="field-input" type="url" placeholder="https://your-addon.example.com" value="${escapeHtml(prefs.stremioAddonUrl || '')}" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="display:flex;flex-direction:column;gap:5px;">
            <label class="dim" style="font-size:11px;" for="pref-debrid-provider">Debrid Provider</label>
            <select id="pref-debrid-provider" class="field-select">
              <option value="realdebrid" ${(prefs.debridProvider || 'realdebrid') === 'realdebrid' ? 'selected' : ''}>Real-Debrid</option>
              <option value="torbox" ${prefs.debridProvider === 'torbox' ? 'selected' : ''}>TorBox</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;">
            <label class="dim" style="font-size:11px;" for="pref-debrid-key">Debrid API Key</label>
            <input id="pref-debrid-key" class="field-input" type="password" placeholder="Optional instant-cache token" value="${escapeHtml(prefs.debridApiKey || '')}" />
          </div>
        </div>
      </div>

      <button type="button" class="btn-white" id="save-settings-btn" style="width:100%;">Save &amp; Apply</button>
    </div>
  </div>`;
}

export function renderCategoriesSheet(activeGenre, { desktop = false } = {}) {
  if (desktop) {
    return `<div class="dk-popover-backdrop" data-close-modal="true">
      <div class="dk-genres-popover" role="dialog" aria-modal="true" aria-label="Genres" onclick="event.stopPropagation()">
        <div class="dk-popover-head">
          <span>Genres</span>
          <button type="button" class="icon-btn" data-close-modal="true" aria-label="Close" style="width:28px;height:28px;">
            ${svgIcon('close', 16)}
          </button>
        </div>
        <div class="dk-genres-grid">
          ${BROWSE_GENRES.map(
            (g) => `<button type="button" class="dk-genre-link ${
              activeGenre === g ? 'is-active' : ''
            }" data-pick-category="${escapeHtml(g)}">${escapeHtml(g)}</button>`
          ).join('')}
        </div>
      </div>
    </div>`;
  }

  return `<div class="android-cat-overlay" data-close-modal="true" role="dialog" aria-modal="true" aria-label="Categories">
    <div class="android-cat-scroll" onclick="event.stopPropagation()">
      ${BROWSE_GENRES.map(
        (g) => `<button type="button" class="android-cat-item ${
          activeGenre === g ? 'is-active' : ''
        }" data-pick-category="${escapeHtml(g)}">${escapeHtml(g)}</button>`
      ).join('')}
    </div>
    <button type="button" class="android-cat-close" data-close-modal="true" aria-label="Close Categories">
      ${svgIcon('close', 24)}
    </button>
  </div>`;
}

export function renderNotificationsSheet(items, { desktop = false } = {}) {
  const listHtml = (items || [])
    .slice(0, 6)
    .map(
      (item, idx) => `<button type="button" class="dk-notif-row" data-open-detail="${escapeHtml(getMediaKey(item))}">
        <span class="dk-notif-dot ${idx < 4 ? 'is-unread' : ''}"></span>
        <div class="top-search-thumb">
          <img src="${escapeHtml(item.backdrop || item.poster)}" alt="" referrerpolicy="no-referrer" />
        </div>
        <div style="flex:1;min-width:0;text-align:left;">
          <div style="font-size:13.5px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(
            item.title
          )}</div>
          <div class="dim" style="font-size:12px;margin-top:2px;">New Arrival • ${escapeHtml(item.year || 'HD')}</div>
        </div>
      </button>`
    )
    .join('');

  if (desktop) {
    return `<div class="dk-popover-backdrop is-clear" data-close-modal="true">
      <div class="dk-notif-popover" role="dialog" aria-modal="true" aria-label="Notifications" onclick="event.stopPropagation()">
        <div class="dk-notif-top-border"></div>
        <div class="dk-popover-head">
          <span>New on Suno Cinema</span>
          <button type="button" class="icon-btn" data-close-modal="true" aria-label="Close" style="width:28px;height:28px;">
            ${svgIcon('close', 16)}
          </button>
        </div>
        <div class="dk-notif-list">${listHtml}</div>
      </div>
    </div>`;
  }

  return `<div class="sheet-backdrop" data-close-modal="true">
    <div class="sheet-card" role="dialog" aria-modal="true" aria-label="Notifications">
      <div class="sheet-grab-bar" aria-hidden="true"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h2 style="font-size:18px;font-weight:700;">New on Suno Cinema</h2>
        <button type="button" class="icon-btn" data-close-modal="true" aria-label="Close">
          ${svgIcon('close', 20)}
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${listHtml}
      </div>
    </div>
  </div>`;
}

export function renderContinueMenuSheet(item) {
  if (!item) return '';
  const key = getMediaKey(item);
  return `<div class="sheet-backdrop" data-close-modal="true">
    <div class="sheet-card" role="dialog" aria-modal="true" aria-label="Continue Watching Options">
      <div class="sheet-grab-bar" aria-hidden="true"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h2 style="font-size:17px;font-weight:700;">${escapeHtml(item.title)}</h2>
        <button type="button" class="icon-btn" data-close-modal="true" aria-label="Close">
          ${svgIcon('close', 20)}
        </button>
      </div>
      <button type="button" class="btn-white" data-play-key="${escapeHtml(key)}">${svgIcon('play', 16)} Resume Watching</button>
      <button type="button" class="btn-dark" data-open-detail="${escapeHtml(key)}">${svgIcon('infoCircle', 16)} Episodes &amp; Info</button>
      <button type="button" class="btn-dark" data-remove-cw="${escapeHtml(key)}">${svgIcon('close', 16)} Remove from Continue Watching</button>
    </div>
  </div>`;
}

export function renderQuickLaunchSheet() {
  return `<div class="sheet-backdrop" data-close-modal="true">
    <div class="sheet-card" role="dialog" aria-modal="true" aria-label="Direct VidRift Stream Launcher">
      <div class="sheet-grab-bar" aria-hidden="true"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2 style="font-size:18px;font-weight:700;">Stream by ID or Stream URL</h2>
          <p class="dim" style="font-size:12px;margin-top:2px;">Paste a TMDB/AniList ID or authorized https:// .m3u8 / .mp4 stream URL</p>
        </div>
        <button type="button" class="icon-btn" data-close-modal="true" aria-label="Close">
          ${svgIcon('close', 20)}
        </button>
      </div>
      <form id="quick-launch-form" style="display:flex;flex-direction:column;gap:12px;">
        <input id="ql-input" class="field-input" placeholder="e.g. 438631, tv/1396/1/1, anilist/1535, or https://.../playlist.m3u8" required />
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <select id="ql-type" class="field-select">
            <option value="movie">Movie (TMDB)</option>
            <option value="tv">TV Series (TMDB)</option>
            <option value="anime">Anime (AniList)</option>
          </select>
          <input id="ql-title" class="field-input" placeholder="Title (optional)" />
        </div>
        <button type="submit" class="btn-white">${svgIcon('play', 16)} Launch Stream</button>
      </form>
    </div>
  </div>`;
}
