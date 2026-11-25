/**
 * Stage I Screening Workbench:
 * 1) OIR (Officer Intelligence Rating) Speed Drill — Verbal + Non-Verbal SVG Puzzles
 * 2) PPDT (Picture Perception & Description Test) — 30s View -> 1m Box+Action -> 4m Story -> 1m Voice Narration
 */

import { OIR_QUESTIONS } from '../data/oir-bank.js';
import { PPDT_SCENES } from '../data/ppdt-tat-scenes.js';
import { analyzeStory } from '../engines/psych-analyzer.js';
import { renderSsbScene } from '../engines/scene-renderer.js';
import { playCue, createVoiceRecorder } from '../engines/audio-cues.js';
import { recordHistoryEntry } from '../engines/storage.js';
import { escapeHtml, formatTime, TimerHandle, loadLocalImages } from './ui-helpers.js';

export function renderStage1View(container, ctx, initialTab = 'ppdt') {
  let activeTab = initialTab === 'oir' ? 'oir' : 'ppdt';
  const timer = new TimerHandle();
  const recorder = createVoiceRecorder();

  function cleanup() {
    timer.stop();
    recorder.dispose();
  }

  function renderShell() {
    cleanup();
    container.innerHTML = `
      <div class="view-header">
        <div>
          <p class="eyebrow">DAY 1 • STAGE I SCREENING</p>
          <h2>OIR Speed Test &amp; PPDT Simulator</h2>
          <p class="muted">Stage I eliminates ~75% of candidates. Build speed on OIR puzzles and crispness on 30s perception + 50s narration.</p>
        </div>
        <div class="segmented" role="tablist">
          <button class="seg-btn ${activeTab === 'ppdt' ? 'active' : ''}" data-tab="ppdt" type="button">PPDT Simulator</button>
          <button class="seg-btn ${activeTab === 'oir' ? 'active' : ''}" data-tab="oir" type="button">OIR Speed Drill</button>
        </div>
      </div>
      <div id="stage1-body"></div>
    `;

    container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab');
        renderShell();
      });
    });

    const bodyEl = container.querySelector('#stage1-body');
    if (activeTab === 'oir') {
      mountOirDrill(bodyEl, ctx, timer);
    } else {
      mountPpdtSimulator(bodyEl, ctx, timer, recorder);
    }
  }

  renderShell();
  return cleanup;
}

// ==================== OIR SPEED DRILL ====================
function mountOirDrill(root, ctx, timer) {
  let session = null;

  function renderConfig() {
    timer.stop();
    const verbalCount = OIR_QUESTIONS.filter((q) => q.type === 'verbal').length;
    const nvCount = OIR_QUESTIONS.filter((q) => q.type === 'nonverbal').length;

    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>Configure OIR Speed Sprint</h3>
          <span class="badge">${OIR_QUESTIONS.length} Verified Questions (${verbalCount} Verbal • ${nvCount} Non-Verbal SVG)</span>
        </div>
        <div class="form-row three-col">
          <label class="field">
            <span>Question Pool</span>
            <select id="oir-mode">
              <option value="mixed">Mixed Verbal + Non-Verbal (Recommended)</option>
              <option value="nonverbal">Non-Verbal Spatial &amp; Visual Only (${nvCount})</option>
              <option value="verbal">Verbal &amp; Quantitative Only (${verbalCount})</option>
            </select>
          </label>
          <label class="field">
            <span>Sprint Size</span>
            <select id="oir-count">
              <option value="12">Quick Sprint — 12 Qs (6 min)</option>
              <option value="25" selected>Half Set — 25 Qs (12.5 min)</option>
              <option value="37">Full Bank — All Questions</option>
            </select>
          </label>
          <label class="field">
            <span>Pace Target</span>
            <select id="oir-pace">
              <option value="30" selected>Strict SSB Pace (30s / Q)</option>
              <option value="22">High-Pressure OIR-1 Target (22s / Q)</option>
              <option value="45">Relaxed Learning Pace (45s / Q)</option>
            </select>
          </label>
        </div>
        <div class="action-bar">
          <button id="btn-start-oir" class="btn btn-primary" type="button">Begin OIR Timed Drill</button>
        </div>
      </div>
    `;

    root.querySelector('#btn-start-oir').addEventListener('click', () => {
      const mode = root.querySelector('#oir-mode').value;
      const requestedCount = Number(root.querySelector('#oir-count').value);
      const secPerQ = Number(root.querySelector('#oir-pace').value);

      let pool = OIR_QUESTIONS.filter((q) => mode === 'mixed' || q.type === mode);
      pool = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(requestedCount, pool.length));
      const totalSec = pool.length * secPerQ;

      session = {
        mode,
        questions: pool,
        answers: Array(pool.length).fill(null),
        currentIndex: 0,
        secPerQ,
        totalSec,
        remainingSec: totalSec,
        startedAt: Date.now(),
        finished: false,
      };
      playCue('start', ctx.state.muted);
      renderTestRunner();
    });
  }

  function renderTestRunner() {
    if (!session) return;
    const q = session.questions[session.currentIndex];
    const selected = session.answers[session.currentIndex];

    root.innerHTML = `
      <div class="test-topbar panel-compact">
        <div class="meta-group">
          <span class="badge">${escapeHtml(q.topic)}</span>
          <span class="mono">Question ${session.currentIndex + 1} / ${session.questions.length}</span>
        </div>
        <div class="timer-readout ${session.remainingSec <= 30 ? 'danger' : ''}" id="oir-clock">${formatTime(session.remainingSec)}</div>
        <div class="meta-group">
          <button id="btn-submit-oir" class="btn btn-primary btn-sm" type="button">Finish &amp; Score</button>
        </div>
      </div>

      <div class="oir-layout">
        <div class="panel">
          <p class="oir-prompt">${escapeHtml(q.prompt).replace(/\n/g, '<br/>')}</p>
          ${q.promptSvg ? `<div class="oir-svg-stage">${q.promptSvg}</div>` : ''}
          <div class="oir-options ${q.optionSvgs ? 'svg-grid' : ''}">
            ${q.options
              .map(
                (opt, i) => `
              <button class="oir-opt ${selected === i ? 'selected' : ''}" data-opt="${i}" type="button">
                <span class="opt-key">${String.fromCharCode(65 + i)}</span>
                ${q.optionSvgs?.[i] ? `<span class="opt-svg">${q.optionSvgs[i]}</span>` : ''}
                <span class="opt-text">${escapeHtml(opt)}</span>
              </button>`
              )
              .join('')}
          </div>
          <div class="action-bar between">
            <button id="btn-oir-prev" class="btn btn-ghost btn-sm" ${session.currentIndex === 0 ? 'disabled' : ''} type="button">Previous</button>
            <button id="btn-oir-clear" class="btn btn-ghost btn-sm" type="button">Clear Choice</button>
            <button id="btn-oir-next" class="btn btn-primary btn-sm" type="button">${session.currentIndex === session.questions.length - 1 ? 'Review / Submit' : 'Save & Next'}</button>
          </div>
        </div>

        <aside class="panel oir-palette">
          <h4>Question Navigator</h4>
          <div class="palette-grid">
            ${session.questions
              .map(
                (_, idx) => `
              <button class="pal-btn ${idx === session.currentIndex ? 'current' : ''} ${session.answers[idx] !== null ? 'answered' : ''}" data-jump="${idx}" type="button">${idx + 1}</button>`
              )
              .join('')}
          </div>
          <p class="muted small">Answered: ${session.answers.filter((a) => a !== null).length}/${session.questions.length}</p>
        </aside>
      </div>
    `;

    timer.start(() => {
      if (!session || session.finished) return;
      const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
      session.remainingSec = Math.max(0, session.totalSec - elapsed);
      const clock = root.querySelector('#oir-clock');
      if (clock) {
        clock.textContent = formatTime(session.remainingSec);
        clock.classList.toggle('danger', session.remainingSec <= 30);
      }
      if (session.remainingSec <= 0) {
        finishSession();
      }
    }, 250);

    root.querySelectorAll('[data-opt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        session.answers[session.currentIndex] = Number(btn.getAttribute('data-opt'));
        renderTestRunner();
      });
    });

    root.querySelectorAll('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        session.currentIndex = Number(btn.getAttribute('data-jump'));
        renderTestRunner();
      });
    });

    root.querySelector('#btn-oir-prev').addEventListener('click', () => {
      if (session.currentIndex > 0) {
        session.currentIndex -= 1;
        renderTestRunner();
      }
    });

    root.querySelector('#btn-oir-clear').addEventListener('click', () => {
      session.answers[session.currentIndex] = null;
      renderTestRunner();
    });

    root.querySelector('#btn-oir-next').addEventListener('click', () => {
      if (session.currentIndex < session.questions.length - 1) {
        session.currentIndex += 1;
        renderTestRunner();
      } else {
        finishSession();
      }
    });

    root.querySelector('#btn-submit-oir').addEventListener('click', finishSession);
  }

  function finishSession() {
    if (!session || session.finished) return;
    session.finished = true;
    timer.stop();
    playCue('cutoff', ctx.state.muted);

    const elapsedSec = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
    let score = 0;
    let attempted = 0;
    session.questions.forEach((q, idx) => {
      if (session.answers[idx] !== null) {
        attempted += 1;
        if (session.answers[idx] === q.answerIndex) score += 1;
      }
    });
    const accuracy = Math.round((score / session.questions.length) * 100);
    const oirRating = accuracy >= 88 ? 'OIR 1 (Top Bracket)' : accuracy >= 75 ? 'OIR 2 (Strong)' : accuracy >= 60 ? 'OIR 3 (Borderline)' : 'Needs Speed & Accuracy Drill';

    recordHistoryEntry(ctx.state, 'oir', {
      score,
      total: session.questions.length,
      attempted,
      accuracy,
      elapsedSec,
      mode: session.mode,
    });

    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>OIR Scorecard — ${escapeHtml(oirRating)}</h3>
          <button id="btn-oir-again" class="btn btn-primary btn-sm" type="button">New OIR Sprint</button>
        </div>
        <div class="kpi-grid">
          <div class="kpi-card"><span class="kpi-label">Score</span><strong class="kpi-val">${score} / ${session.questions.length}</strong><span class="kpi-sub">${accuracy}% overall</span></div>
          <div class="kpi-card"><span class="kpi-label">Attempted</span><strong class="kpi-val">${attempted}</strong><span class="kpi-sub">${session.questions.length - attempted} skipped</span></div>
          <div class="kpi-card"><span class="kpi-label">Total Time</span><strong class="kpi-val">${formatTime(elapsedSec)}</strong><span class="kpi-sub">${(elapsedSec / session.questions.length).toFixed(1)}s / question</span></div>
        </div>
      </div>

      <div class="panel">
        <h3>Detailed Solution Breakdown</h3>
        <div class="review-stack">
          ${session.questions
            .map((q, idx) => {
              const userAns = session.answers[idx];
              const isCorrect = userAns === q.answerIndex;
              return `
                <article class="review-item ${isCorrect ? 'pass' : 'fail'}">
                  <div class="review-head">
                    <span class="badge">${idx + 1}. ${escapeHtml(q.topic)}</span>
                    <span class="status-pill ${isCorrect ? 'ok' : 'bad'}">${userAns === null ? 'Unattempted' : isCorrect ? 'Correct' : 'Incorrect'}</span>
                  </div>
                  <p>${escapeHtml(q.prompt)}</p>
                  ${q.promptSvg ? `<div class="oir-svg-mini">${q.promptSvg}</div>` : ''}
                  <p class="small">
                    <strong>Your Answer:</strong> ${userAns === null ? 'None' : escapeHtml(q.options[userAns])} &nbsp;|&nbsp;
                    <strong>Correct Answer:</strong> ${escapeHtml(q.options[q.answerIndex])}
                  </p>
                  <p class="muted small">${escapeHtml(q.explanation)}</p>
                </article>`;
            })
            .join('')}
        </div>
      </div>
    `;

    root.querySelector('#btn-oir-again').addEventListener('click', renderConfig);
  }

  renderConfig();
}

// ==================== PPDT SIMULATOR ====================
function mountPpdtSimulator(root, ctx, timer, recorder) {
  let customScenes = [];
  let selectedSceneIdx = 0;
  let hazeLevel = 68;
  let practiceMode = 'digital'; // 'digital' | 'paper'
  let ppdtRun = null;

  function getScenePool() {
    return customScenes.length > 0 ? customScenes : PPDT_SCENES;
  }

  function renderSetup() {
    timer.stop();
    const pool = getScenePool();
    const current = pool[selectedSceneIdx] || pool[0];

    root.innerHTML = `
      <div class="two-col">
        <div class="panel">
          <div class="panel-head">
            <h3>PPDT Hall Configuration</h3>
            <span class="badge">30s View → 1m Box &amp; Action → 4m Story → 1m Narration</span>
          </div>

          <div class="form-row">
            <label class="field">
              <span>Select Scene (${customScenes.length > 0 ? 'Custom Pack' : 'Built-in Ambiguous Scenes'})</span>
              <select id="ppdt-scene-select">
                ${pool.map((s, idx) => `<option value="${idx}" ${idx === selectedSceneIdx ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
              </select>
            </label>

            <label class="field">
              <span>Practice Mode</span>
              <select id="ppdt-mode-select">
                <option value="digital" ${practiceMode === 'digital' ? 'selected' : ''}>Digital Type &amp; Self-Audit (Saves Story)</option>
                <option value="paper" ${practiceMode === 'paper' ? 'selected' : ''}>Pen &amp; Paper Projector (Real A4 Sheet + Chimes)</option>
              </select>
            </label>
          </div>

          <label class="field">
            <span>Projector Haze / Ambiguity: <strong id="haze-val">${hazeLevel}%</strong></span>
            <input id="ppdt-haze" type="range" min="0" max="90" value="${hazeLevel}" />
          </label>

          <div class="action-bar">
            <button id="btn-start-ppdt" class="btn btn-primary" type="button">Start Authentic 30s Exposure</button>
            <label class="btn btn-ghost btn-sm file-btn">
              Load Own PPDT Image(s)
              <input id="ppdt-upload" type="file" accept="image/*" multiple hidden />
            </label>
            ${customScenes.length > 0 ? '<button id="btn-reset-custom-ppdt" class="btn btn-ghost btn-xs" type="button">Use Built-In Scenes</button>' : ''}
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h3>Scene Preview (Hidden Once Test Starts)</h3>
            <span class="muted small">Adjust haze before launching</span>
          </div>
          <canvas id="ppdt-preview-canvas" width="560" height="330" class="scene-canvas"></canvas>
        </div>
      </div>
    `;

    const canvas = root.querySelector('#ppdt-preview-canvas');
    renderSsbScene(canvas, {
      blueprint: current.blueprint,
      imageEl: current.imageEl || null,
      hazeLevel,
    });

    root.querySelector('#ppdt-scene-select').addEventListener('change', (ev) => {
      selectedSceneIdx = Number(ev.target.value);
      const next = getScenePool()[selectedSceneIdx];
      renderSsbScene(canvas, { blueprint: next.blueprint, imageEl: next.imageEl || null, hazeLevel });
    });

    root.querySelector('#ppdt-mode-select').addEventListener('change', (ev) => {
      practiceMode = ev.target.value;
    });

    root.querySelector('#ppdt-haze').addEventListener('input', (ev) => {
      hazeLevel = Number(ev.target.value);
      root.querySelector('#haze-val').textContent = `${hazeLevel}%`;
      const cur = getScenePool()[selectedSceneIdx];
      renderSsbScene(canvas, { blueprint: cur.blueprint, imageEl: cur.imageEl || null, hazeLevel });
    });

    root.querySelector('#ppdt-upload').addEventListener('change', async (ev) => {
      const loaded = await loadLocalImages(ev.target.files);
      if (loaded.length > 0) {
        customScenes = loaded.map((item, i) => ({
          id: `custom-ppdt-${i}`,
          label: `Custom: ${item.label}`,
          imageEl: item.imageEl,
          expectedHint: 'Custom local scene',
          themes: [],
          avoidTrap: '',
        }));
        selectedSceneIdx = 0;
        renderSetup();
      }
    });

    const resetBtn = root.querySelector('#btn-reset-custom-ppdt');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        customScenes = [];
        selectedSceneIdx = 0;
        renderSetup();
      });
    }

    root.querySelector('#btn-start-ppdt').addEventListener('click', () => {
      const scene = getScenePool()[selectedSceneIdx];
      ppdtRun = {
        scene,
        phase: 'view', // view (30s) -> box (60s) -> story (240s) -> narrate (60s) -> review
        phaseDuration: 30,
        phaseStart: Date.now(),
        characters: [
          { age: '', sex: 'M', mood: '+' },
          { age: '', sex: 'M', mood: '+' },
        ],
        actionLine: '',
        storyText: '',
        narrationSec: 0,
        narrationAudioUrl: null,
        micStatus: '',
      };
      playCue('start', ctx.state.muted);
      renderActivePhase();
    });
  }

  function startPhaseTimer(durationSec, onComplete) {
    ppdtRun.phaseDuration = durationSec;
    ppdtRun.phaseStart = Date.now();
    timer.start(() => {
      const elapsed = Math.floor((Date.now() - ppdtRun.phaseStart) / 1000);
      const rem = Math.max(0, durationSec - elapsed);
      const el = root.querySelector('#ppdt-clock');
      const bar = root.querySelector('#ppdt-progress');
      if (el) {
        el.textContent = formatTime(rem);
        el.classList.toggle('danger', rem <= 10);
      }
      if (bar) {
        bar.style.width = `${Math.max(0, (rem / durationSec) * 100)}%`;
      }
      if (rem <= 0) {
        timer.stop();
        onComplete();
      }
    }, 200);
  }

  function renderActivePhase() {
    if (!ppdtRun) return;
    timer.stop();

    if (ppdtRun.phase === 'view') {
      root.innerHTML = `
        <div class="panel focus-stage">
          <div class="test-topbar">
            <span class="badge">PHASE 1 / 4 — OBSERVATION ONLY (DO NOT WRITE YET)</span>
            <div class="timer-readout" id="ppdt-clock">00:30</div>
            <button id="btn-ppdt-abort" class="btn btn-ghost btn-xs" type="button">Cancel</button>
          </div>
          <div class="progress-track"><div id="ppdt-progress" class="progress-fill" style="width:100%"></div></div>
          <canvas id="ppdt-live-canvas" width="760" height="440" class="scene-canvas large"></canvas>
          <p class="muted small center">Observe number of characters, approximate ages, gender, mood (+ / - / 0), background setting, and exact crisis/task.</p>
        </div>
      `;
      renderSsbScene(root.querySelector('#ppdt-live-canvas'), {
        blueprint: ppdtRun.scene.blueprint,
        imageEl: ppdtRun.scene.imageEl || null,
        hazeLevel,
      });
      root.querySelector('#btn-ppdt-abort').addEventListener('click', renderSetup);
      startPhaseTimer(30, () => {
        playCue('transition', ctx.state.muted);
        ppdtRun.phase = 'box';
        renderActivePhase();
      });
      return;
    }

    if (ppdtRun.phase === 'box') {
      root.innerHTML = `
        <div class="panel focus-stage">
          <div class="test-topbar">
            <span class="badge">PHASE 2 / 4 — BOX CHARACTERS &amp; ACTION LINE (IMAGE HIDDEN)</span>
            <div class="timer-readout" id="ppdt-clock">01:00</div>
            <button id="btn-ppdt-skip-box" class="btn btn-ghost btn-xs" type="button">Next Phase →</button>
          </div>
          <div class="progress-track"><div id="ppdt-progress" class="progress-fill" style="width:100%"></div></div>

          ${
            practiceMode === 'paper'
              ? `<div class="projector-notice"><h3>Mark Box &amp; Write Action on Your A4 Sheet</h3><p class="muted">Draw the box in top-left corner, circle your main character (Age, Sex, Mood + / - / 0), and write the 1-line Action.</p></div>`
              : `
              <div class="box-builder">
                <div class="panel-head">
                  <h4>Characters Marked (Circle Hero = #1)</h4>
                  <button id="btn-add-char" class="btn btn-ghost btn-xs" type="button">+ Add Character</button>
                </div>
                <div id="char-rows" class="char-rows"></div>
                <label class="field">
                  <span>Action of Your Story (1 crisp line, e.g., "Coordinating boat evacuation during rising flood")</span>
                  <input id="ppdt-action-input" type="text" value="${escapeHtml(ppdtRun.actionLine)}" placeholder="Enter concise action..." />
                </label>
              </div>`
          }
        </div>
      `;

      if (practiceMode === 'digital') {
        const renderCharRows = () => {
          const holder = root.querySelector('#char-rows');
          holder.innerHTML = ppdtRun.characters
            .map(
              (c, idx) => `
              <div class="char-row">
                <span class="badge">${idx === 0 ? 'Hero #1' : `Char #${idx + 1}`}</span>
                <input type="number" min="5" max="90" placeholder="Age" data-cidx="${idx}" data-cf="age" value="${escapeHtml(c.age)}" />
                <select data-cidx="${idx}" data-cf="sex">
                  <option value="M" ${c.sex === 'M' ? 'selected' : ''}>M</option>
                  <option value="F" ${c.sex === 'F' ? 'selected' : ''}>F</option>
                  <option value="P" ${c.sex === 'P' ? 'selected' : ''}>P (Unclear)</option>
                </select>
                <select data-cidx="${idx}" data-cf="mood">
                  <option value="+" ${c.mood === '+' ? 'selected' : ''}>+ Positive</option>
                  <option value="0" ${c.mood === '0' ? 'selected' : ''}>0 Neutral</option>
                  <option value="-" ${c.mood === '-' ? 'selected' : ''}>- Negative</option>
                </select>
              </div>`
            )
            .join('');
          holder.querySelectorAll('[data-cidx]').forEach((el) => {
            el.addEventListener('change', () => {
              ppdtRun.characters[Number(el.dataset.cidx)][el.dataset.cf] = el.value;
            });
          });
        };
        renderCharRows();
        root.querySelector('#btn-add-char').addEventListener('click', () => {
          if (ppdtRun.characters.length < 8) {
            ppdtRun.characters.push({ age: '', sex: 'M', mood: '+' });
            renderCharRows();
          }
        });
        root.querySelector('#ppdt-action-input').addEventListener('input', (ev) => {
          ppdtRun.actionLine = ev.target.value;
        });
      }

      const advanceToStory = () => {
        playCue('transition', ctx.state.muted);
        ppdtRun.phase = 'story';
        renderActivePhase();
      };
      root.querySelector('#btn-ppdt-skip-box').addEventListener('click', advanceToStory);
      startPhaseTimer(60, advanceToStory);
      return;
    }

    if (ppdtRun.phase === 'story') {
      root.innerHTML = `
        <div class="panel focus-stage">
          <div class="test-topbar">
            <span class="badge">PHASE 3 / 4 — WRITE STORY (4 MINUTES)</span>
            <div class="timer-readout" id="ppdt-clock">04:00</div>
            <button id="btn-ppdt-finish-story" class="btn btn-primary btn-xs" type="button">Submit Story Early →</button>
          </div>
          <div class="progress-track"><div id="ppdt-progress" class="progress-fill" style="width:100%"></div></div>
          ${
            practiceMode === 'paper'
              ? `<div class="projector-notice"><h3>Write Full PPDT Story on Paper</h3><p class="muted">Cover: (1) What led to the situation → (2) Concrete actions by your hero → (3) Positive realistic outcome.</p></div>`
              : `
              <div class="story-meta">
                <span>Action: <strong>${escapeHtml(ppdtRun.actionLine || 'Not entered')}</strong></span>
                <span id="ppdt-wc" class="mono">0 words (Target: 85–125)</span>
              </div>
              <textarea id="ppdt-story-box" class="story-textarea" rows="11" placeholder="Name your main character (e.g., Arjun, 22, final-year NCC cadet...). Cover Past trigger → Present step-by-step execution → Positive closure.">${escapeHtml(ppdtRun.storyText)}</textarea>`
          }
        </div>
      `;

      if (practiceMode === 'digital') {
        const box = root.querySelector('#ppdt-story-box');
        const wcEl = root.querySelector('#ppdt-wc');
        box.focus();
        box.addEventListener('input', () => {
          ppdtRun.storyText = box.value;
          const wc = box.value.trim() ? box.value.trim().split(/\s+/).length : 0;
          wcEl.textContent = `${wc} words (Target: 85–125)`;
        });
      }

      const advanceToNarrate = () => {
        playCue('cutoff', ctx.state.muted);
        ppdtRun.phase = 'narrate';
        renderActivePhase();
      };
      root.querySelector('#btn-ppdt-finish-story').addEventListener('click', advanceToNarrate);
      startPhaseTimer(240, advanceToNarrate);
      return;
    }

    if (ppdtRun.phase === 'narrate') {
      let narrating = false;
      let narrStart = 0;

      root.innerHTML = `
        <div class="panel focus-stage">
          <div class="test-topbar">
            <span class="badge">PHASE 4 / 4 — 1-MINUTE INDIVIDUAL NARRATION PRACTICE</span>
            <div class="timer-readout" id="ppdt-clock">01:00</div>
            <button id="btn-ppdt-to-review" class="btn btn-ghost btn-xs" type="button">Skip to Review</button>
          </div>
          <div class="progress-track"><div id="ppdt-progress" class="progress-fill" style="width:100%"></div></div>

          <div class="narration-box">
            <h3>Speak Out Loud Without Reading Word-for-Word</h3>
            <p class="muted">Real PPDT narration target: <strong>45–55 seconds</strong> covering perception (characters + mood + action) in 10s and story clearly in 40s.</p>
            <div class="action-bar center">
              <button id="btn-narr-start" class="btn btn-primary" type="button">Start 60s Narration + Mic Record</button>
              <button id="btn-narr-stop" class="btn btn-danger hidden" type="button">Stop &amp; Hear Playback</button>
            </div>
            <p id="narr-status" class="muted small center">Hit Start when ready to address the imaginary group.</p>
          </div>
        </div>
      `;

      const startBtn = root.querySelector('#btn-narr-start');
      const stopBtn = root.querySelector('#btn-narr-stop');
      const statusEl = root.querySelector('#narr-status');

      const finishNarration = async () => {
        if (!narrating) return;
        narrating = false;
        timer.stop();
        playCue('cutoff', ctx.state.muted);
        const rec = await recorder.stop();
        ppdtRun.narrationSec = rec.ok
          ? rec.durationSec
          : Math.max(1, Math.round((Date.now() - narrStart) / 1000));
        ppdtRun.narrationAudioUrl = rec.audioUrl || null;
        ppdtRun.phase = 'review';
        renderActivePhase();
      };

      startBtn.addEventListener('click', async () => {
        narrating = true;
        narrStart = Date.now();
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        const mic = await recorder.start();
        statusEl.textContent = mic.ok
          ? 'Recording live via microphone — maintain steady volume and eye contact...'
          : 'Microphone unavailable/denied — running strict 60s speaking timer...';
        playCue('start', ctx.state.muted);
        startPhaseTimer(60, finishNarration);
      });

      stopBtn.addEventListener('click', finishNarration);
      root.querySelector('#btn-ppdt-to-review').addEventListener('click', () => {
        timer.stop();
        ppdtRun.phase = 'review';
        renderActivePhase();
      });
      return;
    }

    // REVIEW PHASE
    const audit = analyzeStory(ppdtRun.storyText, 240);
    const charSummary = ppdtRun.characters
      .map((c, i) => `#${i + 1}(${c.age || '?'},${c.sex},${c.mood})`)
      .join(' ');

    recordHistoryEntry(ctx.state, 'ppdt', {
      sceneLabel: ppdtRun.scene.label,
      characters: charSummary,
      action: ppdtRun.actionLine,
      story: ppdtRun.storyText,
      wordCount: audit.wordCount,
      narrationSec: ppdtRun.narrationSec,
    });

    const pacingVerdict =
      ppdtRun.narrationSec === 0
        ? 'Skipped'
        : ppdtRun.narrationSec >= 40 && ppdtRun.narrationSec <= 58
          ? `Ideal (${ppdtRun.narrationSec}s — right in 40–58s sweet spot!)`
          : ppdtRun.narrationSec < 40
            ? `Too Short (${ppdtRun.narrationSec}s — add concrete execution steps)`
            : `Overtime Risk (${ppdtRun.narrationSec}s — tighten phrasing to finish under 55s)`;

    root.innerHTML = `
      <div class="two-col">
        <div class="panel">
          <div class="panel-head">
            <h3>PPDT Post-Test Audit</h3>
            <button id="btn-ppdt-new" class="btn btn-primary btn-sm" type="button">Practice Another Scene</button>
          </div>

          <canvas id="ppdt-review-canvas" width="520" height="300" class="scene-canvas"></canvas>

          <div class="kpi-grid">
            <div class="kpi-card"><span class="kpi-label">Word Count</span><strong class="kpi-val">${audit.wordCount}</strong><span class="kpi-sub">${escapeHtml(audit.verdict)}</span></div>
            <div class="kpi-card"><span class="kpi-label">Narration Pace</span><strong class="kpi-val">${ppdtRun.narrationSec || '—'}s</strong><span class="kpi-sub">${escapeHtml(pacingVerdict)}</span></div>
          </div>

          ${
            ppdtRun.narrationAudioUrl
              ? `<div class="audio-playback"><label class="small muted">Listen to your 1-min Narration:</label><audio controls src="${ppdtRun.narrationAudioUrl}"></audio></div>`
              : ''
          }

          ${
            ppdtRun.storyText
              ? `<div class="story-preview-box"><strong>Your Written Story:</strong><p>${escapeHtml(ppdtRun.storyText)}</p></div>`
              : `<p class="muted">Completed in Pen &amp; Paper mode. Inspect the scene clearly above against your A4 sheet.</p>`
          }
        </div>

        <div class="panel">
          <h3>Diagnostic Flags &amp; Scene Possibilities</h3>
          ${
            audit.flags.length > 0
              ? `<ul class="flag-list">${audit.flags.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
              : `<p class="status-pill ok">Good story arc, length, and protagonist agency!</p>`
          }
          <div class="hint-block">
            <h4>Scene Reference</h4>
            <p class="small"><strong>Observation hint:</strong> ${escapeHtml(ppdtRun.scene.expectedHint)}</p>
            ${
              ppdtRun.scene.themes?.length
                ? `<p class="small"><strong>Viable Practical Themes:</strong></p><ul class="small">${ppdtRun.scene.themes.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
                : ''
            }
            ${
              ppdtRun.scene.avoidTrap
                ? `<p class="small warn-text"><strong>Common Trap:</strong> ${escapeHtml(ppdtRun.scene.avoidTrap)}</p>`
                : ''
            }
          </div>
        </div>
      </div>
    `;

    // Show clear scene during review (hazeLevel = 15) so aspirant can verify perception!
    renderSsbScene(root.querySelector('#ppdt-review-canvas'), {
      blueprint: ppdtRun.scene.blueprint,
      imageEl: ppdtRun.scene.imageEl || null,
      hazeLevel: 15,
    });

    root.querySelector('#btn-ppdt-new').addEventListener('click', renderSetup);
  }

  renderSetup();
}
