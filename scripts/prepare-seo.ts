import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'cheerio';
import type { CaveEntity } from '../src/types/caves';
import { buildRankedRows } from '../src/utils/exportReports';
import { SEO_PAGES, SITE_URL } from '../src/utils/seo';

const dist = resolve(process.cwd(), 'dist');
const template = await readFile(resolve(dist, 'index.html'), 'utf8');
const data: { caves: CaveEntity[] } = JSON.parse(await readFile(resolve(dist, 'data/caves.json'), 'utf8'));
const escape = (value: string | number) => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);

for (const [path, page] of Object.entries(SEO_PAGES)) {
  const years = data.caves.flatMap(cave => cave.records
    .filter(record => (page.metric === 'length' ? record.lengthM : record.depthM) != null &&
      (page.metric === 'length' ? record.lengthM! : record.depthM!) > 0)
    .map(record => record.year));
  if (!years.length) throw new Error(`Chýbajú verejné údaje pre ${path}.`);
  const year = Math.max(...years);
  const rows = buildRankedRows(data.caves, year, page.metric).slice(0, 10);
  const label = page.metric === 'length' ? 'Najdlhšie' : 'Najhlbšie';
  const heading = path === '/' ? 'Rebríčky slovenských jaskýň' : `${label} jaskyne Slovenska`;
  const tableRows = rows.map(row =>
    `<tr><td>${row.rank}.</td><td>${escape(row.cave.name)}</td><td>${escape(row.cave.karstRegion)}</td><td>${escape(row.valueM.toLocaleString('sk-SK'))} m</td></tr>`,
  ).join('');
  const $ = load(template);
  $('title').text(page.title);
  $('meta[name="description"]').attr('content', page.description);
  $('link[rel="canonical"]').attr('href', SITE_URL + path);
  $('meta[property="og:title"]').attr('content', page.title);
  $('meta[property="og:description"]').attr('content', page.description);
  $('meta[property="og:url"]').attr('content', SITE_URL + path);
  $('#root').html(`
    <main style="max-width:70rem;margin:2rem auto;padding:0 1rem;font-family:Arial,sans-serif;line-height:1.6">
      <h1>${heading}</h1>
      <p>${escape(page.description)}</p>
      <nav aria-label="Rebríčky">
        <a href="/najdlhsie-jaskyne.html">Najdlhšie jaskyne Slovenska</a> ·
        <a href="/najhlbsie-jaskyne.html">Najhlbšie jaskyne Slovenska</a>
      </nav>
      <h2>${label} jaskyne Slovenska – ${year}</h2>
      <p>Verejná snímka z posledného zostavenia webu. Interaktívne aktuálne údaje a ďalšie ročníky sú dostupné po zapnutí JavaScriptu.</p>
      <table>
        <thead><tr><th>Poradie</th><th>Jaskyňa</th><th>Krasová oblasť</th><th>${page.metric === 'length' ? 'Dĺžka' : 'Hĺbka'}</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p>Zdroj: ${escape(rows[0]?.sourceIssue ?? 'Spravodaj SSS')}. Údaje sú publikované merania, nie dátumy objavov.</p>
      <p><a href="https://sss.sk/">Slovenská speleologická spoločnosť</a></p>
    </main>
  `);
  const structured = path === '/'
    ? { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Rebríčky slovenských jaskýň', url: SITE_URL + '/', inLanguage: 'sk' }
    : { '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, url: SITE_URL + path, description: page.description, inLanguage: 'sk', isPartOf: { '@type': 'WebSite', url: SITE_URL + '/' } };
  $('head').append(`<script type="application/ld+json">${JSON.stringify(structured)}</script>`);
  await writeFile(resolve(dist, path === '/' ? 'index.html' : path.slice(1)), $.html(), 'utf8');
}
console.log('Pripravené indexovateľné stránky rebríčkov a verejné snímky.');
