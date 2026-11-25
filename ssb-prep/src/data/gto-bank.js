/**
 * GTO (Group Testing Officer) preparation banks:
 * - 12 curated 4-topic Lecturette Cards (48 topics)
 * - 3 Tactical GPE (Group Planning Exercise) scenarios with scaled SVG maps
 * - 12 GD (Group Discussion) dual-sided prompt pairs
 */

export const LECTURETTE_CARDS = [
  {
    id: 'lec-01',
    title: 'Card 01 — Strategic, Tech, Society & Values',
    topics: [
      { name: 'Indigenisation in Indian Defence (Atmanirbhar)', level: 'High', points: ['Need: strategic autonomy & spare-parts resilience', 'Milestones: Tejas, Vikrant, BrahMos, iDEX startups, 75% capital procurement domestic push', 'Way forward: R&D investment, private sector testing ranges, export ecosystem'] },
      { name: 'Artificial Intelligence in Modern Warfare', level: 'Medium-High', points: ['ISR drones, predictive maintenance, cyber defence, electronic warfare', 'Risks: algorithmic bias, autonomous lethal ethics, GPS spoofing', 'India focus: human-in-the-loop doctrine & indigenous AI talent'] },
      { name: 'Role of Youth in Nation Building', level: 'Accessible', points: ['Demographic dividend window until ~2045', 'Skills + civic discipline beyond degrees: NCC, NSS, entrepreneurship', 'Tackling brain drain & misinformation responsibly'] },
      { name: 'Discipline vs Creativity', level: 'Abstract', points: ['False dichotomy: discipline creates reliable execution space for creativity', 'Examples: ISRO missions, sports tactics, jazz/classical discipline', 'Balance: rigid conformity stifles innovation; structured freedom wins'] },
    ],
  },
  {
    id: 'lec-02',
    title: 'Card 02 — Geopolitics, Economy, Environment & Habit',
    topics: [
      { name: 'Indo-Pacific Security & Maritime Chokepoints', level: 'High', points: ['95% Indian trade by volume via sea; Malacca, Hormuz, Bab-el-Mandeb', 'SAGAR vision, Quad cooperation, piracy & submarine cable security', 'Blue economy + Andaman & Nicobar strategic pivot'] },
      { name: 'Digital Public Infrastructure (UPI & ONDC)', level: 'Medium-High', points: ['Financial inclusion at population scale with low transaction cost', 'Formalizing MSMEs & reducing subsidy leakage', 'Global adoption & cybersecurity/privacy safeguards'] },
      { name: 'Urban Floods & Climate Resilience', level: 'Medium', points: ['Causes: concretization, wetland encroachment, choked drains + intense rain', 'Solutions: sponge cities, desilting schedules, strict zoning', 'Community preparedness & early warning integration'] },
      { name: 'Importance of Sports in Character Development', level: 'Accessible', points: ['Handles failure gracefully, teamwork over ego, stamina under fatigue', 'Builds quick tactical judgment under pressure', 'Grassroots infrastructure & Khelo India momentum'] },
    ],
  },
  {
    id: 'lec-03',
    title: 'Card 03 — Borders, Energy, Media & Ethics',
    topics: [
      { name: 'Border Infrastructure & Vibrant Villages', level: 'High', points: ['BRO roads, bridges, tunnels (Atal, Sela) cut mobilization time', 'Dual-use benefits: tourism, healthcare, stopping border out-migration', 'All-weather logistics vs ecological fragility in Himalayas'] },
      { name: 'India’s Green Hydrogen & Renewable Transition', level: 'Medium-High', points: ['500 GW non-fossil target; solar-wind hybrid + grid storage challenge', 'Green hydrogen for steel, fertilizer & heavy transport decarbonization', 'Critical mineral supply chain independence'] },
      { name: 'Social Media: Tool or Trap for Youth', level: 'Accessible', points: ['Opportunity: democratization of learning, remote creators, micro-commerce', 'Trap: doomscrolling, echo chambers, deepfakes, attention erosion', 'Self-regulation & digital literacy over blanket bans'] },
      { name: 'Failure as a Stepping Stone', level: 'Abstract', points: ['Feedback loop vs ego defence', 'Distinguish repeating mistakes from iterative learning', 'Real-world resilience in academics, startups, and selection'] },
    ],
  },
  {
    id: 'lec-04',
    title: 'Card 04 — Space, Agriculture, Space-Tech & Service',
    topics: [
      { name: 'Commercialization of Indian Space Sector', level: 'High', points: ['IN-SPACe opening launches & payloads to startups (Skyroot, Agnikul, Pixxel)', 'Dual-use defence ISR, disaster mapping, rural broadband', 'Cost-efficiency edge + global small-satellite market'] },
      { name: 'Precision Farming & Agricultural Modernization', level: 'Medium', points: ['Soil health sensors, drones for spraying, micro-irrigation, FPO collectives', 'Reducing post-harvest cold-chain losses (15–20%)', 'Bridging small-holder affordability via custom hiring centres'] },
      { name: 'Nuclear Energy in India’s Net-Zero Mix', level: 'Medium-High', points: ['Reliable baseload power complementing intermittent solar/wind', 'SMRs (Small Modular Reactors) & indigenous PHWR fleet + thorium roadmap', 'Addressing public perception & waste management'] },
      { name: 'Leadership by Example', level: 'Abstract', points: ['Credibility earned through actions in hardship, not rank alone', 'Shared risk builds unshakeable unit morale', 'Small daily habits: punctuality, fairness, accountability'] },
    ],
  },
  {
    id: 'lec-05',
    title: 'Card 05 — Cyber, Health, Transport & Mindset',
    topics: [
      { name: 'Cybersecurity & Hybrid Warfare', level: 'High', points: ['Critical infrastructure targets: power grids, banking, ports, satellites', 'Information operations & cognitive domain threats', 'CERT-In coordination, zero-trust architecture, cyber hygiene'] },
      { name: 'Mental Health & Academic Pressure Among Students', level: 'Medium', points: ['Stigma, hyper-competitive coaching, isolation', 'Practical interventions: peer mentors, physical activity, counselling access', 'Redefining success beyond single-exam identity'] },
      { name: 'Electric Vehicles & Charging Ecosystem', level: 'Accessible', points: ['Two-wheelers & public buses leading Indian EV adoption', 'Bottlenecks: battery recycling, grid load, highway fast chargers', 'Swapping standards & local cell manufacturing (PLIs)'] },
      { name: 'Time Management in Digital Age', level: 'Accessible', points: ['Attention is scarcer than hours', 'Deep work blocks, ruthless prioritization (Eisenhower matrix)', 'Consistency beats sporadic marathon cramming'] },
    ],
  },
  {
    id: 'lec-06',
    title: 'Card 06 — Neighbourhood, Water, Education & Courage',
    topics: [
      { name: 'India’s Neighbourhood First Policy', level: 'High', points: ['Connectivity, energy trade, HADR diplomacy (vaccine/disaster aid)', 'Balancing sovereignty, debt-trap geopolitics, and border stability', 'People-to-people cultural and educational links'] },
      { name: 'Water Conservation & River Interlinking', level: 'Medium', points: ['Groundwater depletion in agrarian belts vs seasonal floods', 'Micro-watersheds, rainwater harvesting, wastewater reuse before mega-canals', 'Ecological balance & inter-state water governance'] },
      { name: 'Skill Development vs Degree Inflation', level: 'Accessible', points: ['Employability gap among graduates', 'NEP vocational integration, apprenticeships, AI/mechatronics trades', 'Dignity of skilled labour'] },
      { name: 'Moral Courage vs Physical Courage', level: 'Abstract', points: ['Standing up for integrity when alone vs confronting physical danger', 'Whistleblowing, owning mistakes, refusing shortcuts', 'Both are inseparable in officer character'] },
    ],
  },
  {
    id: 'lec-07',
    title: 'Card 07 — Drones, Logistics, Tourism & Reading',
    topics: [
      { name: 'Drone Warfare & Counter-UAS Systems', level: 'High', points: ['Low-cost asymmetric threat in reconnaissance & loitering munitions', 'Counter-measures: radar, RF jamming, directed-energy & kinetic interceptors', 'Civil applications: medicine delivery, border patrol, surveying'] },
      { name: 'PM Gati Shakti & Logistics Cost Reduction', level: 'Medium-High', points: ['Cutting logistics cost from ~13–14% toward ~8% global benchmark', 'Dedicated Freight Corridors, multimodal parks, coastal shipping', 'Boosting manufacturing export competitiveness'] },
      { name: 'Sustainable Eco-Tourism in Himalayas', level: 'Medium', points: ['Carrying capacity vs unregulated hotel boom', 'Waste management, homestays empowering locals, green tax', 'Preserving fragile glaciers & biodiversity'] },
      { name: 'Habit of Reading in Short-Video Era', level: 'Accessible', points: ['Long-form reading builds sustained attention & nuanced vocabulary', 'Improves clarity in PPDT/TAT expression and GD articulation', 'Practical start: 20 pages daily before sleep'] },
    ],
  },
  {
    id: 'lec-08',
    title: 'Card 08 — Women in Forces, Semiconductors, Traffic & Integrity',
    topics: [
      { name: 'Women Officers in Combat & Command Roles', level: 'Medium-High', points: ['Permanent Commission, NDA entry, fighter pilots, artillery & warship postings', 'Merit-based gender-neutral operational standards', 'Institutional infrastructure & cultural integration'] },
      { name: 'India’s Semiconductor Mission', level: 'High', points: ['Strategic supply-chain resilience for defence, telecom, auto', 'Chip design talent base (20% global engineers) vs fab water/power/capex hurdles', 'ATMP/OSAT plants as pragmatic stepping stones'] },
      { name: 'Road Safety & Civic Responsibility', level: 'Accessible', points: ['1.5+ lakh annual fatalities: preventable tragedy', '3 Es: Engineering (black-spot fixes), Enforcement (bodycams/fines), Education (helmets/seatbelts)', 'Good Samaritan Law protection for bystanders'] },
      { name: 'Integrity: Doing Right When Nobody Watches', level: 'Abstract', points: ['Trust is the currency of command', 'Small compromises erode collective standards', 'Consistent ethical habits under routine pressure'] },
    ],
  },
];

export const GPE_SCENARIOS = [
  {
    id: 'gpe-01',
    title: 'GPE Case 01 — Rampur Dam, Highway Crash & Smuggler Boat',
    scaleText: '1 cm = 2 km • Jeep Speed: 40 km/h • Boat Speed: 10 km/h • Foot/Run: 8 km/h',
    brief:
      'You are a group of 8 NCC/College cadets on a cycling/hiking camp at Base Camp (Rampur Village) at 09:00 AM. You have 1 Jeep (capacity 6, speed 40 km/h) on the metalled highway and access to 1 Motor Boat at Ferry Ghat (speed 10 km/h, capacity 4). Your bus departs from Rampur Town Bus Stand at 12:30 PM. Suddenly, four simultaneous incidents come to your notice:\n\n' +
      '1. CRITICAL: While fetching water, a scout spots two armed miscreants planting an explosive charge near the Sluice Gate of Old Dam (4 km North-East along river bank from Ferry Ghat, or 6 km via forest track from Rampur Village) timed for 10:30 AM — flooding would wipe out Rampur Village (population 2,000).\n' +
      '2. URGENT LIFE THREAT: A passenger tempo overturned at Highway Curve (8 km East of Rampur Village on Metalled Road). Two passengers are trapped and bleeding heavily.\n' +
      '3. TIME-CRITICAL: A local farmer informs you that his runaway bullock cart knocked a young boy unconscious near Old Well (2 km West along dirt track from Rampur Village), needing clinic care.\n' +
      '4. ROUTINE: You must retrieve your group’s camp registration documents from Forest Checkpost (12 km East on Metalled Road, 4 km beyond Highway Curve) before catching the 12:30 PM bus.',
    landmarks: [
      { id: 'base', label: 'Rampur Village (Base 09:00)', x: 180, y: 170, color: '#34c77b' },
      { id: 'well', label: 'Old Well (2 km W)', x: 85, y: 170, color: '#d4a24c' },
      { id: 'ghat', label: 'Ferry Ghat (2 km N)', x: 180, y: 95, color: '#5aa9e6' },
      { id: 'dam', label: 'Sluice Dam (4 km NE / 6 km track)', x: 330, y: 65, color: '#e05a5a' },
      { id: 'crash', label: 'Highway Crash (8 km E)', x: 340, y: 170, color: '#e05a5a' },
      { id: 'post', label: 'Forest Post & Hospital (12 km E)', x: 455, y: 170, color: '#8ab4f8' },
      { id: 'police', label: 'Police Chowki (4 km E)', x: 260, y: 170, color: '#a5b4fc' },
    ],
    edges: [
      { from: 'well', to: 'base', kind: 'track', label: '2 km track' },
      { from: 'base', to: 'police', kind: 'road', label: '4 km' },
      { from: 'police', to: 'crash', kind: 'road', label: '4 km' },
      { from: 'crash', to: 'post', kind: 'road', label: '4 km' },
      { from: 'base', to: 'ghat', kind: 'track', label: '2 km' },
      { from: 'ghat', to: 'dam', kind: 'river', label: '4 km river' },
      { from: 'base', to: 'dam', kind: 'track', label: '6 km forest' },
    ],
    expertSolution: {
      priorities: [
        'Priority 1 (Mass Life + Infrastructure): Prevent Sluice Dam sabotage (10:30 AM deadline) — alert Police Chowki immediately en route!',
        'Priority 2 (Immediate Bleeding Threat): Rescue & evacuate critically injured passengers at Highway Crash (8 km E) to Hospital (12 km E).',
        'Priority 3 (Individual Injury): Stabilize unconscious boy at Old Well (2 km W) & bring to Rampur/Highway for ambulance/jeep pickup.',
        'Priority 4 (Admin/Logistic): Collect camp documents at Forest Checkpost (12 km E) in the same eastern hospital/post run before 12:30 PM bus.',
      ],
      groupAllocation: [
        'Group A (4 cadets + Jeep @ 40 km/h): Depart 09:05 East → stop 2 min at Police Chowki (4 km, 09:11) to brief armed police on Dam sabotage + ask ambulance/backup → reach Highway Crash (8 km, 09:19) → render first aid, extract injured, carry to Hospital/Forest Post (12 km, 09:35) & collect camp documents (09:42) → return to Base/Bus Stand by ~10:05.',
        'Group B (2 cadets on foot/cycles + Police unit): Proceed directly via 2 km track to Ferry Ghat (09:20) / take police backup along 6 km track or motorboat (4 km @ 10 km/h = 24 min → arrive ~09:44, 46 mins before 10:30 blast!) to cordon & neutralize sabotage with police.',
        'Group C (2 cadets on foot @ 8 km/h): Move West 2 km to Old Well (arrive 09:15), stabilize boy, carry via improvised stretcher/cart back to Rampur Village Road (09:35) to catch returning Jeep/PHC care at ~10:05.',
      ],
      timelineSummary: 'All 4 tasks resolved cleanly before 10:30 AM, leaving 2 full hours buffer before the 12:30 PM bus.',
    },
  },
  {
    id: 'gpe-02',
    title: 'GPE Case 02 — Rail Track Sabotage, Snakebite & Missing Child',
    scaleText: '1 cm = 1.5 km • Pickup Van: 45 km/h • Motorbike: 50 km/h • Foot: 6 km/h',
    brief:
      'You are 6 college friends returning from an outreach survey at Block Office (Junction Point) at 16:00 hrs. You have 1 Pickup Van (45 km/h) and 1 Motorbike (50 km/h). Your hostel gate closes at 19:00 hrs (20 km West along main highway). Four problems arise simultaneously:\n\n' +
      '1. MASS RAIL DISASTER: A trackman’s boy runs in breathless at 16:02 saying two criminals removed fishplates on the Rail Bridge (6 km North-East along feeder road) — Express Train crosses at 16:35 hrs!\n' +
      '2. MEDICAL EMERGENCY: A field worker nearby was bitten by a venomous snake 10 minutes ago and needs anti-venom at District Hospital (9 km South on Highway).\n' +
      '3. MISSING CHILD: An elderly grandmother reports her 6-year-old grandson wandered off toward the Village Fair Ground (3 km East).\n' +
      '4. VEHICLE ISSUE: Your friend’s bicycle got punctured near the Fair Ground and needs collecting before leaving.',
    landmarks: [
      { id: 'base', label: 'Block Office (16:00)', x: 200, y: 145, color: '#34c77b' },
      { id: 'rail', label: 'Rail Bridge (6 km NE)', x: 330, y: 65, color: '#e05a5a' },
      { id: 'fair', label: 'Fair Ground (3 km E)', x: 315, y: 145, color: '#d4a24c' },
      { id: 'hosp', label: 'District Hospital (9 km S)', x: 200, y: 245, color: '#5aa9e6' },
      { id: 'station', label: 'Station Master (3 km N)', x: 200, y: 65, color: '#a5b4fc' },
    ],
    edges: [
      { from: 'base', to: 'station', kind: 'road', label: '3 km' },
      { from: 'station', to: 'rail', kind: 'rail', label: '3 km rail/road' },
      { from: 'base', to: 'rail', kind: 'road', label: '6 km NE' },
      { from: 'base', to: 'fair', kind: 'track', label: '3 km' },
      { from: 'base', to: 'hosp', kind: 'road', label: '9 km S' },
    ],
    expertSolution: {
      priorities: [
        'Priority 1 (Hundreds of Lives — Hard Deadline 16:35): Alert Station Master (3 km N) AND flag down train safely short of Rail Bridge (6 km NE).',
        'Priority 2 (Fatal Countdown — Snakebite): Immobilize limb calmly and rush patient via Pickup Van straight to District Hospital (9 km S).',
        'Priority 3 (Vulnerable Child): Search Fair Ground (3 km E) with local volunteers/PA announcement & reunite with grandmother.',
        'Priority 4 (Property): Load punctured bicycle into returning Pickup Van after Fair Ground check.',
      ],
      groupAllocation: [
        'Group A (2 friends + Motorbike @ 50 km/h): Leave 16:03 → reach Station Master (3 km, 16:07) to halt Express Train signal & call RPF/Police → continue 3 km to Rail Bridge (arrive ~16:12, full 23 mins before 16:35!) with red cloth/flares & trackman to stop train well short if signal missed.',
        'Group B (2 friends + Pickup Van @ 45 km/h): Calm & immobilize snakebite victim, depart 16:04 South → reach District Hospital (9 km = 12 min → 16:16) for immediate anti-venom.',
        'Group C (2 friends on foot/hired cycle @ 6–12 km/h): Search Fair Ground (3 km E, arrive ~16:25), use fair PA mic/volunteers to trace child safely, retrieve punctured cycle when Van swings back at ~16:40 before heading to hostel well ahead of 19:00.',
      ],
      timelineSummary: 'Zero overlap in vehicle bottlenecks: fast bike handles 16:35 train cutoff + Station Master, Van handles hospital anti-venom run + later sweeps Group C & cycle.',
    },
  },
  {
    id: 'gpe-03',
    title: 'GPE Case 03 — Forest Fire, Tourist Van & Cattle Theft',
    scaleText: '1 cm = 2 km • SUV: 40 km/h • Foot: 8 km/h',
    brief:
      'Your mountaineering group of 8 is at Pine Ridge Shelter at 14:00 hrs with 1 SUV (40 km/h) and satellite/walkie-talkie link intermittently catching Forest Range Office (10 km West). Sunset is 17:45 hrs:\n\n' +
      '1. CRITICAL: Smoke & flames spotted spreading in dry pine litter 3 km South-East toward the Wooden Pine School (120 children inside) driven by afternoon breeze.\n' +
      '2. URGENT: A tourist sedan skidded off a culvert 5 km West on mountain road; driver has head injury and fuel is leaking.\n' +
      '3. LOCAL SECURITY: A shepherd reports 3 unknown men untying prize dairy cattle 2 km North along ridge path.\n' +
      '4. LOGISTIC: Need to fetch fresh kerosene/ration crates from Depot (10 km West next to Range Office) before 17:45 sunset.',
    landmarks: [
      { id: 'base', label: 'Pine Ridge Shelter (14:00)', x: 240, y: 135, color: '#34c77b' },
      { id: 'school', label: 'Pine School & Fire (3 km SE)', x: 365, y: 205, color: '#e05a5a' },
      { id: 'car', label: 'Skidded Sedan (5 km W)', x: 145, y: 135, color: '#e05a5a' },
      { id: 'range', label: 'Range Office & Depot (10 km W)', x: 55, y: 135, color: '#5aa9e6' },
      { id: 'cattle', label: 'Ridge Pasture (2 km N)', x: 240, y: 55, color: '#d4a24c' },
    ],
    edges: [
      { from: 'range', to: 'car', kind: 'road', label: '5 km' },
      { from: 'car', to: 'base', kind: 'road', label: '5 km' },
      { from: 'base', to: 'school', kind: 'track', label: '3 km SE' },
      { from: 'base', to: 'cattle', kind: 'track', label: '2 km N' },
    ],
    expertSolution: {
      priorities: [
        'Priority 1 (120 Children): Immediate evacuation of Pine School + firebreak ditching before wind pushes flames.',
        'Priority 2 (Head Injury + Fuel Leak): Shut ignition, extract injured driver safely from leaking car (5 km W), rush to Range Office/PHC (10 km W).',
        'Priority 3 (Livelihood/Theft): Intercept cattle thieves safely via noise/shepherd rally & inform Range Beat/Police.',
        'Priority 4 (Supplies): Pick up ration crates at Depot (10 km W) on SUV return.',
      ],
      groupAllocation: [
        'Group A (4 cadets on foot/run @ 8 km/h): Sprint 3 km SE to Pine School (arrive ~14:22), evacuate all 120 children & teachers to cleared open ground upwind, coordinate fire extinguishers/sand & dig 2m firebreak trench with villagers.',
        'Group B (2 cadets + SUV @ 40 km/h): Drive West 5 km (arrive 14:08), cut leaking car battery/ignition, no smoking/sparks, move injured driver to safe zone, drive 5 km further to Range Office/Clinic (arrive ~14:20) to alert fire tender + police + medical care, collect ration crates, and return to help fire/school.',
        'Group C (2 cadets + Shepherd @ 8 km/h): Move 2 km North (arrive ~14:15) carrying whistles/staffs; alert nearby villagers/ridge guards to deter thieves safely and herd cattle toward secure pen without reckless hand-to-hand escalation.',
      ],
      timelineSummary: 'All crises addressed simultaneously by 14:25 hrs; SUV brings fire support & rations back well before 17:45 sunset.',
    },
  },
];

export const GD_TOPICS = [
  {
    id: 'gd-01',
    title: 'Primary Threat to India’s Internal Security Today',
    leads: ['Cyber & Disinformation Warfare', 'Cross-Border Terrorism & Radicalization', 'Socio-Economic Inequality & Urban Crime'],
    framingTip: 'Avoid naming just one simplistically; rank impact, interconnectivity (e.g., online radicalization + narcotics funding), and concrete counter-measures.',
  },
  {
    id: 'gd-02',
    title: 'Should AI Replace Routine Human Decision-Making in Governance & Policing?',
    leads: ['Speed & Fraud Detection Benefits', 'Accountability, Bias & Privacy Risks', 'Human-in-the-Loop Hybrid Model'],
    framingTip: 'Stand for audited human-in-the-loop oversight rather than extreme "ban AI" or "automate everything".',
  },
  {
    id: 'gd-03',
    title: 'Compulsory National Service (1–2 Years) for Indian Youth After Graduation',
    leads: ['Builds National Integration & Civic Discipline', 'Fiscal Cost, Infrastructure & Career Delay Concerns', 'Targeted Expansion of NCC/Agnipath/NSS Instead'],
    framingTip: 'Use specific numbers/practical feasibility (2+ crore youth turning 18 yearly vs structured volunteer/NCC scaling).',
  },
  {
    id: 'gd-04',
    title: 'Root Cause of Brain Drain from India’s Premier Institutions',
    leads: ['Research Funding & Industry Compensation Gaps', 'Quality of Urban Infrastructure & Bureaucratic Friction', 'Reversing Flow via Deep-Tech Startups & GCC Ecosystems'],
    framingTip: 'Acknowledge legitimate aspiration while highlighting practical policy/ecosystem fixes.',
  },
  {
    id: 'gd-05',
    title: 'Balancing Rapid Infrastructure Growth vs Himalayan Ecological Fragility',
    leads: ['Strategic Border Mobility & Economic Connectivity', 'Slope Stability, Tunneling Standards & Carrying Capacity', 'Science-Backed EIA Enforcement'],
    framingTip: 'Show nuanced middle ground: build strategically *with* strict geotechnical auditing, not stopping development nor ignoring landslides.',
  },
  {
    id: 'gd-06',
    title: 'Cash Freebies vs Long-Term Capital Expenditure in State Budgets',
    leads: ['Targeted Social Safety Nets for Vulnerable Families', 'Fiscal Deficit Crowd-Out of Schools, Irrigation & Roads', 'Outcome-Linked Direct Benefit Transfers'],
    framingTip: 'Distinguish genuine targeted welfare (nutrition/education) from untargeted pre-election sops.',
  },
];
