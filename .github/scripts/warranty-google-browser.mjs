import fs from 'node:fs';
import { chromium as playwrightChromium } from 'playwright';
import chromium from '@sparticuz/chromium';

const reportPath = 'reports/cluster-research/warranty-repair-serp.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const query = String(report.query || process.env.QUERY_TEXT || '').trim();
const executablePath = await chromium.executablePath();
const browser = await playwrightChromium.launch({
  executablePath,
  args: [...chromium.args, '--no-sandbox', '--disable-blink-features=AutomationControlled'],
  headless: true,
});
try {
  const context = await browser.newContext({
    locale: 'ru-RU',
    viewport: { width: 1365, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    extraHTTPHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8' },
  });
  await context.addCookies([{ name: 'CONSENT', value: 'YES+cb.20210720-07-p0.en+FX+410', domain: '.google.com', path: '/' }]);
  const page = await context.newPage();
  const params = new URLSearchParams({ q: query, num: '10', hl: 'ru', gl: 'ru', filter: '0', pws: '0' });
  const response = await page.goto(`https://www.google.com/search?${params}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  const html = await page.content();
  fs.writeFileSync('reports/cluster-research/google-browser.html', html);
  await page.screenshot({ path: 'reports/cluster-research/google-browser.png', fullPage: true });
  const challenge = /unusual traffic|sorry\/index|detected unusual|captcha/i.test(html);
  const organic = await page.locator('a:has(h3)').evaluateAll((anchors) => {
    const seen = new Set();
    const items = [];
    for (const anchor of anchors) {
      const href = anchor.href || '';
      const h3 = anchor.querySelector('h3');
      const title = h3?.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (!href.startsWith('http') || !title) continue;
      let hostname = '';
      try { hostname = new URL(href).hostname.replace(/^www\./, ''); } catch { continue; }
      if (/google\./i.test(hostname) || seen.has(href.replace(/\/$/, ''))) continue;
      seen.add(href.replace(/\/$/, ''));
      const resultRoot = anchor.closest('[data-snhf], .MjjYud, .g, [data-hveid]');
      const text = resultRoot?.textContent?.replace(/\s+/g, ' ').trim() || '';
      items.push({ position: items.length + 1, title, url: href, domain: hostname, snippet: text.slice(title.length, title.length + 500).trim(), placementType: 'organic' });
    }
    return items;
  });
  report.results.google = {
    engine: 'google',
    provider: 'browser-rendered',
    region: 'Россия; интерфейс русский',
    organicResultsReviewed: organic.length,
    sponsoredResultsObserved: 0,
    minimumMet: !challenge && Boolean(response?.ok()) && organic.length >= 5,
    organicResults: organic.slice(0, 10),
    sponsoredResults: [],
    ...(challenge ? { error: 'Google unusual-traffic challenge' } : {}),
    ...(!response?.ok() ? { error: `Google HTTP ${response?.status() || 0}` } : {}),
  };
  report.gatePassed = Boolean(report.results.yandex?.minimumMet && report.results.google.minimumMet);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Google browser: status=${response?.status() || 0}, challenge=${challenge}, organic=${organic.length}, passed=${report.results.google.minimumMet}`);
  for (const item of organic.slice(0, 10)) console.log(`GOOGLE ${item.position}: ${item.domain} — ${item.title}`);
  if (!report.gatePassed) process.exitCode = 1;
} finally {
  await browser.close();
}
