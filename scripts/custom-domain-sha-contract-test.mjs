import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = await readFile(join(root, "scripts", "verify-custom-domain-sha.mjs"), "utf8");
const pages = await readFile(join(root, ".github", "workflows", "pages.yml"), "utf8");
const verifyWorkflow = await readFile(join(root, ".github", "workflows", "pages-verify.yml"), "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const marker of [
  "build-info.json",
  "site-build-sha",
  'cache: "no-store"',
  '"cache-control": "no-cache, no-store, max-age=0"',
  "CUSTOM_DOMAIN_VERIFY_ATTEMPTS",
  "CUSTOM_DOMAIN_VERIFY_DELAY_MS",
  "custom-domain-sha-verification.json",
  "response.url",
]) {
  assert(script.includes(marker), `custom-domain verifier is missing ${marker}`);
}

assert(pages.includes("actions/deploy-pages@v5"), "Pages workflow must publish before custom-domain verification runs");
assert(!pages.includes("verify-custom-domain-sha.mjs"), "custom-domain verification must not hold the Pages deployment workflow open");

for (const marker of [
  "Wait for custom domain to expose deployed SHA",
  "SITE_CUSTOM_DOMAIN_URL: ${{ env.SITE_URL }}",
  "EXPECTED_BUILD_SHA: ${{ env.SOURCE_SHA }}",
  "CUSTOM_DOMAIN_VERIFY_ATTEMPTS: '30'",
  "CUSTOM_DOMAIN_VERIFY_DELAY_MS: '10000'",
  "node scripts/verify-custom-domain-sha.mjs",
  "reports/custom-domain-sha-verification.json",
  "live-site-diagnostics-${{ github.run_id }}",
  "if: env.SOURCE_EVENT != 'schedule'",
]) {
  assert(verifyWorkflow.includes(marker), `Post-deploy workflow is missing ${marker}`);
}

const verifyIndex = verifyWorkflow.indexOf("- name: Wait for custom domain to expose deployed SHA");
const smokeIndex = verifyWorkflow.indexOf("- name: Verify published build");
const indexNowIndex = verifyWorkflow.indexOf("- name: Notify IndexNow about changed pages");
assert(verifyIndex >= 0 && smokeIndex > verifyIndex, "custom-domain SHA verification must run before live smoke");
assert(indexNowIndex > verifyIndex, "custom-domain SHA verification must run before IndexNow");
assert(verifyWorkflow.includes("SOURCE_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}"), "post-deploy verification must use the exact deployed revision");

console.log("Custom-domain SHA verification contract passed: exact deployed SHA is verified in isolated post-deploy workflow");
