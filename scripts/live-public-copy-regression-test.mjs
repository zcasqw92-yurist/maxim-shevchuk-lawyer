import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPublicCopyFindings, visibleMainText } from "./public-copy-rules.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = join(root, "reports");
const reportPath = join(reportsDir, "public-copy-regression.json");
const publicUrl = String(process.env.SITE_PUBLIC_URL || process.env.SITE_URL || "").trim();
const expectedSha = String(process.env.EXPECTED_BUILD_SHA || "").trim();

if (!publicUrl) throw new Error("SITE_PUBLIC_URL or SITE_URL is required");
if (!/^[A-Fa-f0-9]{40}$/.test(expectedSha)) throw new Error("EXPECTED_BUILD_SHA must be a full Git commit SHA");

const base = new URL(publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`);
const report = {
  checkedAt: new Date().toISOString(),
  expectedSha,
  publicUrl: base.toString(),
  articles: [],
  findings: [],
};

const noCacheUrl = (pathname) => {
  const url = new URL(pathname, base);
  url.searchParams.set("public_copy_regression", `${expectedSha.slice(0, 12)}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return url;
};

const fetchText = async (pathname, accept = "text/html") => {
  const response = await fetch(noCacheUrl(pathname), {
    headers: {
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
      accept,
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`);
  return { body, finalUrl: response.url };
};

const buildInfo = JSON.parse((await fetchText("build-info.json", "application/json")).body);
if (buildInfo.sha !== expectedSha) throw new Error(`Published SHA ${buildInfo.sha || "missing"}, expected ${expectedSha}`);

const manifest = JSON.parse((await fetchText("editorial-publications.json", "application/json")).body);
if (!Array.isArray(manifest.articles)) throw new Error("editorial-publications.json has no articles array");

for (const article of manifest.articles.filter((item) => item.status === "published")) {
  const pathname = new URL(article.url).pathname;
  const response = await fetchText(pathname);
  const text = visibleMainText(response.body);
  const findings = findPublicCopyFindings([text]);
  const metaSha = response.body.match(/<meta\s+name=["']site-build-sha["']\s+content=["']([^"']+)["'][^>]*>/i)?.[1]
    || response.body.match(/<meta\s+content=["']([^"']+)["']\s+name=["']site-build-sha["'][^>]*>/i)?.[1]
    || "";

  if (metaSha !== expectedSha) throw new Error(`${pathname}: page SHA ${metaSha || "missing"}, expected ${expectedSha}`);

  report.articles.push({
    id: article.id,
    url: article.url,
    pathname,
    finalUrl: response.finalUrl,
    findings: findings.length,
  });

  for (const finding of findings) {
    report.findings.push({
      articleId: article.id,
      url: article.url,
      ruleId: finding.ruleId,
      label: finding.label,
      match: finding.match,
    });
  }
}

report.result = report.findings.length ? "failure" : "success";
report.checkedArticleCount = report.articles.length;
await mkdir(reportsDir, { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const summary = report.findings.length
  ? `Public-copy regression failed: ${report.findings.length} finding(s) across ${report.articles.length} published article(s).`
  : `Public-copy regression passed: ${report.articles.length} published article(s) checked.`;

if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## Контроль публичных статей\n\n${summary}\n`, "utf8");

if (report.findings.length) {
  console.error(summary);
  for (const finding of report.findings) console.error(`- ${finding.url}: ${finding.label}: ${finding.match}`);
  process.exit(1);
}

console.log(`${summary} ${expectedSha.slice(0, 12)} · ${base.origin}`);
