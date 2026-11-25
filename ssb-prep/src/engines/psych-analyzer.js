/**
 * Pure SSB Psychological Test Self-Audit Engine (WAT, PPDT/TAT Story, SRT, Self-Description).
 * Deterministic, rule-based heuristics highlighting real SSB psychological traps.
 */

const MODAL_PREACHY_RE = /\b(should|must|ought\s+to|need\s+to|needs\s+to|have\s+to|has\s+to|always\s+be|never\s+do)\b/i;
const NEGATIVE_DEFEATIST_RE =
  /\b(cannot|can't|couldn't|impossible|hopeless|useless|weak|afraid|scared|terrified|give\s+up|gave\s+up|fails?\s+completely|worthless|ruined|helpless)\b/i;
const SELF_CENTERED_RE = /^\s*(i\s+am|i\s+always|i\s+never|i\s+will|my\s+aim|i\s+want)\b/i;

const ACTION_VERBS_RE =
  /\b(organized|coordinated|led|mobilized|assessed|planned|planned|rescued|arranged|informed|checked|trained|built|repaired|guided|convinced|gathered|managed|assisted|resolved|prepared|executed|scheduled|verified|implemented|distributed|evacuated|treated|applied)\b/gi;
const PAST_MARKER_RE =
  /\b(was|were|had|noticed|saw|heard|discovered|received|faced|during|while|after|before|recently|earlier)\b/i;
const OUTCOME_MARKER_RE =
  /\b(finally|eventually|successfully|recovered|resolved|saved|completed|appreciated|thanked|succeeded|won|restored|safely|improved|resulted)\b/i;
const PASSIVE_ESCAPE_RE =
  /\b(miraculously|god\s+saved|luckily\s+someone|police\s+solved\s+everything|government\s+should|somebody\s+else|ran\s+away)\b/i;

const SRT_AVOIDANCE_RE =
  /\b(ignore|avoid|walk\s+away|leave\s+it|do\s+nothing|stay\s+quiet|let\s+them|quit|drop\s+out|hide)\b/i;
const SRT_UNREALISTIC_RE =
  /\b(beat\s+(all|them|everyone)|fight\s+\d+|single[-\s]?handedly\s+killed|jumped\s+from\s+building|snatched\s+gun)\b/i;

const CLICHE_WEAKNESS_RE =
  /\b(perfectionist|work\s+too\s+hard|overworking|trust\s+everyone\s+blindly|too\s+honest|too\s+kind|no\s+weakness)\b/i;

function countWords(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).length;
}

/**
 * Audit a completed or partial WAT session.
 * @param {Array<{ word: string, category?: string, sentence: string, reactionSec?: number }>} entries
 */
export function analyzeWatResponses(entries = []) {
  let attempted = 0;
  let blanks = 0;
  let preachyCount = 0;
  let negativeCount = 0;
  let selfCenteredCount = 0;
  let totalReactionSec = 0;
  let timedCount = 0;

  const audited = entries.map((entry) => {
    const sentence = String(entry.sentence || '').trim();
    const wc = countWords(sentence);
    const issues = [];

    if (!sentence || wc < 2) {
      blanks += 1;
      return {
        ...entry,
        wordCount: wc,
        badge: 'blank',
        issues: ['Blank or incomplete thought — practice rapid first-glance framing under 10s.'],
      };
    }

    attempted += 1;
    if (typeof entry.reactionSec === 'number' && entry.reactionSec > 0) {
      totalReactionSec += entry.reactionSec;
      timedCount += 1;
    }

    if (MODAL_PREACHY_RE.test(sentence)) {
      preachyCount += 1;
      issues.push('Preachy/modal phrasing ("should/must/ought") — prefer active observed truth or concrete verb instead of advice.');
    }
    if (NEGATIVE_DEFEATIST_RE.test(sentence)) {
      negativeCount += 1;
      issues.push('Defeatist/fearful tone — reframe stress words into constructive reality or calm mastery.');
    }
    if (SELF_CENTERED_RE.test(sentence)) {
      selfCenteredCount += 1;
      issues.push('First-person "I" opener — avoid turning WAT into self-boasting; keep statements universal & natural.');
    }
    if (wc > 15) {
      issues.push(`Long sentence (${wc} words) — aim for crisp 5–10 word thoughts so handwriting keeps up at 15s/word.`);
    }

    return {
      ...entry,
      wordCount: wc,
      badge: issues.length === 0 ? 'strong' : 'review',
      issues,
    };
  });

  const total = entries.length;
  const completionPct = total > 0 ? Math.round((attempted / total) * 100) : 0;
  const avgReactionSec = timedCount > 0 ? Number((totalReactionSec / timedCount).toFixed(1)) : 0;
  const cleanCount = audited.filter((a) => a.badge === 'strong').length;

  return {
    total,
    attempted,
    blanks,
    completionPct,
    avgReactionSec,
    preachyCount,
    negativeCount,
    selfCenteredCount,
    cleanCount,
    audited,
  };
}

/**
 * Audit a PPDT or TAT story for structure, hero agency, length, and common SSB pitfalls.
 * @param {string} text
 * @param {number} [durationSec]
 */
export function analyzeStory(text, durationSec = 240) {
  const cleaned = String(text || '').trim();
  const wordCount = countWords(cleaned);
  const actionMatches = cleaned.match(ACTION_VERBS_RE) || [];
  const uniqueActions = Array.from(new Set(actionMatches.map((m) => m.toLowerCase())));

  const hasPastSetup = PAST_MARKER_RE.test(cleaned);
  const hasActionBody = uniqueActions.length >= 2;
  const hasOutcome = OUTCOME_MARKER_RE.test(cleaned) || wordCount >= 65;
  const hasPassiveEscape = PASSIVE_ESCAPE_RE.test(cleaned);
  const hasPreachy = MODAL_PREACHY_RE.test(cleaned);

  const flags = [];
  if (wordCount === 0) {
    flags.push('No story written yet.');
  } else if (wordCount < 55) {
    flags.push(`Short story (${wordCount} words). In 4 minutes, aim for 80–125 words detailing specific how-to steps.`);
  } else if (wordCount > 150) {
    flags.push(`Dense story (${wordCount} words). Watch hand fatigue in full 12-slide TAT; stay crisp around 90–125 words.`);
  }

  if (wordCount > 0 && !hasPastSetup) {
    flags.push('Missing clear context/trigger (what led to the scene).');
  }
  if (wordCount > 0 && !hasActionBody) {
    flags.push('Low concrete action verbs — specify exact steps your central character executed rather than vague feelings.');
  }
  if (hasPassiveEscape) {
    flags.push('Detected passive/miraculous escape or buck-passing — hero must directly drive realistic execution.');
  }
  if (hasPreachy) {
    flags.push('Avoid "should/must" preaching in stories; narrate what the character actually did.');
  }

  let arcScore = 0;
  if (hasPastSetup) arcScore += 1;
  if (hasActionBody) arcScore += 1;
  if (hasOutcome && wordCount >= 55) arcScore += 1;
  if (!hasPassiveEscape && wordCount >= 70) arcScore += 1;

  const wpm = durationSec > 0 ? Math.round((wordCount / durationSec) * 60) : 0;

  let verdict = 'Needs Work';
  if (wordCount === 0) verdict = 'Empty';
  else if (arcScore >= 4 && flags.length === 0) verdict = 'Well-Structured & Actionable';
  else if (arcScore >= 3) verdict = 'Solid Core — Polish Details';

  return {
    wordCount,
    wpm,
    arcScore,
    maxArcScore: 4,
    hasPastSetup,
    hasActionBody,
    hasOutcome,
    actionVerbs: uniqueActions,
    flags,
    verdict,
  };
}

/**
 * Audit SRT (Situation Reaction Test) entries for speed, completeness, and practicality.
 * @param {Array<{ id: string, situation: string, response: string, timeSec?: number }>} entries
 */
export function analyzeSrtResponses(entries = []) {
  let attempted = 0;
  let incompleteCount = 0;
  let avoidanceCount = 0;
  let unrealisticCount = 0;

  const audited = entries.map((entry) => {
    const response = String(entry.response || '').trim();
    const wc = countWords(response);
    const issues = [];

    if (!response || wc < 2) {
      return { ...entry, wordCount: wc, badge: 'blank', issues: ['Unattempted situation.'] };
    }

    attempted += 1;

    if (wc < 6) {
      incompleteCount += 1;
      issues.push('Very brief (<6 words) — ensure full logical loop (safety + action + closure), not just "informed police".');
    }
    if (SRT_AVOIDANCE_RE.test(response)) {
      avoidanceCount += 1;
      issues.push('Signals avoidance/passivity — officers own workable responsibility instead of walking away.');
    }
    if (SRT_UNREALISTIC_RE.test(response)) {
      unrealisticCount += 1;
      issues.push('Unrealistic/Rambo heroics — prioritize smart, safe, resource-backed execution.');
    }

    return {
      ...entry,
      wordCount: wc,
      badge: issues.length === 0 ? 'strong' : 'review',
      issues,
    };
  });

  const total = entries.length;
  const completionPct = total > 0 ? Math.round((attempted / total) * 100) : 0;

  return {
    total,
    attempted,
    completionPct,
    incompleteCount,
    avoidanceCount,
    unrealisticCount,
    audited,
  };
}

/**
 * Audit Self-Description (5 mandatory paragraphs) for balance, honesty, and cliché avoidance.
 * @param {{ parents?: string, teachers?: string, friends?: string, self?: string, future?: string }} sd
 */
export function analyzeSelfDescription(sd = {}) {
  const keys = [
    { key: 'parents', label: 'Parents’ Opinion' },
    { key: 'teachers', label: 'Teachers’ / Employers’ Opinion' },
    { key: 'friends', label: 'Friends’ / Colleagues’ Opinion' },
    { key: 'self', label: 'Own Opinion (Strengths & Weaknesses)' },
    { key: 'future', label: 'What You Want to Become' },
  ];

  const sections = keys.map(({ key, label }) => {
    const text = String(sd[key] || '').trim();
    const wordCount = countWords(text);
    const notes = [];

    if (wordCount === 0) {
      notes.push('Section empty — complete within the 15-minute SD budget.');
    } else if (wordCount < 25) {
      notes.push(`Brief (${wordCount} words) — aim for 40–75 words backed by specific behavioural habits.`);
    } else if (wordCount > 110) {
      notes.push(`Long (${wordCount} words) — trim so all 5 sections fit comfortably in 15 minutes.`);
    }

    if (key === 'self' && text) {
      if (CLICHE_WEAKNESS_RE.test(text)) {
        notes.push('Avoid cliché "humblebrag" weaknesses ("perfectionist", "work too hard") — state a genuine, minor improvable habit and how you are fixing it.');
      }
      if (!/\b(weakness|improve|working\s+on|area|shortcoming|impatient|hesitat|procrastin|time|stage)\b/i.test(text)) {
        notes.push('Ensure you honestly include 1–2 real improvement areas alongside strengths.');
      }
    }

    return { key, label, wordCount, notes, ok: wordCount >= 25 && notes.length === 0 };
  });

  const completedSections = sections.filter((s) => s.wordCount > 0).length;
  const totalWords = sections.reduce((sum, s) => sum + s.wordCount, 0);

  return {
    completedSections,
    totalSections: 5,
    totalWords,
    sections,
  };
}
