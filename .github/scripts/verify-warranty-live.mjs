const expectedSha = '311f0b5aec8553a61812e41b495e325b1dc89583';
const base = 'https://yuristshevchuk.com';
const articlePath = '/razbory/garantiynyy-remont-avtomobilya-bolshe-45-dney/';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchText = async (path) => {
  const url = `${base}${path}${path.includes('?') ? '&' : '?'}nonce=${Date.now()}`;
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  return { response, text };
};
let lastError = '';
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const build = await fetchText('/build-info.json');
    if (!build.response.ok) throw new Error(`build-info HTTP ${build.response.status}`);
    const info = JSON.parse(build.text);
    if (info.sha !== expectedSha) throw new Error(`ожидался SHA ${expectedSha}, получен ${info.sha || 'пусто'}`);

    const article = await fetchText(articlePath);
    if (!article.response.ok) throw new Error(`article HTTP ${article.response.status}`);
    if (new URL(article.response.url).hostname !== 'yuristshevch.com' && new URL(article.response.url).hostname !== 'yuristshevchuk.com') throw new Error(`неверный конечный домен ${article.response.url}`);
    const html = article.text;
    const required = [
      'Гарантийный ремонт автомобиля превысил 45 дней: что требовать от дилера',
      'Какое требование выбрать после нарушения срока',
      'Ожидание запчастей не продлевает срок автоматически',
      'Обязан ли дилер выдать подменный автомобиль',
      '/uslugi/vozvrat-deneg/',
      'garantiynyy-remont-avtomobilya-bolshe-45-dney',
    ];
    for (const marker of required) if (!html.includes(marker)) throw new Error(`на странице отсутствует маркер: ${marker}`);
    if (!/rel=["']canonical["'][^>]+garantiynyy-remont-avtomobilya-bolshe-45-dney|garantiynyy-remont-avtomobilya-bolshe-45-dney[^>]+rel=["']canonical["']/i.test(html)) throw new Error('canonical не подтверждён');
    if (/name=["']robots["'][^>]+noindex/i.test(html)) throw new Error('обнаружен noindex');
    if (!html.includes('"Article"') && !html.includes('"@type":"Article"') && !html.includes('"@type": "Article"')) throw new Error('Article JSON-LD не подтверждён');

    const publications = await fetchText('/editorial-publications.json');
    if (!publications.response.ok) throw new Error(`editorial-publications HTTP ${publications.response.status}`);
    const manifest = JSON.parse(publications.text);
    const urls = [...(manifest.articles || []), ...(manifest.cases || [])].map((item) => item.url || item.path).filter(Boolean);
    if (!urls.some((url) => String(url).includes('garantiynyy-remont-avtomobilya-bolshe-45-dney'))) throw new Error('статья отсутствует в editorial-publications.json');
    const forbidden = /каннибализац|владелец интента|SERP|оплаченн(?:ая|ой) практик|практический элемент|контентная карточка/i;
    for (const item of urls) {
      const path = String(item).startsWith('http') ? new URL(item).pathname : String(item);
      const page = await fetchText(path);
      if (!page.response.ok) throw new Error(`${path}: HTTP ${page.response.status}`);
      const visible = page.text.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      if (forbidden.test(visible)) throw new Error(`${path}: обнаружена служебная формулировка`);
    }
    console.log(`LIVE OK: SHA ${expectedSha}, article ${articlePath}, publications ${urls.length}`);
    process.exit(0);
  } catch (error) {
    lastError = error?.message || String(error);
    console.log(`Попытка ${attempt}/30: ${lastError}`);
    if (attempt < 30) await sleep(10000);
  }
}
throw new Error(`Live-проверка не пройдена: ${lastError}`);
