import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { services } from "../src/data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const read = (path) => readFile(join(root, path), "utf8");
const [
  current,
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
  read("README.md"),
  read("DEPLOYMENT.md"),
  read("QUALITY_REPORT.md"),
  read("SEO_AUDIT_AND_ROADMAP.md"),
  read("docs/seo-launch-checklist.md"),
  read("INDEXING_POLICY.md"),
  read("package.json"),
  read(".github/workflows/pages.yml"),
]);

const canonicalCount = services.length + 5;
const htmlCount = canonicalCount + 3;
for (const marker of [
  `${canonicalCount} канонических содержательных URL`,
  `${htmlCount} HTML-файлов`,
  "noindex,nofollow,noarchive,nosnippet,noimageindex",
  "пустой `sitemap.xml`",
  "удаляет ключ IndexNow",
  "запрет индексации HTML обеспечивается строгим meta robots",
  "EXPECTED_BUILD_SHA='<полный commit SHA>' npm run test:live",
  "npm run test:live-indexing-lock",
  "site.contentLastModifiedByPath",
  "tests/golden-render-contract.json",
]) {
  if (!current.includes(marker)) errors.push(`current-production-state.md: отсутствует актуальный маркер «${marker}»`);
}

if (!readme.includes("docs/current-production-state.md")) errors.push("README.md: нет ссылки на текущий источник истины");
if (!quality.includes("АРХИВНЫЙ ОТЧЁТ")) errors.push("QUALITY_REPORT.md: старый отчёт не помечен архивным");
if (!roadmap.includes("ИСТОРИЧЕСКИЙ ПЛАН")) errors.push("SEO_AUDIT_AND_ROADMAP.md: старый план не помечен историческим");
if (!deployment.includes("не разрешение на индексацию")) errors.push("DEPLOYMENT.md: будущая инструкция не отделена от текущего режима");
if (!seoLaunch.includes("HOLD: только для будущего запуска")) errors.push("docs/seo-launch-checklist.md: отсутствует HOLD");
if (!indexingPolicy.includes("новые страницы услуг")) errors.push("INDEXING_POLICY.md: новые страницы не охвачены блокировкой");

for (const forbidden of [
  "публичная сборка всегда создаётся с `index,follow`",
  "После успешного деплоя workflow:\n\n1. публикует файл",
]) {
  if (seoLaunch.includes(forbidden)) errors.push(`docs/seo-launch-checklist.md: осталось устаревшее утверждение «${forbidden}»`);
}

const packageJson = JSON.parse(packageText);
for (const script of ["test:content-dates", "test:composition-contract", "test:documentation", "test:cross-browser", "test:indexing-lock", "test:live-indexing-lock"]) {
  if (!packageJson.scripts?.[script]) errors.push(`package.json: отсутствует ${script}`);
}
if (!workflow.includes("npm run lock:indexing && npm run test:indexing-lock")) errors.push("pages.yml: публикация не защищена локальной проверкой indexing lock");
if (!workflow.includes("npm run test:live-indexing-lock")) errors.push("pages.yml: публикация не защищена live-проверкой indexing lock");
if (!workflow.includes("playwright install --with-deps chromium firefox webkit")) errors.push("pages.yml: три браузерных движка не устанавливаются");
if (!workflow.includes("npm run test:cross-browser")) errors.push("pages.yml: кроссбраузерный smoke не запускается");
if (!workflow.includes("CROSS_BROWSER_REQUIRED: 'true'")) errors.push("pages.yml: отсутствие браузерного движка не останавливает деплой");

for (const relativePath of [
  "docs/current-production-state.md",
  "tests/golden-render-contract.json",
  "docs/manual-device-qa.md",
  "INDEXING_POLICY.md",
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

console.log(`Documentation contract passed: ${canonicalCount} canonical routes, ${htmlCount} HTML files and indexing lock are current`);
