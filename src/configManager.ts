import fs from 'fs';
import path from 'path';
import { TaskConfig } from './types.js';

const CONFIG_DIR = 'tasksConfig';

export class ConfigManager {
  static async loadTaskConfigs(): Promise<TaskConfig[]> {
    const configs: TaskConfig[] = [];
    
    // 检查配置目录是否存在
    if (!fs.existsSync(CONFIG_DIR)) {
      return configs;
    }
    
    const files = fs.readdirSync(CONFIG_DIR);
    
    for (const file of files) {
      const fullPath = path.join(CONFIG_DIR, file);
      const stat = fs.statSync(fullPath);
      
      // 检查是否为目录
      if (stat.isDirectory()) {
        // 在目录中查找配置文件
        const configFileName = `${file}.json`;
        const configFilePath = path.join(fullPath, configFileName);
        
        if (fs.existsSync(configFilePath)) {
          try {
            const data = fs.readFileSync(configFilePath, 'utf-8');
            const config: TaskConfig = JSON.parse(data);
            configs.push(config);
          } catch (error) {
            console.error(`加载配置文件 ${configFilePath} 时出错:`, error);
          }
        }
      }
    }
    
    return configs;
  }
  
  static async saveTaskConfig(config: TaskConfig): Promise<void> {
    // 确保任务目录存在
    const taskDir = path.join(CONFIG_DIR, config.id);
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }
    
    // 保存配置文件到任务目录中
    const filePath = path.join(taskDir, `${config.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  }
  
  static getTaskConfigPath(taskId: string): string {
    return path.join(CONFIG_DIR, taskId, `${taskId}.json`);
  }
}