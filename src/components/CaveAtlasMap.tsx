import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  Compass,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { CaveEntity } from '../types/caves';

interface CaveAtlasMapProps {
  caves: CaveEntity[];
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  metric: 'length' | 'depth';
  onMetricChange: (m: 'length' | 'depth') => void;
  selectedCaveId: string | null;
  onSelectCave: (cave: CaveEntity) => void;
}

const SLOVAKIA_BORDER_COORDS: Array<[number, number]> = [
  [16.84, 48.18], [16.95, 48.38], [16.96, 48.62], [17.15, 48.83],
  [17.48, 48.88], [17.85, 48.94], [18.08, 49.18], [18.35, 49.42],
  [18.85, 49.52], [19.45, 49.61], [19.72, 49.25], [20.12, 49.26],
  [20.48, 49.39], [20.92, 49.36], [21.38, 49.43], [21.88, 49.32],
  [22.36, 49.18], [22.56, 49.08], [22.38, 48.72], [22.15, 48.42],
  [21.75, 48.38], [21.25, 48.52], [20.88, 48.55], [20.45, 48.46],
  [20.15, 48.24], [19.72, 48.18], [19.25, 48.06], [18.74, 47.79],
  [18.18, 47.74], [17.65, 47.79], [17.18, 48.02], [16.99, 48.08],
  [16.84, 48.18],
];

// Colorful distinct karst regions in Slovakia
const KARST_ZONES: Array<{
  name: string;
  fill: string;
  stroke: string;
  labelPos: [number, number];
  coords: Array<[number, number]>;
}> = [
  {
    name: 'Nízke Tatry',
    fill: '#10b981',
    stroke: '#34d399',
    labelPos: [19.60, 48.93],
    coords: [[19.25, 49.05], [19.90, 49.05], [20.02, 48.86], [19.32, 48.86]],
  },
  {
    name: 'Vysoké a Belianske Tatry',
    fill: '#3b82f6',
    stroke: '#60a5fa',
    labelPos: [20.18, 49.24],
    coords: [[19.95, 49.29], [20.38, 49.29], [20.37, 49.15], [19.96, 49.15]],
  },
  {
    name: 'Západné Tatry',
    fill: '#06b6d4',
    stroke: '#22d3ee',
    labelPos: [19.74, 49.24],
    coords: [[19.56, 49.29], [19.94, 49.29], [19.94, 49.15], [19.56, 49.15]],
  },
  {
    name: 'Slovenský kras',
    fill: '#f59e0b',
    stroke: '#fbbf24',
    labelPos: [20.68, 48.55],
    coords: [[20.35, 48.70], [21.05, 48.71], [21.05, 48.45], [20.35, 48.45]],
  },
  {
    name: 'Spišsko-gemerský kras',
    fill: '#14b8a6',
    stroke: '#2dd4bf',
    labelPos: [20.16, 48.79],
    coords: [[19.92, 48.91], [20.42, 48.91], [20.38, 48.71], [19.92, 48.71]],
  },
  {
    name: 'Malé Karpaty',
    fill: '#a855f7',
    stroke: '#c084fc',
    labelPos: [17.36, 48.46],
    coords: [[17.06, 48.78], [17.85, 48.78], [17.52, 48.20], [17.04, 48.20]],
  },
  {
    name: 'Veľká Fatra',
    fill: '#84cc16',
    stroke: '#a3e635',
    labelPos: [19.04, 48.85],
    coords: [[18.85, 49.02], [19.22, 49.02], [19.22, 48.74], [18.85, 48.74]],
  },
  {
    name: 'Strážovské vrchy',
    fill: '#ec4899',
    stroke: '#f472b6',
    labelPos: [18.42, 48.94],
    coords: [[18.22, 49.08], [18.65, 49.08], [18.62, 48.82], [18.20, 48.82]],
  },
];

// Major Slovak rivers for geographical orientation
const RIVERS: Array<Array<[number, number]>> = [
  // Váh
  [[19.92, 49.04], [19.62, 49.08], [19.28, 49.09], [18.74, 49.22], [18.35, 49.12], [18.02, 48.89], [17.82, 48.59], [17.87, 48.18], [18.12, 47.76]],
  // Hron
  [[20.18, 48.85], [19.65, 48.81], [19.15, 48.73], [18.86, 48.58], [18.62, 48.24], [18.74, 47.82]],
  // Hornád
  [[20.15, 48.98], [20.56, 48.95], [20.92, 48.89], [21.26, 48.71], [21.30, 48.54]],
];

const LON_MIN = 16.65;
const LON_MAX = 22.75;
const LAT_MIN = 47.62;
const LAT_MAX = 49.72;
const SVG_W = 1000;
const SVG_H = 500;

function project(lon: number, lat: number): { x: number; y: number } {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * SVG_W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * SVG_H;
  return { x, y };
}

function unproject(x: number, y: number): { lon: number; lat: number } {
  const lon = LON_MIN + (x / SVG_W) * (LON_MAX - LON_MIN);
  const lat = LAT_MAX - (y / SVG_H) * (LAT_MAX - LAT_MIN);
  return { lon, lat };
}

export const CaveAtlasMap: React.FC<CaveAtlasMapProps> = ({
  caves,
  years,
  selectedYear,
  onYearChange,
  metric,
  onMetricChange,
  selectedCaveId,
  onSelectCave,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [hoveredCaveId, setHoveredCaveId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cursorGeo, setCursorGeo] = useState<{ lat: number; lon: number } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const pulseLayerRef = useRef<SVGGElement | null>(null);

  const earliestGlobalYear = years[0] || 2005;

  useEffect(() => {
    if (!isPlaying || years.length === 0) return;
    const timer = window.setInterval(() => {
      const idx = years.indexOf(selectedYear);
      const nextIdx = idx >= 0 && idx < years.length - 1 ? idx + 1 : 0;
      onYearChange(years[nextIdx]);
    }, 1700);
    return () => window.clearInterval(timer);
  }, [isPlaying, years, selectedYear, onYearChange]);

  // Distinct GSAP animations:
  // 1) VERY dramatic shockwave + beacon pop for NEW caves appearing in selectedYear
  // 2) Subtle gentle pulse for CHANGED existing caves
  useEffect(() => {
    if (!pulseLayerRef.current) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const newOuter = pulseLayerRef.current.querySelectorAll('.gsap-new-shockwave-outer');
    const newInner = pulseLayerRef.current.querySelectorAll('.gsap-new-shockwave-inner');
    const newPin = pulseLayerRef.current.querySelectorAll('.gsap-new-pin');
    const changeRings = pulseLayerRef.current.querySelectorAll('.gsap-change-subtle');

    gsap.killTweensOf([newOuter, newInner, newPin, changeRings]);

    if (newOuter.length > 0) {
      gsap.fromTo(
        newOuter,
        { attr: { r: 5 }, opacity: 1 },
        {
          attr: { r: 44 },
          opacity: 0,
          duration: 1.5,
          stagger: 0.06,
          ease: 'power2.out',
        }
      );
    }
    if (newInner.length > 0) {
      gsap.fromTo(
        newInner,
        { attr: { r: 3 }, opacity: 0.95 },
        {
          attr: { r: 28 },
          opacity: 0,
          duration: 1.15,
          delay: 0.14,
          stagger: 0.06,
          ease: 'power2.out',
        }
      );
    }
    if (newPin.length > 0) {
      gsap.fromTo(
        newPin,
        { scale: 2.1, transformOrigin: 'center center' },
        {
          scale: 1,
          duration: 0.9,
          stagger: 0.05,
          ease: 'elastic.out(1, 0.45)',
        }
      );
    }
    if (changeRings.length > 0) {
      gsap.fromTo(
        changeRings,
        { attr: { r: 6 }, opacity: 0.48 },
        {
          attr: { r: 16 },
          opacity: 0,
          duration: 0.95,
          stagger: 0.03,
          ease: 'power1.out',
        }
      );
    }
  }, [selectedYear, metric, onlyChanged]);

  const borderPath = useMemo(() => {
    return (
      SLOVAKIA_BORDER_COORDS.map(([lon, lat], i) => {
        const { x, y } = project(lon, lat);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ') + ' Z'
    );
  }, []);

  const riverPaths = useMemo(() => {
    return RIVERS.map((pts) =>
      pts
        .map(([lon, lat], i) => {
          const p = project(lon, lat);
          return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(' ')
    );
  }, []);

  const mappedCaves = useMemo(() => {
    return caves
      .map((cave) => {
        const sortedForMetric = [...cave.records]
          .filter((r) => (metric === 'length' ? r.lengthM != null && r.lengthM > 0 : r.depthM != null && r.depthM > 0))
          .sort((a, b) => a.year - b.year);

        const firstYearForCave = sortedForMetric[0]?.year;
        const exact = sortedForMetric.find((r) => r.year === selectedYear);
        const fallback = [...sortedForMetric].filter((r) => r.year <= selectedYear).pop();
        const rec = exact || fallback;
        if (!rec) return null;

        const val = metric === 'length' ? rec.lengthM : rec.depthM;
        if (val == null || val <= 0) return null;

        const isExact = rec.year === selectedYear;
        const isNewCave =
          isExact && firstYearForCave === selectedYear && selectedYear > earliestGlobalYear;
        const isChanged =
          !isNewCave &&
          isExact &&
          Boolean(metric === 'length' ? rec.isBoldLength : rec.isBoldDepth);
        const delta = isExact ? (metric === 'length' ? rec.deltaLengthM : rec.deltaDepthM) : null;

        if (onlyChanged && !isChanged && !isNewCave) return null;

        const pos = project(cave.lon, cave.lat);
        return {
          cave,
          rec,
          val,
          isNewCave,
          isChanged,
          delta,
          x: pos.x,
          y: pos.y,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.val - b.val);
  }, [caves, selectedYear, metric, onlyChanged, earliestGlobalYear]);

  const newCavesCount = mappedCaves.filter((m) => m.isNewCave).length;
  const changedCount = mappedCaves.filter((m) => m.isChanged).length;
  const maxVal = Math.max(...mappedCaves.map((m) => m.val), 1);

  const hoveredItem = mappedCaves.find((m) => m.cave.id === hoveredCaveId) || null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * SVG_W;
    const relY = ((e.clientY - rect.top) / rect.height) * SVG_H;

    const worldX = (relX - SVG_W / 2 - pan.x) / zoom + SVG_W / 2;
    const worldY = (relY - SVG_H / 2 - pan.y) / zoom + SVG_H / 2;
    const geo = unproject(worldX, worldY);
    setCursorGeo(geo);

    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).closest('[data-cave-pin="true"]')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 4) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoom((z) => Math.min(4.5, Math.max(1, Number((z * factor).toFixed(2)))));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <section id="atlas" className="mx-auto max-w-[1380px] px-6 py-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-[#e1e4e8] pb-6">
        <div>
          <p className="text-xs font-medium tracking-wide text-[#c13100]">
            Interaktívna priestorová vizualizácia · Krasové územia SR
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#1a1e23] sm:text-3xl text-balance">
            Farebná mapa Slovenska a animácia objavov v čase
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-[#e1e4e8] bg-white p-1">
            <button
              type="button"
              onClick={() => onMetricChange('length')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                metric === 'length'
                  ? 'bg-[#1a1e23] text-white'
                  : 'text-[#5a6370] hover:text-[#1a1e23]'
              }`}
            >
              Najdlhšie (m)
            </button>
            <button
              type="button"
              onClick={() => onMetricChange('depth')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                metric === 'depth'
                  ? 'bg-[#1a1e23] text-white'
                  : 'text-[#5a6370] hover:text-[#1a1e23]'
              }`}
            >
              Najhlbšie (m)
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOnlyChanged((v) => !v)}
            className={`rounded-lg border px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              onlyChanged
                ? 'border-[#c13100] bg-[#c13100] text-white'
                : 'border-[#e1e4e8] bg-white text-[#1a1e23] hover:border-[#1a1e23]'
            }`}
          >
            {onlyChanged ? 'Len nové a zmenené' : 'Filtrovať prírastky'}
          </button>
        </div>
      </div>

      {/* Main Map Stage */}
      <div className="mt-6 overflow-hidden rounded-xl border border-[#2a3038] bg-[#141d24] text-white">
        {/* Map Top HUD */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#26323d] bg-[#1a1e23] px-5 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-[#c8cfd8]">
            <span className="font-semibold text-white">Rok {selectedYear}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">Lokalít: {mappedCaves.length}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular font-bold text-[#ff6b35]">
              Nové jaskyne v rebríčku: {newCavesCount}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular text-[#fbbc05]">
              Prírastky existujúcich: {changedCount}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-flex items-center gap-1.5 font-mono-tabular text-[11px] text-[#98a2b3]">
              <Compass className="h-3.5 w-3.5 text-[#fbbc05]" aria-hidden="true" />
              {cursorGeo
                ? `${cursorGeo.lat.toFixed(3)}° N, ${cursorGeo.lon.toFixed(3)}° E`
                : '48.880° N, 19.680° E'}
            </span>
            <div className="flex items-center gap-1 rounded-md border border-[#2f3640] bg-[#232830] p-0.5">
              <button
                type="button"
                aria-label="Priblížiť mapu"
                onClick={() => setZoom((z) => Math.min(4.5, Number((z + 0.4).toFixed(2))))}
                className="rounded p-1.5 text-[#c8cfd8] hover:bg-[#2f3640] hover:text-white"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Oddialiť mapu"
                onClick={() => setZoom((z) => Math.max(1, Number((z - 0.4).toFixed(2))))}
                className="rounded p-1.5 text-[#c8cfd8] hover:bg-[#2f3640] hover:text-white"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Obnoviť zobrazenie mapy"
                onClick={resetView}
                className="rounded p-1.5 text-[#c8cfd8] hover:bg-[#2f3640] hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Colorful Topographic SVG Canvas */}
        <div className="relative h-[460px] sm:h-[530px] w-full select-none overflow-hidden bg-[#101820]">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className={`h-full w-full ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              setIsDragging(false);
              setHoveredCaveId(null);
            }}
            onWheel={handleWheel}
          >
            <defs>
              <pattern id="topo-grid" width="45" height="45" patternUnits="userSpaceOnUse">
                <path
                  d="M 45 0 L 0 0 0 45"
                  fill="none"
                  stroke="#1f2d3a"
                  strokeWidth="0.7"
                />
              </pattern>
              <linearGradient id="slovakia-relief" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1b3a34" />
                <stop offset="50%" stopColor="#1e3f35" />
                <stop offset="100%" stopColor="#263845" />
              </linearGradient>
              <radialGradient id="new-cave-flare" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ff5e1a" stopOpacity="0.85" />
                <stop offset="45%" stopColor="#fbbc05" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#fbbc05" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="change-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fbbc05" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#fbbc05" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect width={SVG_W} height={SVG_H} fill="url(#topo-grid)" />

            <g
              transform={`translate(${SVG_W / 2 + pan.x}, ${SVG_H / 2 + pan.y}) scale(${zoom}) translate(${-SVG_W / 2}, ${-SVG_H / 2})`}
            >
              {/* Colorful Slovakia Territory with subtle outer glow */}
              <path
                d={borderPath}
                fill="url(#slovakia-relief)"
                stroke="#4ade80"
                strokeOpacity="0.45"
                strokeWidth={2 / zoom}
                strokeLinejoin="round"
              />

              {/* Major Slovak Rivers */}
              {riverPaths.map((d, idx) => (
                <path
                  key={idx}
                  d={d}
                  fill="none"
                  stroke="#38bdf8"
                  strokeOpacity="0.35"
                  strokeWidth={1.6 / zoom}
                  strokeLinecap="round"
                />
              ))}

              {/* Colored Karst Zones */}
              {KARST_ZONES.map((zone) => {
                const pts = zone.coords
                  .map(([lon, lat]) => {
                    const p = project(lon, lat);
                    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  })
                  .join(' ');
                const lp = project(zone.labelPos[0], zone.labelPos[1]);
                return (
                  <g key={zone.name}>
                    <polygon
                      points={pts}
                      fill={zone.fill}
                      fillOpacity="0.2"
                      stroke={zone.stroke}
                      strokeOpacity="0.65"
                      strokeWidth={1 / zoom}
                      strokeDasharray={`${4 / zoom} ${2.5 / zoom}`}
                    />
                    <text
                      x={lp.x}
                      y={lp.y + 18 / zoom}
                      textAnchor="middle"
                      fill={zone.stroke}
                      fillOpacity="0.88"
                      fontSize={9.5 / zoom}
                      fontWeight={600}
                      className="pointer-events-none"
                    >
                      {zone.name}
                    </text>
                  </g>
                );
              })}

              {/* GSAP Animated Pulse Layer: Dramatic for NEW caves, subtle for CHANGED caves */}
              <g ref={pulseLayerRef}>
                {mappedCaves
                  .filter((m) => m.isChanged)
                  .map((m) => (
                    <circle
                      key={`chg-${m.cave.id}-${selectedYear}`}
                      className="gsap-change-subtle pointer-events-none"
                      cx={m.x}
                      cy={m.y}
                      r={7}
                      fill="none"
                      stroke="#fbbc05"
                      strokeWidth={1.2 / zoom}
                    />
                  ))}

                {mappedCaves
                  .filter((m) => m.isNewCave)
                  .map((m) => (
                    <g key={`new-${m.cave.id}-${selectedYear}`} className="pointer-events-none">
                      <circle
                        className="gsap-new-shockwave-outer"
                        cx={m.x}
                        cy={m.y}
                        r={8}
                        fill="none"
                        stroke="#ff5e1a"
                        strokeWidth={2.6 / zoom}
                      />
                      <circle
                        className="gsap-new-shockwave-inner"
                        cx={m.x}
                        cy={m.y}
                        r={5}
                        fill="none"
                        stroke="#fbbc05"
                        strokeWidth={2 / zoom}
                      />
                    </g>
                  ))}

                {/* Cave Markers */}
                {mappedCaves.map((m) => {
                  const isSelected = m.cave.id === selectedCaveId;
                  const isHovered = m.cave.id === hoveredCaveId;
                  const ratio = Math.sqrt(m.val / maxVal);
                  const baseRadius = (4.2 + ratio * 7.2) / Math.sqrt(zoom);

                  const fillColor = m.isNewCave
                    ? '#ff5e1a'
                    : m.isChanged
                    ? '#fbbc05'
                    : m.rec.isUnverified
                    ? '#f43f5e'
                    : '#cbd5e1';

                  return (
                    <g
                      key={m.cave.id}
                      data-cave-pin="true"
                      className={`cursor-pointer ${m.isNewCave ? 'gsap-new-pin' : ''}`}
                      onMouseEnter={() => setHoveredCaveId(m.cave.id)}
                      onMouseLeave={() => setHoveredCaveId(null)}
                      onClick={() => onSelectCave(m.cave)}
                    >
                      {m.isNewCave && (
                        <circle
                          cx={m.x}
                          cy={m.y}
                          r={baseRadius * 3.4}
                          fill="url(#new-cave-flare)"
                          className="pointer-events-none"
                        />
                      )}
                      {m.isChanged && !m.isNewCave && (
                        <circle
                          cx={m.x}
                          cy={m.y}
                          r={baseRadius * 1.9}
                          fill="url(#change-glow)"
                          className="pointer-events-none"
                        />
                      )}

                      <circle
                        cx={m.x}
                        cy={m.y}
                        r={
                          m.isNewCave
                            ? baseRadius * 1.45
                            : isSelected || isHovered
                            ? baseRadius * 1.3
                            : baseRadius
                        }
                        fill={fillColor}
                        fillOpacity={m.isNewCave || m.isChanged || isSelected ? 0.98 : 0.78}
                        stroke={m.isNewCave || isSelected ? '#ffffff' : '#101820'}
                        strokeWidth={(m.isNewCave || isSelected ? 2.2 : 1.1) / zoom}
                      />

                      {(m.isNewCave ||
                        m.val >= maxVal * 0.45 ||
                        isSelected ||
                        isHovered ||
                        zoom >= 1.8) && (
                        <text
                          x={m.x}
                          y={m.y - baseRadius * (m.isNewCave ? 1.8 : 1.25) - 3 / zoom}
                          textAnchor="middle"
                          fill={m.isNewCave ? '#ff9e75' : m.isChanged ? '#fbbc05' : '#e2e8f0'}
                          fontSize={(m.isNewCave ? 11 : 9.8) / Math.sqrt(zoom)}
                          fontWeight={m.isNewCave || m.isChanged ? 700 : 500}
                          className="pointer-events-none"
                        >
                          {m.isNewCave ? `NOVÁ: ${m.cave.name}` : m.cave.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>

          {/* Hover Tooltip Overlay */}
          {hoveredItem && (
            <div className="pointer-events-none absolute right-4 top-4 w-76 rounded-lg border border-[#323a45] bg-[#1a1e23]/95 p-3.5 shadow-xl backdrop-blur">
              <div className="flex items-start justify-between gap-2">
                <h3
                  className={`text-sm ${
                    hoveredItem.isNewCave
                      ? 'font-bold text-[#ff7a45]'
                      : hoveredItem.isChanged
                      ? 'font-bold text-[#fbbc05]'
                      : 'font-semibold text-white'
                  }`}
                >
                  {hoveredItem.cave.name}
                </h3>
                <span className="font-mono-tabular text-xs text-[#98a2b3]">{selectedYear}</span>
              </div>
              <p className="mt-1 text-xs text-[#98a2b3]">
                {hoveredItem.cave.karstRegion} · {hoveredItem.cave.subUnit}
              </p>
              <div className="mt-3 flex items-baseline justify-between border-t border-[#2a3038] pt-2.5">
                <span className="font-mono-tabular text-lg font-bold text-white">
                  {hoveredItem.val.toLocaleString('sk-SK')} m
                  {hoveredItem.rec.secondarySurveyNote
                    ? ` ${hoveredItem.rec.secondarySurveyNote}`
                    : hoveredItem.rec.isUnverified
                    ? '*'
                    : ''}
                </span>
                {hoveredItem.isNewCave ? (
                  <span className="font-mono-tabular text-xs font-bold text-[#ff7a45]">
                    Nový zápis v roku {selectedYear}
                  </span>
                ) : hoveredItem.delta != null && hoveredItem.delta > 0 ? (
                  <span className="font-mono-tabular text-xs font-bold text-emerald-400">
                    +{hoveredItem.delta.toLocaleString('sk-SK')} m
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[11px] text-[#748091]">
                Kliknutím otvoríte detailný profil a články na bibliografia.sss.sk
              </p>
            </div>
          )}

          {/* Legend */}
          <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap items-center gap-4 rounded-md border border-[#2a3038] bg-[#1a1e23]/90 px-3.5 py-2 text-[11px] text-[#c8cfd8]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#ff9e75]">
              <span className="h-3 w-3 rounded-full bg-[#ff5e1a] ring-2 ring-white/80" />
              Nová jaskyňa v roku {selectedYear}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#fbbc05]" />
              Zmena parametrov
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#cbd5e1]" />
              Bez zmeny
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f43f5e]" />
              Nepotvrdený údaj (*)
            </span>
          </div>
        </div>

        {/* Timeline Animation Controls */}
        <div className="flex flex-col gap-4 border-t border-[#26323d] bg-[#1a1e23] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="inline-flex items-center gap-2 rounded-md bg-[#fbbc05] px-4 py-2 text-xs font-semibold text-[#1a1e23] whitespace-nowrap shrink-0 transition-colors hover:bg-[#eab004]"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPlaying ? 'Pozastaviť animáciu' : 'Prehrať vývoj v čase'}
            </button>

            <span className="hidden md:inline text-xs text-[#98a2b3]">
              Výrazná rázová vlna označuje nové jaskyne v rebríčku, jemný pulz existujúce prírastky
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {years.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  onYearChange(yr);
                }}
                className={`rounded-md px-2.5 py-1.5 font-mono-tabular text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  yr === selectedYear
                    ? 'bg-white text-[#1a1e23]'
                    : 'bg-[#282e37] text-[#c8cfd8] hover:bg-[#343c47] hover:text-white'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedCaveId && (
        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              const found = caves.find((c) => c.id === selectedCaveId);
              if (found) onSelectCave(found);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#c13100] hover:underline"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Zobraziť otvorený detail jaskyne
          </button>
        </div>
      )}
    </section>
  );
};
