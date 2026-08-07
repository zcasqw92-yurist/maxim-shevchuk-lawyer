import { appendFile, mkdir, writeFile } from "node:fs/promises";

const publicUrl = String(process.env.SITE_PUBLIC_URL || process.env.SITE_URL || "").trim();
const expectedSha = String(process.env.EXPECTED_BUILD_SHA || "").trim();

if (!publicUrl) throw new Error("SITE_PUBLIC_URL or SITE_URL is required");
if (!/^[A-Fa-f0-9]{40}$/.test(expectedSha)) throw new Error("EXPECTED_BUILD_SHA must be a full Git commit SHA");

const base = new URL(publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`);
const reportPath = "reports/live-http-release-verification.json";
const report = {
  checkedAt: new Date().toISOString(),
  publicUrl: base.toString(),
  expectedSha,
  routes: [],
  files: [],
  failures: [],
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const decode = (value = "") => String(value)
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");
const attr = (tag = "", name) => decode(tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "");
const tags = (html, tagName) => [...html.matchAll(new RegExp(`<${tagName}\\s+[^>]*>`, "gi"))].map((match) => match[0]);
const meta = (html, attribute, key) => attr(tags(html, "meta").find((tag) => attr(tag, attribute) === key) || "", "content");
const canonical = (html) => attr(tags(html, "link").find((tag) => attr(tag, "rel").split(/\s+/).includes("canonical")) || "", "href");
const h1Count = (html) => [...html.matchAll(/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/gi)].length;
const noCacheUrl = (pathname) => {
  const url = new URL(pathname, base);
  url.searchParams.set("release_http_check", `${expectedSha.slice(0, 12)}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return url;
};

const request = async (pathname, accept = "text/html") => {
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
  if (!response.ok) throw new Error(`${pathname || "/"}: HTTP ${response.status}`);
  const final = new URL(response.url);
  if (final.origin !== base.origin) throw new Error(`${pathname || "/"}: redirected to unexpected origin ${final.origin}`);
  return { body, finalUrl: response.url, status: response.status };
};

const verifyHtml = async (pathname, { expectedCanonical = null, publication = false } = {}) => {
  const response = await request(pathname);
  const html = response.body;
  const route = {
    pathname: pathname || "/",
    finalUrl: response.finalUrl,
    status: response.status,
    sha: meta(html, "name", "site-build-sha"),
    h1Count: h1Count(html),
    canonical: canonical(html),
  };
  report.routes.push(route);

  assert(route.sha === expectedSha, `${pathname || "/"}: page SHA ${route.sha || "missing"}, expected ${expectedSha}`);
  assert(route.h1Count === 1, `${pathname || "/"}: exactly one H1 is required`);
  assert(!/<(?:form|input|select|textarea)\b/i.test(html), `${pathname || "/"}: data-entry control appeared in public HTML`);
  if (expectedCanonical) assert(route.canonical === expectedCanonical, `${pathname || "/"}: canonical ${route.canonical || "missing"}, expected ${expectedCanonical}`);
  if (publication) {
    assert(meta(html, "property", "og:type") === "article", `${pathname}: og:type must be article`);
    assert(html.includes("data-editorial-helpfulness"), `${pathname}: helpfulness block is missing`);
    assert(html.includes("/assets/editorial-analytics.mjs?v="), `${pathname}: editorial analytics module is missing`);
    const order = [...html.matchAll(/data-helpfulness-value=["'](yes|no|partly)["']/g)].map((match) => match[1]);
    assert(JSON.stringify(order) === JSON.stringify(["yes", "no", "partly"]), `${pathname}: helpfulness order is incorrect`);
    const jsonLdBlocks = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
    assert(jsonLdBlocks.length > 0, `${pathname}: JSON-LD is missing`);
    const graph = [];
    for (const block of jsonLdBlocks) {
      const parsed = JSON.parse(block[1]);
      graph.push(...(Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed]));
    }
    assert(graph.some((node) => {
      const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
      return types.includes("Article");
    }), `${pathname}: Article JSON-LD is missing`);
  }
  return html;
};

const verifyTextFile = async (pathname, markers = []) => {
  const response = await request(pathname, pathname.endsWith(".json") ? "application/json" : "text/plain, application/xml, text/xml, */*");
  report.files.push({ pathname, finalUrl: response.finalUrl, status: response.status });
  for (const marker of markers) assert(response.body.includes(marker), `${pathname}: missing ${marker}`);
  return response.body;
};

try {
  const buildInfoText = await verifyTextFile("build-info.json");
  const buildInfo = JSON.parse(buildInfoText);
  assert(buildInfo.sha === expectedSha, `build-info.json SHA ${buildInfo.sha || "missing"}, expected ${expectedSha}`);

  const manifestText = await verifyTextFile("editorial-publications.json");
  const manifest = JSON.parse(manifestText);
  assert(manifest.schemaVersion === 1, "editorial-publications.json has unsupported schemaVersion");
  assert(Array.isArray(manifest.articles) && Array.isArray(manifest.practiceCases), "editorial publication arrays are missing");
  assert(manifest.articles.length === manifest.counts?.articles, "article count does not match manifest");
  assert(manifest.practiceCases.length === manifest.counts?.practiceCases, "practice case count does not match manifest");

  for (const pathname of ["", "uslugi/", "razbory/", "praktika/", "o-yuriste/", "kontakty/"]) {
    const expectedCanonical = new URL(pathname, base).toString();
    await verifyHtml(pathname, { expectedCanonical });
  }

  const publications = [
    ...manifest.articles.map((item) => ({ ...item, kind: "article" })),
    ...manifest.practiceCases.map((item) => ({ ...item, kind: "case" })),
  ];
  assert(publications.length > 0, "editorial manifest has no publications");

  for (const item of publications) {
    assert(item.status === "published", `${item.url}: status is not published`);
    const url = new URL(item.url);
    assert(url.origin === base.origin, `${item.url}: publication origin is not the production origin`);
    await verifyHtml(url.pathname, { expectedCanonical: item.url, publication: true });
  }

  const robots = await verifyTextFile("robots.txt", ["Sitemap:"]);
  const sitemapFiles = ["sitemap.xml", "sitemap-pages.xml", "sitemap-services.xml", "sitemap-articles.xml", "sitemap-cases.xml", "sitemap-images.xml"];
  const sitemaps = new Map();
  for (const file of sitemapFiles) {
    assert(robots.includes(`Sitemap: ${base.origin}/${file}`), `robots.txt is missing ${file}`);
    const xml = await verifyTextFile(file, ['<?xml version="1.0"']);
    sitemaps.set(file, xml);
  }

  const feed = await verifyTextFile("feed.xml", ['<rss version="2.0"']);
  for (const item of manifest.articles) {
    assert(feed.includes(item.url), `feed.xml is missing ${item.url}`);
    assert(sitemaps.get("sitemap.xml").includes(item.url), `sitemap.xml is missing ${item.url}`);
    assert(sitemaps.get("sitemap-articles.xml").includes(item.url), `sitemap-articles.xml is missing ${item.url}`);
  }
  for (const item of manifest.practiceCases) {
    assert(sitemaps.get("sitemap.xml").includes(item.url), `sitemap.xml is missing ${item.url}`);
    assert(sitemaps.get("sitemap-cases.xml").includes(item.url), `sitemap-cases.xml is missing ${item.url}`);
  }

  report.result = "success";
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  report.result = "failure";
  report.failures.push(message);
  throw error;
} finally {
  await mkdir("reports", { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = report.result === "success"
      ? `Production HTTP verification passed for ${report.routes.length} HTML routes and ${report.files.length} public files.`
      : `Production HTTP verification failed: ${report.failures.join(" | ")}`;
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## Production HTTP verification\n\n${summary}\n`, "utf8");
  }
}

console.log(`Production HTTP release verified: ${report.routes.length} HTML routes · ${report.files.length} public files · ${expectedSha.slice(0, 12)} · ${base.origin}`);
