/**
 * Suno Cinema — Standalone Edge HLS, Range, Subtitle & Stream Resolver Proxy
 * Single-file Cloudflare Worker (ES Module format) for static GitHub Pages deployments.
 *
 * Deployment (Cloudflare Dashboard or Wrangler):
 *   1. Create a Worker and paste this entire file (or run `wrangler deploy cloudflare-hls-proxy.js`).
 *   2. Optional Worker Environment Secrets / Vars:
 *      - DEBRID_API_KEY       (Real-Debrid or TorBox API key)
 *      - DEBRID_PROVIDER      ("realdebrid" or "torbox", defaults to "realdebrid")
 *      - STREMIO_ADDON_URL    (Base URL of a Stremio stream addon, e.g. https://addon.example)
 *   3. Paste the deployed *.workers.dev URL into Suno Cinema -> Settings -> HLS Edge Proxy URL.
 */

const DEFAULT_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_RETRY_BACKOFF_MS = [250, 600];
const DISGUISE_SCAN_BYTES = 20480;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
};

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(err) {
  return Boolean(err && (err.name === 'AbortError' || err.name === 'TimeoutError' || /timeout/i.test(err.message || '')));
}

export async function fetchWithRetry(url, options = {}, config = {}) {
  const timeoutMs = config.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxRetries = config.maxRetries ?? 2;
  const backoffMs = config.backoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
  const callerSignal = options.signal;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (callerSignal?.aborted) {
      throw callerSignal.reason || new Error('Client aborted request');
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`Upstream request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onCallerAbort = () => controller.abort(callerSignal.reason || new Error('Client aborted request'));
    if (callerSignal) {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const resp = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);

      if ((resp.status === 429 || resp.status >= 500) && attempt < maxRetries) {
        await resp.body?.cancel?.().catch(() => {});
        await delay(backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 250);
        continue;
      }

      return resp;
    } catch (err) {
      clearTimeout(timer);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
      if (callerSignal?.aborted) throw err;

      lastError = timedOut ? new Error(`Upstream request timed out after ${timeoutMs}ms`) : err;
      if (timedOut) lastError.name = 'TimeoutError';

      if (attempt < maxRetries) {
        await delay(backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 250);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error('Upstream request failed');
}

function isAlreadyProxiedUri(rawUri, absHref, proxyEndpoint) {
  if (!rawUri) return false;
  if (
    rawUri.startsWith('/api/proxy/hls?') ||
    rawUri.startsWith('/api/proxy/subtitles?') ||
    rawUri.startsWith(`${proxyEndpoint}?`)
  ) {
    return true;
  }
  try {
    const parsed = new URL(absHref);
    const epPath = new URL(proxyEndpoint, 'https://proxy.local').pathname;
    if (
      epPath !== '/' &&
      (parsed.pathname === epPath || parsed.pathname === '/api/proxy/hls' || parsed.pathname === '/api/proxy/subtitles') &&
      parsed.searchParams.has('url')
    ) {
      return true;
    }
  } catch {
    // Ignore parse error
  }
  return false;
}

export function rewriteHlsManifest(manifestText, baseUrl, proxyEndpoint = '/api/proxy/hls', referer = '') {
  if (typeof manifestText !== 'string') return '';
  const buildProxyUrl = (absHref) =>
    `${proxyEndpoint}?url=${encodeURIComponent(absHref)}${
      referer ? `&referer=${encodeURIComponent(referer)}` : ''
    }`;

  return manifestText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#') && /URI="[^"]+"/i.test(line)) {
        return line.replace(/URI="([^"]+)"/gi, (match, uri) => {
          try {
            const abs = new URL(uri, baseUrl).href;
            if (isAlreadyProxiedUri(uri, abs, proxyEndpoint)) return match;
            return `URI="${buildProxyUrl(abs)}"`;
          } catch {
            return match;
          }
        });
      }

      if (!trimmed.startsWith('#')) {
        try {
          const abs = new URL(trimmed, baseUrl).href;
          if (isAlreadyProxiedUri(trimmed, abs, proxyEndpoint)) return line;
          return buildProxyUrl(abs);
        } catch {
          return line;
        }
      }

      return line;
    })
    .join('\n');
}

export function convertSrtToVtt(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) return 'WEBVTT\n\n';
  const clean = rawText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const trimmedStart = clean.trimStart();

  if (/^WEBVTT(?:[ \t\n]|$)/i.test(trimmedStart)) {
    return trimmedStart;
  }

  const converted = trimmedStart.replace(
    /^(\d{1,2}):(\d{2}:\d{2})[,.](\d{3})([ \t]*-->[ \t]*)(\d{1,2}):(\d{2}:\d{2})[,.](\d{3})(.*)$/gm,
    (_, h1, ms1, f1, arrow, h2, ms2, f2, rest) =>
      `${h1.padStart(2, '0')}:${ms1}.${f1}${arrow}${h2.padStart(2, '0')}:${ms2}.${f2}${rest}`
  );

  return `WEBVTT\n\n${converted}`;
}

function hasDisguisedHeader(bytes) {
  if (!bytes || bytes.length < 4) return false;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWoff = bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;
  return isPng || isJpg || isWoff;
}

export function unmaskDisguisedSegment(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 188) return bytes;
  if (!hasDisguisedHeader(bytes)) return bytes;

  const scanLimit = Math.min(bytes.length - 376, 16384);
  for (let i = 0; i < scanLimit; i++) {
    if (bytes[i] === 0x47 && bytes[i + 188] === 0x47 && bytes[i + 376] === 0x47) {
      return bytes.subarray(i);
    }
  }

  const boxLimit = Math.min(bytes.length - 8, 4096);
  for (let i = 0; i < boxLimit; i++) {
    const tag = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    if (tag === 'ftyp' || tag === 'moof' || tag === 'styp') {
      return bytes.subarray(i);
    }
  }

  return bytes;
}

function resolveSegmentMimeType(targetUrl, upstreamContentType = '') {
  let cleanPath = '';
  try {
    cleanPath = new URL(targetUrl).pathname.toLowerCase();
  } catch {
    cleanPath = String(targetUrl || '').toLowerCase();
  }
  const ctLower = String(upstreamContentType || '').toLowerCase();

  if (cleanPath.endsWith('.vtt') || ctLower.includes('text/vtt')) return 'text/vtt; charset=utf-8';
  if (cleanPath.endsWith('.m4s') || cleanPath.endsWith('.mp4') || cleanPath.endsWith('.m4v') || cleanPath.endsWith('.cmfv')) {
    return 'video/mp4';
  }
  if (cleanPath.endsWith('.m4a') || cleanPath.endsWith('.cmfa')) return 'audio/mp4';
  if (cleanPath.endsWith('.aac')) return 'audio/aac';
  if (cleanPath.endsWith('.mp3')) return 'audio/mpeg';
  if (cleanPath.endsWith('.key')) return 'application/octet-stream';
  if (cleanPath.endsWith('.ts')) return 'video/mp2t';

  if (
    ctLower &&
    !ctLower.startsWith('image/') &&
    !ctLower.startsWith('font/') &&
    ctLower !== 'application/octet-stream'
  ) {
    return upstreamContentType;
  }
  return 'video/mp2t';
}

function concatUint8Arrays(chunks) {
  if (chunks.length === 1) return chunks[0];
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function buildUpstreamHeaders(referer, rangeHeader) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Encoding': 'identity',
  };
  if (referer) {
    headers['Referer'] = referer;
    try {
      headers['Origin'] = new URL(referer).origin;
    } catch {
      // Ignore invalid referer URL
    }
  }
  if (rangeHeader) {
    headers['Range'] = rangeHeader;
  }
  return headers;
}

async function handleHlsProxy(request, reqUrl) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const targetUrl = reqUrl.searchParams.get('url') || '';
  const referer = reqUrl.searchParams.get('referer') || '';
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return jsonResponse({ error: 'Valid http/https "url" query parameter required' }, 400);
  }
  try {
    new URL(targetUrl);
  } catch {
    return jsonResponse({ error: 'Malformed target "url" query parameter' }, 400);
  }

  const proxyEndpoint = reqUrl.pathname === '/' ? '/' : '/api/proxy/hls';
  const rangeHeader = request.headers.get('range') || '';
  const upstreamHeaders = buildUpstreamHeaders(referer, rangeHeader);

  let upstreamResp;
  try {
    upstreamResp = await fetchWithRetry(targetUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: request.signal,
    });

    if (request.method === 'HEAD' && upstreamResp.status === 405) {
      await upstreamResp.body?.cancel?.().catch(() => {});
      upstreamResp = await fetchWithRetry(targetUrl, {
        method: 'GET',
        headers: upstreamHeaders,
        redirect: 'follow',
        signal: request.signal,
      });
    }
  } catch (err) {
    return jsonResponse(
      {
        error: isTimeoutError(err) ? 'HLS proxy upstream timeout' : 'HLS proxy upstream gateway error',
        message: err.message,
        targetUrl,
      },
      isTimeoutError(err) ? 504 : 502
    );
  }

  if (upstreamResp.status === 416) {
    const contentRange = upstreamResp.headers.get('content-range');
    await upstreamResp.body?.cancel?.().catch(() => {});
    return jsonResponse(
      { error: 'Requested range not satisfiable', targetUrl },
      416,
      contentRange ? { 'Content-Range': contentRange } : {}
    );
  }

  if (!upstreamResp.ok) {
    await upstreamResp.body?.cancel?.().catch(() => {});
    return jsonResponse(
      {
        error: `Upstream HTTP ${upstreamResp.status} ${upstreamResp.statusText}`.trim(),
        targetUrl,
      },
      upstreamResp.status
    );
  }

  const finalUrl = upstreamResp.url || targetUrl;
  let cleanPath = '';
  try {
    cleanPath = new URL(finalUrl).pathname.toLowerCase();
  } catch {
    cleanPath = finalUrl.toLowerCase();
  }

  const upstreamCt = upstreamResp.headers.get('content-type') || '';
  const ctLower = upstreamCt.toLowerCase();
  const isManifest =
    ctLower.includes('mpegurl') ||
    cleanPath.endsWith('.m3u8') ||
    cleanPath.endsWith('.m3u') ||
    finalUrl.toLowerCase().includes('.m3u8');

  if (isManifest) {
    if (request.method === 'HEAD') {
      await upstreamResp.body?.cancel?.().catch(() => {});
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS,
        },
      });
    }
    const text = await upstreamResp.text();
    const rewritten = rewriteHlsManifest(text, finalUrl, proxyEndpoint, referer || finalUrl);
    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...CORS_HEADERS,
      },
    });
  }

  const status = upstreamResp.status === 206 ? 206 : 200;
  const upstreamContentRange = upstreamResp.headers.get('content-range');
  const upstreamContentEncoding = upstreamResp.headers.get('content-encoding');
  const upstreamContentLength = !upstreamContentEncoding ? upstreamResp.headers.get('content-length') : null;
  const acceptRanges = upstreamResp.headers.get('accept-ranges') || 'bytes';
  const outHeaders = new Headers({
    'Content-Type': resolveSegmentMimeType(finalUrl, upstreamCt),
    'Accept-Ranges': acceptRanges,
    'Cache-Control': status === 206 ? 'no-cache' : 'public, max-age=3600',
    ...CORS_HEADERS,
  });
  if (upstreamContentRange) outHeaders.set('Content-Range', upstreamContentRange);
  if (upstreamContentLength !== null) outHeaders.set('Content-Length', upstreamContentLength);

  if (request.method === 'HEAD' || !upstreamResp.body) {
    await upstreamResp.body?.cancel?.().catch(() => {});
    return new Response(null, { status, headers: outHeaders });
  }

  // Stream 206 partial content directly without modifying byte offsets
  if (status === 206) {
    return new Response(upstreamResp.body, { status: 206, headers: outHeaders });
  }

  // For 200 responses, peek initial bytes only to handle text/plain M3U8 or disguised image/font prefixes
  const reader = upstreamResp.body.getReader();
  const initialChunks = [];
  let initialLen = 0;

  while (initialLen < 8) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value && value.length > 0) {
      initialChunks.push(value);
      initialLen += value.length;
    }
  }

  if (initialLen === 0) {
    outHeaders.set('Content-Length', '0');
    return new Response(null, { status: 200, headers: outHeaders });
  }

  let headBuf = concatUint8Arrays(initialChunks);

  if (ctLower.startsWith('text/plain') && !cleanPath.endsWith('.vtt') && !cleanPath.endsWith('.srt')) {
    const probe = new TextDecoder().decode(headBuf.subarray(0, 32));
    if (probe.trimStart().startsWith('#EXTM3U')) {
      const restChunks = [headBuf];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length > 0) restChunks.push(value);
      }
      const fullText = new TextDecoder().decode(concatUint8Arrays(restChunks));
      const rewritten = rewriteHlsManifest(fullText, finalUrl, proxyEndpoint, referer || finalUrl);
      return new Response(rewritten, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS,
        },
      });
    }
  }

  if (hasDisguisedHeader(headBuf)) {
    const scanChunks = [headBuf];
    let total = headBuf.length;
    while (total < DISGUISE_SCAN_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        scanChunks.push(value);
        total += value.length;
      }
    }
    const rawHead = concatUint8Arrays(scanChunks);
    const unmasked = unmaskDisguisedSegment(rawHead);
    const stripped = rawHead.length - unmasked.length;
    headBuf = unmasked;
    if (stripped > 0) {
      if (upstreamContentLength !== null && Number.isFinite(Number(upstreamContentLength))) {
        outHeaders.set('Content-Length', String(Math.max(0, Number(upstreamContentLength) - stripped)));
      }
      outHeaders.set('Content-Type', resolveSegmentMimeType(finalUrl, ''));
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      if (headBuf.length > 0) {
        controller.enqueue(headBuf);
      }
    },
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        if (value && value.length > 0) {
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      return reader.cancel(reason).catch(() => {});
    },
  });

  return new Response(stream, { status: 200, headers: outHeaders });
}

async function handleSubtitleProxy(request, reqUrl) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const targetUrl = reqUrl.searchParams.get('url') || '';
  const referer = reqUrl.searchParams.get('referer') || '';
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return jsonResponse({ error: 'Valid http/https "url" query parameter required' }, 400);
  }

  const headers = buildUpstreamHeaders(referer, '');
  delete headers['Accept-Encoding'];

  let upstreamResp;
  try {
    upstreamResp = await fetchWithRetry(targetUrl, {
      method: request.method,
      headers,
      redirect: 'follow',
      signal: request.signal,
    });
    if (request.method === 'HEAD' && upstreamResp.status === 405) {
      await upstreamResp.body?.cancel?.().catch(() => {});
      upstreamResp = await fetchWithRetry(targetUrl, {
        method: 'GET',
        headers,
        redirect: 'follow',
        signal: request.signal,
      });
    }
  } catch (err) {
    return jsonResponse(
      {
        error: isTimeoutError(err) ? 'Subtitle proxy upstream timeout' : 'Subtitle proxy upstream error',
        message: err.message,
        targetUrl,
      },
      isTimeoutError(err) ? 504 : 502
    );
  }

  if (!upstreamResp.ok) {
    await upstreamResp.body?.cancel?.().catch(() => {});
    return jsonResponse(
      {
        error: `Upstream HTTP ${upstreamResp.status} ${upstreamResp.statusText}`.trim(),
        targetUrl,
      },
      upstreamResp.status
    );
  }

  const vttHeaders = {
    'Content-Type': 'text/vtt; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
    ...CORS_HEADERS,
  };

  if (request.method === 'HEAD') {
    await upstreamResp.body?.cancel?.().catch(() => {});
    return new Response(null, { status: 200, headers: vttHeaders });
  }

  const rawText = await upstreamResp.text();
  return new Response(convertSrtToVtt(rawText), { status: 200, headers: vttHeaders });
}

function extractInfoHash(magnet, rawHash = '') {
  const cleanHash = String(rawHash || '').trim();
  if (/^[a-fA-F0-9]{40}$/.test(cleanHash)) return cleanHash.toLowerCase();
  const match = String(magnet || '').match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
  return match ? match[1].toLowerCase() : '';
}

function makeProxyHlsUrl(origin, targetUrl, referer = '') {
  if (!targetUrl) return '';
  return `${origin}/api/proxy/hls?url=${encodeURIComponent(targetUrl)}${
    referer ? `&referer=${encodeURIComponent(referer)}` : ''
  }`;
}

async function resolveRealDebridStream(apiKey, magnetUri) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const addResp = await fetchWithRetry(
    'https://api.real-debrid.com/rest/1.0/torrents/addMagnet',
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ magnet: magnetUri }).toString(),
    },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!addResp.ok) return null;
  const added = await addResp.json();
  if (!added?.id) return null;

  const torrentId = added.id;
  await fetchWithRetry(
    `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${encodeURIComponent(torrentId)}`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ files: 'all' }).toString(),
    },
    { timeoutMs: 6000, maxRetries: 1 }
  ).catch(() => null);

  const infoResp = await fetchWithRetry(
    `https://api.real-debrid.com/rest/1.0/torrents/info/${encodeURIComponent(torrentId)}`,
    { headers },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!infoResp.ok) return null;
  const info = await infoResp.json();
  if (info?.status !== 'downloaded' || !Array.isArray(info.links) || !info.links[0]) {
    await fetch(`https://api.real-debrid.com/rest/1.0/torrents/delete/${encodeURIComponent(torrentId)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => {});
    return null;
  }

  const unrestrictResp = await fetchWithRetry(
    'https://api.real-debrid.com/rest/1.0/unrestrict/link',
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ link: info.links[0] }).toString(),
    },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!unrestrictResp.ok) return null;
  const unrestrict = await unrestrictResp.json();
  return unrestrict?.download && /^https?:\/\//i.test(unrestrict.download) ? unrestrict.download : null;
}

async function resolveTorBoxStream(apiKey, magnetUri, infoHash, preferredFileIdx) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (infoHash) {
    const checkResp = await fetchWithRetry(
      `https://api.torbox.app/v1/api/torrents/checkcached?hash=${encodeURIComponent(infoHash)}&format=list`,
      { headers },
      { timeoutMs: 5000, maxRetries: 1 }
    ).catch(() => null);
    if (checkResp?.ok) {
      const checkJson = await checkResp.json().catch(() => null);
      if (Array.isArray(checkJson?.data) && checkJson.data.length === 0) return null;
    }
  }

  const form = new URLSearchParams({ magnet: magnetUri });
  const createResp = await fetchWithRetry(
    'https://api.torbox.app/v1/api/torrents/createtorrent',
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!createResp.ok) return null;
  const created = await createResp.json();
  const torrentId = created?.data?.torrent_id;
  if (!torrentId) return null;

  const listResp = await fetchWithRetry(
    `https://api.torbox.app/v1/api/torrents/mylist?id=${encodeURIComponent(torrentId)}`,
    { headers },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!listResp.ok) return null;
  const listJson = await listResp.json();
  const torrentObj = Array.isArray(listJson?.data) ? listJson.data[0] : listJson?.data;
  const files = Array.isArray(torrentObj?.files) ? torrentObj.files : [];
  if (!files.length) return null;

  const picked =
    (Number.isInteger(preferredFileIdx) ? files[preferredFileIdx] : null) ||
    files.reduce((best, f) => (!best || (f.size || 0) > (best.size || 0) ? f : best), null);
  if (!picked?.id) return null;

  const dlResp = await fetchWithRetry(
    `https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${encodeURIComponent(
      torrentId
    )}&file_id=${encodeURIComponent(picked.id)}`,
    { headers },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!dlResp.ok) return null;
  const dlJson = await dlResp.json();
  return dlJson?.data && /^https?:\/\//i.test(dlJson.data) ? dlJson.data : null;
}

async function resolveDebridPlayableUrl({ provider, apiKey, magnet, infoHash, fileIdx }) {
  if (!apiKey) return null;
  const hash = extractInfoHash(magnet, infoHash);
  const magnetUri = magnet && magnet.startsWith('magnet:') ? magnet : hash ? `magnet:?xt=urn:btih:${hash}` : '';
  if (!magnetUri) return null;

  try {
    if (provider === 'torbox') {
      return await resolveTorBoxStream(apiKey, magnetUri, hash, fileIdx);
    }
    return await resolveRealDebridStream(apiKey, magnetUri);
  } catch {
    return null;
  }
}

async function handleResolveStream(request, reqUrl, env = {}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const origin = reqUrl.origin;
  const tmdbId = reqUrl.searchParams.get('tmdbId') || '';
  const imdbId = reqUrl.searchParams.get('imdbId') || '';
  const anilistId = reqUrl.searchParams.get('anilistId') || '';
  const malId = reqUrl.searchParams.get('malId') || '';
  const mediaType = reqUrl.searchParams.get('mediaType') || 'movie';
  const season = Math.max(1, Number(reqUrl.searchParams.get('season') || 1));
  const episode = Math.max(1, Number(reqUrl.searchParams.get('episode') || 1));
  const directUrl = reqUrl.searchParams.get('directUrl') || '';
  const referer = reqUrl.searchParams.get('referer') || '';
  const magnet = reqUrl.searchParams.get('magnet') || '';
  const hash = (reqUrl.searchParams.get('hash') || reqUrl.searchParams.get('infoHash') || '').trim();

  const addonUrl = (reqUrl.searchParams.get('addonUrl') || request.headers.get('x-addon-url') || env.STREMIO_ADDON_URL || '').trim();
  const debridKey = (
    reqUrl.searchParams.get('debridKey') ||
    reqUrl.searchParams.get('debridToken') ||
    request.headers.get('x-debrid-key') ||
    env.DEBRID_API_KEY ||
    ''
  ).trim();
  const debridProvider = (
    reqUrl.searchParams.get('debridProvider') ||
    request.headers.get('x-debrid-provider') ||
    env.DEBRID_PROVIDER ||
    'realdebrid'
  )
    .trim()
    .toLowerCase();

  const sources = [];
  const warnings = [];

  if (directUrl && /^https?:\/\//i.test(directUrl)) {
    const isHls = directUrl.toLowerCase().includes('.m3u8');
    sources.push({
      id: 'custom-stream',
      name: isHls ? 'Direct HLS Stream (Edge Proxy)' : 'Direct MP4 Video',
      type: isHls ? 'hls' : 'direct',
      url: isHls ? makeProxyHlsUrl(origin, directUrl, referer) : directUrl,
      rawUrl: directUrl,
      quality: 'Original Quality',
      shielded: true,
      direct: true,
      node: isHls ? 'edge-proxy' : 'direct',
    });
    if (isHls) {
      sources.push({
        id: 'custom-stream-direct',
        name: 'Direct HLS Stream (CORS)',
        type: 'hls',
        url: directUrl,
        rawUrl: directUrl,
        quality: 'Original Quality',
        shielded: true,
        direct: true,
        node: 'direct',
      });
    }
  }

  let pendingDebridCandidate = null;

  if (addonUrl && /^https?:\/\//i.test(addonUrl)) {
    try {
      let endpoint = '';
      if (addonUrl.includes('{')) {
        endpoint = addonUrl
          .replace(/\{tmdbId\}/g, encodeURIComponent(tmdbId))
          .replace(/\{imdbId\}/g, encodeURIComponent(imdbId))
          .replace(/\{anilistId\}/g, encodeURIComponent(anilistId))
          .replace(/\{mediaType\}/g, encodeURIComponent(mediaType))
          .replace(/\{season\}/g, encodeURIComponent(String(season)))
          .replace(/\{episode\}/g, encodeURIComponent(String(episode)));
      } else {
        const addonBase = addonUrl.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '');
        const stremioType = mediaType === 'tv' || mediaType === 'series' ? 'series' : mediaType === 'anime' && !imdbId ? 'anime' : 'movie';
        const stremioId =
          stremioType === 'series'
            ? imdbId
              ? `${imdbId}:${season}:${episode}`
              : tmdbId
              ? `tmdb:${tmdbId}:${season}:${episode}`
              : ''
            : stremioType === 'anime'
            ? anilistId
              ? `anilist:${anilistId}:${episode}`
              : ''
            : imdbId || (tmdbId ? `tmdb:${tmdbId}` : '');
        if (stremioId) {
          endpoint = `${addonBase}/stream/${stremioType}/${encodeURIComponent(stremioId)}.json`;
        }
      }

      if (endpoint) {
        const addonResp = await fetchWithRetry(endpoint, { headers: { Accept: 'application/json' } }, { timeoutMs: 6000, maxRetries: 1 });
        if (addonResp.ok) {
          const addonData = await addonResp.json();
          const streams = Array.isArray(addonData?.streams) ? addonData.streams : [];
          let addedCount = 0;
          for (const stream of streams) {
            if (addedCount >= 6) break;
            if (stream?.url && /^https?:\/\//i.test(stream.url)) {
              const reqProxyHeaders = stream.behaviorHints?.proxyHeaders?.request || {};
              const streamReferer = reqProxyHeaders.Referer || reqProxyHeaders.referer || '';
              const lowerUrl = stream.url.toLowerCase();
              const isMp4 = lowerUrl.includes('.mp4') && !lowerUrl.includes('.m3u8');
              if (stream.behaviorHints?.notWebReady === true && !lowerUrl.includes('.m3u8') && !isMp4) {
                continue;
              }
              const label = [stream.name, stream.title].filter(Boolean).join(' — ').split('\n')[0].slice(0, 80) || 'Addon HLS Stream';
              sources.push({
                id: addedCount === 0 ? 'addon-hls' : `addon-hls-${addedCount + 1}`,
                name: label,
                type: isMp4 ? 'direct' : 'hls',
                url: makeProxyHlsUrl(origin, stream.url, streamReferer),
                rawUrl: stream.url,
                referer: streamReferer,
                quality: /2160|4k/i.test(label) ? '4K UHD' : /1080/i.test(label) ? '1080p' : /720/i.test(label) ? '720p' : 'HD',
                shielded: true,
                direct: true,
                node: 'addon-edge-proxy',
              });
              addedCount += 1;
            } else if (stream?.infoHash && !pendingDebridCandidate) {
              pendingDebridCandidate = { infoHash: stream.infoHash, fileIdx: stream.fileIdx };
            }
          }
        }
      }
    } catch (err) {
      warnings.push(`Addon lookup failed: ${err.message}`);
    }
  }

  const resolvedHash = extractInfoHash(magnet, hash || pendingDebridCandidate?.infoHash || '');
  if (debridKey && (magnet || resolvedHash)) {
    const playable = await resolveDebridPlayableUrl({
      provider: debridProvider,
      apiKey: debridKey,
      magnet,
      infoHash: resolvedHash,
      fileIdx: pendingDebridCandidate?.fileIdx,
    });
    if (playable) {
      const isHls = playable.toLowerCase().includes('.m3u8');
      sources.push({
        id: 'debrid-instant-cache',
        name: `Instant Cached Stream (${debridProvider.toUpperCase()})`,
        type: isHls ? 'hls' : 'direct',
        url: makeProxyHlsUrl(origin, playable),
        rawUrl: playable,
        provider: debridProvider,
        quality: '1080p Remux',
        shielded: true,
        direct: true,
        node: 'debrid',
      });
    }
  }

  if (tmdbId || imdbId || (mediaType === 'anime' && malId)) {
    let vidlinkUrl;
    if (mediaType === 'anime' && malId) {
      vidlinkUrl = `https://vidlink.pro/anime/${encodeURIComponent(malId)}/${episode}/sub?primaryColor=ff4d6d&secondaryColor=00f0ff&autoplay=false&fallback=true`;
    } else if (mediaType === 'tv') {
      const idVal = tmdbId || imdbId;
      vidlinkUrl = `https://vidlink.pro/tv/${encodeURIComponent(idVal)}/${season}/${episode}?primaryColor=ff4d6d&secondaryColor=00f0ff&iconColor=ff4d6d&title=false&poster=true&autoplay=false`;
    } else {
      const idVal = tmdbId || imdbId;
      vidlinkUrl = `https://vidlink.pro/movie/${encodeURIComponent(idVal)}?primaryColor=ff4d6d&secondaryColor=00f0ff&iconColor=ff4d6d&title=false&poster=true&autoplay=false`;
    }

    sources.push({
      id: 'vidlink-shield',
      name: 'VidLink (No-Redirect Shield)',
      type: 'embed',
      url: vidlinkUrl,
      quality: '1080p',
      shielded: true,
      sandboxed: true,
      direct: false,
    });
  }

  if (tmdbId || imdbId || anilistId) {
    let vidriftUrl;
    if (mediaType === 'anime' && anilistId) {
      vidriftUrl = `https://embed.vidrift.net/embed/anilist/${encodeURIComponent(anilistId)}/${episode}?primaryColor=ff4d6d&autoplay=false`;
    } else if (mediaType === 'tv' && (tmdbId || imdbId)) {
      const idVal = tmdbId || imdbId;
      vidriftUrl = `https://embed.vidrift.net/embed/tv/${encodeURIComponent(idVal)}/${season}/${episode}?primaryColor=ff4d6d&autoplay=false`;
    } else {
      const idVal = tmdbId || imdbId;
      vidriftUrl = `https://embed.vidrift.net/embed/movie/${encodeURIComponent(idVal)}?primaryColor=ff4d6d&autoplay=false`;
    }

    sources.push({
      id: 'vidrift-sandboxed',
      name: 'VidRift (Sandboxed)',
      type: 'embed',
      url: vidriftUrl,
      quality: '720p/1080p',
      shielded: true,
      sandboxed: true,
      direct: false,
    });
  }

  return jsonResponse({
    ok: true,
    tmdbId,
    imdbId,
    anilistId,
    mediaType,
    season,
    episode,
    sources,
    ...(warnings.length ? { warnings } : {}),
  });
}

export default {
  async fetch(request, env = {}) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const reqUrl = new URL(request.url);
    let pathname;
    try {
      pathname = decodeURIComponent(reqUrl.pathname);
    } catch {
      return jsonResponse({ error: 'Bad Request' }, 400);
    }

    if (pathname === '/api/health') {
      return jsonResponse({
        ok: true,
        product: 'Suno Cinema',
        runtime: 'cloudflare-worker',
        hlsProxyEnabled: true,
        subtitleProxyEnabled: true,
        rangeForwardingEnabled: true,
        streamResolverEnabled: true,
        debridConfigured: Boolean(env.DEBRID_API_KEY),
        addonConfigured: Boolean(env.STREMIO_ADDON_URL),
      });
    }

    if (pathname === '/api/proxy/subtitles') {
      return handleSubtitleProxy(request, reqUrl);
    }

    if (pathname === '/api/resolve/stream') {
      return handleResolveStream(request, reqUrl, env);
    }

    if (pathname === '/api/proxy/hls') {
      return handleHlsProxy(request, reqUrl);
    }

    if (pathname === '/') {
      if (reqUrl.searchParams.has('url')) {
        return handleHlsProxy(request, reqUrl);
      }
      return jsonResponse({
        ok: true,
        service: 'Suno Cinema Edge HLS Proxy',
        routes: ['/api/proxy/hls?url=&referer=', '/api/proxy/subtitles?url=&referer=', '/api/resolve/stream', '/api/health'],
      });
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },
};
