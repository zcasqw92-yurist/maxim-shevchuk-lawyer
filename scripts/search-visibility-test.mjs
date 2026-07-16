import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];

const servicePages = {
  "dosudebnoe-uregulirovanie": "Когда нужна досудебная претензия и что проверяет юрист",
  "vozvrat-deneg": "Как юрист помогает вернуть деньги за товар, услугу, работу или по договору",
  "zhaloby-i-obrashcheniya": "Как подготовить жалобу на бездействие, отказ или нарушение прав",
  "iskovoe-zayavlenie": "Что входит в составление искового заявления в суд",
  "spory-biznesa": "Договорные споры и взыскание задолженности между ИП и организациями",
  marketpleysy: "Юрист для продавцов Ozon, Wildberries и Яндекс Маркета",
};

const readPage = (route) => readFile(join(dist, route, "index.html"), "utf8");
const count = (text, pattern) => (text.match(pattern) || []).length;

const home = await readFile(join(dist, "index.html"), "utf8");
if (count(home, /data-search-visibility="home"/g) !== 1) errors.push("Главная: нужен один видимый экспертный поисковый блок");
if (!home.includes("Юрист по гражданским делам в Москве и дистанционно по России")) errors.push("Главная: отсутствует основной поисковый заголовок");
if (!home.includes("Материал подготовлен")) errors.push("Главная: отсутствует авторство материала");
if (!home.includes("Актуализировано")) errors.push("Главная: отсутствует дата актуализации");
if (/data-search-visibility="home"[^>]*(?:hidden|aria-hidden="true")/.test(home)) errors.push("Главная: поисковый блок не должен быть скрыт от пользователей");

for (const slug of Object.keys(servicePages)) {
  if (!home.includes(`href="/uslugi/${slug}/"`)) errors.push(`Главная: отсутствует внутренняя ссылка на ${slug}`);
}
const homeMain = home.match(/<main[^>]*>[\s\S]*?<\/main>/i)?.[0] || "";
const homePhraseCount = count(homeMain.toLocaleLowerCase("ru"), /юрист по гражданским делам/g);
if (homePhraseCount > 2) errors.push(`Главная: избыточное повторение ключевой фразы в видимом содержании (${homePhraseCount})`);

const directory = await readPage("uslugi");
if (count(directory, /data-search-visibility="services"/g) !== 1) errors.push("Каталог услуг: нужен один экспертный поисковый блок");
if (!directory.includes("Юридические услуги по гражданским, денежным и договорным спорам")) errors.push("Каталог услуг: отсутствует содержательный заголовок");

for (const [slug, title] of Object.entries(servicePages)) {
  const html = await readPage(join("uslugi", slug));
  if (count(html, new RegExp(`data-search-visibility="${slug}"`, "g")) !== 1) errors.push(`${slug}: нужен один экспертный блок`);
  if (!html.includes(title)) errors.push(`${slug}: отсутствует индивидуальный заголовок`);
  if (!html.includes("Какие сведения подготовить")) errors.push(`${slug}: отсутствует практический список материалов`);
  if (!html.includes("Материал подготовлен")) errors.push(`${slug}: отсутствует авторство`);
  if (!html.includes("Актуализировано")) errors.push(`${slug}: отсутствует дата актуализации`);
  if (/data-search-visibility=[^>]*(?:hidden|aria-hidden="true")/.test(html)) errors.push(`${slug}: экспертный блок скрыт`);
  const section = html.match(/<section class="section section--search-guide section--service-guide"[\s\S]*?<\/section>/)?.[0] || "";
  const words = section.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
  if (words < 140) errors.push(`${slug}: недостаточно полезного уникального текста (${words} слов)`);
}

const styles = await readFile(join(dist, "assets", "styles.css"), "utf8");
for (const marker of [
  ".section--search-guide {",
  ".search-guide__grid {",
  ".service-guide__layout {",
  "@media (max-width: 680px)",
]) {
  if (!styles.includes(marker)) errors.push(`styles.css: отсутствует ${marker}`);
}

const config = await readFile(join(root, "site.config.mjs"), "utf8");
for (const marker of [
  'google: env("GOOGLE_SITE_VERIFICATION")',
  'yandex: env("YANDEX_SITE_VERIFICATION")',
  'indexNowKey: env("INDEXNOW_KEY") || "f5b271bbe6a4c4f4f18fe9a6a3f67158"',
  'defaultTitle: "Юрист по гражданским делам в Москве | Максим Шевчук"',
]) {
  if (!config.includes(marker)) errors.push(`site.config.mjs: отсутствует настройка ${marker}`);
}

const workflow = await readFile(join(root, ".github", "workflows", "pages.yml"), "utf8");
for (const marker of [
  "SITE_PRODUCTION: 'true'",
  "GOOGLE_SITE_VERIFICATION: ${{ vars.GOOGLE_SITE_VERIFICATION }}",
  "YANDEX_SITE_VERIFICATION: ${{ vars.YANDEX_SITE_VERIFICATION }}",
  "INDEXNOW_KEY: ${{ vars.INDEXNOW_KEY }}",
  "npm run submit:indexnow",
]) {
  if (!workflow.includes(marker)) errors.push(`pages.yml: отсутствует настройка ${marker}`);
}
if (/if:\s*\$\{\{\s*env\.INDEXNOW_KEY/.test(workflow)) errors.push("pages.yml: IndexNow не должен зависеть от необязательного секрета");

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Search visibility checks passed: visible expert content, internal links, authorship, production indexing and IndexNow hooks");
