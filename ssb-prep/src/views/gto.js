/**
 * Days 3–4 GTO Toolkit:
 * - Lecturette Booth (4-Topic Card, 3m Prep + 3m Mic-Recorded Speech with 2:30 warning)
 * - GPE (Group Planning Exercise) Interactive Tactical Map + Distance-Speed-Time Calculator + Manpower Auditor
 * - GD (Group Discussion) Balanced Leads
 */

import { LECTURETTE_CARDS, GPE_SCENARIOS, GD_TOPICS } from '../data/gto-bank.js';
import { computeTravelTimeMinutes, addMinutesToTime, auditGpePlan } from '../engines/gpe-calculator.js';
import { playCue, createVoiceRecorder } from '../engines/audio-cues.js';
import { recordHistoryEntry } from '../engines/storage.js';
import { escapeHtml, formatTime, TimerHandle } from './ui-helpers.js';

export function renderGtoView(container, ctx, initialTab = 'lecturette') {
  let activeTab = ['lecturette', 'gpe', 'gd'].includes(initialTab) ? initialTab : 'lecturette';
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
          <p class="eyebrow">DAYS 3 &amp; 4 • GTO TASKS</p>
          <h2>Lecturette Booth, GPE Tactical Map &amp; GD Lab</h2>
          <p class="muted">Sharpen 3-minute structured extempore speaking and rapid distance-time-resource planning.</p>
        </div>
        <div class="segmented">
          <button class="seg-btn ${activeTab === 'lecturette' ? 'active' : ''}" data-tab="lecturette" type="button">Lecturette (3m+3m)</button>
          <button class="seg-btn ${activeTab === 'gpe' ? 'active' : ''}" data-tab="gpe" type="button">GPE Map &amp; Calc</button>
          <button class="seg-btn ${activeTab === 'gd' ? 'active' : ''}" data-tab="gd" type="button">GD Prompts</button>
        </div>
      </div>
      <div id="gto-body"></div>
    `;

    container.querySelectorAll('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        activeTab = b.dataset.tab;
        renderShell();
      });
    });

    const bodyEl = container.querySelector('#gto-body');
    if (activeTab === 'lecturette') mountLecturette(bodyEl, ctx, timer, recorder);
    else if (activeTab === 'gpe') mountGpe(bodyEl, ctx, timer);
    else mountGd(bodyEl);
  }

  renderShell();
  return cleanup;
}

// ==================== LECTURETTE BOOTH ====================
function mountLecturette(root, ctx, timer, recorder) {
  let cardIndex = 0;
  let selectedTopicIdx = 0;
  let phase = 'idle'; // 'idle' | 'prep' | 'speak' | 'done'
  let notes = '';
  let speechAudioUrl = null;
  let speechSec = 0;
  let warningPlayed = false;

  function render() {
    timer.stop();
    const card = LECTURETTE_CARDS[cardIndex];
    const topic = card.topics[selectedTopicIdx];

    if (phase === 'idle') {
      root.innerHTML = `
        <div class="panel">
          <div class="panel-head">
            <h3>Draw a 4-Topic Lecturette Card</h3>
            <div class="meta-group">
              <select id="lec-card-select">
                ${LECTURETTE_CARDS.map((c, i) => `<option value="${i}" ${i === cardIndex ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('')}
              </select>
              <button id="btn-lec-random" class="btn btn-ghost btn-sm" type="button">Draw Random Card</button>
            </div>
          </div>

          <div class="topic-card-grid">
            ${card.topics
              .map(
                (t, i) => `
              <button class="topic-pick ${i === selectedTopicIdx ? 'selected' : ''}" data-tidx="${i}" type="button">
                <span class="badge">${escapeHtml(t.level)}</span>
                <strong>${escapeHtml(t.name)}</strong>
              </button>`
              )
              .join('')}
          </div>

          <div class="action-bar">
            <button id="btn-lec-start" class="btn btn-primary" type="button">Start 3:00 Prep Timer for Selected Topic</button>
          </div>
        </div>
      `;

      root.querySelector('#lec-card-select').addEventListener('change', (ev) => {
        cardIndex = Number(ev.target.value);
        selectedTopicIdx = 0;
        render();
      });
      root.querySelector('#btn-lec-random').addEventListener('click', () => {
        cardIndex = Math.floor(Math.random() * LECTURETTE_CARDS.length);
        selectedTopicIdx = 0;
        render();
      });
      root.querySelectorAll('[data-tidx]').forEach((b) => {
        b.addEventListener('click', () => {
          selectedTopicIdx = Number(b.dataset.tidx);
          render();
        });
      });
      root.querySelector('#btn-lec-start').addEventListener('click', () => {
        notes = '';
        speechAudioUrl = null;
        speechSec = 0;
        phase = 'prep';
        playCue('start', ctx.state.muted);
        render();
      });
      return;
    }

    if (phase === 'prep') {
      const startTs = Date.now();
      root.innerHTML = `
        <div class="panel focus-stage">
          <div class="test-topbar">
            <span class="badge">PREP PHASE (3:00) — ${escapeHtml(topic.name)}</span>
            <div class="timer-readout" id="lec-clock">03:00</div>
            <button id="btn-lec-to-speak" class="btn btn-primary btn-sm" type="button">Ready to Speak Now →</button>
          </div>
          <div class="progress-track"><div id="lec-progress" class="progress-fill" style="width:100%"></div></div>

          <div class="two-col">
            <label class="field">
              <span>Quick Bullet Scratchpad (Outline Only — Do Not Write Full Paragraphs!)</span>
              <textarea id="lec-notes" rows="9" placeholder="1. Hook / Definition&#10;2. Present reality & 2 data points&#10;3. Challenges&#10;4. Actionable way forward">${escapeHtml(notes)}</textarea>
            </label>

            <details class="panel-sub" open>
              <summary>Optional Structural Scaffold (Hidden during speech)</summary>
              <ul class="small">
                ${topic.points.map((pt) => `<li>${escapeHtml(pt)}</li>`).join('')}
              </ul>
            </details>
          </div>
        </div>
      `;

      root.querySelector('#lec-notes').addEventListener('input', (ev) => {
        notes = ev.target.value;
      });

      const goSpeak = async () => {
        timer.stop();
        phase = 'speak';
        warningPlayed = false;
        await recorder.start();
        playCue('transition', ctx.state.muted);
        render();
      };

      root.querySelector('#btn-lec-to-speak').addEventListener('click', goSpeak);
      timer.start(() => {
        const rem = Math.max(0, 180 - Math.floor((Date.now() - startTs) / 1000));
        const clk = root.querySelector('#lec-clock');
        const bar = root.querySelector('#lec-progress');
        if (clk) clk.textContent = formatTime(rem);
        if (bar) bar.style.width = `${(rem / 180) * 100}%`;
        if (rem <= 0) goSpeak();
      }, 250);
      return;
    }

    if (phase === 'speak') {
      const startTs = Date.now();
      root.innerHTML = `
        <div class="panel focus-stage">
          <div class="test-topbar">
            <span class="badge">DELIVERY (3:00 • GTO BELL AT 2:30) — ${escapeHtml(topic.name)}</span>
            <div class="timer-readout" id="lec-clock">03:00</div>
            <button id="btn-lec-stop" class="btn btn-danger btn-sm" type="button">Finish Speech</button>
          </div>
          <div class="progress-track"><div id="lec-progress" class="progress-fill" style="width:100%"></div></div>
          <div class="narration-box">
            <h3>Deliver Standing Up with Steady Eye Contact</h3>
            <p class="muted">Remember: GTO taps softly at <strong>2:30 (00:30 left)</strong> — use the final 30s to wrap up smoothly with a crisp conclusion.</p>
            <div id="lec-warn-banner" class="badge hidden">2:30 REACHED — BEGIN CONCLUSION!</div>
          </div>
        </div>
      `;

      const finishSpeech = async () => {
        timer.stop();
        playCue('cutoff', ctx.state.muted);
        const rec = await recorder.stop();
        speechSec = rec.ok ? rec.durationSec : Math.max(1, Math.round((Date.now() - startTs) / 1000));
        speechAudioUrl = rec.audioUrl || null;
        recordHistoryEntry(ctx.state, 'lecturette', { topic: topic.name, durationSec: speechSec });
        phase = 'done';
        render();
      };

      root.querySelector('#btn-lec-stop').addEventListener('click', finishSpeech);
      timer.start(() => {
        const elapsed = Math.floor((Date.now() - startTs) / 1000);
        const rem = Math.max(0, 180 - elapsed);
        const clk = root.querySelector('#lec-clock');
        const bar = root.querySelector('#lec-progress');
        if (clk) {
          clk.textContent = formatTime(rem);
          clk.classList.toggle('danger', rem <= 30);
        }
        if (bar) bar.style.width = `${(rem / 180) * 100}%`;
        if (elapsed >= 150 && !warningPlayed) {
          warningPlayed = true;
          playCue('warning', ctx.state.muted);
          root.querySelector('#lec-warn-banner')?.classList.remove('hidden');
        }
        if (rem <= 0) finishSpeech();
      }, 250);
      return;
    }

    // DONE REVIEW
    const pacingNote =
      speechSec >= 150 && speechSec <= 185
        ? `Optimal pacing (${formatTime(speechSec)} — nailed the 2:30–3:00 SSB sweet spot!)`
        : speechSec < 150
          ? `Short by ${150 - speechSec}s — deepen body points with 1 real Indian/global case study.`
          : `Slightly over 3:00 (${formatTime(speechSec)}).`;

    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>Lecturette Review — ${escapeHtml(topic.name)}</h3>
          <button id="btn-lec-new" class="btn btn-primary btn-sm" type="button">Next Card / Topic</button>
        </div>
        <p><strong>Speaking Duration:</strong> ${formatTime(speechSec)} — <span class="muted">${escapeHtml(pacingNote)}</span></p>
        ${
          speechAudioUrl
            ? `<div class="audio-playback"><label class="small muted">Play Back Your Speech (Check pacing, pauses &amp; filler words):</label><audio controls src="${speechAudioUrl}"></audio></div>`
            : `<p class="muted small">No audio track captured (microphone unavailable or denied).</p>`
        }
        <div class="hint-block">
          <h4>Key Points Checklist</h4>
          <ul class="small">${topic.points.map((pt) => `<li>${escapeHtml(pt)}</li>`).join('')}</ul>
        </div>
      </div>
    `;
    root.querySelector('#btn-lec-new').addEventListener('click', () => {
      phase = 'idle';
      render();
    });
  }

  render();
}

// ==================== GPE TACTICAL WORKBENCH ====================
function renderGpeMapSvg(scenario) {
  const byId = Object.fromEntries(scenario.landmarks.map((l) => [l.id, l]));
  const edgeLines = scenario.edges
    .map((e) => {
      const a = byId[e.from];
      const b = byId[e.to];
      if (!a || !b) return '';
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - 6;
      const stroke = e.kind === 'road' ? '#d4a24c' : e.kind === 'river' ? '#5aa9e6' : e.kind === 'rail' ? '#a5b4fc' : '#8b95a5';
      const dash = e.kind === 'track' ? 'stroke-dasharray="6 4"' : e.kind === 'rail' ? 'stroke-dasharray="3 3"' : '';
      return `
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="3" ${dash}/>
        <text x="${mx}" y="${my}" text-anchor="middle" fill="#cbd5e1" font-size="10">${escapeHtml(e.label)}</text>
      `;
    })
    .join('');

  const nodes = scenario.landmarks
    .map(
      (l) => `
      <circle cx="${l.x}" cy="${l.y}" r="8" fill="${l.color}" stroke="#0d1117" stroke-width="2"/>
      <text x="${l.x}" y="${l.y + 20}" text-anchor="middle" fill="#f1f5f9" font-size="11" font-weight="600">${escapeHtml(l.label)}</text>
    `
    )
    .join('');

  return `
    <svg viewBox="0 0 520 275" class="gpe-svg" role="img" aria-label="GPE Tactical Map">
      <rect x="0" y="0" width="520" height="275" rx="8" fill="#10151c"/>
      <!-- Compass North -->
      <text x="492" y="24" text-anchor="middle" fill="#d4a24c" font-size="12" font-weight="bold">N ↑</text>
      ${edgeLines}
      ${nodes}
    </svg>
  `;
}

function mountGpe(root, ctx, timer) {
  let scenIndex = 0;
  let showExpert = false;
  let timerRunning = false;
  let timerStart = 0;
  let groups = [
    { name: 'Group A', cadets: 4, task: '' },
    { name: 'Group B', cadets: 2, task: '' },
    { name: 'Group C', cadets: 2, task: '' },
  ];
  let writtenPlan = '';
  let totalCadets = 8;

  function render() {
    timer.stop();
    const s = GPE_SCENARIOS[scenIndex];
    const audit = auditGpePlan({ totalCadets, groups, writtenPlan });

    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div class="meta-group">
            <select id="gpe-select">
              ${GPE_SCENARIOS.map((sc, i) => `<option value="${i}" ${i === scenIndex ? 'selected' : ''}>${escapeHtml(sc.title)}</option>`).join('')}
            </select>
            <span class="badge">${escapeHtml(s.scaleText)}</span>
          </div>
          <div class="meta-group">
            <div class="timer-readout" id="gpe-clock">10:00</div>
            <button id="btn-gpe-timer" class="btn btn-primary btn-sm" type="button">${timerRunning ? 'Reset Timer' : 'Start 10m Plan Timer'}</button>
          </div>
        </div>

        <div class="two-col">
          <div>
            ${renderGpeMapSvg(s)}
            <div class="brief-box">
              <h4>Tactical Narrative</h4>
              <p class="small">${escapeHtml(s.brief).replace(/\n/g, '<br/>')}</p>
            </div>
          </div>

          <div>
            <div class="panel-sub">
              <h4>Distance-Speed-Time Calculator</h4>
              <div class="calc-row">
                <label class="field"><span>Dist (km)</span><input id="calc-dist" type="number" step="0.5" min="0" value="8" /></label>
                <label class="field"><span>Speed (km/h)</span><input id="calc-speed" type="number" step="1" min="1" value="40" /></label>
                <label class="field"><span>Depart (HH:MM)</span><input id="calc-dep" type="text" value="09:05" /></label>
                <button id="btn-calc-time" class="btn btn-ghost btn-sm" type="button">Compute</button>
              </div>
              <p id="calc-out" class="mono small accent-text">Travel: 12 min • Arrives 09:17</p>
            </div>

            <div class="panel-sub">
              <div class="panel-head">
                <h4>Manpower &amp; Group Splitter</h4>
                <label class="small">Total Cadets: <input id="gpe-total-cadets" type="number" min="2" max="20" value="${totalCadets}" class="mini-num" /></label>
              </div>
              <div id="gpe-groups">
                ${groups
                  .map(
                    (g, i) => `
                  <div class="char-row">
                    <span class="badge">${escapeHtml(g.name)}</span>
                    <input type="number" min="0" max="20" data-gidx="${i}" data-gf="cadets" value="${g.cadets}" class="mini-num" />
                    <input type="text" data-gidx="${i}" data-gf="task" value="${escapeHtml(g.task)}" placeholder="Route, transport, objective &amp; ETA..." />
                  </div>`
                  )
                  .join('')}
              </div>
              <p class="small ${audit.warnings.length ? 'warn-text' : 'ok-text'}" id="gpe-audit-msg">
                ${audit.warnings.length ? escapeHtml(audit.warnings[0]) : `Allocated ${audit.allocated}/${audit.totalCadets} cadets cleanly.`}
              </p>
            </div>

            <label class="field">
              <span>Written Individual Plan (Priorities → Split → Timelines → Rally Point)</span>
              <textarea id="gpe-plan-text" rows="5" placeholder="Priority 1... Group A... Rally at...">${escapeHtml(writtenPlan)}</textarea>
            </label>

            <div class="action-bar">
              <button id="btn-toggle-expert" class="btn btn-ghost btn-sm" type="button">${showExpert ? 'Hide Expert Solution' : 'Compare With Expert Solution'}</button>
            </div>
          </div>
        </div>

        ${
          showExpert
            ? `
          <div class="hint-block">
            <h4>Expert GTO Solution Reference</h4>
            <p class="small"><strong>Prioritization:</strong></p>
            <ul class="small">${s.expertSolution.priorities.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
            <p class="small"><strong>Group Deployment &amp; Math:</strong></p>
            <ul class="small">${s.expertSolution.groupAllocation.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
            <p class="small ok-text"><strong>Summary:</strong> ${escapeHtml(s.expertSolution.timelineSummary)}</p>
          </div>`
            : ''
        }
      </div>
    `;

    root.querySelector('#gpe-select').addEventListener('change', (ev) => {
      scenIndex = Number(ev.target.value);
      showExpert = false;
      timerRunning = false;
      render();
    });

    root.querySelector('#btn-calc-time').addEventListener('click', () => {
      try {
        const dist = Number(root.querySelector('#calc-dist').value);
        const spd = Number(root.querySelector('#calc-speed').value);
        const dep = root.querySelector('#calc-dep').value;
        const mins = computeTravelTimeMinutes(dist, spd);
        const arr = addMinutesToTime(dep, mins);
        root.querySelector('#calc-out').textContent = `Travel: ${mins} min • Arrives ${arr}`;
      } catch (e) {
        root.querySelector('#calc-out').textContent = `Check inputs: ${e.message}`;
      }
    });

    root.querySelector('#gpe-total-cadets').addEventListener('change', (ev) => {
      totalCadets = Math.max(2, Number(ev.target.value || 8));
      refreshAuditMsg();
    });

    root.querySelectorAll('[data-gidx]').forEach((el) => {
      el.addEventListener('input', () => {
        const idx = Number(el.dataset.gidx);
        const f = el.dataset.gf;
        groups[idx][f] = f === 'cadets' ? Number(el.value || 0) : el.value;
        refreshAuditMsg();
      });
    });

    root.querySelector('#gpe-plan-text').addEventListener('input', (ev) => {
      writtenPlan = ev.target.value;
      refreshAuditMsg();
    });

    root.querySelector('#btn-toggle-expert').addEventListener('click', () => {
      showExpert = !showExpert;
      render();
    });

    root.querySelector('#btn-gpe-timer').addEventListener('click', (ev) => {
      if (timerRunning) {
        timerRunning = false;
        timer.stop();
        render();
        return;
      }
      timerRunning = true;
      timerStart = Date.now();
      ev.currentTarget.textContent = 'Reset Timer';
      playCue('start', ctx.state.muted);
      timer.start(() => {
        const rem = Math.max(0, 600 - Math.floor((Date.now() - timerStart) / 1000));
        const clk = root.querySelector('#gpe-clock');
        if (clk) {
          clk.textContent = formatTime(rem);
          clk.classList.toggle('danger', rem <= 60);
        }
        if (rem <= 0) {
          timerRunning = false;
          timer.stop();
          playCue('cutoff', ctx.state.muted);
        }
      }, 250);
    });

    function refreshAuditMsg() {
      const nextAudit = auditGpePlan({ totalCadets, groups, writtenPlan });
      const msgEl = root.querySelector('#gpe-audit-msg');
      if (!msgEl) return;
      msgEl.className = `small ${nextAudit.warnings.length ? 'warn-text' : 'ok-text'}`;
      msgEl.textContent = nextAudit.warnings.length
        ? nextAudit.warnings.join(' ')
        : `Allocated ${nextAudit.allocated}/${nextAudit.totalCadets} cadets cleanly.`;
    }
  }

  render();
}

// ==================== GD PROMPTS ====================
function mountGd(root) {
  root.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>Group Discussion (GD) Multi-Lead Cards</h3>
        <span class="badge">Practice Balanced Logical Entry &amp; Cooperative Listening</span>
      </div>
      <div class="drill-grid">
        ${GD_TOPICS.map(
          (g) => `
          <article class="drill-card">
            <div class="drill-tag">GD Topic</div>
            <h4>${escapeHtml(g.title)}</h4>
            <p class="small"><strong>Leads given by GTO:</strong></p>
            <ul class="small">
              ${g.leads.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}
            </ul>
            <p class="muted small"><strong>Strategy:</strong> ${escapeHtml(g.framingTip)}</p>
          </article>`
        ).join('')}
      </div>
    </div>
  `;
}
