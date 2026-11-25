# Suno Cinema

**Suno Cinema** *(a Suno Product)* — an Obsidian dark-mode movie, TV series, and anime streaming companion modeled after [Suno Music (`sunov2.vercel.app/app`)](https://sunov2.vercel.app/app) and powered by [**VidRift (`embed.vidrift.net`)**](https://vidrift.net/).

Built around an unseen **"Watch After Listening"** flow: transition directly out of your last Suno track or sonic mood into a rhythmically matched film, series, or anime.

## Key Features

- **Suno Design Language & Synced Themes**: Exact `#030303` obsidian canvas, `#0f0f0f` raised cards, `#212121` top/bottom chrome, scroll-reactive `--wash-fade` ambient lighting, collapsible left rail (`240px` / `72px`), 5 Suno appearance themes (`Suno Crimson`, `Cyberpunk`, `Sunset`, `Emerald`, `Retro Gold`) + `AMOLED Pure Black` (`#000`), persisted under `suno:appearance_settings`.
- **After-Track Sonic Bridge & Web Audio Sonic Curtain**:
  - Pick from 6 iconic listening cues or type any track/artist/mood to score and re-rank films across a 5D Sonic Vector (`pulse`, `nocturne`, `warmth`, `scale`, `tension`).
  - Audition each cue's harmonic mood live using the zero-dependency Web Audio **Sonic Curtain** synthesizer paired with a reactive **Canvas Fluid Halo** visualizer, then crossfade cleanly into VidRift playback.
  - Generates a 3-stage **Double-Feature Arc** (*Opening Drop → Midnight Deep Cut → After-Credits Cooldown*).
- **Full VidRift (`embed.vidrift.net`) Integration**:
  - Supports **Movies** (`/embed/movie/{tmdbId}`), **TV Series** (`/embed/tv/{tmdbId}/{season}/{episode}` with interactive Season/Episode switcher), and **Anime** (`/embed/anilist/{anilistId}/{episode}` with Sub/Dub `?dub=1` toggle).
  - Syncs Suno's active theme accent directly into VidRift's `brandColor`, `brand=Suno Cinema`, `font=Roboto`, `controlBg=solid`, `sub`, and `uiScale`.
  - Two-way `window.postMessage` bridge (`vidrift:progress`, `vidrift:ended`, `vidrift:exit`, plus `vidrift:resume`, `vidrift:play`, `vidrift:pause`) powering real-time **Continue Watching**, the persistent `72px` **Bottom Cinema Dock**, and **After-Credits Transitions**.
- **Curated Catalog + Live Discovery + Direct Launcher**:
  - Ships with verified TMDB/AniList IDs across movies, series, and anime, plus keyless live **AniList GraphQL** search/trending, keyless **Wikidata/iTunes/TVmaze** fallback lookup, optional **TMDB API Key** support in Settings, and a **Direct TMDB / AniList URL & ID Stream Launcher**.
  - Generative SVG cinema key-art fallback guarantees zero broken images offline.

## Running Locally

```bash
npm start
# Open http://localhost:3000
```

## Running Tests

```bash
npm test
```
