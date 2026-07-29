import { chromium, webkit } from "playwright";

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
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
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
const decodeHtml = (value = "") => String(value)
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");
const attr = (tag = "", name) => decodeHtml(tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "");
const metaTags = (html, attribute, key) => [...html.matchAll(/<meta\s+[^>]*>/gi)]
  .map((match) => match[0])
  .filter((tag) => attr(tag, attribute) === key);
const meta = (html, attribute, key) => attr(metaTags(html, attribute, key)[0] || "", "content");
const linkTags = (html, rel) => [...html.matchAll(/<link\s+[^>]*>/gi)]
  .map((match) => match[0])
  .filter((tag) => attr(tag, "rel").split(/\s+/).includes(rel));
const link = (html, rel) => attr(linkTags(html, rel)[0] || "", "href");
const textOf = (value = "") => decodeHtml(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const titleOf = (html) => textOf(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
const h1Of = (html) => textOf(html.match(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i)?.[1] || "");
const typesOf = (node) => Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]].filter(Boolean);
const jsonLdGraph = (html, label) => {
  const nodes = [];
  const blocks = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  assert(blocks.length > 0, `${label}: JSON-LD is missing`);
  for (const block of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(block[1]);
    } catch (error) {
      throw new Error(`${label}: JSON-LD cannot be parsed (${error.message})`);
    }
    nodes.push(...(Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed]));
  }
  return nodes;
};
const expectedCanonical = (pathname) => new URL(pathname, canonicalBase).toString();
const pathnameFromUrl = (url) => new URL(url).pathname.replace(/^\//, "");
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const verifyMetadata = ({ html, label, canonical, publication = false }) => {
  const title = titleOf(html);
  const description = meta(html, "name", "description");
  const pageCanonical = link(html, "canonical");
  const h1Matches = [...html.matchAll(/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/gi)];
  const h1 = h1Of(html);

  assert(title.length >= 30 && title.length <= 65, `${label}: title length ${title.length}, expected 30-65`);
  assert(description.length >= 70 && description.length <= 170, `${label}: description length ${description.length}, expected 70-170`);
  assert(linkTags(html, "canonical").length === 1, `${label}: canonical must be present exactly once`);
  assert(pageCanonical === canonical, `${label}: canonical ${pageCanonical || "missing"}, expected ${canonical}`);
  assert(h1Matches.length === 1 && h1, `${label}: exactly one non-empty H1 is required`);
  assert(meta(html, "name", "site-build-sha") === expectedSha, `${label}: build SHA meta does not match ${expectedSha}`);
  assert(meta(html, "property", "og:title") === title, `${label}: og:title does not match title`);
  assert(meta(html, "property", "og:description") === description, `${label}: og:description does not match description`);
  assert(meta(html, "property", "og:url") === canonical, `${label}: og:url does not match canonical`);
  assert(meta(html, "name", "twitter:title") === title, `${label}: twitter:title does not match title`);
  assert(meta(html, "name", "twitter:description") === description, `${label}: twitter:description does not match description`);
  for (const [attribute, key] of [
    ["property", "og:image"],
    ["property", "og:image:width"],
    ["property", "og:image:height"],
    ["property", "og:image:alt"],
    ["name", "twitter:card"],
    ["name", "twitter:image"],
    ["name", "twitter:image:alt"],
  ]) {
    assert(metaTags(html, attribute, key).length === 1 && meta(html, attribute, key), `${label}: ${key} must be filled exactly once`);
  }

  const graph = jsonLdGraph(html, label);
  const webPage = graph.find((node) => typesOf(node).some((type) => ["WebPage", "ProfilePage", "ContactPage", "CollectionPage"].includes(type)));
  assert(webPage, `${label}: WebPage JSON-LD node is missing`);
  assert(webPage.name === title, `${label}: WebPage.name does not match title`);
  assert(webPage.description === description, `${label}: WebPage.description does not match description`);
  assert(webPage.url === canonical, `${label}: WebPage.url does not match canonical`);

  if (!publication) {
    assert(meta(html, "property", "og:type") === "website", `${label}: regular page must have og:type=website`);
    for (const key of ["article:published_time", "article:modified_time", "article:author", "article:section"]) {
      assert(metaTags(html, "property", key).length === 0, `${label}: ${key} must not appear on a regular page`);
    }
    return { title, description, h1, graph, webPage };
  }

  assert(meta(html, "property", "og:type") === "article", `${label}: publication must have og:type=article`);
  const published = meta(html, "property", "article:published_time");
  const modified = meta(html, "property", "article:modified_time");
  const author = meta(html, "property", "article:author");
  const section = meta(html, "property", "article:section");
  for (const key of ["article:published_time", "article:modified_time", "article:author", "article:section"]) {
    assert(metaTags(html, "property", key).length === 1 && meta(html, "property", key), `${label}: ${key} must be filled exactly once`);
  }
  assert(validDate(published) && validDate(modified), `${label}: article dates must be YYYY-MM-DD`);
  assert(modified >= published, `${label}: modified date precedes published date`);
  assert(author === expectedCanonical("/o-yuriste/"), `${label}: article author URL is incorrect`);
  assert(section.trim().length > 0, `${label}: article section is empty`);

  const article = graph.find((node) => typesOf(node).includes("Article"));
  assert(article, `${label}: Article JSON-LD node is missing`);
  assert(article.headline === h1, `${label}: Article.headline does not match H1`);
  assert(article.description === description, `${label}: Article.description does not match meta description`);
  assert(article.datePublished === published, `${label}: Article.datePublished does not match Open Graph`);
  assert(article.dateModified === modified, `${label}: Article.dateModified does not match Open Graph`);
  assert(article.mainEntityOfPage?.["@id"] === webPage["@id"], `${label}: Article is not linked to WebPage`);
  assert(article.author?.["@id"], `${label}: Article author entity is missing`);

  const helpfulnessOrder = [...html.matchAll(/data-helpfulness-value=["'](yes|no|partly)["']/g)].map((match) => match[1]);
  assert(JSON.stringify(helpfulnessOrder) === JSON.stringify(["yes", "no", "partly"]), `${label}: helpfulness order must be yes, no, partly`);
  assert(!/<(?:form|input|select|textarea)\b/i.test(html), `${label}: publication exposes data-entry controls`);
  return { title, description, h1, graph, webPage, article };
};

const verifyStaticPublication = ({ html, label, canonical, kind }) => {
  verifyMetadata({ html, label, canonical, publication: true });
  for (const marker of ["data-editorial-helpfulness", "/assets/editorial-analytics.mjs?v=", `data-publication-kind=\"${kind}\"`]) {
    assert(html.includes(marker), `${label}: missing publication marker ${marker}`);
  }
  if (kind === "article") {
    for (const marker of ['id="self-check"', 'id="message-guide"', 'id="faq"', "faq-item"]) {
      assert(html.includes(marker), `${label}: missing article marker ${marker}`);
    }
  }
};

const verifyPublishedFiles = async () => {
  const info = await fetchJson("build-info.json");
  assert(info.sha === expectedSha, `published SHA ${info.sha || "missing"}, expected ${expectedSha}`);
  assert(String(info.version || "").trim(), "build-info.json has no version");

  const html = await fetchText("");
  verifyMetadata({ html, label: "home", canonical: expectedCanonical("/") });
  const requiredMarkers = [
    `<meta name="site-build-sha" content="${expectedSha}">`,
    "trust-strip__grid",
    "section--value-editorial",
    "section--cta-portrait",
    "messenger-choices--dialog",
    "data-mobile-contact-now",
    "mobile-contact--single",
    "section--case-studies",
    'id="case-autoclub"',
    'id="case-police-review"',
    'id="case-land"',
    "Кейсы обезличены",
    'href="/razbory/"',
    'href="/praktika/"',
    'rel="alternate" type="application/rss+xml"',
  ];
  for (const marker of requiredMarkers) assert(html.includes(marker), `home page is missing marker: ${marker}`);
  const forbiddenMarkers = [
    "<form",
    "<input",
    "<select",
    "<textarea",
    "data-callback",
    "callback-dialog",
    "data-price-quiz",
    "price-quiz-dialog",
    "section--document-samples",
    "section--featured-case",
    "section--visual-cases",
    "data-video-launch",
    "data-video-dialog",
    "data-proof-dialog",
    "Видео готовится",
    "Демо-макет",
    "Демо-визуал",
    "-demo.svg",
    "Топникова",
    "Алиакбарова",
    "Шибаева",
    "КУСП №",
    "УИД",
    "дело выиграно",
    "деньги возвращены полностью",
  ];
  for (const marker of forbiddenMarkers) {
    assert(!html.includes(marker), `home page exposes forbidden or unconfirmed material: ${marker}`);
  }

  const editorialManifest = await fetchJson("editorial-publications.json");
  assert(editorialManifest.schemaVersion === 1, "editorial-publications.json has unsupported schemaVersion");
  assert(editorialManifest.counts?.articles >= 1 && editorialManifest.counts?.practiceCases >= 1, "editorial-publications.json has no published editorial content");
  assert(editorialManifest.articles.length === editorialManifest.counts.articles, "editorial article count does not match manifest");
  assert(editorialManifest.practiceCases.length === editorialManifest.counts.practiceCases, "editorial case count does not match manifest");

  const articleIndexHtml = await fetchText("razbory/");
  const caseIndexHtml = await fetchText("praktika/");
  verifyMetadata({ html: articleIndexHtml, label: "article index", canonical: expectedCanonical("/razbory/") });
  verifyMetadata({ html: caseIndexHtml, label: "practice index", canonical: expectedCanonical("/praktika/") });
  for (const item of editorialManifest.articles) {
    assert(item.status === "published", `article ${item.id || item.url} is not published`);
    assert(new URL(item.url).origin === canonicalBase.origin, `article URL has unexpected origin: ${item.url}`);
    assert(articleIndexHtml.includes(`href="${new URL(item.url).pathname}"`), `article index is missing ${item.url}`);
  }
  for (const item of editorialManifest.practiceCases) {
    assert(item.status === "published", `case ${item.id || item.url} is not published`);
    assert(new URL(item.url).origin === canonicalBase.origin, `case URL has unexpected origin: ${item.url}`);
    assert(caseIndexHtml.includes(`href="${new URL(item.url).pathname}"`), `practice index is missing ${item.url}`);
  }

  const articleItem = editorialManifest.articles[0];
  const caseItem = editorialManifest.practiceCases[0];
  const articlePath = pathnameFromUrl(articleItem.url);
  const casePath = pathnameFromUrl(caseItem.url);
  const articleHtml = await fetchText(articlePath);
  const caseHtml = await fetchText(casePath);
  verifyStaticPublication({ html: articleHtml, label: "article", canonical: articleItem.url, kind: "article" });
  verifyStaticPublication({ html: caseHtml, label: "case", canonical: caseItem.url, kind: "case" });

  const feed = await fetchText("feed.xml");
  for (const marker of ["<rss version=\"2.0\"", "<atom:link ", "<dc:creator>"]) {
    assert(feed.includes(marker), `feed.xml is missing marker: ${marker}`);
  }
  for (const item of editorialManifest.articles) assert(feed.includes(item.url), `feed.xml is missing article ${item.url}`);

  const sitemapFiles = ["sitemap.xml", "sitemap-pages.xml", "sitemap-services.xml", "sitemap-articles.xml", "sitemap-cases.xml", "sitemap-images.xml"];
  const robots = await fetchText("robots.txt");
  const sitemaps = new Map();
  for (const file of sitemapFiles) {
    assert(robots.includes(`Sitemap: ${canonicalBase.origin}/${file}`), `robots.txt is missing ${file}`);
    const sitemap = await fetchText(file);
    assert(sitemap.includes("<?xml version=\"1.0\""), `${file} is not XML`);
    sitemaps.set(file, sitemap);
  }
  for (const file of sitemapFiles.slice(1)) {
    assert(sitemaps.get("sitemap.xml").includes(`${canonicalBase.origin}/${file}`), `sitemap.xml is missing ${file}`);
  }
  for (const item of editorialManifest.articles) assert(sitemaps.get("sitemap-articles.xml").includes(item.url), `sitemap-articles.xml is missing ${item.url}`);
  for (const item of editorialManifest.practiceCases) assert(sitemaps.get("sitemap-cases.xml").includes(item.url), `sitemap-cases.xml is missing ${item.url}`);
  assert(sitemaps.get("sitemap-images.xml").includes("<image:image>"), "sitemap-images.xml has no image entries");

  const app = await fetchText("assets/app.js");
  for (const marker of ["new FormData", "reportValidity", "data-callback", "data-price-quiz", "priceQuiz", "callbackForm"]) {
    assert(!app.includes(marker), `published app contains removed data-entry logic: ${marker}`);
  }
  const editorialAnalytics = await fetchText("assets/editorial-analytics.mjs");
  for (const marker of ["publication_scroll_${threshold}", "publication_active_${threshold}s", "publication_section_view", "publication_helpfulness", "analytics_consent"]) {
    assert(editorialAnalytics.includes(marker), `editorial analytics is missing marker: ${marker}`);
  }

  const videoConfig = await fetchJson("video-config.json");
  assert(typeof videoConfig.enabled === "boolean", "video-config.json has no enabled boolean");

  return { info, editorialManifest, articlePath, casePath };
};

const inspectPageLayout = async (page, label) => {
  const state = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    formControls: document.querySelectorAll("form, input, select, textarea").length,
    buildSha: document.querySelector('meta[name="site-build-sha"]')?.content || "",
  }));
  const overflow = Math.max(state.rootScrollWidth, state.bodyScrollWidth) - state.innerWidth;
  assert(overflow <= 1.5, `${label}: horizontal overflow ${overflow}px (${state.rootScrollWidth}/${state.bodyScrollWidth} vs ${state.innerWidth})`);
  assert(state.formControls === 0, `${label}: ${state.formControls} data-entry controls are visible in DOM`);
  assert(state.buildSha === expectedSha, `${label}: browser received build ${state.buildSha || "missing"}, expected ${expectedSha}`);
};

const verifyBrowserPages = async ({ editorialManifest, articlePath, casePath }) => {
  const engines = [
    { name: "Chromium", launcher: chromium },
    { name: "WebKit", launcher: webkit },
  ];
  const routes = [
    { label: "article index", path: "razbory/", width: 320, cards: editorialManifest.counts.articles },
    { label: "practice index", path: "praktika/", width: 390, cards: editorialManifest.counts.practiceCases },
    { label: "article", path: articlePath, width: 320, publication: "article" },
    { label: "case", path: casePath, width: 390, publication: "case" },
  ];

  for (const engine of engines) {
    const browser = await engine.launcher.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
      await context.addInitScript(() => {
        localStorage.setItem("analytics_consent", "denied");
        sessionStorage.setItem("site_engagement_nudge_shown", "true");
      });
      const page = await context.newPage();
      const pageErrors = [];
      const failedRequests = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("requestfailed", (request) => {
        try {
          if (new URL(request.url()).origin === location.origin) failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`);
        } catch { /* ignore malformed third-party URLs */ }
      });

      for (const route of routes) {
        await page.setViewportSize({ width: route.width, height: 844 });
        const response = await page.goto(noCacheUrl(route.path).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
        assert(response?.ok(), `${engine.name} ${route.label}: navigation returned ${response?.status() || "no response"}`);
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
        await page.evaluate(() => document.fonts?.ready);
        await page.waitForTimeout(100);
        await inspectPageLayout(page, `${engine.name} ${route.label} ${route.width}px`);

        if (route.cards) {
          const cardCount = await page.locator(".editorial-grid .editorial-card").count();
          assert(cardCount === route.cards, `${engine.name} ${route.label}: ${cardCount} cards, expected ${route.cards}`);
          assert(await page.locator(".editorial-grid .card-link").first().isVisible(), `${engine.name} ${route.label}: card link is not visible`);
        }

        if (route.publication) {
          const order = await page.locator("[data-helpfulness-value]").evaluateAll((buttons) => buttons.map((button) => button.dataset.helpfulnessValue));
          assert(JSON.stringify(order) === JSON.stringify(["yes", "no", "partly"]), `${engine.name} ${route.label}: helpfulness order is ${order.join(", ")}`);
          assert(await page.locator("[data-editorial-helpfulness]").isVisible(), `${engine.name} ${route.label}: helpfulness block is not visible`);
        }

        if (route.publication === "article") {
          const faqItems = page.locator(".faq-item");
          assert(await faqItems.count() > 0, `${engine.name} article: FAQ items are missing`);
          const firstFaq = faqItems.first();
          assert(await firstFaq.evaluate((element) => element.open), `${engine.name} article: first FAQ item must initially be open`);
          await firstFaq.locator("summary").click();
          assert(!await firstFaq.evaluate((element) => element.open), `${engine.name} article: FAQ item did not close`);
          await firstFaq.locator("summary").click();
          assert(await firstFaq.evaluate((element) => element.open), `${engine.name} article: FAQ item did not reopen`);

          await page.locator('[data-helpfulness-value="no"]').click();
          await page.waitForFunction(() => {
            const buttons = [...document.querySelectorAll("[data-helpfulness-value]")];
            const status = document.querySelector("[data-helpfulness-status]")?.textContent?.trim() || "";
            return buttons.length === 3
              && buttons.every((button) => button.disabled)
              && buttons.find((button) => button.dataset.helpfulnessValue === "no")?.getAttribute("aria-pressed") === "true"
              && status.length > 0;
          }, { timeout: 3_000 });
          const status = (await page.locator("[data-helpfulness-status]").textContent())?.trim() || "";
          assert(status.includes("Аналитика отключена"), `${engine.name} article: truthful denied-analytics status is missing (${status})`);
        }
      }

      assert(pageErrors.length === 0, `${engine.name}: page errors: ${pageErrors.join(" | ")}`);
      assert(failedRequests.length === 0, `${engine.name}: same-origin requests failed: ${failedRequests.join(" | ")}`);
      await context.close();
    } finally {
      await browser.close();
    }
  }
};

let snapshot = null;
let lastError = "published build has not become available";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    snapshot = await verifyPublishedFiles();
    break;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.log(`Live smoke attempt ${attempt}/${attempts}: ${lastError}`);
    if (attempt < attempts) await sleep(delayMs);
  }
}
if (!snapshot) throw new Error(`GitHub Pages deployment verification failed: ${lastError}`);

let browserError = null;
for (let attempt = 1; attempt <= 2; attempt += 1) {
  try {
    await verifyBrowserPages(snapshot);
    browserError = null;
    break;
  } catch (error) {
    browserError = error instanceof Error ? error : new Error(String(error));
    console.log(`Live browser smoke attempt ${attempt}/2: ${browserError.message}`);
    if (attempt < 2) await sleep(1_500);
  }
}
if (browserError) throw browserError;

console.log(`Published GitHub Pages build verified: ${expectedSha.slice(0, 12)} · synchronized SEO metadata · RSS and sitemaps · FAQ and helpfulness · narrow Chromium/WebKit · ${base}`);
