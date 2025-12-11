export interface TaskConfig {
  id: string;
  maxProducts: number;
  startUrl: string;
  threads: number;
  proxies: string[];
  selectors: string[];
  mode: 'cheerio' | 'patchright';
  outputDir?: string;
}

export interface CrawlResult {
  url: string;
  html: string;
}