import fs from 'fs';
import path from 'path';
import { URL } from 'url';

export class Utils {
  // 检查URL是否在同一域名下
  static isSameDomain(baseUrl: string, targetUrl: string): boolean {
    try {
      const base = new URL(baseUrl);
      const target = new URL(targetUrl);
      return base.hostname === target.hostname;
    } catch {
      return false;
    }
  }

  // 将相对URL转换为绝对URL
  static toAbsoluteUrl(baseUrl: string, relativeUrl: string): string {
    try {
      return new URL(relativeUrl, baseUrl).href;
    } catch {
      return relativeUrl;
    }
  }

  // 检查URL是否指向网页（而不是图片、视频、文档等）
  static isWebPage(url: string): boolean {
    const nonWebExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.ico',  // 图片
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',          // 视频
      '.mp3', '.wav', '.ogg', '.flac',                          // 音频
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', // 文档
      '.zip', '.rar', '.tar', '.gz', '.7z',                     // 压缩包
      '.css', '.js', '.json', '.xml'                            // 资源文件
    ];

    const lowerUrl = url.toLowerCase();
    return !nonWebExtensions.some(ext => lowerUrl.endsWith(ext));
  }

  // 将HTML内容保存到文件
  static saveHtmlToFile(html: string, url: string, outputPath: string, index: number): boolean {
    try {
      // 如果目录不存在则创建
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      // 添加包含原始URL的注释
      const contentWithComment = `<!-- Original URL: ${url} -->\n${html}`;
      
      // 使用零填充的文件名
      const fileName = `${index.toString().padStart(7, '0')}.txt`;
      const filePath = path.join(outputPath, fileName);
      
      // 写入文件
      fs.writeFileSync(filePath, contentWithComment);
      
      // 检查文件大小
      const stats = fs.statSync(filePath);
      if (stats.size < 50 * 1024) { // 小于50KB
        fs.unlinkSync(filePath); // 删除文件
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`保存URL ${url} 的文件时出错:`, error);
      return false;
    }
  }

  // 从列表中获取随机代理
  static getRandomProxy(proxies: string[]): string | undefined {
    if (proxies.length === 0) return undefined;
    return proxies[Math.floor(Math.random() * proxies.length)];
  }
}