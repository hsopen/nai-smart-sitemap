import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { ConfigManager } from './configManager.js';
import { ProductCrawler } from './crawler.js';
import { TaskConfig } from './types.js';
import { RequestQueue } from 'crawlee';
import { generateSitemap } from './sitemapGenerator.js';

// 设置环境变量以将存储目录移到storage文件夹而不是根目录
process.env.CRAWLEE_STORAGE_DIR = path.join(process.cwd(), 'storage');

let currentCrawlers: ProductCrawler[] = [];

async function main() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('请选择操作:');
  console.log('1. 启动任务');
  console.log('2. 创建任务');
  console.log('3. 生成网站地图');

  rl.question('请输入选项编号: ', async (answer: string) => {
    const choice = parseInt(answer);

    if (choice === 1) {
      await startTask(rl);
    } else if (choice === 2) {
      await createTask(rl);
    } else if (choice === 3) {
      rl.close();
      await generateSitemap();
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

  rl.question('请输入任务编号以选择任务(多个任务用逗号分隔): ', async (answer: string) => {
    const selectedIndices = answer.split(',').map(s => parseInt(s.trim()) - 1);

    const validIndices = selectedIndices.filter(index => 
      !isNaN(index) && index >= 0 && index < configs.length
    );

    if (validIndices.length === 0) {
      console.log('无效的选择。');
      rl.close();
      return;
    }

    // 处理 Ctrl+C 信号
    const sigintHandler = () => {
      console.log('\n接收到中断信号，正在停止所有爬虫...');
      currentCrawlers.forEach(crawler => {
        // 这里可以添加更具体的停止逻辑
      });
      process.exit(0);
    };
    
    process.on('SIGINT', sigintHandler);

    try {
      // 并发执行所有选择的任务
      const crawlers = validIndices.map(index => {
        const selectedConfig = configs[index];
        console.log(`正在启动任务: ${selectedConfig.id}`);
        const crawler = new ProductCrawler(selectedConfig);
        currentCrawlers.push(crawler);
        return crawler;
      });

      console.log(`开始并发执行 ${crawlers.length} 个爬虫任务...`);
      
      // 使用更安全的并发控制，避免一个任务失败影响其他任务
      const results = await Promise.allSettled(
        crawlers.map(crawler => crawler.crawl())
      );
      
      // 检查结果并报告任何失败的任务
      let failedCount = 0;
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`任务 ${crawlers[index].getTaskId()} 失败:`, result.reason);
          failedCount++;
        }
      });
      
      const successCount = crawlers.length - failedCount;
      console.log(`爬取任务完成: ${successCount} 成功, ${failedCount} 失败`);
    } catch (error) {
      console.error('爬取出错:', error);
    } finally {
      process.removeListener('SIGINT', sigintHandler);
      currentCrawlers = [];
      rl.close();
    }
  });
}

async function createTask(rl: any) {
  rl.question('请输入起始网址: ', async (urlAnswer: string) => {
    try {
      const url = new URL(urlAnswer);
      const taskId = url.hostname;
      // 修改配置文件路径，将其放在对应的文件夹内
      const taskDir = path.join('tasksConfig', taskId);
      const configPath = path.join(taskDir, `${taskId}.json`);

      if (fs.existsSync(configPath)) {
        console.log(`任务 ${taskId} 已存在。`);
      } else {
        // 创建任务文件夹
        fs.mkdirSync(taskDir, { recursive: true });
        
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