import { CheerioCrawler, PlaywrightCrawler, RequestQueue, SessionPool } from 'crawlee';
import { load } from 'cheerio';
import fs from 'fs';
import path from 'path';
import { TaskConfig } from './types.js';
import { UrlManager } from './urlManager.js';
import { Utils } from './utils.js';

export class ProductCrawler {
  private config: TaskConfig;
  private urlManager: UrlManager;
  private requestQueue: RequestQueue | null = null;
  private sessionPool: SessionPool | null = null;
  private processedCount: number;
  private visitedUrls: Set<string>;

  constructor(config: TaskConfig) {
    this.config = config;
    this.urlManager = new UrlManager(config.id);
    this.processedCount = this.urlManager.getProcessedCount();
    this.visitedUrls = this.urlManager.getVisitedUrls();
  }

  async crawl(): Promise<void> {
    console.log(`开始执行爬取任务 ${this.config.id}`);
    console.log(`模式: ${this.config.mode}`);
    console.log(`最大商品数: ${this.config.maxProducts}`);
    console.log(`起始URL: ${this.config.startUrl}`);

    // 初始化请求队列
    this.requestQueue = await RequestQueue.open(this.config.id);
    
    // 检查是否是新任务，如果是则添加起始URL
    const head = await this.requestQueue.fetchNextRequest();
    if (!head) {
      // 添加起始URL到队列
      await this.requestQueue.addRequest({ url: this.config.startUrl });
    }

    if (this.config.mode === 'cheerio') {
      await this.crawlWithCheerio();
    } else {
      await this.crawlWithPatchright();
    }
  }

  private async crawlWithCheerio(): Promise<void> {
    let cheerioProductCount = 0;
    
    const crawler = new CheerioCrawler({
      requestQueue: this.requestQueue!,
      maxConcurrency: this.config.threads,
      maxRequestRetries: 3,
      requestHandler: async ({ $, request }) => {
        if (this.processedCount >= this.config.maxProducts) {
          console.log('已达到最大商品数量');
          return;
        }

        // 标记URL为已访问
        const normalizedUrl = this.urlManager.normalizeUrl(request.url);
        if (this.visitedUrls.has(normalizedUrl)) {
          return;
        }
        this.visitedUrls.add(normalizedUrl);
        this.urlManager.addVisitedUrl(normalizedUrl);

        // 检查是否为商品页面
        const isProductPage = this.isProductPage($);
        
        if (isProductPage) {
          // 提取并保存HTML
          const html = $.html();
          // 使用固定的output目录结构
          const outputDir = path.join('output', this.config.id);
          const saved = Utils.saveHtmlToFile(
            html, 
            request.url, 
            outputDir, 
            this.processedCount
          );
          
          if (saved) {
            this.processedCount++;
            this.urlManager.updateProcessedCount(this.processedCount);
            console.log(`已保存商品页面 ${this.processedCount}: ${request.url}`);
            
            // 统计使用Cheerio找到的商品数量
            if (this.config.mode === 'cheerio') {
              cheerioProductCount++;
            }
          }
        }

        // 加入新链接到队列
        if (this.processedCount < this.config.maxProducts) {
          await this.enqueueLinks($, request.url);
        }

        // 如果需要，切换到patchright模式
        if (this.config.mode === 'cheerio' && 
            cheerioProductCount >= 20 && 
            this.processedCount < this.config.maxProducts) {
          console.log('切换到patchright模式');
          this.config.mode = 'patchright';
          // 保存更新后的配置
          const configPath = path.join('tasksConfig', `${this.config.id}.json`);
          fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
          // 使用patchright重新开始
          await this.crawl();
        }
      },
      failedRequestHandler: async ({ request }) => {
        console.log(`爬取失败 ${request.url}`);
      },
    });

    await crawler.run();
    
    console.log(`爬取完成。总共保存了 ${this.processedCount} 个商品`);
  }

  private async crawlWithPatchright(): Promise<void> {
    // 导入patchright
    const patchright = await import('patchright');
    
    const crawler = new PlaywrightCrawler({
      requestQueue: this.requestQueue!,
      maxConcurrency: this.config.threads,
      maxRequestRetries: 3,
      launchContext: {
        launcher: patchright.chromium, // 使用chromium而不是default
        launchOptions: {
          channel: 'chrome', // 使用chrome渠道
        }
      },
      browserPoolOptions: {
        useFingerprints: false, // 禁用指纹识别
      },
      requestHandler: async ({ page, request }) => {
        if (this.processedCount >= this.config.maxProducts) {
          console.log('已达到最大商品数量');
          return;
        }

        // 标记URL为已访问
        const normalizedUrl = this.urlManager.normalizeUrl(request.url);
        if (this.visitedUrls.has(normalizedUrl)) {
          return;
        }
        this.visitedUrls.add(normalizedUrl);
        this.urlManager.addVisitedUrl(normalizedUrl);

        // 获取页面内容
        const html = await page.content();
        const $ = load(html);
        
        // 检查是否为商品页面
        const isProductPage = this.isProductPage($);
        
        if (isProductPage) {
          // 提取并保存HTML
          // 使用固定的output目录结构
          const outputDir = path.join('output', this.config.id);
          const saved = Utils.saveHtmlToFile(
            html, 
            request.url, 
            outputDir, 
            this.processedCount
          );
          
          if (saved) {
            this.processedCount++;
            this.urlManager.updateProcessedCount(this.processedCount);
            console.log(`已保存商品页面 ${this.processedCount}: ${request.url}`);
          }
        }

        // 加入新链接到队列
        if (this.processedCount < this.config.maxProducts) {
          await this.enqueueLinks($, request.url);
        }
      },
      failedRequestHandler: async ({ request }) => {
        console.log(`爬取失败 ${request.url}`);
      },
    });

    await crawler.run();
    
    console.log(`爬取完成。总共保存了 ${this.processedCount} 个商品`);
  }

  private isProductPage($: any): boolean {
    // 检查是否有选择器匹配
    for (const selector of this.config.selectors) {
      if ($(selector).length > 0) {
        return true;
      }
    }
    return false;
  }

  private async enqueueLinks($: any, baseUrl: string): Promise<void> {
    const links: string[] = [];
    
    $('a[href]').each((_: number, element: any) => {
      const href = $(element).attr('href');
      if (href) {
        const absoluteUrl = Utils.toAbsoluteUrl(baseUrl, href);
        const normalizedUrl = this.urlManager.normalizeUrl(absoluteUrl);
        
        // 检查是否为网页且在同一域名下
        if (Utils.isWebPage(absoluteUrl) && 
            Utils.isSameDomain(baseUrl, absoluteUrl) &&
            !this.visitedUrls.has(normalizedUrl)) {
          links.push(absoluteUrl);
        }
      }
    });
    
    // 将唯一链接添加到队列
    for (const link of [...new Set(links)]) {
      await this.requestQueue!.addRequest({ url: link });
    }
  }
}