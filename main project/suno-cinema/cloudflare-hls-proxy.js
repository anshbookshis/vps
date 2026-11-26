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
  'Access-Control-Allow-Headers':
    '*, Authorization, Range, Content-Type, X-Addon-Url, X-Addon-Urls, X-Debrid-Key, X-Debrid-Provider, X-Custom-Resolver, X-Tmdb-Key',
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

export function base64UrlEncode(bufferOrString) {
  let bytes;
  if (typeof bufferOrString === 'string') {
    bytes = new TextEncoder().encode(bufferOrString);
  } else if (bufferOrString instanceof Uint8Array) {
    bytes = bufferOrString;
  } else if (bufferOrString instanceof ArrayBuffer) {
    bytes = new Uint8Array(bufferOrString);
  } else {
    bytes = new Uint8Array(0);
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(str) {
  let base64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Sign an HMAC-SHA256 playback token using WebCrypto subtle API.
 *
 * @param {string} streamUrl
 * @param {object} [options]
 * @param {string} [secret]
 * @returns {Promise<string>}
 */
export async function signPlayTokenWorker(
  streamUrl,
  options = {},
  secret = 'suno-cinema-secret-token-key-2026'
) {
  const enc = new TextEncoder();
  const tokenSecret = options.secret || secret || 'suno-cinema-secret-token-key-2026';
  const expiresInSeconds = Number.isFinite(options.expiresInSeconds) ? options.expiresInSeconds : 7200;
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = options.exp || nowSec + expiresInSeconds;
  const payload = {
    url: String(streamUrl || ''),
    exp,
    iat: nowSec,
    ...(options.id ? { id: options.id } : {}),
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(tokenSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const sigB64 = base64UrlEncode(sigBuffer);
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify an HMAC-SHA256 playback token using WebCrypto subtle API.
 *
 * @param {string} tokenString
 * @param {string} [targetUrl]
 * @param {object} [options]
 * @param {string} [secret]
 * @returns {Promise<{ valid: boolean, error?: string, payload?: object }>}
 */
export async function verifyPlayTokenWorker(
  tokenString,
  targetUrl,
  options = {},
  secret = 'suno-cinema-secret-token-key-2026'
) {
  if (!tokenString || typeof tokenString !== 'string') {
    return { valid: false, error: 'Token missing' };
  }
  const parts = tokenString.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed token format' };
  }
  const [payloadB64, sigB64] = parts;
  const tokenSecret = options.secret || secret || 'suno-cinema-secret-token-key-2026';
  const enc = new TextEncoder();
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(tokenSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = base64UrlDecode(sigB64);
    const verified = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payloadB64));
    if (!verified) {
      return { valid: false, error: 'Invalid token signature' };
    }

    const payloadBytes = base64UrlDecode(payloadB64);
    const payloadJson = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadJson);

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      return { valid: false, error: 'Token expired', payload };
    }

    if (targetUrl && payload.url) {
      const normTarget = String(targetUrl).trim();
      const normTokenUrl = String(payload.url).trim();
      if (normTarget !== normTokenUrl) {
        try {
          const tObj = new URL(normTarget);
          const pObj = new URL(normTokenUrl);
          const pBasePath = pObj.pathname.substring(0, pObj.pathname.lastIndexOf('/') + 1);
          if (tObj.origin !== pObj.origin || !tObj.pathname.startsWith(pBasePath)) {
            return { valid: false, error: 'Token scope mismatch', payload };
          }
        } catch {
          return { valid: false, error: 'Token scope mismatch', payload };
        }
      }
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: err.message || 'Token verification failed' };
  }
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

export function rewriteHlsManifest(
  manifestText,
  baseUrl,
  proxyEndpoint = '/api/proxy/hls',
  referer = '',
  token = ''
) {
  if (typeof manifestText !== 'string') return '';
  const buildProxyUrl = (absHref) => {
    let u = `${proxyEndpoint}?url=${encodeURIComponent(absHref)}`;
    if (referer) u += `&referer=${encodeURIComponent(referer)}`;
    if (token) u += `&token=${encodeURIComponent(token)}`;
    return u;
  };

  return manifestText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#') && /URI="[^"]+"/i.test(line)) {
        return line.replace(/URI="([^"]+)"/gi, (match, uri) => {
          try {
            const abs = new URL(uri, baseUrl).href;
            if (isAlreadyProxiedUri(uri, abs, proxyEndpoint)) {
              if (token && !uri.includes('token=')) {
                const delim = uri.includes('?') ? '&' : '?';
                return `URI="${uri}${delim}token=${encodeURIComponent(token)}"`;
              }
              return match;
            }
            return `URI="${buildProxyUrl(abs)}"`;
          } catch {
            return match;
          }
        });
      }

      if (!trimmed.startsWith('#')) {
        try {
          const abs = new URL(trimmed, baseUrl).href;
          if (isAlreadyProxiedUri(trimmed, abs, proxyEndpoint)) {
            if (token && !trimmed.includes('token=')) {
              const delim = trimmed.includes('?') ? '&' : '?';
              return `${trimmed}${delim}token=${encodeURIComponent(token)}`;
            }
            return line;
          }
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

async function handleHlsProxy(request, reqUrl, env = {}, ctx = null) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const targetUrl = reqUrl.searchParams.get('url') || '';
  const referer = reqUrl.searchParams.get('referer') || '';
  const token = reqUrl.searchParams.get('token') || '';
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return jsonResponse({ error: 'Valid http/https "url" query parameter required' }, 400);
  }
  try {
    new URL(targetUrl);
  } catch {
    return jsonResponse({ error: 'Malformed target "url" query parameter' }, 400);
  }

  const requireToken = env.REQUIRE_PLAY_TOKEN === 'true' || env.REQUIRE_PLAY_TOKEN === '1';
  if (requireToken || token) {
    const verified = await verifyPlayTokenWorker(token, targetUrl, {}, env.SUNO_PLAY_SECRET);
    if (!verified.valid) {
      return jsonResponse(
        {
          error: 'Invalid or expired playback token',
          reason: verified.error,
          targetUrl,
        },
        403
      );
    }
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
          'X-Suno-Cache': 'MISS',
          ...CORS_HEADERS,
        },
      });
    }
    const text = await upstreamResp.text();
    const rewritten = rewriteHlsManifest(text, finalUrl, proxyEndpoint, referer || finalUrl, token);
    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Suno-Cache': 'MISS',
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
    'X-Suno-Cache': 'MISS',
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

const MAX_ADDONS = 12;
const MAX_DIRECT_ADDON_STREAMS = 12;
const MAX_DEBRID_CANDIDATES = 6;

function extractInfoHash(magnet, rawHash = '') {
  const cleanHash = String(rawHash || '').trim();
  if (/^[a-fA-F0-9]{40}$/.test(cleanHash) || /^[A-Za-z2-7]{32}$/.test(cleanHash)) {
    return cleanHash.toLowerCase();
  }
  const match = String(magnet || '').match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
  return match ? match[1].toLowerCase() : '';
}

function makeProxyHlsUrl(origin, targetUrl, referer = '') {
  if (!targetUrl) return '';
  if (targetUrl.startsWith('/api/proxy/hls?') || targetUrl.startsWith('./api/proxy/hls?')) {
    return `${origin}${targetUrl.replace(/^\./, '')}`;
  }
  return `${origin}/api/proxy/hls?url=${encodeURIComponent(targetUrl)}${
    referer ? `&referer=${encodeURIComponent(referer)}` : ''
  }`;
}

/**
 * Normalize a Stremio addon URL (converting stremio:// links to https://) and validate its scheme.
 * Preserves template braces ({tmdbId}, etc.) when present.
 *
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeAddonUrl(rawUrl) {
  let s = String(rawUrl || '').trim();
  if (!s) return '';
  if (/^stremio:\/\/https?:\/\//i.test(s)) {
    s = s.replace(/^stremio:\/\//i, '');
  } else if (/^stremio:\/\//i.test(s)) {
    s = s.replace(/^stremio:\/\//i, 'https://');
  }
  if (!/^https?:\/\//i.test(s)) return '';
  try {
    new URL(s.replace(/\{[^}]+\}/g, 'placeholder'));
    return s;
  } catch {
    return '';
  }
}

/**
 * Normalize a Stremio addon URL to its canonical manifest.json URL.
 *
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeAddonManifestUrl(rawUrl) {
  const normalized = normalizeAddonUrl(rawUrl);
  if (!normalized || normalized.includes('{')) return '';
  try {
    const u = new URL(normalized);
    if (!u.pathname.toLowerCase().endsWith('/manifest.json') && !u.pathname.toLowerCase().endsWith('.json')) {
      u.pathname = `${u.pathname.replace(/\/+$/, '')}/manifest.json`;
    }
    return u.href;
  } catch {
    return '';
  }
}

/**
 * Parse single, comma-separated, or JSON-array Stremio addon inputs (strings or { url, name, enabled } objects),
 * normalizing stremio:// links, filtering disabled entries, and deduplicating by addon base URL.
 *
 * @param {string|string[]} inputs
 * @returns {Array<{ url: string, name: string }>}
 */
export function parseAddonUrls(inputs) {
  const rawValues = Array.isArray(inputs) ? inputs : [inputs];
  const entries = [];
  const seen = new Set();

  const pushEntry = (rawUrl, name = '') => {
    const normalized = normalizeAddonUrl(rawUrl);
    if (!normalized) return;
    const dedupeKey = normalized.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '').toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    entries.push({ url: normalized, name: String(name || '').trim() });
  };

  for (const raw of rawValues) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string') {
              pushEntry(item);
            } else if (item && typeof item === 'object') {
              if (item.enabled === false) continue;
              pushEntry(item.url || item.manifestUrl || '', item.name || '');
            }
          }
          continue;
        }
      } catch {
        // Fall through to delimiter split
      }
    }

    const parts = trimmed.split(/[\r\n]+|,\s*(?=(?:https?|stremio):\/\/)/i);
    for (const part of parts) {
      pushEntry(part);
    }
  }

  return entries.slice(0, MAX_ADDONS);
}

function detectStreamQuality(text) {
  const s = String(text || '');
  if (/\b(?:cam|hdcam|ts|telesync|hdts)\b/i.test(s)) {
    return { quality: 'CAM', score: 1 };
  }
  if (/(?:2160p?|4k|uhd)/i.test(s)) {
    return { quality: '4K UHD', score: 40 };
  }
  if (/(?:1080p?|fhd)/i.test(s)) {
    return { quality: '1080p', score: 30 };
  }
  if (/(?:720p?|hd)/i.test(s)) {
    return { quality: /720p?/i.test(s) ? '720p' : 'HD', score: 20 };
  }
  if (/(?:480p?|sd)/i.test(s)) {
    return { quality: '480p', score: 10 };
  }
  return { quality: 'HD', score: 15 };
}

function extractSeederTiebreaker(text) {
  const match = String(text || '').match(/👤\s*(\d+)/);
  if (!match) return 0;
  return Math.min(Number(match[1]) || 0, 900) / 1000;
}

function extractProxyReferer(stream) {
  const reqHeaders = stream?.behaviorHints?.proxyHeaders?.request;
  if (!reqHeaders || typeof reqHeaders !== 'object') return '';
  for (const [k, v] of Object.entries(reqHeaders)) {
    if (k.toLowerCase() === 'referer' && typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return '';
}

function substituteTemplateParams(templateUrl, { tmdbId, imdbId, anilistId, malId, mediaType, season, episode }) {
  return templateUrl
    .replace(/\{tmdbId\}/g, encodeURIComponent(tmdbId || ''))
    .replace(/\{imdbId\}/g, encodeURIComponent(imdbId || ''))
    .replace(/\{anilistId\}/g, encodeURIComponent(anilistId || ''))
    .replace(/\{malId\}/g, encodeURIComponent(malId || ''))
    .replace(/\{mediaType\}/g, encodeURIComponent(mediaType || 'movie'))
    .replace(/\{season\}/g, encodeURIComponent(String(season || 1)))
    .replace(/\{episode\}/g, encodeURIComponent(String(episode || 1)));
}

function isDirectMediaUrl(rawUrl) {
  const lower = String(rawUrl || '').toLowerCase();
  return lower.includes('.m3u8') || /\.(mp4|m4s|webm|m4v|mov)(\?|#|$)/i.test(lower);
}

async function resolveRealDebridStream(apiKey, magnetUri, preferredFileIdx) {
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
  const cleanupTorrent = () =>
    fetch(`https://api.real-debrid.com/rest/1.0/torrents/delete/${encodeURIComponent(torrentId)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => {});

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
  if (!infoResp.ok) {
    await cleanupTorrent();
    return null;
  }
  const info = await infoResp.json();
  if (info?.status !== 'downloaded' || !Array.isArray(info.links) || !info.links[0]) {
    await cleanupTorrent();
    return null;
  }

  let chosenLink = info.links[0];
  if (info.links.length > 1 && Array.isArray(info.files)) {
    const selectedFiles = info.files.filter((f) => f.selected === 1);
    const preferred = Number.isInteger(preferredFileIdx) ? info.files[preferredFileIdx] : null;
    if (preferred && preferred.selected === 1) {
      const selIdx = selectedFiles.indexOf(preferred);
      if (selIdx >= 0 && info.links[selIdx]) {
        chosenLink = info.links[selIdx];
      }
    } else if (selectedFiles.length > 0) {
      let bestIdx = 0;
      let bestScore = -1;
      selectedFiles.forEach((f, idx) => {
        if (!info.links[idx]) return;
        const isVideo = /\.(mp4|mkv|webm|m4v|avi|mov)$/i.test(f.path || '');
        const score = (isVideo ? 1e15 : 0) + (f.bytes || 0);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });
      chosenLink = info.links[bestIdx] || info.links[0];
    }
  }

  const unrestrictResp = await fetchWithRetry(
    'https://api.real-debrid.com/rest/1.0/unrestrict/link',
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ link: chosenLink }).toString(),
    },
    { timeoutMs: 6000, maxRetries: 1 }
  );
  if (!unrestrictResp.ok) {
    await cleanupTorrent();
    return null;
  }
  const unrestrict = await unrestrictResp.json();
  if (unrestrict?.download && /^https?:\/\//i.test(unrestrict.download)) {
    return unrestrict.download;
  }
  await cleanupTorrent();
  return null;
}

async function resolveTorBoxStream(apiKey, magnetUri, infoHash, preferredFileIdx, { skipCacheCheck = false } = {}) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (!skipCacheCheck && infoHash) {
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
    files.reduce((best, f) => {
      const isVideo = /\.(mp4|mkv|webm|m4v|avi|mov)$/i.test(f.name || f.short_name || '');
      const fScore = (isVideo ? 1e15 : 0) + (f.size || 0);
      const bestIsVideo = best ? /\.(mp4|mkv|webm|m4v|avi|mov)$/i.test(best.name || best.short_name || '') : false;
      const bestScore = best ? (bestIsVideo ? 1e15 : 0) + (best.size || 0) : -1;
      return fScore > bestScore ? f : best;
    }, null);
  if (picked?.id === undefined || picked?.id === null || picked?.id === '') return null;

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

function buildMagnetUri(candidate) {
  if (candidate?.magnet && candidate.magnet.startsWith('magnet:')) return candidate.magnet;
  if (candidate?.infoHash) return `magnet:?xt=urn:btih:${candidate.infoHash}`;
  return '';
}

/**
 * Batch-check TorBox candidates via `checkcached?hash=h1,h2,...` or iterate top Real-Debrid candidates
 * until a cached playable stream resolves.
 *
 * @param {{ provider?: string, apiKey: string, candidates: Array<object> }} params
 * @returns {Promise<{ url: string, candidate: object } | null>}
 */
export async function resolveDebridCandidates({ provider = 'realdebrid', apiKey, candidates = [] }) {
  if (!apiKey || !Array.isArray(candidates) || !candidates.length) return null;
  const normProvider = String(provider || 'realdebrid').toLowerCase().replace(/[-_\s]/g, '');

  let orderedCandidates = candidates.filter((c) => c && (c.infoHash || c.magnet));
  if (!orderedCandidates.length) return null;

  if (normProvider === 'torbox') {
    const headers = { Authorization: `Bearer ${apiKey}` };
    const hashes = [...new Set(orderedCandidates.map((c) => c.infoHash).filter(Boolean))];
    if (hashes.length > 0) {
      const checkResp = await fetchWithRetry(
        `https://api.torbox.app/v1/api/torrents/checkcached?hash=${hashes.map((h) => encodeURIComponent(h)).join(',')}&format=list`,
        { headers },
        { timeoutMs: 5000, maxRetries: 1 }
      ).catch(() => null);

      if (checkResp?.ok) {
        const checkJson = await checkResp.json().catch(() => null);
        const data = checkJson?.data;
        if (Array.isArray(data)) {
          if (data.length === 0) return null;
          const cachedSet = new Set(
            data.map((row) => String(row?.hash || row?.info_hash || '').toLowerCase()).filter(Boolean)
          );
          if (cachedSet.size > 0) {
            orderedCandidates = orderedCandidates.filter(
              (c) => c.infoHash && cachedSet.has(c.infoHash.toLowerCase())
            );
            if (!orderedCandidates.length) return null;
          }
        } else if (data && typeof data === 'object') {
          const cachedSet = new Set(
            Object.entries(data)
              .filter(([, val]) => Boolean(val) && val?.cached !== false)
              .map(([k]) => k.toLowerCase())
          );
          orderedCandidates = orderedCandidates.filter(
            (c) => c.infoHash && cachedSet.has(c.infoHash.toLowerCase())
          );
          if (!orderedCandidates.length) return null;
        } else if (data === null || data === false) {
          return null;
        }
      }
    }

    for (const candidate of orderedCandidates) {
      const magnetUri = buildMagnetUri(candidate);
      if (!magnetUri) continue;
      try {
        const playable = await resolveTorBoxStream(apiKey, magnetUri, candidate.infoHash, candidate.fileIdx, {
          skipCacheCheck: true,
        });
        if (playable) return { url: playable, candidate };
      } catch {
        // Try next cached candidate
      }
    }
    return null;
  }

  for (const candidate of orderedCandidates) {
    const magnetUri = buildMagnetUri(candidate);
    if (!magnetUri) continue;
    try {
      const playable = await resolveRealDebridStream(apiKey, magnetUri, candidate.fileIdx);
      if (playable) return { url: playable, candidate };
    } catch {
      // Try next candidate
    }
  }
  return null;
}

function buildAddonStreamEndpoint({ addonUrl, tmdbId, imdbId, anilistId, malId, mediaType, season, episode }) {
  const normalized = normalizeAddonUrl(addonUrl);
  if (!normalized) return '';
  if (normalized.includes('{')) {
    return substituteTemplateParams(normalized, { tmdbId, imdbId, anilistId, malId, mediaType, season, episode });
  }
  const stremioType =
    mediaType === 'tv' || mediaType === 'series' ? 'series' : mediaType === 'anime' && !imdbId ? 'anime' : 'movie';
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

  if (!stremioId) return '';
  try {
    const u = new URL(normalized);
    const basePath = u.pathname.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '');
    return `${u.origin}${basePath}/stream/${stremioType}/${encodeURIComponent(stremioId)}.json${u.search}`;
  } catch {
    const addonBase = normalized.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '');
    return `${addonBase}/stream/${stremioType}/${encodeURIComponent(stremioId)}.json`;
  }
}

function collectStreamsAndCandidates(streams, { origin, addonName = '', maxDirect = 6, seenUrls, candidateMap }) {
  const directStreams = [];
  let added = 0;

  for (const stream of Array.isArray(streams) ? streams : []) {
    const rawLabel = [stream?.name, stream?.title, stream?.description]
      .filter(Boolean)
      .join(' — ')
      .split('\n')[0]
      .trim()
      .slice(0, 80);
    const qualityMeta = [
      stream?.name,
      stream?.title,
      stream?.description,
      stream?.behaviorHints?.filename,
    ]
      .filter(Boolean)
      .join(' ');
    const { quality, score: baseScore } = detectStreamQuality(qualityMeta);

    if (stream?.url && /^https?:\/\//i.test(stream.url)) {
      if (added >= maxDirect) continue;
      const lowerUrl = stream.url.toLowerCase();
      const isDirectVideo =
        /\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(lowerUrl) || (lowerUrl.includes('.mp4') && !lowerUrl.includes('.m3u8'));
      if (stream.behaviorHints?.notWebReady === true && !lowerUrl.includes('.m3u8') && !isDirectVideo) {
        continue;
      }
      if (seenUrls.has(stream.url)) continue;
      seenUrls.add(stream.url);

      const streamReferer = extractProxyReferer(stream);
      directStreams.push({
        name: rawLabel || (addonName ? `${addonName} Stream` : 'Addon HLS Stream'),
        type: isDirectVideo ? 'direct' : 'hls',
        url: makeProxyHlsUrl(origin, stream.url, streamReferer),
        rawUrl: stream.url,
        referer: streamReferer || undefined,
        quality,
        addonName: addonName || undefined,
        shielded: true,
        direct: true,
        node: 'addon-edge-proxy',
      });
      added += 1;
      continue;
    }

    const magnetInStream = /^magnet:\?xt=urn:btih:/i.test(stream?.url || '')
      ? stream.url
      : /^magnet:\?xt=urn:btih:/i.test(stream?.magnet || '')
      ? stream.magnet
      : '';
    const infoHash = extractInfoHash(magnetInStream, stream?.infoHash || '');
    if (infoHash && !candidateMap.has(infoHash)) {
      const filename = stream?.behaviorHints?.filename || '';
      const mp4Bonus = /\.mp4$/i.test(filename) ? 0.5 : 0;
      const seederBonus = extractSeederTiebreaker(`${stream?.title || ''} ${stream?.description || ''}`);
      candidateMap.set(infoHash, {
        infoHash,
        magnet: magnetInStream,
        fileIdx: Number.isInteger(stream?.fileIdx) ? stream.fileIdx : undefined,
        title: rawLabel || filename || 'Torrent Stream',
        quality,
        qualityScore: baseScore + mp4Bonus + seederBonus,
        addonName: addonName || undefined,
        order: candidateMap.size,
      });
    }
  }

  return directStreams;
}

function buildCustomResolverPair(origin, rawUrl, isHls, { name = '', quality = 'Original Quality', referer = '', includeDirect = true } = {}) {
  const out = [
    {
      id: 'custom-resolver',
      name: name || (isHls ? 'Custom Resolver HLS (Edge Proxy)' : 'Custom Resolver Stream'),
      type: isHls ? 'hls' : 'direct',
      url: makeProxyHlsUrl(origin, rawUrl, referer),
      rawUrl,
      ...(referer ? { referer } : {}),
      quality,
      shielded: true,
      direct: true,
      node: 'custom-resolver',
    },
  ];
  if (isHls && includeDirect && !referer) {
    out.push({
      id: 'custom-resolver-direct',
      name: 'Custom Resolver HLS (Direct)',
      type: 'hls',
      url: rawUrl,
      rawUrl,
      quality,
      shielded: true,
      direct: true,
      node: 'custom-resolver-direct',
    });
  }
  return out;
}

function extractCustomResolverJsonSources(data, origin, originBase, seenUrls, candidateMap) {
  if (Array.isArray(data?.streams)) {
    return collectStreamsAndCandidates(data.streams, {
      origin,
      addonName: 'Custom Resolver',
      maxDirect: 6,
      seenUrls,
      candidateMap,
    }).map((s, idx) => ({
      ...s,
      id: idx === 0 ? 'custom-resolver' : `custom-resolver-${idx + 1}`,
      node: 'custom-resolver',
    }));
  }

  const out = [];
  if (Array.isArray(data?.sources)) {
    for (const s of data.sources.slice(0, 6)) {
      if (!s?.url || !/^https?:\/\//i.test(s.url) || seenUrls.has(s.url)) continue;
      seenUrls.add(s.url);
      const isDirectVideo = /\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(s.url);
      const idx = out.length;
      out.push({
        id: idx === 0 ? 'custom-resolver' : `custom-resolver-${idx + 1}`,
        name: s.name || 'Custom Resolver Stream',
        type: s.type === 'direct' || isDirectVideo ? 'direct' : 'hls',
        url: makeProxyHlsUrl(origin, s.url, s.referer || ''),
        rawUrl: s.url,
        referer: s.referer || undefined,
        quality: s.quality || 'HD',
        shielded: true,
        direct: true,
        node: 'custom-resolver',
      });
    }
    return out;
  }

  if (Array.isArray(data?.MediaSources)) {
    for (const ms of data.MediaSources.slice(0, 4)) {
      const rawMediaUrl =
        ms?.TranscodingUrl || ms?.DirectStreamUrl || (ms?.Path && /^https?:\/\//i.test(ms.Path) ? ms.Path : '');
      if (!rawMediaUrl) continue;
      let absUrl = '';
      try {
        absUrl = new URL(rawMediaUrl, originBase).href;
      } catch {
        continue;
      }
      if (seenUrls.has(absUrl)) continue;
      seenUrls.add(absUrl);
      const idx = out.length;
      out.push({
        id: idx === 0 ? 'custom-resolver' : `custom-resolver-${idx + 1}`,
        name: ms.Name ? `Media Server — ${ms.Name}` : 'Media Server Stream',
        type: absUrl.toLowerCase().includes('.m3u8') ? 'hls' : 'direct',
        url: makeProxyHlsUrl(origin, absUrl),
        rawUrl: absUrl,
        quality: detectStreamQuality(ms.Name || '').quality,
        shielded: true,
        direct: true,
        node: 'custom-resolver',
      });
    }
    return out;
  }

  const singleUrl = data?.url || data?.hlsUrl || data?.streamUrl || data?.playbackUrl || data?.masterUrl || '';
  if (singleUrl && /^https?:\/\//i.test(singleUrl) && !seenUrls.has(singleUrl)) {
    seenUrls.add(singleUrl);
    const isHls = singleUrl.toLowerCase().includes('.m3u8') || !/\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(singleUrl);
    const ref = typeof data?.referer === 'string' ? data.referer : '';
    return buildCustomResolverPair(origin, singleUrl, isHls, {
      name: data?.name || 'Custom Resolver Stream',
      quality: data?.quality || 'Original Quality',
      referer: ref,
      includeDirect: false,
    });
  }
  return out;
}

async function resolveCustomEndpoint({
  origin,
  customResolverUrl,
  tmdbId,
  imdbId,
  anilistId,
  malId,
  mediaType,
  season,
  episode,
  seenUrls,
  candidateMap,
  signal,
}) {
  const normalized = normalizeAddonUrl(customResolverUrl);
  if (!normalized) return { sources: [], warning: '' };

  const expanded = substituteTemplateParams(normalized, {
    tmdbId,
    imdbId,
    anilistId,
    malId,
    mediaType,
    season,
    episode,
  });

  let parsedUrl;
  try {
    parsedUrl = new URL(expanded);
  } catch {
    return { sources: [], warning: 'Invalid custom resolver URL template' };
  }

  if (seenUrls.has(expanded)) return { sources: [], warning: '' };

  if (isDirectMediaUrl(expanded)) {
    seenUrls.add(expanded);
    const isHls = expanded.toLowerCase().includes('.m3u8');
    return {
      sources: buildCustomResolverPair(origin, expanded, isHls, {
        name: isHls ? 'Custom Resolver HLS (Edge Proxy)' : 'Custom Resolver Video',
      }),
      warning: '',
    };
  }

  try {
    const resp = await fetchWithRetry(
      expanded,
      {
        headers: {
          Accept: 'application/json, application/vnd.apple.mpegurl, */*',
          'User-Agent': 'SunoCinema/1.0',
        },
        redirect: 'follow',
        signal,
      },
      { timeoutMs: 6000, maxRetries: 1, backoffMs: [200] }
    );
    if (!resp.ok) {
      await resp.body?.cancel?.().catch(() => {});
      return { sources: [], warning: `Custom resolver HTTP ${resp.status}` };
    }

    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('mpegurl') || ct.startsWith('video/') || ct.startsWith('audio/') || ct === 'application/octet-stream') {
      await resp.body?.cancel?.().catch(() => {});
      seenUrls.add(expanded);
      const isHls = ct.includes('mpegurl') || expanded.toLowerCase().includes('.m3u8');
      return { sources: buildCustomResolverPair(origin, expanded, isHls), warning: '' };
    }

    const text = await resp.text();
    if (text.trimStart().startsWith('#EXTM3U')) {
      seenUrls.add(expanded);
      return { sources: buildCustomResolverPair(origin, expanded, true), warning: '' };
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { sources: [], warning: 'Custom resolver returned non-JSON response' };
    }

    return {
      sources: extractCustomResolverJsonSources(data, origin, parsedUrl.origin, seenUrls, candidateMap),
      warning: '',
    };
  } catch (err) {
    return { sources: [], warning: `Custom resolver failed: ${err.message}` };
  }
}

async function handleAddonManifest(request, reqUrl) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const rawUrl = reqUrl.searchParams.get('url') || reqUrl.searchParams.get('addonUrl') || '';
  const manifestUrl = normalizeAddonManifestUrl(rawUrl);
  if (!manifestUrl) {
    return jsonResponse(
      { ok: false, error: 'Valid http/https/stremio addon "url" query parameter required' },
      400
    );
  }

  let resp;
  try {
    resp = await fetchWithRetry(
      manifestUrl,
      {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SunoCinema/1.0',
        },
        redirect: 'follow',
        signal: request.signal,
      },
      { timeoutMs: 7000, maxRetries: 1, backoffMs: [200] }
    );

    if (request.method === 'HEAD' && resp.status === 405) {
      await resp.body?.cancel?.().catch(() => {});
      resp = await fetchWithRetry(
        manifestUrl,
        {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': 'SunoCinema/1.0' },
          redirect: 'follow',
          signal: request.signal,
        },
        { timeoutMs: 7000, maxRetries: 1, backoffMs: [200] }
      );
    }
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: isTimeoutError(err) ? 'Addon manifest request timed out' : `Addon manifest fetch failed: ${err.message}`,
        manifestUrl,
      },
      isTimeoutError(err) ? 504 : 502
    );
  }

  if (!resp.ok) {
    await resp.body?.cancel?.().catch(() => {});
    return jsonResponse(
      {
        ok: false,
        error: `Upstream HTTP ${resp.status} ${resp.statusText}`.trim(),
        manifestUrl,
      },
      resp.status
    );
  }

  if (request.method === 'HEAD') {
    await resp.body?.cancel?.().catch(() => {});
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      },
    });
  }

  const rawText = await resp.text();
  let manifest;
  try {
    manifest = JSON.parse(rawText);
  } catch {
    return jsonResponse({ ok: false, error: 'Addon manifest did not return valid JSON', manifestUrl }, 502);
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || (!manifest.id && !manifest.name)) {
    return jsonResponse(
      { ok: false, error: 'Invalid Stremio addon manifest (missing id or name)', manifestUrl },
      422
    );
  }

  const baseUrl = manifestUrl.replace(/\/manifest\.json\/?$/i, '').replace(/\/+$/, '');
  return jsonResponse({
    ok: true,
    manifestUrl,
    baseUrl,
    manifest,
    id: manifest.id || '',
    name: manifest.name || 'Stremio Addon',
    version: manifest.version || '1.0.0',
    description: manifest.description || '',
    logo: manifest.logo || '',
    types: Array.isArray(manifest.types) ? manifest.types : [],
    resources: Array.isArray(manifest.resources) ? manifest.resources : [],
    idPrefixes: Array.isArray(manifest.idPrefixes) ? manifest.idPrefixes : [],
  });
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

  const requestAddonInputs = [
    ...reqUrl.searchParams.getAll('addonUrls'),
    ...reqUrl.searchParams.getAll('addonUrl'),
    request.headers.get('x-addon-urls') || '',
    request.headers.get('x-addon-url') || '',
  ].filter((v) => typeof v === 'string' && v.trim() !== '');
  const addonEntries =
    requestAddonInputs.length > 0
      ? parseAddonUrls(requestAddonInputs)
      : parseAddonUrls([env.STREMIO_ADDON_URLS || '', env.STREMIO_ADDON_URL || '']);

  const customResolverUrl = (
    reqUrl.searchParams.get('customResolverUrl') ||
    request.headers.get('x-custom-resolver') ||
    env.CUSTOM_RESOLVER_URL ||
    ''
  ).trim();

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
  const seenUrls = new Set();
  const candidateMap = new Map();

  if (directUrl && /^https?:\/\//i.test(directUrl)) {
    const isHls = directUrl.toLowerCase().includes('.m3u8');
    seenUrls.add(directUrl);
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

  const addonTasks = addonEntries.map(async (entry) => {
    const endpoint = buildAddonStreamEndpoint({
      addonUrl: entry.url,
      tmdbId,
      imdbId,
      anilistId,
      malId,
      mediaType,
      season,
      episode,
    });
    if (!endpoint) return { directStreams: [] };

    let addonHost = entry.name;
    if (!addonHost) {
      try {
        addonHost = new URL(endpoint).hostname;
      } catch {
        addonHost = 'Addon';
      }
    }

    const addonResp = await fetchWithRetry(
      endpoint,
      { headers: { Accept: 'application/json' }, signal: request.signal },
      { timeoutMs: 6000, maxRetries: 1, backoffMs: [200] }
    );
    if (!addonResp.ok) {
      await addonResp.body?.cancel?.().catch(() => {});
      throw new Error(`HTTP ${addonResp.status}`);
    }
    const addonData = await addonResp.json();
    const streams = Array.isArray(addonData?.streams) ? addonData.streams : [];
    return {
      addonHost,
      directStreams: collectStreamsAndCandidates(streams, {
        origin,
        addonName: addonHost,
        maxDirect: 6,
        seenUrls,
        candidateMap,
      }),
    };
  });

  const customTask = customResolverUrl
    ? resolveCustomEndpoint({
        origin,
        customResolverUrl,
        tmdbId,
        imdbId,
        anilistId,
        malId,
        mediaType,
        season,
        episode,
        seenUrls,
        candidateMap,
        signal: request.signal,
      })
    : Promise.resolve({ sources: [], warning: '' });

  const [customOutcome, addonOutcomes] = await Promise.all([
    customTask,
    Promise.allSettled(addonTasks),
  ]);

  if (customOutcome.warning) {
    warnings.push(customOutcome.warning);
  }
  for (const s of customOutcome.sources) {
    sources.push(s);
  }

  let addonDirectCount = 0;
  addonOutcomes.forEach((outcome, idx) => {
    if (outcome.status === 'rejected') {
      const label = addonEntries[idx]?.name || addonEntries[idx]?.url || `Addon ${idx + 1}`;
      warnings.push(`Addon lookup failed (${label}): ${outcome.reason?.message || 'Error'}`);
      return;
    }
    for (const s of outcome.value?.directStreams || []) {
      if (addonDirectCount >= MAX_DIRECT_ADDON_STREAMS) break;
      sources.push({
        ...s,
        id: addonDirectCount === 0 ? 'addon-hls' : `addon-hls-${addonDirectCount + 1}`,
      });
      addonDirectCount += 1;
    }
  });

  const explicitHash = extractInfoHash(magnet, hash);
  const debridCandidates = [];
  if (explicitHash || (magnet && magnet.startsWith('magnet:'))) {
    const matchedAddonCandidate = explicitHash ? candidateMap.get(explicitHash) : null;
    debridCandidates.push({
      infoHash: explicitHash,
      magnet,
      fileIdx: matchedAddonCandidate?.fileIdx,
      title: matchedAddonCandidate?.title || 'Magnet / InfoHash',
      quality: matchedAddonCandidate?.quality || 'Original',
      qualityScore: 100,
      isExplicit: true,
    });
  }

  const rankedAddonCandidates = Array.from(candidateMap.values())
    .filter((c) => !explicitHash || c.infoHash !== explicitHash)
    .sort((a, b) => b.qualityScore - a.qualityScore || a.order - b.order);

  for (const c of rankedAddonCandidates) {
    if (debridCandidates.length >= MAX_DEBRID_CANDIDATES) break;
    debridCandidates.push(c);
  }

  if (debridKey && debridCandidates.length > 0) {
    const debridResult = await resolveDebridCandidates({
      provider: debridProvider,
      apiKey: debridKey,
      candidates: debridCandidates,
    });
    if (debridResult?.url) {
      const playable = debridResult.url;
      const winning = debridResult.candidate;
      const isHls = playable.toLowerCase().includes('.m3u8');
      const resolvedQuality =
        winning?.quality && winning.quality !== 'Original' ? winning.quality : '1080p Remux';
      sources.push({
        id: 'debrid-instant-cache',
        name:
          winning?.title && !winning?.isExplicit
            ? `Instant Cached (${debridProvider.toUpperCase()}) — ${winning.title.slice(0, 48)}`
            : `Instant Cached Stream (${debridProvider.toUpperCase()})`,
        type: isHls ? 'hls' : 'direct',
        url: makeProxyHlsUrl(origin, playable),
        rawUrl: playable,
        provider: debridProvider,
        quality: resolvedQuality,
        infoHash: winning?.infoHash || undefined,
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
    addonCount: addonEntries.length,
    sources,
    ...(warnings.length ? { warnings } : {}),
  });
}

export default {
  async fetch(request, env = {}, ctx = null) {
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
        addonManifestResolverEnabled: true,
        multiAddonEnabled: true,
        debridConfigured: Boolean(env.DEBRID_API_KEY || env.REALDEBRID_API_KEY || env.TORBOX_API_KEY),
        addonConfigured: Boolean(env.STREMIO_ADDON_URLS || env.STREMIO_ADDON_URL),
        customResolverConfigured: Boolean(env.CUSTOM_RESOLVER_URL),
      });
    }

    if (pathname === '/api/bootstrap') {
      const activeOrigin = reqUrl.origin;
      const rawMirrors = env.SUNO_BOOTSTRAP_MIRRORS || '';
      const mirrors = rawMirrors
        ? rawMirrors.split(',').map((m) => m.trim()).filter(Boolean)
        : [activeOrigin];
      if (!mirrors.includes(activeOrigin)) {
        mirrors.unshift(activeOrigin);
      }
      const descriptor = base64UrlEncode(
        JSON.stringify({
          activeOrigin,
          mirrors,
          timestamp: Date.now(),
          version: '1.0.0',
        })
      );
      return jsonResponse({
        version: '1.0.0',
        activeOrigin,
        mirrors,
        descriptor,
        timestamp: Date.now(),
      });
    }

    if (pathname === '/api/play') {
      const targetUrl = reqUrl.searchParams.get('url') || '';
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return jsonResponse({ error: 'Valid http/https "url" query parameter required' }, 400);
      }
      const expSec = Number(reqUrl.searchParams.get('exp')) || 7200;
      const mediaId = reqUrl.searchParams.get('id') || '';
      const referer = reqUrl.searchParams.get('referer') || '';
      const token = await signPlayTokenWorker(
        targetUrl,
        { expiresInSeconds: expSec, id: mediaId },
        env.SUNO_PLAY_SECRET
      );
      const nowSec = Math.floor(Date.now() / 1000);
      return jsonResponse({
        token,
        streamUrl: targetUrl,
        expiresAt: nowSec + expSec,
        proxyUrl: `/api/proxy/hls?url=${encodeURIComponent(targetUrl)}${
          referer ? `&referer=${encodeURIComponent(referer)}` : ''
        }&token=${encodeURIComponent(token)}`,
      });
    }

    if (pathname === '/api/backend/status') {
      const debridConfigured = Boolean(
        env.DEBRID_API_KEY || env.REALDEBRID_API_KEY || env.TORBOX_API_KEY
      );
      const debridProvider = env.TORBOX_API_KEY
        ? 'torbox'
        : env.REALDEBRID_API_KEY || env.DEBRID_API_KEY
        ? 'realdebrid'
        : 'none';
      const tokenVerification = Boolean(
        env.REQUIRE_PLAY_TOKEN === 'true' || env.REQUIRE_PLAY_TOKEN === '1'
      );
      return jsonResponse({
        status: 'ready',
        version: '1.0.0',
        runtime: 'cloudflare-worker',
        timestamp: Date.now(),
        tmdb: { configured: Boolean(env.TMDB_API_KEY) },
        debrid: { configured: debridConfigured, provider: debridProvider },
        stremio: { configured: true, maxAddons: 12 },
        jellyfin: {
          configured: Boolean(env.JELLYFIN_URL),
          url: env.JELLYFIN_URL ? env.JELLYFIN_URL.replace(/\/+$/, '') : '',
        },
        vodOrigin: {
          configured: Boolean(env.SUNO_VOD_ORIGIN),
          origin: env.SUNO_VOD_ORIGIN || '',
        },
        tokenVerification: { enabled: tokenVerification },
      });
    }

    if (pathname === '/api/proxy/subtitles') {
      return handleSubtitleProxy(request, reqUrl);
    }

    if (pathname === '/api/resolve/addon-manifest') {
      return handleAddonManifest(request, reqUrl);
    }

    if (pathname === '/api/resolve/stream') {
      return handleResolveStream(request, reqUrl, env);
    }

    if (pathname === '/api/proxy/hls') {
      return handleHlsProxy(request, reqUrl, env, ctx);
    }

    if (pathname === '/') {
      if (reqUrl.searchParams.has('url')) {
        return handleHlsProxy(request, reqUrl, env, ctx);
      }
      return jsonResponse({
        ok: true,
        service: 'Suno Cinema Edge HLS Proxy',
        routes: [
          '/api/proxy/hls?url=&referer=&token=',
          '/api/proxy/subtitles?url=&referer=',
          '/api/resolve/addon-manifest?url=',
          '/api/resolve/stream',
          '/api/bootstrap',
          '/api/play?url=',
          '/api/backend/status',
          '/api/health',
        ],
      });
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },
};
