import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const [
  registryText,
  ci,
  pages,
  verify,
  recovery,
  watchdog,
  buildSite,
  observability,
  customDomainVerifier,
  browserContract,
  releaseGate,
  agents,
  publishing,
] = await Promise.all([
  read("config/publication-failure-regressions.json"),
  read(".github/workflows/ci.yml"),
  read(".github/workflows/pages.yml"),
  read(".github/workflows/pages-verify.yml"),
  read(".github/workflows/pages-recovery.yml"),
  read(".github/workflows/pages-watchdog.yml"),
  read("scripts/build-site.mjs"),
  read("scripts/deployment-observability-test.mjs"),
  read("scripts/verify-custom-domain-sha.mjs"),
  read("scripts/browser-test-contract.mjs"),
  read("scripts/release-check.mjs"),
  read("AGENTS.md"),
  read("docs/PUBLISHING.md"),
]);

const errors = [];
const requireText = (label, content, needle, message) => {
  if (!content.includes(needle)) errors.push(`${label}: ${message}`);
};
const forbidText = (label, content, needle, message) => {
  if (content.includes(needle)) errors.push(`${label}: ${message}`);
};
const requirePattern = (label, content, pattern, message) => {
  if (!pattern.test(content)) errors.push(`${label}: ${message}`);
};
const forbidPattern = (label, content, pattern, message) => {
  if (pattern.test(content)) errors.push(`${label}: ${message}`);
};
const count = (content, pattern) => (content.match(pattern) || []).length;

let registry;
try {
  registry = JSON.parse(registryText);
} catch (error) {
  errors.push(`failure registry: invalid JSON: ${error.message}`);
}

const knownControls = new Set([
  "immutable-sha-marker",
  "custom-domain-exact-sha",
  "production-drift-watchdog",
  "full-pr-ci",
  "deterministic-release-gate",
  "publication-readiness-gate",
  "official-pages-deployer",
  "extended-custom-domain-verification",
  "pinned-runner",
  "setup-only-recovery",
  "bounded-same-run-retry",
  "source-contract-before-merge",
  "behavioral-not-incidental-contracts",
  "publication-variant-contract",
  "all-publications-overflow-before-merge",
  "cross-browser-before-merge",
  "no-overflow-masking",
  "non-cancelling-active-deploy",
  "single-pending-pages-queue",
  "bounded-deploy-timeout",
  "single-official-deployer",
  "no-alternate-pages-writer",
  "platform-compatible-browser-contract",
  "no-browser-deploy-fallback",
  "browser-ci-before-merge-only",
  "dependency-light-postdeploy",
  "separate-deploy-and-verify",
  "production-sitemap-indexnow",
  "postdeploy-script-syntax-gate",
  "no-local-dist-postdeploy",
  "ordered-invariant-checks",
  "shallow-checkout",
  "targeted-base-sha-fetch",
  "postdeploy-shallow-checkout",
]);

if (registry) {
  if (registry.schemaVersion !== 1) errors.push("failure registry: schemaVersion must be 1");
  const incidents = Array.isArray(registry.incidents) ? registry.incidents : [];
  if (incidents.length < 13) errors.push("failure registry: historical audit must contain all 13 known failure classes");
  const ids = incidents.map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push("failure registry: incident IDs must be unique");
  for (const item of incidents) {
    if (!/^PF-\d{3}$/.test(String(item.id || ""))) errors.push(`failure registry: invalid incident id ${item.id || "missing"}`);
    for (const field of ["date", "class", "symptom", "rootCause", "recovery"]) {
      if (!String(item[field] || "").trim()) errors.push(`${item.id || "incident"}: missing ${field}`);
    }
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) errors.push(`${item.id}: evidence is missing`);
    if (!Array.isArray(item.preventiveControls) || item.preventiveControls.length === 0) errors.push(`${item.id}: preventiveControls are missing`);
    for (const control of item.preventiveControls || []) {
      if (!knownControls.has(control)) errors.push(`${item.id}: unknown preventive control ${control}`);
    }
  }
}

// One production writer only. Recovery and watchdog may request the normal workflow,
// but they must never own Pages permissions or contain deploy actions themselves.
if (count(pages, /actions\/deploy-pages@v5/g) !== 1) errors.push("pages: exactly one official deploy-pages@v5 step is required");
requirePattern("pages", pages, /concurrency:[\s\S]*group:\s*pages[\s\S]*cancel-in-progress:\s*false[\s\S]*queue:\s*single/, "active deployment must not be cancelled and only one pending run may wait");
requireText("pages", pages, "workflow_dispatch:", "normal Pages workflow must support explicit recovery dispatch");
forbidPattern("pages", pages, /schedule:/, "blind scheduled redeploy is forbidden; drift watchdog owns scheduled reconciliation");
requireText("pages", pages, "node scripts/release-check.mjs", "deterministic release gate must run before artifact upload");
requireText("pages", pages, "fetch-depth: 1", "Pages build must use shallow checkout");
requireText("pages", pages, 'git fetch --no-tags --depth=1 origin "$BASE_SHA"', "Pages build must fetch only the content-governance base commit");
forbidPattern("pages", pages, /playwright|npm run check/, "production Pages path must not repeat browser-heavy PR CI");

for (const [label, content] of [["recovery", recovery], ["watchdog", watchdog]]) {
  requirePattern(label, content, /actions:\s*write/, "workflow needs Actions write only to rerun/dispatch the normal Pages workflow");
  forbidPattern(label, content, /pages:\s*write|id-token:\s*write|actions\/deploy-pages|actions\/configure-pages|actions\/upload-pages-artifact/, "workflow must not become an alternate Pages writer");
}

requirePattern("recovery", recovery, /workflow_run:[\s\S]*workflows:\s*\["Deploy GitHub Pages"\]/, "recovery must react only to the normal Pages workflow");
requireText("recovery", recovery, "attempt >= 3", "automatic same-run recovery must be bounded to fewer than three attempts");
requireText("recovery", recovery, "rerun-failed-jobs", "recovery must rerun failed jobs on the same run/SHA");
requireText("recovery", recovery, "setup_only_count", "recovery must classify setup-only failures before retrying");
requireText("recovery", recovery, "Recovery blocked: at least one failed job reached repository/deployment logic.", "project-code failures must block automatic retry");

requirePattern("watchdog", watchdog, /schedule:[\s\S]*cron:\s*'37 \* \* \* \*'/, "production drift watchdog must run hourly away from the top of the hour");
requireText("watchdog", watchdog, "production_sha", "watchdog must read current production SHA");
requireText("watchdog", watchdog, "main_sha", "watchdog must resolve current main SHA");
requireText("watchdog", watchdog, "pages.yml/dispatches", "watchdog must dispatch the existing normal Pages workflow on drift");
requireText("watchdog", watchdog, "status=${state}", "watchdog must avoid dispatch while a Pages run is already queued/in progress");
requireText("watchdog", watchdog, "no Git commit was created", "watchdog recovery contract must explicitly avoid retry commits");

// Full browser behavior must be proven before merge; post-deploy remains dependency-light.
requirePattern("ci", ci, /pull_request:[\s\S]*branches:[\s\S]*- main/, "full site check must gate PRs to main");
requireText("ci", ci, "npx playwright install-deps chromium firefox webkit", "PR CI must prepare all required browser engines");
requireText("ci", ci, "npx playwright install chromium firefox webkit", "PR CI must install all required browser engines");
requireText("ci", ci, "npm run check", "PR CI must execute the full project check");
requireText("ci", ci, "fetch-depth: 1", "PR CI must use shallow checkout");
requireText("ci", ci, 'git fetch --no-tags --depth=1 origin "$BASE_SHA"', "PR CI must fetch only the exact governance base SHA");
requireText("browser contract", browserContract, 'process.platform === "linux"', "Linux-specific Chromium must remain platform guarded");
requireText("browser contract", browserContract, "platform-compatible Chromium", "cross-platform browser regression must stay protected");

requireText("verify", verify, "fetch-depth: 1", "post-deploy must checkout only the exact deployed revision, not full history");
forbidText("verify", verify, "fetch-depth: 0", "post-deploy full Git history is forbidden");
forbidPattern("verify", verify, /playwright|npm ci|test:live|live-all-publications-smoke/, "post-deploy must not repeat browser-heavy mutable dependencies");
forbidPattern("verify", verify, /pages:\s*write|id-token:\s*write/, "post-deploy verification must not have Pages write capability");
requireText("verify", verify, "CUSTOM_DOMAIN_VERIFY_ATTEMPTS: '72'", "custom-domain propagation window must tolerate delayed production visibility");
requireText("verify", verify, "EXPECTED_BUILD_SHA: ${{ env.SOURCE_SHA }}", "post-deploy must verify the exact deployed SHA");
requireText("verify", verify, "INDEXNOW_SITEMAP_URL: ${{ env.SITE_URL }}/sitemap.xml", "IndexNow must consume production sitemap, never local dist");

// A SHA-specific immutable path is the first proof that the new build actually exists.
for (const marker of ["deployments", "markerName", "deploymentMarker", "schemaVersion: 1"]) {
  requireText("build marker", buildSite, marker, `build must create immutable deployment marker (${marker})`);
}
requireText("observability", observability, "deployments", "local release checks must verify generated deployment marker");
requireText("observability", observability, "does not match build-info.json", "marker metadata must be cross-checked with build-info.json");
const markerIndex = customDomainVerifier.indexOf("deployments/${expectedSha}.json");
const buildInfoIndex = customDomainVerifier.indexOf('requestText("build-info.json"');
const homeIndex = customDomainVerifier.indexOf('requestText("", attempt)');
if (!(markerIndex >= 0 && buildInfoIndex > markerIndex && homeIndex > buildInfoIndex)) {
  errors.push("custom-domain verifier: required order is immutable SHA marker → build-info.json → homepage meta SHA");
}
requireText("custom-domain verifier", customDomainVerifier, "marker.sha !== expectedSha", "immutable marker must be matched to the full expected SHA");

// The historical gate is itself part of the deterministic release path.
requireText("release gate", releaseGate, '"scripts/publication-readiness-test.mjs"', "publication failure regression gate must run before a release can be packed");

for (const [label, content] of [["AGENTS.md", agents], ["docs/PUBLISHING.md", publishing]]) {
  for (const marker of ["publication-readiness", "setup-only", "retry-коммит", "точн", "SHA"]) {
    if (!content.toLocaleLowerCase("ru-RU").includes(marker.toLocaleLowerCase("ru-RU"))) {
      errors.push(`${label}: bot publication protocol is missing marker ${marker}`);
    }
  }
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Publication readiness passed: ${registry.incidents.length} historical failure classes are mapped to blocking controls or bounded recovery`);
