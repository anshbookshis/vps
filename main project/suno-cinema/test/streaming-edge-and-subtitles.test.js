import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { srtToVtt, loadSubtitleTrackAsVttUrl } from '../src/utils/client-api.js';
import { loadPlayerPrefs } from '../src/utils/storage.js';
import { renderSettingsSheet } from '../src/components/modals.js';
import workerProxy from '../cloudflare-hls-proxy.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('client-api srtToVtt and loadSubtitleTrackAsVttUrl handle direct CORS SRT and Edge Proxy fallback', async () => {
  const vtt = srtToVtt('\uFEFF1\r\n00:00:02,100 --> 00:00:05,900\r\nTest Cue\r\n');
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(vtt.includes('00:00:02.100 --> 00:00:05.900'));

  const origFetch = globalThis.fetch;

  // 1) Direct CORS SRT succeeds -> converts in-browser without calling proxy
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://subs.cors.example/eng.srt');
    return new Response('1\n00:00:01,000 --> 00:00:02,000\nDirect CORS\n', { status: 200 });
  };
  try {
    const directRes = await loadSubtitleTrackAsVttUrl(
      { url: 'https://subs.cors.example/eng.srt' },
      { hlsProxyUrl: 'https://edge.workers.dev' }
    );
    assert.ok(directRes && directRes.vttText.includes('00:00:01.000 --> 00:00:02.000'));
    assert.ok(directRes.url.startsWith('blob:') || directRes.url.startsWith('data:text/vtt'));
  } finally {
    globalThis.fetch = origFetch;
  }

  // 2) Direct fetch blocked (CORS error) -> falls back to Edge Proxy /api/proxy/subtitles
  const calledUrls = [];
  globalThis.fetch = async (url) => {
    calledUrls.push(String(url));
    if (String(url).startsWith('https://blocked.example/')) {
      throw new TypeError('CORS blocked');
    }
    return new Response('WEBVTT\n\n00:00:03.000 --> 00:00:04.000\nProxied Sub\n', { status: 200 });
  };
  try {
    const proxiedRes = await loadSubtitleTrackAsVttUrl(
      { url: 'https://blocked.example/sub.srt' },
      { hlsProxyUrl: 'https://edge.workers.dev/' }
    );
    assert.equal(calledUrls[0], 'https://blocked.example/sub.srt');
    assert.equal(
      calledUrls[1],
      'https://edge.workers.dev/api/proxy/subtitles?url=https%3A%2F%2Fblocked.example%2Fsub.srt'
    );
    assert.ok(proxiedRes && proxiedRes.vttText.includes('Proxied Sub'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('storage defaults & Settings modal preserve strict sandbox and expose Edge Proxy / Debrid config with Suno branding', () => {
  const prefs = loadPlayerPrefs();
  assert.equal(prefs.playerProvider, 'vidlink');
  assert.equal(prefs.hlsProxyUrl, '');
  assert.equal(prefs.debridProvider, 'realdebrid');
  assert.equal(prefs.debridApiKey, '');
  assert.equal(prefs.stremioAddonUrl, '');

  const html = renderSettingsSheet({
    appearance: { theme: 'default', amoled: true },
    prefs,
    shield: { blockedCount: 0, navigationLock: true, strictFrameMode: true },
    profile: { name: 'Ansh' },
  });
  assert.ok(html.includes('Suno Cinema Settings'));
  assert.ok(html.includes('id="pref-hls-proxy"'));
  assert.ok(html.includes('id="pref-stremio-addon"'));
  assert.ok(html.includes('id="pref-debrid-provider"'));
  assert.ok(html.includes('id="pref-debrid-key"'));
  assert.equal(/net77|netflix/i.test(html), false, 'Settings modal must preserve Suno Cinema branding');
});

test('Cloudflare Worker (cloudflare-hls-proxy.js) handles health, Range/206, #EXT-X-MEDIA, subtitles, and resolver', async () => {
  // Health route
  const healthResp = await workerProxy.fetch(new Request('https://edge.workers.dev/api/health'));
  assert.equal(healthResp.status, 200);
  assert.equal(healthResp.headers.get('access-control-allow-origin'), '*');
  const health = await healthResp.json();
  assert.equal(health.ok, true);
  assert.equal(health.runtime, 'cloudflare-worker');
  assert.equal(health.rangeForwardingEnabled, true);
  assert.equal(health.subtitleProxyEnabled, true);

  // OPTIONS preflight
  const optResp = await workerProxy.fetch(new Request('https://edge.workers.dev/api/proxy/hls', { method: 'OPTIONS' }));
  assert.equal(optResp.status, 204);
  assert.equal(optResp.headers.get('access-control-allow-origin'), '*');

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href === 'https://origin.example/master.m3u8') {
      return new Response(
        '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Italian",URI="ita.m3u8"\n720.m3u8\n',
        { status: 200, headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }
      );
    }
    if (href === 'https://origin.example/video.m4s') {
      const range = new Headers(init.headers || {}).get('range') || '';
      assert.equal(range, 'bytes=0-3');
      return new Response('ABCD', {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': 'bytes 0-3/100',
          'Content-Length': '4',
          'Accept-Ranges': 'bytes',
        },
      });
    }
    if (href === 'https://origin.example/cc.srt') {
      return new Response('1\n00:00:00,500 --> 00:00:02,000\nWorker Cue\n', { status: 200 });
    }
    throw new Error(`Unexpected upstream fetch: ${href}`);
  };

  try {
    // Root worker route /?url=... with #EXT-X-MEDIA rewrite
    const manifestResp = await workerProxy.fetch(
      new Request('https://edge.workers.dev/?url=https%3A%2F%2Forigin.example%2Fmaster.m3u8')
    );
    assert.equal(manifestResp.status, 200);
    const manifestText = await manifestResp.text();
    assert.ok(manifestText.includes('URI="/?url=https%3A%2F%2Forigin.example%2Fita.m3u8'));

    // Range/206 forwarding on /api/proxy/hls
    const rangeResp = await workerProxy.fetch(
      new Request('https://edge.workers.dev/api/proxy/hls?url=https%3A%2F%2Forigin.example%2Fvideo.m4s', {
        headers: { Range: 'bytes=0-3' },
      })
    );
    assert.equal(rangeResp.status, 206);
    assert.equal(rangeResp.headers.get('content-range'), 'bytes 0-3/100');
    assert.equal(rangeResp.headers.get('access-control-allow-origin'), '*');
    assert.equal(await rangeResp.text(), 'ABCD');

    // Subtitle SRT -> VTT
    const subResp = await workerProxy.fetch(
      new Request('https://edge.workers.dev/api/proxy/subtitles?url=https%3A%2F%2Forigin.example%2Fcc.srt')
    );
    assert.equal(subResp.status, 200);
    assert.equal(subResp.headers.get('content-type'), 'text/vtt; charset=utf-8');
    const vttText = await subResp.text();
    assert.ok(vttText.startsWith('WEBVTT\n\n'));
    assert.ok(vttText.includes('00:00:00.500 --> 00:00:02.000'));

    // Worker /api/resolve/stream with directUrl
    const resolveResp = await workerProxy.fetch(
      new Request(
        'https://edge.workers.dev/api/resolve/stream?tmdbId=27205&directUrl=https%3A%2F%2Forigin.example%2Fmaster.m3u8'
      )
    );
    assert.equal(resolveResp.status, 200);
    const resolveJson = await resolveResp.json();
    assert.ok(
      resolveJson.sources.some(
        (s) => s.id === 'custom-stream' && s.url.startsWith('https://edge.workers.dev/api/proxy/hls?url=')
      )
    );
    assert.ok(resolveJson.sources.some((s) => s.id === 'vidlink-shield'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('static project hygiene: CSS braces balanced, relative ./ paths in index.html, and Suno Cinema branding preserved', () => {
  const css = fs.readFileSync(path.join(ROOT_DIR, 'styles.css'), 'utf8');
  const openBraces = (css.match(/\{/g) || []).length;
  const closeBraces = (css.match(/\}/g) || []).length;
  assert.equal(openBraces, closeBraces, 'styles.css braces must be balanced');

  const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(html.includes('href="./styles.css"'));
  assert.ok(html.includes('src="./src/app.js"'));
  assert.ok(html.includes('Suno Cinema'));
  assert.equal(/net77|netflix/i.test(html), false);
});
