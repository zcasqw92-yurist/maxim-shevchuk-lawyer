import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = join(root, "reports");
const reportPath = join(reportsDir, "custom-domain-sha-verification.json");

const publicUrl = String(process.env.SITE_CUSTOM_DOMAIN_URL || process.env.SITE_URL || "").trim();
const expectedSha = String(process.env.EXPECTED_BUILD_SHA || "").trim();
const attempts = Math.max(1, Number(process.env.CUSTOM_DOMAIN_VERIFY_ATTEMPTS || 30));
const delayMs = Math.max(1_000, Number(process.env.CUSTOM_DOMAIN_VERIFY_DELAY_MS || 10_000));
const timeoutMs = Math.max(5_000, Number(process.env.CUSTOM_DOMAIN_VERIFY_TIMEOUT_MS || 20_000));

if (!publicUrl) throw new Error("SITE_CUSTOM_DOMAIN_URL or SITE_URL is required");
if (!/^[A-Fa-f0-9]{40}$/.test(expectedSha)) throw new Error("EXPECTED_BUILD_SHA must be a full Git commit SHA");

const base = new URL(publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`);
if (base.protocol !== "https:") throw new Error("Custom domain verification requires HTTPS");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const diagnostics = {
  expectedSha,
  publicUrl: base.toString(),
  startedAt: new Date().toISOString(),
  attempts: [],
};

const noCacheUrl = (pathname, attempt) => {
  const url = new URL(pathname, base);
  url.searchParams.set("deployment_sha_check", `${expectedSha.slice(0, 12)}-${attempt}-${Date.now()}`);
  return url;
};

const selectedHeaders = (headers) => Object.fromEntries(
  ["server", "age", "cache-control", "cf-cache-status", "x-cache", "etag", "last-modified"]
    .map((name) => [name, headers.get(name)])
    .filter(([, value]) => value !== null),
);

const requestText = async (pathname, attempt) => {
  const requestedUrl = noCacheUrl(pathname, attempt);
  const response = await fetch(requestedUrl, {
    headers: {
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
      accept: pathname.endsWith(".json") ? "application/json" : "text/html",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();
  return {
    requestedUrl: requestedUrl.toString(),
    finalUrl: response.url,
    status: response.status,
    ok: response.ok,
    headers: selectedHeaders(response.headers),
    body,
  };
};

const readMetaSha = (html) => html.match(/<meta\s+name=["']site-build-sha["']\s+content=["']([^"']+)["'][^>]*>/i)?.[1]
  || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']site-build-sha["'][^>]*>/i)?.[1]
  || "";

const saveDiagnostics = async () => {
  diagnostics.finishedAt = new Date().toISOString();
  await mkdir(reportsDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");
};

let lastError = "custom domain has not returned the expected build";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const record = { attempt, checkedAt: new Date().toISOString() };
  try {
    const buildResponse = await requestText("build-info.json", attempt);
    record.buildInfo = {
      ...buildResponse,
      body: buildResponse.body.slice(0, 2_000),
    };
    if (!buildResponse.ok) throw new Error(`build-info.json returned ${buildResponse.status}`);
    if (new URL(buildResponse.finalUrl).origin !== base.origin) {
      throw new Error(`build-info.json redirected to unexpected origin ${new URL(buildResponse.finalUrl).origin}`);
    }

    let info;
    try {
      info = JSON.parse(buildResponse.body);
    } catch (error) {
      throw new Error(`build-info.json is invalid JSON: ${error.message}`);
    }
    if (info.sha !== expectedSha) {
      throw new Error(`build-info.json returned SHA ${info.sha || "missing"}`);
    }

    const homeResponse = await requestText("", attempt);
    record.home = {
      requestedUrl: homeResponse.requestedUrl,
      finalUrl: homeResponse.finalUrl,
      status: homeResponse.status,
      ok: homeResponse.ok,
      headers: homeResponse.headers,
    };
    if (!homeResponse.ok) throw new Error(`home page returned ${homeResponse.status}`);
    if (new URL(homeResponse.finalUrl).origin !== base.origin) {
      throw new Error(`home page redirected to unexpected origin ${new URL(homeResponse.finalUrl).origin}`);
    }

    const metaSha = readMetaSha(homeResponse.body);
    record.home.sha = metaSha;
    if (metaSha !== expectedSha) {
      throw new Error(`home page returned SHA ${metaSha || "missing"}`);
    }

    record.result = "success";
    diagnostics.attempts.push(record);
    diagnostics.result = "success";
    await saveDiagnostics();
    console.log(`Custom domain build verified: ${expectedSha.slice(0, 12)} · ${base.origin}`);
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    record.result = "retry";
    record.error = lastError;
    diagnostics.attempts.push(record);
    console.log(`Custom domain SHA attempt ${attempt}/${attempts}: ${lastError}`);
    if (attempt < attempts) await sleep(delayMs);
  }
}

diagnostics.result = "failure";
diagnostics.error = lastError;
await saveDiagnostics();
throw new Error(`Custom domain SHA verification failed: ${lastError}`);
