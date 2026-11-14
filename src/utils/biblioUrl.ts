/**
 * Builds canonical bibliografia.sss.sk search URLs in the format:
 * https://bibliografia.sss.sk/?q=kunia+priepast
 */
export function buildBibliografiaUrl(query: string): string {
  const core = query
    .split('–')[0]
    .split('—')[0]
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '+');

  return `https://bibliografia.sss.sk/?q=${core}`;
}
