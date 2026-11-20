import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowRight, Compass, Layers, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import type { CaveEntity } from '../types/caves';
import { buildRankedRows } from '../utils/exportReports';
import heroImage from '../assets/images/slovak_karst_cavern_hero_1794668121699.jpg';
import './CaveHistory.css';

type Metric = 'length' | 'depth';
type Props = { caves: CaveEntity[]; onSelectCave: (cave: CaveEntity) => void };
const COLORS = ['#e8c373', '#80d9cf', '#a8a0ee', '#edaa88', '#8cc4ee', '#b8d592'];
const number = (value: number) => value.toLocaleString('sk-SK', { maximumFractionDigits: 1 });
const colorFor = (id: string) => COLORS[Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % COLORS.length];

function RollingNumber({ value, initialValue, duration }: { value: number; initialValue?: number; duration: number }) {
  const reduced = useReducedMotion();
  const current = useMotionValue(initialValue ?? value);
  const label = useTransform(current, amount => number(Math.round(amount)));
  useEffect(() => {
    const animation = animate(current, value, { duration: reduced ? 0 : duration, ease: 'easeOut' });
    return () => animation.stop();
  }, [value, current, reduced, duration]);
  return <span aria-label={number(Math.round(value))}><motion.span aria-hidden="true">{label}</motion.span></span>;
}

type PlaybackProps = { playing: boolean; onPlay: () => void };

function LengthRace({ caves, year, onSelectCave, playing, onPlay, controls, duration }: Props & PlaybackProps & { year: number; controls: ReactNode; duration: number }) {
  const reduced = useReducedMotion();
  const previousYearRef = useRef(year);
  const previousYear = previousYearRef.current;
  useEffect(() => { previousYearRef.current = year; }, [year]);
  const rows = buildRankedRows(caves, year, 'length').slice(0, 10);
  const previousValues = useMemo(() => new Map(
    buildRankedRows(caves, previousYear, 'length').map(row => [row.cave.id, row.valueM]),
  ), [caves, previousYear]);
  const startingValue = (id: string) => previousYear === year ? undefined : previousValues.get(id);
  const leader = rows[0];
  const maximum = useMemo(() => caves.reduce((max, cave) =>
    cave.records.reduce((peak, record) => Math.max(peak, record.lengthM ?? 0), max), 1), [caves]);
  return (
    <section className="history-b" aria-labelledby="history-b-title">
      <header className="history-b-heading">
        <p className="history-eyebrow">NAJDLHŠIE JASKYNE / SÚBOJ VELIKÁNOV</p>
        <div><h1 id="history-b-title">Veľké mená.<br /><em>Ešte väčšie podzemie.</em></h1><div className="history-b-intro"><p>Desať priečok. Desať príbehov.<br />A čas, ktorý mení poradie.</p><button className="history-intro-play" onClick={onPlay}>{playing ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}{playing ? 'Pozastaviť príbeh' : 'Rozhýbať rebríček'}</button></div></div>
      </header>
      {controls}
      <div className="history-race-layout">
        <aside className="history-race-aside">
          <span className="history-eyebrow">ROČNÍK ARCHÍVU</span>
          <strong className="history-race-year">{year}</strong>
          {leader && <div className="history-leader-card">
            <span className="history-eyebrow"><Sparkles size={14} /> PRVÉ MIESTO V TOMTO ROKU</span>
            <h2>{leader.cave.name}</h2>
            <strong><RollingNumber key={leader.cave.id} value={leader.valueM} initialValue={startingValue(leader.cave.id)} duration={duration} /> <small>m</small></strong>
            <p>{leader.cave.karstRegion}</p>
            <button className="history-text-button" onClick={() => onSelectCave(leader.cave)}>Jej príbeh <ArrowRight size={14} /></button>
          </div>}
          <p className="history-race-note">Iba údaje daného ročníka. Zmena hodnoty môže znamenať nové meranie, prepojenie aj opravu.</p>
        </aside>
        <div className="history-race-board">
          <div className="history-race-head"><span>TOP 10 / PUBLIKOVANÁ DĹŽKA</span><span>METRE</span></div>
          <div className="history-race-rows" role="list" aria-label={`Rebríček ${year}`}>
            <AnimatePresence initial={false}>
              {rows.map((row, index) => (
                <motion.div
                  key={row.cave.id}
                  role="listitem"
                  className="history-race-row"
                  initial={{ opacity: 0, y: index * 56 + 18 }}
                  animate={{ opacity: 1, y: index * 56 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : .8, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="history-race-rank">{String(index + 1).padStart(2, '0')}</span>
                  <button className="history-race-cave" onClick={() => onSelectCave(row.cave)}>
                    <span className="history-race-cave-name">{row.cave.name}</span>
                    <motion.span className="history-race-fill" initial={false} animate={{ width: `${row.valueM / maximum * 100}%` }} transition={{ duration: reduced ? 0 : duration, ease: 'easeOut' }} style={{ background: colorFor(row.cave.id) }} />
                  </button>
                  <strong><RollingNumber value={row.valueM} initialValue={startingValue(row.cave.id)} duration={duration} /></strong>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="history-race-foot"><span>Rovnaká mierka počas celého prehrávania</span><span>0 — {number(maximum)} m</span></div>
          <p className="history-source-line">Zdroj lídra: {leader?.sourceIssue ?? '—'} • {leader?.statusDate ?? '—'}</p>
        </div>
      </div>
    </section>
  );
}

const CHAPTERS = [
  { year: 1986, title: 'Prvé svetlo v našom archíve.', text: 'Dvadsať najdlhších. Dvadsať najhlbších. Otvárame najstaršiu spracovanú tabuľku — nie začiatok objavovania jaskýň.' },
  { year: 1996, title: 'Čísla majú svoj príbeh.', text: 'Aj spôsob merania je súčasťou poznania. Tento historický článok prináša kratší výber a diskusiu o zostavovaní rebríčka.' },
  { year: 2006, title: 'O ďalšiu zákrutu ďalej.', text: 'Vydanie za vydaním pribúdajú zdokumentované údaje. Porovnávame publikované merania, nie domyslený rast medzi rokmi.' },
  { year: 2012, title: 'Podzemie v novom svetle.', text: 'Zastavte sa pri jaskyni, ktorú poznáte. Za jedným číslom sa môže skrývať množstvo výprav a dokumentačnej práce.' },
  { year: 2020, title: 'Hranice známeho sa menia.', text: 'Dlhšie chodby, nové prepojenia aj presnejšie údaje. Archív zachytáva poznanie svojej doby, vrátane neskorších opráv.' },
  { year: 2026, title: 'Pokračovanie je pod nami.', text: 'Dostali sme sa k najnovšiemu roku v našom archíve. Príbeh výskumu sa však poslednou stránkou tabuľky nekončí.' },
];

function DepthExpedition({ caves, onSelectCave }: Props) {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [chapter, setChapter] = useState(0);
  const shaftRef = useRef<HTMLElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const progress = useMotionValue(0);
  const ropeEnd = useTransform(progress, [0, 1], ['14%', '100%']);
  const readingLine = () => {
    const header = document.querySelector('#site-header')?.getBoundingClientRect().height ?? 0;
    const shaft = window.innerWidth <= 700 ? shaftRef.current?.offsetHeight ?? 0 : 0;
    return (Math.min(header + shaft, window.innerHeight * .8) + window.innerHeight) / 2;
  };
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    preference.addEventListener('change', update);
    update();
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = readingLine();
      const centers = sectionRefs.current.flatMap(section => {
        if (!section) return [];
        const bounds = section.getBoundingClientRect();
        return bounds.top + bounds.height / 2;
      });
      if (centers.length !== CHAPTERS.length) return;
      let position = centers.length - 1;
      for (let index = 1; index < centers.length; index++) {
        if (line > centers[index]) continue;
        const fraction = Math.max(0, (line - centers[index - 1]) / (centers[index] - centers[index - 1]));
        position = index - 1 + fraction;
        break;
      }
      const activeChapter = Math.round(position);
      progress.set((reduced ? activeChapter : position) / (CHAPTERS.length - 1));
      setChapter(activeChapter);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [progress, reduced]);
  const year = CHAPTERS[chapter].year;
  const rankings = useMemo(() => CHAPTERS.map(item => buildRankedRows(caves, item.year, 'depth').slice(0, 3)), [caves]);
  const deepest = rankings[chapter][0];
  const descend = (index: number) => {
    const bounds = sectionRefs.current[index]?.getBoundingClientRect();
    if (bounds) window.scrollBy({ top: bounds.top + bounds.height / 2 - readingLine(), behavior: reduced ? 'instant' : 'smooth' });
  };
  return (
    <section className="history-c" aria-labelledby="history-c-title">
      <header className="history-expedition-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(10,20,23,.94), rgba(10,20,23,.3)), url(${heroImage})` }}>
        <p className="history-eyebrow"><Compass size={15} /> NAJHLBŠIE JASKYNE / VÝPRAVA DO HĹBKY</p>
        <h1 id="history-c-title">Niektoré príbehy<br />sa čítajú <em>smerom nadol.</em></h1>
        <p>Vezmite si svetlo. Šesť zastavení vás prevedie štyridsiatimi rokmi publikovaných meraní slovenského podzemia.</p>
        <button onClick={() => descend(0)}>Začať zostup <ArrowDown size={17} /></button>
        <span className="history-expedition-coordinate">ARCHÍV SSS / 1986—2026 / BEZ ZOBRAZENIA POLÔH</span>
      </header>
      <div className="history-expedition-layout">
        <aside ref={shaftRef} className="history-shaft">
          <div className="history-shaft-strata" aria-hidden="true" />
          <div className="history-shaft-label"><Layers size={15} /> SYMBOLICKÝ REZ PODZEMÍM</div>
          <div className="history-shaft-year"><span>PRÁVE STE V ROKU</span><strong data-testid="expedition-year">{year}</strong></div>
          <svg className="history-shaft-walls" viewBox="0 0 400 650" preserveAspectRatio="none" aria-hidden="true">
            <path d="M144 0 160 65 134 125 156 182 124 241 142 300 119 352 139 416 121 482 146 551 126 606 143 650H0V0Z" fill="#192b2d" stroke="#344647" />
            <path d="M246 0 229 66 263 134 240 199 265 251 247 306 288 365 259 429 275 486 251 542 296 607 269 650H400V0Z" fill="#192b2d" stroke="#344647" />
          </svg>
          <div className="history-descent-rig" aria-hidden="true">
            <span className="history-rope-anchor" />
            <motion.span className="history-rope" style={{ height: ropeEnd }} />
            <motion.div className="history-caver" style={{ top: ropeEnd }}>
              <span className="history-lamp-glow" />
              <svg viewBox="0 0 58 76" fill="none">
                <path d="M27 29c-9-3-15 4-14 16l3 5 15-3z" fill="#345559" stroke="#73968b" strokeWidth="1.5" />
                <path d="m33 48 10 5 5 12m-17-15-3 10 8 9" stroke="#90a5a2" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m48 65 5 2m-17 2 6 1" stroke="#d7ddc9" strokeWidth="4" strokeLinecap="round" />
                <path d="m25 28 11 2 3 19-9 5-10-9z" fill="#ce7852" stroke="#f1ae72" strokeWidth="1.5" />
                <path d="m33 35-8-4-7-10m11 18-11 5-3-8" stroke="#edac79" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m19 21-4-4m0 19v-5" stroke="#f7dec1" strokeWidth="3" strokeLinecap="round" />
                <path d="m21 44 14 4m-10 5 7-5" stroke="#273737" strokeWidth="3" strokeLinecap="round" />
                <circle cx="18" cy="45" r="3" stroke="#f8da9c" strokeWidth="1.5" />
                <circle cx="31" cy="23" r="6" fill="#f3c9a0" />
                <path d="M24 23a8 8 0 0 1 16-2l-1 2z" fill="#e8c373" stroke="#ffe0a6" strokeWidth="1.25" />
                <path d="M37 20h4" stroke="#fff9dc" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </motion.div>
          </div>
          <nav className="history-chapter-dots" aria-label="Zastavenia výpravy">
            {CHAPTERS.map((item, index) => <button key={item.year} aria-label={`Prejsť na rok ${item.year}`} aria-current={index === chapter ? 'step' : undefined} onClick={() => descend(index)}><i />{item.year}</button>)}
          </nav>
          <div className="history-shaft-reading"><span>NAJHLBŠIA JASKYŇA TOHTO ROKU</span><strong>{deepest ? `−${number(deepest.valueM)} m` : '—'}</strong><p>{deepest?.cave.name}</p><small>Lano znázorňuje postup príbehom, nie skutočnú hĺbku ani polohu.</small></div>
        </aside>
        <div className="history-expedition-chapters">
          {CHAPTERS.map((item, index) => {
            const [leader, ...runnersUp] = rankings[index];
            return (
              <article key={item.year} data-chapter={index} ref={element => { sectionRefs.current[index] = element; }} className={`history-chapter ${chapter === index ? 'is-current' : ''}`}>
                <motion.div initial={false} animate={{ opacity: reduced || chapter === index ? 1 : .7 }} transition={{ duration: reduced ? 0 : .25 }}>
                  <p className="history-eyebrow">ZASTAVENIE {String(index + 1).padStart(2, '0')} / {item.year}</p>
                  <h2>{item.title}</h2>
                  <p className="history-chapter-copy">{item.text}</p>
                  {leader && <button className="history-chapter-fact" onClick={() => onSelectCave(leader.cave)}>
                    <span>NAJHLBŠIA JASKYŇA / {item.year}</span>
                    <strong>−{number(leader.valueM)} <small>m</small></strong>
                    <span>{leader.cave.name} <ArrowRight size={15} /></span>
                  </button>}
                  {runnersUp.map((row, rank) => <button key={row.cave.id} className="history-depth-runner" onClick={() => onSelectCave(row.cave)}><span>{rank + 2}. {row.cave.name}</span><strong>−{number(row.valueM)} m</strong></button>)}
                  {leader && <p className="history-source-line">Zdroj lídra: {leader.sourceIssue}</p>}
                </motion.div>
              </article>
            );
          })}
          <div className="history-expedition-end"><span className="history-live-dot" /><p>Čo bude za ďalšou zákrutou?</p><button className="history-text-button" onClick={() => window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' })}>Späť na povrch <ArrowLeft size={15} /></button></div>
        </div>
      </div>
    </section>
  );
}

function LengthPresentation({ caves, onSelectCave }: Props) {
  const years = useMemo(() => Array.from(new Set(caves.flatMap(cave =>
    cave.records.filter(rec => (rec.lengthM ?? 0) > 0).map(rec => rec.year)))).sort((a, b) => a - b), [caves]);
  const [selectedIndex, setYearIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1600);
  const yearIndex = Math.min(selectedIndex ?? years.length - 1, years.length - 1);
  const year = years[yearIndex];
  const togglePlay = () => {
    if (yearIndex >= years.length - 1) setYearIndex(0);
    setPlaying(value => !value);
  };
  useEffect(() => {
    if (!playing || yearIndex >= years.length - 1) return;
    const timer = window.setTimeout(() => {
      setYearIndex(yearIndex + 1);
      if (yearIndex + 1 === years.length - 1) setPlaying(false);
    }, speed);
    return () => window.clearTimeout(timer);
  }, [playing, speed, yearIndex, years.length]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  if (year === undefined) return <p className="history-loading">Dĺžkové merania nie sú k dispozícii.</p>;
  return <LengthRace caves={caves} year={year} onSelectCave={onSelectCave} playing={playing} onPlay={togglePlay} duration={Math.min(speed / 1000 * .85, 2.5)} controls={
      <section className="history-playback" aria-label="Prehrávanie histórie">
        <div className="history-playback-top">
          <div className="history-playback-actions">
            <button className="history-play-toggle" aria-label={playing ? 'Pozastaviť históriu' : 'Prehrať históriu'} onClick={togglePlay}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button>
            <button aria-label="Na prvý rok" onClick={() => { setYearIndex(0); setPlaying(false); }}><RotateCcw size={17} /></button>
            <div><span>ROK ARCHÍVU</span><output data-testid="history-year">{year}</output></div>
          </div>
          <div className="history-playback-options"><label>Rýchlosť <select value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={1600}>1×</option><option value={800}>2×</option><option value={3000}>Pomaly</option></select></label></div>
        </div>
        <label className="history-year-slider"><span className="sr-only">Rok archívu</span><input aria-valuetext={String(year)} type="range" min={0} max={years.length - 1} value={yearIndex} onChange={event => { setYearIndex(Number(event.target.value)); setPlaying(false); }} /></label>
        <div className="history-year-labels"><span>{years[0]}</span><span>Preskakovanie iba medzi rokmi s údajmi • {years.length} ročníkov</span><span>{years[years.length - 1]}</span></div>
      </section>
  } />;
}

export default function CaveHistory({ caves, metric, onMetricChange, onSelectCave }: Props & { metric: Metric; onMetricChange: (metric: Metric) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header = document.querySelector('#site-header');
    const container = containerRef.current;
    if (!container) return;
    if (!header) {
      container.style.setProperty('--history-header-height', '0px');
      return;
    }
    const update = () => container.style.setProperty('--history-header-height', `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(update);
    observer.observe(header);
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={containerRef} className={`cave-history ${metric === 'length' ? 'history-variant-b' : ''}`}>
      <div className="history-toolbar">
        <div><p className="history-eyebrow">HISTÓRIA SLOVENSKÉHO PODZEMIA</p><p>Publikované merania zo Spravodaja SSS, nie dátumy objavenia.</p></div>
        <div className="history-metric-switch" role="group" aria-label="Metrika prezentácie">
          <button aria-pressed={metric === 'length'} onClick={() => onMetricChange('length')}>Najdlhšie</button>
          <button aria-pressed={metric === 'depth'} onClick={() => onMetricChange('depth')}>Najhlbšie</button>
        </div>
      </div>
      {!caves.length ? <p className="history-loading">Načítavam archív…</p> : metric === 'length'
        ? <LengthPresentation caves={caves} onSelectCave={onSelectCave} />
        : <DepthExpedition caves={caves} onSelectCave={onSelectCave} />}
    </div>
  );
}
