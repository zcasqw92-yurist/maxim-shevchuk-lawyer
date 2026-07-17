import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const home = await read("dist/index.html");
const contacts = await read("dist/kontakty/index.html");
const script = await read("dist/assets/visual-trust.js");

for (const marker of [
  "data-video-placeholder",
  "trust-strip__grid",
  "section--document-samples",
  "section--featured-case",
  "section--visual-cases",
  "section--value-editorial",
  "about-proof",
  "section--cta-portrait",
  "assets/visual-trust.js",
]) assert(home.includes(marker), `Главная страница не содержит обязательный маркер: ${marker}`);

assert((home.match(/class="document-sample proof-reveal"/g) || []).length === 3, "Должно быть ровно три образца документов");
assert((home.match(/data-proof-dialog=/g) || []).length === 3, "Должно быть ровно три диалога образцов документов");
assert(home.indexOf("section--prices") < home.indexOf("section--process-guarantees"), "Гарантии должны находиться после блока стоимости");
assert(home.indexOf("section--situations") < home.indexOf("section--featured-case"), "Главный кейс должен находиться после ситуаций");
assert(home.indexOf("section--services") < home.indexOf("section--visual-cases"), "Дополнительные кейсы должны находиться после услуг");
assert(home.includes("mobile-contact--dual"), "Согласованная мобильная панель должна сохраниться");
assert(!home.includes("yandex.ru/map-widget"), "На главной не должен загружаться iframe Яндекс Карт");
assert(contacts.includes("data-map-load"), "На странице контактов должен быть постер ленивой карты");
assert(!contacts.includes("yandex.ru/map-widget"), "Карта не должна загружаться до действия пользователя");
assert(script.includes("moscowHour() >= 8") && script.includes("moscowHour() < 22"), "Онлайн-статус должен работать с 08:00 до 22:00 МСК");

for (const name of [
  "document-pretenziya-demo.svg",
  "document-police-demo.svg",
  "document-claim-demo.svg",
  "case-autoclub-demo.svg",
  "case-engine-demo.svg",
  "case-land-demo.svg",
  "diploma-demo.svg",
]) await access(join(root, "dist", "assets", "images", name));

console.log("Visual trust architecture: OK");
