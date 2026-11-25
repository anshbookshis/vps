import { getMediaKey } from '../utils/storage.js';
import { svgIcon } from './icons.js';
import { escapeHtml, resolveArtUrl, attachFallbackImgAttr } from './cards.js';

/**
 * 7movies-grade full-bleed Hero Carousel fused with Suno's obsidian theme & Sonic DNA.
 */
export function renderHeroCarousel(items, activeIndex, { likedIds = new Set(), curtainPlaying = false } = {}) {
  if (!items || items.length === 0) return '';
  const safeIdx = ((activeIndex % items.length) + items.length) % items.length;
  const item = items[safeIdx];
  const key = getMediaKey(item);
  const backdrop = resolveArtUrl(item, 'wide');
  const liked = likedIds.has(key);
  const typeLabel = item.mediaType === 'tv' ? 'SERIES' : item.mediaType === 'anime' ? 'ANIME' : 'FEATURE FILM';

  return `<section class="hero-showcase" aria-label="Featured Spotlight">
    <img
      class="hero-backdrop"
      src="${escapeHtml(backdrop)}"
      alt="${escapeHtml(item.title)}"
      referrerpolicy="no-referrer"
      ${attachFallbackImgAttr(item, 'wide')}
    />
    <div class="hero-scrim"></div>

    <div class="hero-showcase-inner">
      <div class="hero-showcase-meta-row">
        <span class="sonic-live-dot"></span>
        <span class="hero-kicker">${typeLabel}</span>
        ${item.rating ? `<span class="hero-pill">★ ${escapeHtml(item.rating)}</span>` : ''}
        ${item.year ? `<span class="hero-pill">${escapeHtml(item.year)}</span>` : ''}
        ${item.runtime ? `<span class="hero-pill">${escapeHtml(item.runtime)}</span>` : ''}
        ${
          item.sonicMatch
            ? `<span class="hero-pill is-sonic">${item.sonicMatch.score}% Sonic Match</span>`
            : ''
        }
      </div>

      ${
        item.logo
          ? `<div class="hero-logo-wrap">
              <img class="hero-logo-img" src="${escapeHtml(item.logo)}" alt="${escapeHtml(
              item.title
            )}" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" />
              <h1 class="hero-showcase-title" style="display:none;">${escapeHtml(item.title)}</h1>
            </div>`
          : `<h1 class="hero-showcase-title">${escapeHtml(item.title)}</h1>`
      }

      <p class="hero-showcase-desc">${escapeHtml(
        item.overview || 'Stream seamlessly in HD via VidRift with synced Suno sonic pairing.'
      )}</p>

      <div class="hero-sonic-clue">
        <span class="dim">Best after listening to:</span>
        <strong>${escapeHtml(item.sonic?.listenBefore || 'Suno Night Mix')}</strong>
        <span class="dim">•</span>
        <span>${escapeHtml(item.sonic?.texture || 'Synced Score')}</span>
      </div>

      <div class="hero-actions">
        <button type="button" class="primary-button" data-play-key="${escapeHtml(key)}">
          ${svgIcon('play', 17)} Stream Now
        </button>
        ${
          item.trailerId
            ? `<button type="button" class="pill-button" data-open-trailer="${escapeHtml(
                item.trailerId
              )}" data-trailer-title="${escapeHtml(item.title)}">
                ${svgIcon('trailer', 16)} Trailer
              </button>`
            : ''
        }
        <button type="button" class="pill-button ${
          curtainPlaying ? 'is-accent' : ''
        }" id="hero-audition-btn" data-curtain="${escapeHtml(item.sonic?.moodId || 'midnight-synth')}">
          ${svgIcon('wave', 16)} ${curtainPlaying ? 'Stop Vibe' : 'Audition Vibe'}
        </button>
        <button type="button" class="pill-button" data-toggle-like="${escapeHtml(key)}">
          ${svgIcon(liked ? 'heartFill' : 'heart', 16)} ${liked ? 'In My List' : 'My List'}
        </button>
        <button type="button" class="pill-button" data-open-detail="${escapeHtml(key)}">
          ${svgIcon('info', 16)} More Info
        </button>
      </div>
    </div>

    <div class="hero-carousel-controls">
      <button type="button" class="icon-button" data-hero-step="-1" aria-label="Previous featured title">
        ${svgIcon('chevronLeft', 18)}
      </button>
      <div class="hero-dots">
        ${items
          .map(
            (_, idx) => `<button type="button" class="hero-dot ${
              idx === safeIdx ? 'is-active' : ''
            }" data-hero-dot="${idx}" aria-label="Slide ${idx + 1}"></button>`
          )
          .join('')}
      </div>
      <button type="button" class="icon-button" data-hero-step="1" aria-label="Next featured title">
        ${svgIcon('chevronRight', 18)}
      </button>
    </div>
  </section>`;
}

/**
 * Rich Episode Grid using Cinemeta episode metadata + thumbnails when available,
 * or clean compact episode selector pills otherwise.
 */
export function renderRichEpisodesSection({
  item,
  seasons,
  activeSeason,
  activeEpisode,
  dubEnabled = false,
  compact = false,
}) {
  const key = getMediaKey(item);
  const seasonObj =
    seasons.find((s) => s.seasonNumber === activeSeason) ||
    seasons[0] || { seasonNumber: 1, name: 'Season 1', episodeCount: item.totalEpisodes || 10 };

  const richEpisodes = Array.isArray(seasonObj.episodes) && seasonObj.episodes.length > 0 ? seasonObj.episodes : null;
  const epCount =
    item.mediaType === 'anime' ? item.totalEpisodes || 12 : seasonObj.episodeCount || 10;

  return `<section class="season-ep-box">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <h2 style="font-size:17px;font-weight:700;">Episodes ${
        richEpisodes ? `<span class="dim" style="font-weight:400;font-size:13px;">(${richEpisodes.length} in ${escapeHtml(
          seasonObj.name
        )})</span>` : ''
      }</h2>
      <div style="display:flex;gap:8px;align-items:center;">
        ${
          item.mediaType === 'tv' && seasons.length > 0
            ? `<select class="field-select" id="${compact ? 'theater-season-select' : 'detail-season-select'}" style="height:34px;">
                ${seasons
                  .map(
                    (s) => `<option value="${s.seasonNumber}" ${
                      s.seasonNumber === activeSeason ? 'selected' : ''
                    }>${escapeHtml(s.name)} (${s.episodeCount} eps)</option>`
                  )
                  .join('')}
              </select>`
            : ''
        }
        ${
          item.mediaType === 'anime'
            ? `<button type="button" class="pill-button ${
                dubEnabled ? 'is-accent' : ''
              }" id="toggle-dub-btn" style="height:34px;font-size:12px;">
                ${dubEnabled ? 'Audio: English Dub (?dub=1)' : 'Audio: Original Sub'}
              </button>`
            : ''
        }
      </div>
    </div>

    ${
      richEpisodes && !compact
        ? `<div class="episode-rich-grid">
            ${richEpisodes
              .map(
                (ep) => `<button type="button" class="ep-rich-card ${
                  ep.episode === activeEpisode ? 'is-active' : ''
                }" data-play-episode="${ep.episode}" data-ep-key="${escapeHtml(key)}">
                  <div class="ep-rich-thumb">
                    ${
                      ep.thumbnail
                        ? `<img src="${escapeHtml(ep.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
                        : `<div class="ep-rich-placeholder">S${activeSeason} E${ep.episode}</div>`
                    }
                    <span class="ep-rich-num">E${ep.episode}</span>
                  </div>
                  <div class="ep-rich-body">
                    <div class="ep-rich-title">${escapeHtml(ep.name || `Episode ${ep.episode}`)}</div>
                    ${
                      ep.overview
                        ? `<div class="ep-rich-desc">${escapeHtml(ep.overview)}</div>`
                        : ''
                    }
                    ${
                      ep.released || ep.rating
                        ? `<div class="ep-rich-meta">${escapeHtml(
                            [ep.released, ep.rating ? `★ ${ep.rating}` : ''].filter(Boolean).join(' • ')
                          )}</div>`
                        : ''
                    }
                  </div>
                </button>`
              )
              .join('')}
          </div>`
        : richEpisodes && compact
        ? `<div class="track-list">
            ${richEpisodes
              .map(
                (ep) => `<button type="button" class="song-row ${
                  ep.episode === activeEpisode ? 'is-active' : ''
                }" data-play-episode="${ep.episode}" data-ep-key="${escapeHtml(key)}" style="text-align:left;width:100%;">
                  <span class="row-index">${ep.episode}</span>
                  <div class="row-main">
                    <div class="row-title">${escapeHtml(ep.name || `Episode ${ep.episode}`)}</div>
                    <div class="row-sub">${escapeHtml(ep.overview || `Season ${activeSeason}`)}</div>
                  </div>
                </button>`
              )
              .join('')}
          </div>`
        : `<div class="episode-grid" style="${compact ? 'grid-template-columns:repeat(3,1fr);' : ''}">
            ${Array.from({ length: Math.min(epCount, 40) }, (_, i) => i + 1)
              .map(
                (ep) => `<button type="button" class="ep-btn ${
                  ep === activeEpisode ? 'is-active' : ''
                }" data-play-episode="${ep}" data-ep-key="${escapeHtml(key)}">
                  <span>Ep ${ep}</span>
                  ${compact ? '' : svgIcon('play', 13)}
                </button>`
              )
              .join('')}
          </div>`
    }
  </section>`;
}

export function renderTrailerModal(trailerId, title) {
  if (!trailerId) return '';
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerId)}?autoplay=1&rel=0`;
  return `<div class="dialog-backdrop" data-close-modal="true">
    <div class="dialog-card" style="width:min(860px, 100%);padding:16px;" role="dialog" aria-modal="true" aria-label="Official Trailer">
      <div class="dialog-head">
        <div>
          <h2 style="font-size:17px;font-weight:700;">${escapeHtml(title || 'Trailer')} — Official Preview</h2>
          <p class="dim" style="font-size:12px;">Privacy-enhanced embed (youtube-nocookie.com)</p>
        </div>
        <button type="button" class="icon-button" data-close-modal="true" aria-label="Close">
          ${svgIcon('close', 20)}
        </button>
      </div>
      <div style="position:relative;padding-bottom:56.25%;height:0;border-radius:8px;overflow:hidden;background:#000;">
        <iframe
          src="${escapeHtml(src)}"
          title="${escapeHtml(title || 'Trailer')}"
          style="position:absolute;inset:0;width:100%;height:100%;border:0;"
          allow="autoplay; encrypted-media; fullscreen"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      </div>
    </div>
  </div>`;
}
