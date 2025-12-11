import { CheerioCrawler, PlaywrightCrawler, RequestQueue, SessionPool } from 'crawlee';
import { load } from 'cheerio';
import fs from 'fs';
import path from 'path';
import { TaskConfig } from './types.js';
import { UrlManager } from './urlManager.js';
import { Utils } from './utils.js';
import { ConfigManager } from './configManager.js';

export class ProductCrawler {
  private config: TaskConfig;
  private urlManager: UrlManager;
  private requestQueue: RequestQueue | null = null;
  private sessionPool: SessionPool | null = null;
  private processedCount: number;
  private visitedUrls: Set<string>;
  private cheerioProductCount: number = 0;
  private isCheerioRunCompleted: boolean = false;
  private shouldStop: boolean = false;

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
    let crawler: CheerioCrawler | null = null;
    
    const stopHandler = () => {
      this.shouldStop = true;
      console.log('\n正在停止 Cheerio 爬虫...');
    };
    
    process.on('SIGINT', stopHandler);

    try {
      crawler = new CheerioCrawler({
        requestQueue: this.requestQueue!,
        maxConcurrency: this.config.threads,
        maxRequestRetries: 3,
        requestHandler: async ({ $, request }) => {
          if (this.shouldStop) {
            return;
          }
          
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
              this.cheerioProductCount++;
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
      
      this.isCheerioRunCompleted = true;
      console.log(`Cheerio爬取完成。总共保存了 ${this.processedCount} 个商品，其中产品页面 ${this.cheerioProductCount} 个`);
      
      // 如果使用Cheerio模式找到的产品页面少于20个，则切换到patchright模式重试
      if (!this.shouldStop && this.cheerioProductCount < 20 && this.processedCount < this.config.maxProducts) {
        console.log(`Cheerio模式找到的产品页面 (${this.cheerioProductCount}) 少于20个，切换到patchright模式重试`);
        this.config.mode = 'patchright';
        // 保存更新后的配置到任务目录中
        await ConfigManager.saveTaskConfig(this.config);
        // 使用patchright重新开始
        await this.crawl();
      } else {
        console.log(`爬取完成。总共保存了 ${this.processedCount} 个商品`);
      }
    } finally {
      process.removeListener('SIGINT', stopHandler);
    }
  }

  private async crawlWithPatchright(): Promise<void> {
    // 导入patchright
    const patchright = await import('patchright');
    
    let crawler: PlaywrightCrawler | null = null;
    
    const stopHandler = () => {
      this.shouldStop = true;
      console.log('\n正在停止 Patchright 爬虫...');
    };
    
    process.on('SIGINT', stopHandler);
    
    try {
      crawler = new PlaywrightCrawler({
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
          useFingerprints: false, // 要用指纹识别
        },
        requestHandler: async ({ page, request }) => {
          if (this.shouldStop) {
            return;
          }
          
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

          // 等待页面加载完成
          await page.waitForLoadState('networkidle');
          
          // 尝试滚动到页面底部以触发懒加载内容
          try {
            await page.evaluate(() => {
              return new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                  const scrollHeight = document.body.scrollHeight;
                  window.scrollBy(0, distance);
                  totalHeight += distance;

                  if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    // 等待一小段时间让懒加载内容完成加载
                    setTimeout(resolve, 1000);
                  }
                }, 100);
              });
            });
          } catch (err) {
            console.log('页面滚动到底部时出错:', err);
          }

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
    } finally {
      process.removeListener('SIGINT', stopHandler);
    }
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
      // 只有在不应该停止时才添加新请求
      if (!this.shouldStop) {
        await this.requestQueue!.addRequest({ url: link });
      }
    }
  }
}