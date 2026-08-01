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
  const bodyText = await page.locator('body').innerText().catch(() => '');
  fs.writeFileSync('reports/cluster-research/google-browser.html', html);
  await page.screenshot({ path: 'reports/cluster-research/google-browser.png', fullPage: true });
  const finalUrl = page.url();
  const challenge = /\/sorry\//i.test(finalUrl)
    || /our systems have detected unusual traffic|наши системы обнаружили необычный трафик/i.test(bodyText)
    || await page.locator('form#captcha-form, iframe[src*="recaptcha"], [data-sitekey]').count() > 0;
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
  const sponsored = await page.locator('a:has(h3)').evaluateAll((anchors) => {
    const items = [];
    for (const anchor of anchors) {
      const root = anchor.closest('[data-text-ad], [data-rw], .uEierd');
      if (!root) continue;
      const text = root.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (!/Реклама|Sponsored|Ad\b/i.test(text)) continue;
      const href = anchor.href || '';
      const title = anchor.querySelector('h3')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (!href.startsWith('http') || !title) continue;
      let hostname = '';
      try { hostname = new URL(href).hostname.replace(/^www\./, ''); } catch { continue; }
      items.push({ position: items.length + 1, title, url: href, domain: hostname, snippet: text.slice(0, 500), placementType: 'sponsored', sponsoredLabel: 'Реклама/Sponsored' });
    }
    return items;
  });
  const sponsoredUrls = new Set(sponsored.map((item) => item.url.replace(/\/$/, '')));
  const cleanOrganic = organic.filter((item) => !sponsoredUrls.has(item.url.replace(/\/$/, '')));
  report.results.google = {
    engine: 'google',
    provider: 'browser-rendered',
    region: 'Россия; интерфейс русский',
    organicResultsReviewed: cleanOrganic.length,
    sponsoredResultsObserved: sponsored.length,
    minimumMet: !challenge && Boolean(response?.ok()) && cleanOrganic.length >= 5,
    organicResults: cleanOrganic.slice(0, 10),
    sponsoredResults: sponsored.slice(0, 10),
    ...(challenge ? { error: 'Google unusual-traffic challenge' } : {}),
    ...(!response?.ok() ? { error: `Google HTTP ${response?.status() || 0}` } : {}),
  };
  report.gatePassed = Boolean(report.results.yandex?.minimumMet && report.results.google.minimumMet);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Google browser: status=${response?.status() || 0}, challenge=${challenge}, organic=${cleanOrganic.length}, sponsored=${sponsored.length}, passed=${report.results.google.minimumMet}`);
  for (const item of cleanOrganic.slice(0, 10)) console.log(`GOOGLE ${item.position}: ${item.domain} — ${item.title}`);
  if (!report.gatePassed) process.exitCode = 1;
} finally {
  await browser.close();
}
