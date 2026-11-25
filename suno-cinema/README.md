# Suno Cinema

**Suno Cinema** *(a Suno Product)* — an Obsidian dark-mode, zero-ad movie, TV series, and anime streaming portal styled after [Suno Music (`sunov2.vercel.app/app`)](https://sunov2.vercel.app/app), combining a **7movies-grade** showcase & discovery catalog with **Suno's After-Track Music-to-Cinema Bridge**, powered by [**VidRift (`embed.vidrift.net`)**](https://vidrift.net/).

## Key Features

- **Suno Design Language & Synced Themes**: Exact `#030303` obsidian canvas, `#0f0f0f` raised cards, `#212121` top/bottom chrome, scroll-reactive `--wash-fade` ambient lighting, collapsible left rail (`240px` / `72px`), 5 Suno appearance themes (`Suno Crimson`, `Cyberpunk`, `Sunset`, `Emerald`, `Retro Gold`) + `AMOLED Pure Black` (`#000`), persisted under `suno:appearance_settings`.
- **7movies-Style Pro Streaming UX**:
  - **Cinematic Hero Spotlight Carousel** with HD backdrops, transparent title logos, trailer preview modal (`youtube-nocookie.com`), Sonic DNA tags, and quick stream actions.
  - **Top 10 Today** numbered shelf, **Trending Movies Now**, **New & Popular TV Seasons**, and **Trending Anime & OST**.
  - **Discover Catalog & Multi-Filter Engine**: Filter by **Category** (`Movies`, `TV Shows`, `Anime`), **Genre** (`Action`, `Sci-Fi`, `Drama`, `Thriller`, `Crime`, `Comedy`, `Horror`, `Romance`, `Animation`, etc.), **Year**, **Rating**, and **Sort** with paginated **Load More Titles**.
  - **Rich Episode & Cast Metadata**: TV series show cast/director chips, awards, and multi-season episode thumbnails, titles, and synopses.
- **100% Free Keyless Global APIs**:
  - **Cinemeta (`v3-cinemeta.strem.io`)**: Free keyless CORS catalogs & search for all movies and TV series, automatically resolving TMDB IDs (`moviedb_id`) for VidRift playback (with Wikidata IMDb→TMDB fallback).
  - **AniList GraphQL (`graphql.anilist.co`)**: Free keyless CORS anime discovery, trending, genre browse, and search.
  - Optional TMDB API key in Settings remains supported for extra TMDB integration.
- **After-Track Sonic Bridge & Web Audio Sonic Curtain**:
  - Pick or type any track/vibe you just finished on Suno Music to score & rank matching films across a 5D Sonic Vector and generate a 3-stage Double-Feature Arc.
  - Audition harmonic mood chords live with Web Audio + Canvas Fluid Halo visualizer before crossfading into VidRift.
- **Zero Ads & Host-Side Anti-Redirect Shield**:
  - Suno Cinema contains **zero ads or trackers**.
  - [`anti-redirect.js`](src/utils/anti-redirect.js) locks host `window.open`, enforces `noopener noreferrer`, guards against unexpected `beforeunload` navigation hijacks during Theater Mode, tracks blocked attempts live, and includes an optional **Strict Frame Isolation (`sandbox`)** toggle in Theater Mode.
- **Full VidRift (`embed.vidrift.net`) Integration**:
  - Supports `/embed/movie/{tmdbId}`, `/embed/tv/{tmdbId}/{season}/{episode}`, and `/embed/anilist/{anilistId}/{episode}` (`?dub=1` supported) with dynamic `brandColor` sync and bidirectional `postMessage` (`vidrift:progress`, `vidrift:ended`, `vidrift:exit`, `vidrift:resume`, `vidrift:play`, `vidrift:pause`).

## Running Locally

```bash
npm start
# Open http://localhost:3000
```

## Running Tests

```bash
npm test
```
