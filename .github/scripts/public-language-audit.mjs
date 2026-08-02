import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium as playwrightChromium } from 'playwright';
import chromium from '@sparticuz/chromium';

const root = process.cwd();
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'reports', 'public-language-audit');
fs.mkdirSync(outDir, { recursive: true });

const collectHtml = (directory) => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectHtml(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath);
  }
  return files;
};

const targets = collectHtml(dist).map((filePath) => {
  const relative = path.relative(dist, filePath).replace(/\\/g, '/');
  let pathname;
  if (relative === 'index.html') pathname = '/';
  else if (relative.endsWith('/index.html')) pathname = `/${relative.slice(0, -'index.html'.length)}`;
  else pathname = `/${relative}`;
  return { filePath, pathname, relative };
}).sort((a, b) => a.pathname.localeCompare(b.pathname, 'ru'));

console.log(`FOUND_HTML ${targets.length}`);
for (const target of targets) console.log(`TARGET ${target.pathname}`);

const port = '4199';
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(root, 'scripts', 'server.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ['ignore', 'pipe', 'pipe'],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Preview server timeout')), 12000);
  server.stdout.on('data', (chunk) => {
    if (chunk.toString().includes('Preview:')) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  server.on('exit', (code) => reject(new Error(`Preview server exited: ${code}`)));
});

const executablePath = await chromium.executablePath();
const browser = await playwrightChromium.launch({
  executablePath,
  args: [...chromium.args, '--no-sandbox'],
  headless: true,
});

const normalize = (value) => String(value ?? '')
  .replace(/\u00a0/g, ' ')
  .replace(/[\t ]+/g, ' ')
  .replace(/\s*\n\s*/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const pages = [];
try {
  const context = await browser.newContext({
    locale: 'ru-RU',
    viewport: { width: 1440, height: 1000 },
  });

  for (const target of targets) {
    const page = await context.newPage();
    const response = await page.goto(`${origin}${target.pathname}`, { waitUntil: 'networkidle', timeout: 30000 });
    if (!response?.ok()) throw new Error(`${target.pathname}: HTTP ${response?.status()}`);

    const extracted = await page.evaluate(() => {
      const visible = (el) => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        if (el.closest('[hidden], [aria-hidden="true"], template, script, style, noscript, svg')) return false;
        return true;
      };
      const clean = (text) => String(text ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      const selector = 'h1,h2,h3,h4,p,li,summary,button,a,label,figcaption,blockquote,dt,dd,th,td,small';
      const blocks = [];
      for (const el of document.querySelectorAll(selector)) {
        if (!visible(el)) continue;
        const text = clean(el.innerText || el.textContent);
        if (!text) continue;
        const nested = [...el.querySelectorAll(selector)].some((child) => visible(child) && clean(child.innerText || child.textContent) === text);
        if (nested) continue;
        blocks.push({
          tag: el.tagName.toLowerCase(),
          text,
          href: el instanceof HTMLAnchorElement ? el.getAttribute('href') || '' : '',
          id: el.id || '',
          classes: [...el.classList].slice(0, 4),
        });
      }
      return {
        title: document.title,
        h1: clean(document.querySelector('h1')?.innerText || ''),
        canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        robots: document.querySelector('meta[name="robots"]')?.content || '',
        bodyText: document.body.innerText,
        blocks,
      };
    });

    pages.push({
      url: extracted.canonical || `https://yuristshevchuk.com${target.pathname}`,
      pathname: target.pathname,
      sourceFile: target.relative,
      title: normalize(extracted.title),
      h1: normalize(extracted.h1),
      robots: normalize(extracted.robots),
      bodyText: normalize(extracted.bodyText),
      blocks: extracted.blocks.map((item) => ({ ...item, text: normalize(item.text) })),
    });
    await page.close();
    console.log(`AUDITED ${target.pathname}: ${extracted.blocks.length} blocks`);
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

const report = {
  generatedAt: new Date().toISOString(),
  buildSha: process.env.GITHUB_SHA || '',
  pageCount: pages.length,
  pages,
};
fs.writeFileSync(path.join(outDir, 'public-text.json'), `${JSON.stringify(report, null, 2)}\n`);

const md = ['# Публичный текст сайта', '', `Страниц: ${pages.length}`, ''];
for (const page of pages) {
  md.push(`## ${page.pathname}`, '', `**Title:** ${page.title}`, '', `**H1:** ${page.h1}`, '', `**Robots:** ${page.robots}`, '');
  for (const block of page.blocks) md.push(`- [${block.tag}] ${block.text}`);
  md.push('');
}
fs.writeFileSync(path.join(outDir, 'public-text.md'), `${md.join('\n')}\n`);

if (pages.length < 30) throw new Error(`Expected at least 30 generated pages, got ${pages.length}`);
console.log(`Public language audit export completed: ${pages.length} pages.`);
