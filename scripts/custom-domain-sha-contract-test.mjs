import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = await readFile(join(root, "scripts", "verify-custom-domain-sha.mjs"), "utf8");
const workflow = await readFile(join(root, ".github", "workflows", "pages.yml"), "utf8");

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

for (const marker of [
  "node --check scripts/verify-custom-domain-sha.mjs",
  "Verify SHA through custom domain",
  "SITE_CUSTOM_DOMAIN_URL: ${{ env.SITE_URL }}",
  "EXPECTED_BUILD_SHA: ${{ github.sha }}",
  "node scripts/verify-custom-domain-sha.mjs",
  "custom-domain-sha-diagnostics-${{ github.run_id }}",
  "if: success() && github.event_name != 'schedule'",
]) {
  assert(workflow.includes(marker), `Pages workflow is missing ${marker}`);
}

const verifyIndex = workflow.indexOf("- name: Verify SHA through custom domain");
const indexNowIndex = workflow.indexOf("- name: Notify IndexNow about changed pages");
assert(verifyIndex >= 0 && indexNowIndex > verifyIndex, "custom-domain verification must run before IndexNow");

console.log("Custom-domain SHA verification contract passed");
