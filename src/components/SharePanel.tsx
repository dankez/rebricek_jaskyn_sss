import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { DEFAULT_EMBED_OPTIONS, EMBED_COLUMNS, makeEmbedCode, makeShareUrls, type EmbedColumn, type ShareMetric, type ShareView } from '../utils/share';

type Props = {
  view: ShareView;
  metric: ShareMetric;
  years?: number[];
  selectedYear?: number;
};

export function SharePanel({ view, metric, years = [], selectedYear }: Props) {
  const latestYear = years[years.length - 1];
  const [year, setYear] = useState<string>(() =>
    selectedYear && selectedYear !== latestYear ? String(selectedYear) : 'latest',
  );
  const [message, setMessage] = useState('');
  const [shareMetric, setShareMetric] = useState<ShareMetric>(metric);
  const [columns, setColumns] = useState<EmbedColumn[]>(() => [...DEFAULT_EMBED_OPTIONS.columns]);
  const [colors, setColors] = useState(true);
  const [date, setDate] = useState(true);
  const [heightMode, setHeightMode] = useState<'auto' | 'fixed'>('auto');
  const [height, setHeight] = useState(4000);
  useEffect(() => {
    setYear(selectedYear && selectedYear !== latestYear ? String(selectedYear) : 'latest');
    setShareMetric(metric);
    setMessage('');
  }, [selectedYear, latestYear, metric]);
  const urls = makeShareUrls(window.location.origin, view, shareMetric, year === 'latest' ? null : Number(year), { columns, colors, date });
  const embedCode = makeEmbedCode(urls.embed, view, heightMode === 'auto' ? 'auto' : height);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Skopírované do schránky.');
    } catch {
      setMessage('Kopírovanie sa nepodarilo. Označte text a skopírujte ho ručne.');
    }
  };
  const fieldClass = 'mt-1 w-full rounded-md border border-[#d5d9e0] bg-white p-2 text-xs text-[#1a1e23]';
  const buttonClass = 'min-h-10 rounded-md border border-[#d5d9e0] bg-white px-3 text-xs font-semibold text-[#1a1e23] hover:border-[#1a1e23]';
  return (
    <details className="rounded-lg border border-[#d5d9e0] bg-white text-[#1a1e23]">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-xs font-semibold">
        <Share2 className="h-4 w-4" aria-hidden="true" /> Zdieľať a vložiť
      </summary>
      <div className="space-y-3 border-t border-[#e1e4e8] p-4">
        {view === 'rankings' && (
          <>
            <label className="block text-xs font-semibold">
              Zdieľaný rebríček
              <select value={shareMetric} onChange={event => setShareMetric(event.target.value as ShareMetric)} className={fieldClass}>
                <option value="length">Najdlhšie jaskyne</option>
                <option value="depth">Najhlbšie jaskyne</option>
              </select>
            </label>
            <label className="block text-xs font-semibold">
              Ročník zdieľanej tabuľky
              <select value={year} onChange={event => setYear(event.target.value)} className={fieldClass}>
                <option value="latest">Vždy najnovší ročník</option>
                {[...years].reverse().map(item => <option key={item} value={item}>Ročník {item}</option>)}
              </select>
            </label>
            <fieldset>
              <legend className="text-xs font-semibold">Stĺpce vo vloženej tabuľke</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {EMBED_COLUMNS.map(column => (
                  <label key={column.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={columns.includes(column.id)}
                      disabled={columns.length === 1 && columns.includes(column.id)}
                      onChange={event => {
                        const checked = event.target.checked;
                        setColumns(current => checked ? [...current, column.id] : current.filter(item => item !== column.id));
                      }}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={colors} onChange={event => setColors(event.target.checked)} />
              Farebne zvýrazniť zmeny a prírastky
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={date} onChange={event => setDate(event.target.checked)} />
              Zobraziť dátum uloženia databázy
            </label>
            <label className="block text-xs font-semibold">
              Výška vloženej tabuľky
              <select value={heightMode} onChange={event => setHeightMode(event.target.value as 'auto' | 'fixed')} className={fieldClass}>
                <option value="auto">Automatická – vyžaduje priložený skript</option>
                <option value="fixed">Pevná v pixeloch – bez skriptu</option>
              </select>
            </label>
            {heightMode === 'fixed' && (
              <label className="block text-xs font-semibold">
                Výška v pixeloch
                <input type="number" min={100} max={200000} value={height} onChange={event => setHeight(Number(event.target.value))} className={fieldClass} />
              </label>
            )}
            <p className="text-xs text-[#5a6370]">Zdieľa sa celá tabuľka bez vyhľadávania a filtrov.</p>
            <p className="text-xs text-[#5a6370]">Výška 100 % závisí od rodičovského prvku. Pri automatickej výške vložte celý kód vrátane skriptu; ak ho editor nepovolí, použite dostatočne veľkú pevnú výšku.</p>
          </>
        )}
        <label className="block text-xs font-semibold">
          Odkaz
          <input className={fieldClass} value={urls.link} readOnly onFocus={event => event.currentTarget.select()} />
        </label>
        <button type="button" className={buttonClass} onClick={() => void copy(urls.link)}>Kopírovať odkaz</button>
        <label className="block text-xs font-semibold">
          Kód na vloženie do stránky
          <textarea className={fieldClass} rows={3} value={embedCode} readOnly onFocus={event => event.currentTarget.select()} />
        </label>
        <button type="button" className={buttonClass} onClick={() => void copy(embedCode)}>Kopírovať kód</button>
        <p role="status" className="text-xs text-[#5a6370]">{message}</p>
      </div>
    </details>
  );
}
