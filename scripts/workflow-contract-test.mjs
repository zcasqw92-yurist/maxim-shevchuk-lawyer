import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const [ci, pages, verify, recovery, watchdog, releaseGate] = await Promise.all([
  read(".github/workflows/ci.yml"),
  read(".github/workflows/pages.yml"),
  read(".github/workflows/pages-verify.yml"),
  read(".github/workflows/pages-recovery.yml"),
  read(".github/workflows/pages-watchdog.yml"),
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
  requirePattern(label, content, /SITE_URL:\s*['"]https:\/\/yuristshevchuk\.com['"]/, "контур должен использовать основной production-домен");
  requirePattern(label, content, /SITE_BASE_PATH:\s*['"]{2}/, "custom domain должен собираться без base path");
  requirePattern(label, content, /SITE_ANALYTICS_ENABLED:\s*['"]true['"]/, "production-конфигурация должна включать аналитику по согласию");
  requirePattern(label, content, /node-version:\s*['"]22\.17\.0['"]/, "версия Node.js должна быть закреплена");
  forbidPattern(label, content, /runs-on:\s*ubuntu-latest/, "плавающий ubuntu-latest запрещён");
  forbidPattern(label, content, /actions\/upload-artifact@v[1-6]\b/, "diagnostic artifacts должны использовать upload-artifact@v7");
}

// PR CI: полное доказательство поведения сайта до merge.
requirePattern("ci", ci, /pull_request:[\s\S]*branches:[\s\S]*- main/, "полная проверка должна выполняться до merge в main");
requirePattern("ci", ci, /runs-on:\s*ubuntu-22\.04/, "CI должен использовать Ubuntu 22.04");
requirePattern("ci", ci, /uses:\s*actions\/checkout@v6[\s\S]*fetch-depth:\s*1/, "CI должен использовать shallow checkout@v6");
requirePattern("ci", ci, /git fetch --no-tags --depth=1 origin "\$BASE_SHA"/, "CI должен точечно получать только governance base SHA");
requirePattern("ci", ci, /uses:\s*actions\/setup-node@v6/, "CI должен использовать setup-node@v6");
requirePattern("ci", ci, /uses:\s*actions\/cache@v5/, "Playwright cache должен использовать actions/cache@v5");
requirePattern("ci", ci, /uses:\s*actions\/upload-artifact@v7/, "CI diagnostics должны использовать upload-artifact@v7");
requirePattern("ci", ci, /timeout-minutes:\s*40/, "PF-015: общий browser CI должен оставаться bounded, но иметь достаточное окно");
requirePattern("ci", ci, /timeout-minutes:\s*12[\s\S]*Acquire::Retries "5";[\s\S]*Acquire::http::Timeout "60";[\s\S]*Acquire::https::Timeout "60";[\s\S]*npx playwright install-deps chromium firefox webkit/, "PF-015: browser dependency bootstrap должен иметь bounded 12-minute window, APT retries/timeouts и все три движка");
requirePattern("ci", ci, /timeout-minutes:\s*10[\s\S]*npx playwright install chromium firefox webkit/, "PF-015: browser binaries должны иметь отдельное bounded окно и включать Chromium, Firefox и WebKit");
forbidPattern("ci", ci, /timeout-minutes:\s*6[\s\S]{0,180}playwright install-deps/, "PF-015: исторический 6-минутный timeout browser dependencies запрещён");
requirePattern("ci", ci, /node scripts\/release-check\.mjs 2>&1 \| tee release-check\.log/, "deterministic release path должен проверяться до browser-heavy CI");
requirePattern("ci", ci, /npm run check 2>&1 \| tee check\.log/, "PR должен выполнять полный npm run check");
forbidPattern("ci", ci, /actions\/(?:checkout|setup-node)@v[1-5]\b/, "старые checkout/setup-node major запрещены");

// Production Pages: один writer и никакой повторной browser-heavy проверки.
requirePattern("pages", pages, /workflow_dispatch:/, "Pages workflow должен поддерживать безопасный recovery dispatch");
forbidPattern("pages", pages, /schedule:/, "слепой scheduled redeploy запрещён; reconciliation выполняет watchdog");
requirePattern("pages", pages, /concurrency:[\s\S]*group:\s*pages[\s\S]*cancel-in-progress:\s*false[\s\S]*queue:\s*single/, "активный deployment нельзя отменять; pending очередь должна быть single");
requirePattern("pages", pages, /build:[\s\S]*deploy:[\s\S]*needs:\s*build/, "release должен разделять build и deployment");
if (count(pages, /runs-on:\s*ubuntu-22\.04/g) !== 2) errors.push("pages: только build и deploy должны находиться в основном Pages workflow");
requirePattern("pages", pages, /uses:\s*actions\/checkout@v6[\s\S]*fetch-depth:\s*1/, "Pages build должен использовать shallow checkout");
requirePattern("pages", pages, /git fetch --no-tags --depth=1 origin "\$BASE_SHA"/, "Pages build должен точечно получать governance base SHA");
requirePattern("pages", pages, /node scripts\/release-check\.mjs 2>&1 \| tee release-check\.log/, "release gate должен завершиться до упаковки artifact");
requirePattern("pages", pages, /uses:\s*actions\/upload-pages-artifact@v5/, "Pages artifact должен использовать upload-pages-artifact@v5");
if (count(pages, /uses:\s*actions\/deploy-pages@v5/g) !== 1) errors.push("pages: должен существовать ровно один официальный deploy-pages@v5 writer");
requirePattern("pages", pages, /timeout:\s*['"]900000['"]/, "Pages deployment должен иметь ограниченное ожидание backend");
requirePattern("pages", pages, /error_count:\s*['"]12['"]/, "deploy-pages должен ограничивать transient polling errors");
requirePattern("pages", pages, /reporting_interval:\s*['"]10000['"]/, "deployment status должен опрашиваться раз в 10 секунд");
forbidPattern("pages", pages, /playwright|npm run check(?:\s|$)/m, "production Pages path не должен повторять browser-heavy npm run check");
forbidPattern("pages", pages, /deploy-pages-with-extended-wait|curl[\s\S]*pages\/deployments/, "самописный Pages deployment client запрещён");

// Post-deploy: exact SHA proof without mutable browser/npm dependencies.
requirePattern("verify", verify, /workflow_run:[\s\S]*workflows:\s*\["Deploy GitHub Pages"\][\s\S]*types:\s*\[completed\]/, "live audit должен запускаться после Pages workflow");
requirePattern("verify", verify, /workflow_run\.conclusion == 'success'[\s\S]*workflow_run\.head_branch == 'main'/, "автоматический live audit разрешён только после успешного main deployment");
requirePattern("verify", verify, /group:\s*pages-live-verify[\s\S]*cancel-in-progress:\s*true/, "устаревший verification run можно отменить новой опубликованной версией");
requirePattern("verify", verify, /ref:\s*\$\{\{ env\.SOURCE_SHA \}\}[\s\S]*fetch-depth:\s*1/, "post-deploy должен checkout exact deployed SHA с depth 1");
forbidPattern("verify", verify, /fetch-depth:\s*0/, "post-deploy не должен скачивать всю Git history");
requirePattern("verify", verify, /SOURCE_SHA:\s*\$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/, "verification должен хранить exact deployed SHA");
requirePattern("verify", verify, /CUSTOM_DOMAIN_VERIFY_ATTEMPTS:\s*['"]72['"][\s\S]*verify-custom-domain-sha\.mjs/, "custom-domain verification должен иметь расширенное propagation window и immutable marker gate");
requirePattern("verify", verify, /live-http-release-verify\.mjs/, "после SHA должен выполняться production HTTP verification");
requirePattern("verify", verify, /live-public-copy-regression-test\.mjs/, "после SHA должен выполняться regression всех публичных статей");
requirePattern("verify", verify, /continue-on-error:\s*true[\s\S]*metrica-state-test\.mjs/, "внешний API Метрики не должен менять статус уже опубликованного сайта");
requirePattern("verify", verify, /INDEXNOW_SITEMAP_URL:\s*\$\{\{ env\.SITE_URL \}\}\/sitemap\.xml/, "IndexNow должен читать production sitemap");
forbidPattern("verify", verify, /pages:\s*write|id-token:\s*write/, "verification не должен иметь права на Pages deployment");
forbidPattern("verify", verify, /playwright|actions\/cache|npm ci|test:live|live-all-publications-smoke/, "post-deploy не должен повторять browser-heavy PR CI");

const verifyShaStep = verify.indexOf("node scripts/verify-custom-domain-sha.mjs");
const verifyHttpStep = verify.indexOf("node scripts/live-http-release-verify.mjs");
const verifyRegressionStep = verify.indexOf("node scripts/live-public-copy-regression-test.mjs");
const verifyIndexNowStep = verify.indexOf('INDEXNOW_CHANGED_DATE="$SITE_REVIEW_DATE" npm run submit:indexnow');
if (!(verifyShaStep >= 0 && verifyHttpStep > verifyShaStep && verifyRegressionStep > verifyHttpStep && verifyIndexNowStep > verifyRegressionStep)) {
  errors.push("verify: порядок должен быть immutable/exact SHA → HTTP production → public-copy regression → IndexNow");
}

// Self-healing may control Actions, never Pages itself.
requirePattern("recovery", recovery, /workflow_run:[\s\S]*workflows:\s*\["Deploy GitHub Pages"\]/, "recovery должен реагировать на Pages failure");
requirePattern("recovery", recovery, /permissions:[\s\S]*actions:\s*write[\s\S]*contents:\s*read/, "recovery нужны Actions write и contents read");
requirePattern("recovery", recovery, /attempt >= 3/, "автоматические same-run retries должны быть ограничены");
requirePattern("recovery", recovery, /setup_only_count/, "recovery обязан доказать setup-only failure");
requirePattern("recovery", recovery, /rerun-failed-jobs/, "recovery должен повторять failed jobs исходного run");
forbidPattern("recovery", recovery, /pages:\s*write|id-token:\s*write|deploy-pages|upload-pages-artifact|configure-pages/, "recovery не должен становиться вторым Pages writer");

requirePattern("watchdog", watchdog, /schedule:[\s\S]*cron:\s*'37 \* \* \* \*'/, "production SHA drift должен проверяться периодически");
requirePattern("watchdog", watchdog, /actions:\s*write/, "watchdog должен уметь dispatch normal workflow");
requirePattern("watchdog", watchdog, /build-info\.json\?watchdog=/, "watchdog должен читать production SHA без cache");
requirePattern("watchdog", watchdog, /actions\/workflows\/pages\.yml\/dispatches/, "watchdog должен вызывать только normal Pages workflow");
forbidPattern("watchdog", watchdog, /pages:\s*write|id-token:\s*write|deploy-pages|upload-pages-artifact|configure-pages/, "watchdog не должен публиковать сайт сам");

// Release gate: historical failure regression is first, then deterministic project checks.
const readinessIndex = releaseGate.indexOf('"scripts/publication-readiness-test.mjs"');
const contentIndex = releaseGate.indexOf('"test:content-governance"');
if (!(readinessIndex >= 0 && contentIndex > readinessIndex)) errors.push("release-gate: publication readiness должен выполняться до project content gates");
for (const required of ["test:content-governance","test:public-copy","test:editorial-list-policy","test:editorial-single-source","test:editorial-commercial-gate","test:seo-data-pipeline","build","test:css-architecture","validate","audit:seo","test:seo-metadata","test:documentation","test:workflow-contract","test:deployment-observability","test:custom-domain-sha"]) {
  if (!releaseGate.includes(`\"${required}\"`)) errors.push(`release-gate: отсутствует deterministic check ${required}`);
}
for (const requiredScript of ["publication-sheet-gate-contract-test.mjs","browser-bootstrap-contract-test.mjs","verify-custom-domain-sha.mjs","live-http-release-verify.mjs","live-public-copy-regression-test.mjs","metrica-state-test.mjs","submit-indexnow.mjs"]) {
  if (!releaseGate.includes(requiredScript)) errors.push(`release-gate: отсутствует обязательный deterministic/syntax contract ${requiredScript}`);
}
for (const forbidden of ["test:cta-system","test:numbered-typography","test:accessibility","test:cross-browser","test:all-publications-overflow","test:visual"]) {
  if (releaseGate.includes(`\"${forbidden}\"`)) errors.push(`release-gate: browser-heavy check ${forbidden} должен оставаться в full PR CI`);
}

for (const obsoletePath of [".github/workflows/pages-macos-fallback.yml","scripts/deploy-pages-with-extended-wait.mjs"]) {
  try {
    await access(join(root, obsoletePath));
    errors.push(`${obsoletePath}: obsolete alternate deployment mechanism must remain deleted`);
  } catch {}
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Workflow contract passed: full pre-merge browser CI with PF-015 bootstrap resilience, one Pages writer, immutable SHA post-deploy verification, bounded setup-only recovery and drift watchdog");
