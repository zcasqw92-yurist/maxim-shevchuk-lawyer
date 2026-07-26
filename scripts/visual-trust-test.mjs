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
  "assets/visual-trust.js",
]) assert(home.includes(marker), `Главная страница не содержит обязательный маркер: ${marker}`);

assert(home.includes('class="hero__visual"'), "Главная страница должна содержать статичный фотопортрет без обещания будущего видео");
assert(home.indexOf("section--prices") < home.indexOf("section--process-guarantees"), "Гарантии должны находиться после блока стоимости");
assert(home.includes("mobile-contact--dual"), "Согласованная мобильная панель должна сохраниться");
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
  "section--document-samples",
  "section--featured-case",
  "section--visual-cases",
  "section--case-studies",
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
for (const path of await collectHtml(join(root, "dist"))) {
  const html = await readFile(path, "utf8");
  for (const marker of forbiddenMarkers) {
    assert(!html.includes(marker), `Публичная страница содержит неподтверждённый материал: ${marker} (${path})`);
  }
}

console.log("Visual trust architecture: only confirmed materials are published");
