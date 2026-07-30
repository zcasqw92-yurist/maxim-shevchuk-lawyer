import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const home = await read("dist/index.html");
const contacts = await read("dist/kontakty/index.html");
const onlineStatusScript = await read("dist/assets/online-status.mjs");

for (const marker of [
  "trust-strip__grid",
  "section--value-editorial",
  "section--cta-portrait",
  "section--case-studies",
  'id="case-autoclub"',
  'id="case-debt-demand"',
  'id="case-police-review"',
  "assets/visual-trust.js",
]) assert(home.includes(marker), `Главная страница не содержит обязательный маркер: ${marker}`);

assert(home.includes('class="hero__visual"'), "Главная страница должна содержать статичный фотопортрет без обещания будущего видео");
assert(home.includes("mobile-contact--single"), "Мобильная панель должна содержать один прямой CTA в мессенджер");
assert(!home.includes("mobile-contact--dual"), "Двухкнопочная панель с callback не должна возвращаться");
assert(!home.includes("yandex.ru/map-widget"), "На главной не должен загружаться iframe Яндекс Карт");
assert(contacts.includes("data-map-load"), "На странице контактов должен быть постер ленивой карты");
assert(!contacts.includes("yandex.ru/map-widget"), "Карта не должна загружаться до действия пользователя");
assert(onlineStatusScript.includes("hour >= ONLINE_FROM_HOUR && hour < ONLINE_UNTIL_HOUR"), "Онлайн-статус должен использовать единое правило времени");

const demoAssets = [
  "document-pretenziya-demo.svg",
  "document-police-demo.svg",
  "document-claim-demo.svg",
  "case-autoclub-demo.svg",
  "case-engine-demo.svg",
  "case-land-demo.svg",
  "diploma-demo.svg",
];
for (const name of demoAssets) {
  const isPublished = await access(join(root, "dist", "assets", "images", name)).then(() => true).catch(() => false);
  assert(!isPublished, `Неподтверждённый демо-файл не должен публиковаться: ${name}`);
}

const collectHtml = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectHtml(path));
    else if (entry.name.endsWith(".html")) files.push(path);
  }
  return files;
};

const forbiddenMarkers = [
  "<form",
  "<input",
  "<select",
  "<textarea",
  "data-callback",
  "callback-dialog",
  "data-price-quiz",
  "price-quiz-dialog",
  "section--dark",
  "section--process-guarantees",
  "section--consultation",
  'data-search-visibility="home"',
  "section--document-samples",
  "section--featured-case",
  "section--visual-cases",
  "data-proof-open",
  "data-proof-dialog",
  "data-video-launch",
  "data-video-dialog",
  "about-proof",
  "Видео готовится",
  "Здесь будет короткое",
  "Демо-макет",
  "Демо-визуал",
  "демонстрационные обезличенные макеты",
  ...demoAssets,
];
const htmlFiles = await collectHtml(join(root, "dist"));
for (const path of htmlFiles) {
  const html = await readFile(path, "utf8");
  for (const marker of forbiddenMarkers) {
    if (path === join(root, "dist", "index.html")) {
      assert(!html.includes(marker), `Главная страница содержит повторяющийся, неподтверждённый или удалённый блок: ${marker}`);
    } else if (!["section--dark", "section--process-guarantees", "section--consultation", 'data-search-visibility="home"'].includes(marker)) {
      assert(!html.includes(marker), `Публичная страница содержит неподтверждённый или удалённый материал: ${marker} (${path})`);
    }
  }
}

const homeMain = home.match(/<main[^>]*>[\s\S]*?<\/main>/)?.[0] || "";
const sectionFlow = [
  'class="hero"',
  'class="trust-strip"',
  'class="contact-path contact-path--home"',
  'class="section section--situations"',
  'class="section section--services"',
  'class="section section--value section--value-editorial"',
  'class="section section--prices"',
  'class="section section--case-studies"',
  'class="section section--about-preview"',
  'class="section section--faq"',
  'class="section section--cta section--cta-portrait"',
];
let previousPosition = -1;
for (const marker of sectionFlow) {
  const position = homeMain.indexOf(marker);
  assert(position > previousPosition, `Нарушена последовательность содержательных блоков главной: ${marker}`);
  previousPosition = position;
}
assert((homeMain.match(/<h2\b/g) || []).length <= 8, "На главной снова появились повторяющиеся смысловые секции");
const directMessengerCtaCount = (homeMain.match(/data-dialog-open/g) || []).length;
assert(directMessengerCtaCount >= 10, "На главной недостаточно точек прямого обращения к юристу");
assert(directMessengerCtaCount <= 22, `На главной избыточное число прямых CTA: ${directMessengerCtaCount}`);
assert(!/data-(?:callback|price-quiz)-open/.test(homeMain), "На главной не должно быть альтернативных форм или квиза");

console.log(`Visual trust architecture: ${directMessengerCtaCount} direct messenger CTAs, verified cases, no forms, demo or unsupported materials`);
