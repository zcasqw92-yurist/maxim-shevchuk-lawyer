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
const officialHosts = [
  "pravo.gov.ru",
  "zpp.rospotrebnadzor.ru",
  "77.rospotrebnadzor.ru",
  "26.rospotrebnadzor.ru",
  "epp.genproc.gov.ru",
  "fas.gov.ru",
];

const home = await readFile(join(dist, "index.html"), "utf8");
if (count(home, /data-search-visibility="home"/g) !== 0) errors.push("Главная: повторяющий каталог поисковый блок должен быть удалён");
if (!home.includes('class="section section--services"')) errors.push("Главная: видимый каталог направлений должен сохраниться");

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
  if (!html.includes("Автоматическая проверка публикации: <time datetime=")) errors.push(`${slug}: отсутствует дата автоматической проверки публикации`);
  if (!html.includes("Правовая редакция: <time datetime=")) errors.push(`${slug}: отсутствует достоверная дата правовой редакции`);
  if (!html.includes("Материал носит общий информационный характер и не заменяет индивидуальный правовой анализ.")) errors.push(`${slug}: отсутствует предупреждение о границах общей информации`);
  if (/data-search-visibility=[^>]*(?:hidden|aria-hidden="true")/.test(html)) errors.push(`${slug}: экспертный блок скрыт`);
  const section = html.match(/<section class="section section--search-guide section--service-guide"[\s\S]*?<\/section>/)?.[0] || "";
  if (count(section, /data-official-sources/g) !== 1) errors.push(`${slug}: нужен один список официальных источников`);
  const externalLinks = [...section.matchAll(/<a href="(https:[^"]+)" target="_blank" rel="noopener">/g)]
    .map((match) => match[1].replaceAll("&amp;", "&"));
  if (externalLinks.length < 2) errors.push(`${slug}: нужно не менее двух официальных источников`);
  for (const url of externalLinks) {
    const hostname = new URL(url).hostname;
    if (!officialHosts.includes(hostname)) errors.push(`${slug}: источник не входит в список официальных доменов — ${hostname}`);
  }
  const words = section.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
  if (words < 140) errors.push(`${slug}: недостаточно полезного уникального текста (${words} слов)`);
}

const styles = await readFile(join(dist, "assets", "styles.css"), "utf8");
for (const marker of [
  ".section--search-guide {",
  ".search-guide__grid {",
  ".service-guide__layout {",
  ".service-guide__verification {",
  "@media (max-width: 680px)",
]) {
  if (!styles.includes(marker)) errors.push(`styles.css: отсутствует ${marker}`);
}

const config = await readFile(join(root, "site.config.mjs"), "utf8");
for (const marker of [
  'google: env("GOOGLE_SITE_VERIFICATION")',
  'yandex: env("YANDEX_SITE_VERIFICATION")',
  'indexNowKey: env("INDEXNOW_KEY") || "f5b271bbe6a4c4f4f18fe9a6a3f67158"',
  'defaultTitle: "Юрист по гражданским делам в Москве и Московской области | Максим Шевчук"',
  'publicLabel: "Офис в Химках · услуги по Москве и Московской области · онлайн по России"',
]) {
  if (!config.includes(marker)) errors.push(`site.config.mjs: отсутствует настройка ${marker}`);
}

const workflow = await readFile(join(root, ".github", "workflows", "pages.yml"), "utf8");
for (const marker of [
  "SITE_PRODUCTION: 'true'",
  "GOOGLE_SITE_VERIFICATION: ${{ vars.GOOGLE_SITE_VERIFICATION }}",
  "YANDEX_SITE_VERIFICATION: ${{ vars.YANDEX_SITE_VERIFICATION }}",
  "INDEXNOW_KEY: ${{ vars.INDEXNOW_KEY }}",
  "schedule:",
  "SITE_REVIEW_DATE=$(TZ=Europe/Moscow date +%F)",
  "npm run check",
  "INDEXNOW_CHANGED_DATE=\"$SITE_REVIEW_DATE\" npm run submit:indexnow",
]) {
  if (!workflow.includes(marker)) errors.push(`pages.yml: отсутствует настройка ${marker}`);
}
if (workflow.includes("npm run lock:indexing")) errors.push("pages.yml: production-сайт не должен снова закрываться от индексации");
if (/if:\s*\$\{\{\s*env\.INDEXNOW_KEY/.test(workflow)) errors.push("pages.yml: IndexNow не должен зависеть от необязательного секрета");

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (/lock:indexing/.test(packageJson.scripts.check || "")) errors.push("package.json: npm run check не должен менять production-индексацию");
if (!packageJson.scripts["check:preview-indexing-lock"]?.includes("lock:indexing")) errors.push("package.json: отдельная проверка закрытого preview должна сохраниться");

const indexNow = await readFile(join(root, "scripts", "submit-indexnow.mjs"), "utf8");
for (const marker of ["INDEXNOW_CHANGED_DATE", "lastmod", "--all", "нет URL с содержательным обновлением"]) {
  if (!indexNow.includes(marker)) errors.push(`submit-indexnow.mjs: отсутствует ${marker}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Search visibility checks passed: production indexing, geography and automatic IndexNow are configured");
