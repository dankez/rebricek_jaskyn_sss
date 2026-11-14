import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileSearch,
  FileUp,
  Loader2,
  PlusCircle,
  Sparkles,
} from 'lucide-react';
import type {
  CaveEntity,
  PdfExtractionResult,
  SpravodajIssue,
} from '../types/caves';

interface SpravodajOcrPanelProps {
  onDatabaseUpdated: (caves: CaveEntity[], year?: number) => void;
}

const SAMPLE_TEXT_2020 = `TABUĽKA NAJDLHŠÍCH JASKÝŇ NA SLOVENSKU stav k 31. 3. 2020
Ján Tencer
1. Demänovský jaskynný systém, Nízke Tatry, Demänovské vrchy ......................................................... 41 681
2. Mesačný tieň, Východné Tatry, Vysoké Tatry ................................................................................ 31 840 (9031)*
3. Systém Stratenskej jaskyne, Spišsko-gemerský kras, Slovenský raj ..................................................... 23 809
4. Jaskyňa mŕtvych netopierov, Nízke Tatry, Ďumbier ............................................................................... 21 113
5. Štefanová, Nízke Tatry, Demänovské vrchy ................................................................................................. 17 981
6. Javorinka, Východné Tatry, Vysoké Tatry ...................................................................................................... 11 936
7. Jaskyňa zlomísk, Nízke Tatry, Demänovské vrchy .................................................................................... 11 255
8. Skalistý potok, Slovenský kras, Jasovská planina ............................................................................................ 8215
9. Domica – Čertova diera, Slovenský kras, Silická planina ............................................................................ 8127
10. Systém Hipmanových jaskýň, Nízke Tatry, Demänovské vrchy .................................................................. 7650`;

export const SpravodajOcrPanel: React.FC<SpravodajOcrPanelProps> = ({
  onDatabaseUpdated,
}) => {
  const [issues, setIssues] = useState<SpravodajIssue[]>([]);
  const [issuesSource, setIssuesSource] = useState<'live' | 'cache'>('live');
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [issueFilter, setIssueFilter] = useState<'rankings' | 'all'>('rankings');

  const [inputMode, setInputMode] = useState<'sss' | 'upload' | 'text'>('sss');
  const [selectedPdfUrl, setSelectedPdfUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{ name: string; base64: string } | null>(null);
  const [tablePreference, setTablePreference] = useState<'auto' | 'length' | 'depth'>('auto');

  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<PdfExtractionResult | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoadingIssues(true);
    fetch('/api/sss/issues')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data.issues) ? (data.issues as SpravodajIssue[]) : [];
        setIssues(list);
        setIssuesSource(data.source === 'live' ? 'live' : 'cache');
        const firstLikely = list.find((i) => i.likelyContainsRankings) || list[0];
        if (firstLikely) setSelectedPdfUrl(firstLikely.pdfUrl);
      })
      .catch(() => setIssues([]))
      .finally(() => setLoadingIssues(false));
  }, []);

  const displayedIssues =
    issueFilter === 'rankings'
      ? issues.filter((i) => i.likelyContainsRankings)
      : issues;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Vyberte prosím súbor vo formáte PDF.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedFile({
        name: file.name,
        base64: String(reader.result || ''),
      });
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const runExtraction = async (overrideUrl?: string) => {
    setExtracting(true);
    setError(null);
    setImportSuccess(null);

    try {
      const payload: Record<string, string> = { tablePreference };
      if (overrideUrl) {
        payload.pdfUrl = overrideUrl;
      } else if (inputMode === 'sss') {
        payload.pdfUrl = selectedPdfUrl;
      } else if (inputMode === 'upload') {
        if (!uploadedFile) {
          throw new Error('Najprv nahrajte PDF súbor.');
        }
        payload.pdfBase64 = uploadedFile.base64;
      } else {
        if (rawText.trim().length < 20) {
          throw new Error('Vložte text tabuľky zo Spravodaja SSS.');
        }
        payload.rawText = rawText;
      }

      const resp = await fetch('/api/extract/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'AI extrakcia zlyhala.');
      }
      setExtraction(data.extraction);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba pri spracovaní PDF.');
    } finally {
      setExtracting(false);
    }
  };

  const commitExtraction = async () => {
    if (!extraction) return;
    setImporting(true);
    setError(null);
    try {
      const resp = await fetch('/api/caves/import-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraction }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Uloženie do databázy zlyhalo.');
      }
      setImportSuccess(
        `Uložených ${data.importedRows} záznamov pre ročník ${extraction.year} (${data.newCaves} nových lokalít).`
      );
      if (Array.isArray(data.caves)) {
        onDatabaseUpdated(data.caves, extraction.year);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepodarilo sa uložiť dáta.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <section id="spravodaj-ocr" className="mx-auto max-w-[1380px] px-6 py-12">
      <div className="border-b border-[#e1e4e8] pb-6">
        <p className="text-xs font-medium tracking-wide text-[#c13100]">
          Automatické spracovanie archívu · sss.sk/spravodaj/
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#1a1e23] sm:text-3xl text-balance">
          OCR a AI extrakcia tabuliek zo Spravodaja SSS
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-[#5a6370]">
          Systém automaticky sleduje PDF archív Spravodaja SSS (najmä čísla 1 a 2 každého ročníka),
          rozpoznáva skenované aj textové tabuľky najdlhších a najhlbších jaskýň vrátane tučných
          zmien a poznámok označených hviezdičkou (*).
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Left column: Live Spravodaj PDF Catalog */}
        <div className="lg:col-span-5 rounded-xl border border-[#e1e4e8] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1e4e8] pb-3.5">
            <div>
              <h3 className="font-display text-base font-bold text-[#1a1e23]">
                Archív PDF čísel na sss.sk
              </h3>
              <p className="text-xs text-[#5a6370]">
                {loadingIssues
                  ? 'Načítavam zoznam z sss.sk...'
                  : `${issues.length} PDF dokumentov (${issuesSource === 'live' ? 'živý index sss.sk' : 'lokálny zoznam'})`}
              </p>
            </div>

            <div className="inline-flex rounded-lg border border-[#e1e4e8] bg-[#f4f5f7] p-0.5">
              <button
                type="button"
                onClick={() => setIssueFilter('rankings')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                  issueFilter === 'rankings' ? 'bg-white text-[#1a1e23] shadow-xs' : 'text-[#5a6370]'
                }`}
              >
                Čísla 1 & 2
              </button>
              <button
                type="button"
                onClick={() => setIssueFilter('all')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                  issueFilter === 'all' ? 'bg-white text-[#1a1e23] shadow-xs' : 'text-[#5a6370]'
                }`}
              >
                Všetky
              </button>
            </div>
          </div>

          <div className="mt-3 max-h-[380px] divide-y divide-[#e1e4e8] overflow-y-auto pr-1">
            {loadingIssues ? (
              <div className="flex items-center justify-center py-12 text-xs text-[#5a6370]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sťahujem archív PDF odkazov z sss.sk/spravodaj/...
              </div>
            ) : (
              displayedIssues.slice(0, 45).map((issue) => {
                const isSelected = selectedPdfUrl === issue.pdfUrl;
                return (
                  <div
                    key={issue.id}
                    className={`flex items-center justify-between gap-3 py-2.5 px-2 rounded-md transition-colors ${
                      isSelected ? 'bg-[#fef9e7]' : 'hover:bg-[#f8f9fb]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setInputMode('sss');
                        setSelectedPdfUrl(issue.pdfUrl);
                      }}
                      className="text-left min-w-0 flex-1"
                    >
                      <p className="truncate text-xs font-semibold text-[#1a1e23]">
                        Spravodaj SSS {issue.issue}/{issue.year}
                      </p>
                      <p className="truncate font-mono-tabular text-[11px] text-[#5a6370]">
                        {issue.pdfUrl.split('/').pop()}
                      </p>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={issue.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Otvoriť PDF ${issue.title}`}
                        className="rounded p-1.5 text-[#5a6370] hover:bg-[#e1e4e8]/60 hover:text-[#1a1e23]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        disabled={extracting}
                        onClick={() => {
                          setInputMode('sss');
                          setSelectedPdfUrl(issue.pdfUrl);
                          void runExtraction(issue.pdfUrl);
                        }}
                        className="rounded-md bg-[#1a1e23] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#c13100] disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        Extrahovať
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right column: Multimodal OCR Extractor & Preview */}
        <div className="lg:col-span-7 rounded-xl border border-[#e1e4e8] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e4e8] pb-4">
            <div className="inline-flex rounded-lg border border-[#e1e4e8] bg-[#f4f5f7] p-1">
              <button
                type="button"
                onClick={() => setInputMode('sss')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
                  inputMode === 'sss' ? 'bg-white text-[#1a1e23] shadow-xs' : 'text-[#5a6370]'
                }`}
              >
                PDF z sss.sk
              </button>
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
                  inputMode === 'upload' ? 'bg-white text-[#1a1e23] shadow-xs' : 'text-[#5a6370]'
                }`}
              >
                Nahrať PDF
              </button>
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
                  inputMode === 'text' ? 'bg-white text-[#1a1e23] shadow-xs' : 'text-[#5a6370]'
                }`}
              >
                Vložiť text
              </button>
            </div>

            <select
              aria-label="Typ extrahovanej tabuľky"
              value={tablePreference}
              onChange={(e) => setTablePreference(e.target.value as 'auto' | 'length' | 'depth')}
              className="rounded-lg border border-[#e1e4e8] bg-white px-3 py-1.5 text-xs font-medium text-[#1a1e23]"
            >
              <option value="auto">Tabuľka: Automaticky</option>
              <option value="length">Najdlhšie jaskyne</option>
              <option value="depth">Najhlbšie jaskyne</option>
            </select>
          </div>

          <div className="mt-4 space-y-4">
            {inputMode === 'sss' && (
              <div>
                <label className="block text-xs font-semibold text-[#1a1e23]">
                  URL adresa PDF dokumentu zo Spravodaja SSS
                </label>
                <input
                  type="url"
                  value={selectedPdfUrl}
                  onChange={(e) => setSelectedPdfUrl(e.target.value)}
                  placeholder="https://sss.sk/wp-content/uploads/..."
                  className="mt-1.5 w-full rounded-lg border border-[#e1e4e8] bg-[#f8f9fb] px-3 py-2 font-mono-tabular text-xs text-[#1a1e23] outline-none focus:border-[#1a1e23] focus:bg-white"
                />
              </div>
            )}

            {inputMode === 'upload' && (
              <div className="rounded-lg border border-dashed border-[#c8cfd8] bg-[#f8f9fb] p-5 text-center">
                <FileUp className="mx-auto h-6 w-6 text-[#5a6370]" />
                <p className="mt-2 text-xs font-medium text-[#1a1e23]">
                  {uploadedFile ? `Vybraný súbor: ${uploadedFile.name}` : 'Vyberte PDF súbor Spravodaja (vrátane skenovaných strán)'}
                </p>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="mt-3 text-xs text-[#5a6370]"
                />
              </div>
            )}

            {inputMode === 'text' && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#1a1e23]">
                    Text tabuľky zo Spravodaja
                  </label>
                  <button
                    type="button"
                    onClick={() => setRawText(SAMPLE_TEXT_2020)}
                    className="text-xs font-semibold text-[#c13100] hover:underline"
                  >
                    Vložiť ukážku (stav k 31. 3. 2020)
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Sem vložte skopírovaný text tabuľky najdlhších alebo najhlbších jaskýň..."
                  className="mt-1.5 w-full rounded-lg border border-[#e1e4e8] bg-[#f8f9fb] p-3 font-mono-tabular text-xs text-[#1a1e23] outline-none focus:border-[#1a1e23] focus:bg-white"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={extracting}
                onClick={() => void runExtraction()}
                className="inline-flex items-center gap-2 rounded-md bg-[#c13100] px-4 py-2.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-[#a12900] disabled:opacity-50"
              >
                {extracting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-[#fbbc05]" />
                )}
                {extracting ? 'Prebieha AI/OCR analýza PDF...' : 'Spustiť AI/OCR extrakciu tabuľky'}
              </button>

              {extraction && (
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => void commitExtraction()}
                  className="inline-flex items-center gap-2 rounded-md bg-[#1a1e23] px-4 py-2.5 text-xs font-semibold text-[#fbbc05] whitespace-nowrap shrink-0 transition-colors hover:bg-[#2a3038] disabled:opacity-50"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlusCircle className="h-4 w-4" />
                  )}
                  Uložiť ročník {extraction.year} do databázy
                </button>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-[#c13100]/30 bg-[#fef2f2] px-4 py-3 text-xs text-[#c13100]">
                {error}
              </div>
            )}

            {importSuccess && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-700/20 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                {importSuccess}
              </div>
            )}

            {/* Extraction Preview */}
            {extraction ? (
              <div className="mt-4 space-y-3 border-t border-[#e1e4e8] pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h4 className="font-display text-sm font-bold text-[#1a1e23]">
                      {extraction.issueLabel} · {extraction.tableType === 'depth' ? 'Najhlbšie' : 'Najdlhšie'} ({extraction.year})
                    </h4>
                    <p className="text-xs text-[#5a6370]">
                      Zostavil: {extraction.author} · Stav k {extraction.statusDate} · {extraction.rows.length} extrahovaných položiek
                    </p>
                  </div>
                </div>

                {extraction.validationWarnings && extraction.validationWarnings.length > 0 && (
                  <div className="rounded-lg border border-[#c13100]/40 bg-[#fef2f2] p-3 text-xs text-[#c13100]">
                    <p className="font-bold">
                      Detegované anomálie extrakcie ({extraction.validationWarnings.length}): jaskyňa nemôže strácať dĺžku ani hĺbku
                    </p>
                    <ul className="mt-1 list-disc pl-4 space-y-0.5">
                      {extraction.validationWarnings.slice(0, 5).map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {extraction.rawSummary && (
                  <p className="text-xs leading-relaxed text-[#343c47]">{extraction.rawSummary}</p>
                )}

                <div className="max-h-60 overflow-y-auto rounded-lg border border-[#e1e4e8]">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#f4f5f7] text-[#5a6370]">
                      <tr>
                        <th className="px-3 py-2">Por.</th>
                        <th className="px-3 py-2">Jaskyňa</th>
                        <th className="px-3 py-2">Krasová oblasť</th>
                        <th className="px-3 py-2 text-right">Hodnota (m)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e1e4e8]">
                      {extraction.rows.map((r) => {
                        const hasShrinkError = Boolean(r.validationWarning);
                        const gain =
                          r.prevValueM != null && r.valueM > r.prevValueM
                            ? Number((r.valueM - r.prevValueM).toFixed(1))
                            : null;
                        return (
                          <tr
                            key={`${r.rank}-${r.name}`}
                            className={
                              hasShrinkError
                                ? 'bg-[#fef2f2] text-[#c13100]'
                                : r.isBoldChanged
                                ? 'bg-[#fef9e7]/70 font-bold'
                                : ''
                            }
                          >
                            <td className="px-3 py-2 font-mono-tabular">{r.rank}.</td>
                            <td className="px-3 py-2">
                              <div>{r.name}</div>
                              {hasShrinkError && (
                                <div className="text-[10px] font-semibold text-[#c13100]">
                                  Chyba: pokles oproti {r.prevValueM?.toLocaleString('sk-SK')} m
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[#5a6370]">
                              {r.karstRegion}{r.subUnit ? `, ${r.subUnit}` : ''}
                            </td>
                            <td className="px-3 py-2 text-right font-mono-tabular">
                              <span>
                                {r.valueM.toLocaleString('sk-SK')}
                                {r.secondaryNote ? ` ${r.secondaryNote}` : r.isUnverified ? '*' : ''}
                              </span>
                              {gain != null && (
                                <span className="ml-1.5 text-[11px] font-bold text-emerald-700">
                                  +{gain.toLocaleString('sk-SK')} m
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-[#e1e4e8] bg-[#f8f9fb] p-4 text-xs text-[#5a6370]">
                <FileSearch className="h-5 w-5 text-[#1a1e23] shrink-0" />
                <span>
                  Vyberte ľubovoľné číslo Spravodaja vľavo alebo vložte text rebríčka — AI model
                  automaticky rozpozná tabuľku, porovná zmeny a pripraví dáta na import do atlasu.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
