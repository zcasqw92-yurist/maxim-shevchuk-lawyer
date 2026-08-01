import fs from 'node:fs';

const reportPath = 'reports/cluster-research/warranty-repair-serp.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const query = String(report.query || process.env.QUERY_TEXT || '').trim();
const params = new URLSearchParams({ q: query, num: '10', hl: 'ru', gl: 'ru', filter: '0', pws: '0' });
const response = await fetch(`https://www.google.com/search?${params}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    Cookie: 'CONSENT=YES+cb.20210720-07-p0.en+FX+410',
  },
  redirect: 'follow',
  signal: AbortSignal.timeout(30000),
});
const html = await response.text();
fs.writeFileSync('reports/cluster-research/google-direct.html', html);
const challenge = /unusual traffic|sorry\/index|detected unusual|captcha/i.test(html);
const decode = (value) => String(value || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const links = [];
for (const match of html.matchAll(/<a[^>]+href="(?:\/url\?q=|\/url\?url=)(https?%3A%2F%2F[^&"]+|https?:\/\/[^&"]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
  let url = match[1];
  try { url = decodeURIComponent(url); } catch {}
  try {
    const parsed = new URL(url);
    if (/google\./i.test(parsed.hostname)) continue;
    const title = decode(match[2]);
    if (!title || title.length < 3) continue;
    if (links.some((item) => item.url.replace(/\/$/, '') === url.replace(/\/$/, ''))) continue;
    links.push({ position: links.length + 1, title, url, domain: parsed.hostname.replace(/^www\./, ''), snippet: '', placementType: 'organic' });
  } catch {}
}
report.results.google = {
  engine: 'google',
  provider: 'direct-html',
  region: 'Россия; интерфейс русский',
  organicResultsReviewed: links.length,
  sponsoredResultsObserved: 0,
  minimumMet: !challenge && response.ok && links.length >= 5,
  organicResults: links.slice(0, 10),
  sponsoredResults: [],
  ...(challenge ? { error: 'Google unusual-traffic challenge' } : {}),
  ...(!response.ok ? { error: `Google HTTP ${response.status}` } : {}),
};
report.gatePassed = Boolean(report.results.yandex?.minimumMet && report.results.google.minimumMet);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Google direct: status=${response.status}, challenge=${challenge}, bytes=${html.length}, organic=${links.length}, passed=${report.results.google.minimumMet}`);
for (const item of links.slice(0, 10)) console.log(`GOOGLE ${item.position}: ${item.domain} — ${item.title}`);
if (!report.gatePassed) process.exitCode = 1;
