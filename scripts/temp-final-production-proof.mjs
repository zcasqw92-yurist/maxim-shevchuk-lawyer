import { createHash } from "node:crypto";

const expectedSha = "43c2e3ab0266460ec06829a8eafcf07230716271";
const expectedImageSha256 = "b19f96b81b2483b9155b27412b69f6bb2d9fce7112a9a8ad56f51a5bd607c5ba";
const origin = "https://yuristshevchuk.com";
const repo = "zcasqw92-yurist/maxim-shevchuk-lawyer";
const notBefore = Date.parse("2026-08-10T21:23:00Z");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json", "user-agent": "photo-release-proof/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
};

let deployRun = null;
let verifyRun = null;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  const bySha = await fetchJson(`https://api.github.com/repos/${repo}/actions/runs?per_page=100&head_sha=${expectedSha}`);
  const all = await fetchJson(`https://api.github.com/repos/${repo}/actions/runs?per_page=100`);
  deployRun = bySha.workflow_runs?.find((run) => run.name === "Deploy GitHub Pages") || deployRun;
  verifyRun = bySha.workflow_runs?.find((run) => run.name === "Verify Published Site")
    || all.workflow_runs?.find((run) => run.name === "Verify Published Site" && Date.parse(run.created_at) >= notBefore)
    || verifyRun;

  if (deployRun?.conclusion === "failure" || deployRun?.conclusion === "cancelled") {
    throw new Error(`Deploy GitHub Pages failed: run ${deployRun.id} conclusion=${deployRun.conclusion}`);
  }
  if (verifyRun?.conclusion === "failure" || verifyRun?.conclusion === "cancelled") {
    throw new Error(`Verify Published Site failed: run ${verifyRun.id} conclusion=${verifyRun.conclusion}`);
  }
  if (deployRun?.status === "completed" && deployRun?.conclusion === "success"
      && verifyRun?.status === "completed" && verifyRun?.conclusion === "success") break;

  if (attempt === 12) {
    throw new Error(`Production workflows not complete: deploy=${deployRun?.status}/${deployRun?.conclusion}; verify=${verifyRun?.status}/${verifyRun?.conclusion}`);
  }
  console.log(`Waiting for production workflows ${attempt}/12: deploy=${deployRun?.status || "missing"}/${deployRun?.conclusion || "-"}; verify=${verifyRun?.status || "missing"}/${verifyRun?.conclusion || "-"}`);
  await sleep(15_000);
}

const verifyJobs = await fetchJson(`https://api.github.com/repos/${repo}/actions/runs/${verifyRun.id}/jobs?per_page=100`);
const verifyJob = verifyJobs.jobs?.find((job) => job.name === "Verify production SHA and HTTP release");
if (!verifyJob || verifyJob.conclusion !== "success") throw new Error(`Verify job is not successful: ${verifyJob?.conclusion || "missing"}`);
const requiredSteps = [
  "Wait for immutable deployment marker and custom-domain SHA",
  "Verify published release over HTTP",
  "Recheck all published articles",
  "Notify IndexNow about changed pages",
];
for (const name of requiredSteps) {
  const step = verifyJob.steps?.find((item) => item.name === name);
  if (!step || step.conclusion !== "success") throw new Error(`Post-deploy step failed or missing: ${name} (${step?.conclusion || "missing"})`);
}

const noCacheGet = async (path, accept = "*/*") => {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${origin}${path}${separator}final_proof=${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await fetch(url, {
    headers: { "cache-control": "no-cache, no-store, max-age=0", pragma: "no-cache", accept },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
};

const marker = await (await noCacheGet(`/deployments/${expectedSha}.json`, "application/json")).text();
if (!marker.includes(expectedSha)) throw new Error("Immutable deployment marker mismatch");
const build = await (await noCacheGet("/build-info.json", "application/json")).json();
if (build.sha !== expectedSha) throw new Error(`build-info sha ${build.sha}, expected ${expectedSha}`);
const home = await (await noCacheGet("/", "text/html")).text();
const metaSha = home.match(/<meta\s+name=["']site-build-sha["']\s+content=["']([^"']+)["']/i)?.[1]
  || home.match(/<meta\s+content=["']([^"']+)["']\s+name=["']site-build-sha["']/i)?.[1];
if (metaSha !== expectedSha) throw new Error(`homepage meta sha ${metaSha || "missing"}, expected ${expectedSha}`);
const image = Buffer.from(await (await noCacheGet("/assets/images/maxim-hero.webp", "image/webp,*/*")).arrayBuffer());
const imageHash = createHash("sha256").update(image).digest("hex");
if (imageHash !== expectedImageSha256) throw new Error(`hero sha256 ${imageHash}, expected ${expectedImageSha256}; bytes=${image.length}`);

console.log(`FINAL_PRODUCTION_PROOF_OK sha=${expectedSha} deploy_run=${deployRun.id} verify_run=${verifyRun.id} hero_sha256=${imageHash} hero_bytes=${image.length}`);
