import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];

const servicePages = {
  "dosudebnoe-uregulirovanie": "Что входит в досудебное урегулирование спора",
  "vzyskanie-dolga": "Как выстраивается взыскание долга по расписке, договору или переписке",
  "vozvrat-deneg": "Выберите ситуацию: основания возврата денег различаются",
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
  "cbr.ru",
  "www.vsrf.ru",
];

const home = await readFile(join(dist, "index.html"), "utf8");
if (count(home, /data-search-visibility="home"/g) !== 0) errors.push("Главная: повторяющий каталог поисковый блок должен быть удалён");
if (!home.includes('class="section section--services"')) errors.push("Главная: видимый каталог направлений должен сохраниться");
if (!home.includes("Досудебное урегулирование споров")) errors.push("Главная: H1 не закрепляет основную специализацию");
if (!home.includes("Сначала выясняю, можно ли решить спор без суда")) errors.push("Главная: первый экран не объясняет специализацию");
if (!home.includes("Помощь до суда и подготовка к дальнейшим действиям")) errors.push("Главная: каталог не показывает связь направлений");

for (const slug of Object.keys(servicePages)) {
  if (!home.includes(`href="/uslugi/${slug}/"`)) errors.push(`Главная: отсутствует внутренняя ссылка на ${slug}`);
}
const homeMain = home.match(/<main[^>]*>[\s\S]*?<\/main>/i)?.[0] || "";
const focusPhraseCount = count(homeMain.toLocaleLowerCase("ru"), /досудебн(?:ое|ого|ая|ую|ым|ой)\s+урегулирован/g);
if (focusPhraseCount > 8) errors.push(`Главная: избыточное повторение специализации в видимом содержании (${focusPhraseCount})`);

const directory = await readPage("uslugi");
if (count(directory, /data-search-visibility="services"/g) !== 1) errors.push("Каталог услуг: нужен один экспертный поисковый блок");
if (!directory.includes("Сначала проверяем возможность решить спор без суда")) errors.push("Каталог услуг: отсутствует заголовок о порядке работы");
if (!directory.includes("Основное направление</strong> — проверить документы")) errors.push("Каталог услуг: не объяснена роль основной специализации");
if (!directory.includes("Иск</strong> готовится")) errors.push("Каталог услуг: не объяснена роль судебного этапа");

for (const [slug, title] of Object.entries(servicePages)) {
  const html = await readPage(join("uslugi", slug));
  if (count(html, new RegExp(`data-search-visibility="${slug}"`, "g")) !== 1) errors.push(`${slug}: нужен один экспертный блок`);
  if (!html.includes(title)) errors.push(`${slug}: отсутствует индивидуальный заголовок`);
  if (!html.includes("Какие сведения подготовить")) errors.push(`${slug}: отсутствует практический список материалов`);
  if (!html.includes("Материал подготовлен")) errors.push(`${slug}: отсутствует авторство`);
  if (!html.includes("Проверено: <time datetime=")) errors.push(`${slug}: отсутствует дата автоматической проверки публикации`);
  if (!html.includes("Обновлено: <time datetime=")) errors.push(`${slug}: отсутствует достоверная дата правовой редакции`);
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

const pretrial = await readPage(join("uslugi", "dosudebnoe-uregulirovanie"));
for (const marker of [
  "Главная специализация",
  "Досудебное урегулирование споров",
  "Досудебная работа не ограничивается одной претензией",
  "Что будет в претензии и плане действий",
  "Как выстраивается досудебное урегулирование",
]) {
  if (!pretrial.includes(marker)) errors.push(`Досудебное урегулирование: отсутствует ключевой маркер ${marker}`);
}

const debtRecovery = await readPage(join("uslugi", "vzyskanie-dolga"));
for (const marker of [
  "Взыскание долга по расписке, договору, переводу или переписке",
  "Как выстраивается взыскание долга по расписке, договору или переписке",
  "Долг без расписки",
  "Приказ или иск",
]) {
  if (!debtRecovery.includes(marker)) errors.push(`Взыскание долга: отсутствует ключевой маркер ${marker}`);
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
  'defaultTitle: "Юрист по досудебному урегулированию | Максим Шевчук"',
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
  "workflow_dispatch:",
  "SITE_REVIEW_DATE=$(TZ=Europe/Moscow date +%F)",
  "node scripts/release-check.mjs",
  "actions/deploy-pages@v5",
]) {
  if (!workflow.includes(marker)) errors.push(`pages.yml: отсутствует настройка ${marker}`);
}
if (workflow.includes("schedule:")) errors.push("pages.yml: слепой плановый redeploy запрещён; production reconciliation должен зависеть от фактического SHA drift");
if (workflow.includes("npm run lock:indexing")) errors.push("pages.yml: production-сайт не должен снова закрываться от индексации");
if (workflow.includes("npm run check")) errors.push("pages.yml: полный browser-heavy npm run check должен выполняться до merge, а не удерживать production deployment");
if (/if:\s*\$\{\{\s*env\.INDEXNOW_KEY/.test(workflow)) errors.push("pages.yml: IndexNow не должен зависеть от необязательного секрета");

const watchdog = await readFile(join(root, ".github", "workflows", "pages-watchdog.yml"), "utf8");
for (const marker of [
  "name: Watch production SHA drift",
  "cron: '37 * * * *'",
  "actions: write",
  "build-info.json?watchdog=",
  "main_sha",
  "production_sha",
  "pages.yml/dispatches",
  "status=${state}",
]) {
  if (!watchdog.includes(marker)) errors.push(`pages-watchdog.yml: отсутствует условный production-recovery маркер ${marker}`);
}
if (/pages:\s*write|id-token:\s*write|actions\/deploy-pages|actions\/upload-pages-artifact/.test(watchdog)) {
  errors.push("pages-watchdog.yml: watchdog не должен быть вторым Pages deployer");
}

const verifyWorkflow = await readFile(join(root, ".github", "workflows", "pages-verify.yml"), "utf8");
for (const marker of [
  'workflows: ["Deploy GitHub Pages"]',
  "workflow_run.conclusion == 'success'",
  "SOURCE_SHA",
  "node scripts/verify-custom-domain-sha.mjs",
  'INDEXNOW_CHANGED_DATE="$SITE_REVIEW_DATE" npm run submit:indexnow',
]) {
  if (!verifyWorkflow.includes(marker)) errors.push(`pages-verify.yml: отсутствует настройка ${marker}`);
}
const verifyShaIndex = verifyWorkflow.indexOf("node scripts/verify-custom-domain-sha.mjs");
const indexNowIndex = verifyWorkflow.indexOf('INDEXNOW_CHANGED_DATE="$SITE_REVIEW_DATE" npm run submit:indexnow');
if (verifyShaIndex < 0 || indexNowIndex <= verifyShaIndex) errors.push("pages-verify.yml: IndexNow должен запускаться только после подтверждения опубликованного SHA");
if (/if:\s*\$\{\{\s*env\.INDEXNOW_KEY/.test(verifyWorkflow)) errors.push("pages-verify.yml: IndexNow не должен зависеть от необязательного секрета");

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (/lock:indexing/.test(packageJson.scripts.check || "")) errors.push("package.json: npm run check не должен менять production-индексацию");
if (!packageJson.scripts["check:preview-indexing-lock"]?.includes("lock:indexing")) errors.push("package.json: отдельная проверка закрытого preview должна сохраниться");
if (!packageJson.scripts.check?.includes("test:search-visibility")) errors.push("package.json: полный PR-check должен сохранять search visibility контроль");

const indexNow = await readFile(join(root, "scripts", "submit-indexnow.mjs"), "utf8");
for (const marker of ["INDEXNOW_CHANGED_DATE", "lastmod", "--all", "нет URL с содержательным обновлением"]) {
  if (!indexNow.includes(marker)) errors.push(`submit-indexnow.mjs: отсутствует ${marker}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Search visibility checks passed: production indexing, exact-SHA verification, conditional drift watchdog and post-deploy IndexNow are configured");
