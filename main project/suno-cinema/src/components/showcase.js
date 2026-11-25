import { getMediaKey } from '../utils/storage.js';
import { svgIcon } from './icons.js';
import { escapeHtml, resolveArtUrl, attachFallbackImgAttr, renderPosterCard } from './cards.js';

/**
 * Dynamic Portrait Billboard Hero Card matching Screenshot 5 with interactive spotlight switching.
 */
export function renderAndroidBillboard(items, activeIndex = 0, { myListSet = new Set() } = {}) {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  if (list.length === 0) return '';
  const safeIdx = ((activeIndex % list.length) + list.length) % list.length;
  const item = list[safeIdx];
  const key = getMediaKey(item);
  const inMyList = myListSet.has(key);
  const art = resolveArtUrl(item, 'poster');
  const typeWord = item.mediaType === 'tv' ? 'Series' : item.mediaType === 'anime' ? 'Anime' : 'Movie';
  const tags = [typeWord, ...(item.genres || []).slice(0, 2), item.year || item.country].filter(Boolean);

  return `<section class="billboard-wrap" aria-label="Featured">
    <div class="billboard-card">
      <img
        class="billboard-img"
        src="${escapeHtml(art)}"
        alt="${escapeHtml(item.title)}"
        referrerpolicy="no-referrer"
        ${attachFallbackImgAttr(item, 'poster')}
      />
      <div class="billboard-scrim"></div>
      ${
        list.length > 1
          ? `<div style="position:absolute;top:10px;right:10px;z-index:3;display:flex;align-items:center;gap:6px;background:rgba(0,0,0,0.58);padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,0.16);backdrop-filter:blur(8px);">
              <button type="button" data-hero-step="-1" aria-label="Previous spotlight" style="display:grid;place-items:center;width:22px;height:22px;color:#fff;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style="font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;">${safeIdx + 1}/${list.length}</span>
              <button type="button" data-hero-step="1" aria-label="Next spotlight" style="display:grid;place-items:center;width:22px;height:22px;color:#fff;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>`
          : ''
      }
      <div class="billboard-content" data-open-detail="${escapeHtml(key)}">
        ${
          item.logo
            ? `<img class="billboard-logo" src="${escapeHtml(item.logo)}" alt="${escapeHtml(
                item.title
              )}" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" />
               <div class="billboard-title" style="display:none;">${escapeHtml(item.title)}</div>`
            : `<div class="billboard-title">${escapeHtml(item.title)}</div>`
        }
        <div class="billboard-tags">${escapeHtml(tags.join(' • '))}</div>
        <div class="billboard-actions" onclick="event.stopPropagation()">
          <button type="button" class="btn-white" data-play-key="${escapeHtml(key)}">
            ${svgIcon('play', 17)} Play ${typeWord === 'Movie' ? 'Movie' : ''}
          </button>
          <button type="button" class="btn-dark" data-toggle-mylist="${escapeHtml(key)}">
            ${svgIcon(inMyList ? 'check' : 'plus', 17)} My List
          </button>
        </div>
      </div>
    </div>
  </section>`;
}

/**
 * Wide rounded Desktop Billboard matching Screenshots 3 & 4.
 */
export function renderDesktopBillboard(items, activeIndex = 0, { myListSet = new Set() } = {}) {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  if (list.length === 0) return '';
  const safeIdx = ((activeIndex % list.length) + list.length) % list.length;
  const item = list[safeIdx];
  const key = getMediaKey(item);
  const inMyList = myListSet.has(key);
  const art = resolveArtUrl(item, 'wide');
  const typeWord = item.mediaType === 'tv' ? 'Show' : item.mediaType === 'anime' ? 'Anime' : 'Movie';
  const metaParts = [
    typeWord,
    ...(item.genres || []).slice(0, 2),
    item.year,
    item.runtime,
    item.mediaType === 'anime' ? 'Sub / Dub' : 'U/A 16+',
  ].filter(Boolean);
  const castText =
    item.cast && item.cast.length > 0
      ? `${item.cast.slice(0, 3).join(', ')} star`
      : item.country
      ? `${item.country} • Popup-Free HD Stream`
      : 'No-Redirect Ad Shield • Free Stream';

  return `<section class="dk-hero-wrap" aria-label="Featured Spotlight">
    <div class="dk-hero-card" data-open-detail="${escapeHtml(key)}">
      <img
        class="dk-hero-img"
        src="${escapeHtml(art)}"
        alt="${escapeHtml(item.title)}"
        referrerpolicy="no-referrer"
        ${attachFallbackImgAttr(item, 'wide')}
      />
      <div class="dk-hero-scrim"></div>
      ${
        list.length > 1
          ? `<div class="billboard-spotlight-controls" style="top:18px;right:20px;" onclick="event.stopPropagation()">
              <button type="button" class="spotlight-step-btn" data-hero-step="-1" aria-label="Previous spotlight">${svgIcon('chevronLeft', 14)}</button>
              <span class="spotlight-counter">${safeIdx + 1}/${list.length}</span>
              <button type="button" class="spotlight-step-btn" data-hero-step="1" aria-label="Next spotlight">${svgIcon('chevronRight', 14)}</button>
            </div>`
          : ''
      }
      <div class="dk-hero-content">
        ${
          item.logo
            ? `<img class="dk-hero-logo" src="${escapeHtml(item.logo)}" alt="${escapeHtml(
                item.title
              )}" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" />
               <h1 class="dk-hero-title" style="display:none;">${escapeHtml(item.title)}</h1>`
            : `<h1 class="dk-hero-title">${escapeHtml(item.title)}</h1>`
        }
        <div class="dk-hero-meta">${escapeHtml(metaParts.join(' • '))}</div>
        <p class="dk-hero-desc">${escapeHtml(
          item.overview || item.tagline || 'Stream full HD movies, series & anime free on Suno Cinema.'
        )}</p>
        <div class="dk-hero-actions" onclick="event.stopPropagation()">
          <button type="button" class="dk-btn-play" data-play-key="${escapeHtml(key)}">
            ${svgIcon('play', 18)} Play
          </button>
          <button type="button" class="dk-btn-info" data-open-detail="${escapeHtml(key)}">
            More Info
          </button>
          <button type="button" class="dk-btn-circle" data-toggle-mylist="${escapeHtml(key)}" title="${
            inMyList ? 'In My List' : 'Add to My List'
          }" aria-label="Toggle My List">
            ${svgIcon(inMyList ? 'check' : 'plus', 18)}
          </button>
        </div>
      </div>
      <div class="dk-hero-cast-badge" title="${escapeHtml(castText)}">🎬 ${escapeHtml(castText)}</div>
    </div>
  </section>`;
}

/**
 * Clean 4-column Desktop Footer matching Screenshot 1 (adapted to Suno Cinema).
 */
export function renderDesktopFooter() {
  return `<footer class="dk-footer">
    <div class="dk-footer-socials">
      <button type="button" class="dk-footer-pill" data-open-discover="movie">Movies</button>
      <button type="button" class="dk-footer-pill" data-open-discover="tv">Shows</button>
      <button type="button" class="dk-footer-pill" data-open-discover="anime">Anime</button>
      <button type="button" class="dk-footer-pill" data-open-languages="true">Languages</button>
    </div>
    <div class="dk-footer-grid">
      <button type="button" data-open-languages="true">Audio &amp; Subtitles</button>
      <button type="button" data-open-discover="movie">Trending Movies</button>
      <button type="button" id="open-settings-btn">Ad-Free Shield</button>
      <button type="button" id="open-quicklaunch-btn">Quick Launch by ID</button>

      <button type="button" data-open-discover="tv">Top TV Shows</button>
      <button type="button" data-open-discover="anime">Anime &amp; OST</button>
      <button type="button" data-nav-tab="downloads">Smart Downloads</button>
      <button type="button" data-nav-tab="mysuno">My Suno Profile</button>

      <button type="button" id="open-categories-btn">Browse Genres</button>
      <button type="button" id="open-notifications-btn">What's New</button>
      <button type="button" data-nav-tab="clips">Trailers &amp; Clips</button>
      <button type="button" id="refresh-home-feed-btn">Refresh Live Feed</button>
    </div>
    <div class="dk-footer-copy">© 2026 Suno Cinema • A Suno Product • Powered by VidLink, VidRift, Cinemeta &amp; AniList</div>
  </footer>`;
}

/**
 * Full Title Detail Screen matching Screenshot 2 (16:9 trailer stage, Play, Download, Starring, +/Rate/Share).
 */
export function renderDetailView({
  item,
  inMyList = false,
  isLiked = false,
  isDownloaded = false,
  savedProgress = null,
  trailerMuted = true,
  trailerPlaying = false,
  detailTab = 'episodes',
  seasons = [],
  activeSeason = 1,
  activeEpisode = 1,
  relatedItems = [],
  dubEnabled = false,
}) {
  if (!item) return `<div style="padding:24px;" class="dim">Title not found.</div>`;
  const key = getMediaKey(item);
  const backdrop = resolveArtUrl(item, 'wide');
  const seasonObj =
    seasons.find((s) => s.seasonNumber === activeSeason) ||
    seasons[0] || { seasonNumber: 1, name: 'Season 1', episodeCount: item.totalEpisodes || 10 };
  const richEps = Array.isArray(seasonObj.episodes) && seasonObj.episodes.length ? seasonObj.episodes : null;
  const epCount = item.mediaType === 'anime' ? item.totalEpisodes || 12 : seasonObj.episodeCount || 10;

  return `<article class="detail-view">
    <div class="detail-preview-stage">
      <div class="detail-overlay-top">
        <button type="button" class="icon-btn" id="detail-back-btn" aria-label="Back" style="background:rgba(0,0,0,0.45);">
          ${svgIcon('back', 22)}
        </button>
        <button type="button" class="icon-btn" id="open-shield-settings-btn" aria-label="Cast & Shield" style="background:rgba(0,0,0,0.45);">
          ${svgIcon('cast', 20)}
        </button>
      </div>
      ${
        trailerPlaying && item.trailerId
          ? `<iframe
              src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(
                item.trailerId
              )}?autoplay=1&mute=${trailerMuted ? 1 : 0}&rel=0"
              title="${escapeHtml(item.title)} Trailer"
              allow="autoplay; encrypted-media; fullscreen"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>`
          : `<img src="${escapeHtml(backdrop)}" alt="${escapeHtml(item.title)}" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
              item,
              'wide'
            )} />`
      }
      ${
        item.trailerId
          ? `<button type="button" class="detail-mute-btn" id="detail-trailer-toggle" aria-label="Toggle trailer sound">
              ${svgIcon(trailerPlaying ? (trailerMuted ? 'volumeOff' : 'volumeOn') : 'trailer', 16)}
            </button>`
          : ''
      }
    </div>

    <div class="detail-body">
      <h1 class="detail-title">${escapeHtml(item.title)}</h1>
      <div class="detail-meta-row">
        ${item.year ? `<span>${escapeHtml(item.year)}</span>` : ''}
        <span class="age-pill">U/A 13+</span>
        ${item.runtime ? `<span>${escapeHtml(item.runtime)}</span>` : ''}
        <span class="hd-pill">HD</span>
        ${item.rating ? `<span>★ ${escapeHtml(item.rating)}</span>` : ''}
      </div>

      <div class="detail-stacked-btns">
        <button type="button" class="btn-white" data-play-key="${escapeHtml(key)}" style="width:100%;height:44px;">
          ${svgIcon('play', 18)} ${savedProgress?.currentTime > 15 ? 'Resume' : 'Play'}
        </button>
        <button type="button" class="btn-dark" data-toggle-download="${escapeHtml(key)}" style="width:100%;height:44px;">
          ${svgIcon(isDownloaded ? 'check' : 'download', 18)} ${isDownloaded ? 'Saved to Downloads' : 'Download'}
        </button>
      </div>

      <p style="font-size:13.5px;line-height:1.45;color:#e4e4e7;">${escapeHtml(
        item.overview || 'Stream seamlessly on Suno Cinema via VidRift.'
      )}</p>

      ${
        item.cast?.length
          ? `<p class="dim" style="font-size:12px;">Starring: ${escapeHtml(item.cast.slice(0, 4).join(', '))}</p>`
          : ''
      }
      ${
        item.creator
          ? `<p class="dim" style="font-size:12px;">${
              item.mediaType === 'tv' ? 'Creator' : item.mediaType === 'anime' ? 'Studio' : 'Director'
            }: ${escapeHtml(item.creator)}</p>`
          : ''
      }

      <div class="detail-action-icons">
        <button type="button" class="detail-icon-act ${inMyList ? 'is-active' : ''}" data-toggle-mylist="${escapeHtml(
    key
  )}">
          ${svgIcon(inMyList ? 'check' : 'plus', 22)}
          <span>My List</span>
        </button>
        <button type="button" class="detail-icon-act ${isLiked ? 'is-active' : ''}" data-toggle-like="${escapeHtml(
    key
  )}">
          ${svgIcon('thumbsUp', 21)}
          <span>${isLiked ? 'Liked' : 'Rate'}</span>
        </button>
        <button type="button" class="detail-icon-act" data-share-key="${escapeHtml(key)}">
          ${svgIcon('share', 21)}
          <span>Share</span>
        </button>
      </div>
    </div>

    <div class="detail-tabs-bar">
      ${
        item.mediaType !== 'movie'
          ? `<button type="button" class="detail-tab-btn ${
              detailTab === 'episodes' ? 'is-active' : ''
            }" data-detail-tab="episodes">Episodes</button>`
          : ''
      }
      <button type="button" class="detail-tab-btn ${
        detailTab === 'more' || item.mediaType === 'movie' ? 'is-active' : ''
      }" data-detail-tab="more">More Like This</button>
    </div>

    ${
      item.mediaType !== 'movie' && detailTab === 'episodes'
        ? `<div style="padding:10px 0;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:0 14px 10px;">
              ${
                item.mediaType === 'tv' && seasons.length > 0
                  ? `<select class="field-select" id="detail-season-select">
                      ${seasons
                        .map(
                          (s) => `<option value="${s.seasonNumber}" ${
                            s.seasonNumber === activeSeason ? 'selected' : ''
                          }>${escapeHtml(s.name)}</option>`
                        )
                        .join('')}
                    </select>`
                  : `<span style="font-size:14px;font-weight:700;">Episodes (${epCount})</span>`
              }
              ${
                item.mediaType === 'anime'
                  ? `<button type="button" class="outline-chip ${
                      dubEnabled ? 'is-active' : ''
                    }" id="toggle-dub-btn">${dubEnabled ? 'English Dub' : 'Subtitled'}</button>`
                  : ''
              }
            </div>
            ${
              richEps
                ? richEps
                    .map(
                      (ep) => `<div class="ep-row">
                        <button type="button" class="ep-row-top" data-play-episode="${ep.episode}" data-ep-key="${escapeHtml(
                        key
                      )}">
                          <div class="ep-thumb">
                            ${
                              ep.thumbnail
                                ? `<img src="${escapeHtml(ep.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
                                : `<img src="${escapeHtml(backdrop)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
                            }
                            <span class="ep-thumb-play">${svgIcon('play', 13)}</span>
                          </div>
                          <div style="flex:1;min-width:0;">
                            <div style="font-size:14px;font-weight:600;">${ep.episode}. ${escapeHtml(
                        ep.name || `Episode ${ep.episode}`
                      )}</div>
                            <div class="dim" style="font-size:11px;margin-top:2px;">${escapeHtml(
                              ep.released || `Season ${activeSeason}`
                            )}</div>
                          </div>
                        </button>
                        ${
                          ep.overview
                            ? `<p class="dim" style="font-size:12px;line-height:1.4;">${escapeHtml(ep.overview)}</p>`
                            : ''
                        }
                      </div>`
                    )
                    .join('')
                : `<div class="poster-grid-3" style="grid-template-columns:repeat(4,1fr);">
                    ${Array.from({ length: Math.min(epCount, 40) }, (_, i) => i + 1)
                      .map(
                        (ep) => `<button type="button" class="btn-dark" style="height:38px;font-size:13px;" data-play-episode="${ep}" data-ep-key="${escapeHtml(
                          key
                        )}">Ep ${ep}</button>`
                      )
                      .join('')}
                  </div>`
            }
          </div>`
        : `<div class="poster-grid-3">
            ${relatedItems.slice(0, 12).map((rel) => renderPosterCard(rel)).join('')}
          </div>`
    }
  </article>`;
}
