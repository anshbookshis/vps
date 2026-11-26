import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLAYER_PREFS_KEY,
  normalizeStremioAddon,
  loadPlayerPrefs,
  savePlayerPrefs,
  loadStremioAddons,
  saveStremioAddons,
} from '../src/utils/storage.js';
import {
  resolveFullMetadata,
  fetchAddonManifest,
  fetchArchiveOrgDirectStream,
} from '../src/utils/client-api.js';
import {
  cleanAddonUrl,
  normalizeAddonManifestUrl,
  collectStremioAddonUrls,
  fetchStreamSources,
} from '../src/utils/vidrift.js';
import { renderStreamSourcesModal, renderSettingsSheet } from '../src/components/modals.js';
import { renderDetailView, renderDesktopDetailModal } from '../src/components/showcase.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
    return await fn(mockStorage, store);
  } finally {
    if (prevDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', prevDescriptor);
    } else {
      delete globalThis.localStorage;
    }
  }
}

test('stremioAddons storage persistence, legacy migration, deduplication, and pref defaults', async () => {
  const n1 = normalizeStremioAddon('stremio://torrentio.example/sort=quality/manifest.json');
  assert.deepEqual(n1, {
    url: 'https://torrentio.example/sort=quality',
    name: 'torrentio.example',
    version: '',
    description: '',
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    enabled: true,
  });
  assert.equal(normalizeStremioAddon('javascript:alert(1)'), null);
  assert.equal(normalizeStremioAddon({ transportUrl: 'https://comet.example/manifest.json', enabled: false })?.enabled, false);

  // 1) Legacy stremioAddonUrl auto-migrates into stremioAddons and persists back to localStorage
  await withMockLocalStorage(
    {
      [PLAYER_PREFS_KEY]: JSON.stringify({
        stremioAddonUrl: 'stremio://legacy-addon.example/manifest.json',
      }),
    },
    async (ls) => {
      const prefs = loadPlayerPrefs();
      assert.equal(prefs.playerProvider, 'vidlink');
      assert.equal(prefs.customResolverUrl, '');
      assert.equal(prefs.stremioAddonUrl, 'https://legacy-addon.example');
      assert.equal(prefs.stremioAddons.length, 1);
      assert.equal(prefs.stremioAddons[0].url, 'https://legacy-addon.example');
      assert.equal(prefs.stremioAddons[0].enabled, true);

      const persistedAfterMigration = JSON.parse(ls.getItem(PLAYER_PREFS_KEY));
      assert.equal(persistedAfterMigration.stremioAddons.length, 1);

      // 2) saveStremioAddons deduplicates, preserves metadata & enabled flags, and syncs stremioAddonUrl
      const savedList = saveStremioAddons([
        { url: 'https://disabled.example/manifest.json', name: 'Paused Addon', enabled: false },
        { url: 'stremio://active-one.example/manifest.json', name: 'Active One', version: '1.5.0', types: ['movie'], idPrefixes: ['tt'], enabled: true },
        { url: 'https://active-one.example/', name: 'Duplicate Active One', enabled: true },
      ]);
      assert.equal(savedList.length, 2);
      assert.equal(savedList[0].enabled, false);
      assert.equal(savedList[1].version, '1.5.0');

      const reloadedAddons = loadStremioAddons();
      assert.equal(reloadedAddons.length, 2);
      assert.equal(loadPlayerPrefs().stremioAddonUrl, 'https://active-one.example');

      // 3) Saving customResolverUrl & updating legacy stremioAddonUrl keeps stremioAddons synced
      const updated = savePlayerPrefs({
        stremioAddonUrl: 'stremio://new-primary.example/manifest.json',
        customResolverUrl: 'https://nas.example/resolve/{imdbId}',
      });
      assert.equal(updated.customResolverUrl, 'https://nas.example/resolve/{imdbId}');
      assert.equal(updated.stremioAddons[0].url, 'https://new-primary.example');
      assert.equal(updated.stremioAddons.length, 3);
    }
  );
});

test('resolveFullMetadata resolves missing imdbId even when tmdbId is already set (movies, Quick Launch, and TV)', async () => {
  const origFetch = globalThis.fetch;
  const calledUrls = [];

  globalThis.fetch = async (url) => {
    const href = String(url);
    calledUrls.push(href);

    // Wikidata SPARQL lookup (movie P4947 / TV P4983)
    if (href.startsWith('https://query.wikidata.org/sparql')) {
      if (href.includes('881001')) {
        return new Response(
          JSON.stringify({ results: { bindings: [{ imdb: { value: 'tt1375666' } }] } }),
          { status: 200, headers: { 'Content-Type': 'application/sparql-results+json' } }
        );
      }
      if (href.includes('881002')) {
        // Return empty from Wikidata to exercise Cinemeta search fallback
        return new Response(JSON.stringify({ results: { bindings: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/sparql-results+json' },
        });
      }
      if (href.includes('881003')) {
        return new Response(
          JSON.stringify({ results: { bindings: [{ imdb: { value: 'tt0816692' } }] } }),
          { status: 200, headers: { 'Content-Type': 'application/sparql-results+json' } }
        );
      }
      if (href.includes('881004') && href.includes('P4983')) {
        return new Response(
          JSON.stringify({ results: { bindings: [{ imdb: { value: 'tt11280740' } }] } }),
          { status: 200, headers: { 'Content-Type': 'application/sparql-results+json' } }
        );
      }
    }

    // Cinemeta search fallback
    if (href.includes('/catalog/movie/top/search=Solaris%20Test.json')) {
      return new Response(
        JSON.stringify({
          metas: [{ id: 'tt0069293', imdb_id: 'tt0069293', moviedb_id: 881002, name: 'Solaris Test', year: '1972' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (href.includes('/catalog/movie/top/search=')) {
      return new Response(JSON.stringify({ metas: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Cinemeta meta hydration
    if (href.endsWith('/meta/movie/tt1375666.json')) {
      return new Response(
        JSON.stringify({
          meta: {
            id: 'tt1375666',
            imdb_id: 'tt1375666',
            moviedb_id: 881001,
            type: 'movie',
            name: 'Inception',
            year: '2010',
            background: 'https://images.metahub.space/background/medium/tt1375666/img',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (href.endsWith('/meta/movie/tt0816692.json')) {
      return new Response(
        JSON.stringify({
          meta: {
            id: 'tt0816692',
            imdb_id: 'tt0816692',
            moviedb_id: 881003,
            type: 'movie',
            name: 'Interstellar',
            year: '2014',
            background: 'https://images.metahub.space/background/medium/tt0816692/img',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (href.endsWith('/meta/series/tt11280740.json')) {
      return new Response(
        JSON.stringify({
          meta: {
            id: 'tt11280740',
            imdb_id: 'tt11280740',
            moviedb_id: 881004,
            type: 'series',
            name: 'Severance',
            videos: [
              { season: 1, episode: 1, name: 'Good News About Hell' },
              { season: 1, episode: 2, name: 'Half Loop' },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    // 1) TMDB-only movie resolves imdbId via Wikidata + retains tmdbId
    const resMovie = await resolveFullMetadata({
      id: 'movie:881001',
      tmdbId: '881001',
      mediaType: 'movie',
      title: 'Inception',
    });
    assert.equal(resMovie.imdbId, 'tt1375666');
    assert.equal(resMovie.tmdbId, '881001');
    assert.ok(resMovie.backdrop.includes('tt1375666'));

    // 2) TMDB-only movie falls back to Cinemeta search when Wikidata returns nothing
    const resFallback = await resolveFullMetadata({
      id: 'movie:881002',
      tmdbId: '881002',
      mediaType: 'movie',
      title: 'Solaris Test',
      year: 1972,
      backdrop: 'https://existing.example/bg.jpg',
    });
    assert.equal(resFallback.imdbId, 'tt0069293');
    assert.equal(resFallback.tmdbId, '881002');

    // 3) Quick Launch placeholder "MOVIE #881003" resolves imdbId and replaces placeholder title
    const resQuickLaunch = await resolveFullMetadata({
      id: 'movie:881003',
      tmdbId: '881003',
      mediaType: 'movie',
      title: 'MOVIE #881003',
    });
    assert.equal(resQuickLaunch.imdbId, 'tt0816692');
    assert.equal(resQuickLaunch.title, 'Interstellar');

    // 4) TMDB-only TV series uses P4983 and hydrates seasonsList
    const resTv = await resolveFullMetadata({
      id: 'tv:881004',
      tmdbId: '881004',
      mediaType: 'tv',
      title: 'TV #881004',
    });
    assert.equal(resTv.imdbId, 'tt11280740');
    assert.equal(resTv.title, 'Severance');
    assert.equal(resTv.seasonsList?.[0]?.episodes?.length, 2);
    assert.ok(calledUrls.some((u) => u.includes('P4983')));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('fetchAddonManifest normalizes stremio://, fetches directly, and falls back to /api/resolve/addon-manifest', async () => {
  await assert.rejects(() => fetchAddonManifest('ftp://invalid'), /valid Stremio addon URL/i);

  const origFetch = globalThis.fetch;
  const manifestObj = {
    id: 'org.stremio.hls',
    name: 'HLS Direct Addon',
    version: '3.0.2',
    description: 'Clean HLS streams',
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    resources: ['stream'],
  };

  // 1) Direct CORS manifest fetch succeeds
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://direct-addon.example/cfg/manifest.json');
    return new Response(JSON.stringify(manifestObj), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const direct = await fetchAddonManifest('stremio://direct-addon.example/cfg');
    assert.equal(direct.url, 'https://direct-addon.example/cfg');
    assert.equal(direct.manifestUrl, 'https://direct-addon.example/cfg/manifest.json');
    assert.equal(direct.name, 'HLS Direct Addon');
    assert.equal(direct.version, '3.0.2');
    assert.equal(direct.enabled, true);
  } finally {
    globalThis.fetch = origFetch;
  }

  // 2) Direct CORS fetch throws -> falls back to Edge Proxy /api/resolve/addon-manifest
  const calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.startsWith('https://cors-blocked-addon.example/')) {
      throw new TypeError('CORS blocked');
    }
    return new Response(
      JSON.stringify({
        ok: true,
        manifest: manifestObj,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };
  try {
    const proxied = await fetchAddonManifest('stremio://cors-blocked-addon.example/manifest.json', {
      hlsProxyUrl: 'https://edge.workers.dev/',
    });
    assert.equal(calls[0], 'https://cors-blocked-addon.example/manifest.json');
    assert.equal(
      calls[1],
      'https://edge.workers.dev/api/resolve/addon-manifest?url=https%3A%2F%2Fcors-blocked-addon.example%2Fmanifest.json'
    );
    assert.equal(proxied.name, 'HLS Direct Addon');
    assert.equal(proxied.url, 'https://cors-blocked-addon.example');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('fetchArchiveOrgDirectStream resolves verified public-domain films and rejects trailers or unverified uploads', async () => {
  assert.equal(await fetchArchiveOrgDirectStream('MOVIE #1234'), null);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('advancedsearch.php')) {
      if (href.includes('Night%20of%20the%20Living%20Dead')) {
        return new Response(
          JSON.stringify({
            response: {
              docs: [
                {
                  identifier: 'night_trailer',
                  title: 'Night of the Living Dead (Trailer)',
                  year: '1968',
                  collection: ['movie_trailers'],
                },
                {
                  identifier: 'night_of_the_living_dead_1968',
                  title: 'Night of the Living Dead (1968 Full Movie)',
                  year: '1968',
                  licenseurl: 'http://creativecommons.org/publicdomain/mark/1.0/',
                  collection: ['feature_films'],
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (href.includes('Commercial%20Blockbuster')) {
        return new Response(
          JSON.stringify({
            response: {
              docs: [
                {
                  identifier: 'random_community_upload',
                  title: 'Commercial Blockbuster',
                  year: '2024',
                  collection: ['opensource_movies'],
                  // Missing licenseurl -> must reject unverified community upload
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    if (href === 'https://archive.org/metadata/night_of_the_living_dead_1968') {
      return new Response(
        JSON.stringify({
          d1: 'ia800100.us.archive.org',
          dir: '/12/items/night_of_the_living_dead_1968',
          metadata: {
            title: 'Night of the Living Dead',
            year: '1968',
            licenseurl: 'http://creativecommons.org/publicdomain/mark/1.0/',
          },
          files: [
            { name: 'night_trailer.mp4', size: 1000, height: 1080 },
            { name: 'night_512kb.mp4', format: '512Kb MPEG4', size: 300000000, height: 360 },
            { name: 'Night of the Living Dead (1968).mp4', format: 'MPEG4', size: 950000000, height: 1080 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Unexpected Archive.org fetch: ${href}`);
  };

  try {
    const pd = await fetchArchiveOrgDirectStream('Night of the Living Dead', 1968);
    assert.ok(pd);
    assert.equal(pd.identifier, 'night_of_the_living_dead_1968');
    assert.equal(pd.type, 'direct');
    assert.equal(pd.format, 'mp4');
    assert.equal(pd.quality, '1080p');
    assert.equal(pd.source, 'archive.org');
    assert.equal(
      pd.url,
      'https://ia800100.us.archive.org/12/items/night_of_the_living_dead_1968/Night%20of%20the%20Living%20Dead%20(1968).mp4'
    );

    const commercial = await fetchArchiveOrgDirectStream('Commercial Blockbuster', 2024);
    assert.equal(commercial, null);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('vidrift multi-addon helpers & fetchStreamSources query enabled addons, customResolverUrl, and Archive.org fallback', async () => {
  assert.equal(cleanAddonUrl('stremio://addon.example/manifest.json/'), 'https://addon.example');
  assert.equal(
    normalizeAddonManifestUrl('stremio://addon.example/cfg'),
    'https://addon.example/cfg/manifest.json'
  );

  const collected = collectStremioAddonUrls({
    stremioAddons: [
      { url: 'stremio://one.example/manifest.json', enabled: true },
      { url: 'https://disabled.example/manifest.json', enabled: false },
      { url: 'https://one.example/', enabled: true },
    ],
    stremioAddonUrl: 'https://disabled.example',
    addonUrls: ['stremio://two.example/manifest.json'],
  });
  assert.deepEqual(collected, ['https://one.example', 'https://two.example']);

  // Static fallback: multi-addon parallel query + customResolverUrl + Archive.org fallback when no streams return
  const origFetch = globalThis.fetch;
  let capturedBackendResolveQuery = '';
  let capturedBackendHeaders = null;

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes('/api/resolve/stream')) {
      capturedBackendResolveQuery = href;
      capturedBackendHeaders = init.headers || {};
      throw new Error('Static GitHub Pages mode');
    }
    if (href === 'https://addon-one.example/stream/movie/tt0063350.json') {
      return new Response(JSON.stringify({ streams: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (href === 'https://addon-two.example/stream/movie/tt0063350.json') {
      return new Response(
        JSON.stringify({
          streams: [
            {
              name: 'AddonTwo 4K',
              url: 'https://cdn.two.example/film/master.m3u8',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (href === 'https://resolver.example/movie/tt0063350/10331.json') {
      return new Response(
        JSON.stringify({ url: 'https://nas.example/stream.m3u8', quality: '1080p' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (href.includes('archive.org/advancedsearch.php')) {
      return new Response(
        JSON.stringify({
          response: {
            docs: [
              {
                identifier: 'notld_archive',
                title: 'Night of the Living Dead',
                year: '1968',
                licenseurl: 'https://creativecommons.org/publicdomain/mark/1.0/',
                collection: ['feature_films'],
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (href === 'https://archive.org/metadata/notld_archive') {
      return new Response(
        JSON.stringify({
          d1: 'ia800200.us.archive.org',
          dir: '/5/items/notld_archive',
          metadata: { licenseurl: 'https://creativecommons.org/publicdomain/mark/1.0/' },
          files: [{ name: 'film.mp4', size: 500000000, height: 720 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const movie = {
      id: 'movie:10331',
      tmdbId: '10331',
      imdbId: 'tt0063350',
      mediaType: 'movie',
      title: 'Night of the Living Dead',
      year: 1968,
    };

    const withAddons = await fetchStreamSources(movie, {
      hlsProxyUrl: 'https://edge.workers.dev',
      stremioAddons: [
        { url: 'stremio://addon-one.example/manifest.json', name: 'Addon One', enabled: true },
        { url: 'https://addon-two.example', name: 'Addon Two', enabled: true },
        { url: 'https://addon-off.example', name: 'Disabled', enabled: false },
      ],
      customResolverUrl: 'https://resolver.example/{mediaType}/{imdbId}/{tmdbId}.json',
    });

    assert.ok(capturedBackendResolveQuery.includes('addonUrls='));
    assert.ok(capturedBackendHeaders['X-Addon-Urls'].includes('https://addon-one.example'));
    assert.ok(capturedBackendHeaders['X-Addon-Urls'].includes('https://addon-two.example'));
    assert.equal(capturedBackendHeaders['X-Addon-Urls'].includes('addon-off.example'), false);
    assert.equal(
      capturedBackendHeaders['X-Custom-Resolver'],
      'https://resolver.example/{mediaType}/{imdbId}/{tmdbId}.json'
    );

    const addonRes = withAddons.find((s) => s.id === 'addon-hls');
    assert.ok(addonRes && addonRes.addonName === 'Addon Two' && addonRes.quality === '4K UHD');
    assert.ok(withAddons.some((s) => s.id === 'custom-resolver' && s.rawUrl === 'https://nas.example/stream.m3u8'));

    // When no addon or custom resolver yields a direct stream, falls back to Archive.org (without Edge Proxy)
    const archiveFallback = await fetchStreamSources(movie, { stremioAddons: [] });
    const aoNode = archiveFallback.find((s) => s.id === 'archive-org-direct');
    assert.ok(aoNode, 'Must emit archive-org-direct when no direct/addon stream exists');
    assert.equal(aoNode.node, 'archive-org');
    assert.equal(aoNode.quality, '720p');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('renderStreamSourcesModal, detail triggers, and static UI preserve Suno Cinema branding across all tabs', () => {
  const sampleAddons = [
    {
      url: 'https://torrentio.example',
      name: 'Torrentio HLS',
      version: '0.0.15',
      description: 'Streams from providers',
      types: ['movie', 'series'],
      idPrefixes: ['tt'],
      enabled: true,
    },
    {
      url: 'https://paused.example',
      name: 'Paused Addon',
      version: '1.0.0',
      types: ['movie'],
      idPrefixes: ['tt'],
      enabled: false,
    },
  ];
  const basePrefs = {
    hlsProxyUrl: 'https://edge.workers.dev',
    customResolverUrl: 'https://nas.example/resolve?imdb={imdbId}',
    debridProvider: 'torbox',
    debridApiKey: 'secret-token',
    stremioAddons: sampleAddons,
  };

  // Tab 1: Stremio Addons
  const addonsHtml = renderStreamSourcesModal({
    activeTab: 'addons',
    prefs: basePrefs,
    addons: sampleAddons,
    addonInput: 'stremio://new.example/manifest.json',
    addonError: 'Sample validation error',
    playerOpen: true,
    sourcesDirtyInPlayer: true,
  });
  assert.ok(addonsHtml.includes('Stream Sources &amp; Addons'));
  assert.ok(addonsHtml.includes('1 Addon Active'));
  assert.ok(addonsHtml.includes('TorBox Connected'));
  assert.ok(addonsHtml.includes('Edge Proxy Ready'));
  assert.ok(addonsHtml.includes('id="sources-add-addon-form"'));
  assert.ok(addonsHtml.includes('id="sources-addon-url-input"'));
  assert.ok(addonsHtml.includes('Torrentio HLS'));
  assert.ok(addonsHtml.includes('v0.0.15'));
  assert.ok(addonsHtml.includes('data-toggle-addon="https://torrentio.example"'));
  assert.ok(addonsHtml.includes('data-remove-addon="https://paused.example"'));
  assert.ok(addonsHtml.includes('Sample validation error'));
  assert.ok(addonsHtml.includes('id="sources-reload-player-btn"'));
  assert.equal(/net77|netflix/i.test(addonsHtml), false);

  // Empty addons state
  const emptyAddonsHtml = renderStreamSourcesModal({ activeTab: 'addons', prefs: {}, addons: [], addonLoading: true });
  assert.ok(emptyAddonsHtml.includes('No Stremio addons connected yet'));
  assert.ok(emptyAddonsHtml.includes('Inspecting...'));

  // Tab 2: Debrid & Magnet (zero alldebrid leak)
  const debridHtml = renderStreamSourcesModal({ activeTab: 'debrid', prefs: basePrefs });
  assert.ok(debridHtml.includes('id="sources-debrid-form"'));
  assert.ok(debridHtml.includes('id="sources-debrid-provider"'));
  assert.ok(debridHtml.includes('id="sources-debrid-key"'));
  assert.ok(debridHtml.includes('id="sources-magnet-form"'));
  assert.ok(debridHtml.includes('id="sources-magnet-input"'));
  assert.equal(debridHtml.includes('alldebrid'), false);
  assert.equal(/net77|netflix/i.test(debridHtml), false);

  // Tab 3: Edge Proxy & Custom Resolver
  const proxyHtml = renderStreamSourcesModal({
    activeTab: 'proxy',
    prefs: basePrefs,
    proxyTest: { status: 'ok', message: 'Connected to Cloudflare Worker (24ms)' },
  });
  assert.ok(proxyHtml.includes('id="sources-proxy-form"'));
  assert.ok(proxyHtml.includes('id="sources-hls-proxy-input"'));
  assert.ok(proxyHtml.includes('id="sources-test-proxy-btn"'));
  assert.ok(proxyHtml.includes('id="sources-custom-resolver-input"'));
  assert.ok(proxyHtml.includes('Connected to Cloudflare Worker (24ms)'));
  assert.ok(proxyHtml.includes('cloudflare-hls-proxy.js'));
  assert.equal(/net77|netflix/i.test(proxyHtml), false);

  // Tab 4: Direct Stream
  const directHtml = renderStreamSourcesModal({ activeTab: 'direct', prefs: basePrefs });
  assert.ok(directHtml.includes('id="sources-direct-form"'));
  assert.ok(directHtml.includes('id="sources-direct-input"'));
  assert.ok(directHtml.includes('data-fill-direct="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"'));
  assert.equal(/net77|netflix/i.test(directHtml), false);

  // Settings modal retains legacy fields + link to Sources Hub
  const settingsHtml = renderSettingsSheet({
    appearance: { theme: 'default', amoled: true },
    prefs: basePrefs,
    shield: { blockedCount: 0, navigationLock: true, strictFrameMode: true },
    profile: { name: 'Ansh' },
  });
  assert.ok(settingsHtml.includes('data-open-sources="addons"'));
  assert.ok(settingsHtml.includes('id="pref-stremio-addon"'));

  // Detail modal & Mobile detail view include Sources / Addons triggers
  const sampleItem = {
    id: 'movie:157336',
    tmdbId: '157336',
    imdbId: 'tt0816692',
    mediaType: 'movie',
    title: 'Interstellar',
    year: 2014,
  };
  const mobDetail = renderDetailView({ item: sampleItem, relatedItems: [] });
  const dkDetail = renderDesktopDetailModal({ item: sampleItem, relatedItems: [] });
  assert.ok(mobDetail.includes('data-open-sources="addons"'));
  assert.ok(dkDetail.includes('data-open-sources="addons"'));
  assert.equal(/net77|netflix/i.test(mobDetail), false);
  assert.equal(/net77|netflix/i.test(dkDetail), false);

  // Relative ./ path hygiene in app.js & index.html
  const appSource = fs.readFileSync(path.join(ROOT_DIR, 'src/app.js'), 'utf8');
  assert.equal(/fetch\(\s*['"]\/(?:api|src)\//.test(appSource), false, 'app.js must use relative ./api/ paths');
  assert.ok(appSource.includes('./api/health'));
  assert.ok(appSource.includes('renderStreamSourcesModal'));
});
