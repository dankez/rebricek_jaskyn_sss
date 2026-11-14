export interface CaveYearlyRecord {
  year: number;
  statusDate: string; // e.g. "31. 3. 2020"
  lengthM: number | null;
  depthM: number | null;
  rankLength?: number | null;
  rankDepth?: number | null;
  isBoldLength?: boolean; // Bold in SSS table = change vs previous year
  isBoldDepth?: boolean;
  isUnverified?: boolean; // Asterisk (*) in SSS table = unverified / ongoing polygon
  unverifiedNote?: string;
  secondarySurveyNote?: string; // e.g. "(9031)*"
  deltaLengthM?: number | null;
  deltaDepthM?: number | null;
  sourceIssue: string; // e.g. "Spravodaj SSS 2/2020"
  sourcePdfUrl: string;
  author?: string;
  notes?: string;
  validationWarning?: string;
}

export interface CaveEntity {
  id: string;
  name: string;
  aliases?: string[];
  karstRegion: string;
  subUnit: string;
  lat: number;
  lon: number;
  elevationM?: number;
  discoveryYear?: number;
  isShowCave?: boolean;
  description: string;
  sssUrl?: string;
  records: CaveYearlyRecord[];
}

export interface SpravodajIssue {
  id: string;
  year: number;
  issue: string;
  title: string;
  pdfUrl: string;
  likelyContainsRankings: boolean;
  processed?: boolean;
}

export interface BibliographyArticle {
  id: number;
  title: string;
  authors: string[];
  year: number;
  volume: string;
  issue: string;
  pages: string;
  abstract: string;
  pdf_url: string;
  pdf_page_start?: number;
  pdf_page_end?: number;
  tags: string[];
  caves: string[];
}

export interface ExtractedCaveRow {
  rank: number;
  name: string;
  karstRegion: string;
  subUnit: string;
  valueM: number;
  secondaryNote?: string;
  isBoldChanged: boolean;
  isUnverified: boolean;
  validationWarning?: string;
  prevValueM?: number | null;
}

export interface PdfExtractionResult {
  tableType: 'length' | 'depth' | 'both';
  year: number;
  issueLabel: string;
  statusDate: string;
  author: string;
  footnotes: string[];
  sourceUrl?: string;
  rows: ExtractedCaveRow[];
  rawSummary: string;
  validationWarnings?: string[];
}

export interface SemanticSearchResult {
  query: string;
  answerSummary: string;
  matchedCaves: Array<{
    caveId: string;
    name: string;
    karstRegion: string;
    relevanceReason: string;
    latestLengthM: number | null;
    latestDepthM: number | null;
  }>;
  matchedArticles: Array<BibliographyArticle & { relevanceReason?: string }>;
}
