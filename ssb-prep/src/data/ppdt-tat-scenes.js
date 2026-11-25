/**
 * Procedural hazy scene specifications for PPDT (4 scenes) and TAT (11 scenes + 12th Blank Slide).
 * Designed for genuine SSB ambiguity: blurred silhouettes, natural props, and multi-angle storylines.
 */

export const PPDT_SCENES = [
  {
    id: 'ppdt-01',
    mode: 'ppdt',
    label: 'PPDT Scene 1 — Flooded Crossing & Boat',
    blueprint: 'flood-crossing',
    expectedHint: '3–4 characters near rising river embankment with wooden boat & supplies',
    themes: [
      'Organizing evacuation of stranded villagers and essentials using local boat teams',
      'Coordinating pre-monsoon embankment reinforcement and emergency ferry schedule',
      'Rescuing livestock/elderly safely before river water rises further',
    ],
    avoidTrap: 'Do not invent magical helicopters when a wooden boat, ropes, and youth volunteers are right in the frame.',
  },
  {
    id: 'ppdt-02',
    mode: 'ppdt',
    label: 'PPDT Scene 2 — Night Roadside Breakdown / Mishap',
    blueprint: 'road-mishap',
    expectedHint: '2–3 characters beside tilted scooter/bicycle and standing figure under streetlamp',
    themes: [
      'Providing immediate first aid, lighting hazard marker, and shifting injured commuter to clinic',
      'Helping a stranded traveller repair vehicle/arrange safe night transport',
      'Setting up reflective warning signs near an unmarked pothole to prevent further accidents',
    ],
    avoidTrap: 'Do not assume criminal robbery automatically; also avoid skipping medical handoff.',
  },
  {
    id: 'ppdt-03',
    mode: 'ppdt',
    label: 'PPDT Scene 3 — Village Classroom / Chalkboard Discussion',
    blueprint: 'classroom-briefing',
    expectedHint: '1 standing central figure near board/chart + 3 seated listeners',
    themes: [
      'Conducting adult digital/financial literacy or youth career guidance workshop',
      'Briefing panchayat/youth volunteers on disaster preparedness or sanitation drive',
      'Coaching rural school students for scholarship/science exhibition',
    ],
    avoidTrap: 'Keep the action concrete (what topic, what method, what measurable outcome) instead of vague "gave a motivational speech".',
  },
  {
    id: 'ppdt-04',
    mode: 'ppdt',
    label: 'PPDT Scene 4 — Mountain Trail & Heavy Backpack',
    blueprint: 'mountain-trail',
    expectedHint: '2 figures ascending steep ridge with walking poles/pack, mist ahead',
    themes: [
      'Leading a college NCC/trekking expedition safely through sudden mist to base camp',
      'Transporting solar/medical supplies to a remote ridge hamlet',
      'Training with a teammate for endurance mountaineering selection',
    ],
    avoidTrap: 'Show team care and route discipline rather than reckless solo speed.',
  },
];

export const TAT_SCENES = [
  {
    id: 'tat-01',
    mode: 'tat',
    label: 'TAT Slide 1 — Youth at Late-Night Study Desk',
    blueprint: 'study-desk',
    expectedHint: '1 solitary person leaning over books/diagrams under desk lamp',
    themes: [
      'Preparing methodically for a competitive exam or engineering prototype after college hours',
      'Analyzing past mistakes in mock tests and rebuilding a disciplined study schedule',
    ],
    avoidTrap: 'Avoid depicting burnout/depression without constructive turnaround.',
  },
  {
    id: 'tat-02',
    mode: 'tat',
    label: 'TAT Slide 2 — Workshop / Mechanical Repair',
    blueprint: 'workshop-repair',
    expectedHint: '2 figures examining engine/tractor or lab apparatus with tools',
    themes: [
      'Troubleshooting a malfunctioning agricultural pump/tractor before sowing season',
      'Building and testing a low-cost technical project for an innovation contest',
    ],
    avoidTrap: 'Be specific about practical teamwork and testing.',
  },
  {
    id: 'tat-03',
    mode: 'tat',
    label: 'TAT Slide 3 — Railway Platform Farewell / Arrival',
    blueprint: 'railway-platform',
    expectedHint: '2–3 silhouettes on platform near train coach & luggage',
    themes: [
      'Leaving home for academy/university/first job with family blessing and clear goals',
      'Receiving and assisting an elderly relative or organizing station volunteer helpdesk',
    ],
    avoidTrap: 'Avoid turning every station scene into a tearful tragedy.',
  },
  {
    id: 'tat-04',
    mode: 'tat',
    label: 'TAT Slide 4 — Rural Well / Water Tank & Villagers',
    blueprint: 'village-water',
    expectedHint: '3 figures near dry ground / water pump / pipe sketch',
    themes: [
      'Mobilizing villagers for rainwater harvesting and desilting an irrigation pond',
      'Conducting water quality testing and repairing community handpump',
    ],
    avoidTrap: 'Avoid writing "requested government officer and problem solved"; show ground execution.',
  },
  {
    id: 'tat-05',
    mode: 'tat',
    label: 'TAT Slide 5 — Sports Track / Fallen Runner',
    blueprint: 'sports-track',
    expectedHint: '2 figures on running track: one crouched/injured, one beside',
    themes: [
      'Helping an injured teammate off the track for ice/first-aid while guiding team relay changeover',
      'Rebuilding fitness steadily after a sports injury to make the varsity squad',
    ],
    avoidTrap: 'Balance empathy for the injured person with team commitment.',
  },
  {
    id: 'tat-06',
    mode: 'tat',
    label: 'TAT Slide 6 — Family Dining Table Discussion',
    blueprint: 'family-table',
    expectedHint: '3–4 figures seated around table with papers/tea',
    themes: [
      'Discussing transparent family budget & elder care / sibling education plan',
      'Convincing parents calmly about career path in Armed Forces with concrete backup',
    ],
    avoidTrap: 'Show respectful dialogue rather than dramatic family shouting.',
  },
  {
    id: 'tat-07',
    mode: 'tat',
    label: 'TAT Slide 7 — Smoke Rising Behind Factory / Warehouse',
    blueprint: 'warehouse-smoke',
    expectedHint: '2 figures moving towards gate with smoke plume in background',
    themes: [
      'Evacuating workers, shutting fuel valves, guiding fire tender access, and organizing safety audit',
      'Leading local volunteers to contain a dry-grass fire near storage sheds',
    ],
    avoidTrap: 'Do not run inside flames heroically without safety steps or emergency coordination.',
  },
  {
    id: 'tat-08',
    mode: 'tat',
    label: 'TAT Slide 8 — Hospital / Clinic Corridor',
    blueprint: 'hospital-corridor',
    expectedHint: '2 figures standing outside clinic door, one holding folder',
    themes: [
      'Coordinating blood donors and insurance paperwork calmly during a relative’s surgery',
      'Organizing a rural weekend medical/eye-screening camp with local doctors',
    ],
    avoidTrap: 'Focus on calm logistics and care rather than passive worry.',
  },
  {
    id: 'tat-09',
    mode: 'tat',
    label: 'TAT Slide 9 — Argument / Heated Group Gesture',
    blueprint: 'group-dispute',
    expectedHint: '3–4 standing figures, one gesturing firmly while central figure listens/mediates',
    themes: [
      'Mediating a hostel/club budget or venue dispute objectively to reach consensus',
      'Persuading hesitant teammates to adopt safety gear before field expedition',
    ],
    avoidTrap: 'Do not escalate into physical violence.',
  },
  {
    id: 'tat-10',
    mode: 'tat',
    label: 'TAT Slide 10 — Dark Forest / Torchlight Search',
    blueprint: 'night-search',
    expectedHint: '2 figures with beam of torchlight among trees',
    themes: [
      'Tracing a missing cattle herder or lost camper safely using whistle signals & grid search',
      'Leading night navigation training exercise with map & compass',
    ],
    avoidTrap: 'Avoid supernatural/ghost stories or irrational fear.',
  },
  {
    id: 'tat-11',
    mode: 'tat',
    label: 'TAT Slide 11 — Coastal Pier / Fishing Boats in Wind',
    blueprint: 'coastal-pier',
    expectedHint: '2 figures securing boat ropes near pier under overcast sky',
    themes: [
      'Securing fishing boats and warning coastal families ahead of cyclone advisory',
      'Launching a coastal cleanup & plastic-free harbour initiative with fishermen',
    ],
    avoidTrap: 'Keep actions grounded in preparation and coordination.',
  },
  {
    id: 'tat-12',
    mode: 'tat',
    label: 'TAT Slide 12 — BLANK SLIDE (Self-Projection)',
    blueprint: 'blank-slide',
    expectedHint: 'Blank white/light canvas — project a realistic positive story from your own life/aspirations',
    themes: [
      'Craft an original story rooted in an actual skill, hobby, leadership challenge, or community initiative you genuinely care about',
      'Avoid pre-memorized heroic commando/war fantasies; keep the hero relatable to your real background',
    ],
    avoidTrap: 'Never memorize a viral YouTube blank-slide story verbatim — psychologists spot rehearsed templates immediately against your PIQ.',
  },
];
