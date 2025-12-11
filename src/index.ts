import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { ConfigManager } from './configManager.js';
import { ProductCrawler } from './crawler.js';
import { TaskConfig } from './types.js';
import { RequestQueue } from 'crawlee';

// 设置环境变量以使用内存存储而不是文件系统存储
process.env.CRAWLEE_STORAGE_DIR = path.join(process.cwd(), 'storage');

async function main() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('请选择操作:');
  console.log('1. 启动任务');
  console.log('2. 创建任务');

  rl.question('请输入选项编号: ', async (answer: string) => {
    const choice = parseInt(answer);

    if (choice === 1) {
      await startTask(rl);
    } else if (choice === 2) {
      await createTask(rl);
    } else {
      console.log('无效的选项。');
      rl.close();
    }
  });
}

async function startTask(rl: any) {
  // 加载所有任务配置
  const configs = await ConfigManager.loadTaskConfigs();

  if (configs.length === 0) {
    console.log('未找到任务。请先创建任务。');
    rl.close();
    return;
  }

  // 显示任务列表
  console.log('可用任务:');
  configs.forEach((config, index) => {
    console.log(`${index + 1}. ${config.id} - ${config.startUrl}`);
  });

  rl.question('请输入任务编号以选择任务: ', async (answer: string) => {
    const selectedIndex = parseInt(answer) - 1;

    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= configs.length) {
      console.log('无效的选择。');
      rl.close();
      return;
    }

    const selectedConfig = configs[selectedIndex];
    console.log(`正在启动任务: ${selectedConfig.id}`);

    const crawler = new ProductCrawler(selectedConfig);
    try {
      await crawler.crawl();
      console.log('爬取已完成。');
    } catch (error) {
      console.error('爬取出错:', error);
    } finally {
      rl.close();
    }
  });
}

async function createTask(rl: any) {
  rl.question('请输入起始网址: ', async (urlAnswer: string) => {
    try {
      const url = new URL(urlAnswer);
      const taskId = url.hostname;
      const configPath = path.join('tasksConfig', `${taskId}.json`);

      if (fs.existsSync(configPath)) {
        console.log(`任务 ${taskId} 已存在。`);
      } else {
        const defaultConfig: TaskConfig = {
          id: taskId,
          maxProducts: 1000,
          startUrl: url.href,
          threads: 5,
          proxies: [],
          selectors: ['.product', '.item', '.product-item'],
          mode: 'cheerio'
        };

        // 创建任务配置文件
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        
        // 使用Crawlee的RequestQueue初始化队列
        const requestQueue = await RequestQueue.open(taskId);
        await requestQueue.addRequest({ url: url.href });
        
        console.log(`任务 ${taskId} 创建成功。`);
      }
    } catch (error) {
      console.error('创建任务时出错:', error);
    } finally {
      rl.close();
    }
  });
}

main().catch(console.error);