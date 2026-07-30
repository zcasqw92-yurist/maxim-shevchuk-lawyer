import { chromium, webkit } from "playwright";
import { caseStudies, pageCaseIds } from "../src/case-studies.mjs";

const publicUrl = String(process.env.SITE_PUBLIC_URL || "").trim();
const canonicalUrl = String(process.env.SITE_CANONICAL_URL || publicUrl).trim();
const expectedSha = String(process.env.EXPECTED_BUILD_SHA || "").trim();
const attempts = Math.max(1, Number(process.env.LIVE_SMOKE_ATTEMPTS || 18));
const delayMs = Math.max(1000, Number(process.env.LIVE_SMOKE_DELAY_MS || 5000));

if (!publicUrl) throw new Error("SITE_PUBLIC_URL is required");
if (!canonicalUrl) throw new Error("SITE_CANONICAL_URL or SITE_PUBLIC_URL is required");
if (!/^[A-Fa-f0-9]{40}$/.test(expectedSha)) throw new Error("EXPECTED_BUILD_SHA must be a full Git commit SHA");

const base = new URL(publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`);
const canonicalBase = new URL(canonicalUrl.endsWith("/") ? canonicalUrl : `${canonicalUrl}/`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const expectedHomeCaseMarkers = (pageCaseIds["/"] || []).map((id) => {
  const item = caseStudies[id];
  if (!item) throw new Error(`Unknown configured home case: ${id}`);
  return `id="case-${item.id}"`;
});
const noCacheUrl = (pathname) => {
  const url = new URL(pathname, base);
  url.searchParams.set("deployment_check", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return url;
};
const fetchText = async (pathname) => {
  const response = await fetch(noCacheUrl(pathname), {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${pathname || "/"} returned ${response.status}`);
  return response.text();
};
const fetchJson = async (pathname) => JSON.parse(await fetchText(pathname));
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
const metas = (html, attribute, key) => tags(html, "meta").filter((tag) => attr(tag, attribute) === key);
const meta = (html, attribute, key) => attr(metas(html, attribute, key)[0] || "", "content");
const links = (html, rel) => tags(html, "link").filter((tag) => attr(tag, "rel").split(/\s+/).includes(rel));
const link = (html, rel) => attr(links(html, rel)[0] || "", "href");
const text = (value = "") => decode(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const titleOf = (html) => text(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
const h1Of = (html) => text(html.match(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i)?.[1] || "");
const nodeTypes = (node) => Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]].filter(Boolean);
const canonicalFor = (pathname) => new URL(pathname, canonicalBase).toString();
const fetchPath = (url) => new URL(url).pathname.replace(/^\//, "");
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const graphOf = (html, label) => {
  const graph = [];
  const blocks = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  assert(blocks.length > 0, `${label}: JSON-LD is missing`);
  for (const block of blocks) {
    let parsed;
    try { parsed = JSON.parse(block[1]); }
    catch (error) { throw new Error(`${label}: JSON-LD cannot be parsed (${error.message})`); }
    graph.push(...(Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed]));
  }
  return graph;
};

const verifyMetadata = (html, { label, canonical, publication = false }) => {
  const title = titleOf(html);
  const description = meta(html, "name", "description");
  const h1 = h1Of(html);
  const h1Count = [...html.matchAll(/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/gi)].length;

  assert(title.length >= 30 && title.length <= 65, `${label}: title length ${title.length}, expected 30-65`);
  assert(description.length >= 70 && description.length <= 170, `${label}: description length ${description.length}, expected 70-170`);
  assert(links(html, "canonical").length === 1 && link(html, "canonical") === canonical, `${label}: canonical does not match ${canonical}`);
  assert(h1Count === 1 && h1, `${label}: exactly one non-empty H1 is required`);
  assert(meta(html, "name", "site-build-sha") === expectedSha, `${label}: build SHA meta does not match ${expectedSha}`);
  assert(meta(html, "property", "og:title") === title, `${label}: og:title does not match title`);
  assert(meta(html, "property", "og:description") === description, `${label}: og:description does not match description`);
  assert(meta(html, "property", "og:url") === canonical, `${label}: og:url does not match canonical`);
  assert(meta(html, "name", "twitter:title") === title, `${label}: twitter:title does not match title`);
  assert(meta(html, "name", "twitter:description") === description, `${label}: twitter:description does not match description`);
  for (const [attribute, key] of [
    ["property", "og:image"], ["property", "og:image:width"], ["property", "og:image:height"], ["property", "og:image:alt"],
    ["name", "twitter:card"], ["name", "twitter:image"], ["name", "twitter:image:alt"],
  ]) assert(metas(html, attribute, key).length === 1 && meta(html, attribute, key), `${label}: ${key} must be filled exactly once`);

  const graph = graphOf(html, label);
  const webPage = graph.find((node) => nodeTypes(node).some((type) => ["WebPage", "ProfilePage", "ContactPage", "CollectionPage"].includes(type)));
  assert(webPage, `${label}: WebPage JSON-LD node is missing`);
  assert(webPage.name === title, `${label}: WebPage.name does not match title`);
  assert(webPage.description === description, `${label}: WebPage.description does not match description`);
  assert(webPage.url === canonical, `${label}: WebPage.url does not match canonical`);

  const articleKeys = ["article:published_time", "article:modified_time", "article:author", "article:section"];
  if (!publication) {
    assert(meta(html, "property", "og:type") === "website", `${label}: regular page must have og:type=website`);
    for (const key of articleKeys) assert(metas(html, "property", key).length === 0, `${label}: ${key} must not appear on a regular page`);
    return;
  }

  assert(meta(html, "property", "og:type") === "article", `${label}: publication must have og:type=article`);
  for (const key of articleKeys) assert(metas(html, "property", key).length === 1 && meta(html, "property", key), `${label}: ${key} must be filled exactly once`);
  const published = meta(html, "property", "article:published_time");
  const modified = meta(html, "property", "article:modified_time");
  assert(validDate(published) && validDate(modified) && modified >= published, `${label}: invalid publication dates`);
  assert(meta(html, "property", "article:author") === canonicalFor("/o-yuriste/"), `${label}: article author URL is incorrect`);

  const article = graph.find((node) => nodeTypes(node).includes("Article"));
  assert(article, `${label}: Article JSON-LD node is missing`);
  assert(article.headline === h1, `${label}: Article.headline does not match H1`);
  assert(article.description === description, `${label}: Article.description does not match description`);
  assert(article.datePublished === published && article.dateModified === modified, `${label}: Article dates do not match Open Graph`);
  assert(article.mainEntityOfPage?.["@id"] === webPage["@id"], `${label}: Article is not linked to WebPage`);
  assert(article.author?.["@id"], `${label}: Article author entity is missing`);

  const order = [...html.matchAll(/data-helpfulness-value=["'](yes|no|partly)["']/g)].map((match) => match[1]);
  assert(JSON.stringify(order) === JSON.stringify(["yes", "no", "partly"]), `${label}: helpfulness order must be yes, no, partly`);
  assert(!/<(?:form|input|select|textarea)\b/i.test(html), `${label}: publication exposes data-entry controls`);
};

const verifyPublication = (html, { label, canonical, kind }) => {
  verifyMetadata(html, { label, canonical, publication: true });
  for (const marker of ["data-editorial-helpfulness", "/assets/editorial-analytics.mjs?v=", `data-publication-kind=\"${kind}\"`]) {
    assert(html.includes(marker), `${label}: missing ${marker}`);
  }
  if (kind === "article") for (const marker of ['id="self-check"', 'id="message-guide"', 'id="faq"', "faq-item"]) {
    assert(html.includes(marker), `${label}: missing ${marker}`);
  }
};

const verifyPublishedFiles = async () => {
  const info = await fetchJson("build-info.json");
  assert(info.sha === expectedSha, `published SHA ${info.sha || "missing"}, expected ${expectedSha}`);
  assert(String(info.version || "").trim(), "build-info.json has no version");

  const home = await fetchText("");
  verifyMetadata(home, { label: "home", canonical: canonicalFor("/") });
  const homeCaseCount = (home.match(/<article class="case-study reveal"/g) || []).length;
  assert(homeCaseCount === expectedHomeCaseMarkers.length, `home page has ${homeCaseCount} case cards, expected ${expectedHomeCaseMarkers.length}`);
  for (const marker of [
    "trust-strip__grid", "section--value-editorial", "section--cta-portrait", "messenger-choices--dialog",
    "data-mobile-contact-now", "mobile-contact--single", "section--case-studies", ...expectedHomeCaseMarkers,
    "Кейсы обезличены", 'href="/razbory/"', 'href="/praktika/"', 'rel="alternate" type="application/rss+xml"',
  ]) assert(home.includes(marker), `home page is missing ${marker}`);
  for (const marker of [
    "<form", "<input", "<select", "<textarea", "data-callback", "callback-dialog", "data-price-quiz",
    "price-quiz-dialog", "section--document-samples", "section--featured-case", "section--visual-cases",
    "data-video-launch", "data-video-dialog", "data-proof-dialog", "Видео готовится", "Демо-макет",
    "Демо-визуал", "-demo.svg", "Топникова", "Алиакбарова", "Шибаева", "КУСП №", "УИД",
    "дело выиграно", "деньги возвращены полностью",
  ]) assert(!home.includes(marker), `home page exposes forbidden or unconfirmed material: ${marker}`);

  const manifest = await fetchJson("editorial-publications.json");
  assert(manifest.schemaVersion === 1, "editorial-publications.json has unsupported schemaVersion");
  assert(manifest.counts?.articles >= 1 && manifest.counts?.practiceCases >= 1, "editorial manifest has no published content");
  assert(manifest.articles.length === manifest.counts.articles, "article count does not match manifest");
  assert(manifest.practiceCases.length === manifest.counts.practiceCases, "case count does not match manifest");

  const articleIndex = await fetchText("razbory/");
  const caseIndex = await fetchText("praktika/");
  verifyMetadata(articleIndex, { label: "article index", canonical: canonicalFor("/razbory/") });
  verifyMetadata(caseIndex, { label: "practice index", canonical: canonicalFor("/praktika/") });
  for (const item of manifest.articles) {
    assert(item.status === "published" && new URL(item.url).origin === canonicalBase.origin, `invalid article manifest entry ${item.url}`);
    assert(articleIndex.includes(`href="${new URL(item.url).pathname}"`), `article index is missing ${item.url}`);
  }
  for (const item of manifest.practiceCases) {
    assert(item.status === "published" && new URL(item.url).origin === canonicalBase.origin, `invalid case manifest entry ${item.url}`);
    assert(caseIndex.includes(`href="${new URL(item.url).pathname}"`), `practice index is missing ${item.url}`);
  }

  const articleItem = manifest.articles[0];
  const caseItem = manifest.practiceCases[0];
  const articlePath = fetchPath(articleItem.url);
  const casePath = fetchPath(caseItem.url);
  verifyPublication(await fetchText(articlePath), { label: "article", canonical: articleItem.url, kind: "article" });
  verifyPublication(await fetchText(casePath), { label: "case", canonical: caseItem.url, kind: "case" });

  const feed = await fetchText("feed.xml");
  for (const marker of ['<rss version="2.0"', "<atom:link ", "<dc:creator>"]) assert(feed.includes(marker), `feed.xml is missing ${marker}`);
  for (const item of manifest.articles) assert(feed.includes(item.url), `feed.xml is missing ${item.url}`);

  const sitemapFiles = ["sitemap.xml", "sitemap-pages.xml", "sitemap-services.xml", "sitemap-articles.xml", "sitemap-cases.xml", "sitemap-images.xml"];
  const robots = await fetchText("robots.txt");
  const sitemaps = new Map();
  for (const file of sitemapFiles) {
    assert(robots.includes(`Sitemap: ${canonicalBase.origin}/${file}`), `robots.txt is missing ${file}`);
    const sitemap = await fetchText(file);
    assert(sitemap.includes('<?xml version="1.0"'), `${file} is not XML`);
    sitemaps.set(file, sitemap);
  }
  for (const item of manifest.articles) {
    assert(sitemaps.get("sitemap.xml").includes(item.url), `sitemap.xml is missing ${item.url}`);
    assert(sitemaps.get("sitemap-articles.xml").includes(item.url), `sitemap-articles.xml is missing ${item.url}`);
  }
  for (const item of manifest.practiceCases) {
    assert(sitemaps.get("sitemap.xml").includes(item.url), `sitemap.xml is missing ${item.url}`);
    assert(sitemaps.get("sitemap-cases.xml").includes(item.url), `sitemap-cases.xml is missing ${item.url}`);
  }
  assert(sitemaps.get("sitemap-images.xml").includes("<image:image>"), "sitemap-images.xml has no image entries");

  const app = await fetchText("assets/app.js");
  for (const marker of ["new FormData", "reportValidity", "data-callback", "data-price-quiz", "priceQuiz", "callbackForm"]) {
    assert(!app.includes(marker), `published app contains removed data-entry logic: ${marker}`);
  }
  const analytics = await fetchText("assets/editorial-analytics.mjs");
  for (const marker of ["publication_scroll_${threshold}", "publication_active_${threshold}s", "publication_section_view", "publication_helpfulness", "analytics_consent"]) {
    assert(analytics.includes(marker), `editorial analytics is missing ${marker}`);
  }
  assert(typeof (await fetchJson("video-config.json")).enabled === "boolean", "video-config.json has no enabled boolean");
  return { manifest, articlePath, casePath };
};

const inspectLayout = async (page, label) => {
  const state = await page.evaluate(() => ({
    innerWidth,
    rootWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    controls: document.querySelectorAll("form, input, select, textarea").length,
    sha: document.querySelector('meta[name="site-build-sha"]')?.content || "",
  }));
  const overflow = Math.max(state.rootWidth, state.bodyWidth) - state.innerWidth;
  assert(overflow <= 1.5, `${label}: horizontal overflow ${overflow}px`);
  assert(state.controls === 0, `${label}: ${state.controls} data-entry controls in DOM`);
  assert(state.sha === expectedSha, `${label}: browser received build ${state.sha || "missing"}`);
};

const verifyBrowserPages = async ({ manifest, articlePath, casePath }) => {
  const routes = [
    { label: "article index", path: "razbory/", width: 320, cards: manifest.counts.articles },
    { label: "practice index", path: "praktika/", width: 390, cards: manifest.counts.practiceCases },
    { label: "article", path: articlePath, width: 320, kind: "article" },
    { label: "case", path: casePath, width: 390, kind: "case" },
  ];
  for (const { name, launcher } of [{ name: "Chromium", launcher: chromium }, { name: "WebKit", launcher: webkit }]) {
    const browser = await launcher.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
      await context.addInitScript(() => {
        localStorage.setItem("analytics_consent", "denied");
        sessionStorage.setItem("site_engagement_nudge_shown", "true");
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      for (const route of routes) {
        await page.setViewportSize({ width: route.width, height: 844 });
        const response = await page.goto(noCacheUrl(route.path).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
        assert(response?.ok(), `${name} ${route.label}: navigation returned ${response?.status() || "no response"}`);
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
        await page.evaluate(() => document.fonts?.ready);
        await page.waitForTimeout(100);
        await inspectLayout(page, `${name} ${route.label} ${route.width}px`);

        if (route.cards) {
          assert(await page.locator(".editorial-grid .editorial-card").count() === route.cards, `${name} ${route.label}: incorrect card count`);
          assert(await page.locator(".editorial-grid .card-link").first().isVisible(), `${name} ${route.label}: card link is not visible`);
        }
        if (route.kind) {
          const order = await page.locator("[data-helpfulness-value]").evaluateAll((buttons) => buttons.map((button) => button.dataset.helpfulnessValue));
          assert(JSON.stringify(order) === JSON.stringify(["yes", "no", "partly"]), `${name} ${route.label}: incorrect helpfulness order`);
          assert(await page.locator("[data-editorial-helpfulness]").isVisible(), `${name} ${route.label}: helpfulness is not visible`);
        }
        if (route.kind === "article") {
          const firstFaq = page.locator(".faq-item").first();
          assert(await page.locator(".faq-item").count() > 0, `${name} article: FAQ is missing`);
          assert(await firstFaq.evaluate((element) => element.open), `${name} article: first FAQ is not initially open`);
          await firstFaq.locator("summary").click();
          assert(!await firstFaq.evaluate((element) => element.open), `${name} article: FAQ did not close`);
          await firstFaq.locator("summary").click();
          assert(await firstFaq.evaluate((element) => element.open), `${name} article: FAQ did not reopen`);

          await page.locator('[data-helpfulness-value="no"]').click();
          await page.waitForFunction(() => {
            const buttons = [...document.querySelectorAll("[data-helpfulness-value]")];
            const status = document.querySelector("[data-helpfulness-status]")?.textContent?.trim() || "";
            return buttons.length === 3
              && buttons.every((button) => button.disabled)
              && buttons.find((button) => button.dataset.helpfulnessValue === "no")?.getAttribute("aria-pressed") === "true"
              && status.length > 0;
          }, null, { timeout: 3_000 });
          const status = (await page.locator("[data-helpfulness-status]").textContent())?.trim() || "";
          assert(status.includes("Аналитика отключена"), `${name} article: denied-analytics status is incorrect (${status})`);
        }
      }
      assert(pageErrors.length === 0, `${name}: page errors: ${pageErrors.join(" | ")}`);
      await context.close();
    } finally { await browser.close(); }
  }
};

let snapshot = null;
let lastError = "published build has not become available";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try { snapshot = await verifyPublishedFiles(); break; }
  catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.log(`Live smoke attempt ${attempt}/${attempts}: ${lastError}`);
    if (attempt < attempts) await sleep(delayMs);
  }
}
if (!snapshot) throw new Error(`GitHub Pages deployment verification failed: ${lastError}`);

let browserError = null;
for (let attempt = 1; attempt <= 2; attempt += 1) {
  try { await verifyBrowserPages(snapshot); browserError = null; break; }
  catch (error) {
    browserError = error instanceof Error ? error : new Error(String(error));
    console.log(`Live browser smoke attempt ${attempt}/2: ${browserError.message}`);
    if (attempt < 2) await sleep(1_500);
  }
}
if (browserError) throw browserError;

console.log(`Published GitHub Pages build verified: ${expectedSha.slice(0, 12)} · synchronized SEO metadata · RSS and sitemaps · FAQ and helpfulness · narrow Chromium/WebKit · ${base}`);
