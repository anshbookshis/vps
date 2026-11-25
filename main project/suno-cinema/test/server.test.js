import test from 'node:test';
import assert from 'node:assert/strict';
import { createSunoCinemaServer } from '../server.js';

test('Suno Cinema HTTP server serves UI assets, catalog API, search, TV seasons, and blocks path traversal', async () => {
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

    const travResp = await fetch(`${base}/..%2Fpackage.json`);
    assert.ok(travResp.status === 403 || travResp.status === 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
