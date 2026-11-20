import React, { useMemo } from 'react';
import { Map as MapIcon, Mountain, ShieldCheck } from 'lucide-react';
import { SLOVAKIA_COUNTRY_PATH, SLOVAKIA_REGIONS } from '../data/slovakiaRegions';
import type { CaveEntity } from '../types/caves';

interface CaveAtlasMapProps {
  caves: CaveEntity[];
}

const REGION_COLORS = [
  '#d5b68f',
  '#c7d2a6',
  '#a8c1ad',
  '#dec99c',
  '#a6c4bd',
  '#c9ae91',
  '#a9bdca',
  '#d8bc9c',
];

const MAP_SCALE = 195;
const MAP_X_ORIGIN = 95;
const MAP_Y_ORIGIN = 88;
const MAP_LATITUDE_CENTER = 48.7;
const MAP_LATITUDE_TOP = 49.65;
const MAP_LONGITUDE_LEFT = 16.75;

const projectPoint = (longitude: number, latitude: number) => ({
  x:
    MAP_X_ORIGIN +
    (longitude - MAP_LONGITUDE_LEFT) *
      MAP_SCALE *
      Math.cos((MAP_LATITUDE_CENTER * Math.PI) / 180),
  y: MAP_Y_ORIGIN + (MAP_LATITUDE_TOP - latitude) * MAP_SCALE,
});

const createRiverPath = (coordinates: number[][]) => {
  const points = coordinates.map(([longitude, latitude]) =>
    projectPoint(longitude, latitude)
  );
  const first = points[0];
  if (!first) return '';

  let path = `M${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index];
    const next = points[index + 1];
    if (!previous || !next) continue;

    const before = points[index - 1] ?? previous;
    const after = points[index + 2] ?? next;
    const control1 = {
      x: previous.x + (next.x - before.x) / 6,
      y: previous.y + (next.y - before.y) / 6,
    };
    const control2 = {
      x: next.x - (after.x - previous.x) / 6,
      y: next.y - (after.y - previous.y) / 6,
    };
    path += `C${control1.x.toFixed(1)} ${control1.y.toFixed(1)} ${control2.x.toFixed(1)} ${control2.y.toFixed(1)} ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }
  return path;
};

const RIVERS = [
  {
    name: 'Váh',
    points: [
      [19.8, 49.2],
      [19.4, 49.1],
      [19.0, 49.2],
      [18.7, 49.2],
      [18.5, 49.0],
      [18.1, 48.9],
      [17.8, 48.6],
      [17.5, 48.3],
      [17.1, 47.9],
    ],
    label: [386, 211],
  },
  {
    name: 'Hron',
    points: [
      [19.8, 48.9],
      [19.5, 48.8],
      [19.2, 48.7],
      [19.0, 48.5],
      [18.8, 48.3],
      [18.6, 48.1],
      [18.3, 47.8],
    ],
    label: [392, 330],
  },
  {
    name: 'Hornád',
    points: [
      [20.0, 48.9],
      [20.3, 48.8],
      [20.7, 48.7],
      [21.0, 48.7],
      [21.3, 48.7],
    ],
    label: [575, 262],
  },
];

const CITIES = [
  { name: 'Bratislava', longitude: 17.1077, latitude: 48.1486, dx: -8, dy: 17, anchor: 'end' },
  { name: 'Trnava', longitude: 17.5872, latitude: 48.3774, dx: 8, dy: 15, anchor: 'start' },
  { name: 'Nitra', longitude: 18.0764, latitude: 48.3064, dx: 8, dy: 16, anchor: 'start' },
  { name: 'Trenčín', longitude: 18.0444, latitude: 48.8945, dx: 8, dy: -8, anchor: 'start' },
  { name: 'Žilina', longitude: 18.7394, latitude: 49.2232, dx: -8, dy: -9, anchor: 'end' },
  { name: 'Banská Bystrica', longitude: 19.1462, latitude: 48.7362, dx: 8, dy: 15, anchor: 'start' },
  { name: 'Poprad', longitude: 20.297, latitude: 49.058, dx: -8, dy: 17, anchor: 'end' },
  { name: 'Prešov', longitude: 21.2391, latitude: 48.9984, dx: -8, dy: -8, anchor: 'end' },
  { name: 'Košice', longitude: 21.2611, latitude: 48.7161, dx: 8, dy: 15, anchor: 'start' },
] as const;

const KARST_LABELS = [
  { name: 'Malé Karpaty', x: 174, y: 323 },
  { name: 'Strážovské vrchy', x: 290, y: 222 },
  { name: 'Veľká Fatra', x: 390, y: 232 },
  { name: 'Nízke Tatry', x: 465, y: 278 },
  { name: 'Západné Tatry', x: 487, y: 147 },
  { name: 'Vysoké Tatry', x: 613, y: 159 },
  { name: 'Spišsko-gemerský kras', x: 607, y: 316 },
  { name: 'Slovenský kras', x: 700, y: 363 },
];

export const CaveAtlasMap: React.FC<CaveAtlasMapProps> = ({ caves }) => {
  const regionalCounts = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const cave of caves) {
      const names = groups.get(cave.karstRegion) || [];
      names.push(cave.name);
      groups.set(cave.karstRegion, names);
    }
    return Array.from(groups, ([region, names]) => ({
      region,
      names: names.sort((a, b) => a.localeCompare(b, 'sk')),
    })).sort(
      (a, b) => b.names.length - a.names.length || a.region.localeCompare(b.region, 'sk')
    );
  }, [caves]);

  return (
    <section id="map" className="mx-auto max-w-[1380px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="border-b border-[#e1e4e8] pb-6">
        <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-[#c13100]">
          <Mountain className="h-4 w-4" aria-hidden="true" />
          Krasové oblasti Slovenska
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#1a1e23] sm:text-3xl">
          Mapa jaskynných oblastí
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5a6370]">
          Kartografický prehľad krajov, miest a hlavných tokov s orientačným vyznačením krasových
          oblastí. Polohy jaskýň, vchodov ani GPS súradnice mapa nezobrazuje.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="self-start overflow-hidden rounded-2xl bg-[#e9e0cd] p-4 shadow-[0_16px_40px_rgba(58,48,34,0.14)] sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3 text-[#3d493e]">
            <div className="inline-flex items-center gap-2 text-sm font-semibold">
              <MapIcon className="h-4 w-4 text-[#a75c36]" aria-hidden="true" />
              Krasové oblasti
            </div>
            <span className="text-xs text-[#756d5d]">kraje · mestá · rieky</span>
          </div>

          <svg
            viewBox="0 0 900 560"
            role="img"
            aria-label="Detailná mapa Slovenska s krajskými hranicami, vybranými mestami a riekami; polohy jaskýň nie sú zobrazené"
            className="h-auto w-full rounded-xl"
          >
            <defs>
              <linearGradient id="slovakia-map-paper" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f7f1e4" />
                <stop offset="100%" stopColor="#eee4ce" />
              </linearGradient>
              <clipPath id="slovakia-map-country-clip">
                <path d={SLOVAKIA_COUNTRY_PATH} />
              </clipPath>
              <pattern id="slovakia-map-grain" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="3" r="0.7" fill="#7e745c" fillOpacity="0.12" />
                <circle cx="18" cy="17" r="0.55" fill="#7e745c" fillOpacity="0.1" />
              </pattern>
            </defs>
            <rect width="900" height="560" fill="url(#slovakia-map-paper)" />
            <rect
              x="16"
              y="16"
              width="868"
              height="528"
              rx="12"
              fill="url(#slovakia-map-grain)"
              stroke="#b8aa8e"
              strokeWidth="1"
            />
            <text
              x="42"
              y="55"
              fill="#334b40"
              fontFamily="Georgia, serif"
              fontSize="25"
              fontWeight="700"
              letterSpacing="2.5"
            >
              SLOVENSKO
            </text>
            <text
              x="856"
              y="51"
              fill="#82745f"
              fontFamily="system-ui, sans-serif"
              fontSize="10"
              fontWeight="700"
              letterSpacing="1.5"
              textAnchor="end"
            >
              KRASOVÉ OBLASTI · KARTOGRAFICKÝ PREHĽAD
            </text>

            <g clipPath="url(#slovakia-map-country-clip)">
              <rect x="90" y="88" width="770" height="390" fill="#dce2c9" />
              {SLOVAKIA_REGIONS.map((region, index) => (
                <path
                  key={region.id}
                  d={region.path}
                  fill={REGION_COLORS[index]}
                  fillOpacity="0.76"
                  stroke="#f7f0e2"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                  fillRule="evenodd"
                />
              ))}
              {[
                'M190 179 C275 153 319 177 370 158 S475 157 530 177 642 160 754 193',
                'M148 239 C240 211 300 227 357 201 S485 202 545 224 666 207 815 243',
                'M121 300 C212 270 299 288 374 255 S507 257 580 283 699 260 843 304',
                'M142 364 C243 327 307 350 395 314 S539 316 613 346 728 329 830 367',
                'M193 421 C286 390 362 403 443 378 S584 381 660 406 748 392 809 416',
              ].map((line) => (
                <path
                  key={line}
                  d={line}
                  fill="none"
                  stroke="#657f69"
                  strokeOpacity="0.22"
                  strokeWidth="1"
                />
              ))}
            </g>

            {SLOVAKIA_REGIONS.map((region) => (
              <path
                key={`${region.id}-border`}
                d={region.path}
                fill="none"
                stroke="#fff9eb"
                strokeOpacity="0.96"
                strokeWidth="1.7"
                strokeLinejoin="round"
                fillRule="evenodd"
              />
            ))}
            <path
              d={SLOVAKIA_COUNTRY_PATH}
              fill="none"
              stroke="#52634f"
              strokeWidth="2.4"
              strokeLinejoin="round"
              fillRule="evenodd"
            />

            <g clipPath="url(#slovakia-map-country-clip)">
              {RIVERS.map(({ name, points }) => (
                <path
                  key={name}
                  d={createRiverPath(points)}
                  fill="none"
                  stroke="#59899a"
                  strokeWidth="2.2"
                  strokeOpacity="0.9"
                />
              ))}
            </g>
            {RIVERS.map(({ name, label }) => (
              <text
                key={`${name}-label`}
                x={label[0]}
                y={label[1]}
                fill="#487485"
                fontFamily="Georgia, serif"
                fontSize="11"
                fontStyle="italic"
                paintOrder="stroke"
                stroke="#f3eddf"
                strokeWidth="3"
              >
                {name}
              </text>
            ))}

            <g
              fill="#5b6552"
              fontFamily="system-ui, sans-serif"
              fontSize="9"
              fontWeight="700"
              letterSpacing="0.7"
              textAnchor="middle"
            >
              {KARST_LABELS.map(({ name, x, y }) => (
                <text
                  key={name}
                  x={x}
                  y={y}
                  paintOrder="stroke"
                  stroke="#efe8d8"
                  strokeWidth="3"
                  strokeLinejoin="round"
                >
                  {name.toLocaleUpperCase('sk')}
                </text>
              ))}
            </g>

            {CITIES.map(({ name, longitude, latitude, dx, dy, anchor }) => {
              const { x, y } = projectPoint(longitude, latitude);
              return (
                <g key={name}>
                  <circle cx={x} cy={y} r="3.1" fill="#fff9eb" stroke="#384c3f" strokeWidth="1.8" />
                  <text
                    x={x + dx}
                    y={y + dy}
                    fill="#36443b"
                    fontFamily="system-ui, sans-serif"
                    fontSize="10"
                    fontWeight="700"
                    textAnchor={anchor}
                    paintOrder="stroke"
                    stroke="#f4ecda"
                    strokeWidth="3"
                    strokeLinejoin="round"
                  >
                    {name}
                  </text>
                </g>
              );
            })}

            <text
              x="42"
              y="508"
              fill="#6c6657"
              fontFamily="system-ui, sans-serif"
              fontSize="10"
            >
              Krajské mestá a hlavné rieky sú uvedené na orientáciu.
            </text>
            <text
              x="856"
              y="508"
              fill="#6c6657"
              fontFamily="system-ui, sans-serif"
              fontSize="10"
              textAnchor="end"
            >
              Poloha jaskýň ani vchodov nie je zobrazená.
            </text>
            <line x1="42" y1="522" x2="858" y2="522" stroke="#b8aa8e" strokeWidth="1" />
            <text
              x="42"
              y="538"
              fill="#82745f"
              fontFamily="system-ui, sans-serif"
              fontSize="9"
            >
              Hranice krajov: Eurostat GISCO · NUTS 2024 (03M) · kartograficky upravené
            </text>
          </svg>
        </div>

        <aside className="rounded-2xl bg-white p-5 shadow-[0_12px_30px_rgba(26,30,35,0.08)] sm:p-6">
          <div className="flex items-start gap-3 border-b border-[#edf0f3] pb-4">
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-800">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-base font-bold text-[#1a1e23]">
                Počty podľa oblasti
              </h2>
              <p className="mt-1 text-xs text-[#5a6370]">
                {caves.length} evidovaných lokalít, bez zobrazenia ich polohy
              </p>
            </div>
          </div>

          <ul className="mt-2 divide-y divide-[#edf0f3]">
            {regionalCounts.map(({ region, names }, index) => (
              <li key={region} className="flex items-center justify-between gap-4 py-3">
                <details className="min-w-0 flex-1">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-[#343c47]">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: REGION_COLORS[index % REGION_COLORS.length] }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{region}</span>
                    </span>
                    <span className="font-mono-tabular text-sm font-bold text-[#1a1e23]">
                      {names.length}
                    </span>
                  </summary>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto border-l border-[#d5d9e0] pl-5 text-xs text-[#5a6370]">
                    {names.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
};
