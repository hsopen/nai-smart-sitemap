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
        await generateAllSitemaps(rl);
      } else if (choice === 2) {
        await generateSiteSelection(rl);
      } else {
        console.log('无效的选项。');
        rl.close();
      }
    } catch (error) {
      console.error('生成网站地图时出错:', error);
      rl.close();
    }
  });
}

async function generateSiteSelection(rl: any) {
  const outputDir = 'output';
  if (!fs.existsSync(outputDir)) {
    console.log('output目录不存在。');
    rl.close();
    return;
  }

  const sites = fs.readdirSync(outputDir).filter(file => 
    fs.statSync(path.join(outputDir, file)).isDirectory()
  );

  if (sites.length === 0) {
    console.log('未找到任何站点目录。');
    rl.close();
    return;
  }

  console.log('可用站点:');
  sites.forEach((site, index) => {
    console.log(`${index + 1}. ${site}`);
  });

  rl.question('请选择站点编号: ', async (siteIndex: string) => {
    const selectedIndex = parseInt(siteIndex) - 1;
    
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= sites.length) {
      console.log('无效的站点编号。');
      rl.close();
      return;
    }
    
    const selectedSite = sites[selectedIndex];
    await generateSiteSitemap(selectedSite);
    rl.close();
  });
}

async function generateAllSitemaps(rl: any) {
  const outputDir = 'output';
  if (!fs.existsSync(outputDir)) {
    console.log('output目录不存在。');
    rl.close();
    return;
  }

  const sites = fs.readdirSync(outputDir).filter(file => 
    fs.statSync(path.join(outputDir, file)).isDirectory()
  );

  if (sites.length === 0) {
    console.log('未找到任何站点目录。');
    rl.close();
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
  rl.close();
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
      
      // 尝试从文件内容中提取原始URL（注释格式）
      const urlMatch = content.match(/<!--\s*Original URL:\s*(https?:\/\/[^\s]+)\s*-->/i);
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

// 使用ES模块兼容的方式检查是否为主模块
const isMainModule = process.argv[1] && process.argv[1] === import.meta.filename;

if (isMainModule) {
  generateSitemap().catch(console.error);
}

export { generateSitemap, generateAllSitemaps, generateSiteSitemap };