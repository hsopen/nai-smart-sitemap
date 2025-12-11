import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';

async function generateSitemap() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('请选择操作:');
  console.log('1. 为所有站点生成网站地图');
  console.log('2. 为特定站点生成网站地图');

  rl.question('请输入选项编号: ', async (answer: string) => {
    const choice = parseInt(answer);

    try {
      if (choice === 1) {
        await generateAllSitemaps();
      } else if (choice === 2) {
        rl.question('请输入站点域名 (例如: www.madison-reed.com): ', async (domain: string) => {
          if (domain.trim()) {
            await generateSiteSitemap(domain.trim());
          } else {
            console.log('域名不能为空。');
          }
          rl.close();
        });
        return;
      } else {
        console.log('无效的选项。');
      }
    } catch (error) {
      console.error('生成网站地图时出错:', error);
    } finally {
      rl.close();
    }
  });
}

async function generateAllSitemaps() {
  const outputDir = 'output';
  if (!fs.existsSync(outputDir)) {
    console.log('output目录不存在。');
    return;
  }

  const sites = fs.readdirSync(outputDir).filter(file => 
    fs.statSync(path.join(outputDir, file)).isDirectory()
  );

  if (sites.length === 0) {
    console.log('未找到任何站点目录。');
    return;
  }

  console.log(`找到 ${sites.length} 个站点，开始生成网站地图...`);

  for (const site of sites) {
    try {
      await generateSiteSitemap(site);
    } catch (error) {
      console.error(`为站点 ${site} 生成网站地图时出错:`, error);
    }
  }

  console.log('所有网站地图生成完成。');
}

async function generateSiteSitemap(domain: string) {
  const siteOutputDir = path.join('output', domain);
  if (!fs.existsSync(siteOutputDir)) {
    console.log(`站点目录 ${siteOutputDir} 不存在。`);
    return;
  }

  console.log(`正在为站点 ${domain} 生成网站地图...`);

  // 收集所有HTML文件中的链接
  const urls = new Set<string>();
  
  const files = fs.readdirSync(siteOutputDir).filter(file => 
    file.endsWith('.txt')
  );

  console.log(`找到 ${files.length} 个文件，正在提取链接...`);

  for (const file of files) {
    try {
      const filePath = path.join(siteOutputDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // 尝试从文件内容中提取原始URL
      const urlMatch = content.match(/<meta[^>]*name=["']original-url["'][^>]*content=["']([^"']*)["'][^>]*>/i);
      if (urlMatch && urlMatch[1]) {
        urls.add(urlMatch[1]);
      }
    } catch (error) {
      console.error(`处理文件 ${file} 时出错:`, error);
    }
  }

  if (urls.size === 0) {
    console.log(`在站点 ${domain} 中未找到任何链接。`);
    return;
  }

  // 生成网站地图XML
  const sitemapXml = generateSitemapXml(Array.from(urls));
  const sitemapPath = path.join(siteOutputDir, 'sitemap.xml');
  
  fs.writeFileSync(sitemapPath, sitemapXml);
  console.log(`站点 ${domain} 的网站地图已生成，包含 ${urls.size} 个URL，保存在: ${sitemapPath}`);
}

function generateSitemapXml(urls: string[]): string {
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  const xmlFooter = '</urlset>';
  
  let xmlContent = '';
  const now = new Date().toISOString();
  
  for (const url of urls) {
    xmlContent += `  <url>\n`;
    xmlContent += `    <loc>${url}</loc>\n`;
    xmlContent += `    <lastmod>${now}</lastmod>\n`;
    xmlContent += `    <changefreq>weekly</changefreq>\n`;
    xmlContent += `    <priority>0.8</priority>\n`;
    xmlContent += `  </url>\n`;
  }
  
  return xmlHeader + xmlContent + xmlFooter;
}

// 如果直接运行此脚本，则执行主函数
// 使用ES模块兼容的方式检查是否为主模块
const isMainModule = process.argv[1] && process.argv[1] === import.meta.filename;

if (isMainModule) {
  generateSitemap().catch(console.error);
}

export { generateSitemap, generateAllSitemaps, generateSiteSitemap };