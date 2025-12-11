import fs from 'fs';
import path from 'path';
import { TaskConfig } from './types.js';

const CONFIG_DIR = 'tasksConfig';

export class ConfigManager {
  static async loadTaskConfigs(): Promise<TaskConfig[]> {
    const configs: TaskConfig[] = [];
    const files = fs.readdirSync(CONFIG_DIR);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(CONFIG_DIR, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const config: TaskConfig = JSON.parse(data);
          configs.push(config);
        } catch (error) {
          console.error(`加载配置文件 ${file} 时出错:`, error);
        }
      }
    }
    
    return configs;
  }
  
  static async saveTaskConfig(config: TaskConfig): Promise<void> {
    const filePath = path.join(CONFIG_DIR, `${config.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  }
  
  static async createDefaultConfig(id: string, startUrl: string): Promise<TaskConfig> {
    const url = new URL(startUrl);
    const config: TaskConfig = {
      id,
      maxProducts: 1000,
      startUrl,
      threads: 5,
      proxies: [],
      selectors: ['.product', '.item', '.product-item'],
      mode: 'cheerio'
    };
    
    await this.saveTaskConfig(config);
    return config;
  }
}