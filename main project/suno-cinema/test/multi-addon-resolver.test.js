import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createSunoCinemaServer,
  normalizeAddonUrl,
  normalizeAddonManifestUrl,
  parseAddonUrls,
  resolveDebridCandidates,
} from '../server.js';
import workerProxy, {
  normalizeAddonUrl as workerNormalizeAddonUrl,
  normalizeAddonManifestUrl as workerNormalizeAddonManifestUrl,
  parseAddonUrls as workerParseAddonUrls,
  resolveDebridCandidates as workerResolveDebridCandidates,
} from '../cloudflare-hls-proxy.js';

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

test('server and worker normalize stremio:// URLs, manifest URLs, and parse multi-addon inputs', () => {
  for (const helpers of [
    { normalizeAddonUrl, normalizeAddonManifestUrl, parseAddonUrls },
    {
      normalizeAddonUrl: workerNormalizeAddonUrl,
      normalizeAddonManifestUrl: workerNormalizeAddonManifestUrl,
      parseAddonUrls: workerParseAddonUrls,
    },
  ]) {
    assert.equal(helpers.normalizeAddonUrl('stremio://addon.example/manifest.json'), 'https://addon.example/manifest.json');
    assert.equal(
      helpers.normalizeAddonUrl('stremio://https://addon.example/sort=quality/manifest.json'),
      'https://addon.example/sort=quality/manifest.json'
    );
    assert.equal(helpers.normalizeAddonUrl('javascript:alert(1)'), '');

    assert.equal(
      helpers.normalizeAddonManifestUrl('stremio://addon.example/config'),
      'https://addon.example/config/manifest.json'
    );
    assert.equal(
      helpers.normalizeAddonManifestUrl('https://addon.example/manifest.json'),
      'https://addon.example/manifest.json'
    );
    assert.equal(helpers.normalizeAddonManifestUrl('https://media.example/{imdbId}.m3u8'), '');

    // Preserves commas inside addon config path while splitting multiple addons & filtering disabled objects
    const parsedComma = helpers.parseAddonUrls(
      'stremio://torrentio.example/providers=yts,eztv/manifest.json, https://comet.example/manifest.json'
    );
    assert.deepEqual(
      parsedComma.map((a) => a.url),
      ['https://torrentio.example/providers=yts,eztv/manifest.json', 'https://comet.example/manifest.json']
    );

    const parsedJson = helpers.parseAddonUrls(
      JSON.stringify([
        { url: 'stremio://primary.example/manifest.json', name: 'Primary', enabled: true },
        { url: 'https://disabled.example/manifest.json', name: 'Disabled', enabled: false },
        { url: 'https://primary.example/', name: 'Duplicate' },
        { manifestUrl: 'https://secondary.example/manifest.json', name: 'Secondary' },
      ])
    );
    assert.deepEqual(parsedJson, [
      { url: 'https://primary.example/manifest.json', name: 'Primary' },
      { url: 'https://secondary.example/manifest.json', name: 'Secondary' },
    ]);
  }
});

test('/api/resolve/addon-manifest validates, normalizes stremio://, supports HEAD fallback, and handles errors on server & worker', async () => {
  const sampleManifest = {
    id: 'community.suno.streams',
    name: 'Suno Test Addon',
    version: '2.4.1',
    description: 'HLS & Debrid test manifest',
    types: ['movie', 'series'],
    resources: ['stream'],
    idPrefixes: ['tt'],
  };

  await withMockUpstream(
    (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/manifest.json') {
        if (req.method === 'HEAD') {
          res.writeHead(405);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(sampleManifest));
      }
      if (u.pathname === '/bad-json/manifest.json') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('not-json');
      }
      if (u.pathname === '/incomplete/manifest.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ version: '1.0.0' }));
      }
      res.writeHead(404);
      return res.end('{}');
    },
    async (upstreamBase) => {
      await withSunoServer(async (base) => {
        const opt = await fetch(`${base}/api/resolve/addon-manifest`, { method: 'OPTIONS' });
        assert.equal(opt.status, 204);
        assert.equal(opt.headers.get('access-control-allow-origin'), '*');

        const badMethod = await fetch(`${base}/api/resolve/addon-manifest`, { method: 'POST' });
        assert.equal(badMethod.status, 405);

        const missingUrl = await fetch(`${base}/api/resolve/addon-manifest`);
        assert.equal(missingUrl.status, 400);

        const headResp = await fetch(
          `${base}/api/resolve/addon-manifest?url=${encodeURIComponent(upstreamBase)}`,
          { method: 'HEAD' }
        );
        assert.equal(headResp.status, 200);
        assert.equal(headResp.headers.get('access-control-allow-origin'), '*');

        const okResp = await fetch(
          `${base}/api/resolve/addon-manifest?url=${encodeURIComponent(upstreamBase)}`
        );
        assert.equal(okResp.status, 200);
        const okJson = await okResp.json();
        assert.equal(okJson.ok, true);
        assert.equal(okJson.id, 'community.suno.streams');
        assert.equal(okJson.name, 'Suno Test Addon');
        assert.equal(okJson.version, '2.4.1');
        assert.equal(okJson.manifestUrl, `${upstreamBase}/manifest.json`);
        assert.deepEqual(okJson.types, ['movie', 'series']);

        const badJsonResp = await fetch(
          `${base}/api/resolve/addon-manifest?url=${encodeURIComponent(`${upstreamBase}/bad-json`)}`
        );
        assert.equal(badJsonResp.status, 502);

        const incompleteResp = await fetch(
          `${base}/api/resolve/addon-manifest?url=${encodeURIComponent(`${upstreamBase}/incomplete`)}`
        );
        assert.equal(incompleteResp.status, 422);
      });

      // Cloudflare Worker /api/resolve/addon-manifest with stremio:// normalization
      const origFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        const href = String(url);
        if (href === 'https://mock-addon.example/manifest.json') {
          return new Response(JSON.stringify(sampleManifest), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return origFetch(url, init);
      };

      try {
        const wOpt = await workerProxy.fetch(
          new Request('https://edge.workers.dev/api/resolve/addon-manifest', { method: 'OPTIONS' })
        );
        assert.equal(wOpt.status, 204);

        const wBad = await workerProxy.fetch(
          new Request('https://edge.workers.dev/api/resolve/addon-manifest?url=ftp://bad')
        );
        assert.equal(wBad.status, 400);

        const wOk = await workerProxy.fetch(
          new Request(
            `https://edge.workers.dev/api/resolve/addon-manifest?url=${encodeURIComponent('stremio://mock-addon.example')}`
          )
        );
        assert.equal(wOk.status, 200);
        const wJson = await wOk.json();
        assert.equal(wJson.ok, true);
        assert.equal(wJson.manifestUrl, 'https://mock-addon.example/manifest.json');
        assert.equal(wJson.baseUrl, 'https://mock-addon.example');
        assert.equal(wJson.name, 'Suno Test Addon');
      } finally {
        globalThis.fetch = origFetch;
      }
    }
  );
});

test('multi-addon /api/resolve/stream queries addons in parallel, isolates failures, preserves Referer, and expands customResolverUrl', async () => {
  await withMockUpstream(
    (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/addon-a/stream/movie/tt1375666.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            streams: [
              {
                name: 'Alpha 4K',
                title: 'Inception 2160p',
                url: 'https://cdn-a.example/inception/master.m3u8',
                behaviorHints: { proxyHeaders: { request: { Referer: 'https://ref-a.example' } } },
              },
              {
                name: 'Shared Duplicate',
                url: 'https://cdn-shared.example/film.m3u8',
              },
            ],
          })
        );
      }
      if (u.pathname === '/addon-b/stream/movie/tt1375666.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            streams: [
              {
                name: 'Shared Duplicate B',
                url: 'https://cdn-shared.example/film.m3u8',
              },
              {
                name: 'Beta 1080p',
                url: 'https://cdn-b.example/inception/1080.mp4',
              },
            ],
          })
        );
      }
      if (u.pathname === '/addon-broken/stream/movie/tt1375666.json') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Upstream down' }));
      }
      if (u.pathname === '/jellyfin/resolve') {
        assert.equal(u.searchParams.get('imdb'), 'tt1375666');
        assert.equal(u.searchParams.get('tmdb'), '27205');
        assert.equal(u.searchParams.get('type'), 'movie');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            MediaSources: [
              {
                Name: 'NAS 4K HDR',
                TranscodingUrl: '/Videos/abc/master.m3u8?Static=false',
              },
            ],
          })
        );
      }
      res.writeHead(404);
      res.end('{}');
    },
    async (upstreamBase) => {
      await withSunoServer(async (base) => {
        const addonList = [
          { url: `${upstreamBase}/addon-a/manifest.json`, name: 'AlphaAddOn', enabled: true },
          { url: `${upstreamBase}/addon-b/manifest.json`, name: 'BetaAddOn', enabled: true },
          { url: `${upstreamBase}/addon-broken/manifest.json`, name: 'BrokenAddOn', enabled: true },
          { url: `${upstreamBase}/addon-disabled/manifest.json`, name: 'DisabledAddOn', enabled: false },
        ];
        const customTemplate = `${upstreamBase}/jellyfin/resolve?imdb={imdbId}&tmdb={tmdbId}&type={mediaType}&s={season}&e={episode}`;

        const resp = await fetch(
          `${base}/api/resolve/stream?tmdbId=27205&imdbId=tt1375666&mediaType=movie&customResolverUrl=${encodeURIComponent(
            customTemplate
          )}`,
          {
            headers: {
              'X-Addon-Urls': JSON.stringify(addonList),
            },
          }
        );
        assert.equal(resp.status, 200);
        const data = await resp.json();
        assert.equal(data.ok, true);
        assert.equal(data.addonCount, 3, 'Must exclude disabled addon');
        assert.ok(Array.isArray(data.warnings) && data.warnings.some((w) => w.includes('BrokenAddOn')));

        const customNode = data.sources.find((s) => s.id === 'custom-resolver');
        assert.ok(customNode, 'Must resolve Jellyfin MediaSources from customResolverUrl');
        assert.equal(customNode.rawUrl, `${upstreamBase}/Videos/abc/master.m3u8?Static=false`);
        assert.equal(customNode.quality, '4K UHD');

        const addonNodes = data.sources.filter((s) => s.id.startsWith('addon-hls'));
        assert.equal(addonNodes.length, 3, 'Must return unique streams across healthy addons and dedupe shared URL');
        assert.equal(addonNodes[0].addonName, 'AlphaAddOn');
        assert.equal(addonNodes[0].quality, '4K UHD');
        assert.ok(addonNodes[0].url.includes(encodeURIComponent('https://ref-a.example')));
        assert.equal(addonNodes[2].addonName, 'BetaAddOn');
        assert.equal(addonNodes[2].type, 'direct');

        // Health flags report multi-addon and manifest resolver support
        const health = await (await fetch(`${base}/api/health`)).json();
        assert.equal(health.addonManifestResolverEnabled, true);
        assert.equal(health.multiAddonEnabled, true);
      });

      // Verify Worker parity for stremio:// multi-addon + failure isolation + customResolverUrl
      const origFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        const href = String(url);
        if (href === 'https://stremio-a.example/stream/series/tt0903747%3A2%3A5.json') {
          return new Response(
            JSON.stringify({
              streams: [{ name: 'Stremio A 1080p', url: 'https://cdn.example/bb/s2e5.m3u8' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (href === 'https://stremio-fail.example/stream/series/tt0903747%3A2%3A5.json') {
          return new Response('err', { status: 503 });
        }
        if (href === 'https://worker-custom.example/tv/1396/2/5.m3u8') {
          return new Response('#EXTM3U\n#EXTINF:6.0,\nseg0.ts\n', {
            status: 200,
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
          });
        }
        return origFetch(url, init);
      };

      try {
        const workerReq = new Request(
          `https://edge.workers.dev/api/resolve/stream?tmdbId=1396&imdbId=tt0903747&mediaType=tv&season=2&episode=5&addonUrls=${encodeURIComponent(
            'stremio://stremio-a.example/manifest.json,stremio://stremio-fail.example/manifest.json'
          )}&customResolverUrl=${encodeURIComponent('https://worker-custom.example/{mediaType}/{tmdbId}/{season}/{episode}.m3u8')}`
        );
        const workerResp = await workerProxy.fetch(workerReq);
        assert.equal(workerResp.status, 200);
        const workerData = await workerResp.json();
        assert.equal(workerData.addonCount, 2);
        assert.ok(workerData.sources.some((s) => s.id === 'custom-resolver' && s.rawUrl === 'https://worker-custom.example/tv/1396/2/5.m3u8'));
        assert.ok(workerData.sources.some((s) => s.id === 'addon-hls' && s.rawUrl === 'https://cdn.example/bb/s2e5.m3u8'));
        assert.ok(workerData.warnings?.length >= 1);
      } finally {
        globalThis.fetch = origFetch;
      }
    }
  );
});

test('batch Debrid checkcached (TorBox) and multi-candidate iteration (Real-Debrid) select cached stream over uncached hash #1', async () => {
  const hash4kUncached = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const hash1080Cached = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const hash720Cached = 'cccccccccccccccccccccccccccccccccccccccc';

  await withMockUpstream(
    (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/stream/movie/tt0816692.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            streams: [
              {
                name: 'Torrent 4K',
                title: 'Interstellar.2160p.REMUX\n👤 400',
                infoHash: hash4kUncached,
                fileIdx: 0,
              },
              {
                name: 'Torrent 1080p',
                title: 'Interstellar.1080p.BluRay\n👤 250',
                infoHash: hash1080Cached,
                fileIdx: 0,
              },
              {
                name: 'Torrent 720p',
                title: 'Interstellar.720p.WEB\n👤 90',
                infoHash: hash720Cached,
                fileIdx: 0,
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
      const torboxCheckUrls = [];
      const rdDeletedIds = [];
      let torboxResponseShape = 'array';

      globalThis.fetch = async (url, opts = {}) => {
        const href = String(url);
        if (href.startsWith('https://api.torbox.app/v1/api/')) {
          if (href.includes('/torrents/checkcached')) {
            torboxCheckUrls.push(href);
            if (torboxResponseShape === 'object') {
              return new Response(
                JSON.stringify({ data: { [hash4kUncached]: false, [hash1080Cached]: { name: 'cached.mp4' } } }),
                { status: 200 }
              );
            }
            return new Response(
              JSON.stringify({ data: [{ hash: hash1080Cached }, { hash: hash720Cached }] }),
              { status: 200 }
            );
          }
          if (href.includes('/torrents/createtorrent')) {
            const body = String(opts.body || '');
            assert.ok(body.includes(hash1080Cached), 'TorBox must create torrent only for cached winning hash');
            return new Response(JSON.stringify({ data: { torrent_id: 'tb-99' } }), { status: 200 });
          }
          if (href.includes('/torrents/mylist')) {
            return new Response(
              JSON.stringify({
                data: { id: 'tb-99', files: [{ id: 7, name: 'Interstellar.1080p.mp4', size: 4_000_000_000 }] },
              }),
              { status: 200 }
            );
          }
          if (href.includes('/torrents/requestdl')) {
            return new Response(JSON.stringify({ data: 'https://cdn.torbox.example/interstellar-1080.mp4' }), {
              status: 200,
            });
          }
        }

        if (href.startsWith('https://api.real-debrid.com/rest/1.0/')) {
          if (href.includes('/torrents/addMagnet')) {
            const body = String(opts.body || '');
            const id = body.includes(hash4kUncached) ? 'rd-uncached' : 'rd-cached';
            return new Response(JSON.stringify({ id }), { status: 201 });
          }
          if (href.includes('/torrents/selectFiles/')) {
            return new Response(null, { status: 204 });
          }
          if (href.includes('/torrents/info/rd-uncached')) {
            return new Response(JSON.stringify({ status: 'magnet_conversion', links: [] }), { status: 200 });
          }
          if (href.includes('/torrents/delete/rd-uncached')) {
            rdDeletedIds.push('rd-uncached');
            return new Response(null, { status: 204 });
          }
          if (href.includes('/torrents/info/rd-cached')) {
            return new Response(
              JSON.stringify({
                status: 'downloaded',
                links: ['https://rd.example/cached-1080'],
                files: [{ selected: 1, path: '/Interstellar.1080p.mp4', bytes: 3_500_000_000 }],
              }),
              { status: 200 }
            );
          }
          if (href.includes('/unrestrict/link')) {
            return new Response(JSON.stringify({ download: 'https://cdn.real-debrid.example/1080.mp4' }), {
              status: 200,
            });
          }
        }

        return origFetch(url, opts);
      };

      try {
        await withSunoServer(async (base) => {
          // 1) TorBox batch checkcached via Node server /api/resolve/stream
          const tbResp = await fetch(
            `${base}/api/resolve/stream?tmdbId=157336&imdbId=tt0816692&mediaType=movie`,
            {
              headers: {
                'X-Addon-Urls': JSON.stringify([addonBase]),
                'X-Debrid-Key': 'tb-key',
                'X-Debrid-Provider': 'torbox',
              },
            }
          );
          assert.equal(tbResp.status, 200);
          const tbData = await tbResp.json();
          assert.equal(torboxCheckUrls.length, 1, 'Must batch check all candidate hashes in one checkcached call');
          assert.ok(torboxCheckUrls[0].includes(`${hash4kUncached}%2C${hash1080Cached}%2C${hash720Cached}`) ||
            torboxCheckUrls[0].includes(`${hash4kUncached},${hash1080Cached},${hash720Cached}`));

          const tbNode = tbData.sources.find((s) => s.id === 'debrid-instant-cache');
          assert.ok(tbNode, 'Must resolve cached 1080p candidate when 4K #1 is uncached');
          assert.equal(tbNode.infoHash, hash1080Cached);
          assert.equal(tbNode.quality, '1080p');
          assert.equal(tbNode.rawUrl, 'https://cdn.torbox.example/interstellar-1080.mp4');

          // 2) Real-Debrid multi-candidate iteration cleans up uncached #1 and resolves #2
          const rdResp = await fetch(
            `${base}/api/resolve/stream?tmdbId=157336&imdbId=tt0816692&mediaType=movie`,
            {
              headers: {
                'X-Addon-Urls': JSON.stringify([addonBase]),
                'X-Debrid-Key': 'rd-key',
                'X-Debrid-Provider': 'realdebrid',
              },
            }
          );
          assert.equal(rdResp.status, 200);
          const rdData = await rdResp.json();
          assert.deepEqual(rdDeletedIds, ['rd-uncached']);
          const rdNode = rdData.sources.find((s) => s.id === 'debrid-instant-cache');
          assert.ok(rdNode);
          assert.equal(rdNode.infoHash, hash1080Cached);
          assert.equal(rdNode.rawUrl, 'https://cdn.real-debrid.example/1080.mp4');
        });

        // 3) Direct unit check for Worker resolveDebridCandidates with object-map checkcached shape
        torboxResponseShape = 'object';
        const workerRes = await workerResolveDebridCandidates({
          provider: 'torbox',
          apiKey: 'tb-key',
          candidates: [
            { infoHash: hash4kUncached, quality: '4K UHD', title: '4K Uncached' },
            { infoHash: hash1080Cached, quality: '1080p', title: '1080p Cached' },
          ],
        });
        assert.ok(workerRes);
        assert.equal(workerRes.url, 'https://cdn.torbox.example/interstellar-1080.mp4');
        assert.equal(workerRes.candidate.infoHash, hash1080Cached);

        const serverRes = await resolveDebridCandidates({
          provider: 'torbox',
          apiKey: 'tb-key',
          candidates: [{ infoHash: hash1080Cached, quality: '1080p', title: '1080p Cached' }],
        });
        assert.equal(serverRes?.url, 'https://cdn.torbox.example/interstellar-1080.mp4');
      } finally {
        globalThis.fetch = origFetch;
      }
    }
  );
});
