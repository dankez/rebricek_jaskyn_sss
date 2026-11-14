/**
 * Batch Spravodaj SSS Crawler & PDF Table Processor
 * Spracuje HTML rebríčky z sss.sk a PDF čísla Spravodaja SSS (2015–2026)
 * Spustenie: npx tsx scripts/process_spravodaje.ts
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import type { BibliographyArticle, CaveEntity } from '../src/types/caves.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT_DIR, 'data', 'caves-db.json');
const CACHE_PDF_DIR = '/tmp/sss_pdfs';

const REGION_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  'nizke tatry': { lat: 48.975, lon: 19.605 },
  'demanovske vrchy': { lat: 48.985, lon: 19.605 },
  'dumbier': { lat: 48.932, lon: 19.658 },
  'kralovoholske tatry': { lat: 48.912, lon: 19.995 },
  'vychodne tatry': { lat: 49.228, lon: 20.165 },
  'vysoke tatry': { lat: 49.222, lon: 20.145 },
  'belianske tatry': { lat: 49.235, lon: 20.268 },
  'zapadne tatry': { lat: 49.238, lon: 19.775 },
  'cervene vrchy': { lat: 49.231, lon: 19.908 },
  'rohace': { lat: 49.252, lon: 19.665 },
  'osobita': { lat: 49.261, lon: 19.722 },
  'sivy vrch': { lat: 49.211, lon: 19.642 },
  'slovensky kras': { lat: 48.585, lon: 20.645 },
  'silicka planina': { lat: 48.548, lon: 20.512 },
  'jasovska planina': { lat: 48.665, lon: 20.942 },
  'plesivska planina': { lat: 48.601, lon: 20.415 },
  'plesivecka planina': { lat: 48.601, lon: 20.415 },
  'horny vrch': { lat: 48.628, lon: 20.771 },
  'dolny vrch': { lat: 48.575, lon: 20.752 },
  'spissko-gemersky kras': { lat: 48.815, lon: 20.185 },
  'slovensky raj': { lat: 48.875, lon: 20.325 },
  'muranska planina': { lat: 48.772, lon: 20.035 },
  'male karpaty': { lat: 48.465, lon: 17.415 },
  'homolske karpaty': { lat: 48.265, lon: 17.125 },
  'biele hory': { lat: 48.525, lon: 17.345 },
  'nedze': { lat: 48.726, lon: 17.772 },
  'plavecke predhorie': { lat: 48.492, lon: 17.285 },
  'velka fatra': { lat: 48.842, lon: 19.055 },
  'chocsko vrchy': { lat: 49.155, lon: 19.485 },
  'chocske vrchy': { lat: 49.155, lon: 19.485 },
  'strazovske vrchy': { lat: 48.952, lon: 18.458 },
  'mojtinsky kras': { lat: 49.002, lon: 18.415 },
  'kozie chrbty': { lat: 49.045, lon: 19.952 },
  'horehronske podolie': { lat: 48.841, lon: 19.602 },
  'podtatranska kotlina': { lat: 49.092, lon: 19.354 },
  'revucka vrchovina': { lat: 48.554, lon: 20.118 },
  'kosicka kotlina': { lat: 48.613, lon: 20.999 },
  'zvolenska kotlina': { lat: 48.675, lon: 19.225 },
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—\-/.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalCaveKey(name: string): string {
  const n = norm(name)
    .replace(/,\s*c\.\s*ndj.*$/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+1$/, '')
    .trim();
  if (n.startsWith('demanovsky jaskynny system')) return 'demanovsky jaskynny system';
  if (n.startsWith('domica')) return 'domica certova diera';
  if (n.startsWith('system hipmanovych') || n.startsWith('hipmanov jaskynny')) return 'system hipmanovych jaskyn';
  if (n.startsWith('system stratenskej') || n.startsWith('jaskynny system stratenskej')) return 'system stratenskej jaskyne';
  if (n.startsWith('stefanova')) return 'stefanova';
  if (n.startsWith('javorinka')) return 'javorinka';
  if (n.startsWith('liskovska jaskyna')) return 'liskovska jaskyna';
  if (n.startsWith('jasovska jaskyna')) return 'jasovska jaskyna';
  if (n.startsWith('jaskyna v zaskoci') || n.startsWith('system jaskyna v zaskoci')) return 'jaskyna v zaskoci';
  if (n.startsWith('system suchej a mokrej') || n.startsWith('system sucha diera')) return 'system suchej a mokrej diery';
  if (n.startsWith('zapolna')) return 'zapolna';
  if (n.startsWith('velka ladova priepast') || n === 'ladova priepast') return 'ladova priepast';
  if (n.startsWith('bystrianska jaskyna') || n.startsWith('bystriansky jaskynny')) return 'bystrianska jaskyna';
  if (n === 'bystrianskyzavrt') return 'bystriansky zavrt';
  if (n.startsWith('cetnikova svadba')) return 'cetnikova svadba';
  if (n.startsWith('drienovska jaskyna')) return 'drienovska jaskyna';
  if (n.startsWith('nova michnova')) return 'nova michnova m 2';
  if (n.startsWith('certova diera') && !n.includes('domica')) return 'certova diera horny vrch';
  return n;
}

function resolveCoords(karstRegion: string, subUnit: string, name: string): { lat: number; lon: number } {
  const subN = norm(subUnit);
  const regN = norm(karstRegion);
  let base = REGION_CENTROIDS[subN] || REGION_CENTROIDS[regN];
  if (!base) {
    for (const [k, v] of Object.entries(REGION_CENTROIDS)) {
      if (subN.includes(k) || regN.includes(k)) {
        base = v;
        break;
      }
    }
  }
  if (!base) base = { lat: 48.88, lon: 19.68 };

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 10000;
  }
  const latOff = (((hash % 100) / 100) - 0.5) * 0.05;
  const lonOff = (((Math.floor(hash / 100) % 100) / 100) - 0.5) * 0.07;
  return {
    lat: Number((base.lat + latOff).toFixed(4)),
    lon: Number((base.lon + lonOff).toFixed(4)),
  };
}

function parseNumeric(raw: string): { value: number | null; secondaryNote?: string; isUnverified: boolean } {
  const isUnverified = raw.includes('*') || raw.includes('/');
  const paren = raw.match(/(?:\([^)]+\)|\/[\d\s]+)\*?/);
  const secondaryNote = paren ? paren[0].trim() : undefined;
  const cleaned = raw.split(/[/(]/)[0].replace(/\*/g, '').replace(/\s+/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return {
    value: Number.isFinite(num) ? num : null,
    secondaryNote,
    isUnverified,
  };
}

function upsertCaveRecord(
  caves: CaveEntity[],
  payload: {
    name: string;
    karstRegion: string;
    subUnit: string;
    year: number;
    statusDate: string;
    mode: 'length' | 'depth';
    rank: number;
    valueM: number;
    isBold: boolean;
    isUnverified: boolean;
    secondaryNote?: string;
    sourceIssue: string;
    sourcePdfUrl: string;
    ndjNumber?: string;
  }
): { created: boolean } {
  const key = canonicalCaveKey(payload.name);
  const candidateId = key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let cave = caves.find(
    (c) =>
      c.id === candidateId ||
      canonicalCaveKey(c.name) === key ||
      (c.aliases || []).some((a) => canonicalCaveKey(a) === key)
  );

  let created = false;
  if (!cave) {
    const coords = resolveCoords(payload.karstRegion, payload.subUnit, payload.name);
    cave = {
      id: candidateId,
      name: payload.name.replace(/\s+1$/, '').trim(),
      karstRegion: payload.karstRegion || 'Slovensko',
      subUnit: payload.subUnit || payload.karstRegion || '',
      lat: coords.lat,
      lon: coords.lon,
      description: `Lokalita evidovaná v rebríčkoch SSS (${payload.karstRegion}${payload.subUnit ? `, ${payload.subUnit}` : ''})${payload.ndjNumber ? `, č. NDJ ${payload.ndjNumber}` : ''}.`,
      sssUrl: 'https://sss.sk/category/rebricky-jaskyn/',
      records: [],
    };
    caves.push(cave);
    created = true;
  }

  let rec = cave.records.find((r) => r.year === payload.year);
  if (!rec) {
    rec = {
      year: payload.year,
      statusDate: payload.statusDate,
      lengthM: null,
      depthM: null,
      sourceIssue: payload.sourceIssue,
      sourcePdfUrl: payload.sourcePdfUrl,
      author: 'Ján Tencer',
    };
    cave.records.push(rec);
  }

  if (payload.mode === 'length') {
    rec.lengthM = payload.valueM;
    rec.rankLength = payload.rank;
    if (payload.isBold) rec.isBoldLength = true;
  } else {
    rec.depthM = payload.valueM;
    rec.rankDepth = payload.rank;
    if (payload.isBold) rec.isBoldDepth = true;
  }
  if (payload.isUnverified) {
    rec.isUnverified = true;
    if (payload.secondaryNote) rec.secondarySurveyNote = payload.secondaryNote;
  }
  rec.sourceIssue = payload.sourceIssue;
  rec.sourcePdfUrl = payload.sourcePdfUrl;
  return { created };
}

async function processHtmlRankings(caves: CaveEntity[]) {
  const targets: Array<{ url: string; mode: 'length' | 'depth' }> = [
    { url: 'https://sss.sk/tabulka-najdlhsich-jaskyn-na-slovensku/', mode: 'length' },
    { url: 'https://sss.sk/tabulka-najhlbsich-jaskyn-na-slovensku/', mode: 'depth' },
  ];

  let rowsAdded = 0;
  for (const target of targets) {
    console.log(`Fetching HTML table: ${target.url}`);
    const resp = await fetch(target.url, { headers: { 'User-Agent': 'SSS-Batch-Script/1.0' } });
    if (!resp.ok) continue;
    const html = await resp.text();
    const $ = cheerio.load(html);

    const tables = $('figure.wp-block-table table');
    tables.each((idx, table) => {
      const prevText = $(table).closest('figure').prevAll('h2, h3, h4, p').first().text();
      const yearMatch = prevText.match(/(20\d{2})/);
      const defaultYears = [2024, 2021, 2020, 2017];
      const year = yearMatch ? parseInt(yearMatch[1], 10) : defaultYears[idx] || 2020;

      $(table)
        .find('tbody tr')
        .each((_, tr) => {
          const cells = $(tr).find('td');
          if (cells.length < 5) return;
          const rank = parseInt($(cells[0]).text().trim().replace(/\D/g, ''), 10);
          const name = $(cells[1]).text().trim();
          const karstRegion = $(cells[2]).text().trim();
          const subUnit = $(cells[3]).text().trim();
          const valRaw = $(cells[4]).text().trim();
          const isBold = $(cells[1]).find('strong, b').length > 0 || $(cells[4]).find('strong, b').length > 0;
          if (!name || !Number.isFinite(rank)) return;

          const parsed = parseNumeric(valRaw);
          if (parsed.value == null) return;

          upsertCaveRecord(caves, {
            name,
            karstRegion,
            subUnit,
            year,
            statusDate: `31. 3. ${year}`,
            mode: target.mode,
            rank,
            valueM: parsed.value,
            isBold,
            isUnverified: parsed.isUnverified,
            secondaryNote: parsed.secondaryNote,
            sourceIssue: `Rebríček SSS (${year})`,
            sourcePdfUrl: target.url,
          });
          rowsAdded++;
        });
    });
  }
  console.log(`HTML tables processed: ${rowsAdded} cell records merged.`);
}

async function downloadPdfCached(url: string): Promise<Uint8Array | null> {
  await fs.mkdir(CACHE_PDF_DIR, { recursive: true });
  const safeName = url.split('/').pop()?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'issue.pdf';
  const localPath = path.join(CACHE_PDF_DIR, safeName);
  try {
    const buf = await fs.readFile(localPath);
    if (buf.byteLength > 1000) return new Uint8Array(buf);
  } catch {
    // Download
  }
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(25000),
      headers: { 'User-Agent': 'SSS-Batch-Script/1.0' },
    });
    if (!res.ok) return null;
    const arr = new Uint8Array(await res.arrayBuffer());
    await fs.writeFile(localPath, arr);
    return arr;
  } catch {
    return null;
  }
}

async function processPdfRankings(caves: CaveEntity[]) {
  const bibRes = await fetch('https://bibliografia.sss.sk/data/articles.json', {
    headers: { 'User-Agent': 'SSS-Batch-Script/1.0' },
  });
  const articles = (await bibRes.json()) as BibliographyArticle[];
  const rankingArticles = articles.filter(
    (a) =>
      a.year >= 2012 &&
      a.year <= 2026 &&
      (/najdlh|najhlb/i.test(a.title) &&
        /jaskyn|tabuľk/i.test(a.title) &&
        a.pdf_page_start != null)
  );

  const byUrl = new Map<string, { year: number; issue: string; url: string; minPage: number; maxPage: number }>();
  for (const art of rankingArticles) {
    if (!art.pdf_url) continue;
    const existing = byUrl.get(art.pdf_url);
    const pStart = art.pdf_page_start || 40;
    const pEnd = art.pdf_page_end || pStart;
    if (!existing) {
      byUrl.set(art.pdf_url, {
        year: art.year,
        issue: art.issue,
        url: art.pdf_url,
        minPage: Math.max(1, pStart - 2),
        maxPage: pEnd + 6,
      });
    } else {
      existing.minPage = Math.min(existing.minPage, Math.max(1, pStart - 2));
      existing.maxPage = Math.max(existing.maxPage, pEnd + 6);
    }
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let pdfRowsMerged = 0;

  for (const item of Array.from(byUrl.values()).sort((a, b) => b.year - a.year)) {
    console.log(`Processing PDF ${item.year}/${item.issue}: ${item.url} (pages ~${item.minPage}-${item.maxPage})`);
    const bytes = await downloadPdfCached(item.url);
    if (!bytes) {
      console.warn(`  Skipping (download failed): ${item.url}`);
      continue;
    }

    const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
    const startP = Math.max(1, item.minPage);
    const endP = Math.min(doc.numPages, item.maxPage);

    let currentMode: 'length' | 'depth' | null = null;
    let statusDate = `31. 3. ${item.year}`;

    for (let p = startP; p <= endP; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();

      const byY = new Map<number, Array<{ x: number; str: string }>>();
      for (const rawIt of tc.items) {
        const it = rawIt as { str?: string; transform?: number[] };
        if (!it.str || !it.str.trim() || !it.transform) continue;
        const y = Math.round(it.transform[5] / 3) * 3;
        const arr = byY.get(y) || [];
        arr.push({ x: it.transform[4], str: it.str });
        byY.set(y, arr);
      }

      const sortedYs = [...byY.keys()].sort((a, b) => b - a);
      for (const y of sortedYs) {
        const line = byY
          .get(y)!
          .sort((a, b) => a.x - b.x)
          .map((i) => i.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        const compact = line.replace(/\s+/g, '').toUpperCase();
        if (/NAJDLHŠ|TABUĽKANAJDLH/i.test(compact)) {
          currentMode = 'length';
          const dm = line.match(/(\d{1,2}\.\s*\d{1,2}\.\s*20\d{2})/);
          if (dm) statusDate = dm[1];
          continue;
        }
        if (/NAJHLBŠ|TABUĽKANAJHLB/i.test(compact)) {
          currentMode = 'depth';
          const dm = line.match(/(\d{1,2}\.\s*\d{1,2}\.\s*20\d{2})/);
          if (dm) statusDate = dm[1];
          continue;
        }
        if (!currentMode) continue;

        const cleanedLine = line.replace(/(?:\.\s*){3,}/g, ' ... ');
        const rankMatch = cleanedLine.match(/^(\d{1,3})\s*\.\s*(.+)$/);
        if (!rankMatch) continue;

        const rank = parseInt(rankMatch[1], 10);
        if (rank < 1 || rank > 120) continue;

        const rest = rankMatch[2].trim();
        let body = '';
        let valueStr = '';
        let ndjNumber: string | undefined;

        // Format A (2025–2026): "Name, Karst, Subunit, č . NDJ 5280   51 873"
        const ndjSplit = rest.match(
          /^(.*?),?\s*č\s*\.\s*NDJ\s*(\d+)\s+(\d[\d\s]{0,7}(?:,\d)?(?:\s*(?:\([^)]+\)|\/[\d\s]+))?\*?)$/i
        );
        if (ndjSplit) {
          body = ndjSplit[1].trim();
          ndjNumber = ndjSplit[2];
          valueStr = ndjSplit[3].trim();
        } else {
          // Format B (2012–2024): "Name, Karst, Subunit ... 46 896" or "... 9 031 /31 000*"
          const dotSplit = rest.match(
            /^(.+?)\s*(?:\.\.\.|\u2026)\s*(\d[\d\s]{0,7}(?:,\d)?(?:\s*(?:\([^)]+\)|\/[\d\s]+))?\*?)$/
          );
          if (dotSplit) {
            body = dotSplit[1].trim();
            valueStr = dotSplit[2].trim();
          } else {
            // Fallback without dots or NDJ (including "31 540 /6 971")
            const spaceSplit = rest.match(
              /^(.+?,\s*[^,]+?)\s+(\d{1,2}\s+\d{3}(?:,\d)?(?:\s*(?:\([^)]+\)|\/[\d\s]+))?\*?|\d{2,4}(?:,\d)?(?:\s*(?:\([^)]+\)|\/[\d\s]+))?\*?)$/
            );
            if (!spaceSplit) continue;
            body = spaceSplit[1].trim();
            valueStr = spaceSplit[2].trim();
          }
        }

        body = body.replace(/\s*,\s*/g, ', ').replace(/\s*\.\s*/g, '. ').trim();
        const parts = body.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length < 2) continue;
        const name = parts[0];
        const karstRegion = parts[1] || 'Slovensko';
        const subUnit = parts.slice(2).join(', ') || karstRegion;

        const valParsed = parseNumeric(valueStr);
        if (valParsed.value == null || valParsed.value <= 0) continue;

        // Sanity bounds
        if (currentMode === 'length' && (valParsed.value < 200 || valParsed.value > 70000)) continue;
        if (currentMode === 'depth' && (valParsed.value < 30 || valParsed.value > 700)) continue;

        upsertCaveRecord(caves, {
          name,
          karstRegion,
          subUnit,
          year: item.year,
          statusDate,
          mode: currentMode,
          rank,
          valueM: valParsed.value,
          isBold: false,
          isUnverified: valParsed.isUnverified,
          secondaryNote: valParsed.secondaryNote,
          sourceIssue: `Spravodaj SSS ${item.issue}/${item.year}`,
          sourcePdfUrl: item.url,
          ndjNumber,
        });
        pdfRowsMerged++;
      }
    }
  }
  console.log(`PDF batch processing complete: ${pdfRowsMerged} table entries parsed across 2012–2026.`);
}

function finalizeDatabase(caves: CaveEntity[]) {
  const anomalies: Array<{
    cave: string;
    year: number;
    metric: 'dĺžka' | 'hĺbka';
    prevYear: number;
    prevVal: number;
    rawVal: number;
  }> = [];

  for (const cave of caves) {
    cave.records.sort((a, b) => a.year - b.year);
    for (let i = 0; i < cave.records.length; i++) {
      const curr = cave.records[i];
      if (i === 0) {
        curr.deltaLengthM = null;
        curr.deltaDepthM = null;
        continue;
      }
      const prev = cave.records[i - 1];
      if (curr.lengthM != null && prev.lengthM != null) {
        if (curr.lengthM < prev.lengthM) {
          anomalies.push({
            cave: cave.name,
            year: curr.year,
            metric: 'dĺžka',
            prevYear: prev.year,
            prevVal: prev.lengthM,
            rawVal: curr.lengthM,
          });
          curr.validationWarning = `Detegovaný pokles dĺžky v PDF (${curr.lengthM} m < ${prev.lengthM} m z roku ${prev.year}). Ponechaná kumulatívna dĺžka ${prev.lengthM} m.`;
          if (!curr.secondarySurveyNote && curr.lengthM !== prev.lengthM) {
            curr.secondarySurveyNote = `(${curr.lengthM})*`;
          }
          curr.lengthM = prev.lengthM;
          curr.deltaLengthM = 0;
          curr.isBoldLength = false;
        } else {
          const dl = Number((curr.lengthM - prev.lengthM).toFixed(1));
          curr.deltaLengthM = dl;
          if (dl > 0) curr.isBoldLength = true;
        }
      }
      if (curr.depthM != null && prev.depthM != null) {
        if (curr.depthM < prev.depthM) {
          anomalies.push({
            cave: cave.name,
            year: curr.year,
            metric: 'hĺbka',
            prevYear: prev.year,
            prevVal: prev.depthM,
            rawVal: curr.depthM,
          });
          curr.validationWarning = `Detegovaný pokles hĺbky v PDF (${curr.depthM} m < ${prev.depthM} m z roku ${prev.year}). Ponechaná kumulatívna hĺbka ${prev.depthM} m.`;
          curr.depthM = prev.depthM;
          curr.deltaDepthM = 0;
          curr.isBoldDepth = false;
        } else {
          const dd = Number((curr.depthM - prev.depthM).toFixed(1));
          curr.deltaDepthM = dd;
          if (dd > 0) curr.isBoldDepth = true;
        }
      }
    }
  }

  if (anomalies.length > 0) {
    console.warn(`[VALIDÁCIA] Detegovaných a korigovaných ${anomalies.length} poklesov oproti predchádzajúcemu ročníku:`);
    for (const a of anomalies) {
      console.warn(`  - ${a.cave} (${a.year}, ${a.metric}): extrahované ${a.rawVal} m < ${a.prevVal} m (${a.prevYear}) -> zachované ${a.prevVal} m`);
    }
  }

  caves.sort((a, b) => {
    const la = a.records[a.records.length - 1]?.lengthM || 0;
    const lb = b.records[b.records.length - 1]?.lengthM || 0;
    return lb - la;
  });
}

async function main() {
  const { SEED_CAVES } = await import('../src/data/seedCaves.ts');
  // Preserve cave metadata & 2005 historical baseline; rebuild 2013–2026 cleanly from real HTML/PDF archives
  const caves: CaveEntity[] = structuredClone(SEED_CAVES).map((c) => ({
    ...c,
    records: c.records.filter((r) => r.year <= 2005),
  }));

  await processHtmlRankings(caves);
  await processPdfRankings(caves);
  finalizeDatabase(caves);

  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(caves, null, 2), 'utf-8');

  const years = new Set<number>();
  for (const c of caves) for (const r of c.records) years.add(r.year);
  console.log(`Saved ${caves.length} caves across years: ${Array.from(years).sort().join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
