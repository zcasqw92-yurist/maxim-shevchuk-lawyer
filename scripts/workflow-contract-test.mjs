import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deploymentIdOf,
  deploymentState,
  revisionState,
  selectPagesArtifact,
} from "./deploy-pages-with-extended-wait.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflows = {
  ci: await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8"),
  pages: await readFile(join(root, ".github", "workflows", "pages.yml"), "utf8"),
  fallback: await readFile(join(root, ".github", "workflows", "pages-macos-fallback.yml"), "utf8"),
};
const deploymentClient = await readFile(join(root, "scripts", "deploy-pages-with-extended-wait.mjs"), "utf8");

const errors = [];
const requirePattern = (label, content, pattern, message) => {
  if (!pattern.test(content)) errors.push(`${label}: ${message}`);
};
const assert = (condition, message) => {
  if (!condition) errors.push(`pages-client: ${message}`);
};
const count = (content, pattern) => (content.match(pattern) || []).length;

for (const [label, content] of Object.entries(workflows)) {
  requirePattern(label, content, /SITE_PRODUCTION:\s*['"]true['"]/, "SITE_PRODUCTION должен быть включён");
  requirePattern(label, content, /SITE_URL:\s*['"]https:\/\/yuristshevchuk\.com['"]/, "проверка должна выполняться для основного домена");
  requirePattern(label, content, /SITE_BASE_PATH:\s*['"]{2}/, "custom domain должен собираться без base path");
  requirePattern(label, content, /SITE_ANALYTICS_ENABLED:\s*['"]true['"]/, "production-проверка должна включать аналитику и баннер согласия");
  requirePattern(label, content, /CROSS_BROWSER_REQUIRED:\s*['"]true['"]/, "обязательная cross-browser проверка должна быть включена");
  requirePattern(label, content, /node-version:\s*['"]22\.17\.0['"]/, "версия Node.js должна быть одинаково закреплена");
  requirePattern(label, content, /npm run check 2>&1 \| tee check\.log/, "должен запускаться единый npm run check с сохранением полного журнала");
  requirePattern(label, content, /check\.log/, "check.log должен входить в диагностический артефакт");
  requirePattern(label, content, /if-no-files-found:\s*ignore/, "при ошибке должны сохраняться диагностические артефакты без вторичного падения");
}

for (const [label, content] of [["ci", workflows.ci], ["pages", workflows.pages]]) {
  requirePattern(label, content, /npx playwright install --with-deps chromium firefox webkit/, "Linux workflow должен устанавливать браузеры и системные зависимости");
  if (/runs-on:\s*ubuntu-latest/.test(content)) {
    errors.push(`${label}: плавающий ubuntu-latest запрещён после повторных ошибок выделения runner; используйте закреплённый образ`);
  }
}
requirePattern("ci", workflows.ci, /runs-on:\s*ubuntu-22\.04/, "CI должен использовать закреплённый Ubuntu 22.04");
if (count(workflows.pages, /runs-on:\s*ubuntu-22\.04/g) !== 3) {
  errors.push("pages: build, deploy и verify должны использовать закреплённый Ubuntu 22.04");
}

if (!/pull_request:[\s\S]*branches:[\s\S]*- main/.test(workflows.ci)) {
  errors.push("ci: полная production-проверка должна выполняться до слияния PR в main");
}
const forbiddenCiCommands = workflows.ci
  .split("\n")
  .filter((line) => /npm run (?:build|validate|audit:seo|test:)/.test(line) && !/npm run check/.test(line));
if (forbiddenCiCommands.length) {
  errors.push(`ci: запрещён отдельный неполный список проверок; используйте только npm run check (${forbiddenCiCommands.join(" | ")})`);
}

const pagesCheckIndex = workflows.pages.indexOf("npm run check");
const pagesUploadIndex = workflows.pages.indexOf("actions/upload-pages-artifact");
const pagesDeployIndex = workflows.pages.indexOf("node scripts/deploy-pages-with-extended-wait.mjs");
if (pagesCheckIndex < 0 || pagesUploadIndex < 0 || pagesDeployIndex < 0 || !(pagesCheckIndex < pagesUploadIndex && pagesUploadIndex < pagesDeployIndex)) {
  errors.push("pages: проверка должна завершаться до упаковки и запуска Pages deployment");
}

requirePattern("pages", workflows.pages, /permissions:[\s\S]*actions:\s*read[\s\S]*contents:\s*read[\s\S]*pages:\s*write[\s\S]*id-token:\s*write/, "deployment client должен читать artifact и получать OIDC-токен с минимальными правами");
requirePattern("pages", workflows.pages, /concurrency:[\s\S]*group:\s*pages[\s\S]*cancel-in-progress:\s*true/, "production-публикация должна сохранять общую группу pages и отменять всю старую очередь");
requirePattern("pages", workflows.pages, /build:[\s\S]*deploy:[\s\S]*needs:\s*build[\s\S]*verify:[\s\S]*needs:\s*deploy/, "сборка, deploy и live-проверка должны быть разделены на последовательные jobs");
requirePattern("pages", workflows.pages, /uses:\s*actions\/checkout@v6/, "Pages workflow должен использовать Node 24-совместимый checkout@v6");
requirePattern("pages", workflows.pages, /uses:\s*actions\/setup-node@v6/, "Pages workflow должен использовать Node 24-совместимый setup-node@v6");
requirePattern("pages", workflows.pages, /uses:\s*actions\/upload-pages-artifact@v4/, "Pages artifact должен загружаться актуальным upload-pages-artifact@v4");
requirePattern("pages", workflows.pages, /node --check scripts\/deploy-pages-with-extended-wait\.mjs/, "расширенный deployment client должен проходить синтаксическую проверку до публикации");
requirePattern("pages", workflows.pages, /PAGES_DEPLOYMENT_TIMEOUT_MS:\s*['"]2100000['"]/, "Pages deployment должен ждать backend до 35 минут");
requirePattern("pages", workflows.pages, /PAGES_STATUS_INTERVAL_MS:\s*['"]10000['"]/, "статус Pages должен опрашиваться с устойчивым интервалом");
requirePattern("pages", workflows.pages, /outputs:[\s\S]*page_url:[\s\S]*status:\s*\$\{\{ steps\.deployment\.outputs\.status \}\}/, "deploy job должен передавать URL и итоговый статус");
requirePattern("pages", workflows.pages, /verify:[\s\S]*needs:\s*deploy[\s\S]*if:\s*needs\.deploy\.outputs\.status == 'succeed'/, "live-проверка должна запускаться только после подтверждённой публикации");
requirePattern("pages", workflows.pages, /SITE_PUBLIC_URL:\s*\$\{\{ needs\.deploy\.outputs\.page_url \}\}/, "live-проверка должна получать URL из отдельного deploy job");
if (/queue:\s*max/.test(workflows.pages)) errors.push("pages: FIFO-очередь устаревших коммитов не должна задерживать публикацию последнего main");
if (/group:\s*\$\{\{ github\.workflow/.test(workflows.pages)) errors.push("pages: новая concurrency-группа не должна оставлять старую группу pages без отмены");
if (/actions\/deploy-pages@/.test(workflows.pages)) errors.push("pages: официальный deploy-pages ограничивает ожидание десятью минутами и не должен использоваться для этой очереди");

const fallbackCheckIndex = workflows.fallback.indexOf("npm run check");
const fallbackUploadIndex = workflows.fallback.indexOf("actions/upload-pages-artifact");
const fallbackDeployIndex = workflows.fallback.indexOf("node scripts/deploy-pages-with-extended-wait.mjs");
if (fallbackCheckIndex < 0 || fallbackUploadIndex < 0 || fallbackDeployIndex < 0 || !(fallbackCheckIndex < fallbackUploadIndex && fallbackUploadIndex < fallbackDeployIndex)) {
  errors.push("fallback: проверка должна завершаться до упаковки и Pages deployment");
}
requirePattern("fallback", workflows.fallback, /workflow_run:[\s\S]*workflows:\s*\["Deploy GitHub Pages"\][\s\S]*types:\s*\[completed\]/, "fallback должен получать завершение основного Pages workflow");
requirePattern("fallback", workflows.fallback, /workflow_dispatch:/, "fallback должен допускать независимый ручной запуск");
requirePattern("fallback", workflows.fallback, /conclusion == 'failure'[\s\S]*head_branch == 'main'/, "автоматический fallback разрешён только после ошибки публикации main");
requirePattern("fallback", workflows.fallback, /actions\/runs\/\$\{SOURCE_RUN_ID\}\/jobs\?filter=latest&per_page=100/, "gate должен проверять реальные jobs исходного запуска");
requirePattern("fallback", workflows.fallback, /Set up job[\s\S]*setup_only_count/, "fallback должен отличать сбой runner от ошибки кода");
requirePattern("fallback", workflows.fallback, /needs:\s*gate[\s\S]*if:\s*needs\.gate\.outputs\.allowed == 'true'/, "production-сборка должна быть заблокирована решением gate");
requirePattern("fallback", workflows.fallback, /concurrency:[\s\S]*group:\s*pages[\s\S]*cancel-in-progress:\s*true/, "fallback должен использовать общую production-группу и отменять зависший Linux run");
requirePattern("fallback", workflows.fallback, /npx playwright install chromium firefox webkit/, "macOS fallback должен устанавливать все три браузера без Linux-only зависимостей");
requirePattern("fallback", workflows.fallback, /uses:\s*actions\/upload-pages-artifact@v4/, "fallback должен создавать стандартный github-pages artifact");
requirePattern("fallback", workflows.fallback, /PAGES_DEPLOYMENT_TIMEOUT_MS:\s*['"]2100000['"]/, "fallback должен использовать тот же устойчивый deployment client");
requirePattern("fallback", workflows.fallback, /verify:[\s\S]*needs:\s*deploy[\s\S]*if:\s*needs\.deploy\.outputs\.status == 'succeed'/, "fallback должен проверять сайт только после подтверждённого deployment");
if (count(workflows.fallback, /runs-on:\s*macos-14/g) !== 4) {
  errors.push("fallback: gate, build, deploy и verify должны выполняться в независимом пуле macOS 14");
}
if (/runs-on:\s*ubuntu-/.test(workflows.fallback)) errors.push("fallback: аварийный маршрут не должен зависеть от Linux runner");
if (/actions\/deploy-pages@/.test(workflows.fallback)) errors.push("fallback: должен использовать расширенный deployment client, а не короткий deploy-pages timeout");

for (const marker of [
  "/actions/runs/${encodeURIComponent(runId)}/artifacts?name=github-pages&per_page=100",
  "ACTIONS_ID_TOKEN_REQUEST_URL",
  '"/git/ref/heads/main"',
  '"/pages/deployments"',
  "/pages/deployments/${encodeURIComponent(deploymentId)}",
  "/pages/deployments/${encodeURIComponent(deploymentId)}/cancel",
  'environment: "github-pages"',
  "Skipping stale Pages build",
  'status: "skipped"',
  "Lookup Pages deployment after ambiguous create",
  "2_100_000",
  "PAGES_STATUS_ERROR_LIMIT",
  "writeOutputs",
]) {
  if (!deploymentClient.includes(marker)) errors.push(`pages-client: отсутствует обязательный контракт ${marker}`);
}
if (deploymentClient.includes("MAX_TIMEOUT = 600000")) errors.push("pages-client: вернулось жёсткое десятиминутное ограничение deploy-pages");

const sampleSha = "a".repeat(40);
const newerSha = "b".repeat(40);
try {
  assert(revisionState(sampleSha, sampleSha).current === true, "актуальный main ошибочно признан устаревшим");
  assert(revisionState(sampleSha, newerSha).current === false, "устаревший build не распознан");
} catch (error) {
  errors.push(`pages-client: проверка актуальности SHA завершилась ошибкой: ${error.message}`);
}
try {
  revisionState("short", sampleSha);
  errors.push("pages-client: некорректный SHA сборки не был отклонён");
} catch {}
try {
  const artifact = selectPagesArtifact({ artifacts: [{
    id: 42,
    name: "github-pages",
    expired: false,
    workflow_run: { head_sha: sampleSha },
  }] }, sampleSha);
  assert(artifact.id === 42, "выбран неверный artifact");
} catch (error) {
  errors.push(`pages-client: корректный artifact отклонён: ${error.message}`);
}
try {
  selectPagesArtifact({ artifacts: [
    { id: 1, name: "github-pages", expired: false },
    { id: 2, name: "github-pages", expired: false },
  ] }, sampleSha);
  errors.push("pages-client: два активных artifact не были отклонены");
} catch {}
assert(deploymentIdOf({ status_url: "https://api.github.com/pages/deployments/abc" }, sampleSha) === "abc", "deployment id не извлекается из status_url");
assert(deploymentState("succeed").kind === "success", "успешный статус не распознан");
assert(deploymentState("deployment_failed").kind === "failure", "финальная ошибка не распознана");
assert(deploymentState("deployment_in_progress").kind === "pending", "промежуточный статус не распознан");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Workflow contract passed: primary Pages uses pinned Ubuntu 22.04 and setup-only failures switch to an independent macOS 14 deployment path");
