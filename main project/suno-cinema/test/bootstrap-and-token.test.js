import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  signPlayToken,
  verifyPlayToken,
  parseByteRange,
  createHlsSegmentCache,
  resolveDebridCandidates,
  isRateLimitOrFakeStream,
  rewriteHlsManifest as serverRewriteHlsManifest,
  createSunoCinemaServer,
} from '../server.js';
import worker, {
  signPlayTokenWorker,
  verifyPlayTokenWorker,
  isRateLimitOrFakeStream as workerIsRateLimitOrFakeStream,
  rewriteHlsManifest as workerRewriteHlsManifest,
} from '../cloudflare-hls-proxy.js';
import {
  resolveBootstrapOrigin,
  fetchPlayToken,
  resolveJellyfinStream,
  buildHlsProxyUrl,
  classifyDirectStreamKind,
} from '../src/utils/vidrift.js';
import { loadPlayerPrefs, savePlayerPrefs } from '../src/utils/storage.js';
import { renderSettingsSheet, renderStreamSourcesModal } from '../src/components/modals.js';

test('signPlayToken and verifyPlayToken (Node server): HMAC-SHA256 signing, path scoping, and tamper resistance', () => {
  const streamUrl = 'https://vod.example.com/hls/movies/master.m3u8';
  const secret = 'custom-test-secret-key-12345';

  // 1. Valid token with exact URL
  const token = signPlayToken(streamUrl, { secret, expiresInSeconds: 3600, id: 'tt1234567' });
  assert.ok(typeof token === 'string' && token.includes('.'), 'Token must be header.signature format');

  const verifyExact = verifyPlayToken(token, streamUrl, { secret });
  assert.strictEqual(verifyExact.valid, true);
  assert.strictEqual(verifyExact.payload?.url, streamUrl);
  assert.strictEqual(verifyExact.payload?.id, 'tt1234567');

  // 2. Path scoping: token issued for master.m3u8 authorizes child segments in the same path prefix
  const segmentUrl = 'https://vod.example.com/hls/movies/segment_0001.ts';
  const verifySegment = verifyPlayToken(token, segmentUrl, { secret });
  assert.strictEqual(verifySegment.valid, true, 'Scoped segment URL must be authorized by master playlist token');

  // 3. Different domain or parent directory is rejected
  const outsideUrl = 'https://attacker.example.com/hls/movies/segment_0001.ts';
  const verifyOutside = verifyPlayToken(token, outsideUrl, { secret });
  assert.strictEqual(verifyOutside.valid, false);
  assert.strictEqual(verifyOutside.error, 'Token scope mismatch');

  // 4. Tampered payload is rejected
  const [b64Payload, sig] = token.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ url: 'https://other.com', exp: 9999999999 })).toString('base64url');
  const tamperedToken = `${tamperedPayload}.${sig}`;
  const verifyTampered = verifyPlayToken(tamperedToken, streamUrl, { secret });
  assert.strictEqual(verifyTampered.valid, false);
  assert.strictEqual(verifyTampered.error, 'Invalid token signature');

  // 5. Expired token is rejected
  const expiredToken = signPlayToken(streamUrl, { secret, exp: Math.floor(Date.now() / 1000) - 60 });
  const verifyExpired = verifyPlayToken(expiredToken, streamUrl, { secret });
  assert.strictEqual(verifyExpired.valid, false);
  assert.strictEqual(verifyExpired.error, 'Token expired');
});

test('signPlayTokenWorker and verifyPlayTokenWorker (Cloudflare Worker WebCrypto)', async () => {
  const streamUrl = 'https://edge.example.com/vod/stream/index.m3u8';
  const secret = 'cf-worker-secret-pass-999';

  const token = await signPlayTokenWorker(streamUrl, { expiresInSeconds: 1800 }, secret);
  assert.ok(typeof token === 'string' && token.includes('.'));

  const verified = await verifyPlayTokenWorker(token, streamUrl, {}, secret);
  assert.strictEqual(verified.valid, true);
  assert.strictEqual(verified.payload?.url, streamUrl);

  const segmentUrl = 'https://edge.example.com/vod/stream/720p/chunk0.m4s';
  const verifiedChild = await verifyPlayTokenWorker(token, segmentUrl, {}, secret);
  assert.strictEqual(verifiedChild.valid, true);

  const wrongSecret = await verifyPlayTokenWorker(token, streamUrl, {}, 'different-secret');
  assert.strictEqual(wrongSecret.valid, false);
});

test('rewriteHlsManifest propagates &token= to segment and media track URLs', () => {
  const manifest = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,URI="audio/en.m3u8"
#EXTINF:9.009,
segment_000.ts
#EXTINF:9.009,
segment_001.ts
#EXT-X-ENDLIST`;

  const baseUrl = 'https://origin.example.com/vod/master.m3u8';
  const token = 'payload123.sig456';

  // Server rewrite
  const serverRewritten = serverRewriteHlsManifest(manifest, baseUrl, '/api/proxy/hls', 'https://origin.example.com', token);
  assert.ok(serverRewritten.includes('URI="/api/proxy/hls?url=https%3A%2F%2Forigin.example.com%2Fvod%2Faudio%2Fen.m3u8&referer=https%3A%2F%2Forigin.example.com&token=payload123.sig456"'));
  assert.ok(serverRewritten.includes('/api/proxy/hls?url=https%3A%2F%2Forigin.example.com%2Fvod%2Fsegment_000.ts&referer=https%3A%2F%2Forigin.example.com&token=payload123.sig456'));

  // Worker rewrite
  const workerRewritten = workerRewriteHlsManifest(manifest, baseUrl, '/api/proxy/hls', 'https://origin.example.com', token);
  assert.ok(workerRewritten.includes('token=payload123.sig456'));
});

test('createHlsSegmentCache and parseByteRange: LRU bounded cache with Range slicing', () => {
  // Test parseByteRange
  assert.deepStrictEqual(parseByteRange('bytes=0-499', 1000), { start: 0, end: 499 });
  assert.deepStrictEqual(parseByteRange('bytes=500-', 1000), { start: 500, end: 999 });
  assert.deepStrictEqual(parseByteRange('bytes=-200', 1000), { start: 800, end: 999 });
  assert.strictEqual(parseByteRange('invalid', 1000), null);
  assert.strictEqual(parseByteRange('bytes=1500-2000', 1000), null);

  // Test LRU Cache with 1KB max capacity
  const cache = createHlsSegmentCache({ maxBytes: 1024, maxEntries: 4 });
  const chunk1 = Buffer.alloc(400, 1);
  const chunk2 = Buffer.alloc(400, 2);
  const chunk3 = Buffer.alloc(400, 3);

  cache.set('https://example.com/chunk1.ts', chunk1);
  cache.set('https://example.com/chunk2.ts', chunk2);

  assert.strictEqual(cache.has('https://example.com/chunk1.ts'), true);
  assert.strictEqual(cache.has('https://example.com/chunk2.ts'), true);

  // Getting chunk1 updates its accessedAt
  const entry1 = cache.get('https://example.com/chunk1.ts');
  assert.ok(entry1);
  assert.strictEqual(entry1.size, 400);

  // Inserting chunk3 (400 bytes) puts total at 1200 > 1024 maxBytes -> evicts chunk2 (least recently accessed)
  cache.set('https://example.com/chunk3.ts', chunk3);

  assert.strictEqual(cache.has('https://example.com/chunk1.ts'), true, 'chunk1 was accessed recently so it stays');
  assert.strictEqual(cache.has('https://example.com/chunk2.ts'), false, 'chunk2 was oldest so it is evicted');
  assert.strictEqual(cache.has('https://example.com/chunk3.ts'), true);

  const stats = cache.getStats();
  assert.strictEqual(stats.entries, 2);
  assert.strictEqual(stats.bytes, 800);
  assert.ok(stats.hits >= 1);
});

test('HTTP Server routes: /api/bootstrap, /api/play, and /api/backend/status', async () => {
  const server = createSunoCinemaServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. /api/bootstrap
    const bootResp = await fetch(`${baseUrl}/api/bootstrap`);
    assert.strictEqual(bootResp.status, 200);
    const bootData = await bootResp.json();
    assert.strictEqual(bootData.version, '1.0.0');
    assert.ok(Array.isArray(bootData.mirrors));
    assert.ok(typeof bootData.descriptor === 'string');
    const decodedDescriptor = JSON.parse(Buffer.from(bootData.descriptor, 'base64').toString('utf8'));
    assert.ok(decodedDescriptor.timestamp);
    assert.ok(decodedDescriptor.activeOrigin);

    // 2. /api/play
    const testStreamUrl = 'https://vod.example.com/feature/master.m3u8';
    const playResp = await fetch(`${baseUrl}/api/play?url=${encodeURIComponent(testStreamUrl)}&exp=1800&id=test-film`);
    assert.strictEqual(playResp.status, 200);
    const playData = await playResp.json();
    assert.ok(playData.token);
    assert.strictEqual(playData.streamUrl, testStreamUrl);
    assert.ok(playData.expiresAt > Math.floor(Date.now() / 1000));
    assert.ok(playData.proxyUrl.includes('token='));

    // 3. /api/backend/status
    const statusResp = await fetch(`${baseUrl}/api/backend/status`);
    assert.strictEqual(statusResp.status, 200);
    const statusData = await statusResp.json();
    assert.strictEqual(statusData.status, 'ready');
    assert.strictEqual(typeof statusData.tmdb?.configured, 'boolean');
    assert.strictEqual(typeof statusData.debrid?.configured, 'boolean');
    assert.strictEqual(typeof statusData.jellyfin?.configured, 'boolean');
    assert.strictEqual(typeof statusData.tokenVerification?.enabled, 'boolean');
    assert.ok(statusData.cache && typeof statusData.cache.entries === 'number');

    // 4. Test client resolveBootstrapOrigin against this live server
    const clientBoot = await resolveBootstrapOrigin([baseUrl]);
    assert.strictEqual(clientBoot.status, 'ok');
    assert.ok(clientBoot.activeOrigin);
    assert.ok(clientBoot.latencyMs >= 0);

    // 5. Test client fetchPlayToken against this live server
    const clientToken = await fetchPlayToken(testStreamUrl, { hlsProxyUrl: baseUrl });
    assert.ok(clientToken?.token);
    assert.ok(clientToken?.proxyUrl);
  } finally {
    server.close();
  }
});

test('Cloudflare Worker routes: /api/bootstrap, /api/play, and /api/backend/status', async () => {
  const env = {
    SUNO_PLAY_SECRET: 'test-cf-secret-xyz',
    REQUIRE_PLAY_TOKEN: 'false',
    TMDB_API_KEY: 'test-tmdb-key-32chars',
    TORBOX_API_KEY: 'test-torbox-key',
  };

  // /api/bootstrap
  const bootReq = new Request('https://worker.local/api/bootstrap');
  const bootResp = await worker.fetch(bootReq, env);
  assert.strictEqual(bootResp.status, 200);
  const bootData = await bootResp.json();
  assert.strictEqual(bootData.version, '1.0.0');
  assert.ok(bootData.descriptor);

  // /api/play
  const target = 'https://vod.example.com/worker-test/master.m3u8';
  const playReq = new Request(`https://worker.local/api/play?url=${encodeURIComponent(target)}`);
  const playResp = await worker.fetch(playReq, env);
  assert.strictEqual(playResp.status, 200);
  const playData = await playResp.json();
  assert.ok(playData.token);
  assert.ok(playData.proxyUrl.includes('token='));

  // /api/backend/status
  const statusReq = new Request('https://worker.local/api/backend/status');
  const statusResp = await worker.fetch(statusReq, env);
  assert.strictEqual(statusResp.status, 200);
  const statusData = await statusResp.json();
  assert.strictEqual(statusData.status, 'ready');
  assert.strictEqual(statusData.tmdb.configured, true);
  assert.strictEqual(statusData.debrid.configured, true);
  assert.strictEqual(statusData.debrid.provider, 'torbox');
});

async function withMockLocalStorage(initialMap, fn) {
  const store = new Map(Object.entries(initialMap || {}));
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const prevDescriptor = hadOwn ? Object.getOwnPropertyDescriptor(globalThis, 'localStorage') : null;
  const mockStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, val) {
      store.set(key, String(val));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
  try {
    return await fn(mockStorage);
  } finally {
    if (hadOwn) {
      Object.defineProperty(globalThis, 'localStorage', prevDescriptor);
    } else {
      delete globalThis.localStorage;
    }
  }
}

test('storage.js bootstrapMirrors, jellyfinUrl, and jellyfinApiKey persistence', async () => {
  await withMockLocalStorage({}, async () => {
    const saved = savePlayerPrefs({
      bootstrapMirrors: ['https://mirror-a.com', 'https://mirror-b.com'],
      jellyfinUrl: 'https://jellyfin.myhome.org/',
      jellyfinApiKey: 'jf-api-key-998877',
    });

    assert.deepStrictEqual(saved.bootstrapMirrors, ['https://mirror-a.com', 'https://mirror-b.com']);
    assert.strictEqual(saved.jellyfinUrl, 'https://jellyfin.myhome.org');
    assert.strictEqual(saved.jellyfinApiKey, 'jf-api-key-998877');

    const reloaded = loadPlayerPrefs();
    assert.deepStrictEqual(reloaded.bootstrapMirrors, ['https://mirror-a.com', 'https://mirror-b.com']);
    assert.strictEqual(reloaded.jellyfinUrl, 'https://jellyfin.myhome.org');
    assert.strictEqual(reloaded.jellyfinApiKey, 'jf-api-key-998877');
  });
});

test('resolveJellyfinStream returns playable direct stream node matching catalog title', async () => {
  // Spin up a mock Jellyfin HTTP server
  const jfServer = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname === '/Items') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          Items: [
            {
              Id: 'abc123item',
              Name: 'Big Buck Bunny',
              Type: 'Movie',
              ProviderIds: { Tmdb: '100', Imdb: 'tt1234567' },
            },
          ],
        })
      );
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => jfServer.listen(0, '127.0.0.1', resolve));
  const jfPort = jfServer.address().port;
  const jfUrl = `http://127.0.0.1:${jfPort}`;

  try {
    const item = { title: 'Big Buck Bunny', tmdbId: '100', imdbId: 'tt1234567' };
    const node = await resolveJellyfinStream(jfUrl, 'test-jf-token', item);

    assert.ok(node);
    assert.strictEqual(node.id, 'jellyfin-abc123item');
    assert.strictEqual(node.type, 'direct-hls');
    assert.strictEqual(node.direct, true);
    assert.ok(node.url.includes('/Videos/abc123item/master.m3u8'));
  } finally {
    jfServer.close();
  }
});

test('buildHlsProxyUrl passes token parameter into proxy URL', () => {
  const streamUrl = 'https://stream.example.com/master.m3u8';
  const token = 'my-test-token-sig';

  const proxied = buildHlsProxyUrl(streamUrl, {
    hlsProxyUrl: 'https://proxy.example.com',
    token,
  });
  assert.ok(proxied.includes('token=my-test-token-sig'));
  assert.ok(proxied.startsWith('https://proxy.example.com/api/proxy/hls?url='));
});

test('Cloudflare Worker /api/search handles TMDB env key cleanly', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('api.themoviedb.org/3/search/')) {
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 27205,
              media_type: 'movie',
              title: 'Inception',
              release_date: '2010-07-16',
              vote_average: 8.4,
              overview: 'Dream heist.',
              poster_path: '/p.jpg',
              backdrop_path: '/b.jpg',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return origFetch(url);
  };

  try {
    const req = new Request('https://worker.local/api/search?q=Inception&type=movie');
    const resp = await worker.fetch(req, { TMDB_API_KEY: 'dummy-tmdb-key' });
    assert.strictEqual(resp.status, 200);
    const data = await resp.json();
    assert.strictEqual(data.items.length, 1);
    assert.strictEqual(data.items[0].tmdbId, '27205');
    assert.strictEqual(data.items[0].title, 'Inception');
    assert.strictEqual(data.items[0].source, 'tmdb-edge');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('classifyDirectStreamKind prevents passing .mkv/.mp4 containers into Hls.js', () => {
  assert.strictEqual(
    classifyDirectStreamKind(
      'https://edge.workers.dev/api/proxy/hls?url=https%3A%2F%2Frd.example%2Fd%2FBreaking%2520Bad%2520S01E01.mkv'
    ),
    'video'
  );
  assert.strictEqual(
    classifyDirectStreamKind(
      'https://edge.workers.dev/api/proxy/hls?url=https%3A%2F%2Frd.example%2Fd%2FInception.1080p.mp4',
      { type: 'direct' }
    ),
    'video'
  );
  assert.strictEqual(
    classifyDirectStreamKind(
      'https://edge.workers.dev/api/proxy/hls?url=https%3A%2F%2Fcdn.example%2Fmaster.m3u8'
    ),
    'hls'
  );
});

test('resolveDebridCandidates selects single video file on waiting_files_selection and rejects .rar archives', async () => {
  const origFetch = globalThis.fetch;
  const selectedBodies = [];
  const deletedIds = [];

  globalThis.fetch = async (url, opts = {}) => {
    const href = String(url);
    if (href.includes('/torrents/addMagnet')) {
      const body = String(opts.body || '');
      return new Response(JSON.stringify({ id: body.includes('aaaa') ? 'rd-rar' : 'rd-mp4' }), { status: 201 });
    }
    if (href.includes('/torrents/info/rd-rar')) {
      return new Response(
        JSON.stringify({
          status: 'downloaded',
          links: ['https://rd.example/pack'],
          files: [{ id: 1, selected: 1, path: '/Movie.rar', bytes: 1_000_000 }],
        }),
        { status: 200 }
      );
    }
    if (href.includes('/torrents/info/rd-mp4')) {
      if (selectedBodies.some((b) => b.id === 'rd-mp4')) {
        return new Response(
          JSON.stringify({
            status: 'downloaded',
            links: ['https://rd.example/mp4-direct'],
            files: [{ id: 2, selected: 1, path: '/Interstellar.1080p.mp4', bytes: 2_500_000_000 }],
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          status: 'waiting_files_selection',
          files: [
            { id: 1, path: '/Subtitles/en.srt', bytes: 50_000 },
            { id: 2, path: '/Interstellar.1080p.mp4', bytes: 2_500_000_000 },
          ],
        }),
        { status: 200 }
      );
    }
    if (href.includes('/torrents/selectFiles/')) {
      const id = href.split('/').pop();
      selectedBodies.push({ id, body: String(opts.body || '') });
      return new Response(null, { status: 204 });
    }
    if (href.includes('/torrents/delete/')) {
      deletedIds.push(href.split('/').pop());
      return new Response(null, { status: 204 });
    }
    if (href.includes('/unrestrict/link')) {
      const body = String(opts.body || '');
      if (body.includes('pack')) {
        return new Response(JSON.stringify({ download: 'https://cdn.rd/Movie.rar', filename: 'Movie.rar' }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({ download: 'https://cdn.rd/Interstellar.1080p.mp4', filename: 'Interstellar.1080p.mp4' }),
        { status: 200 }
      );
    }
    return origFetch(url, opts);
  };

  try {
    const res = await resolveDebridCandidates({
      provider: 'realdebrid',
      apiKey: 'rd-test',
      candidates: [
        { infoHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', title: 'Rar Candidate' },
        { infoHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', title: 'MP4 Candidate' },
      ],
    });
    assert.ok(res);
    assert.strictEqual(res.url, 'https://cdn.rd/Interstellar.1080p.mp4');
    assert.ok(deletedIds.includes('rd-rar'), 'Must reject and clean up .rar download');
    assert.ok(
      selectedBodies.some((x) => x.id === 'rd-mp4' && x.body === 'files=2'),
      'Must select only single video file ID 2 instead of files=all'
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('renderStreamSourcesModal displays Edge-managed Stremio addons and Real-Debrid status when backendStatus is live', () => {
  const html = renderStreamSourcesModal({
    activeTab: 'addons',
    prefs: { hlsProxyUrl: 'https://suno-cinema-edge-proxy.contactanshyadav.workers.dev' },
    addons: [],
    backendStatus: {
      status: 'ready',
      tmdb: { configured: true },
      debrid: { configured: true, provider: 'realdebrid', serverManaged: true },
      stremio: {
        configured: true,
        addonCount: 3,
        addons: [
          { name: 'torrentio.strem.fun', url: 'https://torrentio.strem.fun', enabled: true },
          { name: 'comet.elfhosted.com', url: 'https://comet.elfhosted.com', enabled: true },
          { name: 'mediafusion.elfhosted.com', url: 'https://mediafusion.elfhosted.com', enabled: true },
        ],
      },
    },
  });

  assert.ok(html.includes('3 Addons Active (Edge)'));
  assert.ok(html.includes('Real-Debrid Active (Edge)'));
  assert.ok(html.includes('Edge Proxy Ready'));
  assert.ok(html.includes('torrentio.strem.fun'));
  assert.equal(html.includes('0 Addons Active'), false);
  assert.equal(html.includes('Debrid Not Set'), false);
});

test('isRateLimitOrFakeStream rejects ElfHosted rate-limit stubs while keeping real media streams', () => {
  for (const fn of [isRateLimitOrFakeStream, workerIsRateLimitOrFakeStream]) {
    assert.equal(
      fn(
        {
          name: '[🐢] MediaFusion',
          title: 'MediaFusion public rate-limit exceeded 🐢',
          url: 'https://elfhosted.com/assets/public-rate-limit-exceeded.mp4',
        },
        '[🐢] MediaFusion — MediaFusion public rate-limit exceeded 🐢'
      ),
      true
    );
    assert.equal(
      fn(
        {
          name: 'Direct CDN 1080p',
          url: 'https://cdn.example.com/movie/master.m3u8',
        },
        'Direct CDN 1080p'
      ),
      false
    );
  }
});

test('resolveDebridCandidates reuses matching downloaded torrent without calling addMagnet', async () => {
  const cachedHash = 'f1e2d3c4b5a697887766554433221100ffeeddcc';
  const origFetch = globalThis.fetch;
  let addMagnetCalls = 0;
  let unrestrictCalls = 0;

  globalThis.fetch = async (url, opts = {}) => {
    const href = String(url);
    if (href.includes('/rest/1.0/torrents?limit=50')) {
      return new Response(
        JSON.stringify([
          {
            id: 'EXISTING-RD-1',
            hash: cachedHash,
            filename: 'Fight.Club.1999.1080p.BluRay.x264.mp4',
            status: 'downloaded',
            links: ['https://real-debrid.com/d/EXISTING_LINK_1'],
          },
        ]),
        { status: 200 }
      );
    }
    if (href.includes('/torrents/addMagnet')) {
      addMagnetCalls += 1;
      return new Response(JSON.stringify({ id: 'SHOULD_NOT_HAPPEN' }), { status: 201 });
    }
    if (href.includes('/unrestrict/link')) {
      unrestrictCalls += 1;
      assert.ok(String(opts.body || '').includes(encodeURIComponent('https://real-debrid.com/d/EXISTING_LINK_1')));
      return new Response(
        JSON.stringify({
          download: 'https://20-4.download.real-debrid.com/d/REUSED/Fight.Club.1999.1080p.mp4',
          filename: 'Fight.Club.1999.1080p.mp4',
        }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 404 });
  };

  try {
    const res = await resolveDebridCandidates({
      provider: 'realdebrid',
      apiKey: 'rd-test-key',
      candidates: [
        { infoHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', quality: '4K UHD', title: 'Missing 4K' },
        { infoHash: cachedHash, quality: '1080p', title: 'Fight Club 1080p MP4' },
      ],
    });
    assert.ok(res);
    assert.equal(res.candidate.infoHash, cachedHash);
    assert.equal(res.url, 'https://20-4.download.real-debrid.com/d/REUSED/Fight.Club.1999.1080p.mp4');
    assert.equal(addMagnetCalls, 0, 'Must reuse existing downloaded RD torrent instead of calling addMagnet');
    assert.equal(unrestrictCalls, 1);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('renderSettingsSheet renders Edge Addons and Debrid active badges when backendStatus is configured', () => {
  const html = renderSettingsSheet({
    appearance: { theme: 'suno-red' },
    prefs: { sub: 'en', hlsProxyUrl: 'https://suno-cinema-edge-proxy.contactanshyadav.workers.dev' },
    shield: { blockedCount: 2, navigationLock: true, strictFrameMode: false },
    profile: { name: 'Ansh' },
    backendStatus: {
      status: 'ready',
      stremio: { addonCount: 2 },
      debrid: { configured: true, provider: 'realdebrid' },
    },
  });

  assert.ok(html.includes('2 Edge Addons Active'));
  assert.ok(html.includes('Real-Debrid Active (Edge)'));
});
