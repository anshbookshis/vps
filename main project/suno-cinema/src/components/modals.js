import { APPEARANCE_THEMES } from '../utils/storage.js';
import { svgIcon } from './icons.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderSettingsModal({ appearance, prefs, shield }) {
  const shieldState = shield || { blockedCount: 0, navigationLock: true, strictFrameMode: false, recentEvents: [] };
  return `<div class="dialog-backdrop" data-close-modal="true">
    <div class="dialog-card" role="dialog" aria-modal="true" aria-label="Appearance and VidRift Settings">
      <div class="dialog-head">
        <div>
          <h2 style="font-size:18px;font-weight:700;">Suno Cinema Settings</h2>
          <p class="dim" style="font-size:12px;margin-top:2px;">Synced appearance presets + VidRift player parameters</p>
        </div>
        <button type="button" class="icon-button" data-close-modal="true" aria-label="Close">
          ${svgIcon('close', 20)}
        </button>
      </div>

      <div class="field-group">
        <span class="field-label">Suno Theme Accent (also syncs VidRift brandColor)</span>
        <div class="theme-grid">
          ${APPEARANCE_THEMES.map(
            (t) => `<button type="button" class="theme-card ${
              appearance.theme === t.id ? 'is-active' : ''
            }" data-pick-theme="${t.id}">
              <div class="theme-dots">
                ${t.colors.map((c) => `<span class="theme-dot" style="background:${c}"></span>`).join('')}
              </div>
              <div style="font-size:13px;font-weight:600;">${escapeHtml(t.name)}</div>
              <div class="dim" style="font-size:11px;line-height:1.3;">${escapeHtml(t.description)}</div>
            </button>`
          ).join('')}
        </div>
      </div>

      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
          <input type="checkbox" id="pref-amoled" ${appearance.amoled ? 'checked' : ''} />
          AMOLED Pure Black (#000)
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
          <input type="checkbox" id="pref-autoplay" ${prefs.autoplay ? 'checked' : ''} />
          Autoplay VidRift stream
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
          <input type="checkbox" id="pref-dub" ${prefs.dub ? 'checked' : ''} />
          Prefer English Dub for Anime (?dub=1)
        </label>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field-group">
          <label class="field-label" for="pref-sub">Default Subtitle Track (?sub)</label>
          <select id="pref-sub" class="field-select">
            <option value="en" ${prefs.sub === 'en' ? 'selected' : ''}>English (en)</option>
            <option value="auto" ${prefs.sub === 'auto' ? 'selected' : ''}>Player Default</option>
            <option value="es" ${prefs.sub === 'es' ? 'selected' : ''}>Spanish (es)</option>
            <option value="fr" ${prefs.sub === 'fr' ? 'selected' : ''}>French (fr)</option>
            <option value="ja" ${prefs.sub === 'ja' ? 'selected' : ''}>Japanese (ja)</option>
            <option value="ko" ${prefs.sub === 'ko' ? 'selected' : ''}>Korean (ko)</option>
            <option value="de" ${prefs.sub === 'de' ? 'selected' : ''}>German (de)</option>
          </select>
        </div>

        <div class="field-group">
          <label class="field-label" for="pref-uiscale">VidRift Control Scale (?uiScale)</label>
          <select id="pref-uiscale" class="field-select">
            <option value="0.85" ${Number(prefs.uiScale) === 0.85 ? 'selected' : ''}>Compact (0.85x)</option>
            <option value="1" ${Number(prefs.uiScale) === 1 ? 'selected' : ''}>Standard (1.0x)</option>
            <option value="1.25" ${Number(prefs.uiScale) === 1.25 ? 'selected' : ''}>Cinema (1.25x)</option>
            <option value="1.5" ${Number(prefs.uiScale) === 1.5 ? 'selected' : ''}>Living Room TV (1.5x)</option>
          </select>
        </div>
      </div>

      <div class="field-group">
        <label class="field-label" for="pref-tmdb-key">Optional TMDB API Key / Read Access Token (free Cinemeta + AniList catalogs are already active with zero key)</label>
        <input
          id="pref-tmdb-key"
          class="field-input"
          type="password"
          placeholder="Optional — movies & TV already browse/search via keyless Cinemeta + AniList"
          value="${escapeHtml(prefs.tmdbApiKey || '')}"
        />
      </div>

      <div class="season-ep-box" style="padding:12px;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;">
            ${svgIcon('shield', 16)} Anti-Redirect &amp; Zero-Ad Guard
          </span>
          <span class="row-match-pill">${shieldState.blockedCount} blocked</span>
        </div>
        <p class="dim" style="font-size:11px;line-height:1.45;">
          Suno Cinema carries zero ads and locks host <code>window.open</code>, opener links, and navigation hijacks during playback. Strict Frame Isolation adds an iframe sandbox (note: VidRift warns sandbox can break video playback on some streams, so keep OFF unless a server attempts popups).
        </p>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
            <input type="checkbox" id="pref-navlock" ${shieldState.navigationLock ? 'checked' : ''} />
            Navigation Hijack Guard
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
            <input type="checkbox" id="pref-strict-sandbox" ${shieldState.strictFrameMode ? 'checked' : ''} />
            Strict Frame Isolation (optional sandbox)
          </label>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="pill-button" data-close-modal="true">Close</button>
        <button type="button" class="primary-button" id="save-settings-btn">Save Preferences</button>
      </div>
    </div>
  </div>`;
}

export function renderQuickLaunchModal() {
  return `<div class="dialog-backdrop" data-close-modal="true">
    <div class="dialog-card" role="dialog" aria-modal="true" aria-label="Direct VidRift Stream Launcher">
      <div class="dialog-head">
        <div>
          <h2 style="font-size:18px;font-weight:700;">Direct VidRift Stream Launcher</h2>
          <p class="dim" style="font-size:12px;margin-top:2px;">Stream any TMDB Movie, TV Episode, or AniList Anime via embed.vidrift.net</p>
        </div>
        <button type="button" class="icon-button" data-close-modal="true" aria-label="Close">
          ${svgIcon('close', 20)}
        </button>
      </div>

      <form id="quick-launch-form" style="display:flex;flex-direction:column;gap:14px;">
        <div class="field-group">
          <label class="field-label" for="ql-input">TMDB URL, AniList URL, or Shorthand ID</label>
          <input
            id="ql-input"
            class="field-input"
            placeholder="e.g. 438631, tv/1396/1/1, anilist/1535/1, or https://www.themoviedb.org/movie/157336"
            required
          />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="field-group">
            <label class="field-label" for="ql-type">Fallback Type (if numeric ID)</label>
            <select id="ql-type" class="field-select">
              <option value="movie">Movie (TMDB)</option>
              <option value="tv">TV Series (TMDB)</option>
              <option value="anime">Anime (AniList)</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label" for="ql-title">Display Title (optional)</label>
            <input id="ql-title" class="field-input" placeholder="e.g. Dune" />
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button type="button" class="pill-button" data-close-modal="true">Cancel</button>
          <button type="submit" class="primary-button">${svgIcon('play', 16)} Launch Stream</button>
        </div>
      </form>
    </div>
  </div>`;
}
