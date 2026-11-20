export const SITE_URL = 'https://jaskyne.sss.sk';

export const SEO_PAGES = {
  '/': {
    title: 'Rebríčky najdlhších a najhlbších jaskýň Slovenska | SSS',
    description: 'Preskúmajte rebríčky najdlhších a najhlbších jaskýň Slovenska a ich historický vývoj podľa Spravodaja Slovenskej speleologickej spoločnosti.',
    metric: 'length',
  },
  '/najdlhsie-jaskyne.html': {
    title: 'Najdlhšie jaskyne Slovenska – rebríček SSS',
    description: 'Rebríček najdlhších jaskýň Slovenska, ich dĺžky a historické ročníky podľa Spravodaja Slovenskej speleologickej spoločnosti.',
    metric: 'length',
  },
  '/najhlbsie-jaskyne.html': {
    title: 'Najhlbšie jaskyne Slovenska – rebríček SSS',
    description: 'Rebríček najhlbších jaskýň Slovenska, ich hĺbky a historické ročníky podľa Spravodaja Slovenskej speleologickej spoločnosti.',
    metric: 'depth',
  },
} as const;

export function seoPath(path: string): keyof typeof SEO_PAGES {
  return path === '/najdlhsie-jaskyne.html' || path === '/najhlbsie-jaskyne.html' ? path : '/';
}
