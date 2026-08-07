import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = await readFile(join(root, "scripts", "verify-custom-domain-sha.mjs"), "utf8");
const pages = await readFile(join(root, ".github", "workflows", "pages.yml"), "utf8");
const verifyWorkflow = await readFile(join(root, ".github", "workflows", "pages-verify.yml"), "utf8");
const buildSite = await readFile(join(root, "scripts", "build-site.mjs"), "utf8");
const observability = await readFile(join(root, "scripts", "deployment-observability-test.mjs"), "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const marker of [
  "deployments/${expectedSha}.json",
  "build-info.json",
  "site-build-sha",
  'cache: "no-store"',
  '"cache-control": "no-cache, no-store, max-age=0"',
  "CUSTOM_DOMAIN_VERIFY_ATTEMPTS",
  "CUSTOM_DOMAIN_VERIFY_DELAY_MS",
  "custom-domain-sha-verification.json",
  "response.url",
  "marker.sha !== expectedSha",
]) {
  assert(script.includes(marker), `custom-domain verifier is missing ${marker}`);
}

const markerIndex = script.indexOf("deployments/${expectedSha}.json");
const buildInfoIndex = script.indexOf('requestText("build-info.json"');
const homeIndex = script.indexOf('requestText("", attempt)');
assert(markerIndex >= 0 && buildInfoIndex > markerIndex && homeIndex > buildInfoIndex, "immutable SHA marker must be verified before build-info and homepage meta");

for (const marker of ["deploymentMarker", "schemaVersion: 1", "deployments", "markerName"]) {
  assert(buildSite.includes(marker), `build-site must create immutable deployment marker: ${marker}`);
}
assert(observability.includes("deployments"), "deployment observability must verify immutable marker locally");
assert(observability.includes("does not match build-info.json"), "deployment marker must be compared with build-info.json");

assert(pages.includes("actions/deploy-pages@v5"), "Pages workflow must publish before custom-domain verification runs");
assert(!pages.includes("verify-custom-domain-sha.mjs"), "custom-domain verification must not hold the Pages deployment workflow open");

for (const marker of [
  "Wait for immutable deployment marker and custom-domain SHA",
  "SITE_CUSTOM_DOMAIN_URL: ${{ env.SITE_URL }}",
  "EXPECTED_BUILD_SHA: ${{ env.SOURCE_SHA }}",
  "CUSTOM_DOMAIN_VERIFY_ATTEMPTS: '72'",
  "CUSTOM_DOMAIN_VERIFY_DELAY_MS: '10000'",
  "node scripts/verify-custom-domain-sha.mjs",
  "Verify published release over HTTP",
  "node scripts/live-http-release-verify.mjs",
  "Recheck all published articles",
  "node scripts/live-public-copy-regression-test.mjs",
  "reports/custom-domain-sha-verification.json",
  "live-site-diagnostics-${{ github.run_id }}",
  "fetch-depth: 1",
]) {
  assert(verifyWorkflow.includes(marker), `Post-deploy workflow is missing ${marker}`);
}

assert(!verifyWorkflow.includes("fetch-depth: 0"), "post-deploy verification must not download full Git history");
const verifyIndex = verifyWorkflow.indexOf("- name: Wait for immutable deployment marker and custom-domain SHA");
const httpIndex = verifyWorkflow.indexOf("- name: Verify published release over HTTP");
const regressionIndex = verifyWorkflow.indexOf("- name: Recheck all published articles");
const indexNowIndex = verifyWorkflow.indexOf("- name: Notify IndexNow about changed pages");
assert(verifyIndex >= 0 && httpIndex > verifyIndex, "custom-domain SHA verification must run before production HTTP verification");
assert(regressionIndex > httpIndex, "public-copy regression must run after production HTTP verification");
assert(indexNowIndex > regressionIndex, "IndexNow must run only after verified SHA and production regressions");
assert(verifyWorkflow.includes("SOURCE_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}"), "post-deploy verification must use the exact deployed revision");
assert(!/playwright|test:live|live-all-publications-smoke/.test(verifyWorkflow), "post-deploy SHA verification must not depend on browser-heavy smoke tests");

console.log("Custom-domain SHA verification contract passed: immutable SHA path, build-info and homepage meta gate lightweight production verification");
