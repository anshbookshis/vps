import { APPEARANCE_THEMES } from '../utils/storage.js';
import { BROWSE_GENRES } from '../utils/client-api.js';
import { getMediaKey } from '../utils/storage.js';
import { svgIcon } from './icons.js';
import { escapeHtml } from './cards.js';

export function renderSettingsSheet({ appearance, prefs, shield, profile }) {
  const s = shield || { blockedCount: 0, navigationLock: true, strictFrameMode: false };
  return `<div class="sheet-backdrop" data-close-modal="true">
    <div class="sheet-card" role="dialog" aria-modal="true" aria-label="Suno Cinema Settings">
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
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
          <input type="checkbox" id="pref-navlock" ${s.navigationLock ? 'checked' : ''} />
          Lock page navigation during playback
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
          <input type="checkbox" id="pref-strict-sandbox" ${s.strictFrameMode ? 'checked' : ''} />
          Strict iframe sandbox (toggle ON if a stream forces popups; OFF for default VidRift)
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

      <button type="button" class="btn-white" id="save-settings-btn" style="width:100%;">Save &amp; Apply</button>
    </div>
  </div>`;
}

export function renderCategoriesSheet(activeGenre) {
  return `<div class="sheet-backdrop" data-close-modal="true">
    <div class="sheet-card" role="dialog" aria-modal="true" aria-label="Categories">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h2 style="font-size:18px;font-weight:700;">Categories</h2>
        <button type="button" class="icon-btn" data-close-modal="true" aria-label="Close">
          ${svgIcon('close', 20)}
        </button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${BROWSE_GENRES.map(
          (g) => `<button type="button" class="outline-chip ${
            activeGenre === g ? 'is-active' : ''
          }" data-pick-category="${escapeHtml(g)}">${escapeHtml(g)}</button>`
        ).join('')}
      </div>
    </div>
  </div>`;
}

export function renderNotificationsSheet(items) {
  return `<div class="sheet-backdrop" data-close-modal="true">
    <div class="sheet-card" role="dialog" aria-modal="true" aria-label="Notifications">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h2 style="font-size:18px;font-weight:700;">New on Suno Cinema</h2>
        <button type="button" class="icon-btn" data-close-modal="true" aria-label="Close">
          ${svgIcon('close', 20)}
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${(items || [])
          .slice(0, 5)
          .map(
            (item) => `<button type="button" class="top-search-row" style="padding:6px 0;" data-open-detail="${escapeHtml(
              getMediaKey(item)
            )}">
              <div class="top-search-thumb">
                <img src="${escapeHtml(item.backdrop || item.poster)}" alt="" referrerpolicy="no-referrer" />
              </div>
              <div style="flex:1;min-width:0;text-align:left;">
                <div style="font-size:14px;font-weight:600;">${escapeHtml(item.title)}</div>
                <div class="dim" style="font-size:12px;">New Addition • ${escapeHtml(item.year || 'HD')}</div>
              </div>
            </button>`
          )
          .join('')}
      </div>
    </div>
  </div>`;
}

export function renderContinueMenuSheet(item) {
  if (!item) return '';
  const key = getMediaKey(item);
  return `<div class="sheet-backdrop" data-close-modal="true">
    <div class="sheet-card" role="dialog" aria-modal="true" aria-label="Continue Watching Options">
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
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2 style="font-size:18px;font-weight:700;">Stream by TMDB / AniList ID</h2>
          <p class="dim" style="font-size:12px;margin-top:2px;">Paste any TMDB or AniList link/ID to launch on VidRift</p>
        </div>
        <button type="button" class="icon-btn" data-close-modal="true" aria-label="Close">
          ${svgIcon('close', 20)}
        </button>
      </div>
      <form id="quick-launch-form" style="display:flex;flex-direction:column;gap:12px;">
        <input id="ql-input" class="field-input" placeholder="e.g. 438631, tv/1396/1/1, anilist/1535/1" required />
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
