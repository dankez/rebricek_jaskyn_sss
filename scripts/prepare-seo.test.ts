import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { load } from 'cheerio';
import type { CaveEntity } from '../src/types/caves';
import { buildRankedRows } from '../src/utils/exportReports';
import { SEO_PAGES, SITE_URL } from '../src/utils/seo';

test('built SEO pages expose truthful public snapshots and matching metadata', async () => {
  const { caves }: { caves: CaveEntity[] } = JSON.parse(await readFile('dist/data/caves.json', 'utf8'));
  const sitemap = await readFile('dist/sitemap.xml', 'utf8');
  for (const [path, page] of Object.entries(SEO_PAGES)) {
    const file = path === '/' ? 'dist/index.html' : `dist${path}`;
    const $ = load(await readFile(file, 'utf8'));
    const url = SITE_URL + path;
    assert.equal($('title').text(), page.title);
    assert.equal($('link[rel="canonical"]').attr('href'), url);
    assert.equal($('meta[property="og:url"]').attr('content'), url);
    assert.equal(JSON.parse($('script[type="application/ld+json"]').text()).url, url);
    assert.ok(sitemap.includes(`<loc>${url}</loc>`));
    const year = Math.max(...caves.flatMap(cave => cave.records
      .filter(record => (page.metric === 'length' ? record.lengthM ?? 0 : record.depthM ?? 0) > 0)
      .map(record => record.year)));
    const first = buildRankedRows(caves, year, page.metric)[0];
    assert.equal($('tbody tr').length, 10);
    assert.ok($('tbody tr').first().text().includes(first.cave.name));
    assert.ok($('main').text().includes('snímka z posledného zostavenia webu'));
  }
});
