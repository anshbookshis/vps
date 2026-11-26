import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_ITEMS } from '../src/data/catalog.js';
import {
  isDirectStreamUrl,
  buildPlayerEmbedUrl,
  fetchStreamSources,
  VIDLINK_ORIGIN,
  VIDRIFT_ORIGIN,
} from '../src/utils/vidrift.js';

test('selecting Native HLS: open-domain catalog items have verified direct HLS streams and mirrors', async () => {
  const bbb = CATALOG_ITEMS.find((x) => x.id === 'movie:test-bbb');
  assert.ok(bbb, 'Big Buck Bunny test item must exist in catalog');
  assert.ok(bbb.hlsStreamUrl, 'Big Buck Bunny must have hlsStreamUrl');
  assert.equal(isDirectStreamUrl(bbb.hlsStreamUrl), true, 'BBB hlsStreamUrl must be recognized as direct stream');

  const tos = CATALOG_ITEMS.find((x) => x.id === 'movie:test-tos');
  assert.ok(tos, 'Tears of Steel test item must exist in catalog');
  assert.ok(tos.hlsStreamUrl, 'Tears of Steel must have hlsStreamUrl');
  assert.ok(Array.isArray(tos.hlsMirrors) && tos.hlsMirrors.length >= 2, 'Tears of Steel must include backup mirrors');
  assert.equal(isDirectStreamUrl(tos.hlsStreamUrl), true);

  const sintel = CATALOG_ITEMS.find((x) => x.id === 'movie:test-sintel');
  assert.ok(sintel && isDirectStreamUrl(sintel.hlsStreamUrl), 'Sintel must have valid direct HLS stream');

  const angelOne = CATALOG_ITEMS.find((x) => x.id === 'movie:test-angel-one');
  assert.ok(angelOne && isDirectStreamUrl(angelOne.hlsStreamUrl), 'Angel One must have valid direct HLS stream');

  const sources = await fetchStreamSources(tos);
  const directHls = sources.find((s) => s.id === 'catalog-hls');
  assert.ok(directHls, 'Must resolve catalog direct HLS source');
  assert.equal(directHls.type, 'hls');
  assert.equal(directHls.direct, true);
  assert.ok(sources.some((s) => s.id.startsWith('catalog-hls-mirror-')), 'Must include mirror nodes');
});

test('commercial titles do not carry placeholder BBB/ToS hlsStreamUrl and fallback cleanly to VidLink shield', async () => {
  const interstellar = CATALOG_ITEMS.find((x) => x.tmdbId === '157336');
  const bladeRunner = CATALOG_ITEMS.find((x) => x.tmdbId === '335984');
  const cowboyBebop = CATALOG_ITEMS.find((x) => x.id === 'anime:1');

  assert.ok(interstellar, 'Interstellar must exist in catalog');
  assert.ok(bladeRunner, 'Blade Runner 2049 must exist in catalog');
  assert.ok(cowboyBebop, 'Cowboy Bebop must exist in catalog');

  assert.equal(Boolean(interstellar.hlsStreamUrl), false, 'Interstellar must not have placeholder hlsStreamUrl');
  assert.equal(Boolean(bladeRunner.hlsStreamUrl), false, 'Blade Runner 2049 must not have placeholder hlsStreamUrl');
  assert.equal(Boolean(cowboyBebop.hlsStreamUrl), false, 'Cowboy Bebop must not have placeholder hlsStreamUrl');

  const embedUrl = buildPlayerEmbedUrl(interstellar, { provider: 'hls-direct', themeId: 'default' });
  assert.ok(embedUrl.startsWith(VIDLINK_ORIGIN), 'Commercial hls-direct fallback must use VidLink shield');
  assert.equal(isDirectStreamUrl(embedUrl), false, 'Fallback embed URL must not be treated as direct stream');

  const sources = await fetchStreamSources(interstellar);
  assert.equal(sources.some((s) => s.id === 'catalog-hls'), false, 'Commercial item must not emit fake catalog-hls');
  assert.ok(sources.some((s) => s.id === 'vidlink-shield' && s.sandboxed === true));
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
  assert.equal(
    isDirectStreamUrl('https://edge.workers.dev/?url=https%3A%2F%2Fcdn.example%2Fmaster.m3u8'),
    true
  );
  assert.equal(
    isDirectStreamUrl('https://edge.workers.dev/?url=https%3A%2F%2Fvidlink.pro%2Fmovie%2F157336'),
    false
  );
});
