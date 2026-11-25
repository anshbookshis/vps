/**
 * PIQ (Personal Information Questionnaire) Analyzer & Dynamic IO Cross-Question Generator.
 * Translates candidate's real background into concrete Interviewing Officer (IO) probes.
 */

import { HOBBY_SPORT_PROBES, STREAM_PROBES } from '../data/piq-interview-bank.js';

function parsePct(val) {
  if (val === '' || val === null || val === undefined) return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0 || num > 100) return null;
  return num;
}

function classifyStream(streamText) {
  const s = String(streamText || '').toLowerCase();
  if (/(b\.?tech|b\.?e\.?|engineer|computer|mech|civil|electr|cs|it|ece)/.test(s)) return 'engineering';
  if (/(b\.?sc|physics|chem|math|science|bio|stat)/.test(s)) return 'science';
  if (/(b\.?com|bba|mba|econom|financ|account|commerce)/.test(s)) return 'commerce';
  if (/(b\.?a\.?|history|pol|socio|psych|arts|humanit|law|llb)/.test(s)) return 'humanities';
  return 'school';
}

/**
 * Inspect PIQ data, detect red flags & academic shifts, and synthesize personalized IO questions.
 * @param {Record<string, any>} piq
 */
export function analyzePiqAndGenerateIoQuestions(piq = {}) {
  const tenth = parsePct(piq.tenthPct);
  const twelfth = parsePct(piq.twelfthPct);
  const grad = parsePct(piq.gradPct);
  const gapYears = Math.max(0, Number(piq.gapYears || 0));
  const attempts = Math.max(0, Number(piq.attempts || 0));

  const redFlags = [];
  const questionGroups = [];

  // 1. Academic Trajectory Analysis
  const academicQuestions = [];
  const delta10to12 = tenth !== null && twelfth !== null ? Number((twelfth - tenth).toFixed(1)) : null;
  const delta12toGrad = twelfth !== null && grad !== null ? Number((grad - twelfth).toFixed(1)) : null;

  if (delta10to12 !== null && delta10to12 <= -6) {
    redFlags.push(`Marks dropped ${Math.abs(delta10to12)}% from 10th (${tenth}%) to 12th (${twelfth}%). Prepare an honest, non-excuse explanation.`);
    academicQuestions.push(
      `Your percentage dropped from ${tenth}% in Class 10 to ${twelfth}% in Class 12 (${delta10to12}%). What caused that dip, and what did you change afterward?`
    );
  } else if (delta10to12 !== null && delta10to12 >= 8) {
    academicQuestions.push(
      `You jumped from ${tenth}% in 10th to ${twelfth}% in 12th (+${delta10to12}%). What specific study habit changed?`
    );
  }

  if (delta12toGrad !== null && delta12toGrad <= -6) {
    redFlags.push(`Graduation marks (${grad}%) dipped ${Math.abs(delta12toGrad)}% below Class 12 (${twelfth}%).`);
    academicQuestions.push(
      `Why did your Graduation score (${grad}%) fall compared to Class 12 (${twelfth}%)? Were extracurriculars affecting academics or vice versa?`
    );
  }

  if (gapYears > 0) {
    redFlags.push(`${gapYears} gap year(s) declared — IO will verify daily productivity and accountability during this period.`);
    academicQuestions.push(
      `You have ${gapYears} year(s) of gap after schooling/graduation. Break down your daily schedule during that period and any skills/work you accomplished beyond exam prep.`
    );
  }

  const streamKey = classifyStream(piq.stream);
  academicQuestions.push(...(STREAM_PROBES[streamKey] || STREAM_PROBES.school));

  questionGroups.push({
    category: 'Academic Trajectory & Technical Stream',
    questions: academicQuestions,
  });

  // 2. Hobbies, Sports & POR Depth
  const hobbiesText = String(piq.hobbies || '').trim();
  const sportsText = String(piq.sports || '').trim();
  const combinedActivities = `${hobbiesText} ${sportsText} ${piq.ncc || ''}`.toLowerCase();

  const activityQuestions = [];
  const matchedLabels = new Set();

  for (const probe of HOBBY_SPORT_PROBES) {
    if (probe.keywords.some((kw) => combinedActivities.includes(kw))) {
      matchedLabels.add(probe.label);
      activityQuestions.push(...probe.questions.map((q) => `[${probe.label}] ${q}`));
    }
  }

  if (!hobbiesText) {
    redFlags.push('Hobbies field is blank — an empty PIQ column makes you look passive or unidimensional.');
  } else if (/watching\s+(movies|tv|reels|youtube)|sleeping|surfing\s+internet/.test(hobbiesText.toLowerCase())) {
    redFlags.push('Passive hobby detected ("watching movies/TV/surfing") — replace with active constructive interests you can defend in depth.');
  }

  if (!sportsText) {
    redFlags.push('No team/individual games entered — defence expects regular physical/outdoor engagement.');
  }

  if (!String(piq.pors || '').trim() && !String(piq.ncc || '').trim()) {
    redFlags.push('No Positions of Responsibility (POR) or NCC listed — recall class rep, hostel mess, fest, team captain, or family leadership roles.');
  } else if (String(piq.pors || '').trim()) {
    activityQuestions.push(
      `[Leadership / POR] Regarding "${piq.pors}": Describe one difficult conflict or logistical crisis you personally resolved in that role without escalating to authorities.`
    );
  }

  if (activityQuestions.length === 0) {
    activityQuestions.push(
      'Explain the core rules, measurements/benchmarks, and recent developments in your listed hobbies/sports.',
      'How do you allocate time between studies/work and personal interests every week?'
    );
  }

  questionGroups.push({
    category: `Hobbies, Sports & Leadership (${matchedLabels.size > 0 ? Array.from(matchedLabels).join(', ') : 'General'})`,
    questions: activityQuestions,
  });

  // 3. Family, Hometown & Financial Context
  const familyQuestions = [];
  if (String(piq.fatherOcc || '').trim()) {
    familyQuestions.push(
      `Your father’s occupation is "${piq.fatherOcc}". What does his typical workday entail, what lessons did you absorb from him, and why choose Defence instead of his line?`
    );
  }
  if (String(piq.siblings || '').trim()) {
    familyQuestions.push(
      `Regarding your siblings (${piq.siblings}): How do you settle disagreements at home, and what qualities do they admire or critique in you?`
    );
  }
  if (String(piq.hometown || '').trim()) {
    familyQuestions.push(
      `About "${piq.hometown}": Name the District Magistrate/Collector, major economic drivers, two historical/geographical facts, and key civic challenges of your district.`
    );
  }
  familyQuestions.push(
    'If you receive ₹3,000 monthly pocket money (or your current salary), give an exact breakdown of where every rupee goes.'
  );

  questionGroups.push({
    category: 'Family, Hometown & Personal Maturity',
    questions: familyQuestions,
  });

  // 4. Entry & Previous Attempts
  const entryQuestions = [
    `For ${piq.entryType || 'your entry'}: Name the training academy, duration of training, motto, and key commands/bases of your opted service.`,
    'State three real weaknesses you are actively correcting right now (with proof of corrective steps).',
  ];

  if (attempts > 0) {
    entryQuestions.unshift(
      `You have ${attempts} prior SSB attempt(s) (${piq.attemptOutcome || 'details not specified'}). What concrete flaws did you identify across Stage I, Psych, GTO, and Interview, and what measurable habit changed since then?`
    );
  }

  questionGroups.push({
    category: 'Entry Awareness & Attempt Introspection',
    questions: entryQuestions,
  });

  // Completeness score
  const trackedKeys = [
    'fullName',
    'entryType',
    'hometown',
    'fatherOcc',
    'motherOcc',
    'tenthPct',
    'twelfthPct',
    'stream',
    'hobbies',
    'sports',
  ];
  const filledCount = trackedKeys.filter((k) => String(piq[k] ?? '').trim() !== '').length;
  const completenessPct = Math.round((filledCount / trackedKeys.length) * 100);

  return {
    completenessPct,
    academicTrend: { tenth, twelfth, grad, delta10to12, delta12toGrad },
    redFlags,
    questionGroups,
  };
}
