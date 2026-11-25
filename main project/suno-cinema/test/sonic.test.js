import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SONIC_PROFILES,
  inferSonicProfileFromText,
  scoreFilmForTrack,
  buildAfterTrackMatches,
} from '../src/utils/sonic-engine.js';
import { buildCinemaFallbackArt } from '../src/utils/poster-art.js';
import { CATALOG_ITEMS } from '../src/data/catalog.js';

test('inferSonicProfileFromText parses free-text track moods into clamped vectors', () => {
  const synth = inferSonicProfileFromText('dark midnight synthwave drive');
  assert.equal(synth.id, 'midnight-synth');
  assert.ok(synth.vector.nocturne >= 0.9 && synth.vector.nocturne <= 1);

  const lofi = inferSonicProfileFromText('chill 3am rain lofi piano');
  assert.equal(lofi.id, 'lofi-rain');
  assert.ok(lofi.vector.warmth >= 0.8);
});

test('buildAfterTrackMatches ranks catalog accurately and creates 3 distinct arc stages', () => {
  const imaxProfile = SONIC_PROFILES.find((p) => p.id === 'imax-sub');
  const { ranked, arc } = buildAfterTrackMatches(CATALOG_ITEMS, imaxProfile);

  assert.ok(ranked.length >= 40);
  const top5Titles = ranked.slice(0, 6).map((x) => x.title);
  assert.ok(
    top5Titles.includes('Interstellar') || top5Titles.includes('Dune') || top5Titles.includes('Oppenheimer')
  );

  assert.equal(arc.length, 3);
  const arcIds = new Set(arc.map((s) => s.item.id));
  assert.equal(arcIds.size, 3);

  const scoreObj = scoreFilmForTrack(CATALOG_ITEMS[0], imaxProfile);
  assert.ok(scoreObj.score >= 58 && scoreObj.score <= 99);
  assert.match(scoreObj.reason, /Sonic Match/);
});

test('buildCinemaFallbackArt generates valid XML-escaped SVG data URIs', () => {
  const uri = buildCinemaFallbackArt({
    title: 'Love & <Cinema>',
    creator: 'A & B',
    year: '2024',
    mediaType: 'movie',
    tmdbId: '123',
  });
  assert.ok(uri.startsWith('data:image/svg+xml;charset=utf-8,'));
  const decoded = decodeURIComponent(uri.split(',')[1]);
  assert.ok(decoded.includes('Love &amp; &lt;Cinema&gt;'));
  assert.ok(decoded.includes('SUNO CINEMA'));
});
