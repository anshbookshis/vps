import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_ITEMS } from '../src/data/catalog.js';
import { isDirectStreamUrl, buildPlayerEmbedUrl, fetchStreamSources, VIDLINK_ORIGIN, VIDRIFT_ORIGIN } from '../src/utils/vidrift.js';

test('selecting Native HLS: item with direct HLS stream is verified and playable', async () => {
  const bbb = CATALOG_ITEMS.find((x) => x.id === 'movie:test-bbb');
  assert.ok(bbb, 'Big Buck Bunny test item must exist in catalog');
  assert.ok(bbb.hlsStreamUrl, 'Big Buck Bunny must have hlsStreamUrl');
  assert.equal(isDirectStreamUrl(bbb.hlsStreamUrl), true, 'hlsStreamUrl must be recognized as direct stream');

  const interstellar = CATALOG_ITEMS.find((x) => x.tmdbId === '157336');
  assert.ok(interstellar, 'Interstellar must exist in catalog');
  assert.ok(interstellar.hlsStreamUrl, 'Interstellar must have a verified direct HLS stream');
  assert.equal(isDirectStreamUrl(interstellar.hlsStreamUrl), true);

  const bladeRunner = CATALOG_ITEMS.find((x) => x.tmdbId === '335984');
  assert.ok(bladeRunner, 'Blade Runner 2049 must exist in catalog');
  assert.ok(bladeRunner.hlsStreamUrl, 'Blade Runner must have a verified direct HLS stream');
  assert.equal(isDirectStreamUrl(bladeRunner.hlsStreamUrl), true);

  const sources = await fetchStreamSources(interstellar);
  const directHls = sources.find((s) => s.id === 'catalog-hls');
  assert.ok(directHls, 'Must resolve catalog direct HLS source');
  assert.equal(directHls.type, 'hls');
  assert.equal(directHls.direct, true);
});

test('selecting Native HLS: item without direct stream cleanly switches to VidLink shield player', () => {
  const movieWithoutDirect = CATALOG_ITEMS.find((x) => x.tmdbId === '26815'); // Rocket Singh
  assert.ok(movieWithoutDirect);
  assert.equal(Boolean(movieWithoutDirect.hlsStreamUrl), false, 'Rocket Singh has no direct HLS stream');

  // When provider is hls-direct but no direct stream exists:
  // buildPlayerEmbedUrl must return sandboxed VidLink, never VidRift HTML embed
  const embedUrl = buildPlayerEmbedUrl(movieWithoutDirect, { provider: 'hls-direct', themeId: 'default' });
  assert.ok(embedUrl.startsWith(VIDLINK_ORIGIN), 'Fallback embed URL must use VidLink shield');
  assert.equal(embedUrl.includes(VIDRIFT_ORIGIN), false, 'Must never return unshielded or VidRift embed');
  assert.equal(isDirectStreamUrl(embedUrl), false, 'Embed URL must not be classified as direct stream');
});

test('isDirectStreamUrl strictly rejects embed players and HTML pages', () => {
  assert.equal(isDirectStreamUrl('https://embed.vidrift.net/embed/movie/26815'), false);
  assert.equal(isDirectStreamUrl('https://vidlink.pro/movie/26815'), false);
  assert.equal(isDirectStreamUrl('https://domain.example/player.html?id=123'), false);
  assert.equal(isDirectStreamUrl('https://domain.example/stream.htm'), false);
  assert.equal(isDirectStreamUrl('https://domain.example/watch/embed/456'), false);

  assert.equal(isDirectStreamUrl('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'), true);
  assert.equal(isDirectStreamUrl('https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8'), true);
  assert.equal(isDirectStreamUrl('/api/proxy/hls?url=https%3A%2F%2Ftest.example%2Fmaster.m3u8'), true);
});
