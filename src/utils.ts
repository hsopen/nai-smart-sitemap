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
  static saveHtmlToFile(html: string, url: string, outputDir: string, index: number): boolean {
    try {
      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 在HTML中添加原始URL的元标签，以便后续生成网站地图时使用
      const htmlWithMeta = html.replace(
        '<head>',
        `<head>\n  <meta name="original-url" content="${url}">`
      );

      // 生成文件名（六位数字，前导零填充）
      const fileName = `${index.toString().padStart(7, '0')}.txt`;
      const filePath = path.join(outputDir, fileName);

      // 保存文件
      fs.writeFileSync(filePath, htmlWithMeta);
      return true;
    } catch (error) {
      console.error(`保存文件失败 ${url}:`, error);
      return false;
    }
  }
}