import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflows = {
  ci: await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8"),
  pages: await readFile(join(root, ".github", "workflows", "pages.yml"), "utf8"),
};

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

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Workflow contract passed: PR and deploy use the same pinned production check with full diagnostics");
