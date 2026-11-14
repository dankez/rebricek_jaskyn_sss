import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ArrowDown, Compass, ExternalLink } from 'lucide-react';
import { TopBar } from './components/TopBar';
import { CaveAtlasMap } from './components/CaveAtlasMap';
import { RankingsTable } from './components/RankingsTable';
import { EvolutionCharts } from './components/EvolutionCharts';
import { SpravodajOcrPanel } from './components/SpravodajOcrPanel';
import { SemanticBibliographyPanel } from './components/SemanticBibliographyPanel';
import { AdminRankingEditor } from './components/AdminRankingEditor';
import { CaveDetailDrawer } from './components/CaveDetailDrawer';
import { SEED_CAVES } from './data/seedCaves';
import type { CaveEntity } from './types/caves';
import { buildRankedRows, exportRankingsPdf } from './utils/exportReports';

export default function App() {
  const [caves, setCaves] = useState<CaveEntity[]>(SEED_CAVES);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [metric, setMetric] = useState<'length' | 'depth'>('length');
  const [selectedCave, setSelectedCave] = useState<CaveEntity | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const heroRef = useRef<HTMLElement | null>(null);

  // Load persisted cave database from Express backend
  useEffect(() => {
    fetch('/api/caves')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.caves) && data.caves.length > 0) {
          setCaves(data.caves);
        }
      })
      .catch(() => {
        // Keep seeded dataset if backend is still initializing
      });
  }, []);

  // GSAP Hero choreography
  useEffect(() => {
    if (!heroRef.current) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      gsap.from('.gsap-hero-stagger', {
        y: 22,
        opacity: 0,
        duration: 0.75,
        stagger: 0.1,
        ease: 'power3.out',
      });
    }, heroRef);

    return () => ctx.revert();
  }, []);

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    for (const c of caves) {
      for (const r of c.records) {
        yearSet.add(r.year);
      }
    }
    return Array.from(yearSet).sort((a, b) => a - b);
  }, [caves]);

  const kpis = useMemo(() => {
    const lengthRows = buildRankedRows(caves, selectedYear, 'length');
    const depthRows = buildRankedRows(caves, selectedYear, 'depth');
    const topLength = lengthRows[0];
    const topDepth = depthRows[0];
    const changedCount = lengthRows.filter((r) => r.isBoldChanged).length;

    return {
      totalCaves: caves.length,
      topLengthName: topLength?.cave.name || 'Demänovský jaskynný systém',
      topLengthVal: topLength?.valueM || 41681,
      topDepthName: topDepth?.cave.name || 'Systém Hipmanových jaskýň',
      topDepthVal: topDepth?.valueM || 499,
      changedCount,
    };
  }, [caves, selectedYear]);

  const handleSyncFromSss = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const resp = await fetch('/api/sss/sync-rankings', { method: 'POST' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Synchronizácia zlyhala.');
      if (Array.isArray(data.caves)) {
        setCaves(data.caves);
      }
      setSyncMessage(
        `Synchronizácia z sss.sk dokončená: aktualizovaných ${data.updatedCount} záznamov, pridaných ${data.createdCount} lokalít (roky ${(data.parsedYears || []).join(', ')}).`
      );
    } catch (err) {
      setSyncMessage(
        err instanceof Error ? err.message : 'Nepodarilo sa pripojiť k sss.sk.'
      );
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const handleExportReport = () => {
    const rows = buildRankedRows(caves, selectedYear, metric);
    exportRankingsPdf(rows, selectedYear, metric);
  };

  return (
    <div id="top" className="min-h-screen bg-[#f4f5f7] text-[#1a1e23]">
      <TopBar onExportClick={handleExportReport} />

      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative overflow-hidden bg-[#1a1e23] text-white"
      >
        <div className="absolute inset-0">
          <img
            src="/src/assets/images/slovak_karst_cavern_hero_1794668121699.jpg"
            alt="Prieskum krasového podzemia Slovenskej speleologickej spoločnosti"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover object-center opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1a1e23] via-[#1a1e23]/85 to-[#1a1e23]/45" />
        </div>

        <div className="relative mx-auto max-w-[1380px] px-6 py-16 lg:py-24">
          <div className="max-w-3xl">
            <p className="gsap-hero-stagger text-xs font-semibold tracking-wide text-[#fbbc05]">
              Slovenská speleologická spoločnosť · Oficiálny archív od roku 1949
            </p>
            <h1 className="gsap-hero-stagger mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl leading-[1.1] text-balance">
              Atlas najdlhších a najhlbších jaskýň Slovenska
            </h1>
            <p className="gsap-hero-stagger mt-5 max-w-2xl text-base leading-relaxed text-[#d0d6df]">
              Interaktívna databáza jaskynných systémov zo Spravodaja SSS. Sledujte historický
              vývoj zameraných metrov v čase, skúmajte mapu objavov po rokoch, spúšťajte AI/OCR
              extrakciu z PDF archívu a vyhľadávajte v prepojenej odbornej bibliografii.
            </p>

            <div className="gsap-hero-stagger mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#atlas"
                className="inline-flex items-center gap-2 rounded-md bg-[#fbbc05] px-5 py-3 text-sm font-semibold text-[#1a1e23] whitespace-nowrap shrink-0 transition-colors hover:bg-[#eab004]"
              >
                <Compass className="h-4 w-4" />
                Preskúmať interaktívnu mapu
              </a>
              <a
                href="#spravodaj-ocr"
                className="inline-flex items-center gap-2 rounded-md border border-[#3a424d] bg-[#232830]/80 px-5 py-3 text-sm font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:border-[#fbbc05] hover:text-[#fbbc05]"
              >
                Spracovať Spravodaj PDF
                <ArrowDown className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* 4-column KPI strip below hero content */}
          <div className="gsap-hero-stagger mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-[#2f3640] bg-[#2f3640] sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-[#1a1e23]/95 p-5">
              <p className="text-xs text-[#98a2b3]">Evidované lokality v databáze</p>
              <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-white">
                {kpis.totalCaves} jaskýň
              </p>
              <p className="mt-1 text-xs text-[#c8cfd8]">
                Všetky krasové oblasti SR · {availableYears[0]}–{availableYears[availableYears.length - 1]}
              </p>
            </div>

            <div className="bg-[#1a1e23]/95 p-5">
              <p className="text-xs text-[#98a2b3]">Najdlhší systém ({selectedYear})</p>
              <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-[#fbbc05]">
                {kpis.topLengthVal.toLocaleString('sk-SK')} m
              </p>
              <p className="mt-1 truncate text-xs text-[#c8cfd8]">{kpis.topLengthName}</p>
            </div>

            <div className="bg-[#1a1e23]/95 p-5">
              <p className="text-xs text-[#98a2b3]">Najhlbší systém ({selectedYear})</p>
              <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-white">
                -{kpis.topDepthVal.toLocaleString('sk-SK')} m
              </p>
              <p className="mt-1 truncate text-xs text-[#c8cfd8]">{kpis.topDepthName}</p>
            </div>

            <div className="bg-[#1a1e23]/95 p-5">
              <p className="text-xs text-[#98a2b3]">Zmenené lokality v roku {selectedYear}</p>
              <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-[#fbbc05]">
                {kpis.changedCount} zmien
              </p>
              <p className="mt-1 text-xs text-[#c8cfd8]">
                Vyznačené tučným písmom v rebríčku
              </p>
            </div>
          </div>
        </div>
      </section>

      <main>
        <CaveAtlasMap
          caves={caves}
          years={availableYears}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          metric={metric}
          onMetricChange={setMetric}
          selectedCaveId={selectedCave?.id || null}
          onSelectCave={setSelectedCave}
        />

        <RankingsTable
          caves={caves}
          years={availableYears}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          metric={metric}
          onMetricChange={setMetric}
          onSelectCave={setSelectedCave}
          onSyncFromSss={handleSyncFromSss}
          isSyncing={isSyncing}
          syncMessage={syncMessage}
        />

        <EvolutionCharts
          caves={caves}
          selectedYear={selectedYear}
          onSelectCave={setSelectedCave}
        />

        <SpravodajOcrPanel
          onDatabaseUpdated={(updatedCaves, importedYear) => {
            setCaves(updatedCaves);
            if (importedYear) setSelectedYear(importedYear);
          }}
        />

        <SemanticBibliographyPanel
          caves={caves}
          onSelectCave={setSelectedCave}
        />

        <AdminRankingEditor
          caves={caves}
          years={availableYears}
          onDatabaseUpdated={(updatedCaves, savedYear) => {
            setCaves(updatedCaves);
            setSelectedYear(savedYear);
          }}
        />
      </main>

      {/* Institutional Footer */}
      <footer className="mt-12 border-t border-[#2a3038] bg-[#1a1e23] text-[#c8cfd8]">
        <div className="mx-auto max-w-[1380px] px-6 py-12">
          <div className="grid gap-8 md:grid-cols-12">
            <div className="md:col-span-6">
              <h3 className="font-display text-lg font-bold text-white">
                Slovenská speleologická spoločnosť (sss.sk)
              </h3>
              <p className="mt-2 max-w-xl text-xs leading-relaxed text-[#98a2b3]">
                Poznámka k presnosti dát: Z dôvodu zákonnej ochrany prírody a jaskýň uvádzajú
                verejné rebríčky SSS iba krasovú oblasť a geomorfologický podcelok bez presných GPS
                súradníc vchodov. Poloha na mape reprezentuje príslušný krasový masív. Staršie
                skenované čísla Spravodaja pred rokom 2000 vyžadujú priame AI/OCR spracovanie v
                sekcii Spravodaj OCR.
              </p>
            </div>

            <div className="md:col-span-3 space-y-2 text-xs">
              <p className="font-semibold text-white">Oficiálne zdroje SSS</p>
              <ul className="space-y-1.5">
                <li>
                  <a
                    href="https://sss.sk/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-[#fbbc05]"
                  >
                    sss.sk — Hlavná stránka <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://sss.sk/spravodaj/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-[#fbbc05]"
                  >
                    Archív Spravodaja SSS <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://sss.sk/category/rebricky-jaskyn/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-[#fbbc05]"
                  >
                    Rebríčky jaskýň Slovenska <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://bibliografia.sss.sk/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-[#fbbc05]"
                  >
                    Bibliografia SSS <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              </ul>
            </div>

            <div className="md:col-span-3 space-y-2 text-xs">
              <p className="font-semibold text-white">Kľúč k tabuľkám</p>
              <p className="text-[#98a2b3]">
                <strong className="text-white">Tučné písmo</strong> — zmena dĺžky alebo hĺbky
                oproti predchádzajúcemu ročníku.
              </p>
              <p className="text-[#98a2b3]">
                <strong className="text-[#fbbc05]">* (Hviezdička)</strong> — neoverený údaj alebo
                pokračujúce revízne meranie polygónu.
              </p>
            </div>
          </div>

          <div className="mt-10 border-t border-[#2a3038] pt-6 text-xs text-[#748091] flex flex-wrap items-center justify-between gap-4">
            <span>© Slovenská speleologická spoločnosť · Databáza jaskýň Slovenska</span>
            <span>Dáta zostavené podľa evidencie Jána Tencera a Spravodaja SSS</span>
          </div>
        </div>
      </footer>

      <CaveDetailDrawer cave={selectedCave} onClose={() => setSelectedCave(null)} />
    </div>
  );
}
