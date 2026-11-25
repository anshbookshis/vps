# SSB Command — Practical SSB Aspirant Workbench

A zero-dependency, offline-first Services Selection Board (SSB) training workbench built for NDA, CDS, AFCAT, TES, TGC, NCC, and SSC Tech aspirants. Every timer, buzzer cue, assessment heuristic, and drill reflects real 5-day SSB screening, psychological testing, personal interview, and GTO procedures.

## Core Modules

1. **Stage I — Screening Drills (Day 1)**
   - **OIR Speed Test**: Timed Verbal & Non-Verbal reasoning sets (including SVG spatial, mirror, dice, matrix, and pattern puzzles) with pace delta and step-by-step explanations.
   - **PPDT Simulator**: Authentic `30s` hazy image exposure → auto-hide → `1m` character box (`Age/Sex/Mood`) & Action → `4m` Story writing (supports both **Type Mode** and **Pen & Paper Projector Mode**) → `1m` **Voice-Recorded Narration** with immediate playback & duration target (`45–55s`) + custom local image upload.

2. **Stage II — Psychological Battery (Day 2)**
   - **TAT (11 Hazy Scenes + 12th Blank Slide)**: `30s` view + `4m` writing per slide with Web Audio invigilator chimes, adjustable haze intensity, Pen & Paper mode, custom local picture pack support, and story structure/agency audit.
   - **WAT (3 Full 60-Word Sets = 180 Words)**: `15s` per word auto-advance, exact reaction-time capture, and automated flagging of preachy modals (`should`/`must`), defeatist framing, and first-person overuse.
   - **SRT (60 Real-Life Situations)**: `30m` timed mode (or 15/30-card sprint), live pace-vs-target indicator (`30s/situation`), action-completeness audit, and model rationale comparisons.
   - **SD (Self-Description Builder)**: `15m` 5-paragraph timer with cliché/weakness checks and PIQ cross-consistency notes.

3. **PIQ & Interviewing Officer (IO) Grill**
   - **Interactive PIQ Form**: Academic trajectory (`10th`, `12th`, `Graduation`), family/siblings, hobbies, sports, PORs, and previous SSB history.
   - **Dynamic IO Question Generator**: Automatically calculates academic percentage shifts, gap years, and hobby/sport technical depths to generate targeted IO cross-questions.
   - **CIQ Rapid-Fire Simulator**: Multi-part rapid-fire question clusters with live voice recording, playback, and sub-question coverage checklist.

4. **GTO — Lecturette, GPE & GD Toolkit (Days 3–4)**
   - **Lecturette Booth**: 12 curated 4-topic cards (`3m` prep scratchpad + `3m` voice-recorded speech with `2:30` warning chime).
   - **GPE Tactical Workbench**: Interactive SVG tactical maps with live **Distance-Speed-Time Calculator**, priority matrix, resource/group splitter, `10m` planning timer, and expert solution breakdown.
   - **GD Prompt Cards**: Balanced two-sided discussion topics with key talking dimensions.

5. **Offline Persistence & Mentor Export**
   - Stores all sessions locally in `localStorage` (zero accounts or external APIs).
   - Export/Import complete JSON backups or generate a clean **Markdown Study Dossier** for mentor/peer review.

## Running Locally

```bash
cd ssb-prep
npm start
# Open http://localhost:3000
```

## Running Tests

```bash
cd ssb-prep
npm test
```
