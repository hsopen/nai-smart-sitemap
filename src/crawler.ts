import { CheerioCrawler, PlaywrightCrawler, RequestQueue, SessionPool } from 'crawlee';
import { load } from 'cheerio';
import fs from 'fs';
import path from 'path';
import { TaskConfig } from './types.js';
import { UrlManager } from './urlManager.js';
import { Utils } from './utils.js';
import { ConfigManager } from './configManager.js';
import { randomUUID } from 'crypto';

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
  private uniqueQueueId: string;
  private queueMonitorInterval: NodeJS.Timeout | null = null;

  constructor(config: TaskConfig) {
    this.config = config;
    this.urlManager = new UrlManager(config.id);
    this.processedCount = this.urlManager.getProcessedCount();
    this.visitedUrls = this.urlManager.getVisitedUrls();
    // 为每个爬虫实例创建唯一的队列ID，避免多个爬虫共享队列
    this.uniqueQueueId = `${config.id}-${randomUUID().substring(0, 8)}`;
  }

  async crawl(): Promise<void> {
    console.log(`开始执行爬取任务 ${this.config.id}`);
    console.log(`模式: ${this.config.mode}`);
    console.log(`最大商品数: ${this.config.maxProducts}`);
    console.log(`起始URL: ${this.config.startUrl}`);
    console.log(`并发线程数: ${this.config.threads}`);

    // 初始化请求队列，使用唯一的队列ID
    this.requestQueue = await RequestQueue.open(this.uniqueQueueId);
    
    // 启动队列监控
    this.startQueueMonitoring();
    
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
        maxConcurrency: this.config.threads, // 使用配置的线程数
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
        maxConcurrency: this.config.threads, // 使用配置的线程数
        maxRequestRetries: 2, // 减少重试次数
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

          try {
            // 等待页面加载完成，但设置更合理的超时时间
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
          } catch (err) {
            console.log(`等待页面加载超时 ${request.url}:`, err);
            // 即使超时也继续处理页面
          }

          try {
            // 尝试关闭可能的弹窗或悬浮窗
            await page.evaluate(() => {
              // 尝试关闭常见的弹窗元素
              const closeSelectors = [
                'button[class*="close"]',
                'button[class*="dismiss"]',
                '.modal-close',
                '.popup-close',
                '[aria-label="Close"]',
                '.close-modal',
                '.overlay-close'
              ];
              
              for (const selector of closeSelectors) {
                const closeButton = document.querySelector(selector);
                if (closeButton) {
                  (closeButton as HTMLElement).click();
                  break;
                }
              }
              
              // 尝试隐藏可能干扰滚动的浮动元素
              const floatingElements = document.querySelectorAll('div[class*="popup"], div[class*="modal"], div[class*="overlay"], div[class*="float"]');
              floatingElements.forEach(el => {
                if (el instanceof HTMLElement) {
                  el.style.display = 'none';
                }
              });
            });
          } catch (err) {
            console.log(`尝试关闭弹窗时出错 ${request.url}:`, err);
          }

          try {
            // 尝试滚动到页面底部以触发懒加载内容
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
            }, { timeout: 10000 }); // 设置滚动超时
          } catch (err) {
            console.log(`页面滚动到底部时出错 ${request.url}:`, err);
          }

          // 获取页面内容
          const html = await page.content();
          
          // 使用Cheerio解析HTML
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
    
    // 停止队列监控
    this.stopQueueMonitoring();
  }

  // 启动队列监控
  private startQueueMonitoring(): void {
    this.queueMonitorInterval = setInterval(async () => {
      if (this.requestQueue && !this.shouldStop) {
        try {
          // 检查队列状态
          const head = await this.requestQueue.fetchNextRequest();
          if (head) {
            // 如果有请求但处理时间过长，可能卡住了
            console.log(`队列 ${this.uniqueQueueId} 监控: 发现待处理请求 ${head.id}`);
            
            // 尝试恢复卡住的请求
            await this.handleStuckRequest(head);
          }
        } catch (error) {
          console.error(`队列 ${this.uniqueQueueId} 监控出错:`, error);
          // 尝试重新初始化队列
          await this.recoverQueue();
        }
      }
    }, 15000); // 每15秒检查一次，更频繁的监控
  }

  // 处理卡住的请求
  private async handleStuckRequest(request: any): Promise<void> {
    try {
      // 检查请求是否被锁定过久（超过2分钟）
      const lockTimeout = 2 * 60 * 1000; // 2分钟
      const now = Date.now();
      
      if (request.lockedAt && (now - new Date(request.lockedAt).getTime()) > lockTimeout) {
        console.log(`队列 ${this.uniqueQueueId}: 请求 ${request.id} 被锁定过久，尝试重新处理`);
        
        // 重新添加请求到队列
        await this.requestQueue!.addRequest({
          url: request.url,
          userData: request.userData
        });
        
        console.log(`队列 ${this.uniqueQueueId}: 已重新添加请求 ${request.id}`);
      }
    } catch (error) {
      console.error(`处理卡住请求 ${request.id} 时出错:`, error);
    }
  }

  // 恢复队列
  private async recoverQueue(): Promise<void> {
    try {
      console.log(`尝试恢复队列 ${this.uniqueQueueId}...`);
      
      // 重新打开队列
      this.requestQueue = await RequestQueue.open(this.uniqueQueueId);
      
      // 检查是否有待处理的请求
      const head = await this.requestQueue.fetchNextRequest();
      if (!head) {
        // 如果队列为空，重新添加起始URL
        await this.requestQueue.addRequest({ url: this.config.startUrl });
        console.log(`队列 ${this.uniqueQueueId}: 已重新初始化并添加起始URL`);
      }
    } catch (error) {
      console.error(`恢复队列 ${this.uniqueQueueId} 时出错:`, error);
    }
  }

  // 停止队列监控
  private stopQueueMonitoring(): void {
    if (this.queueMonitorInterval) {
      clearInterval(this.queueMonitorInterval);
      this.queueMonitorInterval = null;
    }
  }

  // 获取任务ID（公共方法）
  public getTaskId(): string {
    return this.config.id;
  }

  // 获取唯一队列ID（公共方法）
  public getUniqueQueueId(): string {
    return this.uniqueQueueId;
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