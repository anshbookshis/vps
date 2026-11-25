/**
 * PIQ (Personal Information Questionnaire) schema, CIQ rapid-fire clusters,
 * and Hobby/Sport/Academic-Stream technical IO grill banks.
 */

export const ENTRY_TYPES = [
  'NDA / NA',
  'CDS (IMA / OTA / INA / AFA)',
  'AFCAT',
  'TES / 10+2 B.Tech',
  'SSC Tech / TGC',
  'NCC Special Entry',
  'INET / Coast Guard',
];

export const CIQ_CLUSTERS = [
  {
    id: 'ciq-education',
    title: 'CIQ 1 — Education Trajectory, Teachers & Friends',
    prompt:
      'Tell me in sequence about your education from 8th standard onwards: the schools/colleges you attended, your exact percentage/CGPA in 10th, 12th, and Graduation, your favourite and least favourite subjects with reasons, two teachers you admired or disliked, and your closest friends and why you value them.',
    subQuestions: [
      'Schools & colleges from Class 8 onwards (with board/university)',
      'Exact marks/CGPA in 10th, 12th, and Graduation',
      'Favourite subject & reason (not just "scored high")',
      'Least favourite / toughest subject & how you tackled it',
      'Teacher admired & qualities learned (and constructive critique if asked)',
      '2–3 close friends & concrete qualities in them',
    ],
    targetSeconds: 150,
  },
  {
    id: 'ciq-family',
    title: 'CIQ 2 — Family Dynamics, Finances & Role Model',
    prompt:
      'Tell me about your family: what your parents and siblings do, monthly/annual family financial comfort, whom you are closest to when facing a tough personal problem and why, how you manage your monthly pocket money or salary, and what household responsibilities you personally handle.',
    subQuestions: [
      'Parents’ & siblings’ exact occupations/studies',
      'Honest view of family financial situation',
      'Whom you confide in during crises & real example',
      'Monthly pocket money / salary & exact expense breakdown',
      'Household chores / family responsibilities you take up',
    ],
    targetSeconds: 120,
  },
  {
    id: 'ciq-routine',
    title: 'CIQ 3 — Daily Routine, Leisure, Hobbies & Sports',
    prompt:
      'Walk me through your typical weekday and Sunday routine from waking up till sleeping, how you spend your free time, the games and hobbies you actively pursue, recent achievements in them, and three areas of self-improvement you are currently working on.',
    subQuestions: [
      'Structured weekday vs Sunday schedule',
      'Active hobbies (with depth/recent reading or output)',
      'Games/sports played regularly & fitness metrics',
      'Tangible achievements / participation level',
      'Genuine weaknesses / improvement habits underway',
    ],
    targetSeconds: 135,
  },
  {
    id: 'ciq-defence',
    title: 'CIQ 4 — Defence Motivation, Entry Awareness & Backup Plan',
    prompt:
      'Why do you want to join the Indian Armed Forces specifically rather than a civilian career? What steps have you taken to prepare physically and mentally for the academy? What do you know about the training academy for your entry, and what is your realistic Plan B if not recommended this time?',
    subQuestions: [
      'Personal, grounded motivation (avoid scripted Bollywood clichés)',
      'Concrete physical & mental prep steps taken so far',
      'Knowledge of respective academy (NDA/IMA/OTA/AFA/INA), training duration & ethos',
      'Realistic, constructive Plan B without sounding uncommitted',
    ],
    targetSeconds: 120,
  },
];

export const HOBBY_SPORT_PROBES = [
  {
    keywords: ['cricket'],
    label: 'Cricket',
    questions: [
      'Exact pitch length (22 yards / 20.12 m), crease dimensions, and weight/circumference of a standard leather ball?',
      'Explain LBW conditions, Powerplay fielding restrictions in ODIs vs T20s, and Duckworth-Lewis-Stern principle.',
      'Who is your favourite tactical captain and what field placement mistake did you notice in a recent match?',
    ],
  },
  {
    keywords: ['football', 'soccer'],
    label: 'Football',
    questions: [
      'Standard field dimensions, penalty box size, and ball pressure/circumference?',
      'Explain the offside rule accurately (including deflection vs deliberate play) and VAR check criteria.',
      'Difference between 4-3-3 and 4-2-3-1 formations and which suits your playing position?',
    ],
  },
  {
    keywords: ['badminton', 'shuttle'],
    label: 'Badminton',
    questions: [
      'Singles vs Doubles court dimensions (length 13.4m, width 5.18m vs 6.1m) and net height at center vs posts?',
      'Difference between a clear, drop shot, smash, and net tumble; standard feather shuttle weight (4.74–5.50 g)?',
      'Explain rally scoring rules and service court switching on even vs odd scores.',
    ],
  },
  {
    keywords: ['running', 'jogging', 'athletics', 'marathon', 'sprint'],
    label: 'Running / Athletics',
    questions: [
      'What is your current 5 km / 2.4 km timing and weekly mileage?',
      'Difference between aerobic base building, tempo runs, and VO2-max intervals?',
      'How do you prevent shin splints and manage hydration/electrolytes before long runs?',
    ],
  },
  {
    keywords: ['chess'],
    label: 'Chess',
    questions: [
      'What is your FIDE / online rating and favourite opening with White vs Black?',
      'Explain castling constraints, en passant, and three-fold repetition vs 50-move rule.',
      'How do you convert an endgame advantage (opposition in King+Pawn endgames)?',
    ],
  },
  {
    keywords: ['reading', 'book', 'books', 'novel'],
    label: 'Reading',
    questions: [
      'Name the last 3 non-exam books you read completely, their authors, and one idea from each you applied in life.',
      'Why do you prefer that genre, and what critical flaw did you find in your favourite book?',
    ],
  },
  {
    keywords: ['coding', 'programming', 'software', 'web', 'ai', 'tech'],
    label: 'Programming / Tech',
    questions: [
      'What real problem did you solve with a project you built from scratch (no tutorial clone)?',
      'Explain a subtle bug or bottleneck you debugged recently and how you verified the fix.',
      'How can software automation / cybersecurity strengthen military logistics or defence readiness?',
    ],
  },
  {
    keywords: ['trek', 'hiking', 'mountaineering', 'cycling'],
    label: 'Trekking / Cycling',
    questions: [
      'Highest altitude / longest distance covered, route details, and emergency gear carried in your pack?',
      'How do you handle Acute Mountain Sickness (AMS) or sudden weather drop with a group?',
    ],
  },
  {
    keywords: ['music', 'guitar', 'singing', 'listening'],
    label: 'Music / Listening to Music',
    questions: [
      'Caution: "Listening to music" is passive unless backed by specifics — which genres/artists/ragas or instrument techniques do you actively study?',
      'If you play an instrument: explain basic chord progressions, scales, and last piece mastered.',
    ],
  },
  {
    keywords: ['gym', 'fitness', 'workout', 'calisthenics', 'swimming'],
    label: 'Fitness / Swimming',
    questions: [
      'What are your current push-up, pull-up, plank, and 2.4 km run benchmarks?',
      'Explain progressive overload vs overtraining recovery; if swimming: stroke styles, breath cycle, and rescue basics.',
    ],
  },
  {
    keywords: ['ncc', 'nss', 'scout'],
    label: 'NCC / NSS',
    questions: [
      'Exact camps attended (ATC, CATC, RDC, TSC), rank held, and rifle drill/weapon specs (e.g., INSAS / .22 Deluxe)?',
      'Tell me one tough administrative challenge you handled as a cadet/volunteer leader during camp.',
    ],
  },
  {
    keywords: ['current affairs', 'news', 'newspaper', 'geopolitics'],
    label: 'Current Affairs / News',
    questions: [
      'Which two newspapers/sources do you follow daily, and state 3 major national + 2 defence/international developments this month with balanced analysis.',
    ],
  },
];

export const STREAM_PROBES = {
  engineering: [
    'Explain a core practical application of your engineering branch (e.g., Mechanics, Thermodynamics, Signals, OS/Networks) used in modern military hardware.',
    'Explain your final-year project’s problem statement, your exact individual contribution, and why alternative designs were rejected.',
  ],
  science: [
    'Connect a fundamental Physics/Chemistry/Mathematics concept from your degree to radar, ballistics, cryptography, or propulsion.',
    'How did your laboratory discipline prepare you for systematic fault diagnosis?',
  ],
  commerce: [
    'Explain fiscal deficit, repo rate vs inflation control, and how defence capital budgeting affects domestic manufacturing.',
    'If managing a unit mess or sports fund, how do you audit expenses and prevent leakages?',
  ],
  humanities: [
    'Analyze a geopolitical hotspot or constitutional governance debate from historical, economic, and security angles.',
    'How does understanding social psychology help an officer lead soldiers from diverse cultural regions?',
  ],
  school: [
    'Why do you want to enter the academy right after Class 12 via NDA/TES instead of pursuing regular college first?',
    'Relate your favourite Class 11–12 subject concept to an everyday physical phenomenon.',
  ],
};
