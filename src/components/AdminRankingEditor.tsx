import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import type { CaveEntity } from '../types/caves';
import {
  buildRankedRows,
  exportRankingsCsv,
  exportRankingsPdf,
  type RankedCaveRow,
} from '../utils/exportReports';

interface AdminRankingEditorProps {
  caves: CaveEntity[];
  years: number[];
  onDatabaseUpdated: (caves: CaveEntity[], year: number) => void;
}

interface DraftRow {
  localId: string;
  caveId?: string;
  name: string;
  karstRegion: string;
  subUnit: string;
  valueM: number;
  prevValueM: number | null;
  isBoldChanged: boolean;
  isUnverified: boolean;
  secondaryNote: string;
  isNewCave: boolean;
}

export const AdminRankingEditor: React.FC<AdminRankingEditorProps> = ({
  caves,
  years,
  onDatabaseUpdated,
}) => {
  const latestYear = years[years.length - 1] || 2026;
  const [targetYear, setTargetYear] = useState<number>(latestYear + 1);
  const [baseYear, setBaseYear] = useState<number>(latestYear);
  const [metric, setMetric] = useState<'length' | 'depth'>('length');
  const [statusDate, setStatusDate] = useState<string>(`31. 3. ${latestYear + 1}`);
  const [author, setAuthor] = useState<string>('Ján Tencer');
  const [footnote, setFootnote] = useState<string>(
    'Údaje označené hviezdičkou (*) sú predbežné alebo z pokračujúceho revízneho merania.'
  );
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // New cave quick form
  const [newName, setNewName] = useState('');
  const [newRegion, setNewRegion] = useState('Nízke Tatry');
  const [newSubUnit, setNewSubUnit] = useState('Demänovské vrchy');
  const [newValue, setNewValue] = useState('');
  const [newUnverified, setNewUnverified] = useState(false);

  // Load base rows when baseYear or metric changes
  const loadFromBaseYear = (srcYear: number, mode: 'length' | 'depth') => {
    const ranked = buildRankedRows(caves, srcYear, mode);
    setDraftRows(
      ranked.map((r) => ({
        localId: r.cave.id,
        caveId: r.cave.id,
        name: r.cave.name,
        karstRegion: r.cave.karstRegion,
        subUnit: r.cave.subUnit,
        valueM: r.valueM,
        prevValueM: r.valueM,
        isBoldChanged: false,
        isUnverified: r.isUnverified,
        secondaryNote: r.secondaryNote || '',
        isNewCave: false,
      }))
    );
    setSaveFeedback(null);
    setSaveError(null);
  };

  useEffect(() => {
    if (caves.length > 0 && draftRows.length === 0) {
      loadFromBaseYear(baseYear, metric);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caves.length]);

  const sortedDraft = useMemo(() => {
    return [...draftRows].sort(
      (a, b) => b.valueM - a.valueM || a.name.localeCompare(b.name, 'sk')
    );
  }, [draftRows]);

  const shrinkingRows = useMemo(() => {
    return sortedDraft.filter((r) => r.prevValueM != null && r.valueM < r.prevValueM);
  }, [sortedDraft]);

  const handleValueChange = (localId: string, rawVal: string) => {
    const num = parseFloat(rawVal.replace(',', '.'));
    setDraftRows((prev) =>
      prev.map((row) => {
        if (row.localId !== localId) return row;
        const safeNum = Number.isFinite(num) ? num : 0;
        const changedVsBase = row.prevValueM != null ? safeNum !== row.prevValueM : true;
        return {
          ...row,
          valueM: safeNum,
          isBoldChanged: changedVsBase,
        };
      })
    );
  };

  const toggleBold = (localId: string) => {
    setDraftRows((prev) =>
      prev.map((row) =>
        row.localId === localId ? { ...row, isBoldChanged: !row.isBoldChanged } : row
      )
    );
  };

  const toggleUnverified = (localId: string) => {
    setDraftRows((prev) =>
      prev.map((row) =>
        row.localId === localId ? { ...row, isUnverified: !row.isUnverified } : row
      )
    );
  };

  const updateNote = (localId: string, note: string) => {
    setDraftRows((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, secondaryNote: note } : row))
    );
  };

  const removeRow = (localId: string) => {
    setDraftRows((prev) => prev.filter((row) => row.localId !== localId));
  };

  const handleAddCave = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newValue.replace(',', '.'));
    if (!newName.trim() || !Number.isFinite(val) || val <= 0) return;

    const id = `new-${Date.now()}`;
    setDraftRows((prev) => [
      {
        localId: id,
        name: newName.trim(),
        karstRegion: newRegion.trim() || 'Slovensko',
        subUnit: newSubUnit.trim() || newRegion.trim() || 'Slovensko',
        valueM: val,
        prevValueM: null,
        isBoldChanged: true,
        isUnverified: newUnverified,
        secondaryNote: newUnverified ? '*' : '',
        isNewCave: true,
      },
      ...prev,
    ]);
    setNewName('');
    setNewValue('');
    setNewUnverified(false);
  };

  // Convert draft rows into RankedCaveRow[] for immediate CSV/PDF export even before saving
  const exportableRows: RankedCaveRow[] = useMemo(() => {
    return sortedDraft.map((row, idx) => ({
      rank: idx + 1,
      cave: {
        id: row.caveId || row.localId,
        name: row.name,
        karstRegion: row.karstRegion,
        subUnit: row.subUnit,
        lat: 48.9,
        lon: 19.6,
        description: '',
        records: [],
      },
      valueM: row.valueM,
      deltaM:
        row.prevValueM != null && row.valueM > row.prevValueM
          ? Number((row.valueM - row.prevValueM).toFixed(1))
          : null,
      isBoldChanged: row.isBoldChanged,
      isUnverified: row.isUnverified,
      secondaryNote: row.secondaryNote || undefined,
      unverifiedNote: row.isUnverified ? footnote : undefined,
      sourceIssue: `Spravodaj SSS 1/${targetYear}`,
      statusDate,
    }));
  }, [sortedDraft, footnote, targetYear, statusDate]);

  const handleSaveToDatabase = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveFeedback(null);
    try {
      const resp = await fetch('/api/admin/save-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: targetYear,
          metric,
          statusDate,
          author,
          footnote,
          rows: sortedDraft.map((r, idx) => ({
            rank: idx + 1,
            caveId: r.caveId,
            name: r.name,
            karstRegion: r.karstRegion,
            subUnit: r.subUnit,
            valueM: r.valueM,
            isBoldChanged: r.isBoldChanged,
            isUnverified: r.isUnverified,
            secondaryNote: r.secondaryNote,
          })),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Uloženie zlyhalo.');
      if (Array.isArray(data.caves)) {
        onDatabaseUpdated(data.caves, targetYear);
      }
      setSaveFeedback(
        `Ročník ${targetYear} (${metric === 'length' ? 'Najdlhšie' : 'Najhlbšie'}) bol uložený (${data.savedCount} jaskýň, ${data.newCaves} nových).`
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Chyba pri ukladaní.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="admin" className="mx-auto max-w-[1380px] px-6 py-12">
      <div className="flex flex-col gap-4 border-b border-[#e1e4e8] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-[#c13100]">
            Admin rozhranie SSS · Príprava nového ročníka
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#1a1e23] sm:text-3xl text-balance">
            Rýchla tvorba rebríčka na budúci rok
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#5a6370]">
            Predvyplňte tabuľku z posledného známeho ročníka, upravte dĺžky alebo hĺbky, označte
            zmeny hrubým písmom a nepotvrdené merania hviezdičkou (*). Výstup hneď exportujte do CSV
            a PDF alebo uložte priamo do portálu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowPrintPreview((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              showPrintPreview
                ? 'border-[#1a1e23] bg-[#1a1e23] text-white'
                : 'border-[#e1e4e8] bg-white text-[#1a1e23] hover:border-[#1a1e23]'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            {showPrintPreview ? 'Späť na editor' : 'Náhľad tlače Spravodaja'}
          </button>

          <button
            type="button"
            onClick={() => exportRankingsCsv(exportableRows, targetYear, metric)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#e1e4e8] bg-white px-3.5 py-2 text-xs font-semibold text-[#1a1e23] whitespace-nowrap shrink-0 hover:border-[#1a1e23]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#14532d]" />
            Export CSV ({targetYear})
          </button>

          <button
            type="button"
            onClick={() => exportRankingsPdf(exportableRows, targetYear, metric)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#e1e4e8] bg-white px-3.5 py-2 text-xs font-semibold text-[#1a1e23] whitespace-nowrap shrink-0 hover:border-[#1a1e23]"
          >
            <Download className="h-3.5 w-3.5 text-[#c13100]" />
            Export PDF ({targetYear})
          </button>

          <button
            type="button"
            disabled={saving || shrinkingRows.length > 0}
            onClick={() => void handleSaveToDatabase()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#fbbc05] px-4 py-2 text-xs font-bold text-[#1a1e23] whitespace-nowrap shrink-0 hover:bg-[#eab004] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Uložiť ročník {targetYear}
          </button>
        </div>
      </div>

      {/* Top Controls Bar */}
      <div className="mt-6 grid gap-4 rounded-xl border border-[#e1e4e8] bg-white p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="block text-xs font-semibold text-[#5a6370]">Cieľový rok</label>
          <input
            type="number"
            min={1970}
            max={2100}
            value={targetYear}
            onChange={(e) => {
              const yr = Number(e.target.value);
              setTargetYear(yr);
              setStatusDate(`31. 3. ${yr}`);
            }}
            className="mt-1 w-full rounded-lg border border-[#e1e4e8] bg-[#f8f9fb] px-3 py-2 font-mono-tabular text-sm font-bold text-[#1a1e23] outline-none focus:border-[#1a1e23]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#5a6370]">Typ rebríčka</label>
          <select
            value={metric}
            onChange={(e) => {
              const m = e.target.value as 'length' | 'depth';
              setMetric(m);
              loadFromBaseYear(baseYear, m);
            }}
            className="mt-1 w-full rounded-lg border border-[#e1e4e8] bg-[#f8f9fb] px-3 py-2 text-sm font-semibold text-[#1a1e23] outline-none focus:border-[#1a1e23]"
          >
            <option value="length">Najdlhšie jaskyne</option>
            <option value="depth">Najhlbšie jaskyne</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#5a6370]">Predvyplniť z roku</label>
          <div className="mt-1 flex gap-1.5">
            <select
              value={baseYear}
              onChange={(e) => {
                const yr = Number(e.target.value);
                setBaseYear(yr);
                loadFromBaseYear(yr, metric);
              }}
              className="w-full rounded-lg border border-[#e1e4e8] bg-[#f8f9fb] px-3 py-2 font-mono-tabular text-sm font-semibold text-[#1a1e23] outline-none focus:border-[#1a1e23]"
            >
              {[...years].reverse().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#5a6370]">Stav k dátumu</label>
          <input
            type="text"
            value={statusDate}
            onChange={(e) => setStatusDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#e1e4e8] bg-[#f8f9fb] px-3 py-2 text-sm text-[#1a1e23] outline-none focus:border-[#1a1e23]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#5a6370]">Zostavovateľ</label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#e1e4e8] bg-[#f8f9fb] px-3 py-2 text-sm text-[#1a1e23] outline-none focus:border-[#1a1e23]"
          />
        </div>
      </div>

      {saveFeedback && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-700/20 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
          {saveFeedback}
        </div>
      )}
      {shrinkingRows.length > 0 && (
        <div className="mt-4 rounded-lg border border-[#c13100]/40 bg-[#fef2f2] px-4 py-3 text-xs text-[#c13100]">
          <p className="font-bold">
            Chyba validácie: Jaskyňa nemôže strácať {metric === 'depth' ? 'hĺbku' : 'dĺžku'} (detegovaný pokles pri {shrinkingRows.length}{' '}
            {shrinkingRows.length === 1 ? 'položke' : 'položkách'})
          </p>
          <p className="mt-1">
            Opravte hodnotu pre: {shrinkingRows.map((r) => `${r.name} (${r.valueM} m < ${r.prevValueM} m)`).join(', ')}.
          </p>
        </div>
      )}
      {saveError && (
        <div className="mt-4 rounded-lg border border-[#c13100]/30 bg-[#fef2f2] px-4 py-3 text-xs text-[#c13100]">
          {saveError}
        </div>
      )}

      {/* Quick Add New Cave Row */}
      {!showPrintPreview && (
        <form
          onSubmit={handleAddCave}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-[#e1e4e8] bg-[#f8f9fb] p-4"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-semibold text-[#5a6370]">
              Pridať novú jaskyňu do rebríčka
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Názov jaskyne (napr. Nová priepasť)"
              className="mt-1 w-full rounded-md border border-[#e1e4e8] bg-white px-3 py-1.5 text-xs text-[#1a1e23] outline-none focus:border-[#1a1e23]"
            />
          </div>
          <div className="w-44">
            <label className="block text-[11px] font-semibold text-[#5a6370]">Krasová oblasť</label>
            <input
              type="text"
              value={newRegion}
              onChange={(e) => setNewRegion(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#e1e4e8] bg-white px-3 py-1.5 text-xs text-[#1a1e23] outline-none focus:border-[#1a1e23]"
            />
          </div>
          <div className="w-44">
            <label className="block text-[11px] font-semibold text-[#5a6370]">Podcelok</label>
            <input
              type="text"
              value={newSubUnit}
              onChange={(e) => setNewSubUnit(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#e1e4e8] bg-white px-3 py-1.5 text-xs text-[#1a1e23] outline-none focus:border-[#1a1e23]"
            />
          </div>
          <div className="w-28">
            <label className="block text-[11px] font-semibold text-[#5a6370]">
              {metric === 'length' ? 'Dĺžka (m)' : 'Hĺbka (m)'}
            </label>
            <input
              type="number"
              step="0.5"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="1250"
              className="mt-1 w-full rounded-md border border-[#e1e4e8] bg-white px-3 py-1.5 font-mono-tabular text-xs text-[#1a1e23] outline-none focus:border-[#1a1e23]"
            />
          </div>
          <label className="inline-flex items-center gap-1.5 pb-1.5 text-xs font-medium text-[#1a1e23] cursor-pointer">
            <input
              type="checkbox"
              checked={newUnverified}
              onChange={(e) => setNewUnverified(e.target.checked)}
              className="accent-[#c13100]"
            />
            Nepotvrdené (*)
          </label>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-[#1a1e23] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#c13100] whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Pridať riadok
          </button>
        </form>
      )}

      {/* Either Print Preview (classic SSS Spravodaj style) OR Fast Inline Editor */}
      {showPrintPreview ? (
        <div className="mt-4 rounded-xl border border-[#e1e4e8] bg-white p-8 shadow-xs">
          <div className="border-b border-[#1a1e23] pb-3">
            <h3 className="font-display text-lg font-bold uppercase tracking-wide text-[#1a1e23]">
              {metric === 'length'
                ? `TABUĽKA NAJDLHŠÍCH JASKÝŇ NA SLOVENSKU, stav k ${statusDate}`
                : `TABUĽKA NAJHLBŠÍCH JASKÝŇ NA SLOVENSKU, stav k ${statusDate}`}
            </h3>
            <p className="mt-1 text-sm text-[#5a6370]">{author}</p>
          </div>

          <div className="mt-4 space-y-1.5 text-[13px]">
            {sortedDraft.map((row, idx) => (
              <div
                key={row.localId}
                className={`flex items-baseline gap-2 ${
                  row.isBoldChanged ? 'font-bold text-[#1a1e23]' : 'font-normal text-[#343c47]'
                }`}
              >
                <span className="shrink-0">
                  {idx + 1}. {row.name}, {row.karstRegion}, {row.subUnit}
                </span>
                <span className="flex-1 border-b border-dotted border-[#98a2b3]" />
                <span className="font-mono-tabular shrink-0">
                  {row.valueM.toLocaleString('sk-SK')}
                  {row.secondaryNote
                    ? ` ${row.secondaryNote}`
                    : row.isUnverified
                    ? '*'
                    : ''}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-[#e1e4e8] pt-3 text-xs text-[#5a6370] space-y-1">
            <p>
              Údaje sú uvedené v metroch. Hrubšie vytlačené sú lokality, na ktorých nastali zmeny v
              porovnaní s minulým rokom.
            </p>
            <p className="italic">* {footnote}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-[#e1e4e8] bg-white">
          <div className="max-h-[540px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-[#e1e4e8] bg-[#1a1e23] text-[#c8cfd8]">
                <tr>
                  <th className="px-3 py-3 w-12">Por.</th>
                  <th className="px-3 py-3">Názov jaskyne</th>
                  <th className="px-3 py-3">Krasová oblasť / Podcelok</th>
                  <th className="px-3 py-3 text-right w-24">Predtým</th>
                  <th className="px-3 py-3 text-right w-32">
                    {metric === 'length' ? 'Nová dĺžka (m)' : 'Nová hĺbka (m)'}
                  </th>
                  <th className="px-3 py-3 text-center w-28">Zmena (Hrubé)</th>
                  <th className="px-3 py-3 text-center w-28">Nepotvrdené (*)</th>
                  <th className="px-3 py-3 w-36">Poznámka</th>
                  <th className="px-3 py-3 w-12 text-center">Zmaž</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e1e4e8]">
                {sortedDraft.map((row, idx) => {
                  const isShrinking = row.prevValueM != null && row.valueM < row.prevValueM;
                  const delta =
                    row.prevValueM != null && row.valueM > row.prevValueM
                      ? Number((row.valueM - row.prevValueM).toFixed(1))
                      : 0;
                  return (
                  <tr
                    key={row.localId}
                    className={
                      isShrinking
                        ? 'bg-[#fef2f2]'
                        : row.isBoldChanged
                        ? 'bg-[#fef9e7]/65'
                        : 'bg-white'
                    }
                  >
                    <td className="px-3 py-2 font-mono-tabular text-[#5a6370]">{idx + 1}.</td>
                    <td className={`px-3 py-2 text-[#1a1e23] ${row.isBoldChanged ? 'font-bold' : ''}`}>
                      {row.name}
                      {row.isNewCave && (
                        <span className="ml-2 text-[10px] font-bold text-emerald-700">NOVÁ</span>
                      )}
                      {delta > 0 && (
                        <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-emerald-700">
                          +{delta.toLocaleString('sk-SK')} m
                        </span>
                      )}
                      {isShrinking && (
                        <span className="ml-2 rounded bg-[#fee2e2] px-1.5 py-0.5 text-[10px] font-bold text-[#c13100]">
                          CHYBA: pokles o {(row.prevValueM! - row.valueM).toLocaleString('sk-SK')} m
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#5a6370]">
                      {row.karstRegion} · {row.subUnit}
                    </td>
                    <td className="px-3 py-2 text-right font-mono-tabular text-[#5a6370]">
                      {row.prevValueM != null ? row.prevValueM.toLocaleString('sk-SK') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.5"
                        value={row.valueM}
                        onChange={(e) => handleValueChange(row.localId, e.target.value)}
                        className={`w-24 rounded border px-2 py-1 text-right font-mono-tabular text-xs outline-none focus:bg-white ${
                          isShrinking
                            ? 'border-[#c13100] bg-white font-bold text-[#c13100]'
                            : row.isBoldChanged
                            ? 'border-[#e1e4e8] bg-[#f8f9fb] font-bold text-[#1a1e23] focus:border-[#1a1e23]'
                            : 'border-[#e1e4e8] bg-[#f8f9fb] text-[#343c47] focus:border-[#1a1e23]'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleBold(row.localId)}
                        className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          row.isBoldChanged
                            ? 'bg-[#1a1e23] text-[#fbbc05]'
                            : 'bg-[#f4f5f7] text-[#5a6370] hover:text-[#1a1e23]'
                        }`}
                      >
                        {row.isBoldChanged ? 'Hrubé' : 'Normálne'}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleUnverified(row.localId)}
                        className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          row.isUnverified
                            ? 'bg-[#c13100] text-white'
                            : 'bg-[#f4f5f7] text-[#5a6370] hover:text-[#1a1e23]'
                        }`}
                      >
                        {row.isUnverified ? 'Áno *' : 'Overené'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.secondaryNote}
                        onChange={(e) => updateNote(row.localId, e.target.value)}
                        placeholder="napr. (9031)*"
                        className="w-full rounded border border-[#e1e4e8] bg-[#f8f9fb] px-2 py-1 font-mono-tabular text-[11px] text-[#1a1e23] outline-none focus:border-[#1a1e23]"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(row.localId)}
                        aria-label={`Odstrániť ${row.name}`}
                        className="rounded p-1 text-[#5a6370] hover:bg-[#fef2f2] hover:text-[#c13100]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#e1e4e8] bg-[#f8f9fb] px-4 py-3">
            <label className="block text-[11px] font-semibold text-[#5a6370]">
              Poznámka pod čiarou k neovereným údajom (*)
            </label>
            <input
              type="text"
              value={footnote}
              onChange={(e) => setFootnote(e.target.value)}
              className="mt-1 w-full rounded border border-[#e1e4e8] bg-white px-3 py-1.5 text-xs text-[#1a1e23] outline-none focus:border-[#1a1e23]"
            />
          </div>
        </div>
      )}
    </section>
  );
};
