import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { services } from "../src/data.mjs";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const read = (path) => readFile(join(root, path), "utf8");
const [
  current,
  publishing,
  readme,
  deployment,
  quality,
  roadmap,
  seoLaunch,
  indexingPolicy,
  packageText,
  workflow,
  conversionAnalytics,
  privacyImplementation,
  trafficAttribution,
] = await Promise.all([
  read("docs/current-production-state.md"),
  read("docs/PUBLISHING.md"),
  read("README.md"),
  read("DEPLOYMENT.md"),
  read("QUALITY_REPORT.md"),
  read("SEO_AUDIT_AND_ROADMAP.md"),
  read("docs/seo-launch-checklist.md"),
  read("INDEXING_POLICY.md"),
  read("package.json"),
  read(".github/workflows/pages.yml"),
  read("docs/conversion-analytics.md"),
  read("docs/privacy-implementation-note.md"),
  read("docs/traffic-attribution-standard.md"),
]);

const canonicalCount = services.length + articles.length + practiceCases.length + 7;
for (const marker of [
  `${canonicalCount} канонических содержательных URL`,
  "https://yuristshevchuk.com",
  "физический офис: Московская область, Химки, улица Горшина, 2",
  "юридические услуги оказываются клиентам из Москвы и всей Московской области",
  "дистанционная работа доступна по всей России",
  "онлайн: ежедневно с 08:00 до 23:00 МСК",
  "отсутствуют формы заявки, заказа звонка и обратной связи",
  "все CTA открывают единый диалог выбора Telegram или WhatsApp",
  "оператор получает сведения только после самостоятельного нажатия «Отправить»",
  "Аналитика в текущей итерации не удаляется",
  "канонические страницы получают `index,follow`",
  "`robots.txt` разрешает обход",
  "не входит в обычную команду `npm run check`",
  "INDEXNOW_CHANGED_DATE=2026-07-27 npm run submit:indexnow",
  "npm run check:preview-indexing-lock",
  "PR CI запускает полный `npm run check`",
  "Production workflow использует быстрый `scripts/release-check.mjs`",
  "редакционный шлюз публикации",
  "editorial-publications.json",
  "sitemap-articles.xml",
  "publication_scroll_25",
]) {
  if (!current.includes(marker)) errors.push(`current-production-state.md: отсутствует актуальный маркер «${marker}»`);
}

for (const obsolete of [
  "Индексация намеренно закрыта",
  "публикует пустой `sitemap.xml`",
  "удаляет ключ IndexNow",
  "npm run test:live-indexing-lock подтвердил блокировку",
  "формы, квиз, диалоги и мессенджеры",
  "Production workflow запускает именно `npm run check`",
]) {
  if (current.includes(obsolete)) errors.push(`current-production-state.md: осталось устаревшее утверждение «${obsolete}»`);
}

for (const marker of [
  "src/editorial-data.mjs",
  "npm run check",
  "status: \"published\"",
  "legalReviewedAt",
  "editorial-publications.json",
  "publication_helpfulness",
  "Будущая админка должна работать поверх этой же схемы",
]) {
  if (!publishing.includes(marker)) errors.push(`docs/PUBLISHING.md: отсутствует маркер «${marker}»`);
}

for (const marker of [
  "contact_conversion",
  "messenger_dialog_open",
  "cta_click",
  "cta_view",
  "source_cta_placement",
  "traffic_attribution_ready",
  "traffic_utm_source",
  "traffic_journey_tail",
  "Текст подготовленного сообщения",
  "111050150",
  "docs/traffic-attribution-standard.md",
]) {
  if (!conversionAnalytics.includes(marker)) errors.push(`docs/conversion-analytics.md: отсутствует маркер «${marker}»`);
}

for (const marker of [
  "аналитика только после отдельного согласия пользователя",
  "Текст черновика, содержание сообщения, документы",
  "Локальная first-touch атрибуция",
  "значения `yclid`, `gclid`, `fbclid`",
  "npm run test:conversion-analytics",
]) {
  if (!privacyImplementation.includes(marker)) errors.push(`docs/privacy-implementation-note.md: отсутствует маркер «${marker}»`);
}

for (const marker of [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "?utm_source=avito&utm_medium=classified&utm_campaign=vzyskanie_dolga&utm_content=ad_01",
  "?utm_source=telegram&utm_medium=messenger&utm_campaign=vzyskanie_dolga&utm_content=channel_post_01",
  "?utm_source=yandex_business&utm_medium=organic_profile&utm_campaign=legal_services&utm_content=profile_link",
  "Автоматический `yclid` не добавляется вручную",
  "По запросу в чате «дай UTM-хвост»",
]) {
  if (!trafficAttribution.includes(marker)) errors.push(`docs/traffic-attribution-standard.md: отсутствует маркер «${marker}»`);
}

if (!readme.includes("docs/current-production-state.md")) errors.push("README.md: нет ссылки на текущий источник истины");
if (!quality.includes("АРХИВНЫЙ ОТЧЁТ")) errors.push("QUALITY_REPORT.md: старый отчёт не помечен архивным");
if (!roadmap.includes("ИСТОРИЧЕСКИЙ ПЛАН")) errors.push("SEO_AUDIT_AND_ROADMAP.md: старый план не помечен историческим");
if (!deployment.includes("не разрешение на индексацию")) errors.push("DEPLOYMENT.md: будущая инструкция не отделена от текущего режима");
if (!seoLaunch.includes("HOLD: только для будущего запуска")) errors.push("docs/seo-launch-checklist.md: отсутствует HOLD");
if (!indexingPolicy.includes("новые страницы услуг")) errors.push("INDEXING_POLICY.md: историческая политика не охватывает новые страницы услуг");

const packageJson = JSON.parse(packageText);
for (const script of ["test:content-dates", "test:geography", "test:composition-contract", "test:documentation", "test:direct-contact", "test:conversion-analytics", "test:publication-pipeline", "test:cross-browser", "test:indexing-lock", "test:live-indexing-lock", "check:preview-indexing-lock"]) {
  if (!packageJson.scripts?.[script]) errors.push(`package.json: отсутствует ${script}`);
}
for (const removed of ["test:callback", "test:callback-interaction"]) {
  if (packageJson.scripts?.[removed]) errors.push(`package.json: удалённый сценарий не должен оставаться: ${removed}`);
}
if (/lock:indexing/.test(packageJson.scripts?.check || "")) errors.push("package.json: npm run check не должен включать indexing lock");
if (!packageJson.scripts?.check?.includes("test:direct-contact")) errors.push("package.json: npm run check должен включать прямую модель обращения");
if (!packageJson.scripts?.check?.includes("test:conversion-analytics")) errors.push("package.json: npm run check должен включать аналитику конверсий");
if (!packageJson.scripts?.check?.includes("test:publication-pipeline")) errors.push("package.json: npm run check должен включать редакционный шлюз");
if (!packageJson.scripts?.["check:preview-indexing-lock"]?.includes("lock:indexing")) errors.push("package.json: отдельный preview-контур должен сохранять indexing lock");

for (const marker of [
  "node scripts/release-check.mjs",
  "actions/deploy-pages@v5",
  "cancel-in-progress: false",
  "queue: single",
  "CROSS_BROWSER_REQUIRED: 'true'",
  "INDEXNOW_CHANGED_DATE=\"$SITE_REVIEW_DATE\" npm run submit:indexnow",
  "if: github.event_name != 'schedule'",
]) {
  if (!workflow.includes(marker)) errors.push(`pages.yml: отсутствует production-маркер ${marker}`);
}
if (workflow.includes("npm run lock:indexing")) errors.push("pages.yml: production workflow не должен выполнять indexing lock");
if (workflow.includes("npm run test:live-indexing-lock")) errors.push("pages.yml: production workflow не должен проверять закрытый режим");
if (workflow.includes("deploy-pages-with-extended-wait")) errors.push("pages.yml: самописный Pages API client не должен использоваться");

for (const relativePath of [
  "docs/current-production-state.md",
  "docs/PUBLISHING.md",
  "docs/conversion-analytics.md",
  "docs/privacy-implementation-note.md",
  "docs/traffic-attribution-standard.md",
  "tests/golden-render-contract.json",
  "docs/manual-device-qa.md",
  "INDEXING_POLICY.md",
  "scripts/direct-contact-model-test.mjs",
  "scripts/conversion-analytics-test.mjs",
  "scripts/publication-pipeline-test.mjs",
  "scripts/release-check.mjs",
]) {
  try {
    await access(join(root, relativePath));
  } catch {
    errors.push(`Документация ссылается на отсутствующий файл: ${relativePath}`);
  }
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Documentation contract passed: ${canonicalCount} routes, full PR gate, lean release gate, direct messenger model, open indexing and automatic IndexNow are current`);
