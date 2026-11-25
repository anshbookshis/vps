import test from 'node:test';
import assert from 'node:assert/strict';
import { createSunoCinemaServer, rewriteHlsManifest, unmaskDisguisedSegment } from '../server.js';

test('rewriteHlsManifest resolves absolute paths and rewrites segment and key URLs through proxy', () => {
  const sampleManifest = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:10',
    '#EXT-X-KEY:METHOD=AES-128,URI="enc.key"',
    '#EXTINF:10.0,',
    'segment0.ts',
    '#EXTINF:10.0,',
    'https://cdn.example.com/hls/segment1.ts',
  ].join('\n');

  const rewritten = rewriteHlsManifest(sampleManifest, 'https://cdn.example.com/hls/master.m3u8', '/api/proxy/hls', 'https://origin.site');
  assert.ok(rewritten.includes('#EXT-X-KEY:METHOD=AES-128,URI="/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Fenc.key&referer=https%3A%2F%2Forigin.site"'));
  assert.ok(rewritten.includes('/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Fsegment0.ts&referer=https%3A%2F%2Forigin.site'));
  assert.ok(rewritten.includes('/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Fsegment1.ts&referer=https%3A%2F%2Forigin.site'));
});

test('unmaskDisguisedSegment detects and removes disguised image prefixes before MPEG-TS stream', () => {
  // Construct a disguised buffer: fake PNG header (8 bytes) + dummy header + MPEG-TS packets
  const fakePngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const packetCount = 4;
  const tsPackets = Buffer.alloc(188 * packetCount, 0xaa);
  for (let i = 0; i < packetCount; i++) {
    tsPackets[i * 188] = 0x47; // MPEG-TS sync byte
  }

  const disguised = Buffer.concat([fakePngHeader, tsPackets]);
  const unmasked = unmaskDisguisedSegment(disguised);
  assert.equal(unmasked.length, tsPackets.length);
  assert.equal(unmasked[0], 0x47);
  assert.equal(unmasked[188], 0x47);

  // Normal clean buffer passes through unmodified
  const cleanTs = Buffer.alloc(188 * 3, 0x47);
  const cleanResult = unmaskDisguisedSegment(cleanTs);
  assert.equal(cleanResult.length, cleanTs.length);
});

test('Suno Cinema HTTP server serves UI assets, catalog API, search, TV seasons, HLS proxy, and stream resolver', async () => {
  const server = createSunoCinemaServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const htmlResp = await fetch(`${base}/`);
    assert.equal(htmlResp.status, 200);
    const html = await htmlResp.text();
    assert.ok(html.includes('Suno Cinema'));
    assert.ok(html.includes('src="./src/app.js"'));

    const cssResp = await fetch(`${base}/styles.css`);
    assert.equal(cssResp.status, 200);
    const css = await cssResp.text();
    assert.ok(css.includes('--bg: #000000'));
    assert.ok(css.includes('[data-theme=\'cyberpunk\']'));

    const healthResp = await fetch(`${base}/api/health`);
    assert.equal(healthResp.status, 200);
    const health = await healthResp.json();
    assert.equal(health.ok, true);
    assert.equal(health.embedOrigin, 'https://embed.vidrift.net');
    assert.equal(health.hlsProxyEnabled, true);
    assert.equal(health.streamResolverEnabled, true);
    assert.ok(health.catalogCount >= 60);

    const catResp = await fetch(`${base}/api/catalog`);
    assert.equal(catResp.status, 200);
    const cat = await catResp.json();
    assert.ok(Array.isArray(cat.items));
    assert.ok(cat.items.some((x) => x.tmdbId === '335984' && x.title === 'Blade Runner 2049'));
    assert.ok(cat.items.some((x) => x.anilistId === '1' && x.title === 'Cowboy Bebop'));

    const searchResp = await fetch(`${base}/api/search?q=interstellar`);
    assert.equal(searchResp.status, 200);
    const search = await searchResp.json();
    assert.ok(search.items.some((x) => x.tmdbId === '157336'));

    const tvResp = await fetch(`${base}/api/tv/1396/seasons`);
    assert.equal(tvResp.status, 200);
    const tv = await tvResp.json();
    assert.equal(tv.tmdbId, '1396');
    assert.ok(tv.seasons.length >= 5);

    // Test HLS proxy options preflight and validation
    const proxyOpt = await fetch(`${base}/api/proxy/hls`, { method: 'OPTIONS' });
    assert.equal(proxyOpt.status, 204);
    assert.equal(proxyOpt.headers.get('access-control-allow-origin'), '*');

    const proxyBad = await fetch(`${base}/api/proxy/hls`);
    assert.equal(proxyBad.status, 400);

    // Test stream resolver endpoint
    const resolveResp = await fetch(`${base}/api/resolve/stream?tmdbId=157336&mediaType=movie`);
    assert.equal(resolveResp.status, 200);
    const streamData = await resolveResp.json();
    assert.equal(streamData.ok, true);
    assert.ok(Array.isArray(streamData.sources));
    assert.ok(streamData.sources.some((s) => s.id === 'vidlink-shield'));
    assert.ok(streamData.sources.some((s) => s.id === 'vidrift-sandboxed'));

    // Test stream resolver with direct HLS URL
    const directResp = await fetch(
      `${base}/api/resolve/stream?directUrl=${encodeURIComponent('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8')}`
    );
    assert.equal(directResp.status, 200);
    const directData = await directResp.json();
    assert.ok(directData.sources.some((s) => s.type === 'hls' && s.url.includes('/api/proxy/hls')));

    const travResp = await fetch(`${base}/..%2Fpackage.json`);
    assert.ok(travResp.status === 403 || travResp.status === 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
