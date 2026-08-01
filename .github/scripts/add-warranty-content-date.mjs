import fs from 'node:fs';

const configPath = 'site.config.mjs';
let config = fs.readFileSync(configPath, 'utf8');
const pathLine = '    "/razbory/garantiynyy-remont-avtomobilya-bolshe-45-dney": "2026-08-01",';
if (!config.includes(pathLine)) {
  const marker = '    "/razbory/vernut-dengi-za-navyazannuyu-uslugu": "2026-08-01",';
  if (!config.includes(marker)) throw new Error('Content date marker not found');
  config = config.replace(marker, `${marker}\n${pathLine}`);
  fs.writeFileSync(configPath, config);
}

const manifestPath = 'reports/content-sessions/latest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const targetUrl = 'https://yuristshevchuk.com/razbory/garantiynyy-remont-avtomobilya-bolshe-45-dney/';
if (!manifest.contentChanges.some((item) => item.path === 'site.config.mjs')) {
  manifest.contentChanges.push({
    path: 'site.config.mjs',
    kind: 'content-date',
    contentId: 'warranty-repair-over-45-days',
    action: 'updated',
    expectedUrl: targetUrl,
  });
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
