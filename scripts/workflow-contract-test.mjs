import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflows = {
  ci: await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8"),
  pages: await readFile(join(root, ".github", "workflows", "pages.yml"), "utf8"),
};
const retryWorkflow = await readFile(join(root, ".github", "workflows", "pages-infrastructure-retry.yml"), "utf8");

const errors = [];
const requirePattern = (label, content, pattern, message) => {
  if (!pattern.test(content)) errors.push(`${label}: ${message}`);
};

for (const [label, content] of Object.entries(workflows)) {
  requirePattern(label, content, /SITE_PRODUCTION:\s*['"]true['"]/, "SITE_PRODUCTION должен быть включён");
  requirePattern(label, content, /SITE_URL:\s*['"]https:\/\/yuristshevchuk\.com['"]/, "проверка должна выполняться для основного домена");
  requirePattern(label, content, /SITE_BASE_PATH:\s*['"]{2}/, "custom domain должен собираться без base path");
  requirePattern(label, content, /SITE_ANALYTICS_ENABLED:\s*['"]true['"]/, "production-проверка должна включать аналитику и баннер согласия");
  requirePattern(label, content, /CROSS_BROWSER_REQUIRED:\s*['"]true['"]/, "обязательная cross-browser проверка должна быть включена");
  requirePattern(label, content, /node-version:\s*['"]22\.17\.0['"]/, "версия Node.js должна быть одинаково закреплена");
  requirePattern(label, content, /npx playwright install --with-deps chromium firefox webkit/, "должны устанавливаться все проверяемые браузеры");
  requirePattern(label, content, /npm run check 2>&1 \| tee check\.log/, "должен запускаться единый npm run check с сохранением полного журнала");
  requirePattern(label, content, /check\.log/, "check.log должен входить в диагностический артефакт");
  requirePattern(label, content, /if-no-files-found:\s*ignore/, "при ошибке должны сохраняться диагностические артефакты без вторичного падения");
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
const pagesDeployIndex = workflows.pages.indexOf("actions/deploy-pages");
if (pagesCheckIndex < 0 || pagesUploadIndex < 0 || pagesDeployIndex < 0 || !(pagesCheckIndex < pagesUploadIndex && pagesUploadIndex < pagesDeployIndex)) {
  errors.push("pages: проверка должна завершаться до упаковки и публикации артефакта");
}

requirePattern("pages", workflows.pages, /concurrency:[\s\S]*group:\s*pages[\s\S]*cancel-in-progress:\s*false[\s\S]*queue:\s*max/, "начатые и ожидающие production-deploy должны сохраняться в последовательной очереди");
requirePattern("pages", workflows.pages, /build:[\s\S]*deploy:[\s\S]*needs:\s*build[\s\S]*verify:[\s\S]*needs:\s*deploy/, "сборка, deploy и live-проверка должны быть разделены на последовательные jobs");
requirePattern("pages", workflows.pages, /uses:\s*actions\/checkout@v6/, "Pages workflow должен использовать Node 24-совместимый checkout@v6");
requirePattern("pages", workflows.pages, /uses:\s*actions\/setup-node@v6/, "Pages workflow должен использовать Node 24-совместимый setup-node@v6");
requirePattern("pages", workflows.pages, /uses:\s*actions\/upload-pages-artifact@v4/, "Pages artifact должен загружаться актуальным upload-pages-artifact@v4");
requirePattern("pages", workflows.pages, /uses:\s*actions\/deploy-pages@v4[\s\S]*timeout:\s*['"]1800000['"]/, "deploy-pages должен ждать очередь Pages до 30 минут");
requirePattern("pages", workflows.pages, /reporting_interval:\s*['"]10000['"]/, "опрос статуса Pages должен выполняться с устойчивым интервалом");
requirePattern("pages", workflows.pages, /outputs:[\s\S]*page_url:[\s\S]*needs\.deploy\.outputs\.page_url/, "live-проверка должна получать URL из отдельного deploy job");

requirePattern("pages-retry", retryWorkflow, /workflow_run:[\s\S]*workflows:\s*\["Deploy GitHub Pages"\][\s\S]*types:\s*\[completed\]/, "автоповтор должен запускаться только после завершения Pages workflow");
requirePattern("pages-retry", retryWorkflow, /permissions:[\s\S]*actions:\s*write[\s\S]*contents:\s*read/, "для точечного rerun нужны actions:write и только чтение содержимого");
requirePattern("pages-retry", retryWorkflow, /conclusion == 'failure'[\s\S]*head_branch == 'main'/, "повтор разрешён только для неудачной публикации main");
requirePattern("pages-retry", retryWorkflow, /attempt >= 3/, "автоповтор должен останавливаться после трёх попыток");
requirePattern("pages-retry", retryWorkflow, /\.steps \| length\) == 1[\s\S]*Set up job[\s\S]*setup_only_count/, "повтор допустим только при падении на подготовке runner до запуска кода");
requirePattern("pages-retry", retryWorkflow, /rerun-failed-jobs/, "автоповтор должен использовать штатный endpoint failed jobs");
if (/^\s*uses:/m.test(retryWorkflow)) {
  errors.push("pages-retry: аварийный workflow не должен зависеть от скачивания внешних Actions");
}
if (/conclusion == 'cancelled'/.test(retryWorkflow)) {
  errors.push("pages-retry: отменённые проверки нельзя перезапускать как инфраструктурный сбой");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Workflow contract passed: PR and deploy use the same production gate, pending Pages runs stay queued, and setup-only infrastructure failures retry safely");
