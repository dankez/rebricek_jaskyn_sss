import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Download,
  ExternalLink,
  FileSpreadsheet,
  RefreshCw,
  Search,
  TrendingUp,
} from 'lucide-react';
import type { CaveEntity } from '../types/caves';
import {
  buildRankedRows,
  exportRankingsCsv,
  exportRankingsPdf,
} from '../utils/exportReports';
import { buildBibliografiaUrl } from '../utils/biblioUrl';

interface MilestoneCheckResult {
  hasIncreased: boolean;
  metricDelta: number | null;
}

/**
 * Checks whether a cave's active ranking metric (length or depth) has increased
 * compared to its previous recorded year.
 */
function checkExplorationMilestone(
  cave: CaveEntity,
  targetYear: number,
  metric: 'length' | 'depth'
): MilestoneCheckResult {
  const sorted = [...cave.records].sort((a, b) => a.year - b.year);
  const curr = sorted.find((r) => r.year === targetYear);
  if (!curr) {
    return {
      hasIncreased: false,
      metricDelta: null,
    };
  }

  if (metric === 'length') {
    const prevWithLength = [...sorted]
      .filter((r) => r.year < targetYear && r.lengthM != null)
      .pop();
    const lengthDiff =
      curr.lengthM != null && prevWithLength?.lengthM != null
        ? Number((curr.lengthM - prevWithLength.lengthM).toFixed(1))
        : curr.deltaLengthM ?? null;

    const positiveDelta = lengthDiff != null && lengthDiff > 0 ? lengthDiff : null;
    return {
      hasIncreased: positiveDelta != null,
      metricDelta: positiveDelta,
    };
  }

  const prevWithDepth = [...sorted]
    .filter((r) => r.year < targetYear && r.depthM != null)
    .pop();
  const depthDiff =
    curr.depthM != null && prevWithDepth?.depthM != null
      ? Number((curr.depthM - prevWithDepth.depthM).toFixed(1))
      : curr.deltaDepthM ?? null;

  const positiveDelta = depthDiff != null && depthDiff > 0 ? depthDiff : null;
  return {
    hasIncreased: positiveDelta != null,
    metricDelta: positiveDelta,
  };
}

/**
 * Visual helper for measurement cells emphasizing positive exploration milestones.
 */
function getMeasurementHighlightClasses(isIncreased: boolean, isBoldChanged: boolean): string {
  if (isIncreased) {
    return 'font-bold text-emerald-700';
  }
  return isBoldChanged ? 'font-bold text-[#1a1e23]' : 'font-medium text-[#1a1e23]';
}

interface RankingsTableProps {
  caves: CaveEntity[];
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  metric: 'length' | 'depth';
  onMetricChange: (m: 'length' | 'depth') => void;
  onSelectCave: (cave: CaveEntity) => void;
  onSyncFromSss: () => Promise<void>;
  isSyncing: boolean;
  syncMessage: string | null;
}

export const RankingsTable: React.FC<RankingsTableProps> = ({
  caves,
  years,
  selectedYear,
  onYearChange,
  metric,
  onMetricChange,
  onSelectCave,
  onSyncFromSss,
  isSyncing,
  syncMessage,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [filterMode, setFilterMode] = useState<'all' | 'changed' | 'unverified'>('all');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const baseRows = useMemo(
    () => buildRankedRows(caves, selectedYear, metric),
    [caves, selectedYear, metric]
  );

  const regions = useMemo(() => {
    const set = new Set(baseRows.map((r) => r.cave.karstRegion));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'sk'));
  }, [baseRows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = baseRows.filter((r) => {
      if (regionFilter !== 'all' && r.cave.karstRegion !== regionFilter) return false;
      if (filterMode === 'changed' && !r.isBoldChanged) return false;
      if (filterMode === 'unverified' && !r.isUnverified) return false;
      if (q) {
        const hay = `${r.cave.name} ${r.cave.karstRegion} ${r.cave.subUnit}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortDir === 'asc') {
      return [...filtered].reverse();
    }
    return filtered;
  }, [baseRows, regionFilter, filterMode, searchQuery, sortDir]);

  const footnotes = useMemo(() => {
    const notes = new Set<string>();
    for (const r of filteredRows) {
      if (r.unverifiedNote) notes.add(r.unverifiedNote);
    }
    return Array.from(notes);
  }, [filteredRows]);

  return (
    <section id="rebricky" className="mx-auto max-w-[1380px] px-6 py-12">
      <div className="flex flex-col gap-4 border-b border-[#e1e4e8] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-[#c13100]">
            Oficiálna evidencia SSS · Spracované podľa Spravodaja SSS
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#1a1e23] sm:text-3xl text-balance">
            {metric === 'length'
              ? `Tabuľka najdlhších jaskýň na Slovensku (${selectedYear})`
              : `Tabuľka najhlbších jaskýň na Slovensku (${selectedYear})`}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#5a6370]">
            Tučným písmom sú vyznačené lokality, na ktorých nastala zmena oproti predchádzajúcemu
            záznamu. Hviezdička (*) označuje neoverený alebo revízny meračský údaj.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onSyncFromSss}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-md border border-[#e1e4e8] bg-white px-3.5 py-2 text-xs font-semibold text-[#1a1e23] whitespace-nowrap shrink-0 transition-colors hover:border-[#1a1e23] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Synchronizujem sss.sk...' : 'Synchronizovať z sss.sk'}
          </button>

          <button
            type="button"
            onClick={() => exportRankingsCsv(filteredRows, selectedYear, metric)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#e1e4e8] bg-white px-3.5 py-2 text-xs font-semibold text-[#1a1e23] whitespace-nowrap shrink-0 transition-colors hover:border-[#1a1e23]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#14532d]" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => exportRankingsPdf(filteredRows, selectedYear, metric)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#1a1e23] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-[#2a3038]"
          >
            <Download className="h-3.5 w-3.5 text-[#fbbc05]" />
            Export PDF
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="mt-4 rounded-lg border border-[#fbbc05]/50 bg-[#fef9e7] px-4 py-2.5 text-xs font-medium text-[#1a1e23]">
          {syncMessage}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-[#e1e4e8] bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-lg border border-[#e1e4e8] bg-[#f4f5f7] p-1">
            <button
              type="button"
              onClick={() => onMetricChange('length')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
                metric === 'length' ? 'bg-white text-[#1a1e23] shadow-xs' : 'text-[#5a6370]'
              }`}
            >
              Najdlhšie
            </button>
            <button
              type="button"
              onClick={() => onMetricChange('depth')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
                metric === 'depth' ? 'bg-white text-[#1a1e23] shadow-xs' : 'text-[#5a6370]'
              }`}
            >
              Najhlbšie
            </button>
          </div>

          <select
            aria-label="Vybrať rok rebríčka"
            value={selectedYear}
            onChange={(e) => onYearChange(Number(e.target.value))}
            className="rounded-lg border border-[#e1e4e8] bg-white px-3 py-2 font-mono-tabular text-xs font-semibold text-[#1a1e23] outline-none focus:border-[#1a1e23]"
          >
            {[...years].reverse().map((y) => (
              <option key={y} value={y}>
                Ročník {y}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrovať krasovú oblasť"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="rounded-lg border border-[#e1e4e8] bg-white px-3 py-2 text-xs font-medium text-[#1a1e23] outline-none focus:border-[#1a1e23]"
          >
            <option value="all">Všetky krasové oblasti ({regions.length})</option>
            {regions.map((reg) => (
              <option key={reg} value={reg}>
                {reg}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-lg border border-[#e1e4e8] bg-[#f4f5f7] p-1">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                filterMode === 'all' ? 'bg-white text-[#1a1e23] shadow-xs' : 'text-[#5a6370]'
              }`}
            >
              Všetky
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('changed')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                filterMode === 'changed' ? 'bg-white text-[#1a1e23] shadow-xs' : 'text-[#5a6370]'
              }`}
            >
              Len zmeny (bold)
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('unverified')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                filterMode === 'unverified' ? 'bg-white text-[#1a1e23] shadow-xs' : 'text-[#5a6370]'
              }`}
            >
              Neoverené (*)
            </button>
          </div>
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5a6370]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Hľadať jaskyňu alebo planinu..."
            className="w-full rounded-lg border border-[#e1e4e8] bg-[#f8f9fb] py-2 pl-9 pr-3 text-xs text-[#1a1e23] outline-none focus:border-[#1a1e23] focus:bg-white"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-[#e1e4e8] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#e1e4e8] bg-[#1a1e23] text-xs text-[#c8cfd8]">
              <tr>
                <th className="px-4 py-3.5 font-semibold w-16">Por.</th>
                <th className="px-4 py-3.5 font-semibold">Názov jaskyne</th>
                <th className="px-4 py-3.5 font-semibold">Krasová oblasť</th>
                <th className="px-4 py-3.5 font-semibold">Podcelok</th>
                <th className="px-4 py-3.5 font-semibold text-right">
                  <button
                    type="button"
                    onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                    className="inline-flex items-center gap-1 font-semibold text-white hover:text-[#fbbc05]"
                  >
                    {metric === 'length' ? 'Dĺžka (m)' : 'Hĺbka (m)'}
                    <ArrowDownUp className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3.5 font-semibold text-right">Zmena</th>
                <th className="px-4 py-3.5 font-semibold text-right">Bibliografia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e1e4e8]">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-[#5a6370]">
                    Pre zvolené filtre sa nenašli žiadne záznamy.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const biblioUrl = buildBibliografiaUrl(row.cave.name);
                  const milestone = checkExplorationMilestone(row.cave, selectedYear, metric);
                  const isPositiveMilestone = milestone.hasIncreased || (row.deltaM != null && row.deltaM > 0);
                  const displayDelta = milestone.metricDelta ?? (row.deltaM != null && row.deltaM > 0 ? row.deltaM : null);

                  return (
                    <tr
                      key={row.cave.id}
                      onClick={() => onSelectCave(row.cave)}
                      className={`cursor-pointer transition-colors hover:bg-[#f4f5f7] ${
                        isPositiveMilestone
                          ? 'bg-emerald-50/35'
                          : row.isBoldChanged
                          ? 'bg-[#fef9e7]/55'
                          : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono-tabular text-xs text-[#5a6370]">
                        {row.rank}.
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-[#1a1e23] ${
                          row.isBoldChanged || isPositiveMilestone ? 'font-bold' : 'font-normal'
                        }`}
                      >
                        {row.cave.name}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#343c47]">
                        {row.cave.karstRegion}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#5a6370]">
                        {row.cave.subUnit}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono-tabular text-sm ${getMeasurementHighlightClasses(
                          isPositiveMilestone,
                          row.isBoldChanged
                        )}`}
                        title={
                          isPositiveMilestone
                            ? metric === 'length'
                              ? 'Pozitívny prírastok dĺžky oproti predchádzajúcemu zaznamenanému roku'
                              : 'Pozitívny prírastok hĺbky oproti predchádzajúcemu zaznamenanému roku'
                            : undefined
                        }
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          {isPositiveMilestone && (
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          )}
                          <span>{row.valueM.toLocaleString('sk-SK')}</span>
                        </span>
                        {row.secondaryNote ? (
                          <span className="ml-1 text-xs font-medium text-[#c13100]">
                            {row.secondaryNote}
                          </span>
                        ) : row.isUnverified ? (
                          <span className="ml-0.5 font-bold text-[#c13100]">*</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-xs">
                        {displayDelta != null && displayDelta > 0 ? (
                          <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">
                            +{displayDelta.toLocaleString('sk-SK')} m
                          </span>
                        ) : (
                          <span className="text-[#98a2b3]">—</span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a
                          href={biblioUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#1a1e23] underline decoration-[#e1e4e8] underline-offset-2 hover:text-[#c13100] hover:decoration-[#c13100]"
                        >
                          Články
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footnotes matching Ján Tencer's SSS notation */}
      <div className="mt-4 space-y-1 text-xs text-[#5a6370]">
        <p>
          Údaje sú uvedené v metroch. Tučne vytlačené sú lokality, na ktorých nastali zmeny v
          porovnaní s predchádzajúcim záznamom.
        </p>
        {footnotes.length > 0 ? (
          footnotes.map((fn, i) => (
            <p key={i} className="italic text-[#343c47]">
              * {fn}
            </p>
          ))
        ) : (
          <p className="italic">
            * Za dĺžkovým údajom označeným hviezdičkou je údaj z pokračujúceho revízneho merania
            alebo zatiaľ neovereného meračského polygónu.
          </p>
        )}
      </div>
    </section>
  );
};
