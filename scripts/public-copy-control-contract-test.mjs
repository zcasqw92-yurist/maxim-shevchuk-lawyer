import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const [configText, packageText, pages, agents, prTemplate, rules, guard, liveRegression, documentation] = await Promise.all([
  read("config/content-governance.json"),
  read("package.json"),
  read(".github/workflows/pages.yml"),
  read("AGENTS.md"),
  read(".github/pull_request_template.md"),
  read("scripts/public-copy-rules.mjs"),
  read("scripts/public-copy-guard-test.mjs"),
  read("scripts/live-public-copy-regression-test.mjs"),
  read("docs/public-copy-control.md"),
]);

const config = JSON.parse(configText);
const packageJson = JSON.parse(packageText);
const control = config.publicCopyControl;

assert(control?.prePublication?.required === true, "Pre-publication public-copy review must be required");
assert(control?.prePublication?.command === "npm run test:public-copy", "Wrong pre-publication public-copy command");
assert(control?.prePublication?.blockPublicationOnFinding === true, "Pre-publication findings must block publication");
assert(control?.postPublicationRegression?.required === true, "Post-publication regression must be required");
assert(control?.postPublicationRegression?.command === "node scripts/live-public-copy-regression-test.mjs", "Wrong live regression command");
assert(control?.postPublicationRegression?.scope === "all-published-articles", "Live regression must cover all published articles");
assert(control?.postPublicationRegression?.runAfterVerifiedProductionSha === true, "Live regression must run after verified production SHA");
assert(control?.postPublicationRegression?.blockPublicationCompletionOnFinding === true, "Live findings must block publication completion");
assert(control?.userChatDisclosure?.required === true, "User chat disclosure must be required");
assert(control?.userChatDisclosure?.alwaysReportDetectedFindings === true, "Every detected finding must be reported to the user");
assert(control?.userChatDisclosure?.reportCleanResult === true, "Clean regression result must be reported to the user");

assert(packageJson.scripts?.["test:public-copy"]?.includes("public-copy-guard-test.mjs"), "test:public-copy must run the article guard");
assert(packageJson.scripts?.["test:public-copy"]?.includes("public-copy-control-contract-test.mjs"), "test:public-copy must protect the control contract");
assert(packageJson.scripts?.check?.includes("npm run test:public-copy"), "Full check must include public-copy control");

for (const marker of ["internal-identifiers", "draft-artifacts", "seo-editorial-language", "internal-source-provenance"]) {
  assert(rules.includes(marker), `Shared public-copy rule is missing: ${marker}`);
}
assert(guard.includes("articles.filter((item) => item.status !== \"archived\")"), "Pre-publication guard must review all current article sources");
assert(guard.includes("Regression source review passed"), "Pre-publication guard must report previous-article regression");
assert(liveRegression.includes("manifest.articles.filter((item) => item.status === \"published\")"), "Live regression must review all published articles");
assert(liveRegression.includes("reportsDir"), "Live regression must write a diagnostic report");
assert(liveRegression.includes("GITHUB_STEP_SUMMARY"), "Live regression must publish a workflow summary");

const shaStep = pages.indexOf("Verify SHA through custom domain");
const regressionStep = pages.indexOf("Recheck all published articles after verified deployment");
assert(shaStep >= 0, "Pages workflow is missing custom-domain SHA verification");
assert(regressionStep > shaStep, "All published articles must be rechecked after custom-domain SHA verification");
assert(pages.includes("node scripts/live-public-copy-regression-test.mjs"), "Pages workflow is missing live public-copy regression");
assert(pages.includes("reports/public-copy-regression.json"), "Pages workflow is missing public-copy diagnostics");
assert(pages.includes("custom-domain-sha-diagnostics-${{ github.run_id }}"), "Existing custom-domain diagnostic artifact contract must be preserved");

for (const marker of [
  "npm run test:public-copy",
  "node scripts/live-public-copy-regression-test.mjs",
  "все ранее опубликованные статьи",
  "каждый найденный URL",
]) assert(agents.includes(marker), `AGENTS.md is missing public-copy rule: ${marker}`);

for (const marker of [
  "Новая или изменённая статья прошла `npm run test:public-copy`",
  "повторно проверены исходные данные всех ранее опубликованных статей",
  "Результат контрольной проверки всех прежних статей",
]) assert(prTemplate.includes(marker), `PR template is missing public-copy checkpoint: ${marker}`);

for (const marker of ["До публикации", "После публикации", "Отчёт пользователю", "замечаний не найдено"]) {
  assert(documentation.includes(marker), `Public-copy documentation is missing: ${marker}`);
}

console.log("Public-copy control contract passed: pre-publication block, full historical regression, verified live recheck and user disclosure are mandatory");
