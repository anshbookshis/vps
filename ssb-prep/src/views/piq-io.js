/**
 * PIQ Form Builder, Dynamic IO Cross-Question Generator, and CIQ Rapid-Fire Voice Simulator.
 */

import { ENTRY_TYPES, CIQ_CLUSTERS } from '../data/piq-interview-bank.js';
import { analyzePiqAndGenerateIoQuestions } from '../engines/piq-analyzer.js';
import { saveState } from '../engines/storage.js';
import { playCue, createVoiceRecorder } from '../engines/audio-cues.js';
import { escapeHtml, formatTime, TimerHandle } from './ui-helpers.js';

export function renderPiqIoView(container, ctx) {
  const timer = new TimerHandle();
  const recorder = createVoiceRecorder();
  let activeSub = 'grill'; // 'grill' | 'ciq'
  let activeCiqId = CIQ_CLUSTERS[0].id;
  let ciqRecording = false;
  let ciqStart = 0;
  let ciqPlayback = null;

  function cleanup() {
    timer.stop();
    recorder.dispose();
  }

  function render() {
    cleanup();
    const p = ctx.state.piq;
    const analysis = analyzePiqAndGenerateIoQuestions(p);

    container.innerHTML = `
      <div class="view-header">
        <div>
          <p class="eyebrow">PERSONAL INFORMATION QUESTIONNAIRE &amp; PERSONAL INTERVIEW</p>
          <h2>PIQ Builder → Personalized IO Cross-Questioner</h2>
          <p class="muted">80% of the IO’s 45-minute interview comes straight from your PIQ. Fill yours accurately to uncover exact red flags &amp; cross-questions.</p>
        </div>
        <div class="segmented">
          <button class="seg-btn ${activeSub === 'grill' ? 'active' : ''}" data-sub="grill" type="button">Dynamic IO Grill</button>
          <button class="seg-btn ${activeSub === 'ciq' ? 'active' : ''}" data-sub="ciq" type="button">CIQ Rapid-Fire Booth</button>
        </div>
      </div>

      <div class="two-col wide-split">
        <!-- LEFT: INTERACTIVE PIQ FORM -->
        <section class="panel">
          <div class="panel-head">
            <h3>Your PIQ Details</h3>
            <span class="badge" id="piq-comp-badge">${analysis.completenessPct}% Complete</span>
          </div>

          <div class="form-grid">
            <label class="field">
              <span>Full Name</span>
              <input data-piq="fullName" type="text" value="${escapeHtml(p.fullName)}" placeholder="e.g. Aditya Sharma" />
            </label>
            <label class="field">
              <span>Target Entry</span>
              <select data-piq="entryType">
                ${ENTRY_TYPES.map((e) => `<option value="${escapeHtml(e)}" ${p.entryType === e ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span>Hometown &amp; State</span>
              <input data-piq="hometown" type="text" value="${escapeHtml(p.hometown)}" placeholder="e.g. Dehradun, Uttarakhand" />
            </label>
            <label class="field">
              <span>Father's Occupation</span>
              <input data-piq="fatherOcc" type="text" value="${escapeHtml(p.fatherOcc)}" placeholder="e.g. State Electricity Technician" />
            </label>
            <label class="field">
              <span>Mother's Occupation</span>
              <input data-piq="motherOcc" type="text" value="${escapeHtml(p.motherOcc)}" placeholder="e.g. Homemaker / School Teacher" />
            </label>
            <label class="field">
              <span>Siblings (Age / Doing What)</span>
              <input data-piq="siblings" type="text" value="${escapeHtml(p.siblings)}" placeholder="e.g. Younger sister (Class 11)" />
            </label>

            <label class="field">
              <span>10th % / CGPA*10</span>
              <input data-piq="tenthPct" type="number" step="0.1" min="0" max="100" value="${escapeHtml(p.tenthPct)}" placeholder="e.g. 91.4" />
            </label>
            <label class="field">
              <span>12th %</span>
              <input data-piq="twelfthPct" type="number" step="0.1" min="0" max="100" value="${escapeHtml(p.twelfthPct)}" placeholder="e.g. 82.0" />
            </label>
            <label class="field">
              <span>Graduation % (if any)</span>
              <input data-piq="gradPct" type="number" step="0.1" min="0" max="100" value="${escapeHtml(p.gradPct)}" placeholder="e.g. 76.5" />
            </label>
            <label class="field">
              <span>Degree / Stream</span>
              <input data-piq="stream" type="text" value="${escapeHtml(p.stream)}" placeholder="e.g. B.Tech Mechanical" />
            </label>
            <label class="field">
              <span>Gap Years</span>
              <input data-piq="gapYears" type="number" min="0" max="10" value="${escapeHtml(p.gapYears)}" />
            </label>
            <label class="field">
              <span>Prior SSB Attempts</span>
              <input data-piq="attempts" type="number" min="0" max="20" value="${escapeHtml(p.attempts)}" />
            </label>
          </div>

          <label class="field">
            <span>Prior Attempt Outcomes (if attempts &gt; 0)</span>
            <input data-piq="attemptOutcome" type="text" value="${escapeHtml(p.attemptOutcome)}" placeholder="e.g. 1 Screen Out (Bhopal), 1 Conference Out (Allahabad)" />
          </label>
          <label class="field">
            <span>Hobbies &amp; Interests (Comma-separated)</span>
            <input data-piq="hobbies" type="text" value="${escapeHtml(p.hobbies)}" placeholder="e.g. Chess, Reading geopolitics, Coding" />
          </label>
          <label class="field">
            <span>Games &amp; Sports Played</span>
            <input data-piq="sports" type="text" value="${escapeHtml(p.sports)}" placeholder="e.g. Football, 5km Running, Badminton" />
          </label>
          <label class="field">
            <span>Positions of Responsibility (PORs)</span>
            <input data-piq="pors" type="text" value="${escapeHtml(p.pors)}" placeholder="e.g. College Hostel Secretary, Cricket Team Captain" />
          </label>
          <label class="field">
            <span>NCC / NSS / Achievements</span>
            <input data-piq="ncc" type="text" value="${escapeHtml(p.ncc)}" placeholder="e.g. NCC C-Certificate (SUO), State Half-Marathon" />
          </label>
        </section>

        <!-- RIGHT: DYNAMIC IO GRILL OR CIQ SIMULATOR -->
        <section class="panel" id="piq-right-pane"></section>
      </div>
    `;

    container.querySelectorAll('[data-sub]').forEach((b) => {
      b.addEventListener('click', () => {
        activeSub = b.dataset.sub;
        render();
      });
    });

    container.querySelectorAll('[data-piq]').forEach((input) => {
      const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        ctx.state.piq[input.dataset.piq] = input.value;
        saveState(ctx.state);
        renderRightPane();
      });
    });

    renderRightPane();
  }

  function renderRightPane() {
    const rightEl = container.querySelector('#piq-right-pane');
    const analysis = analyzePiqAndGenerateIoQuestions(ctx.state.piq);
    const badge = container.querySelector('#piq-comp-badge');
    if (badge) badge.textContent = `${analysis.completenessPct}% Complete`;

    if (activeSub === 'grill') {
      rightEl.innerHTML = `
        <div class="panel-head">
          <h3>Live IO Red Flags &amp; Tailored Questions</h3>
          <span class="badge">${analysis.redFlags.length} Flag(s)</span>
        </div>

        ${
          analysis.redFlags.length
            ? `<div class="alert-box"><strong>Likely IO Probes / Weak Spots:</strong><ul class="flag-list small">${analysis.redFlags.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul></div>`
            : `<p class="status-pill ok small">Solid baseline PIQ completeness — zero structural red flags detected.</p>`
        }

        <div class="question-groups">
          ${analysis.questionGroups
            .map(
              (grp) => `
            <article class="q-group">
              <h4>${escapeHtml(grp.category)}</h4>
              <ol>
                ${grp.questions.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}
              </ol>
            </article>`
            )
            .join('')}
        </div>
      `;
      return;
    }

    // CIQ RAPID-FIRE SIMULATOR
    const ciq = CIQ_CLUSTERS.find((c) => c.id === activeCiqId) || CIQ_CLUSTERS[0];
    rightEl.innerHTML = `
      <div class="panel-head">
        <h3>CIQ (Comprehensive Information Question) Simulator</h3>
        <span class="badge">Target: ${formatTime(ciq.targetSeconds)}</span>
      </div>

      <label class="field">
        <span>Select Rapid-Fire Cluster</span>
        <select id="ciq-select">
          ${CIQ_CLUSTERS.map((c) => `<option value="${c.id}" ${c.id === ciq.id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('')}
        </select>
      </label>

      <blockquote class="io-quote">
        "${escapeHtml(ciq.prompt)}"
      </blockquote>

      <div class="ciq-controls">
        <div class="timer-readout" id="ciq-clock">${formatTime(ciq.targetSeconds)}</div>
        <button id="btn-ciq-rec" class="btn ${ciqRecording ? 'btn-danger' : 'btn-primary'}" type="button">
          ${ciqRecording ? 'Stop &amp; Check Coverage' : 'Start Rapid-Fire Answer + Mic'}
        </button>
      </div>

      ${
        ciqPlayback
          ? `<div class="audio-playback"><label class="small muted">Last Recorded CIQ Response (${ciqPlayback.durationSec}s):</label><audio controls src="${ciqPlayback.url}"></audio></div>`
          : ''
      }

      <div class="subq-checklist">
        <h4>Did You Remember Every Sub-Part in Sequence? (Click to Check Off)</h4>
        ${ciq.subQuestions
          .map(
            (sq, idx) => `
          <label class="check-item">
            <input type="checkbox" />
            <span>${idx + 1}. ${escapeHtml(sq)}</span>
          </label>`
          )
          .join('')}
      </div>
    `;

    rightEl.querySelector('#ciq-select').addEventListener('change', (ev) => {
      activeCiqId = ev.target.value;
      ciqPlayback = null;
      renderRightPane();
    });

    rightEl.querySelector('#btn-ciq-rec').addEventListener('click', async () => {
      if (!ciqRecording) {
        ciqRecording = true;
        ciqStart = Date.now();
        ciqPlayback = null;
        await recorder.start();
        playCue('start', ctx.state.muted);
        renderRightPane();
        timer.start(() => {
          const rem = Math.max(0, ciq.targetSeconds - Math.floor((Date.now() - ciqStart) / 1000));
          const clk = rightEl.querySelector('#ciq-clock');
          if (clk) clk.textContent = formatTime(rem);
          if (rem <= 0) {
            rightEl.querySelector('#btn-ciq-rec')?.click();
          }
        }, 250);
      } else {
        ciqRecording = false;
        timer.stop();
        playCue('cutoff', ctx.state.muted);
        const rec = await recorder.stop();
        if (rec.ok) {
          ciqPlayback = { url: rec.audioUrl, durationSec: rec.durationSec };
        }
        renderRightPane();
      }
    });
  }

  render();
  return cleanup;
}
