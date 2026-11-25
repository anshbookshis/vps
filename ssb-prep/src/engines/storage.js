/**
 * Offline persistence (localStorage), JSON backup/restore, and Markdown Mentor Dossier export.
 */

const STORAGE_KEY = 'ssb_command_state_v1';

export function createDefaultState() {
  return {
    version: 1,
    muted: false,
    piq: {
      fullName: '',
      entryType: 'CDS (IMA / OTA / INA / AFA)',
      hometown: '',
      fatherOcc: '',
      motherOcc: '',
      siblings: '',
      tenthPct: '',
      twelfthPct: '',
      gradPct: '',
      stream: '',
      gapYears: '0',
      hobbies: '',
      sports: '',
      pors: '',
      ncc: '',
      attempts: '0',
      attemptOutcome: '',
    },
    sd: {
      parents: '',
      teachers: '',
      friends: '',
      self: '',
      future: '',
      updatedAt: null,
    },
    history: {
      oir: [],
      ppdt: [],
      tat: [],
      wat: [],
      srt: [],
      lecturette: [],
      gpe: [],
    },
  };
}

function getSafeStorage(customStorage) {
  if (customStorage) return customStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

export function loadState(customStorage = null) {
  const defaults = createDefaultState();
  const store = getSafeStorage(customStorage);
  if (!store) return defaults;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      piq: { ...defaults.piq, ...(parsed.piq || {}) },
      sd: { ...defaults.sd, ...(parsed.sd || {}) },
      history: { ...defaults.history, ...(parsed.history || {}) },
    };
  } catch {
    return defaults;
  }
}

export function saveState(state, customStorage = null) {
  const store = getSafeStorage(customStorage);
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota overflow gracefully
  }
}

export function recordHistoryEntry(state, bucket, entry, maxItems = 25) {
  const list = Array.isArray(state.history[bucket]) ? state.history[bucket] : [];
  const next = [{ ...entry, timestamp: entry.timestamp || new Date().toISOString() }, ...list].slice(0, maxItems);
  state.history[bucket] = next;
  saveState(state);
  return state;
}

/**
 * Format aspirant's PIQ, Self-Description, and recent logs as a clean Markdown dossier for peer/mentor review.
 */
export function generateMarkdownDossier(state) {
  const s = state || createDefaultState();
  const p = s.piq || {};
  const sd = s.sd || {};
  const lines = [];

  lines.push(`# SSB Candidate Preparation Dossier`);
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## 1. PIQ Summary');
  lines.push(`- **Name**: ${p.fullName || 'Not entered'}`);
  lines.push(`- **Target Entry**: ${p.entryType || '-'}`);
  lines.push(`- **Hometown / District**: ${p.hometown || '-'}`);
  lines.push(`- **Academics**: 10th: ${p.tenthPct || '-'}% | 12th: ${p.twelfthPct || '-'}% | Grad: ${p.gradPct || '-'}% (${p.stream || 'Stream N/A'}) | Gap Years: ${p.gapYears || '0'}`);
  lines.push(`- **Family**: Father: ${p.fatherOcc || '-'} | Mother: ${p.motherOcc || '-'} | Siblings: ${p.siblings || '-'}`);
  lines.push(`- **Hobbies**: ${p.hobbies || '-'}`);
  lines.push(`- **Sports / Fitness**: ${p.sports || '-'}`);
  lines.push(`- **POR / NCC**: ${p.pors || '-'} | NCC: ${p.ncc || '-'}`);
  lines.push(`- **Prior SSB Attempts**: ${p.attempts || '0'} (${p.attemptOutcome || 'Fresher'})`);
  lines.push('');

  lines.push('## 2. Self-Description (SD)');
  lines.push(`- **Parents' Opinion**: ${sd.parents || '_Empty_'}`);
  lines.push(`- **Teachers'/Employers' Opinion**: ${sd.teachers || '_Empty_'}`);
  lines.push(`- **Friends'/Colleagues' Opinion**: ${sd.friends || '_Empty_'}`);
  lines.push(`- **Self Opinion (Strengths & Weaknesses)**: ${sd.self || '_Empty_'}`);
  lines.push(`- **Future Goal**: ${sd.future || '_Empty_'}`);
  lines.push('');

  const recentPpdt = (s.history.ppdt || [])[0];
  if (recentPpdt) {
    lines.push('## 3. Latest PPDT Practice');
    lines.push(`- **Scene**: ${recentPpdt.sceneLabel} | **Action**: ${recentPpdt.action || '-'}`);
    lines.push(`- **Characters**: ${recentPpdt.characters || '-'} | **Narration Time**: ${recentPpdt.narrationSec || 0}s`);
    lines.push('');
    lines.push(recentPpdt.story || '_Pen & paper mode_');
    lines.push('');
  }

  const recentTat = (s.history.tat || [])[0];
  if (recentTat && Array.isArray(recentTat.stories)) {
    lines.push(`## 4. Latest TAT Session (${recentTat.stories.length} slides)`);
    recentTat.stories.forEach((st, idx) => {
      lines.push(`### Slide ${idx + 1}: ${st.label}`);
      lines.push(st.story || '_Pen & paper / skipped_');
      lines.push('');
    });
  }

  const recentWat = (s.history.wat || [])[0];
  if (recentWat) {
    lines.push('## 5. Latest WAT Summary');
    lines.push(
      `- Attempted: ${recentWat.attempted}/${recentWat.total} | Avg Reaction: ${recentWat.avgReactionSec}s | Preachy Flags: ${recentWat.preachyCount} | Defeatist Flags: ${recentWat.negativeCount}`
    );
    lines.push('');
  }

  const recentSrt = (s.history.srt || [])[0];
  if (recentSrt) {
    lines.push('## 6. Latest SRT Summary');
    lines.push(`- Attempted: ${recentSrt.attempted}/${recentSrt.total} | Brief/Incomplete: ${recentSrt.incompleteCount}`);
    lines.push('');
  }

  return lines.join('\n');
}
