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

export function computeMatchPercent(item) {
  const rating = Number(item?.rating || 0);
  if (rating > 0) {
    return Math.min(99, Math.max(82, Math.round(70 + rating * 3)));
  }
  const seed = String(item?.title || 'suno')
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return 88 + (seed % 11);
}

function renderTop10RankSvg(rank) {
  const wide = rank >= 10;
  const vbWidth = wide ? 142 : 96;
  const fontSize = wide ? 124 : 148;
  return `<svg class="dk-top10-svg" viewBox="0 0 ${vbWidth} 140" aria-hidden="true">
    <text
      x="50%"
      y="126"
      text-anchor="middle"
      font-family="Impact, 'Arial Black', 'Helvetica Neue', sans-serif"
      font-weight="900"
      font-size="${fontSize}"
      letter-spacing="-6"
      fill="#050507"
      stroke="currentColor"
      stroke-width="3.5"
    >${rank}</text>
  </svg>`;
}

export function renderSkeletonShelf({ count = 6, desktop = false } = {}) {
  const cards = Array.from({ length: count }, () =>
    desktop ? `<div class="dk-card sk-card"><div class="dk-card-media sk-shimmer"></div></div>` : `<div class="nf-card sk-card"><div class="nf-poster sk-shimmer"></div></div>`
  ).join('');
  return `<section class="nf-shelf ${desktop ? 'is-dk-shelf' : ''}" aria-hidden="true">
    <div class="nf-shelf-head"><div class="sk-title sk-shimmer"></div></div>
    <div class="nf-row">${cards}</div>
  </section>`;
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

/**
 * Desktop 16:9 landscape card with Netflix 2026 hover-expansion mini preview (Screenshot 5).
 */
export function renderDesktopWideCard(
  item,
  { top10 = false, recentlyAdded = false, splitBadge = false, progress = null, inMyList = false, isLiked = false } = {}
) {
  const key = getMediaKey(item);
  const art = resolveArtUrl(item, 'wide');
  const typeLabel = item.mediaType === 'tv' ? 'Show' : item.mediaType === 'anime' ? 'Anime' : 'Movie';
  const pct =
    progress && progress.duration > 0
      ? Math.min(98, Math.max(5, Math.round((progress.currentTime / progress.duration) * 100)))
      : 0;
  const tags = [...(item.genres || []).slice(0, 3), item.year].filter(Boolean);
  const matchPct = computeMatchPercent(item);
  const showSplit = splitBadge || Boolean(progress?.badge);

  return `<article class="dk-card" data-open-detail="${escapeHtml(key)}">
    <div class="dk-card-media">
      <img src="${escapeHtml(art)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
    item,
    'wide'
  )} />
      <div class="dk-card-scrim"></div>
      ${top10 ? `<span class="nf-top10-tag">TOP<br/>10</span>` : ''}
      ${
        showSplit
          ? `<div class="dk-badge-split"><span class="is-red">New Episode</span><span class="is-white">Watch Now</span></div>`
          : recentlyAdded
          ? `<span class="nf-recent-tag">Recently Added</span>`
          : ''
      }
      <div class="dk-card-title-overlay">${escapeHtml(item.title)}</div>
    </div>

    ${
      pct > 0
        ? `<div class="dk-progress-bar"><div class="dk-progress-fill" style="width:${pct}%"></div></div>`
        : ''
    }

    <div class="dk-hover-panel" onclick="event.stopPropagation()">
      <div class="dk-hover-media" data-open-detail="${escapeHtml(key)}">
        <img src="${escapeHtml(art)}" alt="" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
    item,
    'wide'
  )} />
        <div class="dk-hover-title">${escapeHtml(item.title)}</div>
      </div>
      <div class="dk-hover-body">
        <div class="dk-hover-actions">
          <button type="button" class="dk-circle-play" data-play-key="${escapeHtml(key)}" aria-label="Play ${escapeHtml(
    item.title
  )}">
            ${svgIcon('play', 15)}
          </button>
          <button type="button" class="dk-circle-btn ${inMyList ? 'is-on' : ''}" data-toggle-mylist="${escapeHtml(
    key
  )}" title="${inMyList ? 'Remove from My List' : 'Add to My List'}" aria-label="Toggle My List">
            ${svgIcon(inMyList ? 'check' : 'plus', 15)}
          </button>
          <button type="button" class="dk-circle-btn ${isLiked ? 'is-on' : ''}" data-toggle-like="${escapeHtml(
    key
  )}" title="${isLiked ? 'Liked' : 'I like this'}" aria-label="Toggle Like">
            ${svgIcon('thumbsUp', 14)}
          </button>
          <button type="button" class="dk-circle-btn dk-more-circle" data-open-detail="${escapeHtml(
            key
          )}" title="Episodes & Info" aria-label="More Info">
            ${svgIcon('chevronDown', 15)}
          </button>
        </div>
        <div class="dk-hover-meta">
          <span class="dk-match-score">${matchPct}% Match</span>
          <span class="age-pill">U/A 16+</span>
          <span>${escapeHtml(item.runtime || (item.mediaType === 'tv' ? 'Series' : typeLabel))}</span>
          <span class="hd-pill">HD</span>
        </div>
        <div class="dk-hover-tags">${escapeHtml(tags.join(' • '))}</div>
      </div>
    </div>
  </article>`;
}

/**
 * Desktop Top 10 Card: cross-platform SVG hollow numeral (1..10) alongside a crisp 2:3 portrait poster (Screenshot 1).
 */
export function renderDesktopTop10Card(item, rank, { recentlyAdded = true } = {}) {
  const key = getMediaKey(item);
  const art = resolveArtUrl(item, 'poster');
  return `<article class="dk-top10-card ${rank >= 10 ? 'is-two-digit' : ''}" data-open-detail="${escapeHtml(key)}">
    <span class="dk-top10-num" aria-hidden="true">${renderTop10RankSvg(rank)}</span>
    <div class="dk-top10-poster">
      <img src="${escapeHtml(art)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
    item,
    'poster'
  )} />
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

export function renderShelf({
  id,
  title,
  items,
  kind = 'poster',
  seeAllAttr = '',
  top10Indices = new Set(),
  recentIndices = new Set(),
  splitIndices = new Set(),
  myListSet = new Set(),
  likedSet = new Set(),
  progressMap = {},
}) {
  if (!items || items.length === 0) return '';
  const isDesktopShelf = kind === 'dk-wide' || kind === 'dk-top10';
  const pageDots = isDesktopShelf ? Math.max(1, Math.min(4, Math.ceil(items.length / 5))) : 0;

  const rowHtml = `<div class="nf-row ${kind === 'dk-top10' ? 'is-dk-top10' : ''}" id="row-${escapeHtml(id)}" data-shelf-row="${escapeHtml(id)}">
      ${items
        .map((entry, idx) => {
          if (kind === 'continue') return renderContinueWatchingCard(entry);
          if (kind === 'liked') return renderLikedShareCard(entry);
          if (kind === 'dk-top10') return renderDesktopTop10Card(entry, idx + 1, { recentlyAdded: recentIndices.has(idx) });
          if (kind === 'dk-wide') {
            const item = entry.item || entry;
            const k = getMediaKey(item);
            return renderDesktopWideCard(item, {
              top10: top10Indices.has(idx),
              recentlyAdded: recentIndices.has(idx),
              splitBadge: splitIndices.has(idx),
              progress: entry.item ? entry : progressMap[k],
              inMyList: myListSet.has(k),
              isLiked: likedSet.has(k),
            });
          }
          return renderPosterCard(entry, {
            top10: top10Indices.has(idx),
            recentlyAdded: recentIndices.has(idx),
          });
        })
        .join('')}
    </div>`;

  return `<section class="nf-shelf ${isDesktopShelf ? 'is-dk-shelf' : ''}" data-shelf-id="${escapeHtml(id)}">
    <div class="nf-shelf-head">
      <h2 class="nf-shelf-title">${escapeHtml(title)}</h2>
      ${
        seeAllAttr
          ? `<button type="button" class="nf-see-all" ${seeAllAttr}>Explore All ${svgIcon('chevronRight', 16)}</button>`
          : isDesktopShelf
          ? `<div class="dk-shelf-tools">
              ${
                pageDots > 1
                  ? `<div class="dk-row-indicators" id="ind-${escapeHtml(id)}" aria-hidden="true">
                      ${Array.from({ length: pageDots }, (_, i) => `<span class="dk-row-dash ${i === 0 ? 'is-active' : ''}"></span>`).join('')}
                    </div>`
                  : ''
              }
              <div class="dk-shelf-arrows">
                <button type="button" class="dk-arrow-btn" data-scroll-row="${escapeHtml(id)}" data-dir="-1" aria-label="Scroll left">
                  ${svgIcon('chevronLeft', 16)}
                </button>
                <button type="button" class="dk-arrow-btn" data-scroll-row="${escapeHtml(id)}" data-dir="1" aria-label="Scroll right">
                  ${svgIcon('chevronRight', 16)}
                </button>
              </div>
            </div>`
          : ''
      }
    </div>
    ${
      isDesktopShelf
        ? `<div class="dk-carousel-wrap">
            <button type="button" class="dk-row-handle is-prev" data-scroll-row="${escapeHtml(id)}" data-dir="-1" aria-label="Scroll row left">
              ${svgIcon('chevronLeft', 26)}
            </button>
            ${rowHtml}
            <button type="button" class="dk-row-handle is-next" data-scroll-row="${escapeHtml(id)}" data-dir="1" aria-label="Scroll row right">
              ${svgIcon('chevronRight', 26)}
            </button>
          </div>`
        : rowHtml
    }
  </section>`;
}
