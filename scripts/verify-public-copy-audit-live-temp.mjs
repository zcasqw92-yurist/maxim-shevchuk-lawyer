const base = new URL('https://yuristshevchuk.com/');
const paths = [
  '/razbory/chto-delat-posle-otkaza-policii/',
  '/razbory/vernut-dolg-bez-raspiski/',
  '/razbory/dolg-po-raspiske-prikaz-ili-isk/',
  '/razbory/dengi-v-dolg-na-chuzhuyu-kartu/',
  '/razbory/srok-vozvrata-dolga-ne-ukazan/',
  '/razbory/prodavets-propal-posle-perevoda/',
  '/razbory/vernut-dengi-za-neokazannuyu-uslugu/',
  '/razbory/otkaz-ot-dogovora-okazaniya-uslug/',
];

const forbidden = [
  /Что показывает оплаченная юридическая практика/iu,
  /практическ\w*\s+элемент/iu,
  /оплаченн\w*\s+(?:юридическ\w*\s+)?(?:практик\w*|работ\w*)/iu,
  /каннибализац/iu,
  /владелец\s+интента/iu,
  /поисков\w*\s+(?:интент|маршрут)/iu,
  /\bSEO\b|\bSERP\b/iu,
];

for (const pathname of paths) {
  const url = new URL(pathname, base);
  url.searchParams.set('copy_audit', Date.now().toString());
  const response = await fetch(url, {
    headers: {
      'cache-control': 'no-cache, no-store, max-age=0',
      pragma: 'no-cache',
      accept: 'text/html',
    },
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`);
  for (const pattern of forbidden) {
    if (pattern.test(html)) throw new Error(`${pathname}: forbidden public-copy pattern ${pattern}`);
  }
  if (!/<main\b/i.test(html) || !/<h1\b/i.test(html)) {
    throw new Error(`${pathname}: expected article structure is missing`);
  }
  console.log(`Public copy verified: ${pathname}`);
}

console.log(`Live public-copy audit passed: ${paths.length} analyses checked`);
