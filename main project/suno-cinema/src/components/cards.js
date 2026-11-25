import { buildCinemaFallbackArt } from '../utils/poster-art.js';
import { getMediaKey } from '../utils/storage.js';
import { svgIcon } from './icons.js';

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function resolveArtUrl(item, variant = 'poster') {
  const remote = variant === 'wide' ? item?.backdrop || item?.poster : item?.poster || item?.backdrop;
  if (remote && typeof remote === 'string' && remote.startsWith('https://')) {
    return remote;
  }
  return buildCinemaFallbackArt(item, variant);
}

export function attachFallbackImgAttr(item, variant = 'poster') {
  const fallback = buildCinemaFallbackArt(item, variant);
  return `onerror="this.onerror=null;this.src='${fallback.replace(/'/g, '%27')}'"`;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function renderPosterCard(item, { top10 = false, recentlyAdded = false } = {}) {
  const key = getMediaKey(item);
  const art = resolveArtUrl(item, 'poster');
  return `<article class="nf-card" data-open-detail="${escapeHtml(key)}">
    <div class="nf-poster">
      <img src="${escapeHtml(art)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
    item,
    'poster'
  )} />
      ${top10 ? `<span class="nf-top10-tag">TOP<br/>10</span>` : ''}
      ${recentlyAdded ? `<span class="nf-recent-tag">Recently Added</span>` : ''}
    </div>
  </article>`;
}

export function renderContinueWatchingCard(entry) {
  const item = entry.item;
  if (!item) return '';
  const key = getMediaKey(item);
  const art = resolveArtUrl(item, 'poster');
  const pct =
    entry.duration > 0
      ? Math.min(98, Math.max(6, Math.round((entry.currentTime / entry.duration) * 100)))
      : 28;

  return `<article class="cw-card">
    <div class="cw-poster-wrap" data-play-key="${escapeHtml(key)}">
      <img src="${escapeHtml(art)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
    item,
    'poster'
  )} />
      <span class="cw-center-play">${svgIcon('play', 20)}</span>
      ${entry.badge ? `<span class="cw-watch-badge">${escapeHtml(entry.badge)}</span>` : ''}
      <div class="cw-progress-track">
        <div class="cw-progress-fill" style="width:${pct}%"></div>
      </div>
    </div>
    <div class="cw-footer">
      <button type="button" class="cw-footer-btn" data-open-detail="${escapeHtml(key)}" aria-label="Details">
        ${svgIcon('infoCircle', 19)}
      </button>
      <span class="cw-divider"></span>
      <button type="button" class="cw-footer-btn" data-cw-menu="${escapeHtml(key)}" aria-label="More options">
        ${svgIcon('moreVert', 18)}
      </button>
    </div>
  </article>`;
}

export function renderLikedShareCard(item) {
  const key = getMediaKey(item);
  const art = resolveArtUrl(item, 'poster');
  return `<article class="liked-card">
    <div class="nf-poster" data-open-detail="${escapeHtml(key)}">
      <img src="${escapeHtml(art)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
    item,
    'poster'
  )} />
    </div>
    <button type="button" class="liked-share-btn" data-share-key="${escapeHtml(key)}">
      ${svgIcon('share', 14)} Share
    </button>
  </article>`;
}

export function renderShelf({ id, title, items, kind = 'poster', seeAllAttr = '', top10Indices = new Set(), recentIndices = new Set() }) {
  if (!items || items.length === 0) return '';
  return `<section class="nf-shelf" data-shelf-id="${escapeHtml(id)}">
    <div class="nf-shelf-head">
      <h2 class="nf-shelf-title">${escapeHtml(title)}</h2>
      ${
        seeAllAttr
          ? `<button type="button" class="nf-see-all" ${seeAllAttr}>See All ${svgIcon('chevronRight', 16)}</button>`
          : ''
      }
    </div>
    <div class="nf-row">
      ${items
        .map((entry, idx) => {
          if (kind === 'continue') return renderContinueWatchingCard(entry);
          if (kind === 'liked') return renderLikedShareCard(entry);
          return renderPosterCard(entry, {
            top10: top10Indices.has(idx),
            recentlyAdded: recentIndices.has(idx),
          });
        })
        .join('')}
    </div>
  </section>`;
}
