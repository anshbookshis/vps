/**
 * Stage II Psychological Test Battery:
 * - TAT (11 Hazy Scenes + 12th Blank Slide, 30s view + 4m write)
 * - WAT (3 full 60-word sets × 15s auto-advance + reaction timer + audit)
 * - SRT (60 situations / 30 min + live pace delta + model principles)
 * - SD (15 min 5-paragraph builder + cliché/balance audit)
 */

import { TAT_SCENES } from '../data/ppdt-tat-scenes.js';
import { WAT_SETS } from '../data/wat-bank.js';
import { SRT_ITEMS } from '../data/srt-bank.js';
import {
  analyzeStory,
  analyzeWatResponses,
  analyzeSrtResponses,
  analyzeSelfDescription,
} from '../engines/psych-analyzer.js';
import { renderSsbScene } from '../engines/scene-renderer.js';
import { playCue } from '../engines/audio-cues.js';
import { recordHistoryEntry, saveState } from '../engines/storage.js';
import { escapeHtml, formatTime, TimerHandle, loadLocalImages } from './ui-helpers.js';

export function renderPsychView(container, ctx, initialTab = 'tat') {
  let activeTab = ['tat', 'wat', 'srt', 'sd'].includes(initialTab) ? initialTab : 'tat';
  const timer = new TimerHandle();

  function cleanup() {
    timer.stop();
  }

  function renderShell() {
    cleanup();
    container.innerHTML = `
      <div class="view-header">
        <div>
          <p class="eyebrow">DAY 2 • STAGE II PSYCHOLOGY BATTERY</p>
          <h2>TAT, WAT, SRT &amp; Self-Description Simulators</h2>
          <p class="muted">Condition your subconscious speed under authentic continuous SSB projector clocks and automated self-audits.</p>
        </div>
        <div class="segmented" role="tablist">
          <button class="seg-btn ${activeTab === 'tat' ? 'active' : ''}" data-tab="tat" type="button">TAT (11+1)</button>
          <button class="seg-btn ${activeTab === 'wat' ? 'active' : ''}" data-tab="wat" type="button">WAT (60×15s)</button>
          <button class="seg-btn ${activeTab === 'srt' ? 'active' : ''}" data-tab="srt" type="button">SRT (60/30m)</button>
          <button class="seg-btn ${activeTab === 'sd' ? 'active' : ''}" data-tab="sd" type="button">SD (15m)</button>
        </div>
      </div>
      <div id="psych-body"></div>
    `;

    container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab');
        renderShell();
      });
    });

    const bodyEl = container.querySelector('#psych-body');
    if (activeTab === 'tat') mountTat(bodyEl, ctx, timer);
    else if (activeTab === 'wat') mountWat(bodyEl, ctx, timer);
    else if (activeTab === 'srt') mountSrt(bodyEl, ctx, timer);
    else mountSd(bodyEl, ctx, timer);
  }

  renderShell();
  return cleanup;
}

// ==================== TAT SIMULATOR ====================
function mountTat(root, ctx, timer) {
  let customSlides = [];
  let hazeLevel = 65;
  let practiceMode = 'digital';
  let slideCountMode = '4'; // '1' | '4' | '12'
  let tatRun = null;

  function renderConfig() {
    timer.stop();
    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>TAT (Thematic Apperception Test) — 30s Exposure + 4m Writing</h3>
          <span class="badge">${customSlides.length > 0 ? `${customSlides.length} Custom Images Loaded` : '11 Built-in Scenes + Blank Slide 12'}</span>
        </div>

        <div class="form-row three-col">
          <label class="field">
            <span>Session Length</span>
            <select id="tat-len">
              <option value="1" ${slideCountMode === '1' ? 'selected' : ''}>Single Slide Drill (4m 30s)</option>
              <option value="4" ${slideCountMode === '4' ? 'selected' : ''}>Mini Battery — 3 Scenes + Blank Slide (18m)</option>
              <option value="12" ${slideCountMode === '12' ? 'selected' : ''}>Full SSB Battery — 11 Scenes + Blank Slide (54m)</option>
            </select>
          </label>
          <label class="field">
            <span>Practice Mode</span>
            <select id="tat-mode">
              <option value="digital" ${practiceMode === 'digital' ? 'selected' : ''}>Digital Type &amp; Audit</option>
              <option value="paper" ${practiceMode === 'paper' ? 'selected' : ''}>Pen &amp; Paper Projector (Chimes + Auto-Advance)</option>
            </select>
          </label>
          <label class="field">
            <span>Haze Level: <strong id="tat-haze-val">${hazeLevel}%</strong></span>
            <input id="tat-haze" type="range" min="0" max="90" value="${hazeLevel}" />
          </label>
        </div>

        <div class="action-bar">
          <button id="btn-start-tat" class="btn btn-primary" type="button">Begin TAT Battery</button>
          <label class="btn btn-ghost btn-sm file-btn">
            Load Custom Image Folder (up to 12)
            <input id="tat-upload" type="file" accept="image/*" multiple hidden />
          </label>
          ${customSlides.length > 0 ? '<button id="btn-tat-reset-custom" class="btn btn-ghost btn-xs" type="button">Restore Built-in 12 Slides</button>' : ''}
        </div>
      </div>
    `;

    root.querySelector('#tat-len').addEventListener('change', (ev) => {
      slideCountMode = ev.target.value;
    });
    root.querySelector('#tat-mode').addEventListener('change', (ev) => {
      practiceMode = ev.target.value;
    });
    root.querySelector('#tat-haze').addEventListener('input', (ev) => {
      hazeLevel = Number(ev.target.value);
      root.querySelector('#tat-haze-val').textContent = `${hazeLevel}%`;
    });
    root.querySelector('#tat-upload').addEventListener('change', async (ev) => {
      const loaded = await loadLocalImages(ev.target.files);
      if (loaded.length > 0) {
        customSlides = loaded.map((img, i) => ({
          id: `custom-tat-${i}`,
          label: `Custom Slide ${i + 1}: ${img.label}`,
          imageEl: img.imageEl,
          expectedHint: 'Custom local image',
          themes: [],
          avoidTrap: '',
        }));
        renderConfig();
      }
    });
    const resetBtn = root.querySelector('#btn-tat-reset-custom');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        customSlides = [];
        renderConfig();
      });
    }

    root.querySelector('#btn-start-tat').addEventListener('click', () => {
      let slides;
      if (customSlides.length > 0) {
        slides = customSlides;
      } else if (slideCountMode === '1') {
        slides = [TAT_SCENES[Math.floor(Math.random() * 11)]];
      } else if (slideCountMode === '4') {
        const picked = [...TAT_SCENES.slice(0, 11)].sort(() => Math.random() - 0.5).slice(0, 3);
        slides = [...picked, TAT_SCENES[11]]; // Always include Blank Slide!
      } else {
        slides = TAT_SCENES;
      }

      tatRun = {
        slides,
        index: 0,
        phase: 'view', // 'view' (30s) | 'write' (240s)
        stories: slides.map((s) => ({ label: s.label, scene: s, story: '' })),
      };
      playCue('start', ctx.state.muted);
      renderSlidePhase();
    });
  }

  function renderSlidePhase() {
    if (!tatRun) return;
    timer.stop();

    const slide = tatRun.slides[tatRun.index];
    const isView = tatRun.phase === 'view';
    const durationSec = isView ? 30 : 240;
    const phaseStart = Date.now();

    root.innerHTML = `
      <div class="panel focus-stage">
        <div class="test-topbar">
          <div class="meta-group">
            <span class="badge">SLIDE ${tatRun.index + 1} / ${tatRun.slides.length}</span>
            <span class="mono">${isView ? 'OBSERVE PICTURE (30s)' : 'WRITE STORY (4:00)'}</span>
          </div>
          <div class="timer-readout" id="tat-clock">${formatTime(durationSec)}</div>
          <div class="meta-group">
            <button id="btn-tat-next" class="btn btn-ghost btn-xs" type="button">${isView ? 'Skip to Write →' : tatRun.index === tatRun.slides.length - 1 ? 'Finish Battery' : 'Next Slide →'}</button>
            <button id="btn-tat-abort" class="btn btn-ghost btn-xs" type="button">Abort</button>
          </div>
        </div>
        <div class="progress-track"><div id="tat-progress" class="progress-fill" style="width:100%"></div></div>

        ${
          isView
            ? `<canvas id="tat-canvas" width="760" height="430" class="scene-canvas large"></canvas>
               <p class="muted small center">${slide.blueprint === 'blank-slide' ? 'Blank Slide — frame your original positive real-life situation.' : 'Notice setting, character mood, and practical challenge.'}</p>`
            : practiceMode === 'paper'
              ? `<div class="projector-notice"><h3>Write Story #${tatRun.index + 1} on Your Answer Sheet</h3><p class="muted">Past context → Concrete Hero Action → Realistic Positive Outcome. Next picture flashes automatically at 00:00.</p></div>`
              : `<div class="story-meta"><span>Slide ${tatRun.index + 1}</span><span id="tat-wc" class="mono">0 words</span></div>
                 <textarea id="tat-story-box" class="story-textarea" rows="11" placeholder="Write story for Slide ${tatRun.index + 1} (aim 85–125 words)...">${escapeHtml(tatRun.stories[tatRun.index].story)}</textarea>`
        }
      </div>
    `;

    if (isView) {
      renderSsbScene(root.querySelector('#tat-canvas'), {
        blueprint: slide.blueprint,
        imageEl: slide.imageEl || null,
        hazeLevel,
      });
    } else if (practiceMode === 'digital') {
      const box = root.querySelector('#tat-story-box');
      const wcEl = root.querySelector('#tat-wc');
      box.focus();
      box.addEventListener('input', () => {
        tatRun.stories[tatRun.index].story = box.value;
        const wc = box.value.trim() ? box.value.trim().split(/\s+/).length : 0;
        wcEl.textContent = `${wc} words`;
      });
    }

    const advance = () => {
      timer.stop();
      if (tatRun.phase === 'view') {
        playCue('transition', ctx.state.muted);
        tatRun.phase = 'write';
        renderSlidePhase();
      } else if (tatRun.index < tatRun.slides.length - 1) {
        playCue('transition', ctx.state.muted);
        tatRun.index += 1;
        tatRun.phase = 'view';
        renderSlidePhase();
      } else {
        playCue('cutoff', ctx.state.muted);
        finishTat();
      }
    };

    root.querySelector('#btn-tat-next').addEventListener('click', advance);
    root.querySelector('#btn-tat-abort').addEventListener('click', renderConfig);

    timer.start(() => {
      const elapsed = Math.floor((Date.now() - phaseStart) / 1000);
      const rem = Math.max(0, durationSec - elapsed);
      const clock = root.querySelector('#tat-clock');
      const bar = root.querySelector('#tat-progress');
      if (clock) {
        clock.textContent = formatTime(rem);
        clock.classList.toggle('danger', rem <= 10);
      }
      if (bar) bar.style.width = `${(rem / durationSec) * 100}%`;
      if (rem <= 0) advance();
    }, 200);
  }

  function finishTat() {
    timer.stop();
    recordHistoryEntry(ctx.state, 'tat', {
      modeLabel: practiceMode === 'paper' ? 'Pen & Paper' : 'Digital',
      stories: tatRun.stories.map((s) => ({ label: s.label, story: s.story })),
    });

    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>TAT Session Complete (${tatRun.stories.length} Slides)</h3>
          <button id="btn-tat-again" class="btn btn-primary btn-sm" type="button">New TAT Battery</button>
        </div>
        <div class="review-stack">
          ${tatRun.stories
            .map((entry, idx) => {
              const audit = analyzeStory(entry.story, 240);
              return `
              <article class="review-item">
                <div class="review-head">
                  <strong>${idx + 1}. ${escapeHtml(entry.label)}</strong>
                  <span class="badge">${practiceMode === 'paper' ? 'Pen & Paper' : `${audit.wordCount}w • ${audit.verdict}`}</span>
                </div>
                ${entry.story ? `<p class="small">${escapeHtml(entry.story)}</p>` : ''}
                ${
                  audit.flags.length && practiceMode === 'digital'
                    ? `<ul class="flag-list small">${audit.flags.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
                    : ''
                }
                ${
                  entry.scene.themes?.length
                    ? `<p class="muted small"><strong>Theme cues:</strong> ${escapeHtml(entry.scene.themes.join(' | '))}</p>`
                    : ''
                }
              </article>`;
            })
            .join('')}
        </div>
      </div>
    `;

    root.querySelector('#btn-tat-again').addEventListener('click', renderConfig);
  }

  renderConfig();
}

// ==================== WAT SIMULATOR ====================
function mountWat(root, ctx, timer) {
  let watRun = null;

  function renderConfig() {
    timer.stop();
    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>WAT (Word Association Test) — 15 Seconds Per Word</h3>
          <span class="badge">3 Complete 60-Word Batteries (180 Words)</span>
        </div>
        <div class="form-row three-col">
          <label class="field">
            <span>Select Word Set</span>
            <select id="wat-set">
              ${WAT_SETS.map((s) => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Drill Size</span>
            <select id="wat-size">
              <option value="15">Quick Warmup — 15 Words (3m 45s)</option>
              <option value="30">Half Drill — 30 Words (7m 30s)</option>
              <option value="60" selected>Full SSB Battery — 60 Words (15m)</option>
            </select>
          </label>
          <label class="field">
            <span>Advance Behaviour</span>
            <select id="wat-flow">
              <option value="strict">Strict 15s SSB Lock (Digital)</option>
              <option value="enter">Advance Immediately on Enter</option>
              <option value="paper">Pen &amp; Paper Projector (Big Word + Chime)</option>
            </select>
          </label>
        </div>
        <div class="action-bar">
          <button id="btn-start-wat" class="btn btn-primary" type="button">Start WAT Projector</button>
        </div>
      </div>
    `;

    root.querySelector('#btn-start-wat').addEventListener('click', () => {
      const setId = root.querySelector('#wat-set').value;
      const size = Number(root.querySelector('#wat-size').value);
      const flow = root.querySelector('#wat-flow').value;
      const found = WAT_SETS.find((s) => s.id === setId) || WAT_SETS[0];
      const slice = found.words.slice(0, size);

      watRun = {
        setTitle: found.title,
        flow,
        entries: slice.map((w) => ({ ...w, sentence: '', reactionSec: 0 })),
        index: 0,
        wordStartTs: Date.now(),
        submittedCurrent: false,
      };
      playCue('start', ctx.state.muted);
      renderWordSlide();
    });
  }

  function renderWordSlide() {
    if (!watRun) return;
    timer.stop();

    const item = watRun.entries[watRun.index];
    watRun.wordStartTs = Date.now();
    watRun.submittedCurrent = false;

    root.innerHTML = `
      <div class="panel focus-stage wat-stage">
        <div class="test-topbar">
          <span class="badge">WORD ${watRun.index + 1} / ${watRun.entries.length}</span>
          <div class="timer-readout" id="wat-clock">00:15</div>
          <button id="btn-wat-finish" class="btn btn-ghost btn-xs" type="button">End &amp; Audit</button>
        </div>
        <div class="progress-track"><div id="wat-progress" class="progress-fill" style="width:100%"></div></div>

        <div class="wat-word-display">${escapeHtml(item.word.toUpperCase())}</div>

        ${
          watRun.flow === 'paper'
            ? `<p class="muted center">Write a short natural 5–9 word sentence on your sheet. Next word flashes automatically in 15s.</p>`
            : `
            <form id="wat-form" class="wat-input-row">
              <input id="wat-input" type="text" autocomplete="off" placeholder="Type first natural thought and press Enter..." value="${escapeHtml(item.sentence)}" />
              <button class="btn btn-primary" type="submit">Lock</button>
            </form>
            <p id="wat-lock-msg" class="muted small center">Strict 15s cycle — avoid "should / must / can" preaching.</p>`
        }
      </div>
    `;

    const inputEl = root.querySelector('#wat-input');
    const formEl = root.querySelector('#wat-form');
    const lockMsg = root.querySelector('#wat-lock-msg');

    const nextWord = () => {
      timer.stop();
      if (inputEl && !watRun.submittedCurrent && inputEl.value.trim()) {
        watRun.entries[watRun.index].sentence = inputEl.value.trim();
        watRun.entries[watRun.index].reactionSec = 15;
      }
      if (watRun.index < watRun.entries.length - 1) {
        watRun.index += 1;
        playCue('transition', ctx.state.muted);
        renderWordSlide();
      } else {
        playCue('cutoff', ctx.state.muted);
        finishWat();
      }
    };

    if (inputEl && formEl) {
      inputEl.focus();
      formEl.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const text = inputEl.value.trim();
        if (!text) return;
        const sec = Number(((Date.now() - watRun.wordStartTs) / 1000).toFixed(1));
        watRun.entries[watRun.index].sentence = text;
        watRun.entries[watRun.index].reactionSec = Math.min(15, sec);
        watRun.submittedCurrent = true;

        if (watRun.flow === 'enter') {
          nextWord();
        } else {
          inputEl.disabled = true;
          if (lockMsg) lockMsg.textContent = `Locked in ${sec}s — hold focus for next word...`;
        }
      });
    }

    root.querySelector('#btn-wat-finish').addEventListener('click', () => {
      if (inputEl && inputEl.value.trim()) {
        watRun.entries[watRun.index].sentence = inputEl.value.trim();
      }
      finishWat();
    });

    timer.start(() => {
      const elapsedMs = Date.now() - watRun.wordStartTs;
      const remSec = Math.max(0, 15 - elapsedMs / 1000);
      const clock = root.querySelector('#wat-clock');
      const bar = root.querySelector('#wat-progress');
      if (clock) {
        clock.textContent = formatTime(Math.ceil(remSec));
        clock.classList.toggle('danger', remSec <= 3);
      }
      if (bar) bar.style.width = `${(remSec / 15) * 100}%`;
      if (remSec <= 0) nextWord();
    }, 100);
  }

  function finishWat() {
    timer.stop();
    const audit = analyzeWatResponses(watRun.entries);
    if (watRun.flow !== 'paper') {
      recordHistoryEntry(ctx.state, 'wat', {
        setTitle: watRun.setTitle,
        total: audit.total,
        attempted: audit.attempted,
        avgReactionSec: audit.avgReactionSec,
        preachyCount: audit.preachyCount,
        negativeCount: audit.negativeCount,
      });
    }

    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>WAT Psychological Audit — ${escapeHtml(watRun.setTitle)}</h3>
          <button id="btn-wat-again" class="btn btn-primary btn-sm" type="button">Run Another WAT Set</button>
        </div>
        ${
          watRun.flow === 'paper'
            ? `<p class="muted">Pen &amp; Paper Projector completed (${watRun.entries.length} words flashed). Review your answer sheet for preachy "should/must" modals and negative trigger words.</p>`
            : `
            <div class="kpi-grid">
              <div class="kpi-card"><span class="kpi-label">Attempted</span><strong class="kpi-val">${audit.attempted}/${audit.total}</strong><span class="kpi-sub">${audit.completionPct}% completion</span></div>
              <div class="kpi-card"><span class="kpi-label">Avg Reaction</span><strong class="kpi-val">${audit.avgReactionSec || '—'}s</strong><span class="kpi-sub">Target &lt; 10.5s</span></div>
              <div class="kpi-card"><span class="kpi-label">Preachy Modals</span><strong class="kpi-val">${audit.preachyCount}</strong><span class="kpi-sub">"should / must / ought"</span></div>
              <div class="kpi-card"><span class="kpi-label">Defeatist / "I" Opener</span><strong class="kpi-val">${audit.negativeCount + audit.selfCenteredCount}</strong><span class="kpi-sub">${audit.cleanCount} crisp associations</span></div>
            </div>
            <div class="review-stack">
              ${audit.audited
                .map(
                  (row, i) => `
                  <article class="review-item ${row.badge === 'strong' ? 'pass' : row.badge === 'blank' ? 'fail' : 'warn'}">
                    <div class="review-head">
                      <strong>${i + 1}. ${escapeHtml(row.word)} <span class="muted small">(${escapeHtml(row.category)})</span></strong>
                      <span class="mono small">${row.reactionSec ? `${row.reactionSec}s` : '—'} • ${row.badge.toUpperCase()}</span>
                    </div>
                    <p>${row.sentence ? escapeHtml(row.sentence) : '<em class="muted">No response</em>'}</p>
                    ${row.issues.length ? `<ul class="flag-list small">${row.issues.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''}
                  </article>`
                )
                .join('')}
            </div>`
        }
      </div>
    `;

    root.querySelector('#btn-wat-again').addEventListener('click', renderConfig);
  }

  renderConfig();
}

// ==================== SRT SIMULATOR ====================
function mountSrt(root, ctx, timer) {
  let srtRun = null;

  function renderConfig() {
    timer.stop();
    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>SRT (Situation Reaction Test) — 60 Situations in 30 Minutes</h3>
          <span class="badge">Live 30s/Item Pace Tracker + Action Audit</span>
        </div>
        <div class="form-row">
          <label class="field">
            <span>Select SRT Battery</span>
            <select id="srt-set">
              <option value="all">Full SSB Battery — 60 Situations (30:00)</option>
              <option value="1">Set 1 — 30 Situations (15:00)</option>
              <option value="2">Set 2 — 30 Situations (15:00)</option>
              <option value="sprint">Quick 15-Situation Speed Sprint (7:30)</option>
            </select>
          </label>
        </div>
        <div class="action-bar">
          <button id="btn-start-srt" class="btn btn-primary" type="button">Begin Timed SRT</button>
        </div>
      </div>
    `;

    root.querySelector('#btn-start-srt').addEventListener('click', () => {
      const choice = root.querySelector('#srt-set').value;
      let items;
      if (choice === '1') items = SRT_ITEMS.filter((x) => x.set === 1);
      else if (choice === '2') items = SRT_ITEMS.filter((x) => x.set === 2);
      else if (choice === 'sprint') items = [...SRT_ITEMS].sort(() => Math.random() - 0.5).slice(0, 15);
      else items = SRT_ITEMS;

      const totalSec = items.length * 30;
      srtRun = {
        items,
        responses: Array(items.length).fill(''),
        index: 0,
        totalSec,
        startedAt: Date.now(),
        finished: false,
      };
      playCue('start', ctx.state.muted);
      renderRunner();
    });
  }

  function renderRunner() {
    if (!srtRun) return;
    const item = srtRun.items[srtRun.index];
    const currentRem = Math.max(0, srtRun.totalSec - Math.floor((Date.now() - srtRun.startedAt) / 1000));

    root.innerHTML = `
      <div class="test-topbar panel-compact">
        <div class="meta-group">
          <span class="badge">SITUATION ${srtRun.index + 1} / ${srtRun.items.length}</span>
          <span id="srt-pace" class="mono small">Pace check...</span>
        </div>
        <div class="timer-readout ${currentRem <= 60 ? 'danger' : ''}" id="srt-clock">${formatTime(currentRem)}</div>
        <button id="btn-srt-submit" class="btn btn-primary btn-sm" type="button">Submit &amp; Audit</button>
      </div>

      <div class="oir-layout">
        <div class="panel">
          <p class="srt-prompt">${escapeHtml(item.situation)}</p>
          <label class="field">
            <span>Your Crisp Action Response (cover immediate safety + practical action + logical closure):</span>
            <textarea id="srt-input" rows="4" placeholder="He immediately ...">${escapeHtml(srtRun.responses[srtRun.index])}</textarea>
          </label>
          <div class="action-bar between">
            <button id="btn-srt-prev" class="btn btn-ghost btn-sm" ${srtRun.index === 0 ? 'disabled' : ''} type="button">Previous</button>
            <button id="btn-srt-next" class="btn btn-primary btn-sm" type="button">${srtRun.index === srtRun.items.length - 1 ? 'Review / Finish' : 'Save & Next Situation →'}</button>
          </div>
        </div>

        <aside class="panel oir-palette">
          <h4>Progress Map</h4>
          <div class="palette-grid">
            ${srtRun.items
              .map(
                (_, i) => `
              <button class="pal-btn ${i === srtRun.index ? 'current' : ''} ${srtRun.responses[i].trim() ? 'answered' : ''}" data-sjump="${i}" type="button">${i + 1}</button>`
              )
              .join('')}
          </div>
        </aside>
      </div>
    `;

    const inputEl = root.querySelector('#srt-input');
    inputEl.focus();
    inputEl.addEventListener('input', () => {
      srtRun.responses[srtRun.index] = inputEl.value;
    });

    root.querySelector('#btn-srt-prev').addEventListener('click', () => {
      if (srtRun.index > 0) {
        srtRun.index -= 1;
        renderRunner();
      }
    });

    root.querySelector('#btn-srt-next').addEventListener('click', () => {
      if (srtRun.index < srtRun.items.length - 1) {
        srtRun.index += 1;
        renderRunner();
      } else {
        finishSrt();
      }
    });

    root.querySelectorAll('[data-sjump]').forEach((b) => {
      b.addEventListener('click', () => {
        srtRun.index = Number(b.dataset.sjump);
        renderRunner();
      });
    });

    root.querySelector('#btn-srt-submit').addEventListener('click', finishSrt);

    timer.start(() => {
      if (!srtRun || srtRun.finished) return;
      const elapsed = Math.floor((Date.now() - srtRun.startedAt) / 1000);
      const rem = Math.max(0, srtRun.totalSec - elapsed);
      const clock = root.querySelector('#srt-clock');
      const pace = root.querySelector('#srt-pace');
      if (clock) {
        clock.textContent = formatTime(rem);
        clock.classList.toggle('danger', rem <= 60);
      }
      if (pace) {
        const expectedIdx = Math.min(srtRun.items.length, Math.floor(elapsed / 30) + 1);
        const attemptedNow = srtRun.responses.filter((r) => r.trim().length > 0).length;
        const delta = attemptedNow - expectedIdx;
        pace.textContent = delta >= 0 ? `Target #${expectedIdx} • Ahead (+${delta})` : `Target #${expectedIdx} • Behind (${delta})`;
      }
      if (rem <= 0) finishSrt();
    }, 250);
  }

  function finishSrt() {
    if (!srtRun || srtRun.finished) return;
    srtRun.finished = true;
    timer.stop();
    playCue('cutoff', ctx.state.muted);

    const elapsedSec = Math.max(1, Math.round((Date.now() - srtRun.startedAt) / 1000));
    const entries = srtRun.items.map((item, idx) => ({
      ...item,
      response: srtRun.responses[idx],
    }));
    const audit = analyzeSrtResponses(entries);

    recordHistoryEntry(ctx.state, 'srt', {
      total: audit.total,
      attempted: audit.attempted,
      incompleteCount: audit.incompleteCount,
      elapsedSec,
    });

    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>SRT Speed &amp; Action Audit</h3>
          <button id="btn-srt-again" class="btn btn-primary btn-sm" type="button">New SRT Run</button>
        </div>
        <div class="kpi-grid">
          <div class="kpi-card"><span class="kpi-label">Attempted</span><strong class="kpi-val">${audit.attempted}/${audit.total}</strong><span class="kpi-sub">${audit.completionPct}%</span></div>
          <div class="kpi-card"><span class="kpi-label">Elapsed Time</span><strong class="kpi-val">${formatTime(elapsedSec)}</strong><span class="kpi-sub">${(elapsedSec / Math.max(1, audit.attempted)).toFixed(1)}s / attempted item</span></div>
          <div class="kpi-card"><span class="kpi-label">Brief / Incomplete</span><strong class="kpi-val">${audit.incompleteCount}</strong><span class="kpi-sub">Needs fuller closure</span></div>
          <div class="kpi-card"><span class="kpi-label">Avoidance / Heroic Flags</span><strong class="kpi-val">${audit.avoidanceCount + audit.unrealisticCount}</strong><span class="kpi-sub">Check practicality</span></div>
        </div>
      </div>

      <div class="panel">
        <h3>Situation-by-Situation Model Principle &amp; Trap Comparison</h3>
        <div class="review-stack">
          ${audit.audited
            .map(
              (row, i) => `
              <article class="review-item ${row.badge === 'strong' ? 'pass' : row.badge === 'blank' ? 'fail' : 'warn'}">
                <div class="review-head">
                  <strong>${i + 1}. ${escapeHtml(row.category)}</strong>
                  <span class="badge">${row.badge.toUpperCase()}</span>
                </div>
                <p class="small"><em>${escapeHtml(row.situation)}</em></p>
                <p class="small"><strong>Your Action:</strong> ${row.response ? escapeHtml(row.response) : '<span class="muted">Unattempted</span>'}</p>
                ${row.issues.length ? `<ul class="flag-list small">${row.issues.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''}
                <p class="small ok-text"><strong>Model Principle:</strong> ${escapeHtml(row.modelPrinciple)}</p>
                <p class="small warn-text"><strong>Watch Out:</strong> ${escapeHtml(row.trapWarning)}</p>
              </article>`
            )
            .join('')}
        </div>
      </div>
    `;

    root.querySelector('#btn-srt-again').addEventListener('click', renderConfig);
  }

  renderConfig();
}

// ==================== SELF DESCRIPTION (15 MIN) ====================
function mountSd(root, ctx, timer) {
  let sdRunning = false;
  let sdStart = 0;

  function renderSd() {
    timer.stop();
    const sd = ctx.state.sd;
    const report = analyzeSelfDescription(sd);

    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Self-Description (SD) — 15-Minute Timed Builder</h3>
            <p class="muted small">Auto-saves locally to match against your PIQ. Honest, example-backed, zero clichéd humblebrags.</p>
          </div>
          <div class="meta-group">
            <div class="timer-readout" id="sd-clock">15:00</div>
            <button id="btn-sd-timer" class="btn btn-primary btn-sm" type="button">Start 15m Timer</button>
          </div>
        </div>

        <div class="sd-grid">
          ${[
            ['parents', '1. What Your Parents Think About You', 'Mention genuine appreciation + one real habit they gently remind you to improve.'],
            ['teachers', '2. What Your Teachers / Employers Think About You', 'Focus on curiosity, punctuality, assignment reliability, or class participation.'],
            ['friends', '3. What Your Friends / Colleagues Think About You', 'Show team dependability, listening, humour, and loyalty without bragging.'],
            ['self', '4. Your Own Opinion (Strengths & Weaknesses)', 'Pair 2–3 real strengths with 1–2 genuine, improvable weaknesses & concrete fix underway.'],
            ['future', '5. What Kind of Person You Want to Become', 'Reflect grounded values, service ethos, and continual self-discipline.'],
          ]
            .map(
              ([key, label, hint]) => `
            <label class="field">
              <div class="between"><span>${escapeHtml(label)}</span><span class="mono muted small" id="sd-wc-${key}">0w</span></div>
              <textarea data-sd="${key}" rows="4" placeholder="${escapeHtml(hint)}">${escapeHtml(sd[key] || '')}</textarea>
            </label>`
            )
            .join('')}
        </div>

        <div class="panel-sub" id="sd-audit-box"></div>
      </div>
    `;

    function refreshAudit() {
      const rep = analyzeSelfDescription(ctx.state.sd);
      rep.sections.forEach((s) => {
        const badge = root.querySelector(`#sd-wc-${s.key}`);
        if (badge) badge.textContent = `${s.wordCount} words`;
      });
      const box = root.querySelector('#sd-audit-box');
      box.innerHTML = `
        <h4>Consistency &amp; Quality Audit (${rep.completedSections}/5 Sections • ${rep.totalWords} Total Words)</h4>
        <ul class="flag-list small">
          ${rep.sections
            .flatMap((s) => s.notes.map((n) => `<li><strong>${escapeHtml(s.label)}:</strong> ${escapeHtml(n)}</li>`))
            .join('') || '<li class="ok-text">All 5 paragraphs are balanced, realistic, and free of cliché humblebrags!</li>'}
        </ul>
      `;
    }

    root.querySelectorAll('[data-sd]').forEach((ta) => {
      ta.addEventListener('input', () => {
        ctx.state.sd[ta.dataset.sd] = ta.value;
        ctx.state.sd.updatedAt = new Date().toISOString();
        saveState(ctx.state);
        refreshAudit();
      });
    });

    root.querySelector('#btn-sd-timer').addEventListener('click', (ev) => {
      if (sdRunning) {
        sdRunning = false;
        timer.stop();
        ev.target.textContent = 'Start 15m Timer';
        return;
      }
      sdRunning = true;
      sdStart = Date.now();
      ev.target.textContent = 'Stop Timer';
      playCue('start', ctx.state.muted);
      timer.start(() => {
        const rem = Math.max(0, 900 - Math.floor((Date.now() - sdStart) / 1000));
        const clock = root.querySelector('#sd-clock');
        if (clock) {
          clock.textContent = formatTime(rem);
          clock.classList.toggle('danger', rem <= 60);
        }
        if (rem <= 0) {
          sdRunning = false;
          timer.stop();
          playCue('cutoff', ctx.state.muted);
          ev.target.textContent = 'Start 15m Timer';
        }
      }, 250);
    });

    refreshAudit();
  }

  renderSd();
}
