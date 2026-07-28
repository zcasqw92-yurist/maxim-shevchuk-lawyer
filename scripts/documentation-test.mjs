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
  "Production workflow запускает именно `npm run check`",
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

if (!readme.includes("docs/current-production-state.md")) errors.push("README.md: нет ссылки на текущий источник истины");
if (!quality.includes("АРХИВНЫЙ ОТЧЁТ")) errors.push("QUALITY_REPORT.md: старый отчёт не помечен архивным");
if (!roadmap.includes("ИСТОРИЧЕСКИЙ ПЛАН")) errors.push("SEO_AUDIT_AND_ROADMAP.md: старый план не помечен историческим");
if (!deployment.includes("не разрешение на индексацию")) errors.push("DEPLOYMENT.md: будущая инструкция не отделена от текущего режима");
if (!seoLaunch.includes("HOLD: только для будущего запуска")) errors.push("docs/seo-launch-checklist.md: отсутствует HOLD");
if (!indexingPolicy.includes("новые страницы услуг")) errors.push("INDEXING_POLICY.md: историческая политика не охватывает новые страницы услуг");

const packageJson = JSON.parse(packageText);
for (const script of ["test:content-dates", "test:geography", "test:composition-contract", "test:documentation", "test:direct-contact", "test:publication-pipeline", "test:cross-browser", "test:indexing-lock", "test:live-indexing-lock", "check:preview-indexing-lock"]) {
  if (!packageJson.scripts?.[script]) errors.push(`package.json: отсутствует ${script}`);
}
for (const removed of ["test:callback", "test:callback-interaction"]) {
  if (packageJson.scripts?.[removed]) errors.push(`package.json: удалённый сценарий не должен оставаться: ${removed}`);
}
if (/lock:indexing/.test(packageJson.scripts?.check || "")) errors.push("package.json: npm run check не должен включать indexing lock");
if (!packageJson.scripts?.check?.includes("test:direct-contact")) errors.push("package.json: npm run check должен включать прямую модель обращения");
if (!packageJson.scripts?.check?.includes("test:publication-pipeline")) errors.push("package.json: npm run check должен включать редакционный шлюз");
if (!packageJson.scripts?.["check:preview-indexing-lock"]?.includes("lock:indexing")) errors.push("package.json: отдельный preview-контур должен сохранять indexing lock");

for (const marker of [
  "npm run check",
  "playwright install --with-deps chromium firefox webkit",
  "CROSS_BROWSER_REQUIRED: 'true'",
  "INDEXNOW_CHANGED_DATE=\"$SITE_REVIEW_DATE\" npm run submit:indexnow",
  "if: github.event_name != 'schedule'",
]) {
  if (!workflow.includes(marker)) errors.push(`pages.yml: отсутствует production-маркер ${marker}`);
}
if (workflow.includes("npm run lock:indexing")) errors.push("pages.yml: production workflow не должен выполнять indexing lock");
if (workflow.includes("npm run test:live-indexing-lock")) errors.push("pages.yml: production workflow не должен проверять закрытый режим");

for (const relativePath of [
  "docs/current-production-state.md",
  "docs/PUBLISHING.md",
  "tests/golden-render-contract.json",
  "docs/manual-device-qa.md",
  "INDEXING_POLICY.md",
  "scripts/direct-contact-model-test.mjs",
  "scripts/publication-pipeline-test.mjs",
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

console.log(`Documentation contract passed: ${canonicalCount} routes, direct messenger model, publication pipeline, open indexing and automatic IndexNow are current`);
