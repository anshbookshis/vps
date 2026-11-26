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
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <span style="font-size:13px;font-weight:700;">Pro HLS Edge Proxy, Addon &amp; Debrid</span>
          <button type="button" class="outline-chip" data-open-sources="addons" style="height:26px;padding:0 10px;font-size:11px;">
            ${svgIcon('sparkles', 12)} Sources &amp; Addons Hub
          </button>
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

function normalizeAddonCardList(addons, prefs) {
  if (Array.isArray(addons)) return addons;
  if (Array.isArray(prefs?.stremioAddons) && prefs.stremioAddons.length > 0) {
    return prefs.stremioAddons;
  }
  const legacyUrl = String(prefs?.stremioAddonUrl || '').trim();
  if (!legacyUrl) return [];
  return [
    {
      url: legacyUrl,
      name: legacyUrl.replace(/^https?:\/\//i, '').split('/')[0] || 'Stremio Addon',
      version: '',
      description: '',
      types: ['movie', 'series'],
      idPrefixes: ['tt'],
      enabled: true,
    },
  ];
}

export function renderStreamSourcesModal({
  activeTab = 'addons',
  prefs = {},
  addons = null,
  addonInput = '',
  addonLoading = false,
  addonError = '',
  proxyTest = null,
  magnetInput = '',
  magnetTitle = '',
  directInput = '',
  directTitle = '',
  directType = 'movie',
  customResolverInput = null,
  hlsProxyInput = null,
  debridKeyInput = null,
  debridProviderInput = null,
  playerOpen = false,
  sourcesDirtyInPlayer = false,
} = {}) {
  const safeTab = ['addons', 'debrid', 'proxy', 'direct'].includes(activeTab) ? activeTab : 'addons';
  const addonList = normalizeAddonCardList(addons, prefs);
  const enabledAddons = addonList.filter((a) => a && a.enabled !== false);
  const currentProxyVal = hlsProxyInput !== null ? hlsProxyInput : prefs?.hlsProxyUrl || '';
  const currentCustomVal = customResolverInput !== null ? customResolverInput : prefs?.customResolverUrl || '';
  const currentDebridProvider = debridProviderInput || prefs?.debridProvider || 'realdebrid';
  const currentDebridKey = debridKeyInput !== null ? debridKeyInput : prefs?.debridApiKey || '';

  const tabs = [
    { id: 'addons', label: 'Stremio Addons', count: enabledAddons.length },
    { id: 'debrid', label: 'Debrid & Magnet', activeDot: Boolean(currentDebridKey) },
    { id: 'proxy', label: 'Edge Proxy & Resolver', activeDot: Boolean(currentProxyVal || currentCustomVal) },
    { id: 'direct', label: 'Direct Stream' },
  ];

  let panelHtml = '';

  if (safeTab === 'addons') {
    panelHtml = `<div class="sources-panel" role="tabpanel" aria-label="Stremio Addons">
      <div class="sources-intro">
        Paste any Stremio addon manifest URL (<code>https://.../manifest.json</code> or <code>stremio://...</code>). Enabled addons are queried in parallel for 4K/1080p HLS &amp; Debrid streams.
      </div>
      <form id="sources-add-addon-form" class="sources-form">
        <div class="sources-input-row">
          <input
            id="sources-addon-url-input"
            class="field-input"
            type="text"
            placeholder="https://your-addon.example.com/manifest.json or stremio://..."
            value="${escapeHtml(addonInput)}"
            autocomplete="off"
          />
          <button type="submit" class="btn-white sources-submit-sm" id="sources-add-addon-btn" ${
            addonLoading ? 'disabled' : ''
          }>
            ${addonLoading ? 'Inspecting...' : 'Add Addon'}
          </button>
        </div>
      </form>
      ${addonError ? `<div class="sources-alert is-error" role="alert">${escapeHtml(addonError)}</div>` : ''}

      ${
        addonList.length > 0
          ? `<div class="sources-addon-list">
              ${addonList
                .map((addon) => {
                  const enabled = addon.enabled !== false;
                  const types = Array.isArray(addon.types) ? addon.types : [];
                  const prefixes = Array.isArray(addon.idPrefixes) ? addon.idPrefixes : [];
                  return `<article class="sources-addon-card ${enabled ? '' : 'is-disabled'}">
                    <div class="sources-addon-top">
                      <div class="sources-addon-title-wrap">
                        <strong class="sources-addon-name">${escapeHtml(addon.name || 'Stremio Addon')}</strong>
                        ${
                          addon.version
                            ? `<span class="sources-badge is-version">v${escapeHtml(addon.version)}</span>`
                            : ''
                        }
                        <span class="sources-badge ${enabled ? 'is-ok' : 'is-muted'}">${
                    enabled ? 'Active' : 'Disabled'
                  }</span>
                      </div>
                      <div class="sources-addon-actions">
                        <button
                          type="button"
                          class="outline-chip sources-chip-xs ${enabled ? 'is-active' : ''}"
                          data-toggle-addon="${escapeHtml(addon.url)}"
                          aria-pressed="${enabled ? 'true' : 'false'}"
                        >
                          ${enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          class="outline-chip sources-chip-xs is-danger"
                          data-remove-addon="${escapeHtml(addon.url)}"
                          aria-label="Remove ${escapeHtml(addon.name || addon.url)}"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div class="sources-addon-url">${escapeHtml(addon.url)}</div>
                    ${
                      addon.description
                        ? `<p class="sources-addon-desc">${escapeHtml(addon.description)}</p>`
                        : ''
                    }
                    ${
                      types.length > 0 || prefixes.length > 0
                        ? `<div class="sources-addon-badges">
                            ${types
                              .slice(0, 6)
                              .map((t) => `<span class="sources-badge is-type">${escapeHtml(t)}</span>`)
                              .join('')}
                            ${prefixes
                              .slice(0, 4)
                              .map((p) => `<span class="sources-badge is-subtle">${escapeHtml(p)}</span>`)
                              .join('')}
                          </div>`
                        : ''
                    }
                  </article>`;
                })
                .join('')}
            </div>`
          : `<div class="sources-empty-box">
              <strong>No Stremio addons connected yet</strong>
              <p class="dim">Add a Stremio stream addon manifest URL above to unlock direct HTTP/HLS or Debrid-cached streams across movies &amp; series. Public-domain films also auto-resolve via Archive.org when available.</p>
            </div>`
      }
    </div>`;
  } else if (safeTab === 'debrid') {
    panelHtml = `<div class="sources-panel" role="tabpanel" aria-label="Debrid and Magnet">
      <form id="sources-debrid-form" class="sources-card">
        <div class="sources-card-head">
          <strong>Instant-Cache Debrid Key</strong>
          <span class="sources-badge ${currentDebridKey ? 'is-ok' : 'is-muted'}">${
      currentDebridKey ? 'Configured' : 'Optional'
    }</span>
        </div>
        <p class="dim sources-card-sub">
          Pair Real-Debrid or TorBox with Stremio torrent addons to convert top 4K/1080p cached torrents into instant direct streams (requires local Node server or Cloudflare Edge Proxy).
        </p>
        <div class="sources-grid-2">
          <div class="sources-field">
            <label class="dim" for="sources-debrid-provider">Provider</label>
            <select id="sources-debrid-provider" class="field-select">
              <option value="realdebrid" ${currentDebridProvider === 'realdebrid' ? 'selected' : ''}>Real-Debrid</option>
              <option value="torbox" ${currentDebridProvider === 'torbox' ? 'selected' : ''}>TorBox</option>
            </select>
          </div>
          <div class="sources-field">
            <label class="dim" for="sources-debrid-key">API Token</label>
            <input
              id="sources-debrid-key"
              class="field-input"
              type="password"
              placeholder="Paste Real-Debrid or TorBox token"
              value="${escapeHtml(currentDebridKey)}"
              autocomplete="off"
            />
          </div>
        </div>
        <button type="submit" class="btn-white" id="sources-save-debrid-btn">Save Debrid Credentials</button>
      </form>

      <form id="sources-magnet-form" class="sources-card">
        <div class="sources-card-head">
          <strong>Magnet / InfoHash Direct Launcher</strong>
          <span class="sources-badge is-type">Torrent → Stream</span>
        </div>
        ${
          !currentDebridKey
            ? `<div class="sources-alert is-warn">Save a Real-Debrid or TorBox API key above (with Node server or Edge Proxy) before launching magnet links.</div>`
            : ''
        }
        <div class="sources-field">
          <label class="dim" for="sources-magnet-input">Magnet URI or 40-char InfoHash</label>
          <input
            id="sources-magnet-input"
            class="field-input"
            type="text"
            placeholder="magnet:?xt=urn:btih:... or 40-char SHA-1 infoHash"
            value="${escapeHtml(magnetInput)}"
            autocomplete="off"
            required
          />
        </div>
        <div class="sources-field">
          <label class="dim" for="sources-magnet-title">Title (optional)</label>
          <input
            id="sources-magnet-title"
            class="field-input"
            type="text"
            placeholder="e.g. Open Cinema Feature"
            value="${escapeHtml(magnetTitle)}"
          />
        </div>
        <button type="submit" class="btn-dark" id="sources-launch-magnet-btn">
          ${svgIcon('play', 16)} Resolve &amp; Play Magnet
        </button>
      </form>
    </div>`;
  } else if (safeTab === 'proxy') {
    const pTest = proxyTest || { status: 'idle', message: '' };
    panelHtml = `<div class="sources-panel" role="tabpanel" aria-label="Edge Proxy and Custom Resolver">
      <form id="sources-proxy-form" class="sources-card">
        <div class="sources-card-head">
          <strong>HLS Edge Proxy &amp; Custom Resolver</strong>
          <span class="sources-badge ${currentProxyVal ? 'is-ok' : 'is-muted'}">${
      currentProxyVal ? 'Proxy Set' : 'Same-Origin / Direct'
    }</span>
        </div>
        <div class="sources-field">
          <label class="dim" for="sources-hls-proxy-input">HLS Edge Proxy Base URL (Cloudflare Worker or Node server)</label>
          <div class="sources-input-row">
            <input
              id="sources-hls-proxy-input"
              class="field-input"
              type="url"
              placeholder="https://your-proxy.workers.dev or http://localhost:3000"
              value="${escapeHtml(currentProxyVal)}"
              autocomplete="off"
            />
            <button type="button" class="btn-dark sources-submit-sm" id="sources-test-proxy-btn" ${
              pTest.status === 'testing' ? 'disabled' : ''
            }>
              ${pTest.status === 'testing' ? 'Testing...' : 'Test Proxy'}
            </button>
          </div>
        </div>
        ${
          pTest.status && pTest.status !== 'idle'
            ? `<div id="sources-proxy-test-result" class="sources-proxy-status is-${escapeHtml(pTest.status)}">
                ${escapeHtml(pTest.message || '')}
              </div>`
            : `<div id="sources-proxy-test-result" class="sources-proxy-status is-idle">
                Click <strong>Test Proxy</strong> to ping <code>/api/health</code> and verify CORS, Range forwarding &amp; addon resolution.
              </div>`
        }

        <div class="sources-field">
          <label class="dim" for="sources-custom-resolver-input">Custom Resolver / Jellyfin / Emby URL Template (optional)</label>
          <input
            id="sources-custom-resolver-input"
            class="field-input"
            type="url"
            placeholder="https://media.example.com/resolve?imdb={imdbId}&amp;tmdb={tmdbId}&amp;type={mediaType}&amp;s={season}&amp;e={episode}"
            value="${escapeHtml(currentCustomVal)}"
            autocomplete="off"
          />
          <div class="sources-token-row">
            <span class="sources-badge is-subtle">{imdbId}</span>
            <span class="sources-badge is-subtle">{tmdbId}</span>
            <span class="sources-badge is-subtle">{mediaType}</span>
            <span class="sources-badge is-subtle">{season}</span>
            <span class="sources-badge is-subtle">{episode}</span>
          </div>
        </div>

        <button type="submit" class="btn-white" id="sources-save-proxy-btn">Save Edge Proxy &amp; Resolver</button>
      </form>

      <div class="sources-tip-box">
        <strong>Cloudflare Worker Tip (Static GitHub Pages)</strong>
        <p class="dim">
          Deploy <code>cloudflare-hls-proxy.js</code> from the Suno Cinema repository to Cloudflare Workers (free tier) and paste its <code>https://*.workers.dev</code> URL above. It unlocks CORS manifest/segment proxying, Referer forwarding, SRT→VTT subtitle conversion, Stremio addon inspection, and batch Debrid resolution from any static site.
        </p>
      </div>
    </div>`;
  } else {
    panelHtml = `<div class="sources-panel" role="tabpanel" aria-label="Direct Stream">
      <form id="sources-direct-form" class="sources-card">
        <div class="sources-card-head">
          <strong>Direct HLS (.m3u8) / MP4 / ID Launcher</strong>
          <span class="sources-badge is-type">Zero Ads</span>
        </div>
        <p class="dim sources-card-sub">
          Launch any authorized <code>https://</code> HLS playlist (<code>.m3u8</code>), <code>.mp4</code> stream, or TMDB / AniList ID directly in Suno Cinema's player.
        </p>
        <div class="sources-field">
          <label class="dim" for="sources-direct-input">Stream URL or TMDB / AniList ID</label>
          <input
            id="sources-direct-input"
            class="field-input"
            type="text"
            placeholder="https://.../master.m3u8, https://.../video.mp4, or 27205"
            value="${escapeHtml(directInput)}"
            required
          />
        </div>
        <div class="sources-grid-2">
          <div class="sources-field">
            <label class="dim" for="sources-direct-type">Media Type (for IDs)</label>
            <select id="sources-direct-type" class="field-select">
              <option value="movie" ${directType === 'movie' ? 'selected' : ''}>Movie (TMDB)</option>
              <option value="tv" ${directType === 'tv' ? 'selected' : ''}>TV Series (TMDB)</option>
              <option value="anime" ${directType === 'anime' ? 'selected' : ''}>Anime (AniList)</option>
            </select>
          </div>
          <div class="sources-field">
            <label class="dim" for="sources-direct-title">Title (optional)</label>
            <input
              id="sources-direct-title"
              class="field-input"
              type="text"
              placeholder="Custom display title"
              value="${escapeHtml(directTitle)}"
            />
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button type="button" class="outline-chip sources-chip-xs" data-fill-direct="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" data-fill-title="Big Buck Bunny (Mux 1080p)">
            Test Mux 1080p HLS
          </button>
          <button type="button" class="outline-chip sources-chip-xs" data-fill-direct="https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8" data-fill-title="Tears of Steel (Akamai HLS)">
            Test Akamai HLS
          </button>
        </div>
        <button type="submit" class="btn-white" id="sources-launch-direct-btn">
          ${svgIcon('play', 16)} Launch Direct Stream
        </button>
      </form>
    </div>`;
  }

  return `<div class="sheet-backdrop" data-close-modal="true">
    <div class="sheet-card sources-hub-card" role="dialog" aria-modal="true" aria-label="Stream Sources & Addons" onclick="event.stopPropagation()">
      <div class="sheet-grab-bar" aria-hidden="true"></div>
      <div class="sources-hub-header">
        <div>
          <h2 class="sources-hub-title">${svgIcon('sparkles', 18)} Stream Sources &amp; Addons</h2>
          <p class="dim sources-hub-sub">Connect Stremio addons, Debrid instant cache, Edge Proxy, or direct HLS streams for any title.</p>
        </div>
        <button type="button" class="icon-btn" data-close-modal="true" aria-label="Close">
          ${svgIcon('close', 20)}
        </button>
      </div>

      <div class="sources-status-strip">
        <span class="sources-status-pill ${enabledAddons.length > 0 ? 'is-on' : ''}">
          ${enabledAddons.length} Addon${enabledAddons.length === 1 ? '' : 's'} Active
        </span>
        <span class="sources-status-pill ${currentDebridKey ? 'is-on' : ''}">
          ${currentDebridKey ? (currentDebridProvider === 'torbox' ? 'TorBox Connected' : 'Real-Debrid Connected') : 'Debrid Not Set'}
        </span>
        <span class="sources-status-pill ${currentProxyVal ? 'is-on' : ''}">
          ${currentProxyVal ? 'Edge Proxy Ready' : 'Same-Origin / Direct'}
        </span>
      </div>

      <div class="sources-tabs" role="tablist" aria-label="Source Categories">
        ${tabs
          .map(
            (t) => `<button
              type="button"
              role="tab"
              aria-selected="${safeTab === t.id ? 'true' : 'false'}"
              class="sources-tab-btn ${safeTab === t.id ? 'is-active' : ''}"
              data-sources-tab="${t.id}"
            >
              <span>${escapeHtml(t.label)}</span>
              ${
                typeof t.count === 'number' && t.count > 0
                  ? `<span class="sources-tab-badge">${t.count}</span>`
                  : t.activeDot
                  ? `<span class="sources-tab-dot" aria-hidden="true"></span>`
                  : ''
              }
            </button>`
          )
          .join('')}
      </div>

      ${panelHtml}

      ${
        playerOpen && sourcesDirtyInPlayer
          ? `<div class="sources-reload-bar">
              <span class="dim" style="font-size:12px;">Source settings updated — re-resolve active title?</span>
              <button type="button" class="btn-white sources-submit-sm" id="sources-reload-player-btn">
                ${svgIcon('refresh', 14)} Reload Active Stream
              </button>
            </div>`
          : ''
      }
    </div>
  </div>`;
}
