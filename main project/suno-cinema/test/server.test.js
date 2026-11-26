import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createSunoCinemaServer,
  rewriteHlsManifest,
  unmaskDisguisedSegment,
  convertSrtToVtt,
} from '../server.js';

async function withMockUpstream(handler, fn) {
  const upstream = http.createServer(handler);
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const { port } = upstream.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
}

async function withSunoServer(fn) {
  const server = createSunoCinemaServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('rewriteHlsManifest rewrites #EXT-X-MEDIA audio/subs, #EXT-X-MAP, #EXT-X-KEY, and skips already-proxied URIs', () => {
  const sampleManifest = [
    '#EXTM3U',
    '#EXT-X-VERSION:6',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",LANGUAGE="en",DEFAULT=YES,URI="audio/eng.m3u8"',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English CC",LANGUAGE="en",URI="https://subs.cdn.example/vtt/eng.m3u8"',
    '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=120000,URI="iframes.m3u8"',
    '#EXT-X-MAP:URI="init.mp4"',
    '#EXT-X-KEY:METHOD=AES-128,URI="enc.key"',
    '#EXT-X-STREAM-INF:BANDWIDTH=2400000,AUDIO="aac",SUBTITLES="subs"',
    '720p/index.m3u8',
    '#EXTINF:6.0,',
    '/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Falready.ts',
    '#EXTINF:6.0,',
    'https://cdn.example.com/hls/segment1.ts',
  ].join('\n');

  const rewritten = rewriteHlsManifest(
    sampleManifest,
    'https://cdn.example.com/hls/master.m3u8',
    '/api/proxy/hls',
    'https://origin.site'
  );

  assert.ok(
    rewritten.includes(
      'URI="/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Faudio%2Feng.m3u8&referer=https%3A%2F%2Forigin.site"'
    ),
    'Must rewrite relative #EXT-X-MEDIA AUDIO URI'
  );
  assert.ok(
    rewritten.includes(
      'URI="/api/proxy/hls?url=https%3A%2F%2Fsubs.cdn.example%2Fvtt%2Feng.m3u8&referer=https%3A%2F%2Forigin.site"'
    ),
    'Must rewrite absolute #EXT-X-MEDIA SUBTITLES URI'
  );
  assert.ok(
    rewritten.includes(
      'URI="/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Fiframes.m3u8&referer=https%3A%2F%2Forigin.site"'
    ),
    'Must rewrite #EXT-X-I-FRAME-STREAM-INF URI'
  );
  assert.ok(
    rewritten.includes(
      'URI="/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Finit.mp4&referer=https%3A%2F%2Forigin.site"'
    ),
    'Must rewrite #EXT-X-MAP URI'
  );
  assert.ok(
    rewritten.includes(
      '#EXT-X-KEY:METHOD=AES-128,URI="/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Fenc.key&referer=https%3A%2F%2Forigin.site"'
    )
  );
  assert.ok(
    rewritten.includes('/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fhls%2F720p%2Findex.m3u8&referer=https%3A%2F%2Forigin.site')
  );
  assert.ok(
    rewritten.includes('/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Fsegment1.ts&referer=https%3A%2F%2Forigin.site')
  );
  // Already-proxied line must not be double-wrapped
  const alreadyLine = rewritten.split('\n').find((l) => l.includes('already.ts'));
  assert.equal(alreadyLine, '/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Falready.ts');
});

test('convertSrtToVtt strips BOM, normalizes CRLF, converts cue timestamps, and passes WEBVTT through', () => {
  const bomSrt =
    '\uFEFF1\r\n00:01:02,345 --> 00:01:05,678 line:85%\r\nHello, Suno Cinema!\r\n\r\n2\r\n1:02:03,004 --> 1:02:06,500\r\nSecond cue\r\n';
  const vtt = convertSrtToVtt(bomSrt);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(vtt.includes('00:01:02.345 --> 00:01:05.678 line:85%'));
  assert.ok(vtt.includes('01:02:03.004 --> 01:02:06.500'));
  assert.equal(vtt.includes('\r'), false);

  const existingVtt = '\uFEFFWEBVTT\r\n\r\n00:00:01.000 --> 00:00:03.000\r\nAlready VTT\r\n';
  const passthrough = convertSrtToVtt(existingVtt);
  assert.equal(passthrough.startsWith('WEBVTT\n\n'), true);
  assert.equal(passthrough.match(/WEBVTT/g).length, 1);
  assert.equal(convertSrtToVtt('   '), 'WEBVTT\n\n');
});

test('unmaskDisguisedSegment detects and removes disguised image prefixes before MPEG-TS stream', () => {
  const fakePngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const packetCount = 4;
  const tsPackets = Buffer.alloc(188 * packetCount, 0xaa);
  for (let i = 0; i < packetCount; i++) {
    tsPackets[i * 188] = 0x47;
  }

  const disguised = Buffer.concat([fakePngHeader, tsPackets]);
  const unmasked = unmaskDisguisedSegment(disguised);
  assert.equal(unmasked.length, tsPackets.length);
  assert.equal(unmasked[0], 0x47);
  assert.equal(unmasked[188], 0x47);
  assert.equal(unmasked[376], 0x47);

  const cleanTs = Buffer.alloc(188 * 3, 0x47);
  const cleanResult = unmaskDisguisedSegment(cleanTs);
  assert.equal(cleanResult.length, cleanTs.length);
});

test('Suno Cinema HTTP server serves UI assets, catalog API, search, TV seasons, and clean stream resolver', async () => {
  await withSunoServer(async (base) => {
    const htmlResp = await fetch(`${base}/`);
    assert.equal(htmlResp.status, 200);
    const html = await htmlResp.text();
    assert.ok(html.includes('Suno Cinema'));
    assert.match(html, /src="\.\/src\/app\.js(?:\?[^"]*)?"/);
    assert.match(html, /href="\.\/styles\.css(?:\?[^"]*)?"/);

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
    assert.equal(health.subtitleProxyEnabled, true);
    assert.equal(health.rangeForwardingEnabled, true);
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

    // Commercial Interstellar must NOT emit placeholder catalog-hls; resolves cleanly to shielded embeds
    const commercialResolve = await fetch(`${base}/api/resolve/stream?tmdbId=157336&mediaType=movie`);
    assert.equal(commercialResolve.status, 200);
    const commercialData = await commercialResolve.json();
    assert.equal(commercialData.ok, true);
    assert.equal(
      commercialData.sources.some((s) => s.id === 'catalog-hls'),
      false,
      'Interstellar must not return fake catalog-hls'
    );
    assert.ok(commercialData.sources.some((s) => s.id === 'vidlink-shield'));
    assert.ok(commercialData.sources.some((s) => s.id === 'vidrift-sandboxed'));

    // Open-domain Tears of Steel emits multi-node primary + mirrors (proxy & direct)
    const tosResolve = await fetch(`${base}/api/resolve/stream?tmdbId=test-tos&mediaType=movie`);
    assert.equal(tosResolve.status, 200);
    const tosData = await tosResolve.json();
    assert.ok(tosData.sources.some((s) => s.id === 'catalog-hls' && s.url.includes('/api/proxy/hls')));
    assert.ok(tosData.sources.some((s) => s.id === 'catalog-hls-direct' && s.url.startsWith('https://')));
    assert.ok(tosData.sources.some((s) => s.id.startsWith('catalog-hls-mirror-')));

    // OPTIONS & directUrl resolution
    const resolveOpt = await fetch(`${base}/api/resolve/stream`, { method: 'OPTIONS' });
    assert.equal(resolveOpt.status, 204);
    assert.equal(resolveOpt.headers.get('access-control-allow-origin'), '*');

    const directResp = await fetch(
      `${base}/api/resolve/stream?directUrl=${encodeURIComponent(
        'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
      )}&referer=${encodeURIComponent('https://referer.example')}`
    );
    assert.equal(directResp.status, 200);
    const directData = await directResp.json();
    const customProxy = directData.sources.find((s) => s.id === 'custom-stream');
    assert.ok(customProxy && customProxy.url.includes('/api/proxy/hls') && customProxy.url.includes('referer='));
    assert.ok(directData.sources.some((s) => s.id === 'custom-stream-direct' && s.type === 'hls'));

    const travResp = await fetch(`${base}/..%2Fpackage.json`);
    assert.ok(travResp.status === 403 || travResp.status === 404);
  });
});

test('/api/proxy/hls supports HTTP Range/206, 416, HEAD, retries on 503, #EXT-X-MEDIA manifests, and CORS on errors', async () => {
  const payload = Buffer.from('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
  let retryAttempt = 0;

  await withMockUpstream(
    (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/segment.m4s') {
        const range = req.headers.range;
        if (range) {
          const m = /^bytes=(\d+)-(\d*)$/.exec(range);
          const start = m ? Number(m[1]) : 0;
          const end = m && m[2] !== '' ? Math.min(Number(m[2]), payload.length - 1) : payload.length - 1;
          if (!m || start >= payload.length || end < start) {
            res.writeHead(416, { 'Content-Range': `bytes */${payload.length}` });
            return res.end();
          }
          const slice = payload.subarray(start, end + 1);
          res.writeHead(206, {
            'Content-Type': 'video/mp4',
            'Content-Range': `bytes ${start}-${end}/${payload.length}`,
            'Content-Length': String(slice.length),
            'Accept-Ranges': 'bytes',
          });
          return req.method === 'HEAD' ? res.end() : res.end(slice);
        }
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Content-Length': String(payload.length),
          'Accept-Ranges': 'bytes',
        });
        return req.method === 'HEAD' ? res.end() : res.end(payload);
      }

      if (u.pathname === '/nohead.ts') {
        if (req.method === 'HEAD') {
          res.writeHead(405);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': '12' });
        return res.end(Buffer.alloc(12, 0x47));
      }

      if (u.pathname === '/flaky.m3u8') {
        retryAttempt += 1;
        if (retryAttempt === 1) {
          res.writeHead(503, { 'Content-Type': 'text/plain' });
          return res.end('Upstream busy');
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(
          [
            '#EXTM3U',
            '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="subs/en.m3u8"',
            'video/seg0.ts',
          ].join('\n')
        );
      }

      if (u.pathname === '/disguised.png') {
        const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
        const ts = Buffer.alloc(188 * 3, 0x55);
        ts[0] = 0x47;
        ts[188] = 0x47;
        ts[376] = 0x47;
        const body = Buffer.concat([fakePng, ts]);
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(body.length) });
        return res.end(body);
      }

      res.writeHead(404);
      res.end('Not found');
    },
    async (upstreamBase) => {
      await withSunoServer(async (base) => {
        // Error CORS checks (400, 405)
        const badUrl = await fetch(`${base}/api/proxy/hls?url=ftp://invalid.example`);
        assert.equal(badUrl.status, 400);
        assert.equal(badUrl.headers.get('access-control-allow-origin'), '*');

        const postNotAllowed = await fetch(`${base}/api/proxy/hls`, { method: 'POST' });
        assert.equal(postNotAllowed.status, 405);
        assert.equal(postNotAllowed.headers.get('access-control-allow-origin'), '*');

        // Range 206 partial content forwarding
        const range1 = await fetch(
          `${base}/api/proxy/hls?url=${encodeURIComponent(`${upstreamBase}/segment.m4s`)}`,
          { headers: { Range: 'bytes=5-14' } }
        );
        assert.equal(range1.status, 206);
        assert.equal(range1.headers.get('content-range'), `bytes 5-14/${payload.length}`);
        assert.equal(range1.headers.get('accept-ranges'), 'bytes');
        assert.equal(range1.headers.get('content-length'), '10');
        assert.equal(range1.headers.get('access-control-allow-origin'), '*');
        assert.equal(await range1.text(), '56789ABCDE');

        // Range 416 forwarding
        const range416 = await fetch(
          `${base}/api/proxy/hls?url=${encodeURIComponent(`${upstreamBase}/segment.m4s`)}`,
          { headers: { Range: 'bytes=999-1005' } }
        );
        assert.equal(range416.status, 416);
        assert.equal(range416.headers.get('content-range'), `bytes */${payload.length}`);
        assert.equal(range416.headers.get('access-control-allow-origin'), '*');

        // HEAD with 405 -> GET fallback
        const headFallback = await fetch(
          `${base}/api/proxy/hls?url=${encodeURIComponent(`${upstreamBase}/nohead.ts`)}`,
          { method: 'HEAD' }
        );
        assert.equal(headFallback.status, 200);
        assert.equal(headFallback.headers.get('content-type'), 'video/mp2t');
        assert.equal(await headFallback.text(), '');

        // Flaky 503 -> 200 retry + text/plain #EXTM3U + #EXT-X-MEDIA URI rewrite
        const manifestResp = await fetch(
          `${base}/api/proxy/hls?url=${encodeURIComponent(`${upstreamBase}/flaky.m3u8`)}&referer=${encodeURIComponent(
            'https://player.example'
          )}`
        );
        assert.equal(manifestResp.status, 200);
        assert.equal(retryAttempt, 2, 'Should retry once after 503 and succeed');
        assert.ok(manifestResp.headers.get('content-type').includes('mpegurl'));
        const manifestBody = await manifestResp.text();
        assert.ok(
          manifestBody.includes(
            `URI="/api/proxy/hls?url=${encodeURIComponent(`${upstreamBase}/subs/en.m3u8`)}&referer=${encodeURIComponent(
              'https://player.example'
            )}"`
          )
        );
        assert.ok(
          manifestBody.includes(
            `/api/proxy/hls?url=${encodeURIComponent(`${upstreamBase}/video/seg0.ts`)}&referer=${encodeURIComponent(
              'https://player.example'
            )}`
          )
        );

        // Disguised PNG header stripped and Content-Length adjusted
        const unmaskedResp = await fetch(
          `${base}/api/proxy/hls?url=${encodeURIComponent(`${upstreamBase}/disguised.png`)}`
        );
        assert.equal(unmaskedResp.status, 200);
        assert.equal(unmaskedResp.headers.get('content-type'), 'video/mp2t');
        const unmaskedBuf = Buffer.from(await unmaskedResp.arrayBuffer());
        assert.equal(unmaskedBuf.length, 188 * 3);
        assert.equal(unmaskedBuf[0], 0x47);
      });
    }
  );
});

test('/api/proxy/subtitles converts SRT to WebVTT with CORS headers and validates requests', async () => {
  await withMockUpstream(
    (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/track.srt') {
        res.writeHead(200, { 'Content-Type': 'application/x-subrip' });
        return res.end('\uFEFF1\r\n00:00:01,250 --> 00:00:04,500\r\nWelcome to Suno Cinema\r\n');
      }
      res.writeHead(404);
      res.end('Missing');
    },
    async (upstreamBase) => {
      await withSunoServer(async (base) => {
        const opt = await fetch(`${base}/api/proxy/subtitles`, { method: 'OPTIONS' });
        assert.equal(opt.status, 204);
        assert.equal(opt.headers.get('access-control-allow-origin'), '*');

        const bad = await fetch(`${base}/api/proxy/subtitles`);
        assert.equal(bad.status, 400);
        assert.equal(bad.headers.get('access-control-allow-origin'), '*');

        const head = await fetch(
          `${base}/api/proxy/subtitles?url=${encodeURIComponent(`${upstreamBase}/track.srt`)}`,
          { method: 'HEAD' }
        );
        assert.equal(head.status, 200);
        assert.equal(head.headers.get('content-type'), 'text/vtt; charset=utf-8');
        assert.equal(await head.text(), '');

        const get = await fetch(
          `${base}/api/proxy/subtitles?url=${encodeURIComponent(`${upstreamBase}/track.srt`)}`
        );
        assert.equal(get.status, 200);
        assert.equal(get.headers.get('content-type'), 'text/vtt; charset=utf-8');
        assert.equal(get.headers.get('access-control-allow-origin'), '*');
        const vtt = await get.text();
        assert.ok(vtt.startsWith('WEBVTT\n\n'));
        assert.ok(vtt.includes('00:00:01.250 --> 00:00:04.500'));
        assert.ok(vtt.includes('Welcome to Suno Cinema'));
      });
    }
  );
});

test('/api/resolve/stream resolves Stremio addon streams with referer and Debrid instant cache (without URL-less stubs)', async () => {
  const sampleHash = '0123456789abcdef0123456789abcdef01234567';

  await withMockUpstream(
    (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/stream/movie/tt0816692.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            streams: [
              {
                name: 'EdgeNode 4K',
                title: 'Interstellar 2160p\nMulti Audio',
                url: 'https://cdn.addon.example/interstellar/master.m3u8',
                behaviorHints: { proxyHeaders: { request: { Referer: 'https://addon-ref.example' } } },
              },
              {
                name: 'Raw MKV (Skip)',
                url: 'https://cdn.addon.example/movie.mkv',
                behaviorHints: { notWebReady: true },
              },
              {
                name: 'Cached Torrent',
                infoHash: sampleHash,
                fileIdx: 1,
              },
            ],
          })
        );
      }
      res.writeHead(404);
      res.end('{}');
    },
    async (addonBase) => {
      const origFetch = globalThis.fetch;
      globalThis.fetch = async (url, opts) => {
        const href = String(url);
        // Mock Real-Debrid & TorBox API endpoints while letting local HTTP test traffic pass through
        if (href.startsWith('https://api.real-debrid.com/rest/1.0/')) {
          if (href.includes('/torrents/addMagnet')) {
            return new Response(JSON.stringify({ id: 'rd-123' }), { status: 201 });
          }
          if (href.includes('/torrents/selectFiles/')) {
            return new Response(null, { status: 204 });
          }
          if (href.includes('/torrents/info/rd-123')) {
            return new Response(
              JSON.stringify({ status: 'downloaded', links: ['https://rd.example/restricted/1'] }),
              { status: 200 }
            );
          }
          if (href.includes('/unrestrict/link')) {
            return new Response(
              JSON.stringify({ download: 'https://cdn.real-debrid.example/stream/movie.mp4' }),
              { status: 200 }
            );
          }
        }
        if (href.startsWith('https://api.torbox.app/v1/api/')) {
          if (href.includes('/checkcached')) {
            return new Response(JSON.stringify({ data: [] }), { status: 200 }); // Uncached
          }
        }
        return origFetch(url, opts);
      };

      try {
        await withSunoServer(async (base) => {
          // Addon + Real-Debrid resolved URL
          const rdResp = await fetch(
            `${base}/api/resolve/stream?tmdbId=157336&imdbId=tt0816692&mediaType=movie`,
            {
              headers: {
                'X-Addon-Url': addonBase,
                'X-Debrid-Key': 'test-rd-key',
                'X-Debrid-Provider': 'realdebrid',
              },
            }
          );
          assert.equal(rdResp.status, 200);
          const rdData = await rdResp.json();
          const addonNode = rdData.sources.find((s) => s.id === 'addon-hls');
          assert.ok(addonNode, 'Must resolve addon HLS node');
          assert.ok(addonNode.url.startsWith('/api/proxy/hls?'));
          assert.ok(addonNode.url.includes(encodeURIComponent('https://addon-ref.example')));
          assert.equal(
            rdData.sources.some((s) => s.rawUrl === 'https://cdn.addon.example/movie.mkv'),
            false,
            'Must skip non-web-ready MKV streams'
          );

          const debridNode = rdData.sources.find((s) => s.id === 'debrid-instant-cache');
          assert.ok(debridNode, 'Must emit debrid-instant-cache when Real-Debrid resolves a playable URL');
          assert.equal(debridNode.rawUrl, 'https://cdn.real-debrid.example/stream/movie.mp4');
          assert.ok(debridNode.url.startsWith('/api/proxy/hls?'));

          // Uncached TorBox hash must NOT emit a URL-less stub
          const tbResp = await fetch(
            `${base}/api/resolve/stream?tmdbId=157336&imdbId=tt0816692&mediaType=movie&hash=${sampleHash}`,
            {
              headers: {
                'X-Debrid-Key': 'test-tb-key',
                'X-Debrid-Provider': 'torbox',
              },
            }
          );
          assert.equal(tbResp.status, 200);
          const tbData = await tbResp.json();
          assert.equal(
            tbData.sources.some((s) => s.id === 'debrid-instant-cache'),
            false,
            'Uncached debrid must never emit a URL-less stub'
          );
          assert.ok(tbData.sources.every((s) => Boolean(s.url)), 'Every resolved source must have a non-empty url');
        });
      } finally {
        globalThis.fetch = origFetch;
      }
    }
  );
});
