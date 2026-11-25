/**
 * Command Center Dashboard: Readiness stats, daily drill launchers, OLQ reference,
 * and JSON/Markdown Dossier export/import.
 */

import { analyzePiqAndGenerateIoQuestions } from '../engines/piq-analyzer.js';
import { analyzeSelfDescription } from '../engines/psych-analyzer.js';
import { generateMarkdownDossier, saveState, createDefaultState } from '../engines/storage.js';
import { escapeHtml } from './ui-helpers.js';

const OLQ_FACTORS = [
  {
    factor: 'Factor I — Planning & Organising',
    traits: [
      'Effective Intelligence (practical problem solving in real situations)',
      'Reasoning Ability (grasping essentials logically)',
      'Organising Ability (systematic use of resources & time)',
      'Power of Expression (clear, concise verbal & written communication)',
    ],
  },
  {
    factor: 'Factor II — Social Adjustment',
    traits: [
      'Social Adaptability (adjusting smoothly with diverse people)',
      'Cooperation (team spirit above personal ego)',
      'Sense of Responsibility (owning duty without constant supervision)',
    ],
  },
  {
    factor: 'Factor III — Social Effectiveness',
    traits: [
      'Initiative (originating sensible action calmly)',
      'Self-Confidence (faith in ability under unfamiliar stress)',
      'Speed of Decision (timely workable choice without dithering)',
      'Ability to Influence the Group (persuading without bullying)',
      'Liveliness (cheerful composure during setbacks)',
    ],
  },
  {
    factor: 'Factor IV — Dynamic',
    traits: [
      'Determination (sustained effort despite hurdles)',
      'Courage (calculated physical & moral nerve)',
      'Stamina (mental & physical endurance across long tasks)',
    ],
  },
];

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderDashboardView(container, ctx) {
  const { state, navigate, setState } = ctx;
  const piqReport = analyzePiqAndGenerateIoQuestions(state.piq);
  const sdReport = analyzeSelfDescription(state.sd);
  const h = state.history;

  const latestOir = h.oir[0];
  const latestWat = h.wat[0];
  const latestSrt = h.srt[0];
  const latestPpdt = h.ppdt[0];

  container.innerHTML = `
    <div class="view-header">
      <div>
        <p class="eyebrow">5-DAY SSB TRAINING WORKBENCH</p>
        <h2>Command Center &amp; Daily Drill Planner</h2>
        <p class="muted">Offline-first authentic simulator for Stage I, Psych Battery, PIQ-linked IO Interviews, and GTO Planning.</p>
      </div>
      <div class="header-cta-group">
        <button id="btn-export-md" class="btn btn-primary" type="button">Download Mentor Dossier (.md)</button>
        <button id="btn-export-json" class="btn btn-ghost" type="button">Backup Data (.json)</button>
        <label class="btn btn-ghost file-btn">
          Restore Backup
          <input id="input-import-json" type="file" accept="application/json" hidden />
        </label>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <span class="kpi-label">PIQ Readiness</span>
        <strong class="kpi-val">${piqReport.completenessPct}%</strong>
        <span class="kpi-sub">${piqReport.redFlags.length} IO flag(s) detected</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Stage I (OIR / PPDT)</span>
        <strong class="kpi-val">${latestOir ? `${latestOir.score}/${latestOir.total}` : '—'}</strong>
        <span class="kpi-sub">${h.ppdt.length} PPDT run(s) • ${latestPpdt ? `${latestPpdt.narrationSec || 0}s narr.` : 'No narration yet'}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">WAT &amp; SRT Speed</span>
        <strong class="kpi-val">${latestWat ? `${latestWat.attempted}/${latestWat.total}` : '—'}</strong>
        <span class="kpi-sub">${latestWat ? `${latestWat.avgReactionSec}s avg WAT` : 'No WAT run'} • ${latestSrt ? `${latestSrt.attempted}/${latestSrt.total} SRT` : 'No SRT run'}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Self-Description</span>
        <strong class="kpi-val">${sdReport.completedSections}/5</strong>
        <span class="kpi-sub">${sdReport.totalWords} words saved locally</span>
      </div>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h3>Recommended Practical Drills</h3>
        <span class="badge">Pen &amp; Paper or Digital Typing Supported</span>
      </div>
      <div class="drill-grid">
        <article class="drill-card">
          <div class="drill-tag">Day 1 • Screening</div>
          <h4>PPDT Full Cycle (6m 30s)</h4>
          <p>30s hazy scene exposure → auto-hide → 1m Box &amp; Action → 4m Story → 1m Voice-Recorded Narration.</p>
          <button class="btn btn-primary btn-sm" data-nav="stage1:ppdt" type="button">Launch PPDT</button>
        </article>
        <article class="drill-card">
          <div class="drill-tag">Day 1 • Speed</div>
          <h4>OIR Verbal + Visual Drill</h4>
          <p>Timed Verbal &amp; SVG Non-Verbal puzzles (Mirror, Dice, Matrix, Spatial) with strict 30s/question pace.</p>
          <button class="btn btn-primary btn-sm" data-nav="stage1:oir" type="button">Start OIR Sprint</button>
        </article>
        <article class="drill-card">
          <div class="drill-tag">Day 2 • Psych</div>
          <h4>WAT 60 Words × 15s</h4>
          <p>Auto-advancing 15-minute projector with per-word reaction speed &amp; modal/negativity audit.</p>
          <button class="btn btn-primary btn-sm" data-nav="psych:wat" type="button">Launch WAT</button>
        </article>
        <article class="drill-card">
          <div class="drill-tag">Day 2 • Psych</div>
          <h4>TAT 11+1 Slide Battery</h4>
          <p>Authentic 30s view + 4m write loop with audio chimes. Supports your own uploaded picture folder too.</p>
          <button class="btn btn-primary btn-sm" data-nav="psych:tat" type="button">Launch TAT</button>
        </article>
        <article class="drill-card">
          <div class="drill-tag">Interview • IO</div>
          <h4>PIQ → Dynamic IO Grill</h4>
          <p>Generates tough cross-questions from your actual marks shifts, gap years, hobbies &amp; CIQ voice drills.</p>
          <button class="btn btn-primary btn-sm" data-nav="piq" type="button">Open PIQ &amp; IO</button>
        </article>
        <article class="drill-card">
          <div class="drill-tag">Day 3–4 • GTO</div>
          <h4>Lecturette &amp; GPE Map Lab</h4>
          <p>4-topic cards (3m prep + 3m mic recording) and tactical GPE SVG maps with live Speed-Time calculator.</p>
          <button class="btn btn-primary btn-sm" data-nav="gto" type="button">Launch GTO Lab</button>
        </article>
      </div>
    </section>

    <section class="two-col">
      <div class="panel">
        <div class="panel-head">
          <h3>Recent Practice Log</h3>
          <button id="btn-clear-history" class="btn btn-ghost btn-xs" type="button">Reset All Data</button>
        </div>
        ${renderRecentActivityList(h)}
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>15 Officer Like Qualities (OLQs)</h3>
          <span class="muted small">Reference Framework</span>
        </div>
        <div class="olq-list">
          ${OLQ_FACTORS.map(
            (f) => `
            <details class="olq-group">
              <summary>${escapeHtml(f.factor)}</summary>
              <ul>
                ${f.traits.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
              </ul>
            </details>`
          ).join('')}
        </div>
      </div>
    </section>
  `;

  container.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [view, sub] = btn.getAttribute('data-nav').split(':');
      navigate(view, sub);
    });
  });

  container.querySelector('#btn-export-md').addEventListener('click', () => {
    const md = generateMarkdownDossier(state);
    triggerDownload(`ssb-dossier-${new Date().toISOString().slice(0, 10)}.md`, md, 'text/markdown;charset=utf-8');
  });

  container.querySelector('#btn-export-json').addEventListener('click', () => {
    triggerDownload(
      `ssb-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(state, null, 2),
      'application/json;charset=utf-8'
    );
  });

  container.querySelector('#input-import-json').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !parsed.piq || !parsed.history) {
        throw new Error('Invalid SSB backup format');
      }
      const next = { ...createDefaultState(), ...parsed };
      saveState(next);
      setState(next);
      renderDashboardView(container, { ...ctx, state: next });
    } catch {
      window.alert('Could not import file: invalid SSB Command backup JSON.');
    }
  });

  container.querySelector('#btn-clear-history').addEventListener('click', () => {
    if (!window.confirm('Clear all locally saved PIQ, SD, and test history? Export backup first if needed.')) {
      return;
    }
    const fresh = createDefaultState();
    saveState(fresh);
    setState(fresh);
    renderDashboardView(container, { ...ctx, state: fresh });
  });
}

function renderRecentActivityList(h) {
  const rows = [];
  (h.oir || []).slice(0, 3).forEach((x) => {
    rows.push({ tag: 'OIR', title: `${x.score}/${x.total} (${x.accuracy}%)`, meta: `${x.elapsedSec}s • ${x.mode}` , ts: x.timestamp });
  });
  (h.ppdt || []).slice(0, 3).forEach((x) => {
    rows.push({ tag: 'PPDT', title: x.sceneLabel, meta: `${x.wordCount || 0}w • ${x.narrationSec || 0}s narr.`, ts: x.timestamp });
  });
  (h.wat || []).slice(0, 3).forEach((x) => {
    rows.push({ tag: 'WAT', title: `${x.attempted}/${x.total} attempted`, meta: `${x.avgReactionSec}s avg • ${x.preachyCount} preachy`, ts: x.timestamp });
  });
  (h.srt || []).slice(0, 3).forEach((x) => {
    rows.push({ tag: 'SRT', title: `${x.attempted}/${x.total} attempted`, meta: `${x.elapsedSec}s total`, ts: x.timestamp });
  });
  (h.tat || []).slice(0, 2).forEach((x) => {
    rows.push({ tag: 'TAT', title: `${x.stories?.length || 0} slides completed`, meta: x.modeLabel || 'Battery', ts: x.timestamp });
  });
  (h.lecturette || []).slice(0, 2).forEach((x) => {
    rows.push({ tag: 'LEC', title: x.topic, meta: `${x.durationSec}s speech`, ts: x.timestamp });
  });

  rows.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  if (rows.length === 0) {
    return `<p class="muted">No completed sessions yet. Launch a PPDT, OIR, WAT, or PIQ drill to start tracking your readiness.</p>`;
  }

  return `
    <ul class="activity-list">
      ${rows
        .slice(0, 8)
        .map(
          (r) => `
          <li>
            <span class="tag-pill">${escapeHtml(r.tag)}</span>
            <div class="activity-body">
              <strong>${escapeHtml(r.title)}</strong>
              <span class="muted small">${escapeHtml(r.meta)}</span>
            </div>
            <span class="mono muted small">${escapeHtml(String(r.ts || '').slice(0, 10))}</span>
          </li>`
        )
        .join('')}
    </ul>
  `;
}
