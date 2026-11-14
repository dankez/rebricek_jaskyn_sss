import React, { useState } from 'react';
import { BookOpen, ExternalLink, Loader2, Search } from 'lucide-react';
import type { CaveEntity, SemanticSearchResult } from '../types/caves';
import { buildBibliografiaUrl } from '../utils/biblioUrl';

interface SemanticBibliographyPanelProps {
  caves: CaveEntity[];
  onSelectCave: (cave: CaveEntity) => void;
}

const SAMPLE_QUERIES = [
  'Ktoré jaskyne v Nízkych Tatrách mali najväčší nárast dĺžky po roku 2018?',
  'Najhlbšie priepasti v Slovenskom krase a výverový systém Skalistý potok',
  'Revízne merania polygónu v jaskyni Mesačný tieň a Vysoké Tatry',
  'Ľadové jaskyne na Slovensku v UNESCO a ich pramene v Spravodaji',
];

export const SemanticBibliographyPanel: React.FC<SemanticBibliographyPanelProps> = ({
  caves,
  onSelectCave,
}) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SemanticSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (customQuery?: string) => {
    const q = (customQuery ?? query).trim();
    if (!q) return;
    if (customQuery) setQuery(customQuery);
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch('/api/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Vyhľadávanie zlyhalo.');
      setResult(data as SemanticSearchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba pri sémantickom vyhľadávaní.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="bibliografia" className="mx-auto max-w-[1380px] px-6 py-12">
      <div className="flex flex-col gap-4 border-b border-[#e1e4e8] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-[#c13100]">
            Prepojenie na bibliografia.sss.sk · Sémantické vyhľadávanie
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#1a1e23] sm:text-3xl text-balance">
            Sémantický prieskum textov a literatúry SSS
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#5a6370]">
            Vyhľadávajte podľa významu naprieč históriou rebríčkov jaskýň aj databázou viac ako
            5 900 odborných článkov zo Spravodaja SSS na{' '}
            <a
              href="https://bibliografia.sss.sk/"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#1a1e23] underline decoration-[#fbbc05] underline-offset-2"
            >
              bibliografia.sss.sk
            </a>
            .
          </p>
        </div>

        <a
          href="https://bibliografia.sss.sk/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-[#e1e4e8] bg-white px-4 py-2 text-xs font-semibold text-[#1a1e23] whitespace-nowrap shrink-0 hover:border-[#1a1e23]"
        >
          <BookOpen className="h-3.5 w-3.5 text-[#c13100]" />
          Otvoriť bibliografia.sss.sk
          <ExternalLink className="h-3 w-3 opacity-70" />
        </a>
      </div>

      {/* Search Form */}
      <div className="mt-6 rounded-xl border border-[#e1e4e8] bg-white p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6370]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Opýtajte sa prirodzeným jazykom, napr. „podzemné riečiská a nové prepojenia v Nízkych Tatrách“..."
              className="w-full rounded-lg border border-[#e1e4e8] bg-[#f8f9fb] py-3 pl-10 pr-4 text-sm text-[#1a1e23] outline-none focus:border-[#1a1e23] focus:bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1a1e23] px-5 py-3 text-xs font-semibold text-[#fbbc05] whitespace-nowrap shrink-0 transition-colors hover:bg-[#2a3038] disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Analyzujem archív...' : 'Vyhľadať v archíve'}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#5a6370]">Ukážkové dopyty:</span>
          {SAMPLE_QUERIES.map((sq) => (
            <button
              key={sq}
              type="button"
              onClick={() => void runSearch(sq)}
              className="rounded-md border border-[#e1e4e8] bg-[#f4f5f7] px-2.5 py-1 text-left text-xs text-[#1a1e23] transition-colors hover:border-[#1a1e23] hover:bg-white"
            >
              {sq}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-[#c13100]/30 bg-[#fef2f2] px-4 py-3 text-xs text-[#c13100]">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-6 border-t border-[#e1e4e8] pt-6">
            <div className="rounded-lg bg-[#f8f9fb] p-4 border border-[#e1e4e8]">
              <p className="text-xs font-semibold text-[#c13100]">Súhrn sémantického vyhľadávania</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#1a1e23]">
                {result.answerSummary}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Matched Caves */}
              <div>
                <h3 className="font-display text-base font-bold text-[#1a1e23]">
                  Relevantné jaskynné systémy ({result.matchedCaves.length})
                </h3>
                <div className="mt-3 divide-y divide-[#e1e4e8] rounded-lg border border-[#e1e4e8]">
                  {result.matchedCaves.length === 0 ? (
                    <p className="p-4 text-xs text-[#5a6370]">Neboli nájdené priame zhody jaskýň.</p>
                  ) : (
                    result.matchedCaves.map((mc) => (
                      <button
                        key={mc.caveId}
                        type="button"
                        onClick={() => {
                          const found = caves.find((c) => c.id === mc.caveId);
                          if (found) onSelectCave(found);
                        }}
                        className="block w-full p-3.5 text-left transition-colors hover:bg-[#f8f9fb]"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold text-[#1a1e23]">{mc.name}</span>
                          <span className="font-mono-tabular text-xs text-[#5a6370]">
                            {mc.latestLengthM ? `${mc.latestLengthM.toLocaleString('sk-SK')} m` : ''}
                            {mc.latestDepthM ? ` · -${mc.latestDepthM} m` : ''}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#5a6370]">{mc.karstRegion}</p>
                        <p className="mt-1.5 text-xs leading-relaxed text-[#343c47]">
                          {mc.relevanceReason}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Matched Bibliography Articles */}
              <div>
                <h3 className="font-display text-base font-bold text-[#1a1e23]">
                  Články v bibliografia.sss.sk ({result.matchedArticles.length})
                </h3>
                <div className="mt-3 divide-y divide-[#e1e4e8] rounded-lg border border-[#e1e4e8]">
                  {result.matchedArticles.length === 0 ? (
                    <p className="p-4 text-xs text-[#5a6370]">
                      Archív článkov momentálne neobsahuje zhodu pre tento dopyt.
                    </p>
                  ) : (
                    result.matchedArticles.map((art) => (
                      <div key={art.id} className="p-3.5 hover:bg-[#f8f9fb]">
                        <div className="flex items-start justify-between gap-2">
                          <a
                            href={art.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-[#1a1e23] hover:text-[#c13100]"
                          >
                            {art.title}
                          </a>
                          <span className="font-mono-tabular text-xs text-[#5a6370] shrink-0">
                            {art.year} ({art.issue})
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#5a6370]">
                          {(art.authors || []).join(', ')} · str. {art.pages}
                        </p>
                        {art.relevanceReason && (
                          <p className="mt-1.5 text-xs text-[#343c47]">{art.relevanceReason}</p>
                        )}
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          <a
                            href={art.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#c13100] hover:underline"
                          >
                            Otvoriť PDF článok
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <a
                            href={buildBibliografiaUrl(art.title)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#5a6370] hover:text-[#1a1e23] hover:underline"
                          >
                            Záznam v bibliografii
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
