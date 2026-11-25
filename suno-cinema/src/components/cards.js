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

export function renderMediaCard(item, opts = {}) {
  const key = getMediaKey(item);
  const wide = Boolean(opts.wide);
  const variant = wide ? 'wide' : 'poster';
  const art = resolveArtUrl(item, variant);
  const progress = opts.progress;
  const pct =
    progress && progress.duration > 0
      ? Math.min(100, Math.max(3, Math.round((progress.currentTime / progress.duration) * 100)))
      : 0;
  const typeLabel = item.mediaType === 'tv' ? 'Series' : item.mediaType === 'anime' ? 'Anime' : 'Film';
  const subParts = [item.year, typeLabel, item.sonic?.texture || item.genres?.[0]].filter(Boolean);

  return `<article class="media-card ${wide ? 'is-wide' : ''}" data-key="${escapeHtml(key)}">
    <div class="media-art" data-open-detail="${escapeHtml(key)}">
      <img src="${escapeHtml(art)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
    item,
    variant
  )} />
      ${
        opts.badgeText
          ? `<span class="art-badge-top">${escapeHtml(opts.badgeText)}</span>`
          : item.sonicMatch
          ? `<span class="art-badge-top">${item.sonicMatch.score}% Match</span>`
          : ''
      }
      ${opts.rank ? `<span class="art-rank">#${opts.rank}</span>` : ''}
      <div class="art-play">
        <button type="button" class="art-play-circle" data-play-key="${escapeHtml(key)}" aria-label="Stream ${escapeHtml(
    item.title
  )}">
          ${svgIcon('play', 20)}
        </button>
      </div>
      ${
        pct > 0
          ? `<div class="card-progress-bar"><div class="card-progress-fill" style="width:${pct}%"></div></div>`
          : ''
      }
    </div>
    <button type="button" class="media-kebab" data-toggle-like="${escapeHtml(key)}" title="${
    opts.liked ? 'Remove from Liked Films' : 'Save to Liked Films'
  }" aria-label="Toggle Liked">
      ${svgIcon(opts.liked ? 'heartFill' : 'heart', 15)}
    </button>
    <div class="media-meta">
      <button type="button" class="media-title" data-open-detail="${escapeHtml(key)}">${escapeHtml(
    item.title
  )}</button>
      <div class="media-subtitle">${escapeHtml(subParts.join(' • '))}</div>
    </div>
  </article>`;
}

export function renderTop10Card(item, rank, opts = {}) {
  const key = getMediaKey(item);
  const art = resolveArtUrl(item, 'poster');
  const liked = Boolean(opts.liked);
  return `<article class="media-card top10-card" data-key="${escapeHtml(key)}">
    <div class="top10-inner">
      <span class="top10-num" aria-hidden="true">${rank}</span>
      <div class="media-art top10-art" data-open-detail="${escapeHtml(key)}">
        <img src="${escapeHtml(art)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
    item,
    'poster'
  )} />
        ${item.rating ? `<span class="art-badge-top">★ ${escapeHtml(item.rating)}</span>` : ''}
        <div class="art-play">
          <button type="button" class="art-play-circle" data-play-key="${escapeHtml(key)}" aria-label="Stream ${escapeHtml(
    item.title
  )}">
            ${svgIcon('play', 20)}
          </button>
        </div>
      </div>
      <button type="button" class="media-kebab" data-toggle-like="${escapeHtml(key)}" title="${
    liked ? 'Remove from My List' : 'Save to My List'
  }" aria-label="Toggle Liked">
        ${svgIcon(liked ? 'heartFill' : 'heart', 15)}
      </button>
    </div>
    <div class="media-meta" style="padding-left:22px;">
      <button type="button" class="media-title" data-open-detail="${escapeHtml(key)}">${escapeHtml(
    item.title
  )}</button>
      <div class="media-subtitle">${escapeHtml(
        [item.year, item.mediaType === 'tv' ? 'Series' : item.mediaType === 'anime' ? 'Anime' : 'Film', item.genres?.[0]]
          .filter(Boolean)
          .join(' • ')
      )}</div>
    </div>
  </article>`;
}

export function renderShelf({ id, title, items, wide = false, ranked = false, top10 = false, progressMap = {}, likedIds = new Set(), moreRoute = '' }) {
  if (!items || items.length === 0) return '';
  return `<section class="shelf" data-shelf-id="${escapeHtml(id)}">
    <div class="shelf-head">
      <h2 class="shelf-title">${escapeHtml(title)}</h2>
      <div class="shelf-arrows">
        ${
          moreRoute
            ? `<button type="button" class="pill-button" style="height:32px;padding:0 14px;font-size:12px;" data-nav="${escapeHtml(
                moreRoute
              )}">More</button>`
            : ''
        }
        <button type="button" data-scroll-shelf="${escapeHtml(id)}" data-dir="-1" aria-label="Scroll left">
          ${svgIcon('chevronLeft', 18)}
        </button>
        <button type="button" data-scroll-shelf="${escapeHtml(id)}" data-dir="1" aria-label="Scroll right">
          ${svgIcon('chevronRight', 18)}
        </button>
      </div>
    </div>
    <div class="shelf-scroller ${top10 ? 'is-top10' : ''}" id="shelf-${escapeHtml(id)}">
      ${items
        .map((item, idx) => {
          const key = getMediaKey(item);
          if (top10) {
            return renderTop10Card(item, idx + 1, { liked: likedIds.has(key) });
          }
          return renderMediaCard(item, {
            wide,
            rank: ranked ? idx + 1 : 0,
            progress: progressMap[key],
            liked: likedIds.has(key),
          });
        })
        .join('')}
    </div>
  </section>`;
}

export function renderSongFilmRow(item, idx, { activeKey = '' } = {}) {
  const key = getMediaKey(item);
  const art = resolveArtUrl(item, 'poster');
  const score = item.sonicMatch?.score;
  return `<div class="song-row ${activeKey === key ? 'is-active' : ''}" data-play-key="${escapeHtml(key)}" role="button" tabindex="0">
    <span class="row-index">${idx + 1}</span>
    <div class="row-art">
      <img src="${escapeHtml(art)}" alt="" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
    item,
    'poster'
  )} />
    </div>
    <div class="row-main">
      <div class="row-title">${escapeHtml(item.title)} <span class="dim" style="font-weight:400;">(${escapeHtml(
    item.year || ''
  )})</span></div>
      <div class="row-sub">After: ${escapeHtml(item.sonic?.listenBefore || item.creator || 'Soundtrack Cue')}</div>
    </div>
    ${score ? `<span class="row-match-pill">${score}% Match</span>` : ''}
    <span class="row-dur">${escapeHtml(item.runtime || (item.mediaType === 'tv' ? 'Series' : 'Film'))}</span>
    <button type="button" class="icon-button" data-open-detail="${escapeHtml(key)}" title="Details & Sonic DNA" aria-label="Inspect ${escapeHtml(
    item.title
  )}" onclick="event.stopPropagation()">
      ${svgIcon('more', 16)}
    </button>
  </div>`;
}

export function renderMoodTiles(moods, activeMoodId) {
  return `<div class="mood-grid">
    ${moods
      .map(
        (m) => `<button type="button" class="mood-tile ${
          activeMoodId === m.id ? 'is-active' : ''
        }" data-select-mood="${escapeHtml(m.id)}" style="--mood:${escapeHtml(m.color)}">
          <span class="mood-bar"></span>
          <span class="mood-label">${escapeHtml(m.label)}</span>
        </button>`
      )
      .join('')}
  </div>`;
}
