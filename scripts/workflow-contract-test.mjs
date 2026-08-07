import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const [ci, pages, verify, releaseGate] = await Promise.all([
  read(".github/workflows/ci.yml"),
  read(".github/workflows/pages.yml"),
  read(".github/workflows/pages-verify.yml"),
  read("scripts/release-check.mjs"),
]);

const errors = [];
const requirePattern = (label, content, pattern, message) => {
  if (!pattern.test(content)) errors.push(`${label}: ${message}`);
};
const forbidPattern = (label, content, pattern, message) => {
  if (pattern.test(content)) errors.push(`${label}: ${message}`);
};
const count = (content, pattern) => (content.match(pattern) || []).length;

for (const [label, content] of [["ci", ci], ["pages", pages], ["verify", verify]]) {
  requirePattern(label, content, /SITE_PRODUCTION:\s*['"]true['"]/, "SITE_PRODUCTION должен быть включён");
  requirePattern(label, content, /SITE_URL:\s*['"]https:\/\/yuristshevchuk\.com['"]/, "проверка должна выполняться для основного домена");
  requirePattern(label, content, /SITE_BASE_PATH:\s*['"]{2}/, "custom domain должен собираться без base path");
  requirePattern(label, content, /SITE_ANALYTICS_ENABLED:\s*['"]true['"]/, "production-конфигурация должна включать аналитику по согласию");
  requirePattern(label, content, /node-version:\s*['"]22\.17\.0['"]/, "версия Node.js должна быть закреплена");
  forbidPattern(label, content, /runs-on:\s*ubuntu-latest/, "плавающий ubuntu-latest запрещён; используйте закреплённый образ");
}

requirePattern("ci", ci, /pull_request:[\s\S]*branches:[\s\S]*- main/, "полная проверка должна выполняться до merge в main");
requirePattern("ci", ci, /runs-on:\s*ubuntu-22\.04/, "CI должен использовать Ubuntu 22.04");
requirePattern("ci", ci, /uses:\s*actions\/checkout@v6/, "CI должен использовать Node 24-совместимый checkout@v6");
requirePattern("ci", ci, /uses:\s*actions\/setup-node@v6/, "CI должен использовать Node 24-совместимый setup-node@v6");
requirePattern("ci", ci, /uses:\s*actions\/cache@v5/, "Playwright browsers должны кэшироваться через Node 24-совместимый cache@v5");
requirePattern("ci", ci, /uses:\s*actions\/upload-artifact@v5/, "диагностика должна загружаться через upload-artifact@v5");
requirePattern("ci", ci, /npx playwright install-deps chromium firefox webkit/, "системные browser-зависимости должны устанавливаться отдельным диагностируемым шагом");
requirePattern("ci", ci, /npx playwright install chromium firefox webkit/, "три browser engine должны устанавливаться перед полной проверкой");
requirePattern("ci", ci, /timeout-minutes:\s*6[\s\S]*playwright install-deps/, "установка browser-зависимостей должна иметь короткий timeout");
requirePattern("ci", ci, /npm run check 2>&1 \| tee check\.log/, "PR должен выполнять полный единый npm run check");
requirePattern("ci", ci, /check\.log/, "ошибка полного CI должна сохранять check.log");
forbidPattern("ci", ci, /actions\/(?:checkout|setup-node|upload-artifact)@v4/, "устаревшие Node 20 action major-версии не должны возвращаться");

requirePattern("pages", pages, /concurrency:[\s\S]*group:\s*pages[\s\S]*cancel-in-progress:\s*false[\s\S]*queue:\s*single/, "активный Pages deployment нельзя отменять новым push; разрешён только один заменяемый pending-run");
requirePattern("pages", pages, /build:[\s\S]*deploy:[\s\S]*needs:\s*build/, "release должен разделять build и deployment");
if (count(pages, /runs-on:\s*ubuntu-22\.04/g) !== 2) {
  errors.push("pages: только build и deploy должны находиться в основном Pages workflow");
}
requirePattern("pages", pages, /node scripts\/release-check\.mjs 2>&1 \| tee release-check\.log/, "release должен проходить быстрый deterministic gate до упаковки artifact");
requirePattern("pages", pages, /uses:\s*actions\/upload-pages-artifact@v4/, "Pages artifact должен создаваться штатным action");
requirePattern("pages", pages, /uses:\s*actions\/deploy-pages@v5/, "публикация должна использовать официальный Node 24-совместимый deploy-pages@v5");
requirePattern("pages", pages, /timeout:\s*['"]900000['"]/, "Pages backend не должен висеть бесконечно; timeout публикации ограничен 15 минутами");
requirePattern("pages", pages, /error_count:\s*['"]12['"]/, "deploy-pages должен ограничивать ошибки опроса статуса");
requirePattern("pages", pages, /reporting_interval:\s*['"]10000['"]/, "статус deployment должен опрашиваться раз в 10 секунд");
forbidPattern("pages", pages, /deploy-pages-with-extended-wait/, "самописный Pages API client не должен возвращаться в production path");
forbidPattern("pages", pages, /cancel-in-progress:\s*true/, "production deployment нельзя убивать новым push");
forbidPattern("pages", pages, /queue:\s*max/, "накопительная FIFO-очередь deployment запрещена");
forbidPattern("pages", pages, /playwright install/, "основной Pages workflow не должен скачивать браузеры");
forbidPattern("pages", pages, /npm run check(?:\s|$)/m, "release build не должен второй раз гонять полный browser-heavy npm run check");
forbidPattern("pages", pages, /Verify published site/, "post-deploy browser audit должен жить в отдельном workflow");

requirePattern("verify", verify, /workflow_run:[\s\S]*workflows:\s*\["Deploy GitHub Pages"\][\s\S]*types:\s*\[completed\]/, "live-аудит должен запускаться после завершения Pages workflow");
requirePattern("verify", verify, /workflow_run\.conclusion == 'success'[\s\S]*workflow_run\.head_branch == 'main'/, "автоматический live-аудит разрешён только после успешной публикации main");
requirePattern("verify", verify, /group:\s*pages-live-verify[\s\S]*cancel-in-progress:\s*true/, "устаревший post-deploy аудит можно безопасно отменять новой опубликованной версией");
requirePattern("verify", verify, /ref:\s*\$\{\{ env\.SOURCE_SHA \}\}/, "live-аудит должен checkout-ить точный SHA исходного deployment");
requirePattern("verify", verify, /SOURCE_SHA:\s*\$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/, "workflow_run должен сохранять точный SHA опубликованного release");
requirePattern("verify", verify, /uses:\s*actions\/cache@v5/, "live browser binaries должны кэшироваться");
requirePattern("verify", verify, /npx playwright install-deps chromium webkit/, "live browser dependencies должны иметь отдельный шаг");
requirePattern("verify", verify, /npx playwright install chromium webkit/, "live-аудиту достаточно Chromium и WebKit");
requirePattern("verify", verify, /CUSTOM_DOMAIN_VERIFY_ATTEMPTS:\s*['"]30['"][\s\S]*verify-custom-domain-sha\.mjs/, "до live-smoke нужно дождаться точного SHA на custom domain");
requirePattern("verify", verify, /SITE_PUBLIC_URL:\s*\$\{\{ env\.SITE_URL \}\}[\s\S]*EXPECTED_BUILD_SHA:\s*\$\{\{ env\.SOURCE_SHA \}\}/, "live-smoke должен проверять custom domain и точный deployed SHA");
requirePattern("verify", verify, /continue-on-error:\s*true[\s\S]*metrica-state-test\.mjs/, "внешний API Метрики не должен блокировать опубликованный сайт");
requirePattern("verify", verify, /if:\s*env\.SOURCE_EVENT != 'schedule'[\s\S]*submit:indexnow/, "IndexNow должен запускаться после live-аудита и не по расписанию");
forbidPattern("verify", verify, /pages:\s*write/, "post-deploy аудит не должен иметь права на новый Pages deployment");

for (const required of [
  "test:content-governance",
  "test:public-copy",
  "test:editorial-list-policy",
  "test:editorial-single-source",
  "test:editorial-commercial-gate",
  "test:seo-data-pipeline",
  "build",
  "test:css-architecture",
  "validate",
  "audit:seo",
  "test:seo-metadata",
  "test:documentation",
  "test:workflow-contract",
  "test:deployment-observability",
  "test:custom-domain-sha",
]) {
  if (!releaseGate.includes(`\"${required}\"`)) errors.push(`release-gate: отсутствует обязательная deterministic проверка ${required}`);
}
for (const forbidden of [
  "playwright",
  "test:cta-system",
  "test:numbered-typography",
  "test:accessibility",
  "test:cross-browser",
  "test:all-publications-overflow",
  "test:visual",
]) {
  if (releaseGate.includes(forbidden)) errors.push(`release-gate: browser-heavy проверка ${forbidden} должна оставаться только в PR CI`);
}

for (const obsoletePath of [
  ".github/workflows/pages-macos-fallback.yml",
  "scripts/deploy-pages-with-extended-wait.mjs",
]) {
  try {
    await access(join(root, obsoletePath));
    errors.push(`${obsoletePath}: устаревший конкурирующий deployment-механизм должен быть удалён`);
  } catch {}
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Workflow contract passed: full browser CI before merge, lean build/deploy workflow, one non-cancelling Pages queue and isolated post-deploy verification");
