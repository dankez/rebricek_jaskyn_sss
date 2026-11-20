export type ShareView = 'rankings' | 'presentations';
export type ShareMetric = 'length' | 'depth';

export const EMBED_COLUMNS = [
  { id: 'rank', label: 'Poradie' },
  { id: 'name', label: 'Názov jaskyne' },
  { id: 'region', label: 'Krasová oblasť' },
  { id: 'subunit', label: 'Podcelok' },
  { id: 'value', label: 'Dĺžka alebo hĺbka' },
  { id: 'change', label: 'Prírastok' },
  { id: 'bibliography', label: 'Bibliografia' },
] as const;
export type EmbedColumn = (typeof EMBED_COLUMNS)[number]['id'];
export type EmbedOptions = { columns: EmbedColumn[]; colors: boolean; date: boolean };
export const DEFAULT_EMBED_OPTIONS: EmbedOptions = {
  columns: EMBED_COLUMNS.map(column => column.id),
  colors: true,
  date: true,
};

export function readEmbedOptions(search: string): EmbedOptions {
  const params = new URLSearchParams(search);
  const selected = params.get('columns')?.split(',');
  const columns = selected
    ? EMBED_COLUMNS.filter(column => selected.includes(column.id)).map(column => column.id)
    : DEFAULT_EMBED_OPTIONS.columns;
  return {
    columns: columns.length ? columns : DEFAULT_EMBED_OPTIONS.columns,
    colors: params.get('colors') !== '0',
    date: params.get('date') !== '0',
  };
}

export function readShareSettings(search: string) {
  const params = new URLSearchParams(search);
  const year = params.get('year');
  return {
    view: (params.get('view') === 'presentations' ? 'presentations' : 'rankings') as ShareView,
    metric: (params.get('metric') === 'depth' ? 'depth' : 'length') as ShareMetric,
    year: year && /^\d{4}$/.test(year) ? Number(year) : null,
  };
}

export function makeShareUrls(origin: string, view: ShareView, metric: ShareMetric, year: number | null, options?: EmbedOptions) {
  const link = new URL('/', origin);
  const embed = new URL('/embed.html', origin);
  for (const url of [link, embed]) {
    url.searchParams.set('metric', metric);
    if (view === 'rankings') url.searchParams.set('year', year === null ? 'latest' : String(year));
  }
  link.hash = view;
  embed.searchParams.set('view', view);
  if (view === 'rankings' && options) {
    const selected = EMBED_COLUMNS.filter(column => options.columns.includes(column.id));
    if (selected.length && selected.length !== EMBED_COLUMNS.length) {
      embed.searchParams.set('columns', selected.map(column => column.id).join(','));
    }
    if (!options.colors) embed.searchParams.set('colors', '0');
    if (!options.date) embed.searchParams.set('date', '0');
  }
  return { link: link.href, embed: embed.href };
}

export function makeEmbedCode(url: string, view: ShareView, height: 'auto' | number = 'auto') {
  const safeUrl = url.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  if (view === 'presentations') {
    return `<iframe src="${safeUrl}" title="Vývoj rebríčkov jaskýň SSS" width="100%" height="850" loading="lazy" style="border:0"></iframe>`;
  }
  const parsed = new URL(url);
  const label = parsed.searchParams.get('metric') === 'depth' ? 'najhlbších' : 'najdlhších';
  if (height !== 'auto') {
    const pixels = Number.isFinite(height) ? Math.min(200000, Math.max(100, Math.round(height))) : 4000;
    return `<iframe src="${safeUrl}" title="Rebríček ${label} jaskýň SSS" width="100%" height="${pixels}" loading="lazy" style="border:0"></iframe>`;
  }
  const scriptUrl = `${parsed.origin}/embed-resize.js`.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return `<iframe src="${safeUrl}" title="Rebríček ${label} jaskýň SSS" data-sss-ranking width="100%" height="850" loading="lazy" style="border:0"></iframe>\n<script src="${scriptUrl}" defer></script>`;
}
