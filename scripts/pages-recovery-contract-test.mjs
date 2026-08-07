import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [pages, recovery, watchdog] = await Promise.all([
  readFile(join(root, ".github/workflows/pages.yml"), "utf8"),
  readFile(join(root, ".github/workflows/pages-recovery.yml"), "utf8"),
  readFile(join(root, ".github/workflows/pages-watchdog.yml"), "utf8"),
]);

const errors = [];
const requireMarker = (label, content, marker, message) => {
  if (!content.includes(marker)) errors.push(`${label}: ${message}`);
};
const forbid = (label, content, pattern, message) => {
  if (pattern.test(content)) errors.push(`${label}: ${message}`);
};

if ((pages.match(/actions\/deploy-pages@v5/g) || []).length !== 1) {
  errors.push("pages: exactly one official deploy-pages@v5 writer is required");
}
forbid("pages", pages, /schedule:/, "blind scheduled redeploy must stay disabled");
requireMarker("pages", pages, "workflow_dispatch:", "normal Pages workflow must remain dispatchable by recovery controls");

for (const [label, content] of [["recovery", recovery], ["watchdog", watchdog]]) {
  requireMarker(label, content, "actions: write", "Actions write permission is required for rerun/dispatch");
  forbid(label, content, /pages:\s*write|id-token:\s*write|actions\/deploy-pages|actions\/upload-pages-artifact|actions\/configure-pages/, "control workflow must never become an alternate Pages writer");
}

for (const marker of [
  'workflows: ["Deploy GitHub Pages"]',
  "cron: '52 * * * *'",
  "workflow_dispatch:",
  "source_sha",
  "main_sha",
  'source_sha" != "$main_sha',
  "attempt >= 3",
  "setup_only_count",
  "failed_count != setup_only_count",
  "rerun-failed-jobs",
  "source run is stale",
  "Scheduled recovery found no latest failed Pages run for current main SHA",
]) {
  requireMarker("recovery", recovery, marker, `missing bounded setup-only recovery invariant: ${marker}`);
}

for (const marker of [
  "cron: '37 * * * *'",
  "deployments/${main_sha}.json?watchdog=",
  "marker_curl_status",
  "Production could not be reached reliably; watchdog will not request a deploy.",
  "status=${state}",
  "current_failures",
  "current_successes >= 2",
  "Automatic drift dispatch is blocked",
  "Automatic loop is stopped",
  "pages.yml/dispatches",
  "no Git commit was created",
]) {
  requireMarker("watchdog", watchdog, marker, `missing bounded drift-recovery invariant: ${marker}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Pages recovery contract passed: current-SHA setup-only retries are bounded, stale/project failures are blocked, and drift reconciliation cannot become an infinite alternate deployment loop");
