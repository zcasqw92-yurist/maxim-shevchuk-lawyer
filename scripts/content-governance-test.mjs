import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const read = (path) => readFile(join(root, path), "utf8");
const exists = async (path) => {
  try {
    await access(join(root, path));
    return true;
  } catch {
    return false;
  }
};

const unique = (values) => [...new Set(values)];
const sameMembers = (left, right) => {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};
const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const globToRegExp = (pattern) => {
  const token = "__DOUBLE_STAR__";
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", token)
    .replaceAll("*", "[^/]*")
    .replaceAll(token, ".*");
  return new RegExp(`^${escaped}$`);
};
const matchesAny = (path, patterns) => patterns.some((pattern) => globToRegExp(pattern).test(path));
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const [configText, agents, governanceDoc, publishingDoc, templateText, packageText, workflow, ciWorkflow] = await Promise.all([
  read("config/content-governance.json"),
  read("AGENTS.md"),
  read("docs/content-governance.md"),
  read("docs/PUBLISHING.md"),
  read("reports/content-sessions/template.json"),
  read("package.json"),
  read(".github/workflows/pages.yml"),
  read(".github/workflows/ci.yml"),
]);

let config;
let template;
let packageJson;
try { config = JSON.parse(configText); } catch (error) { errors.push(`config/content-governance.json: invalid JSON: ${error.message}`); }
try { template = JSON.parse(templateText); } catch (error) { errors.push(`reports/content-sessions/template.json: invalid JSON: ${error.message}`); }
try { packageJson = JSON.parse(packageText); } catch (error) { errors.push(`package.json: invalid JSON: ${error.message}`); }

const sheetId = "1W4014FzdUJWYDja7VUh5XXUsSuxtQIrcS5fWRX1rm24";
if (config) {
  if (config.priority !== "highest-project-content-rule") errors.push("content governance: project priority is not fixed");
  if (config.spreadsheet?.id !== sheetId) errors.push("content governance: wrong canonical spreadsheet ID");
  if (config.spreadsheet?.requireAllTabs !== true) errors.push("content governance: all-tabs requirement must be true");
  if (config.spreadsheet?.discoverTabsDynamically !== true) errors.push("content governance: dynamic tab discovery must be true");
  const baselineTabs = config.spreadsheet?.baselineSnapshot?.tabs || [];
  if (baselineTabs.length !== config.spreadsheet?.baselineSnapshot?.tabCount) errors.push("content governance: baseline tab count does not match tab list");
  if (unique(baselineTabs).length !== baselineTabs.length) errors.push("content governance: duplicate baseline tabs");
  for (const required of ["00_Старт", "10_Контентные_возможности", "11_Кейсы_для_публикации", "16_Контроль_данных", "_События_воронки"]) {
    if (!baselineTabs.includes(required)) errors.push(`content governance: baseline tab is missing: ${required}`);
  }
}

for (const [name, text, markers] of [
  ["AGENTS.md", agents, [sheetId, "каждую", "npm run check", "live-all-publications-smoke.mjs", "reports/content-sessions/latest.json"]],
  ["docs/content-governance.md", governanceDoc, [sheetId, "00_Старт", "_Импорт_ЮД_151_200", "SEO-шлюз", "Обязательный отчёт в чате"]],
  ["docs/PUBLISHING.md", publishingDoc, [sheetId, "reports/content-sessions/latest.json", "npm run test:content-governance"]],
]) {
  for (const marker of markers) if (!text.includes(marker)) errors.push(`${name}: missing marker: ${marker}`);
}

if (template && config) {
  const discovered = template.spreadsheet?.discoveredTabs || [];
  const reviewed = (template.reviewedTabs || []).map((tab) => tab.name);
  const baseline = config.spreadsheet?.baselineSnapshot?.tabs || [];
  if (template.spreadsheet?.id !== sheetId) errors.push("content session template: wrong spreadsheet ID");
  if (template.spreadsheet?.metadataTabCount !== discovered.length) errors.push("content session template: metadataTabCount does not match discovered tabs");
  if (!sameMembers(discovered, reviewed)) errors.push("content session template: every discovered tab must be reviewed exactly once");
  for (const tab of baseline) if (!discovered.includes(tab)) errors.push(`content session template: baseline tab missing: ${tab}`);
  for (const tab of template.reviewedTabs || []) {
    if (!tab.range || tab.reviewedNonEmptyCells !== true || tab.notesReviewed !== true) errors.push(`content session template: incomplete review contract for ${tab.name || "unknown tab"}`);
  }
}

if (!packageJson?.scripts?.["test:content-governance"]) errors.push("package.json: test:content-governance is missing");
if (!packageJson?.scripts?.check?.startsWith("npm run test:content-governance")) errors.push("package.json: content governance must be the first full-check gate");
if (!workflow.includes("fetch-depth: 0")) errors.push("pages.yml: full history is required to compare a multi-commit publication session");
if (!workflow.includes("CONTENT_GOVERNANCE_BASE_SHA")) errors.push("pages.yml: publication base SHA is not passed to governance test");
if (!ciWorkflow.includes("fetch-depth: 0")) errors.push("ci.yml: full PR history is required for the content governance diff");
if (!ciWorkflow.includes("CONTENT_GOVERNANCE_BASE_SHA")) errors.push("ci.yml: PR base SHA is not passed to governance test");

let changedFiles = [];
try {
  const base = process.env.CONTENT_GOVERNANCE_BASE_SHA;
  if (base && !/^0+$/.test(base)) {
    changedFiles.push(...git(["diff", "--name-only", `${base}..HEAD`]).split("\n"));
  } else {
    changedFiles.push(...git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]).split("\n"));
  }
  changedFiles.push(...git(["diff", "--name-only"]).split("\n"));
  changedFiles.push(...git(["diff", "--cached", "--name-only"]).split("\n"));
  changedFiles.push(...git(["ls-files", "--others", "--exclude-standard"]).split("\n"));
} catch {
  // Source archives and some local validation environments have no Git history.
}
changedFiles = unique(changedFiles.map((path) => path.trim()).filter(Boolean));

if (config) {
  const governedChanges = changedFiles.filter((path) => matchesAny(path, config.governedContentPaths || []));
  const generatedChanges = changedFiles.filter((path) => matchesAny(path, config.generatedPaths || []));
  if (generatedChanges.length) errors.push(`content governance: generated dist files changed directly: ${generatedChanges.join(", ")}`);

  if (governedChanges.length) {
    const manifestPath = config.sessionManifest?.path;
    if (!manifestPath || !(await exists(manifestPath))) {
      errors.push(`content governance: governed content changed without ${manifestPath || "session manifest"}`);
    } else {
      if (config.sessionManifest?.mustChangeWithGovernedContent && !changedFiles.includes(manifestPath)) {
        errors.push(`content governance: ${manifestPath} must change in the same publication session`);
      }
      let manifest;
      try { manifest = JSON.parse(await read(manifestPath)); } catch (error) { errors.push(`${manifestPath}: invalid JSON: ${error.message}`); }
      if (manifest) {
        const discovered = manifest.spreadsheet?.discoveredTabs || [];
        const reviewedTabs = manifest.reviewedTabs || [];
        const reviewedNames = reviewedTabs.map((tab) => tab.name);
        const baseline = config.spreadsheet?.baselineSnapshot?.tabs || [];
        if (manifest.spreadsheet?.id !== sheetId) errors.push(`${manifestPath}: wrong spreadsheet ID`);
        if (!validDate(manifest.reviewedAt)) errors.push(`${manifestPath}: reviewedAt is missing or invalid`);
        if (!validDate(manifest.spreadsheet?.modifiedTime)) errors.push(`${manifestPath}: spreadsheet modifiedTime is missing or invalid`);
        if (validDate(manifest.reviewedAt) && validDate(manifest.spreadsheet?.modifiedTime) && Date.parse(manifest.reviewedAt) < Date.parse(manifest.spreadsheet.modifiedTime)) {
          errors.push(`${manifestPath}: review predates the spreadsheet snapshot`);
        }
        if (manifest.spreadsheet?.metadataTabCount !== discovered.length) errors.push(`${manifestPath}: metadataTabCount does not match discovered tabs`);
        if (unique(discovered).length !== discovered.length) errors.push(`${manifestPath}: discovered tabs contain duplicates`);
        if (!sameMembers(discovered, reviewedNames)) errors.push(`${manifestPath}: every discovered tab must be reviewed exactly once`);
        for (const tab of baseline) if (!discovered.includes(tab)) errors.push(`${manifestPath}: required baseline tab missing: ${tab}`);
        for (const tab of reviewedTabs) {
          if (!tab.range || tab.reviewedNonEmptyCells !== true || tab.notesReviewed !== true) errors.push(`${manifestPath}: incomplete tab review: ${tab.name || "unknown"}`);
        }
        for (const field of ["factsSeparatedFromHypotheses", "paidWorkSeparatedFromPaymentDetails", "workProcedureAndCaseResultsSeparated", "legalSourcesVerified", "anonymizationVerified", "criticalSourceErrorsResolved"]) {
          if (manifest.editorialChecks?.[field] !== true) errors.push(`${manifestPath}: editorial check is not complete: ${field}`);
        }
        if (manifest.seoReview?.status !== "completed") errors.push(`${manifestPath}: SEO review must be completed`);
        if (!manifest.seoReview?.primaryIntent) errors.push(`${manifestPath}: primary intent is missing`);
        if (!Array.isArray(manifest.seoReview?.intentMap) || manifest.seoReview.intentMap.length === 0) errors.push(`${manifestPath}: intent map is missing`);
        const sourcePaths = new Set((manifest.contentChanges || []).map((item) => item.path));
        for (const path of governedChanges) if (!sourcePaths.has(path)) errors.push(`${manifestPath}: changed content path is not declared: ${path}`);
        if (!Array.isArray(manifest.publication?.expectedUrls)) errors.push(`${manifestPath}: expected public URLs are missing`);
      }
    }
  }

  if (!errors.length) {
    console.log(`Content governance contract passed: ${config.spreadsheet.baselineSnapshot.tabCount} baseline tabs, ${changedFiles.length} changed files, ${governedChanges.length} governed content changes`);
  }
}

if (errors.length) {
  console.error(unique(errors).join("\n"));
  process.exit(1);
}
