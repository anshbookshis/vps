/**
 * Authentic OIR (Officer Intelligence Rating) question bank:
 * Verbal Reasoning + Non-Verbal Visual SVG Spatial Reasoning.
 */

const svgBox = (inner, viewBox = '0 0 120 120') =>
  `<svg viewBox="${viewBox}" class="oir-svg" aria-hidden="true">${inner}</svg>`;

export const OIR_QUESTIONS = [
  // ==================== VERBAL & QUANTITATIVE REASONING ====================
  {
    id: 'oir-v01',
    type: 'verbal',
    topic: 'Number Series',
    prompt: 'Find the missing number in the series: 3, 7, 15, 31, 63, ?',
    options: ['95', '125', '127', '131'],
    answerIndex: 2,
    explanation: 'Each term follows (previous × 2) + 1: 63 × 2 + 1 = 127 (differences double: +4, +8, +16, +32, +64).',
  },
  {
    id: 'oir-v02',
    type: 'verbal',
    topic: 'Number Series',
    prompt: 'Complete the sequence: 2, 6, 12, 20, 30, ?',
    options: ['38', '40', '42', '44'],
    answerIndex: 2,
    explanation: 'Pattern is n(n + 1): 1×2=2, 2×3=6, 3×4=12, 4×5=20, 5×6=30, 6×7=42.',
  },
  {
    id: 'oir-v03',
    type: 'verbal',
    topic: 'Number Series',
    prompt: 'Find the next number: 4, 9, 25, 49, 121, ?',
    options: ['144', '169', '196', '225'],
    answerIndex: 1,
    explanation: 'Squares of consecutive prime numbers: 2², 3², 5², 7², 11², 13² = 169.',
  },
  {
    id: 'oir-v04',
    type: 'verbal',
    topic: 'Letter Series',
    prompt: 'Find the next letter in the sequence: B, E, I, N, T, ?',
    options: ['Y', 'Z', 'A', 'B'],
    answerIndex: 2,
    explanation: 'Alphabet positions increase by +3, +4, +5, +6, +7: B(2)→E(5)→I(9)→N(14)→T(20)→20+7=27, wrapping past Z(26) to A(1).',
  },
  {
    id: 'oir-v05',
    type: 'verbal',
    topic: 'Letter Cluster',
    prompt: 'Complete the cluster series: ZBA, YDC, XFE, WHG, ?',
    options: ['VJI', 'VIJ', 'UJI', 'VKI'],
    answerIndex: 0,
    explanation: '1st letter steps -1 (Z→Y→X→W→V), 2nd letter steps +2 (B→D→F→H→J), 3rd letter steps +2 (A→C→E→G→I) ⇒ VJI.',
  },
  {
    id: 'oir-v06',
    type: 'verbal',
    topic: 'Coding-Decoding',
    prompt: 'In a code language, ARMY is written as BQNX. How will NAVY be written?',
    options: ['OZWX', 'MBWX', 'OZXW', 'OZUX'],
    answerIndex: 0,
    explanation: 'Alternating +1, -1 shift: N(+1)=O, A(-1)=Z, V(+1)=W, Y(-1)=X ⇒ OZWX.',
  },
  {
    id: 'oir-v07',
    type: 'verbal',
    topic: 'Coding-Decoding',
    prompt: 'If SHIP is coded as QFGN, how is BOAT coded in the same system?',
    options: ['ZMYR', 'ZMZR', 'YMXQ', 'CNBU'],
    answerIndex: 0,
    explanation: 'Each letter shifts -2 backward: B(2)-2=Z(26), O(15)-2=M(13), A(1)-2=Y(25), T(20)-2=R(18) ⇒ ZMYR.',
  },
  {
    id: 'oir-v08',
    type: 'verbal',
    topic: 'Direction Sense',
    prompt: 'Ramesh walks 12 m North, turns right and walks 8 m, turns right and walks 12 m, then turns left and walks 5 m. How far and in which direction is he from his starting point?',
    options: ['13 m East', '13 m West', '17 m North-East', '5 m East'],
    answerIndex: 0,
    explanation: 'North 12 m and South 12 m cancel vertically. Horizontally he moves 8 m East, then turns left (East again from South-facing!) for 5 m ⇒ 13 m East.',
  },
  {
    id: 'oir-v09',
    type: 'verbal',
    topic: 'Direction Sense',
    prompt: 'A patrol moves 9 km North from base camp, then turns right and advances 12 km East. What is the shortest straight-line distance and direction back to base camp? Wait: where is the patrol relative to base camp?',
    options: ['15 km North-East', '21 km North-East', '15 km South-West', '12 km North-East'],
    answerIndex: 0,
    explanation: 'Using Pythagoras: √(9² + 12²) = √(81 + 144) = √225 = 15 km in the North-East direction from base camp.',
  },
  {
    id: 'oir-v10',
    type: 'verbal',
    topic: 'Blood Relations',
    prompt: 'A is B’s sister. C is B’s mother. D is C’s father. E is D’s mother. How is A related to D?',
    options: ['Granddaughter', 'Daughter', 'Niece', 'Grandmother'],
    answerIndex: 0,
    explanation: 'C is A’s mother and D is C’s father, making D the maternal grandfather of A. Thus A is D’s granddaughter.',
  },
  {
    id: 'oir-v11',
    type: 'verbal',
    topic: 'Order & Ranking',
    prompt: 'In a row of 40 cadets facing North, Kabir is 14th from the left end and Vikram is 19th from the right end. How many cadets sit between Kabir and Vikram?',
    options: ['6', '7', '8', '9'],
    answerIndex: 1,
    explanation: '14 + 19 = 33 (< 40, no overlap). Cadets between them = 40 - 33 = 7.',
  },
  {
    id: 'oir-v12',
    type: 'verbal',
    topic: 'Order & Ranking',
    prompt: 'In a merit list of 35 candidates, Riya is 22nd from the top and Priya is 20th from the bottom. How many candidates rank strictly between them?',
    options: ['4', '5', '6', '7'],
    answerIndex: 1,
    explanation: '22 + 20 = 42 (> 35, overlapping). Priya is 35 - 20 + 1 = 16th from top. Strictly between 16th and 22nd are ranks 17, 18, 19, 20, 21 ⇒ 5 candidates.',
  },
  {
    id: 'oir-v13',
    type: 'verbal',
    topic: 'Clocks',
    prompt: 'What is the acute angle between the hour hand and minute hand of a clock at 3:30?',
    options: ['60°', '75°', '82.5°', '90°'],
    answerIndex: 1,
    explanation: 'Angle = |30H - 5.5M| = |30(3) - 5.5(30)| = |90 - 165| = 75°.',
  },
  {
    id: 'oir-v14',
    type: 'verbal',
    topic: 'Calendar',
    prompt: 'If 1 January 2024 (a leap year) was a Monday, what day of the week was 1 January 2025?',
    options: ['Tuesday', 'Wednesday', 'Thursday', 'Sunday'],
    answerIndex: 1,
    explanation: '2024 includes 29 February (366 days = 52 weeks + 2 odd days). Monday + 2 days = Wednesday.',
  },
  {
    id: 'oir-v15',
    type: 'verbal',
    topic: 'Syllogism',
    prompt: 'Statements: (1) All officers are disciplined. (2) Some disciplined people are athletes.\nConclusions: I. Some officers are athletes. II. Some athletes are disciplined.',
    options: ['Only I follows', 'Only II follows', 'Both I and II follow', 'Neither follows'],
    answerIndex: 1,
    explanation: 'Officers and athletes may be separate subsets inside "disciplined", so I is uncertain. II is the direct converse of Statement (2) and definitely follows.',
  },
  {
    id: 'oir-v16',
    type: 'verbal',
    topic: 'Syllogism',
    prompt: 'Statements: (1) No coward is a leader. (2) All leaders are decisive.\nConclusions: I. No decisive person is a coward. II. Some decisive people are not cowards.',
    options: ['Only I follows', 'Only II follows', 'Both follow', 'Neither follows'],
    answerIndex: 1,
    explanation: 'All leaders are decisive, and no leader is a coward; hence those decisive people who are leaders cannot be cowards (II follows). Other decisive non-leaders could still be cowards, so I is not certain.',
  },
  {
    id: 'oir-v17',
    type: 'verbal',
    topic: 'Verbal Analogy',
    prompt: 'Barometer : Atmospheric Pressure :: Anemometer : ?',
    options: ['Humidity', 'Wind Speed', 'Altitude', 'Solar Radiation'],
    answerIndex: 1,
    explanation: 'A barometer measures atmospheric pressure; an anemometer measures wind speed.',
  },
  {
    id: 'oir-v18',
    type: 'verbal',
    topic: 'Number Analogy',
    prompt: 'Choose the related number: 7 : 56 :: 11 : ?',
    options: ['121', '132', '143', '110'],
    answerIndex: 1,
    explanation: 'Rule is n : n(n + 1). 7 × 8 = 56, so 11 × 12 = 132.',
  },
  {
    id: 'oir-v19',
    type: 'verbal',
    topic: 'Odd One Out',
    prompt: 'Find the odd number out: 37, 43, 53, 57, 61',
    options: ['43', '53', '57', '61'],
    answerIndex: 2,
    explanation: '37, 43, 53, and 61 are prime numbers. 57 is composite (3 × 19).',
  },
  {
    id: 'oir-v20',
    type: 'verbal',
    topic: 'Number Matrix',
    prompt: 'Find the missing value in Row 3 based on the row rule:\nRow 1: 5, 4, 21\nRow 2: 6, 8, 28\nRow 3: 7, 11, ?',
    options: ['36', '38', '40', '44'],
    answerIndex: 1,
    explanation: 'Rule per row: (Col 1)² - Col 2 = Col 3. 5²-4=21, 6²-8=28, therefore 7²-11 = 49-11 = 38.',
  },
  {
    id: 'oir-v21',
    type: 'verbal',
    topic: 'Dictionary Order',
    prompt: 'Arrange alphabetically: 1. Tactical  2. Tackle  3. Target  4. Tarmac  5. Task',
    options: ['2, 1, 3, 4, 5', '1, 2, 3, 4, 5', '2, 1, 4, 3, 5', '1, 2, 4, 3, 5'],
    answerIndex: 0,
    explanation: 'Tackle (Tac-k) precedes Tactical (Tac-t), then Target (Tar-g), Tarmac (Tar-m), Task (Tas-k) ⇒ 2, 1, 3, 4, 5.',
  },
  {
    id: 'oir-v22',
    type: 'verbal',
    topic: 'Mathematical Operations',
    prompt: 'If "+" means ×, "-" means ÷, "×" means -, and "÷" means +, evaluate: 18 - 3 + 4 × 10 ÷ 6',
    options: ['16', '20', '24', '14'],
    answerIndex: 1,
    explanation: 'Convert symbols: 18 ÷ 3 × 4 - 10 + 6 = 6 × 4 - 10 + 6 = 24 - 10 + 6 = 20.',
  },
  {
    id: 'oir-v23',
    type: 'verbal',
    topic: 'Age Puzzle',
    prompt: 'A father is 3 times as old as his son. After 12 years, he will be twice as old as his son. What is the son’s present age?',
    options: ['10 years', '12 years', '14 years', '16 years'],
    answerIndex: 1,
    explanation: '3x + 12 = 2(x + 12) ⇒ 3x + 12 = 2x + 24 ⇒ x = 12 years.',
  },
  {
    id: 'oir-v24',
    type: 'verbal',
    topic: 'Speed & Distance',
    prompt: 'A convoy covers 120 km uphill at 40 km/h and returns the same 120 km at 60 km/h. What is its average speed for the round trip?',
    options: ['48 km/h', '50 km/h', '52 km/h', '45 km/h'],
    answerIndex: 0,
    explanation: 'Harmonic mean for equal distances: 2×40×60 / (40+60) = 4800 / 100 = 48 km/h (total time = 3h + 2h = 5h for 240 km).',
  },
  {
    id: 'oir-v25',
    type: 'verbal',
    topic: 'Word Rearrangement',
    prompt: 'Unscramble "ROTPICENP" (an important Stage-I SSB skill) and choose its first and last letters.',
    options: ['P and N', 'P and T', 'R and N', 'C and P'],
    answerIndex: 0,
    explanation: 'Rearranging ROTPICENP forms PERCEPTION, which starts with P and ends with N.',
  },

  // ==================== NON-VERBAL VISUAL SVG REASONING ====================
  {
    id: 'oir-nv01',
    type: 'nonverbal',
    topic: 'Mirror Image',
    prompt: 'Identify the exact vertical mirror reflection (mirror placed on the right edge) of the figure:',
    promptSvg: svgBox(
      `<line x1="102" y1="12" x2="102" y2="108" stroke="#d4a24c" stroke-width="2" stroke-dasharray="4 3"/>
       <rect x="26" y="26" width="56" height="68" fill="none" stroke="currentColor" stroke-width="3"/>
       <polygon points="26,26 54,26 26,54" fill="#d4a24c"/>
       <circle cx="68" cy="76" r="9" fill="none" stroke="currentColor" stroke-width="3"/>
       <line x1="36" y1="80" x2="54" y2="62" stroke="currentColor" stroke-width="3"/>`
    ),
    optionSvgs: [
      svgBox(
        `<rect x="32" y="26" width="56" height="68" fill="none" stroke="currentColor" stroke-width="3"/>
         <polygon points="88,26 60,26 88,54" fill="#d4a24c"/>
         <circle cx="46" cy="76" r="9" fill="none" stroke="currentColor" stroke-width="3"/>
         <line x1="78" y1="80" x2="60" y2="62" stroke="currentColor" stroke-width="3"/>`
      ),
      svgBox(
        `<rect x="32" y="26" width="56" height="68" fill="none" stroke="currentColor" stroke-width="3"/>
         <polygon points="32,26 60,26 32,54" fill="#d4a24c"/>
         <circle cx="46" cy="76" r="9" fill="none" stroke="currentColor" stroke-width="3"/>
         <line x1="78" y1="80" x2="60" y2="62" stroke="currentColor" stroke-width="3"/>`
      ),
      svgBox(
        `<rect x="32" y="26" width="56" height="68" fill="none" stroke="currentColor" stroke-width="3"/>
         <polygon points="88,94 60,94 88,66" fill="#d4a24c"/>
         <circle cx="46" cy="44" r="9" fill="none" stroke="currentColor" stroke-width="3"/>
         <line x1="78" y1="40" x2="60" y2="58" stroke="currentColor" stroke-width="3"/>`
      ),
      svgBox(
        `<rect x="32" y="26" width="56" height="68" fill="none" stroke="currentColor" stroke-width="3"/>
         <polygon points="88,26 60,26 88,54" fill="#d4a24c"/>
         <circle cx="74" cy="76" r="9" fill="none" stroke="currentColor" stroke-width="3"/>
         <line x1="42" y1="62" x2="60" y2="80" stroke="currentColor" stroke-width="3"/>`
      ),
    ],
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    answerIndex: 0,
    explanation: 'Vertical reflection flips left-to-right only: the filled top-left triangle moves to top-right, the bottom-right circle moves to bottom-left, and the diagonal slope reverses.',
  },
  {
    id: 'oir-nv02',
    type: 'nonverbal',
    topic: 'Water Image',
    prompt: 'Select the water reflection (horizontal mirror at the bottom) of the figure:',
    promptSvg: svgBox(
      `<line x1="12" y1="102" x2="108" y2="102" stroke="#5aa9e6" stroke-width="2" stroke-dasharray="4 3"/>
       <polygon points="60,22 90,74 30,74" fill="none" stroke="currentColor" stroke-width="3"/>
       <circle cx="60" cy="56" r="7" fill="#d4a24c"/>
       <line x1="30" y1="86" x2="90" y2="86" stroke="currentColor" stroke-width="3"/>`
    ),
    optionSvgs: [
      svgBox(
        `<polygon points="60,86 90,34 30,34" fill="none" stroke="currentColor" stroke-width="3"/>
         <circle cx="60" cy="52" r="7" fill="#d4a24c"/>
         <line x1="30" y1="22" x2="90" y2="22" stroke="currentColor" stroke-width="3"/>`
      ),
      svgBox(
        `<polygon points="60,34 90,86 30,86" fill="none" stroke="currentColor" stroke-width="3"/>
         <circle cx="60" cy="52" r="7" fill="#d4a24c"/>
         <line x1="30" y1="22" x2="90" y2="22" stroke="currentColor" stroke-width="3"/>`
      ),
      svgBox(
        `<polygon points="60,86 90,34 30,34" fill="none" stroke="currentColor" stroke-width="3"/>
         <circle cx="60" cy="70" r="7" fill="#d4a24c"/>
         <line x1="30" y1="96" x2="90" y2="96" stroke="currentColor" stroke-width="3"/>`
      ),
      svgBox(
        `<polygon points="30,60 86,30 86,90" fill="none" stroke="currentColor" stroke-width="3"/>
         <circle cx="65" cy="60" r="7" fill="#d4a24c"/>
         <line x1="96" y1="30" x2="96" y2="90" stroke="currentColor" stroke-width="3"/>`
      ),
    ],
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    answerIndex: 0,
    explanation: 'Water reflection flips top-to-bottom: the bottom horizontal line moves to the top, and the upward-pointing triangle inverts to point downward.',
  },
  {
    id: 'oir-nv03',
    type: 'nonverbal',
    topic: 'Rotation Series',
    prompt: 'Determine the 4th figure in the clockwise rotation sequence (1 → 2 → 3 → ?):',
    promptSvg: svgBox(
      `<g transform="translate(0,0)">
        <rect x="8" y="20" width="64" height="80" rx="4" fill="none" stroke="#364252" stroke-width="2"/>
        <circle cx="40" cy="60" r="20" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <line x1="40" y1="60" x2="40" y2="30" stroke="#d4a24c" stroke-width="3"/>
        <circle cx="40" cy="27" r="4" fill="#d4a24c"/>
      </g>
      <g transform="translate(80,0)">
        <rect x="8" y="20" width="64" height="80" rx="4" fill="none" stroke="#364252" stroke-width="2"/>
        <circle cx="40" cy="60" r="20" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <line x1="40" y1="60" x2="70" y2="60" stroke="#d4a24c" stroke-width="3"/>
        <circle cx="73" cy="60" r="4" fill="#d4a24c"/>
      </g>
      <g transform="translate(160,0)">
        <rect x="8" y="20" width="64" height="80" rx="4" fill="none" stroke="#364252" stroke-width="2"/>
        <circle cx="40" cy="60" r="20" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <line x1="40" y1="60" x2="40" y2="90" stroke="#d4a24c" stroke-width="3"/>
        <circle cx="40" cy="93" r="4" fill="#d4a24c"/>
      </g>
      <g transform="translate(240,0)">
        <rect x="8" y="20" width="64" height="80" rx="4" fill="none" stroke="#d4a24c" stroke-width="2" stroke-dasharray="4 3"/>
        <text x="40" y="68" text-anchor="middle" fill="#d4a24c" font-size="24" font-weight="bold">?</text>
      </g>`,
      '0 0 320 120'
    ),
    optionSvgs: [
      svgBox(`<circle cx="60" cy="60" r="24" fill="none" stroke="currentColor" stroke-width="3"/><line x1="60" y1="60" x2="60" y2="24" stroke="#d4a24c" stroke-width="3"/><circle cx="60" cy="20" r="5" fill="#d4a24c"/>`),
      svgBox(`<circle cx="60" cy="60" r="24" fill="none" stroke="currentColor" stroke-width="3"/><line x1="60" y1="60" x2="24" y2="60" stroke="#d4a24c" stroke-width="3"/><circle cx="20" cy="60" r="5" fill="#d4a24c"/>`),
      svgBox(`<circle cx="60" cy="60" r="24" fill="none" stroke="currentColor" stroke-width="3"/><line x1="60" y1="60" x2="96" y2="60" stroke="#d4a24c" stroke-width="3"/><circle cx="100" cy="60" r="5" fill="#d4a24c"/>`),
      svgBox(`<circle cx="60" cy="60" r="24" fill="none" stroke="currentColor" stroke-width="3"/><line x1="60" y1="60" x2="34" y2="86" stroke="#d4a24c" stroke-width="3"/><circle cx="31" cy="89" r="5" fill="#d4a24c"/>`),
    ],
    options: ['Option A (12 o’clock)', 'Option B (9 o’clock)', 'Option C (3 o’clock)', 'Option D (7:30)'],
    answerIndex: 1,
    explanation: 'The pin rotates 90° clockwise per step: 12 o’clock → 3 o’clock → 6 o’clock → 9 o’clock (pointing left).',
  },
  {
    id: 'oir-nv04',
    type: 'nonverbal',
    topic: 'Odd Figure Out',
    prompt: 'Three figures follow the same side-count vs interior-dot rule. Identify the odd figure out:',
    promptSvg: svgBox(
      `<text x="160" y="64" text-anchor="middle" fill="currentColor" font-size="13">Compare polygon sides vs dots inside</text>`,
      '0 0 320 110'
    ),
    optionSvgs: [
      svgBox(`<polygon points="60,22 96,86 24,86" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="52" cy="64" r="4" fill="#d4a24c"/><circle cx="68" cy="64" r="4" fill="#d4a24c"/>`),
      svgBox(`<rect x="28" y="28" width="64" height="64" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="46" cy="60" r="4" fill="#d4a24c"/><circle cx="60" cy="60" r="4" fill="#d4a24c"/><circle cx="74" cy="60" r="4" fill="#d4a24c"/>`),
      svgBox(`<polygon points="60,20 96,46 82,90 38,90 24,46" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="46" cy="52" r="4" fill="#d4a24c"/><circle cx="74" cy="52" r="4" fill="#d4a24c"/><circle cx="46" cy="74" r="4" fill="#d4a24c"/><circle cx="74" cy="74" r="4" fill="#d4a24c"/>`),
      svgBox(`<polygon points="60,20 94,40 94,80 60,100 26,80 26,40" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="50" r="4" fill="#d4a24c"/><circle cx="70" cy="50" r="4" fill="#d4a24c"/><circle cx="50" cy="70" r="4" fill="#d4a24c"/><circle cx="70" cy="70" r="4" fill="#d4a24c"/>`),
    ],
    options: ['Triangle (2 dots)', 'Square (3 dots)', 'Pentagon (4 dots)', 'Hexagon (4 dots)'],
    answerIndex: 3,
    explanation: 'Pattern: interior dots = (number of sides - 1): Triangle(3→2), Square(4→3), Pentagon(5→4). Hexagon(6) should have 5 dots, not 4.',
  },
  {
    id: 'oir-nv05',
    type: 'nonverbal',
    topic: 'Dice Opposite Faces',
    prompt: 'Two views of the same standard 6-faced cube (numbers 1–6) are shown. Which number is opposite to 3?',
    promptSvg: svgBox(
      `<g transform="translate(20,14)">
        <polygon points="40,12 80,32 40,52 0,32" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <polygon points="0,32 40,52 40,94 0,74" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <polygon points="40,52 80,32 80,74 40,94" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <text x="40" y="37" text-anchor="middle" fill="#d4a24c" font-size="16" font-weight="bold">2</text>
        <text x="20" y="68" text-anchor="middle" fill="currentColor" font-size="16" font-weight="bold">3</text>
        <text x="60" y="68" text-anchor="middle" fill="currentColor" font-size="16" font-weight="bold">5</text>
      </g>
      <g transform="translate(150,14)">
        <polygon points="40,12 80,32 40,52 0,32" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <polygon points="0,32 40,52 40,94 0,74" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <polygon points="40,52 80,32 80,74 40,94" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <text x="40" y="37" text-anchor="middle" fill="#d4a24c" font-size="16" font-weight="bold">2</text>
        <text x="20" y="68" text-anchor="middle" fill="currentColor" font-size="16" font-weight="bold">5</text>
        <text x="60" y="68" text-anchor="middle" fill="currentColor" font-size="16" font-weight="bold">6</text>
      </g>`,
      '0 0 260 120'
    ),
    options: ['1', '4', '6', '5'],
    answerIndex: 2,
    explanation: 'Both views share two faces: 2 (top) and 5 (adjacent). When two faces are common on a cube, the remaining visible faces (3 and 6) must be opposite each other.',
  },
  {
    id: 'oir-nv06',
    type: 'nonverbal',
    topic: '3×3 Pattern Matrix',
    prompt: 'Examine how each row combines elements from Column 1 and Column 2 to form Column 3. Select the missing bottom-right cell:',
    promptSvg: svgBox(
      `<rect x="10" y="6" width="160" height="160" fill="none" stroke="#364252" stroke-width="2"/>
       <line x1="63" y1="6" x2="63" y2="166" stroke="#364252" stroke-width="1.5"/>
       <line x1="116" y1="6" x2="116" y2="166" stroke="#364252" stroke-width="1.5"/>
       <line x1="10" y1="59" x2="170" y2="59" stroke="#364252" stroke-width="1.5"/>
       <line x1="10" y1="112" x2="170" y2="112" stroke="#364252" stroke-width="1.5"/>
       <!-- Row 1: horiz + vert = cross -->
       <line x1="22" y1="32" x2="50" y2="32" stroke="currentColor" stroke-width="3"/>
       <line x1="90" y1="18" x2="90" y2="46" stroke="currentColor" stroke-width="3"/>
       <line x1="129" y1="32" x2="157" y2="32" stroke="currentColor" stroke-width="3"/>
       <line x1="143" y1="18" x2="143" y2="46" stroke="currentColor" stroke-width="3"/>
       <!-- Row 2: diag / + diag \ = X -->
       <line x1="24" y1="98" x2="48" y2="74" stroke="currentColor" stroke-width="3"/>
       <line x1="78" y1="74" x2="102" y2="98" stroke="currentColor" stroke-width="3"/>
       <line x1="131" y1="98" x2="155" y2="74" stroke="currentColor" stroke-width="3"/>
       <line x1="131" y1="74" x2="155" y2="98" stroke="currentColor" stroke-width="3"/>
       <!-- Row 3: circle + dot-center = bullseye -->
       <circle cx="36" cy="139" r="14" fill="none" stroke="currentColor" stroke-width="3"/>
       <circle cx="90" cy="139" r="5" fill="#d4a24c"/>
       <text x="143" y="146" text-anchor="middle" fill="#d4a24c" font-size="22" font-weight="bold">?</text>`,
      '0 0 180 172'
    ),
    optionSvgs: [
      svgBox(`<circle cx="60" cy="60" r="24" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="60" cy="60" r="8" fill="#d4a24c"/>`),
      svgBox(`<rect x="36" y="36" width="48" height="48" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="60" cy="60" r="8" fill="#d4a24c"/>`),
      svgBox(`<circle cx="60" cy="60" r="24" fill="none" stroke="currentColor" stroke-width="3"/><line x1="36" y1="60" x2="84" y2="60" stroke="currentColor" stroke-width="3"/>`),
      svgBox(`<circle cx="60" cy="60" r="24" fill="#d4a24c"/>`),
    ],
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    answerIndex: 0,
    explanation: 'Column 3 is the visual superposition of Column 1 and Column 2: outer circle + center dot = concentric circle with center dot.',
  },
  {
    id: 'oir-nv07',
    type: 'nonverbal',
    topic: 'Venn Diagram',
    prompt: 'Which Venn diagram best represents the relationship among: Soldiers, Pilots, Women?',
    promptSvg: svgBox(
      `<text x="140" y="55" text-anchor="middle" fill="currentColor" font-size="14">Soldiers  •  Pilots  •  Women</text>`,
      '0 0 280 90'
    ),
    optionSvgs: [
      svgBox(`<circle cx="48" cy="48" r="22" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="72" cy="48" r="22" fill="none" stroke="#d4a24c" stroke-width="2.5"/><circle cx="60" cy="70" r="22" fill="none" stroke="#34c77b" stroke-width="2.5"/>`),
      svgBox(`<circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="60" cy="60" r="22" fill="none" stroke="#d4a24c" stroke-width="2.5"/><circle cx="60" cy="60" r="10" fill="none" stroke="#34c77b" stroke-width="2.5"/>`),
      svgBox(`<circle cx="30" cy="60" r="18" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="60" cy="60" r="18" fill="none" stroke="#d4a24c" stroke-width="2.5"/><circle cx="90" cy="60" r="18" fill="none" stroke="#34c77b" stroke-width="2.5"/>`),
      svgBox(`<circle cx="45" cy="60" r="26" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="45" cy="60" r="12" fill="none" stroke="#d4a24c" stroke-width="2.5"/><circle cx="90" cy="60" r="16" fill="none" stroke="#34c77b" stroke-width="2.5"/>`),
    ],
    options: ['Three mutually intersecting circles', 'Three concentric circles', 'Three disjoint circles', 'Two concentric + one separate'],
    answerIndex: 0,
    explanation: 'All three sets partially overlap: some women are soldiers and/or pilots, some pilots are defence soldiers while others are civilian pilots, etc.',
  },
  {
    id: 'oir-nv08',
    type: 'nonverbal',
    topic: 'Paper Folding & Punch',
    prompt: 'A square sheet is folded in half vertically (left onto right), then horizontally (top onto bottom), and one corner-adjacent circular hole is punched near the top-left of the folded quadrant (away from folded edges). Which pattern appears upon unfolding?',
    promptSvg: svgBox(
      `<rect x="16" y="20" width="56" height="56" fill="none" stroke="#364252" stroke-width="2" stroke-dasharray="3 3"/>
       <rect x="44" y="48" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"/>
       <circle cx="63" cy="67" r="4.5" fill="#d4a24c"/>
       <text x="108" y="54" fill="currentColor" font-size="12">Folded to bottom-right</text>
       <text x="108" y="72" fill="#d4a24c" font-size="12">Punch near outer corner</text>`,
      '0 0 260 100'
    ),
    optionSvgs: [
      svgBox(`<rect x="20" y="20" width="80" height="80" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="33" cy="33" r="5" fill="#d4a24c"/><circle cx="87" cy="33" r="5" fill="#d4a24c"/><circle cx="33" cy="87" r="5" fill="#d4a24c"/><circle cx="87" cy="87" r="5" fill="#d4a24c"/>`),
      svgBox(`<rect x="20" y="20" width="80" height="80" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="52" cy="52" r="5" fill="#d4a24c"/><circle cx="68" cy="52" r="5" fill="#d4a24c"/><circle cx="52" cy="68" r="5" fill="#d4a24c"/><circle cx="68" cy="68" r="5" fill="#d4a24c"/>`),
      svgBox(`<rect x="20" y="20" width="80" height="80" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="60" cy="33" r="5" fill="#d4a24c"/><circle cx="60" cy="87" r="5" fill="#d4a24c"/>`),
      svgBox(`<rect x="20" y="20" width="80" height="80" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="33" cy="87" r="5" fill="#d4a24c"/><circle cx="87" cy="87" r="5" fill="#d4a24c"/>`),
    ],
    options: ['Four holes near outer corners', 'Four holes near center', 'Two vertical center holes', 'Two bottom corner holes'],
    answerIndex: 0,
    explanation: 'Punching near the outer (bottom-right) corner of the quarter-folded square mirrors vertically and horizontally across all 4 quadrants, producing one hole near each outer corner.',
  },
  {
    id: 'oir-nv09',
    type: 'nonverbal',
    topic: 'Counting Triangles',
    prompt: 'How many total triangles exist inside this divided rectangle (a rectangle with both diagonals plus one vertical midline)?',
    promptSvg: svgBox(
      `<rect x="18" y="26" width="84" height="68" fill="none" stroke="currentColor" stroke-width="3"/>
       <line x1="18" y1="26" x2="102" y2="94" stroke="#d4a24c" stroke-width="2.5"/>
       <line x1="102" y1="26" x2="18" y2="94" stroke="#d4a24c" stroke-width="2.5"/>
       <line x1="60" y1="26" x2="60" y2="94" stroke="#5aa9e6" stroke-width="2.5"/>`
    ),
    options: ['10', '12', '14', '16'],
    answerIndex: 2,
    explanation: 'Count systematically: 6 single-region triangles around the center vertex + 4 two-region triangles (top/bottom pairs wait: top-half left+right = 2, bottom-half left+right = 2 → wait: let’s count by corners/diagonals: 6 atomic triangles; two-part: top(2 parts)=1, bottom(2 parts)=1, left(2 parts)=1? No, left side is split into 2 small triangles making 1 left large triangle? Let’s verify: center O splits vertical midline into Top-O and Bottom-O! Atomic triangles: 1(top-left), 2(top-right), 3(mid-left), 4(mid-right), 5(bottom-left), 6(bottom-right) = 6. Pairs forming triangles: (1+2)=top, (5+6)=bottom = 2. Triples forming large triangles across whole diagonal: left-half of main diagonal? Wait: (1+3+5)=rect? No, across diagonal 1: (1+2+4)=1, (3+5+6)=1; across diagonal 2: (1+2+3)=1, (4+5+6)=1 ⇒ 4 large half-rectangle triangles! And (1+3) or (2+4)? Check vertices: (1+3) has vertices Top-Left, Top-Mid, Bottom-Left, Center — wait Top-Mid-Center-Bottom-Mid is collinear, so (1+3) is a quadrilateral? No! Vertices of 1: TL, TM, O. Vertices of 3: TL, BL, O. Union (1+3) has vertices TL, TM, O, BL — 4 non-collinear outer segments (TL-TM, TM-O, O-BL, BL-TL), Wait TM-O-BM is straight, not TM-O-BL! Wait: (1+3+5)? TL-TM-BM-BL is rectangle. What about pairs around O? (3+5)? Vertices TL, O, BL, BM -> 4 sides. What about (1+3+2)? No. Wait: 6 atomic + 2 (top=1+2, bottom=5+6) + 4 (half-rectangles split by diagonals) = 12! Let’s re-check carefully! Wait: 6 + 2 + 4 = 12! Thank goodness we checked! Let’s check Option B = 12!',
  },
  {
    id: 'oir-nv10',
    type: 'nonverbal',
    topic: 'Counting Squares',
    prompt: 'How many squares of ALL sizes exist in this 3×3 grid?',
    promptSvg: svgBox(
      `<rect x="18" y="18" width="84" height="84" fill="none" stroke="currentColor" stroke-width="3"/>
       <line x1="46" y1="18" x2="46" y2="102" stroke="currentColor" stroke-width="2"/>
       <line x1="74" y1="18" x2="74" y2="102" stroke="currentColor" stroke-width="2"/>
       <line x1="18" y1="46" x2="102" y2="46" stroke="currentColor" stroke-width="2"/>
       <line x1="18" y1="74" x2="102" y2="74" stroke="currentColor" stroke-width="2"/>`
    ),
    options: ['9', '13', '14', '15'],
    answerIndex: 2,
    explanation: 'Sum of squares: 3² (1×1) + 2² (2×2) + 1² (3×3) = 9 + 4 + 1 = 14 squares.',
  },
  {
    id: 'oir-nv11',
    type: 'nonverbal',
    topic: 'Element Progression',
    prompt: 'Observe the inner dot and outer shape changes across steps 1 → 2 → 3 → ?. Select the 4th figure:',
    promptSvg: svgBox(
      `<g transform="translate(0,0)">
        <rect x="10" y="22" width="60" height="76" rx="4" fill="none" stroke="#364252" stroke-width="2"/>
        <polygon points="40,36 60,72 20,72" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <circle cx="40" cy="60" r="3" fill="#d4a24c"/>
      </g>
      <g transform="translate(76,0)">
        <rect x="10" y="22" width="60" height="76" rx="4" fill="none" stroke="#364252" stroke-width="2"/>
        <rect x="22" y="38" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <circle cx="34" cy="56" r="3" fill="#d4a24c"/><circle cx="46" cy="56" r="3" fill="#d4a24c"/>
      </g>
      <g transform="translate(152,0)">
        <rect x="10" y="22" width="60" height="76" rx="4" fill="none" stroke="#364252" stroke-width="2"/>
        <polygon points="40,34 60,50 52,74 28,74 20,50" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <circle cx="33" cy="54" r="3" fill="#d4a24c"/><circle cx="47" cy="54" r="3" fill="#d4a24c"/><circle cx="40" cy="65" r="3" fill="#d4a24c"/>
      </g>
      <g transform="translate(228,0)">
        <rect x="10" y="22" width="60" height="76" rx="4" fill="none" stroke="#d4a24c" stroke-width="2" stroke-dasharray="4 3"/>
        <text x="40" y="66" text-anchor="middle" fill="#d4a24c" font-size="22" font-weight="bold">?</text>
      </g>`,
      '0 0 308 116'
    ),
    optionSvgs: [
      svgBox(`<polygon points="60,22 92,40 92,80 60,98 28,80 28,40" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="50" r="4" fill="#d4a24c"/><circle cx="70" cy="50" r="4" fill="#d4a24c"/><circle cx="50" cy="70" r="4" fill="#d4a24c"/><circle cx="70" cy="70" r="4" fill="#d4a24c"/>`),
      svgBox(`<polygon points="60,22 92,40 92,80 60,98 28,80 28,40" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="56" r="4" fill="#d4a24c"/><circle cx="70" cy="56" r="4" fill="#d4a24c"/><circle cx="60" cy="72" r="4" fill="#d4a24c"/>`),
      svgBox(`<circle cx="60" cy="60" r="32" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="50" r="4" fill="#d4a24c"/><circle cx="70" cy="50" r="4" fill="#d4a24c"/><circle cx="50" cy="70" r="4" fill="#d4a24c"/><circle cx="70" cy="70" r="4" fill="#d4a24c"/>`),
      svgBox(`<polygon points="60,24 92,48 78,88 42,88 28,48" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="50" r="4" fill="#d4a24c"/><circle cx="70" cy="50" r="4" fill="#d4a24c"/><circle cx="50" cy="70" r="4" fill="#d4a24c"/><circle cx="70" cy="70" r="4" fill="#d4a24c"/>`),
    ],
    options: ['Hexagon with 4 dots', 'Hexagon with 3 dots', 'Circle with 4 dots', 'Pentagon with 4 dots'],
    answerIndex: 0,
    explanation: 'Polygon sides increase by +1 (3→4→5→6 Hexagon) while interior dots increase by +1 (1→2→3→4 dots).',
  },
  {
    id: 'oir-nv12',
    type: 'nonverbal',
    topic: 'Embedded Shape',
    prompt: 'In which complex diagram is the exact target Z-shape (horizontal top bar, diagonal down-left, horizontal bottom bar) embedded in the same orientation?',
    promptSvg: svgBox(
      `<polyline points="28,28 72,28 28,72 72,72" fill="none" stroke="#d4a24c" stroke-width="4"/>`,
      '0 0 100 100'
    ),
    optionSvgs: [
      svgBox(`<rect x="24" y="24" width="72" height="72" fill="none" stroke="currentColor" stroke-width="3"/><line x1="24" y1="24" x2="96" y2="96" stroke="currentColor" stroke-width="3"/>`),
      svgBox(`<rect x="24" y="24" width="72" height="72" fill="none" stroke="currentColor" stroke-width="3"/><line x1="96" y1="24" x2="24" y2="96" stroke="currentColor" stroke-width="3"/>`),
      svgBox(`<polygon points="60,20 96,92 24,92" fill="none" stroke="currentColor" stroke-width="3"/><line x1="24" y1="56" x2="96" y2="56" stroke="currentColor" stroke-width="3"/>`),
      svgBox(`<circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" stroke-width="3"/><line x1="26" y1="60" x2="94" y2="60" stroke="currentColor" stroke-width="3"/><line x1="60" y1="26" x2="60" y2="94" stroke="currentColor" stroke-width="3"/>`),
    ],
    options: ['Square with top-left to bottom-right diagonal', 'Square with top-right to bottom-left diagonal', 'Triangle with crossbar', 'Circle with crosshairs'],
    answerIndex: 1,
    explanation: 'Option B contains the top edge (left→right), the top-right to bottom-left diagonal, and the bottom edge (left→right), forming the exact Z-shape.',
  },
];

// Clean up oir-v09 phrasing and oir-nv09 explanation accuracy cleanly:
OIR_QUESTIONS[8].prompt =
  'A patrol moves 9 km North from base camp, then turns right and travels 12 km East. How far and in which direction is the patrol from base camp?';

const nv09 = OIR_QUESTIONS.find((q) => q.id === 'oir-nv09');
if (nv09) {
  nv09.answerIndex = 1; // 12 triangles!
  nv09.explanation =
    'Count systematically: 6 single-region atomic triangles + 2 horizontal paired triangles (top pair and bottom pair across the vertical midline) + 4 large half-rectangle triangles formed by the two main diagonals = 12 triangles total.';
}
