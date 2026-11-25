import { getMediaKey } from '../utils/storage.js';
import { svgIcon, renderSunoRibbonSvg } from './icons.js';
import { escapeHtml, resolveArtUrl, attachFallbackImgAttr, renderPosterCard, computeMatchPercent } from './cards.js';

/**
 * Dynamic Portrait Billboard Hero Card matching Screenshot 5 with Android ambient backdrop extraction.
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
    <div class="billboard-ambient" aria-hidden="true">
      <img src="${escapeHtml(art)}" alt="" referrerpolicy="no-referrer" />
    </div>
    <div class="billboard-card is-hero-anim">
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
          ? `<div class="billboard-spotlight-controls" onclick="event.stopPropagation()">
              <button type="button" class="spotlight-step-btn" data-hero-step="-1" aria-label="Previous spotlight">${svgIcon('chevronLeft', 14)}</button>
              <span class="spotlight-counter">${safeIdx + 1}/${list.length}</span>
              <button type="button" class="spotlight-step-btn" data-hero-step="1" aria-label="Next spotlight">${svgIcon('chevronRight', 14)}</button>
            </div>`
          : ''
      }
      <div class="billboard-content" data-open-detail="${escapeHtml(key)}">
        <div class="billboard-suno-kicker">
          ${renderSunoRibbonSvg(12, 14)}
          <span>${escapeHtml(typeWord.toUpperCase())}</span>
        </div>
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
export function renderDesktopBillboard(
  items,
  activeIndex = 0,
  { myListSet = new Set(), trailerPlaying = false, trailerMuted = true } = {}
) {
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
    <div class="dk-hero-card is-hero-anim" data-open-detail="${escapeHtml(key)}">
      ${
        trailerPlaying && item.trailerId
          ? `<iframe
              class="dk-hero-video"
              src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(
                item.trailerId
              )}?autoplay=1&mute=${trailerMuted ? 1 : 0}&controls=0&loop=1&playlist=${encodeURIComponent(
              item.trailerId
            )}&rel=0"
              title="${escapeHtml(item.title)} Preview"
              allow="autoplay; encrypted-media; fullscreen"
              referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>`
          : `<img
              class="dk-hero-img"
              src="${escapeHtml(art)}"
              alt="${escapeHtml(item.title)}"
              referrerpolicy="no-referrer"
              ${attachFallbackImgAttr(item, 'wide')}
            />`
      }
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
        <div class="billboard-suno-kicker" style="justify-content:flex-start;">
          ${renderSunoRibbonSvg(14, 17)}
          <span>${escapeHtml(typeWord.toUpperCase())}</span>
        </div>
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
            ${svgIcon('infoCircle', 18)} More Info
          </button>
          <button type="button" class="dk-btn-circle ${inMyList ? 'is-on' : ''}" data-toggle-mylist="${escapeHtml(
    key
  )}" title="${inMyList ? 'In My List' : 'Add to My List'}" aria-label="Toggle My List">
            ${svgIcon(inMyList ? 'check' : 'plus', 18)}
          </button>
        </div>
      </div>
      <div class="dk-hero-right-dock" onclick="event.stopPropagation()">
        <div class="dk-hero-cast-badge" title="${escapeHtml(castText)}">🎬 ${escapeHtml(castText)}</div>
        ${
          item.trailerId
            ? `<button type="button" class="dk-btn-circle" id="hero-trailer-toggle" title="${
                trailerPlaying ? (trailerMuted ? 'Unmute preview' : 'Mute preview') : 'Play preview'
              }" aria-label="Toggle preview audio">
                ${svgIcon(trailerPlaying ? (trailerMuted ? 'volumeOff' : 'volumeOn') : 'trailer', 16)}
              </button>`
            : ''
        }
        <div class="dk-hero-age-box">U/A 16+</div>
      </div>
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

/**
 * Centered Desktop Preview Modal (Jawbone / Title Dialog) over blurred catalog browse grid.
 */
export function renderDesktopDetailModal({
  item,
  inMyList = false,
  isLiked = false,
  savedProgress = null,
  trailerMuted = true,
  trailerPlaying = false,
  seasons = [],
  activeSeason = 1,
  relatedItems = [],
  myListSet = new Set(),
  dubEnabled = false,
}) {
  if (!item) return '';
  const key = getMediaKey(item);
  const backdrop = resolveArtUrl(item, 'wide');
  const matchPct = computeMatchPercent(item);
  const seasonObj =
    seasons.find((s) => s.seasonNumber === activeSeason) ||
    seasons[0] || { seasonNumber: 1, name: 'Season 1', episodeCount: item.totalEpisodes || 10 };
  const richEps = Array.isArray(seasonObj.episodes) && seasonObj.episodes.length ? seasonObj.episodes : null;
  const epCount = item.mediaType === 'anime' ? item.totalEpisodes || 12 : seasonObj.episodeCount || 10;

  return `<div class="dk-detail-backdrop" data-close-detail-modal="true">
    <article class="dk-detail-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(
      item.title
    )}" onclick="event.stopPropagation()">
      <button type="button" class="dk-modal-close" id="detail-back-btn" aria-label="Close">
        ${svgIcon('close', 20)}
      </button>

      <div class="dk-detail-hero">
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
        <div class="dk-detail-hero-scrim"></div>
        <div class="dk-detail-hero-overlay">
          ${
            item.logo
              ? `<img class="dk-hero-logo" src="${escapeHtml(item.logo)}" alt="${escapeHtml(
                  item.title
                )}" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" />
                 <h2 class="dk-hero-title" style="display:none;font-size:34px;">${escapeHtml(item.title)}</h2>`
              : `<h2 class="dk-hero-title" style="font-size:34px;">${escapeHtml(item.title)}</h2>`
          }
          <div class="dk-hero-actions" style="margin-top:12px;">
            <button type="button" class="dk-btn-play" data-play-key="${escapeHtml(key)}">
              ${svgIcon('play', 18)} ${savedProgress?.currentTime > 15 ? 'Resume' : 'Play'}
            </button>
            <button type="button" class="dk-circle-btn ${inMyList ? 'is-on' : ''}" data-toggle-mylist="${escapeHtml(
              key
            )}" title="My List" aria-label="Toggle My List" style="width:40px;height:40px;">
              ${svgIcon(inMyList ? 'check' : 'plus', 18)}
            </button>
            <button type="button" class="dk-circle-btn ${isLiked ? 'is-on' : ''}" data-toggle-like="${escapeHtml(
              key
            )}" title="Rate" aria-label="Toggle Like" style="width:40px;height:40px;">
              ${svgIcon('thumbsUp', 17)}
            </button>
            <button type="button" class="dk-circle-btn" data-share-key="${escapeHtml(
              key
            )}" title="Share" aria-label="Share" style="width:40px;height:40px;">
              ${svgIcon('share', 16)}
            </button>
          </div>
        </div>
        ${
          item.trailerId
            ? `<button type="button" class="detail-mute-btn" id="detail-trailer-toggle" style="right:24px;bottom:24px;width:38px;height:38px;border:1px solid rgba(255,255,255,0.45);" aria-label="Toggle trailer preview">
                ${svgIcon(trailerPlaying ? (trailerMuted ? 'volumeOff' : 'volumeOn') : 'trailer', 16)}
              </button>`
            : ''
        }
      </div>

      <div class="dk-detail-body">
        <div class="dk-detail-info-grid">
          <div class="dk-detail-left">
            <div class="dk-hover-meta" style="font-size:14px;gap:10px;margin-bottom:12px;">
              <span class="dk-match-score" style="font-size:15px;">${matchPct}% Match</span>
              ${item.year ? `<span>${escapeHtml(item.year)}</span>` : ''}
              <span class="age-pill">U/A 16+</span>
              ${item.runtime ? `<span>${escapeHtml(item.runtime)}</span>` : ''}
              <span class="hd-pill">HD</span>
              ${item.rating ? `<span>★ ${escapeHtml(item.rating)}</span>` : ''}
            </div>
            <p class="dk-detail-overview">${escapeHtml(
              item.overview || 'Stream seamlessly on Suno Cinema via VidLink & VidRift.'
            )}</p>
          </div>
          <div class="dk-detail-right">
            ${
              item.cast?.length
                ? `<div><span class="dk-meta-key">Cast: </span><span>${escapeHtml(
                    item.cast.slice(0, 5).join(', ')
                  )}</span></div>`
                : ''
            }
            ${
              item.genres?.length
                ? `<div><span class="dk-meta-key">Genres: </span><span>${escapeHtml(item.genres.join(', '))}</span></div>`
                : ''
            }
            ${
              item.creator
                ? `<div><span class="dk-meta-key">${
                    item.mediaType === 'tv' ? 'Creator: ' : item.mediaType === 'anime' ? 'Studio: ' : 'Director: '
                  }</span><span>${escapeHtml(item.creator)}</span></div>`
                : ''
            }
          </div>
        </div>

        ${
          item.mediaType !== 'movie'
            ? `<div class="dk-detail-episodes">
                <div class="dk-ep-section-head">
                  <h3>Episodes</h3>
                  <div style="display:flex;align-items:center;gap:10px;">
                    ${
                      item.mediaType === 'tv' && seasons.length > 0
                        ? `<select class="dk-lang-select" id="detail-season-select" style="min-width:130px;border-radius:4px;">
                            ${seasons
                              .map(
                                (s) => `<option value="${s.seasonNumber}" ${
                                  s.seasonNumber === activeSeason ? 'selected' : ''
                                }>${escapeHtml(s.name)}</option>`
                              )
                              .join('')}
                          </select>`
                        : `<span class="dim" style="font-size:13px;">${epCount} Episodes</span>`
                    }
                    ${
                      item.mediaType === 'anime'
                        ? `<button type="button" class="outline-chip ${
                            dubEnabled ? 'is-active' : ''
                          }" id="toggle-dub-btn">${dubEnabled ? 'English Dub' : 'Subtitled'}</button>`
                        : ''
                    }
                  </div>
                </div>
                ${
                  richEps
                    ? `<div class="dk-ep-list">
                        ${richEps
                          .map(
                            (ep) => `<button type="button" class="dk-ep-item" data-play-episode="${ep.episode}" data-ep-key="${escapeHtml(
                              key
                            )}">
                              <span class="dk-ep-num">${ep.episode}</span>
                              <div class="dk-ep-thumb">
                                <img src="${escapeHtml(ep.thumbnail || backdrop)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
                                <span class="ep-thumb-play">${svgIcon('play', 13)}</span>
                              </div>
                              <div class="dk-ep-text">
                                <div class="dk-ep-title-row">
                                  <span>${escapeHtml(ep.name || `Episode ${ep.episode}`)}</span>
                                  <span class="dim" style="font-size:12px;">${escapeHtml(ep.released || `S${activeSeason} E${ep.episode}`)}</span>
                                </div>
                                ${
                                  ep.overview
                                    ? `<p class="dk-ep-desc">${escapeHtml(ep.overview)}</p>`
                                    : ''
                                }
                              </div>
                            </button>`
                          )
                          .join('')}
                      </div>`
                    : `<div class="poster-grid-3" style="grid-template-columns:repeat(6,1fr);padding:8px 0;">
                        ${Array.from({ length: Math.min(epCount, 36) }, (_, i) => i + 1)
                          .map(
                            (ep) => `<button type="button" class="btn-dark" style="height:38px;font-size:13px;" data-play-episode="${ep}" data-ep-key="${escapeHtml(
                              key
                            )}">Ep ${ep}</button>`
                          )
                          .join('')}
                      </div>`
                }
              </div>`
            : ''
        }

        <div class="dk-detail-more">
          <h3>More Like This</h3>
          <div class="dk-more-grid">
            ${relatedItems
              .slice(0, 9)
              .map((rel) => {
                const rk = getMediaKey(rel);
                const rList = myListSet.has(rk);
                return `<article class="dk-more-card" data-open-detail="${escapeHtml(rk)}">
                  <div class="dk-more-media">
                    <img src="${escapeHtml(resolveArtUrl(rel, 'wide'))}" alt="${escapeHtml(rel.title)}" loading="lazy" referrerpolicy="no-referrer" ${attachFallbackImgAttr(
                  rel,
                  'wide'
                )} />
                    <span class="dk-more-badge">${escapeHtml(rel.runtime || rel.year || 'HD')}</span>
                    <span class="dk-more-play">${svgIcon('play', 16)}</span>
                  </div>
                  <div class="dk-more-body">
                    <div class="dk-more-top">
                      <div>
                        <span class="dk-match-score" style="font-size:12px;">${computeMatchPercent(rel)}% Match</span>
                        <div class="dk-more-meta">
                          <span class="age-pill">U/A 16+</span>
                          ${rel.year ? `<span>${escapeHtml(rel.year)}</span>` : ''}
                        </div>
                      </div>
                      <button type="button" class="dk-circle-btn ${rList ? 'is-on' : ''}" data-toggle-mylist="${escapeHtml(
                  rk
                )}" onclick="event.stopPropagation()" aria-label="Toggle My List" style="width:32px;height:32px;">
                        ${svgIcon(rList ? 'check' : 'plus', 15)}
                      </button>
                    </div>
                    <div style="font-size:13.5px;font-weight:700;color:#fff;margin-top:6px;">${escapeHtml(rel.title)}</div>
                    <p class="dk-more-desc">${escapeHtml(rel.overview || 'Stream free on Suno Cinema.')}</p>
                  </div>
                </article>`;
              })
              .join('')}
          </div>
        </div>
      </div>
    </article>
  </div>`;
}
