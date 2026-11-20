import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ArrowDownRight, ArrowRight, Mountain, Waves } from 'lucide-react';
import { TopBar, type AppView } from './components/TopBar';
import { RankingsTable } from './components/RankingsTable';
import { CaveDetailDrawer } from './components/CaveDetailDrawer';
import heroImage from './assets/images/slovak_karst_cavern_hero_1794668121699.jpg';
import type { CaveEntity } from './types/caves';
import { buildRankedRows, exportRankingsPdf } from './utils/exportReports';
import { SharePanel } from './components/SharePanel';
import { makeShareUrls, readShareSettings } from './utils/share';
import { SEO_PAGES, seoPath, SITE_URL } from './utils/seo';

const CaveHistory = lazy(() => import('./components/CaveHistory'));
const CaveAtlasMap = lazy(() =>
  import('./components/CaveAtlasMap').then((module) => ({ default: module.CaveAtlasMap }))
);
const EvolutionCharts = lazy(() =>
  import('./components/EvolutionCharts').then((module) => ({ default: module.EvolutionCharts }))
);
const SpravodajOcrPanel = lazy(() =>
  import('./components/SpravodajOcrPanel').then((module) => ({ default: module.SpravodajOcrPanel }))
);
const SemanticBibliographyPanel = lazy(() =>
  import('./components/SemanticBibliographyPanel').then((module) => ({
    default: module.SemanticBibliographyPanel,
  }))
);
const AdminRankingEditor = lazy(() =>
  import('./components/AdminRankingEditor').then((module) => ({
    default: module.AdminRankingEditor,
  }))
);

const APP_VIEWS: AppView[] = [
  'rankings',
  'map',
  'presentations',
  'bibliography',
  'ocr',
  'admin',
];

function getViewFromHash(hash: string): AppView {
  const view = hash.replace(/^#/, '') as AppView;
  return APP_VIEWS.includes(view) ? view : 'rankings';
}

export default function App() {
  const isEmbed = window.location.pathname === '/embed.html';
  const pagePath = seoPath(window.location.pathname);
  const initialShare = useMemo(() => readShareSettings(window.location.search), []);
  const [caves, setCaves] = useState<CaveEntity[]>([]);
  const [selectedYearChoice, setSelectedYear] = useState<number | null>(initialShare.year);
  const [metric, setMetric] = useState<'length' | 'depth'>(() =>
    new URLSearchParams(window.location.search).has('metric') ? initialShare.metric : SEO_PAGES[pagePath].metric,
  );
  const [selectedCave, setSelectedCave] = useState<CaveEntity | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [dataLoadMessage, setDataLoadMessage] = useState<string | null>(null);
  const [dataUpdatedAt, setDataUpdatedAt] = useState<string | null>(null);
  const [dataIsSnapshot, setDataIsSnapshot] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeView, setActiveView] = useState<AppView>(() =>
    isEmbed ? initialShare.view : getViewFromHash(window.location.hash)
  );
  const heroRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveView(getViewFromHash(window.location.hash));
      setSelectedCave(null);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!isEmbed && pagePath !== '/' && window.location.hash === '#rankings') {
      document.getElementById('rankings')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }, [isEmbed, pagePath]);

  useEffect(() => {
    if (isEmbed) return;
    fetch('/api/auth/session')
      .then((response) => response.json())
      .then((data) => setIsAdmin(data.authenticated === true))
      .catch(() => setIsAdmin(false));
  }, [isEmbed]);

  useEffect(() => {
    const loadCaves = async () => {
      try {
        const response = await fetch('/api/caves');
        if (!response.ok) throw new Error(`API odpovedalo stavom ${response.status}.`);
        const data = await response.json();
        if (!Array.isArray(data.caves)) throw new Error('API nevrátilo zoznam jaskýň.');
        setCaves(data.caves);
        setDataUpdatedAt(typeof data.updatedAt === 'string' ? data.updatedAt : null);
      } catch {
        try {
          const response = await fetch('/data/caves.json');
          if (!response.ok) throw new Error(`Statický archív odpovedal stavom ${response.status}.`);
          const data = await response.json();
          if (!Array.isArray(data.caves)) throw new Error('Statický archív nemá správny formát.');
          setCaves(data.caves);
          setDataUpdatedAt(typeof data.updatedAt === 'string' ? data.updatedAt : null);
          setDataIsSnapshot(true);
          setDataLoadMessage(
            'Zobrazené sú údaje z posledného buildu. Živé API a administrácia nie sú dostupné.',
          );
        } catch (error) {
          setDataLoadMessage(
            error instanceof Error
              ? `Databázu sa nepodarilo načítať: ${error.message}`
              : 'Databázu sa nepodarilo načítať.',
          );
        }
      }
    };
    void loadCaves();
  }, []);

  useEffect(() => {
    if (!heroRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const context = gsap.context(() => {
      gsap.from('.hero-reveal', {
        y: 20,
        opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: 'power3.out',
      });
    }, heroRef);

    return () => context.revert();
  }, []);

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    for (const cave of caves) {
      for (const record of cave.records) yearSet.add(record.year);
    }
    return Array.from(yearSet).sort((a, b) => a - b);
  }, [caves]);
  const latestMetricYear = useMemo(() => {
    let latest = 0;
    for (const cave of caves) {
      for (const record of cave.records) {
        const value = metric === 'length' ? record.lengthM : record.depthM;
        if (value != null && value > 0) latest = Math.max(latest, record.year);
      }
    }
    return latest || availableYears[availableYears.length - 1] || 2026;
  }, [availableYears, caves, metric]);
  const selectedYear = selectedYearChoice ?? latestMetricYear;

  const dashboardStats = useMemo(() => {
    const latestYear = availableYears[availableYears.length - 1] ?? selectedYear;
    const longest = buildRankedRows(caves, latestYear, 'length')[0];
    const deepest = buildRankedRows(caves, latestYear, 'depth')[0];
    return [
      {
        label: 'Evidované lokality',
        value: caves.length.toLocaleString('sk-SK'),
        note: 'jaskynné systémy v archíve',
        icon: <Mountain className="h-4 w-4" aria-hidden="true" />,
        presentationMetric: 'current' as const,
      },
      {
        label: 'Najdlhší systém',
        value: longest ? `${longest.valueM.toLocaleString('sk-SK')} m` : '—',
        note: longest?.cave.name ?? 'Údaje sa načítavajú',
        icon: <ArrowRight className="h-4 w-4" aria-hidden="true" />,
        presentationMetric: 'length' as const,
      },
      {
        label: 'Najhlbší systém',
        value: deepest ? `−${deepest.valueM.toLocaleString('sk-SK')} m` : '—',
        note: deepest?.cave.name ?? 'Údaje sa načítavajú',
        icon: <ArrowDownRight className="h-4 w-4" aria-hidden="true" />,
        presentationMetric: 'depth' as const,
      },
      {
        label: 'Historický archív',
        value: availableYears.length
          ? `${availableYears[0]}–${availableYears[availableYears.length - 1]}`
          : '—',
        note: `${availableYears.length} spracovaných ročníkov`,
        icon: <Waves className="h-4 w-4" aria-hidden="true" />,
        presentationMetric: 'current' as const,
      },
    ];
  }, [availableYears, caves, selectedYear]);

  const handleSyncFromSss = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch('/api/sss/sync-rankings', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Synchronizácia zlyhala.');
      if (Array.isArray(data.caves)) setCaves(data.caves);
      setSyncMessage(
        `Synchronizácia z sss.sk dokončená: aktualizovaných ${data.updatedCount} záznamov, pridaných ${data.createdCount} lokalít (roky ${(data.parsedYears || []).join(', ')}).`
      );
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : 'Nepodarilo sa pripojiť k sss.sk.'
      );
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const handleAdminLogin = useCallback(async (username: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(
        'Prihlasovacie API nie je dostupné. Skontrolujte konfiguráciu PHP a presmerovanie cesty /api/ na serveri.',
      );
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Prihlásenie administrátora zlyhalo.');
    setIsAdmin(true);
  }, []);

  const handleAdminLogout = useCallback(async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error('Odhlásenie administrátora zlyhalo.');
    setIsAdmin(false);
    if (activeView === 'admin' || activeView === 'ocr') {
      window.location.hash = '#rankings';
    }
  }, [activeView]);

  const handleExportReport = () => {
    const rows = buildRankedRows(caves, selectedYear, metric);
    exportRankingsPdf(rows, selectedYear, metric);
  };

  const visibleView =
    !isAdmin && (activeView === 'admin' || activeView === 'ocr') ? 'rankings' : activeView;

  useEffect(() => {
    if (!isEmbed || visibleView !== 'rankings') return;
    const root = document.getElementById('root');
    if (!root) return;
    const sendHeight = () => {
      const height = Math.ceil(root.getBoundingClientRect().height) + 2;
      window.parent.postMessage({ type: 'sss-ranking-height', height }, '*');
    };
    const respond = (event: MessageEvent) => {
      if (event.source === window.parent && event.data?.type === 'sss-request-height') sendHeight();
    };
    const observer = new ResizeObserver(sendHeight);
    observer.observe(root);
    window.addEventListener('message', respond);
    sendHeight();
    return () => {
      observer.disconnect();
      window.removeEventListener('message', respond);
    };
  }, [isEmbed, visibleView]);

  useEffect(() => {
    const titles: Record<AppView, string> = {
      rankings: SEO_PAGES[pagePath].title,
      map: 'Mapa krasových oblastí Slovenska | SSS.sk',
      presentations: 'Vývoj rebríčkov jaskýň | SSS.sk',
      bibliography: 'Speleologická bibliografia | SSS.sk',
      ocr: 'Spracovanie Spravodajov SSS | SSS.sk',
      admin: 'Správa rebríčkov | SSS.sk',
    };
    document.title = titles[visibleView];
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = SITE_URL + pagePath;
  }, [pagePath, visibleView]);

  return (
    <div className={`${isEmbed && visibleView === 'rankings' ? 'bg-white' : 'min-h-screen bg-[#f4f5f7]'} text-[#1a1e23]`}>
      {!isEmbed && <TopBar
        onExportClick={handleExportReport}
        activeView={visibleView}
        isAdmin={isAdmin}
        onLogin={handleAdminLogin}
        onLogout={handleAdminLogout}
      />}

      <main id="main-content" tabIndex={-1}>
        {dataLoadMessage && (
          <p
            role="status"
            className="mx-auto max-w-[1380px] px-4 py-3 text-sm text-amber-900 sm:px-6"
          >
            {dataLoadMessage}
          </p>
        )}
        {visibleView === 'rankings' && (
          <>
            {!isEmbed && <section
              ref={heroRef}
              className="relative isolate overflow-hidden bg-[#10181e] text-white"
            >
              <img
                src={heroImage}
                alt=""
                aria-hidden="true"
                width={1376}
                height={768}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-55"
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#10181e] via-[#10181e]/90 to-[#10181e]/35" />
              <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-[#10181e] to-transparent" />
              <div className="absolute -right-28 top-8 -z-10 h-80 w-80 rounded-full bg-[#fbbc05]/10 blur-3xl" />

              <div className="mx-auto max-w-[1380px] px-4 pb-8 pt-14 sm:px-6 sm:pb-10 sm:pt-20 lg:pt-24">
                <div className="max-w-3xl">
                  <p className="hero-reveal inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold tracking-[0.16em] text-[#fbbc05] backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#fbbc05] shadow-[0_0_12px_#fbbc05]" />
                    DIGITÁLNY ARCHÍV SLOVENSKÝCH JASKÝŇ
                  </p>
                  <h1 className="hero-reveal mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-white text-balance sm:text-6xl lg:text-7xl">
                    {pagePath === '/' ? 'Rebríčky slovenských jaskýň.' : metric === 'length' ? 'Najdlhšie jaskyne Slovenska.' : 'Najhlbšie jaskyne Slovenska.'}
                    <span className="block text-[#fbbc05]">Zachytené v čase.</span>
                  </h1>
                  <p className="hero-reveal mt-6 max-w-2xl text-sm leading-7 text-[#d0d6df] sm:text-base">
                    Objavte vývoj najdlhších a najhlbších jaskynných systémov — v prehľadnom
                    archíve zostavenom podľa Spravodaja Slovenskej speleologickej spoločnosti.
                  </p>
                  <div className="hero-reveal mt-8 flex flex-wrap items-center gap-3">
                    <a
                      href="#rankings"
                      className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#fbbc05] px-5 py-3 text-sm font-bold text-[#1a1e23] shadow-[0_8px_30px_rgba(251,188,5,0.2)] transition-colors hover:bg-[#ffd34a]"
                    >
                      Preskúmať rebríček
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                    <a
                      href="#map"
                      className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-white/25 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:border-white/50 hover:bg-white/10"
                    >
                      <Mountain className="h-4 w-4 text-[#fbbc05]" aria-hidden="true" />
                      Krasové oblasti
                    </a>
                    <span className="ml-1 inline-flex items-center gap-2 text-xs font-medium text-[#c8cfd8]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Údaje z archívu SSS
                    </span>
                  </div>
                </div>

                <div className="mt-12 grid grid-cols-2 gap-2 sm:mt-16 sm:gap-3 lg:grid-cols-4">
                  {dashboardStats.map((stat, index) => (
                    <button
                      key={stat.label}
                      type="button"
                      onClick={() => {
                        if (stat.presentationMetric !== 'current') {
                          setMetric(stat.presentationMetric);
                        }
                        window.location.hash = '#presentations';
                      }}
                      className="hero-reveal group min-w-0 cursor-pointer rounded-xl border border-white/25 bg-[#182829]/85 p-4 text-left shadow-[0_12px_36px_rgba(0,0,0,0.18)] backdrop-blur-md transition-colors hover:border-[#fbbc05]/70 hover:bg-[#263b37]/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbbc05] active:scale-[0.96] motion-reduce:active:scale-100 sm:p-5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[#aebbc4] sm:text-[11px]">
                          {stat.label}
                        </p>
                        <span
                          className={`shrink-0 rounded-lg p-2 ${
                            index === 1 ? 'bg-[#fbbc05]/15 text-[#fbbc05]' : 'bg-white/5 text-[#c5d0d6]'
                          }`}
                        >
                          {stat.icon}
                        </span>
                      </div>
                      <p className="mt-3 truncate font-mono-tabular text-xl font-bold tracking-tight text-white sm:text-2xl">
                        {stat.value}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-[#9ba8b1] sm:text-xs">
                        {stat.note}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#f3d37e]">
                        Zobraziť prezentáciu <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>}

            <div id="rankings" className="scroll-mt-32">
              <RankingsTable
                caves={caves}
                years={availableYears}
                selectedYear={selectedYear}
                onYearChange={setSelectedYear}
                metric={metric}
                onMetricChange={setMetric}
                onSelectCave={setSelectedCave}
                onSyncFromSss={handleSyncFromSss}
                isAdmin={isAdmin}
                isSyncing={isSyncing}
                syncMessage={syncMessage}
                embedded={isEmbed}
                dataUpdatedAt={dataUpdatedAt}
                dataIsSnapshot={dataIsSnapshot}
              />
            </div>
          </>
        )}

        {visibleView === 'map' && (
          <Suspense fallback={<div className="min-h-96 bg-[#f4f5f7]" />}>
            <CaveAtlasMap caves={caves} />
          </Suspense>
        )}

        {visibleView === 'presentations' && (
          <div id="presentations">
            {!isEmbed && (
              <div className="mx-auto max-w-[1380px] px-4 py-4 sm:px-6">
                <SharePanel view="presentations" metric={metric} />
              </div>
            )}
            <Suspense fallback={<div className="min-h-96 bg-[#0b1719]" />}>
              <CaveHistory caves={caves} metric={metric} onMetricChange={setMetric} onSelectCave={setSelectedCave} />
            </Suspense>
            {!isEmbed && <Suspense fallback={<div className="min-h-96 bg-[#f4f5f7]" />}>
              <EvolutionCharts
                caves={caves}
                selectedYear={selectedYear}
                onSelectCave={setSelectedCave}
              />
            </Suspense>}
          </div>
        )}

        {visibleView === 'bibliography' && (
          <Suspense fallback={<div className="min-h-96 bg-[#f4f5f7]" />}>
            <SemanticBibliographyPanel caves={caves} onSelectCave={setSelectedCave} />
          </Suspense>
        )}

        {isAdmin && visibleView === 'ocr' && (
          <Suspense fallback={<div className="min-h-96 bg-[#f4f5f7]" />}>
            <SpravodajOcrPanel
              onDatabaseUpdated={(updatedCaves, importedYear) => {
                setCaves(updatedCaves);
                if (importedYear) setSelectedYear(importedYear);
              }}
            />
          </Suspense>
        )}

        {isAdmin && visibleView === 'admin' && (
          <Suspense fallback={<div className="min-h-96 bg-[#f4f5f7]" />}>
            <AdminRankingEditor
              caves={caves}
              years={availableYears}
              onDatabaseUpdated={(updatedCaves, savedYear) => {
                setCaves(updatedCaves);
                setSelectedYear(savedYear);
              }}
            />
          </Suspense>
        )}
      </main>

      {isEmbed && visibleView === 'presentations' && (
        <footer className="bg-white px-6 py-4 text-center text-xs text-[#5a6370]">
          <a className="underline" href={makeShareUrls(window.location.origin, visibleView === 'presentations' ? 'presentations' : 'rankings', metric, selectedYearChoice).link} target="_blank" rel="noopener noreferrer">
            Otvoriť archív Slovenskej speleologickej spoločnosti
          </a>
        </footer>
      )}
      <CaveDetailDrawer
        cave={selectedCave}
        activeMetric={metric}
        onClose={() => setSelectedCave(null)}
      />
    </div>
  );
}
