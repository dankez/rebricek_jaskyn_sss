import React, { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, FileText, X } from 'lucide-react';
import type { BibliographyArticle, CaveEntity } from '../types/caves';
import { buildBibliografiaUrl } from '../utils/biblioUrl';

interface CaveDetailDrawerProps {
  cave: CaveEntity | null;
  activeMetric?: 'length' | 'depth';
  onClose: () => void;
}

interface ChartPoint {
  year: number;
  value: number;
  isChanged: boolean;
  delta: number | null;
}

const MetricTrajectoryChart: React.FC<{
  title: string;
  subtitle: string;
  data: ChartPoint[];
  strokeColor: string;
}> = ({ title, subtitle, data, strokeColor }) => {
  if (data.length === 0) return null;

  const chartW = 540;
  const chartH = 160;
  const padX = 42;
  const padY = 24;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const minVal = Math.min(...data.map((d) => d.value), maxVal);
  const minSpan = maxVal < 500 ? 10 : 100;
  const range = Math.max(maxVal - minVal, minSpan);

  const points = data.map((d, i) => {
    const x =
      data.length === 1
        ? chartW / 2
        : padX + (i / (data.length - 1)) * (chartW - padX * 2);
    const y = chartH - padY - ((d.value - minVal) / range) * (chartH - padY * 2);
    return { x, y, point: d };
  });

  const polylineStr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-bold text-[#1a1e23]">{title}</h3>
        <span className="text-[11px] text-[#5a6370]">{subtitle}</span>
      </div>
      <div className="mt-2.5 rounded-lg border border-[#e1e4e8] bg-[#f8f9fb] p-3">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto overflow-visible">
          <line
            x1={padX}
            y1={chartH - padY}
            x2={chartW - padX}
            y2={chartH - padY}
            stroke="#d5d9e0"
            strokeWidth="1"
          />
          {points.length > 1 && (
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              points={polylineStr}
            />
          )}
          {points.map((pt) => {
            const isPositive = pt.point.delta != null && pt.point.delta > 0;
            return (
              <g key={pt.point.year}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isPositive || pt.point.isChanged ? 5 : 3.5}
                  fill={isPositive ? '#10b981' : pt.point.isChanged ? '#fbbc05' : '#1a1e23'}
                  stroke="#1a1e23"
                  strokeWidth="1.5"
                />
                <text
                  x={pt.x}
                  y={chartH - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#5a6370"
                  className="font-mono-tabular"
                >
                  {pt.point.year}
                </text>
                <text
                  x={pt.x}
                  y={pt.y - 9}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight={isPositive || pt.point.isChanged ? 700 : 500}
                  fill={isPositive ? '#047857' : '#1a1e23'}
                  className="font-mono-tabular"
                >
                  {pt.point.value.toLocaleString('sk-SK')}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export const CaveDetailDrawer: React.FC<CaveDetailDrawerProps> = ({
  cave,
  activeMetric = 'length',
  onClose,
}) => {
  const [articles, setArticles] = useState<BibliographyArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  useEffect(() => {
    if (!cave) return;
    let cancelled = false;
    setLoadingArticles(true);

    // Search bibliografia.sss.sk via our backend proxy using core cave name
    const shortQuery = cave.name.split('–')[0].trim();
    fetch(`/api/bibliography?q=${encodeURIComponent(shortQuery)}&limit=6`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setArticles(Array.isArray(data.articles) ? data.articles : []);
        }
      })
      .catch(() => {
        if (!cancelled) setArticles([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingArticles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cave]);

  if (!cave) return null;

  const sortedRecords = [...cave.records].sort((a, b) => a.year - b.year);
  const latest = sortedRecords[sortedRecords.length - 1];
  const latestLengthRec = [...sortedRecords].reverse().find((r) => r.lengthM != null && r.lengthM > 0);
  const latestDepthRec = [...sortedRecords].reverse().find((r) => r.depthM != null && r.depthM > 0);

  const lengthChartData: ChartPoint[] = sortedRecords
    .filter((r): r is typeof r & { lengthM: number } => r.lengthM != null && r.lengthM > 0)
    .map((r) => ({
      year: r.year,
      value: r.lengthM,
      isChanged: Boolean(r.isBoldLength),
      delta: r.deltaLengthM ?? null,
    }));

  const depthChartData: ChartPoint[] = sortedRecords
    .filter((r): r is typeof r & { depthM: number } => r.depthM != null && r.depthM > 0)
    .map((r) => ({
      year: r.year,
      value: r.depthM,
      isChanged: Boolean(r.isBoldDepth),
      delta: r.deltaDepthM ?? null,
    }));

  const hasLengthChart = lengthChartData.length > 0;
  const hasDepthChart = depthChartData.length > 0;
  const biblioSearchUrl = buildBibliografiaUrl(cave.name);

  const lengthChartNode = hasLengthChart ? (
    <MetricTrajectoryChart
      key="chart-length"
      title="Vývoj dĺžky v čase (m)"
      subtitle={`${lengthChartData.length} ${lengthChartData.length === 1 ? 'záznam' : lengthChartData.length < 5 ? 'záznamy' : 'záznamov'}`}
      data={lengthChartData}
      strokeColor="#c13100"
    />
  ) : null;

  const depthChartNode = hasDepthChart ? (
    <MetricTrajectoryChart
      key="chart-depth"
      title="Vývoj hĺbky v čase (m)"
      subtitle={`${depthChartData.length} ${depthChartData.length === 1 ? 'záznam' : depthChartData.length < 5 ? 'záznamy' : 'záznamov'}`}
      data={depthChartData}
      strokeColor="#0369a1"
    />
  ) : null;

  const orderedCharts =
    activeMetric === 'depth'
      ? [depthChartNode, lengthChartNode].filter(Boolean)
      : [lengthChartNode, depthChartNode].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#1a1e23]/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <aside
        className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white text-[#1a1e23] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e1e4e8] bg-[#1a1e23] px-6 py-5 text-white">
          <div>
            <p className="text-xs font-medium text-[#fbbc05]">
              {cave.karstRegion} · {cave.subUnit}
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
              {cave.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavrieť detail jaskyne"
            className="rounded-md p-2 text-[#c8cfd8] hover:bg-[#2a3038] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-8 p-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-4 border-b border-[#e1e4e8] pb-6">
            <div>
              <p className="text-xs text-[#5a6370]">Aktuálna dĺžka</p>
              <p className="mt-1 font-mono-tabular text-xl font-bold text-[#1a1e23]">
                {latest?.lengthM != null
                  ? `${latest.lengthM.toLocaleString('sk-SK')} m`
                  : latestLengthRec?.lengthM != null
                  ? `${latestLengthRec.lengthM.toLocaleString('sk-SK')} m`
                  : '—'}
                {latest?.isUnverified ? '*' : ''}
              </p>
              {latest?.lengthM == null && latestLengthRec && (
                <p className="mt-0.5 text-[11px] text-[#5a6370]">
                  posledný zápis {latestLengthRec.year}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-[#5a6370]">Vertikálne rozpätie</p>
              <p className="mt-1 font-mono-tabular text-xl font-bold text-[#1a1e23]">
                {latest?.depthM != null
                  ? `${latest.depthM.toLocaleString('sk-SK')} m`
                  : latestDepthRec?.depthM != null
                  ? `${latestDepthRec.depthM.toLocaleString('sk-SK')} m`
                  : '—'}
              </p>
              {latest?.depthM == null && latestDepthRec && (
                <p className="mt-0.5 text-[11px] text-[#5a6370]">
                  posledný zápis {latestDepthRec.year}
                </p>
              )}
            </div>
          </div>

          {/* Description & External Links */}
          <div>
            <p className="text-sm leading-relaxed text-[#343c47]">{cave.description}</p>
            {cave.aliases && cave.aliases.length > 0 && (
              <p className="mt-2 text-xs text-[#5a6370]">
                Súčasti / súvisiace lokality: {cave.aliases.join(', ')}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={biblioSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#1a1e23] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2a3038]"
              >
                <BookOpen className="h-3.5 w-3.5 text-[#fbbc05]" />
                Vyhľadať na bibliografia.sss.sk
                <ExternalLink className="h-3 w-3 opacity-70" />
              </a>
              <a
                href={cave.sssUrl || 'https://sss.sk/category/rebricky-jaskyn/'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#e1e4e8] bg-[#f4f5f7] px-3.5 py-2 text-xs font-semibold text-[#1a1e23] transition-colors hover:border-[#1a1e23]"
              >
                Oficiálny rebríček sss.sk
                <ExternalLink className="h-3 w-3 opacity-70" />
              </a>
            </div>
          </div>

          {/* SVG Historical Length & Depth Trajectories */}
          {orderedCharts.length > 0 && (
            <div className="space-y-6">{orderedCharts}</div>
          )}

          {/* Chronological Table */}
          <div>
            <h3 className="font-display text-base font-bold text-[#1a1e23]">
              Historická kronika meraní
            </h3>
            <div className="mt-3 overflow-x-auto rounded-lg border border-[#e1e4e8]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#e1e4e8] bg-[#f4f5f7] text-[#5a6370]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Rok</th>
                    <th className="px-3 py-2.5 font-semibold">Dĺžka (m)</th>
                    <th className="px-3 py-2.5 font-semibold">Hĺbka (m)</th>
                    <th className="px-3 py-2.5 font-semibold">Prírastok</th>
                    <th className="px-3 py-2.5 font-semibold">Zdroj</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e4e8]">
                  {[...sortedRecords].reverse().map((r) => (
                    <tr
                      key={r.year}
                      className={r.isBoldLength || r.isBoldDepth ? 'bg-[#fef9e7]/70 font-bold' : 'bg-white'}
                    >
                      <td className="px-3 py-2.5 font-mono-tabular">{r.year}</td>
                      <td
                        className={`px-3 py-2.5 font-mono-tabular ${
                          r.deltaLengthM != null && r.deltaLengthM > 0 ? 'font-bold text-emerald-700' : ''
                        }`}
                      >
                        {r.lengthM != null ? `${r.lengthM.toLocaleString('sk-SK')}` : '—'}
                        {r.secondarySurveyNote ? ` ${r.secondarySurveyNote}` : r.isUnverified ? '*' : ''}
                      </td>
                      <td
                        className={`px-3 py-2.5 font-mono-tabular ${
                          r.deltaDepthM != null && r.deltaDepthM > 0 ? 'font-bold text-emerald-700' : ''
                        }`}
                      >
                        {r.depthM != null ? `${r.depthM.toLocaleString('sk-SK')}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono-tabular">
                        <div className="flex flex-col gap-0.5">
                          {r.deltaLengthM != null && r.deltaLengthM > 0 && (
                            <span className="font-bold text-emerald-700">
                              +{r.deltaLengthM.toLocaleString('sk-SK')} m (dĺžka)
                            </span>
                          )}
                          {r.deltaDepthM != null && r.deltaDepthM > 0 && (
                            <span className="font-bold text-emerald-700">
                              +{r.deltaDepthM.toLocaleString('sk-SK')} m (hĺbka)
                            </span>
                          )}
                          {(!r.deltaLengthM || r.deltaLengthM <= 0) &&
                            (!r.deltaDepthM || r.deltaDepthM <= 0) && (
                              <span className="text-[#98a2b3]">—</span>
                            )}
                          {r.validationWarning && (
                            <span
                              title={r.validationWarning}
                              className="text-[10px] font-medium text-[#c13100]"
                            >
                              Korigované z archívu
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <a
                          href={r.sourcePdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[#1a1e23] underline decoration-[#fbbc05] underline-offset-2 hover:text-[#c13100]"
                        >
                          <FileText className="h-3 w-3" />
                          {r.sourceIssue}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sortedRecords.some((r) => r.unverifiedNote) && (
              <p className="mt-2 text-xs italic text-[#5a6370]">
                * {sortedRecords.find((r) => r.unverifiedNote)?.unverifiedNote}
              </p>
            )}
          </div>

          {/* Related Bibliography Articles */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#1a1e23]">
                Súvisiace články v Bibliografii SSS
              </h3>
              <a
                href={biblioSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-[#c13100] hover:underline"
              >
                Všetky záznamy &rarr;
              </a>
            </div>

            {loadingArticles ? (
              <p className="mt-3 text-xs text-[#5a6370]">Načítavam články z bibliografia.sss.sk...</p>
            ) : articles.length === 0 ? (
              <p className="mt-3 text-xs text-[#5a6370]">
                Pre túto lokalitu neboli v rýchlom indexe nájdené priame zhody. Použite odkaz vyššie na plné vyhľadávanie v archíve bibliografia.sss.sk.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-[#e1e4e8] rounded-lg border border-[#e1e4e8]">
                {articles.map((art) => (
                  <div key={art.id} className="p-3.5 hover:bg-[#f8f9fb]">
                    <div className="flex items-start justify-between gap-3">
                      <a
                        href={art.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-[#1a1e23] hover:text-[#c13100]"
                      >
                        {art.title}
                      </a>
                      <span className="font-mono-tabular text-xs text-[#5a6370] shrink-0">
                        {art.year} · č. {art.issue}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#5a6370]">
                      {(art.authors || []).join(', ')} · str. {art.pages}
                    </p>
                    {art.abstract && (
                      <p className="mt-1.5 text-xs leading-relaxed text-[#343c47] line-clamp-2">
                        {art.abstract}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};
