import fs from 'fs';
import path from 'path';

export class UrlManager {
  private taskId: string;
  private visitedUrlsFile: string;
  private processedCountFile: string;

  constructor(taskId: string) {
    this.taskId = taskId;
    const taskDir = path.join('tasksConfig', taskId);
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }
    
    this.visitedUrlsFile = path.join(taskDir, 'visited.txt');
    this.processedCountFile = path.join(taskDir, 'processedCount.txt');
  }

  // 获取所有已访问的URL
  getVisitedUrls(): Set<string> {
    if (!fs.existsSync(this.visitedUrlsFile)) {
      return new Set();
    }
    
    const data = fs.readFileSync(this.visitedUrlsFile, 'utf-8');
    return new Set(data.split('\n').filter(url => url.trim() !== ''));
  }

  // 添加URL到已访问集合
  addVisitedUrl(url: string): void {
    fs.appendFileSync(this.visitedUrlsFile, `${url}\n`);
  }

  // 获取已处理的数量
  getProcessedCount(): number {
    if (!fs.existsSync(this.processedCountFile)) {
      return 0;
    }
    
    const data = fs.readFileSync(this.processedCountFile, 'utf-8');
    return parseInt(data.trim()) || 0;
  }

  // 更新已处理的数量
  updateProcessedCount(count: number): void {
    fs.writeFileSync(this.processedCountFile, count.toString());
  }

  // 规范化URL用于比较（移除查询参数和片段）
  normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }
}