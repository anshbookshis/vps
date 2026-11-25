import { getMediaKey } from '../utils/storage.js';
import { svgIcon } from './icons.js';
import { escapeHtml, resolveArtUrl, attachFallbackImgAttr, renderPosterCard } from './cards.js';

/**
 * Portrait Billboard Hero Card matching Screenshot 5 (Rocket Singh style) with Suno Cinema branding.
 */
export function renderAndroidBillboard(item, { inMyList = false } = {}) {
  if (!item) return '';
  const key = getMediaKey(item);
  const art = resolveArtUrl(item, 'poster');
  const typeWord = item.mediaType === 'tv' ? 'Series' : item.mediaType === 'anime' ? 'Anime' : 'Movie';
  const tags = [typeWord, ...(item.genres || []).slice(0, 2), item.country || item.year].filter(Boolean);

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
            ${svgIcon(inMyList ? 'check' : 'plus', 17)} ${inMyList ? 'My List' : 'My List'}
          </button>
        </div>
      </div>
    </div>
  </section>`;
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
