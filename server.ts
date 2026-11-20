import 'dotenv/config';
import express from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { GoogleGenAI, Type } from '@google/genai';
import { SEED_CAVES } from './src/data/seedCaves.ts';
import { redactCaveLocations } from './src/utils/publicCaves.ts';
import type {
  BibliographyArticle,
  CaveEntity,
  CaveYearlyRecord,
  PdfExtractionResult,
  SpravodajIssue,
} from './src/types/caves.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'caves-db.json');
const LOCAL_ADMIN_USERNAME = 'local-admin';
const LOCAL_ADMIN_PASSWORD = 'local-only-change-me';
const ADMIN_USERNAME =
  process.env.ADMIN_USERNAME?.trim() ||
  (process.env.NODE_ENV === 'production' ? '' : LOCAL_ADMIN_USERNAME);
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : LOCAL_ADMIN_PASSWORD);
const configuredSessionSecret = process.env.SESSION_SECRET?.trim() || undefined;
const configuredAppUrl = process.env.APP_URL?.trim();
const publicSiteUrl =
  configuredAppUrl && configuredAppUrl !== 'MY_APP_URL' ? new URL(configuredAppUrl) : undefined;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !configuredSessionSecret) {
  throw new Error('SESSION_SECRET musí byť nastavený v produkčnom prostredí.');
}
if (configuredSessionSecret && Buffer.byteLength(configuredSessionSecret) < 32) {
  throw new Error('SESSION_SECRET musí mať aspoň 32 bajtov.');
}
if (isProduction && (
  !process.env.ADMIN_USERNAME?.trim() ||
  !process.env.ADMIN_PASSWORD?.trim() ||
  (ADMIN_USERNAME === LOCAL_ADMIN_USERNAME && ADMIN_PASSWORD === LOCAL_ADMIN_PASSWORD)
)) {
  throw new Error('V produkcii nastavte vlastné prihlasovacie údaje administrátora.');
}
if (isProduction && publicSiteUrl?.protocol !== 'https:') {
  throw new Error('V produkcii nastavte APP_URL na verejnú HTTPS adresu aplikácie.');
}

const SESSION_SECRET = configuredSessionSecret ?? randomBytes(32).toString('hex');
const ADMIN_SESSION_COOKIE = 'sss_admin_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function safeCredentialEquals(actual: string, expected: string): boolean {
  const actualHash = createHash('sha256').update(actual).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

function createAdminSessionToken(): string {
  const payload = `${Date.now() + SESSION_DURATION_MS}.${randomBytes(16).toString('hex')}`;
  const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function hasValidAdminSession(req: express.Request): boolean {
  const cookie = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  const token = cookie?.slice(ADMIN_SESSION_COOKIE.length + 1);
  if (!token) return false;

  const [expiresAt, nonce, signature, ...extraParts] = token.split('.');
  if (!expiresAt || !nonce || !signature || extraParts.length > 0) return false;
  const expiration = Number(expiresAt);
  if (!Number.isSafeInteger(expiration) || expiration <= Date.now()) return false;

  const payload = `${expiresAt}.${nonce}`;
  const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest();
  const provided = Buffer.from(signature, 'base64url');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

// Region centroid lookup for newly discovered caves without explicit coordinates
const REGION_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  'nízke tatry': { lat: 48.975, lon: 19.605 },
  'východné tatry': { lat: 49.228, lon: 20.165 },
  'vysoké tatry': { lat: 49.222, lon: 20.145 },
  'belianske tatry': { lat: 49.235, lon: 20.268 },
  'západné tatry': { lat: 49.238, lon: 19.775 },
  'slovenský kras': { lat: 48.585, lon: 20.645 },
  'silická planina': { lat: 48.548, lon: 20.512 },
  'jasovská planina': { lat: 48.665, lon: 20.942 },
  'spišsko-gemerský kras': { lat: 48.815, lon: 20.185 },
  'slovenský raj': { lat: 48.875, lon: 20.325 },
  'muránska planina': { lat: 48.772, lon: 20.035 },
  'malé karpaty': { lat: 48.465, lon: 17.415 },
  'homoľské karpaty': { lat: 48.265, lon: 17.125 },
  'veľká fatra': { lat: 48.842, lon: 19.055 },
  'chočské vrchy': { lat: 49.155, lon: 19.485 },
  'strážovské vrchy': { lat: 48.952, lon: 18.458 },
  'kozie chrbty': { lat: 49.045, lon: 19.952 },
  'horehronské podolie': { lat: 48.841, lon: 19.602 },
  'podtatranská kotlina': { lat: 49.092, lon: 19.354 },
  'revúcka vrchovina': { lat: 48.554, lon: 20.118 },
  'košická kotlina': { lat: 48.613, lon: 20.999 },
  'zvolenská kotlina': { lat: 48.675, lon: 19.225 },
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—\-/.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveRegionCoordinates(karstRegion: string, subUnit: string, seedStr: string): { lat: number; lon: number } {
  const subNorm = normalizeText(subUnit);
  const regNorm = normalizeText(karstRegion);

  let base = REGION_CENTROIDS[subNorm] || REGION_CENTROIDS[regNorm];
  if (!base) {
    for (const [key, coords] of Object.entries(REGION_CENTROIDS)) {
      if (subNorm.includes(key) || regNorm.includes(key)) {
        base = coords;
        break;
      }
    }
  }
  if (!base) {
    base = { lat: 48.88, lon: 19.68 };
  }

  // Deterministic small offset so caves in the same karst unit don't overlap identically
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) % 10000;
  }
  const latOffset = (((hash % 100) / 100) - 0.5) * 0.045;
  const lonOffset = (((Math.floor(hash / 100) % 100) / 100) - 0.5) * 0.065;

  return {
    lat: Number((base.lat + latOffset).toFixed(4)),
    lon: Number((base.lon + lonOffset).toFixed(4)),
  };
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function deduplicateCavesById(caves: CaveEntity[]): CaveEntity[] {
  const byId = new Map<string, CaveEntity>();
  for (const cave of caves) {
    const existing = byId.get(cave.id);
    if (!existing) {
      byId.set(cave.id, cave);
      continue;
    }
    for (const rec of cave.records) {
      const targetRec = existing.records.find((r) => r.year === rec.year);
      if (!targetRec) {
        existing.records.push(rec);
      } else {
        if (rec.lengthM != null && (targetRec.lengthM == null || rec.lengthM > targetRec.lengthM)) {
          targetRec.lengthM = rec.lengthM;
          targetRec.rankLength = rec.rankLength ?? targetRec.rankLength;
          targetRec.isBoldLength = Boolean(targetRec.isBoldLength || rec.isBoldLength);
        }
        if (rec.depthM != null && (targetRec.depthM == null || rec.depthM > targetRec.depthM)) {
          targetRec.depthM = rec.depthM;
          targetRec.rankDepth = rec.rankDepth ?? targetRec.rankDepth;
          targetRec.isBoldDepth = Boolean(targetRec.isBoldDepth || rec.isBoldDepth);
        }
      }
    }
    recomputeCaveDeltas(existing);
  }
  return Array.from(byId.values());
}

async function loadDatabase(): Promise<CaveEntity[]> {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
    const raw = await fs.readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as CaveEntity[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return deduplicateCavesById(parsed);
    }
  } catch {
    // Initialize from seed
  }
  await saveDatabase(SEED_CAVES);
  return structuredClone(SEED_CAVES);
}

async function saveDatabase(caves: CaveEntity[]): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  const unique = deduplicateCavesById(caves);
  await fs.writeFile(DB_FILE, JSON.stringify(unique, null, 2), 'utf-8');
}

function recomputeCaveDeltas(cave: CaveEntity): void {
  cave.records.sort((a, b) => a.year - b.year);
  for (let i = 0; i < cave.records.length; i++) {
    const curr = cave.records[i];
    if (i === 0) {
      curr.deltaLengthM = curr.deltaLengthM ?? null;
      curr.deltaDepthM = curr.deltaDepthM ?? null;
      continue;
    }
    const prev = cave.records[i - 1];
    if (curr.lengthM != null && prev.lengthM != null) {
      if (curr.lengthM < prev.lengthM) {
        curr.validationWarning = `Detegovaný pokles dĺžky (${curr.lengthM} m < ${prev.lengthM} m z roku ${prev.year}). Ponechaná kumulatívna dĺžka ${prev.lengthM} m.`;
        curr.lengthM = prev.lengthM;
        curr.deltaLengthM = 0;
        curr.isBoldLength = false;
      } else {
        const diffL = Number((curr.lengthM - prev.lengthM).toFixed(1));
        curr.deltaLengthM = diffL;
        if (diffL > 0) curr.isBoldLength = true;
      }
    }
    if (curr.depthM != null && prev.depthM != null) {
      if (curr.depthM < prev.depthM) {
        curr.validationWarning = `Detegovaný pokles hĺbky (${curr.depthM} m < ${prev.depthM} m z roku ${prev.year}). Ponechaná kumulatívna hĺbka ${prev.depthM} m.`;
        curr.depthM = prev.depthM;
        curr.deltaDepthM = 0;
        curr.isBoldDepth = false;
      } else {
        const diffD = Number((curr.depthM - prev.depthM).toFixed(1));
        curr.deltaDepthM = diffD;
        if (diffD > 0) curr.isBoldDepth = true;
      }
    }
  }
}

// In-memory bibliography cache from bibliografia.sss.sk
let bibliographyCache: { data: BibliographyArticle[]; fetchedAt: number } | null = null;

async function getBibliographyArticles(): Promise<BibliographyArticle[]> {
  const now = Date.now();
  if (bibliographyCache && now - bibliographyCache.fetchedAt < 6 * 60 * 60 * 1000) {
    return bibliographyCache.data;
  }
  try {
    const res = await fetch('https://bibliografia.sss.sk/data/articles.json', {
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const json = (await res.json()) as BibliographyArticle[];
      if (Array.isArray(json)) {
        bibliographyCache = { data: json, fetchedAt: now };
        return json;
      }
    }
  } catch (err) {
    console.warn('Could not fetch live bibliografia.sss.sk JSON:', err);
  }
  return bibliographyCache?.data ?? [];
}

// Fallback curated list of real Spravodaj SSS PDFs if live scrape is unreachable
const FALLBACK_ISSUES: SpravodajIssue[] = [
  { id: '2026-1', year: 2026, issue: '1', title: 'Spravodaj SSS 1/2026', pdfUrl: 'https://sss.sk/wp-content/uploads/2026/06/Spravodaj_1_2026_vnutro_NET_web.pdf', likelyContainsRankings: true },
  { id: '2026-2', year: 2026, issue: '2', title: 'Spravodaj SSS 2/2026', pdfUrl: 'https://sss.sk/wp-content/uploads/2026/09/Spravodaj_2_2026_NET_optimize.pdf', likelyContainsRankings: true },
  { id: '2025-1', year: 2025, issue: '1', title: 'Spravodaj SSS 1/2025', pdfUrl: 'https://sss.sk/wp-content/uploads/2025/06/Spravodaj_SSS_1_2025_NET.pdf', likelyContainsRankings: true },
  { id: '2025-2', year: 2025, issue: '2', title: 'Spravodaj SSS 2/2025', pdfUrl: 'https://sss.sk/wp-content/uploads/2025/10/Spravodaj_2_2025_net.pdf', likelyContainsRankings: true },
  { id: '2024-1', year: 2024, issue: '1', title: 'Spravodaj SSS 1/2024', pdfUrl: 'https://sss.sk/wp-content/uploads/2024/05/Spravodaj_1-2024_155x227.pdf', likelyContainsRankings: true },
  { id: '2024-2', year: 2024, issue: '2', title: 'Spravodaj SSS 2/2024', pdfUrl: 'https://sss.sk/wp-content/uploads/2024/08/Spravodaj_2_2024_NET_optimized.pdf', likelyContainsRankings: true },
  { id: '2023-1', year: 2023, issue: '1', title: 'Spravodaj SSS 1/2023', pdfUrl: 'https://sss.sk/wp-content/uploads/2023/07/SpravodajSSS_1_2023web.pdf', likelyContainsRankings: true },
  { id: '2023-2', year: 2023, issue: '2', title: 'Spravodaj SSS 2/2023', pdfUrl: 'https://sss.sk/wp-content/uploads/2023/11/Spravodaj_2_2023_web.pdf', likelyContainsRankings: true },
  { id: '2022-1', year: 2022, issue: '1', title: 'Spravodaj SSS 1/2022', pdfUrl: 'https://sss.sk/wp-content/uploads/2023/07/Spravodaj_1_2022_web.pdf', likelyContainsRankings: true },
  { id: '2022-2', year: 2022, issue: '2', title: 'Spravodaj SSS 2/2022', pdfUrl: 'https://sss.sk/wp-content/uploads/2023/07/Spravodaj_SSS_2_2022_web.pdf', likelyContainsRankings: true },
  { id: '2021-1', year: 2021, issue: '1', title: 'Spravodaj SSS 1/2021', pdfUrl: 'https://sss.sk/wp-content/uploads/2023/01/Spravodaj_SSS_1_2021.pdf', likelyContainsRankings: true },
  { id: '2021-2', year: 2021, issue: '2', title: 'Spravodaj SSS 2/2021', pdfUrl: 'https://sss.sk/wp-content/uploads/2023/01/Spravodaj_SSS_2_2021.pdf', likelyContainsRankings: true },
  { id: '2020-1', year: 2020, issue: '1', title: 'Spravodaj SSS 1/2020', pdfUrl: 'https://sss.sk/wp-content/uploads/2022/02/Spravodaj_SSS_1_2020.pdf', likelyContainsRankings: true },
  { id: '2020-2', year: 2020, issue: '2', title: 'Spravodaj SSS 2/2020', pdfUrl: 'https://sss.sk/wp-content/uploads/2022/02/Spravodaj_SSS_2_2020.pdf', likelyContainsRankings: true },
  { id: '2019-2', year: 2019, issue: '2', title: 'Spravodaj SSS 2/2019', pdfUrl: 'https://sss.sk/wp-content/uploads/2021/01/Spravodaj-2019-2.pdf', likelyContainsRankings: true },
  { id: '2018-2', year: 2018, issue: '2', title: 'Spravodaj SSS 2/2018', pdfUrl: 'https://sss.sk/wp-content/uploads/2020/01/spravodaj2018_2.pdf', likelyContainsRankings: true },
];

function parseSpravodajMetadata(url: string): { year: number; issue: string } | null {
  const fileName = url.split('/').pop() || '';
  // Pattern 1: Spravodaj_SSS_2_2020.pdf, Spravodaj_1_2026_vnutro..., Spravodaj-2019-2.pdf
  const matchYear = fileName.match(/(19[7-9]\d|20[0-3]\d)/);
  if (matchYear) {
    const year = parseInt(matchYear[1], 10);
    const cleaned = fileName.replace(matchYear[1], '');
    const issueMatch = cleaned.match(/(?:^|[_-])([1-4](?:-[2-4])?)(?:[_.-]|$)/);
    const issue = issueMatch ? issueMatch[1] : '1';
    return { year, issue };
  }
  // Pattern 2: 772.pdf -> year 1977 issue 2, sp921.pdf -> year 1992 issue 1
  const shortLegacy = fileName.match(/^(?:sp)?(\d{2})([1-4])\.pdf$/i);
  if (shortLegacy) {
    const yy = parseInt(shortLegacy[1], 10);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return { year, issue: shortLegacy[2] };
  }
  return null;
}

async function fetchLiveSpravodajIssues(): Promise<{ issues: SpravodajIssue[]; source: 'live' | 'cache' }> {
  try {
    const res = await fetch('https://sss.sk/spravodaj/', {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'SSS-Speleo-Atlas/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const seenUrls = new Set<string>();
    const issues: SpravodajIssue[] = [];

    $('a[href$=".pdf"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || seenUrls.has(href)) return;
      const lower = href.toLowerCase();
      if (lower.includes('bibliografia') || lower.includes('kongres') || lower.includes('b17.pdf')) return;
      seenUrls.add(href);

      const parsed = parseSpravodajMetadata(href);
      if (!parsed) return;

      const linkText = $(el).text().trim();
      const title = linkText && linkText.length > 3 && linkText.length < 60
        ? linkText
        : `Spravodaj SSS ${parsed.issue}/${parsed.year}`;

      issues.push({
        id: `${parsed.year}-${parsed.issue}-${issues.length}`,
        year: parsed.year,
        issue: parsed.issue,
        title,
        pdfUrl: href,
        likelyContainsRankings: parsed.issue === '1' || parsed.issue === '2' || parsed.issue === '1-2',
      });
    });

    if (issues.length > 0) {
      issues.sort((a, b) => b.year - a.year || a.issue.localeCompare(b.issue));
      return { issues, source: 'live' };
    }
  } catch (err) {
    console.warn('Live scrape of sss.sk/spravodaj failed, using fallback list:', err);
  }
  return { issues: FALLBACK_ISSUES, source: 'cache' };
}

function parseNumericValue(raw: string): { value: number | null; secondaryNote?: string; isUnverified: boolean } {
  const isUnverified = raw.includes('*');
  const parenMatch = raw.match(/\(([^)]+)\)\*?/);
  const secondaryNote = parenMatch ? parenMatch[0] : undefined;

  // Extract primary number before parenthesis
  const beforeParen = raw.split('(')[0].replace(/\*/g, '').replace(/\s+/g, '').replace(',', '.');
  const num = parseFloat(beforeParen);
  return {
    value: Number.isFinite(num) ? num : null,
    secondaryNote,
    isUnverified,
  };
}

async function scrapeAndMergeLiveRankings(caves: CaveEntity[]): Promise<{
  updatedCount: number;
  createdCount: number;
  parsedYears: number[];
}> {
  let updatedCount = 0;
  let createdCount = 0;
  const parsedYears = new Set<number>();

  const targets: Array<{ url: string; mode: 'length' | 'depth' }> = [
    { url: 'https://sss.sk/tabulka-najdlhsich-jaskyn-na-slovensku/', mode: 'length' },
    { url: 'https://sss.sk/tabulka-najhlbsich-jaskyn-na-slovensku/', mode: 'depth' },
  ];

  for (const target of targets) {
    const res = await fetch(target.url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'SSS-Speleo-Atlas/1.0' },
    });
    if (!res.ok) continue;
    const html = await res.text();
    const $ = cheerio.load(html);

    // Find tables on page; the first table is usually the latest year (e.g. 2020 or newer)
    const tables = $('figure.wp-block-table table');
    tables.each((tableIdx, tableEl) => {
      if (tableIdx > 1) return; // Sync latest 2 tables on the page
      const precedingText = $(tableEl).closest('figure').prevAll('h2, h3, h4, p').first().text();
      const yearMatch = precedingText.match(/(20\d{2})/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : (tableIdx === 0 ? 2020 : 2018);
      parsedYears.add(year);

      const dateMatch = precedingText.match(/(\d{1,2}\.\s*\d{1,2}\.\s*20\d{2})/);
      const statusDate = dateMatch ? dateMatch[1] : `31. 3. ${year}`;

      $(tableEl)
        .find('tbody tr')
        .each((_, tr) => {
          const cells = $(tr).find('td');
          if (cells.length < 5) return;

          const rankRaw = $(cells[0]).text().trim();
          const rank = parseInt(rankRaw.replace(/\D/g, ''), 10);
          const name = $(cells[1]).text().trim();
          const karstRegion = $(cells[2]).text().trim();
          const subUnit = $(cells[3]).text().trim();
          const valRaw = $(cells[4]).text().trim();
          const hasBoldTag = $(cells[1]).find('strong, b').length > 0 || $(cells[4]).find('strong, b').length > 0;

          if (!name || !Number.isFinite(rank)) return;
          const parsedVal = parseNumericValue(valRaw);
          if (parsedVal.value == null) return;

          const normName = normalizeText(name).replace(/\s+1$/, '');
          const candidateId = normName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          let cave = caves.find(
            (c) =>
              c.id === candidateId ||
              normalizeText(c.name) === normName ||
              (c.aliases || []).some((a) => normalizeText(a) === normName)
          );

          if (!cave) {
            const coords = resolveRegionCoordinates(karstRegion, subUnit, name);
            cave = {
              id: candidateId,
              name: name.replace(/\s+1$/, '').trim(),
              karstRegion: karstRegion || 'Nezaradený kras',
              subUnit: subUnit || karstRegion || 'Slovensko',
              lat: coords.lat,
              lon: coords.lon,
              description: `Jaskyňa evidovaná v oficiálnom rebríčku SSS (${karstRegion}${subUnit ? `, ${subUnit}` : ''}).`,
              sssUrl: target.url,
              records: [],
            };
            caves.push(cave);
            createdCount++;
          }

          let rec = cave.records.find((r) => r.year === year);
          if (!rec) {
            rec = {
              year,
              statusDate,
              lengthM: null,
              depthM: null,
              sourceIssue: `Rebríček SSS (${year})`,
              sourcePdfUrl: target.url,
              author: 'Ján Tencer',
            };
            cave.records.push(rec);
          }

          if (target.mode === 'length') {
            rec.lengthM = parsedVal.value;
            rec.rankLength = rank;
            if (hasBoldTag) rec.isBoldLength = true;
            if (parsedVal.isUnverified) {
              rec.isUnverified = true;
              rec.secondarySurveyNote = parsedVal.secondaryNote;
            }
          } else {
            rec.depthM = parsedVal.value;
            rec.rankDepth = rank;
            if (hasBoldTag) rec.isBoldDepth = true;
            if (parsedVal.isUnverified) {
              rec.isUnverified = true;
            }
          }
          updatedCount++;
        });
    });
  }

  for (const cave of caves) {
    recomputeCaveDeltas(cave);
  }
  await saveDatabase(caves);

  return {
    updatedCount,
    createdCount,
    parsedYears: Array.from(parsedYears).sort((a, b) => b - a),
  };
}

async function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const isEmbed = req.path === '/embed.html';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!isEmbed) res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          ...(isEmbed ? [] : ["frame-ancestors 'none'"]),
          "object-src 'none'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "img-src 'self' data: blob: https:",
          "connect-src 'self'",
          "worker-src 'self' blob:",
        ].join('; '),
      );
    }
    next();
  });
  app.use(express.json({ limit: '35mb' }));

  const requestOrigin = (req: express.Request) =>
    publicSiteUrl?.origin ?? `${req.protocol}://${req.get('host')}`;
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${requestOrigin(req)}/sitemap.xml\n`,
    );
  });
  app.get('/sitemap.xml', (req, res) => {
    const origin = requestOrigin(req);
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
        `<url><loc>${origin}/</loc></url></urlset>\n`,
    );
  });

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isProduction,
    path: '/',
  };
  const requireAdmin: express.RequestHandler = (req, res, next) => {
    if (!hasValidAdminSession(req)) {
      return res.status(401).json({ error: 'Vyžaduje sa prihlásenie administrátora.' });
    }
    next();
  };

  app.get('/api/auth/session', (req, res) => {
    const authenticated = hasValidAdminSession(req);
    res.json({
      authenticated,
      ...(authenticated ? { username: ADMIN_USERNAME } : {}),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body as { username?: unknown; password?: unknown };
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Zadajte prihlasovacie meno a heslo.' });
    }

    const validUsername = safeCredentialEquals(username, ADMIN_USERNAME);
    const validPassword = safeCredentialEquals(password, ADMIN_PASSWORD);
    if (!validUsername || !validPassword) {
      return res.status(401).json({ error: 'Neplatné prihlasovacie meno alebo heslo.' });
    }

    res.cookie(ADMIN_SESSION_COOKIE, createAdminSessionToken(), {
      ...cookieOptions,
      maxAge: SESSION_DURATION_MS,
    });
    res.json({ authenticated: true, username: ADMIN_USERNAME });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(ADMIN_SESSION_COOKIE, cookieOptions);
    res.json({ authenticated: false });
  });

  // Ensure initial DB exists
  await loadDatabase();

  // 1. Get all caves & historical records
  app.get('/api/caves', async (_req, res) => {
    try {
      const caves = await loadDatabase();
      const updatedAt = await fs.stat(DB_FILE).then(info => info.mtime.toISOString()).catch(() => null);
      res.json({ caves: redactCaveLocations(caves), updatedAt });
    } catch (err) {
      res.status(500).json({ error: 'Nepodarilo sa načítať databázu jaskýň.' });
    }
  });

  // 2. Get Spravodaj SSS PDF issues (live crawl from sss.sk/spravodaj/)
  app.get('/api/sss/issues', async (_req, res) => {
    const result = await fetchLiveSpravodajIssues();
    res.json(result);
  });

  // 3. Sync live rankings from sss.sk/category/rebricky-jaskyn/
  app.post('/api/sss/sync-rankings', requireAdmin, async (_req, res) => {
    try {
      const caves = await loadDatabase();
      const summary = await scrapeAndMergeLiveRankings(caves);
      res.json({ ...summary, caves: redactCaveLocations(caves) });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Synchronizácia z sss.sk zlyhala.',
      });
    }
  });

  // 4. Bibliography proxy & filter (bibliografia.sss.sk)
  app.get('/api/bibliography', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit || 40), 100);
    const articles = await getBibliographyArticles();

    if (!q) {
      return res.json({ total: articles.length, articles: articles.slice(0, limit) });
    }
    const qNorm = normalizeText(q);
    const tokens = qNorm.split(' ').filter((t) => t.length > 1);

    const scored = articles
      .map((art) => {
        const hay = normalizeText(
          `${art.title} ${art.abstract} ${(art.caves || []).join(' ')} ${(art.tags || []).join(' ')} ${(art.authors || []).join(' ')}`
        );
        let score = 0;
        if (hay.includes(qNorm)) score += 10;
        for (const tok of tokens) {
          if (hay.includes(tok)) score += 2;
        }
        return { art, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.art.year - a.art.year);

    res.json({
      total: scored.length,
      articles: scored.slice(0, limit).map((s) => s.art),
    });
  });

  // 5. Semantic Search across caves & bibliografia.sss.sk using Gemini
  app.post('/api/search/semantic', async (req, res) => {
    try {
      const query = String(req.body?.query || '').trim();
      if (!query) {
        return res.status(400).json({ error: 'Zadajte vyhľadávací dopyt.' });
      }

      const caves = await loadDatabase();
      const articles = await getBibliographyArticles();

      // Build compact lexical pre-filter for articles so we pass high-signal candidates to Gemini
      const qNorm = normalizeText(query);
      const tokens = qNorm.split(' ').filter((t) => t.length > 2);

      const candidateArticles = articles
        .map((art) => {
          const hay = normalizeText(
            `${art.title} ${art.abstract} ${(art.caves || []).join(' ')} ${(art.tags || []).join(' ')} ${art.year}`
          );
          let score = 0;
          if (hay.includes(qNorm)) score += 8;
          for (const t of tokens) {
            if (hay.includes(t)) score += 2;
          }
          // Boost articles mentioning cave names
          if ((art.caves || []).length > 0) score += 0.5;
          return { art, score };
        })
        .sort((a, b) => b.score - a.score || b.art.year - a.art.year)
        .slice(0, 28)
        .map((x) => x.art);

      const ai = getGeminiClient();
      if (!ai) {
        // Clean lexical fallback when GEMINI_API_KEY is absent
        const matchedCaves = caves
          .filter((c) => {
            const hay = normalizeText(`${c.name} ${c.karstRegion} ${c.subUnit} ${c.description}`);
            return tokens.some((t) => hay.includes(t));
          })
          .slice(0, 8)
          .map((c) => {
            const latest = c.records[c.records.length - 1];
            return {
              caveId: c.id,
              name: c.name,
              karstRegion: c.karstRegion,
              relevanceReason: `Zhoda v oblasti ${c.karstRegion} (${c.subUnit}) alebo v popise lokality.`,
              latestLengthM: latest?.lengthM ?? null,
              latestDepthM: latest?.depthM ?? null,
            };
          });

        return res.json({
          query,
          answerSummary:
            'Výsledky boli zoradené podľa textovej zhody v databáze jaskýň SSS a v archíve bibliografia.sss.sk.',
          matchedCaves,
          matchedArticles: candidateArticles.slice(0, 10),
        });
      }

      const caveDigest = caves.map((c) => {
        const latest = c.records[c.records.length - 1];
        const historySummary = c.records
          .map((r) => `${r.year}: dĺžka ${r.lengthM ?? '-'}m, hĺbka ${r.depthM ?? '-'}m${r.isUnverified ? '*' : ''}`)
          .join('; ');
        return {
          id: c.id,
          name: c.name,
          karstRegion: c.karstRegion,
          subUnit: c.subUnit,
          description: c.description,
          latestLengthM: latest?.lengthM ?? null,
          latestDepthM: latest?.depthM ?? null,
          historySummary,
        };
      });

      const articleDigest = candidateArticles.map((a) => ({
        id: a.id,
        title: a.title,
        year: a.year,
        authors: a.authors,
        abstract: a.abstract?.slice(0, 260),
        caves: a.caves,
      }));

      const prompt = `Si odborný speleologický vyhľadávací asistent pre Slovenskú speleologickú spoločnosť (sss.sk).
Používateľ položil sémantický dopyt: "${query}"

Vyhodnoť relevanciu z nasledujúcich jaskýň a odborných článkov zo Spravodaja SSS (bibliografia.sss.sk) a vráť štruktúrovanú odpoveď v slovenčine.
Zohľadňuj význam slov (napr. "ľadová jaskyňa", "hlboká priepasť", "podzemný tok", "Tatry", "Slovenský kras", "zmeny po roku 2018", "neoverené údaje *").

JASKYNE:
${JSON.stringify(caveDigest)}

ČLÁNKY (bibliografia.sss.sk):
${JSON.stringify(articleDigest)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answerSummary: {
                type: Type.STRING,
                description: 'Stručné odborné zhrnutie odpovede na dopyt v slovenčine (2-3 vety).',
              },
              matchedCaves: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    caveId: { type: Type.STRING },
                    relevanceReason: { type: Type.STRING },
                  },
                },
              },
              matchedArticleIds: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    relevanceReason: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        answerSummary?: string;
        matchedCaves?: Array<{ caveId: string; relevanceReason: string }>;
        matchedArticleIds?: Array<{ id: number; relevanceReason: string }>;
      };

      const matchedCaves = (parsed.matchedCaves || [])
        .map((m) => {
          const cave = caves.find((c) => c.id === m.caveId);
          if (!cave) return null;
          const latest = cave.records[cave.records.length - 1];
          return {
            caveId: cave.id,
            name: cave.name,
            karstRegion: cave.karstRegion,
            relevanceReason: m.relevanceReason,
            latestLengthM: latest?.lengthM ?? null,
            latestDepthM: latest?.depthM ?? null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const matchedArticles = (parsed.matchedArticleIds || [])
        .map((m) => {
          const art = candidateArticles.find((a) => a.id === m.id);
          if (!art) return null;
          return { ...art, relevanceReason: m.relevanceReason };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      res.json({
        query,
        answerSummary: parsed.answerSummary || 'Nájdené relevantné záznamy v archíve SSS.',
        matchedCaves,
        matchedArticles: matchedArticles.length > 0 ? matchedArticles : candidateArticles.slice(0, 6),
      });
    } catch (err) {
      console.error('Semantic search error:', err);
      res.status(500).json({ error: 'Sémantické vyhľadávanie zlyhalo. Skúste upraviť dopyt.' });
    }
  });

  // 6. Multimodal AI PDF/OCR & Raw Text Extraction using Gemini
  app.post('/api/extract/pdf', requireAdmin, async (req, res) => {
    try {
      const { pdfUrl, pdfBase64, rawText, tablePreference } = req.body as {
        pdfUrl?: string;
        pdfBase64?: string;
        rawText?: string;
        tablePreference?: 'length' | 'depth' | 'auto';
      };

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(400).json({
          error: 'GEMINI_API_KEY nie je nakonfigurovaný pre AI/OCR extrakciu PDF.',
        });
      }

      const extractionInstruction = `Si expert na spracovanie slovenských speleologických dokumentov (Spravodaj Slovenskej speleologickej spoločnosti - SSS).
Tvojou úlohou je z priloženého PDF (vrátane prípadného OCR zo skenovaných strán) alebo textu nájsť a presne extrahovať:
"TABUĽKA NAJDLHŠÍCH JASKÝŇ NA SLOVENSKU" alebo "TABUĽKA NAJHLBŠÍCH JASKÝŇ NA SLOVENSKU" (zostavovateľ napr. Ján Tencer).

Pravidlá extrakcie:
1. Pre každý riadok zisti: poradové číslo (rank), presný názov jaskyne (name), krasovú oblasť (karstRegion), geomorfologický podcelok (subUnit), číselnú hodnotu v metroch (valueM - odstráň medzery z tisícov, napr. "41 681" -> 41681, desatinnú čiarku zmeň na bodku, napr. "174,5" -> 174.5).
2. Ak je za hodnotou poznámka v zátvorke alebo hviezdička napr. "31 840 (9031)*", ulož valueM = 31840, secondaryNote = "(9031)*", isUnverified = true.
3. Ak je položka alebo názov v origináli zvýraznená tučným písmom (bold) — čo v SSS znamená zmenu oproti minulému roku — nastav isBoldChanged = true.
4. Zachovaj všetky poznámky pod čiarou (footnotes) vysvetľujúce hviezdičku (*) a metodiku.
5. Preferencia tabuľky od používateľa: ${tablePreference || 'auto'}. Ak dokument obsahuje obe tabuľky a preferencia je 'auto', extrahuj tabuľku najdlhších jaskýň (prípadne najvýraznejšiu tabuľku v dokumente).`;

      const schemaConfig = {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tableType: { type: Type.STRING, description: "'length' alebo 'depth'" },
            year: { type: Type.INTEGER },
            issueLabel: { type: Type.STRING, description: 'Napr. Spravodaj SSS 2/2020' },
            statusDate: { type: Type.STRING, description: 'Napr. 31. 3. 2020' },
            author: { type: Type.STRING, description: 'Napr. Ján Tencer' },
            footnotes: { type: Type.ARRAY, items: { type: Type.STRING } },
            rawSummary: { type: Type.STRING, description: 'Stručné zhrnutie nájdených údajov a zmien.' },
            rows: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  rank: { type: Type.INTEGER },
                  name: { type: Type.STRING },
                  karstRegion: { type: Type.STRING },
                  subUnit: { type: Type.STRING },
                  valueM: { type: Type.NUMBER },
                  secondaryNote: { type: Type.STRING },
                  isBoldChanged: { type: Type.BOOLEAN },
                  isUnverified: { type: Type.BOOLEAN },
                },
              },
            },
          },
        },
      };

      let contents: unknown;

      if (rawText && rawText.trim().length > 20) {
        contents = `${extractionInstruction}\n\nVSTUPNÝ TEXT:\n${rawText}`;
      } else if (pdfBase64) {
        const cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
        contents = {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: cleanBase64,
              },
            },
            { text: extractionInstruction },
          ],
        };
      } else if (pdfUrl) {
        const pdfResp = await fetch(pdfUrl, {
          signal: AbortSignal.timeout(25000),
          headers: { 'User-Agent': 'SSS-Speleo-Atlas/1.0' },
        });
        if (!pdfResp.ok) {
          return res.status(502).json({ error: `Nepodarilo sa stiahnuť PDF (${pdfResp.status}) z ${pdfUrl}` });
        }
        const arrayBuf = await pdfResp.arrayBuffer();
        if (arrayBuf.byteLength > 24 * 1024 * 1024) {
          return res.status(413).json({ error: 'PDF presahuje maximálnu veľkosť 24 MB pre priame spracovanie.' });
        }
        const base64Data = Buffer.from(arrayBuf).toString('base64');
        contents = {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data,
              },
            },
            { text: `${extractionInstruction}\nZdrojové URL: ${pdfUrl}` },
          ],
        };
      } else {
        return res.status(400).json({ error: 'Zadajte PDF URL, nahrajte PDF súbor alebo vložte text tabuľky.' });
      }

      const aiResp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
        config: schemaConfig,
      });

      const extracted = JSON.parse((aiResp.text ?? '{}').trim()) as PdfExtractionResult;
      extracted.sourceUrl = pdfUrl || 'https://sss.sk/spravodaj/';

      // Validate extracted values against historical database records (a cave cannot shrink)
      const caves = await loadDatabase();
      const validationWarnings: string[] = [];
      for (const row of extracted.rows || []) {
        const normName = normalizeText(row.name).replace(/\s+1$/, '');
        const candidateId = normName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const existingCave = caves.find(
          (c) =>
            c.id === candidateId ||
            normalizeText(c.name) === normName ||
            (c.aliases || []).some((a) => normalizeText(a) === normName)
        );
        if (!existingCave) continue;
        const prevRec = [...existingCave.records]
          .filter((r) => r.year < extracted.year)
          .sort((a, b) => b.year - a.year)[0];
        if (!prevRec) continue;
        const prevVal = extracted.tableType === 'depth' ? prevRec.depthM : prevRec.lengthM;
        if (prevVal != null) {
          row.prevValueM = prevVal;
          if (row.valueM < prevVal) {
            const msg = `${row.name}: extrahovaná hodnota ${row.valueM} m je menšia ako v roku ${prevRec.year} (${prevVal} m). Jaskyňa sa nemôže zmenšovať.`;
            row.validationWarning = msg;
            validationWarnings.push(msg);
          }
        }
      }
      extracted.validationWarnings = validationWarnings;

      res.json({ extraction: extracted });
    } catch (err) {
      console.error('PDF extraction error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Extrakcia PDF zlyhala.',
      });
    }
  });

  // 7. Commit extracted table into persistent cave database
  app.post('/api/caves/import-extraction', requireAdmin, async (req, res) => {
    try {
      const extraction = req.body?.extraction as PdfExtractionResult | undefined;
      if (!extraction || !Array.isArray(extraction.rows) || extraction.rows.length === 0) {
        return res.status(400).json({ error: 'Chýbajú extrahované riadky na uloženie.' });
      }

      const caves = await loadDatabase();
      let importedRows = 0;
      let newCaves = 0;

      for (const row of extraction.rows) {
        const normName = normalizeText(row.name).replace(/\s+1$/, '');
        const candidateId = normName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        let cave = caves.find(
          (c) =>
            c.id === candidateId ||
            normalizeText(c.name) === normName ||
            (c.aliases || []).some((a) => normalizeText(a) === normName)
        );

        if (!cave) {
          const coords = resolveRegionCoordinates(row.karstRegion, row.subUnit, row.name);
          cave = {
            id: candidateId,
            name: row.name.replace(/\s+1$/, '').trim(),
            karstRegion: row.karstRegion || 'Slovensko',
            subUnit: row.subUnit || row.karstRegion || '',
            lat: coords.lat,
            lon: coords.lon,
            description: `Lokalita pridaná AI extrakciou zo zdroja ${extraction.issueLabel}.`,
            records: [],
          };
          caves.push(cave);
          newCaves++;
        }

        let rec = cave.records.find((r) => r.year === extraction.year);
        if (!rec) {
          rec = {
            year: extraction.year,
            statusDate: extraction.statusDate || `31. 3. ${extraction.year}`,
            lengthM: null,
            depthM: null,
            sourceIssue: extraction.issueLabel || `Spravodaj SSS (${extraction.year})`,
            sourcePdfUrl: extraction.sourceUrl || 'https://sss.sk/spravodaj/',
            author: extraction.author || 'Ján Tencer',
          };
          cave.records.push(rec);
        }

        if (extraction.tableType === 'depth') {
          rec.depthM = row.valueM;
          rec.rankDepth = row.rank;
          rec.isBoldDepth = row.isBoldChanged;
        } else {
          rec.lengthM = row.valueM;
          rec.rankLength = row.rank;
          rec.isBoldLength = row.isBoldChanged;
        }

        if (row.isUnverified) {
          rec.isUnverified = true;
          if (row.secondaryNote) rec.secondarySurveyNote = row.secondaryNote;
          if (extraction.footnotes?.length) {
            rec.unverifiedNote = extraction.footnotes.join(' ');
          }
        }
        importedRows++;
      }

      for (const cave of caves) {
        recomputeCaveDeltas(cave);
      }
      await saveDatabase(caves);

      res.json({ importedRows, newCaves, caves: redactCaveLocations(caves) });
    } catch (err) {
      res.status(500).json({ error: 'Uloženie extrahovaných dát do databázy zlyhalo.' });
    }
  });

  // 8. Admin endpoint: save/create a full yearly ranking table
  app.post('/api/admin/save-year', requireAdmin, async (req, res) => {
    try {
      const { year, metric, statusDate, author, footnote, rows } = req.body as {
        year: number;
        metric: 'length' | 'depth';
        statusDate: string;
        author: string;
        footnote?: string;
        rows: Array<{
          rank: number;
          caveId?: string;
          name: string;
          karstRegion: string;
          subUnit: string;
          valueM: number;
          isBoldChanged: boolean;
          isUnverified: boolean;
          secondaryNote?: string;
        }>;
      };

      if (!Number.isFinite(year) || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Neplatné údaje pre uloženie ročníka.' });
      }

      const caves = await loadDatabase();
      let savedCount = 0;
      let newCaves = 0;

      // Validate monotonic non-shrinking rule before saving
      const shrinkErrors: string[] = [];
      for (const row of rows) {
        if (!row.name || !Number.isFinite(row.valueM) || row.valueM <= 0) continue;
        const normName = normalizeText(row.name).replace(/\s+1$/, '');
        const candidateId = normName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const existingCave =
          (row.caveId ? caves.find((c) => c.id === row.caveId) : undefined) ||
          caves.find(
            (c) =>
              c.id === candidateId ||
              normalizeText(c.name) === normName ||
              (c.aliases || []).some((a) => normalizeText(a) === normName)
          );
        if (!existingCave) continue;
        const prevRec = [...existingCave.records]
          .filter((r) => r.year < year)
          .sort((a, b) => b.year - a.year)[0];
        if (!prevRec) continue;
        const prevVal = metric === 'depth' ? prevRec.depthM : prevRec.lengthM;
        if (prevVal != null && row.valueM < prevVal) {
          shrinkErrors.push(
            `${existingCave.name} (${row.valueM} m < ${prevVal} m v roku ${prevRec.year})`
          );
        }
      }

      if (shrinkErrors.length > 0) {
        return res.status(400).json({
          error: `Chyba validácie: Jaskyňa nemôže strácať ${
            metric === 'depth' ? 'hĺbku' : 'dĺžku'
          } oproti predchádzajúcemu ročníku: ${shrinkErrors.slice(0, 3).join(', ')}.`,
        });
      }

      for (const row of rows) {
        if (!row.name || !Number.isFinite(row.valueM) || row.valueM <= 0) continue;
        const normName = normalizeText(row.name).replace(/\s+1$/, '');
        const candidateId = normName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        let cave =
          (row.caveId ? caves.find((c) => c.id === row.caveId) : undefined) ||
          caves.find(
            (c) =>
              c.id === candidateId ||
              normalizeText(c.name) === normName ||
              (c.aliases || []).some((a) => normalizeText(a) === normName)
          );

        if (!cave) {
          const coords = resolveRegionCoordinates(row.karstRegion, row.subUnit, row.name);
          cave = {
            id: candidateId,
            name: row.name.trim(),
            karstRegion: row.karstRegion?.trim() || 'Slovensko',
            subUnit: row.subUnit?.trim() || row.karstRegion?.trim() || '',
            lat: coords.lat,
            lon: coords.lon,
            description: `Lokalita pridaná cez admin rozhranie SSS pre ročník ${year}.`,
            sssUrl: 'https://sss.sk/category/rebricky-jaskyn/',
            records: [],
          };
          caves.push(cave);
          newCaves++;
        }

        let rec = cave.records.find((r) => r.year === year);
        if (!rec) {
          rec = {
            year,
            statusDate: statusDate || `31. 3. ${year}`,
            lengthM: null,
            depthM: null,
            sourceIssue: `Spravodaj SSS 1/${year}`,
            sourcePdfUrl: 'https://sss.sk/spravodaj/',
            author: author || 'Ján Tencer',
          };
          cave.records.push(rec);
        }

        rec.statusDate = statusDate || rec.statusDate;
        rec.author = author || rec.author;

        if (metric === 'depth') {
          rec.depthM = row.valueM;
          rec.rankDepth = row.rank;
          rec.isBoldDepth = Boolean(row.isBoldChanged);
        } else {
          rec.lengthM = row.valueM;
          rec.rankLength = row.rank;
          rec.isBoldLength = Boolean(row.isBoldChanged);
        }

        rec.isUnverified = Boolean(row.isUnverified);
        rec.secondarySurveyNote = row.secondaryNote?.trim() || undefined;
        if (row.isUnverified && footnote) {
          rec.unverifiedNote = footnote;
        }
        savedCount++;
      }

      for (const cave of caves) {
        recomputeCaveDeltas(cave);
      }
      await saveDatabase(caves);

      res.json({ savedCount, newCaves, caves: redactCaveLocations(caves) });
    } catch (err) {
      res.status(500).json({ error: 'Uloženie ročníka cez admin rozhranie zlyhalo.' });
    }
  });

  // Vite dev middleware or static serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    const assetsPath = `${path.join(distPath, 'assets')}${path.sep}`;
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath === path.join(distPath, 'index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.startsWith(assetsPath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SSS.sk Speleo Atlas server running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
