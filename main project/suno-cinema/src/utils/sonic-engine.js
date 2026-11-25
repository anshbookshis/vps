/**
 * Suno Sonic-to-Cinema Matching Engine.
 * Bridges the moment a listener finishes a song on Suno Music into
 * an emotionally and rhythmically synchronized movie, series, or anime.
 */

export const SONIC_PROFILES = [
  {
    id: 'midnight-synth',
    trackTitle: 'Midnight City / Nightcall',
    artistCue: 'M83 • Kavinsky • Timecop1983',
    bpm: 96,
    keySignature: 'A Minor 9',
    moodLabel: 'Midnight Synth & Neon Asphalt',
    curtainPatch: 'midnight-synth',
    color: '#ff0033',
    vector: { pulse: 0.72, nocturne: 0.96, warmth: 0.34, scale: 0.68, tension: 0.74 },
    promptHints: ['synth', 'synthwave', 'neon', 'night', 'drive', 'kavinsky', 'm83', 'blade', 'cyber', 'electric', '80s'],
    description: 'Rain-slicked highways, analog arpeggios, and luminous midnight isolation.',
  },
  {
    id: 'imax-sub',
    trackTitle: 'Cornfield Chase / Time',
    artistCue: 'Hans Zimmer • Ludwig Göransson • Gesaffelstein',
    bpm: 82,
    keySignature: 'A5 Sub Organ',
    moodLabel: 'Sub-Bass & IMAX Architecture',
    curtainPatch: 'imax-sub',
    color: '#f59e0b',
    vector: { pulse: 0.84, nocturne: 0.64, warmth: 0.42, scale: 0.99, tension: 0.92 },
    promptHints: ['bass', 'sub', 'zimmer', 'orchestral', 'epic', 'space', 'dune', 'oppenheimer', 'tenet', 'organ', 'imax', 'heavy'],
    description: 'Tectonic sub-bass swells, relentless ticking ostinatos, and monumental scale.',
  },
  {
    id: 'lofi-rain',
    trackTitle: 'Nights / Chamber of Reflection',
    artistCue: 'Frank Ocean • Mac DeMarco • Ryuichi Sakamoto',
    bpm: 74,
    keySignature: 'C Major 9',
    moodLabel: '3 AM Rain on Apartment Glass',
    curtainPatch: 'lofi-rain',
    color: '#00f0ff',
    vector: { pulse: 0.28, nocturne: 0.88, warmth: 0.86, scale: 0.32, tension: 0.34 },
    promptHints: ['lofi', 'lo-fi', 'rain', 'frank', 'chill', 'sad', 'ambient', 'piano', 'late', 'sleep', 'warm', 'dream'],
    description: 'Soft tape hiss, longing melodies, and intimate late-night city solitude.',
  },
  {
    id: 'jazz-smoke',
    trackTitle: 'Caravan / So What',
    artistCue: 'Justin Hurwitz • Miles Davis • Kamasi Washington',
    bpm: 118,
    keySignature: 'D Minor 9',
    moodLabel: 'Brass, Smoke & Percussion Velocity',
    curtainPatch: 'jazz-smoke',
    color: '#fbbf24',
    vector: { pulse: 0.88, nocturne: 0.72, warmth: 0.78, scale: 0.48, tension: 0.76 },
    promptHints: ['jazz', 'drums', 'brass', 'soul', 'funk', 'whiplash', 'bebop', 'sax', 'groove', 'vinyl', 'smoke'],
    description: 'Blistering snare syncopation, smoky club acoustics, and obsessive craft.',
  },
  {
    id: 'anime-neon',
    trackTitle: 'Tank! / I Really Want to Stay at Your House',
    artistCue: 'Yoko Kanno • RADWIMPS • Kensuke Ushio',
    bpm: 128,
    keySignature: 'D Minor 11',
    moodLabel: 'Tokyo Overdrive & Anime OST',
    curtainPatch: 'anime-neon',
    color: '#ff4d6d',
    vector: { pulse: 0.92, nocturne: 0.76, warmth: 0.56, scale: 0.74, tension: 0.82 },
    promptHints: ['anime', 'jpop', 'rock', 'ost', 'tokyo', 'cyberpunk', 'bebop', 'radwimps', 'fast', 'breakbeat', 'kawaii'],
    description: 'Hyper-kinetic breaks, bittersweet vocal hooks, and neon skyline catharsis.',
  },
  {
    id: 'indie-tape',
    trackTitle: 'Everything In Its Right Place / Motion Sickness',
    artistCue: 'Radiohead • Phoebe Bridgers • Jon Brion',
    bpm: 88,
    keySignature: 'B Minor 11',
    moodLabel: '16mm Tape Hiss & Memory Drift',
    curtainPatch: 'indie-tape',
    color: '#10b981',
    vector: { pulse: 0.44, nocturne: 0.62, warmth: 0.82, scale: 0.42, tension: 0.58 },
    promptHints: ['indie', 'radiohead', 'guitar', 'folk', 'rock', 'memory', 'nostalgia', 'aftersun', 'phoebe', 'shoegaze', 'acoustic'],
    description: 'Detuned guitars, sun-bleached nostalgia, and aching emotional turns.',
  },
];

export const SCORE_MOODS = [
  { id: 'midnight-synth', label: 'Midnight Synth', color: '#ff0033' },
  { id: 'imax-sub', label: 'Sub-Bass & IMAX', color: '#f59e0b' },
  { id: 'lofi-rain', label: '3 AM Lo-Fi Rain', color: '#00f0ff' },
  { id: 'jazz-smoke', label: 'Jazz & Brass Pulse', color: '#fbbf24' },
  { id: 'anime-neon', label: 'Tokyo Anime OST', color: '#ff4d6d' },
  { id: 'indie-tape', label: '16mm Indie Tape', color: '#10b981' },
  { id: 'adrenaline-break', label: 'Breakbeat Heist', color: '#a855f7' },
  { id: 'post-rock', label: 'Post-Rock Catharsis', color: '#38bdf8' },
];

const KEYWORD_MODIFIERS = [
  { words: ['dark', 'night', 'midnight', 'rain', 'noir', 'neon', '3am'], delta: { nocturne: 0.25, tension: 0.1 } },
  { words: ['bass', 'heavy', 'trap', 'edm', 'techno', 'rave', 'hype', 'fast', 'gym'], delta: { pulse: 0.28, tension: 0.2, scale: 0.15 } },
  { words: ['chill', 'calm', 'sleep', 'ambient', 'acoustic', 'warm', 'love', 'soft'], delta: { warmth: 0.25, pulse: -0.25, tension: -0.22 } },
  { words: ['epic', 'space', 'cinema', 'orchestra', 'symphony', 'choir', 'trailer'], delta: { scale: 0.3, tension: 0.15 } },
  { words: ['jazz', 'soul', 'funk', 'blues', 'lounge', 'brass'], delta: { warmth: 0.18, pulse: 0.14, nocturne: 0.12 } },
  { words: ['anime', 'tokyo', 'cyberpunk', 'vocaloid', 'j-pop', 'rock'], delta: { pulse: 0.2, nocturne: 0.15, scale: 0.1 } },
];

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Infer a 5D Sonic Vector and closest Suno Sonic Profile from any free-text song/artist/vibe.
 * @param {string} query
 */
export function inferSonicProfileFromText(query) {
  const clean = String(query || '').trim();
  const lower = clean.toLowerCase();
  if (!lower) return SONIC_PROFILES[0];

  // Check if query matches a preset id or strong hint directly
  let bestPreset = SONIC_PROFILES[0];
  let bestHits = -1;
  for (const profile of SONIC_PROFILES) {
    let hits = 0;
    if (profile.id === lower) hits += 10;
    if (profile.trackTitle.toLowerCase().includes(lower)) hits += 6;
    if (profile.artistCue.toLowerCase().includes(lower)) hits += 5;
    for (const hint of profile.promptHints) {
      if (lower.includes(hint)) hits += 2;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestPreset = profile;
    }
  }

  const vec = { ...bestPreset.vector };
  for (const mod of KEYWORD_MODIFIERS) {
    if (mod.words.some((w) => lower.includes(w))) {
      for (const [k, d] of Object.entries(mod.delta)) {
        vec[k] = clamp01((vec[k] ?? 0.5) + d);
      }
    }
  }

  return {
    ...bestPreset,
    customQuery: clean,
    trackTitle: bestHits >= 6 ? bestPreset.trackTitle : clean,
    vector: vec,
  };
}

/**
 * Score how tightly a film/series/anime matches an active Sonic Profile.
 * @param {object} item
 * @param {object} profile
 * @returns {{ score: number, reason: string }}
 */
export function scoreFilmForTrack(item, profile) {
  const target = profile?.vector || SONIC_PROFILES[0].vector;
  const v = item?.sonic?.vector || { pulse: 0.5, nocturne: 0.5, warmth: 0.5, scale: 0.5, tension: 0.5 };

  const keys = ['pulse', 'nocturne', 'warmth', 'scale', 'tension'];
  let sqDist = 0;
  for (const k of keys) {
    const diff = (v[k] ?? 0.5) - (target[k] ?? 0.5);
    sqDist += diff * diff;
  }
  const rms = Math.sqrt(sqDist / keys.length);
  let affinity = Math.round((1 - rms) * 100);

  if (item?.sonic?.moodId && item.sonic.moodId === profile?.id) {
    affinity = Math.min(99, affinity + 9);
  }
  if (profile?.customQuery) {
    const q = profile.customQuery.toLowerCase();
    const hay = `${item.title} ${(item.genres || []).join(' ')} ${item.sonic?.listenBefore || ''} ${item.sonic?.texture || ''}`.toLowerCase();
    if (hay.includes(q)) affinity = Math.min(99, affinity + 8);
  }

  affinity = Math.max(58, Math.min(99, affinity));
  const texture = item?.sonic?.texture || 'Synced Atmospheric Score';
  const bpmNote = item?.sonic?.bpm ? `${item.sonic.bpm} BPM feel` : 'Dynamic Pace';
  return {
    score: affinity,
    reason: `${affinity}% Sonic Match • ${texture} (${bpmNote})`,
  };
}

/**
 * Rank catalog items for a song/mood and construct a 3-stage "After the Track" arc.
 * @param {Array<object>} catalog
 * @param {object} profile
 */
export function buildAfterTrackMatches(catalog, profile) {
  const ranked = (catalog || [])
    .map((item) => {
      const match = scoreFilmForTrack(item, profile);
      return { ...item, sonicMatch: match };
    })
    .sort((a, b) => b.sonicMatch.score - a.sonicMatch.score);

  const openingDrop = ranked[0] || null;
  const deepCut = ranked.find((x) => x.id !== openingDrop?.id && (x.sonic?.vector?.nocturne ?? 0) >= 0.7) || ranked[1] || null;
  const coolDown =
    ranked.find((x) => x.id !== openingDrop?.id && x.id !== deepCut?.id && (x.sonic?.vector?.warmth ?? 0) >= 0.65) ||
    ranked[2] ||
    null;

  return {
    ranked,
    arc: [
      openingDrop ? { stage: '1 • Opening Drop', note: 'Immediate continuation of your track energy', item: openingDrop } : null,
      deepCut ? { stage: '2 • Midnight Deep Cut', note: 'Slow-burn visual immersion', item: deepCut } : null,
      coolDown ? { stage: '3 • After-Credits Cooldown', note: 'Warm decompression before sleep', item: coolDown } : null,
    ].filter(Boolean),
  };
}
