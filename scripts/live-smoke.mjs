const publicUrl = String(process.env.SITE_PUBLIC_URL || "").trim();
const expectedSha = String(process.env.EXPECTED_BUILD_SHA || "").trim();
const attempts = Math.max(1, Number(process.env.LIVE_SMOKE_ATTEMPTS || 18));
const delayMs = Math.max(1000, Number(process.env.LIVE_SMOKE_DELAY_MS || 5000));

if (!publicUrl) throw new Error("SITE_PUBLIC_URL is required");
if (!/^[A-Fa-f0-9]{40}$/.test(expectedSha)) throw new Error("EXPECTED_BUILD_SHA must be a full Git commit SHA");

const base = new URL(publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
  });
  if (!response.ok) throw new Error(`${pathname || "/"} returned ${response.status}`);
  return response.text();
};
const fetchJson = async (pathname) => JSON.parse(await fetchText(pathname));

let lastError = "published build has not become available";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const info = await fetchJson("build-info.json");
    if (info.sha !== expectedSha) throw new Error(`published SHA ${info.sha || "missing"}, expected ${expectedSha}`);

    const html = await fetchText("");
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
    for (const marker of requiredMarkers) {
      if (!html.includes(marker)) throw new Error(`home page is missing marker: ${marker}`);
    }
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
      if (html.includes(marker)) throw new Error(`home page exposes forbidden or unconfirmed material: ${marker}`);
    }

    const editorialManifest = await fetchJson("editorial-publications.json");
    if (editorialManifest.schemaVersion !== 1) throw new Error("editorial-publications.json has unsupported schemaVersion");
    if (editorialManifest.counts?.articles < 1 || editorialManifest.counts?.practiceCases < 1) {
      throw new Error("editorial-publications.json has no published editorial content");
    }
    const articleUrl = new URL(editorialManifest.articles[0].url);
    const caseUrl = new URL(editorialManifest.practiceCases[0].url);
    const articleHtml = await fetchText(articleUrl.pathname.replace(/^\//, ""));
    const caseHtml = await fetchText(caseUrl.pathname.replace(/^\//, ""));
    for (const [name, page, markers] of [
      ["article", articleHtml, ["data-publication-kind=\"article\"", "data-editorial-helpfulness", 'id="self-check"', 'id="message-guide"', "/assets/editorial-analytics.mjs?v="]],
      ["case", caseHtml, ["data-publication-kind=\"case\"", "data-editorial-helpfulness", "/assets/editorial-analytics.mjs?v="]],
    ]) {
      for (const marker of markers) {
        if (!page.includes(marker)) throw new Error(`${name} page is missing marker: ${marker}`);
      }
      if (/<(?:form|input|select|textarea)\b/i.test(page)) throw new Error(`${name} page exposes data-entry controls`);
    }

    const feed = await fetchText("feed.xml");
    for (const marker of ["<rss version=\"2.0\"", "<atom:link ", "<dc:creator>", editorialManifest.articles[0].url]) {
      if (!feed.includes(marker)) throw new Error(`feed.xml is missing marker: ${marker}`);
    }
    const robots = await fetchText("robots.txt");
    for (const file of ["sitemap.xml", "sitemap-pages.xml", "sitemap-services.xml", "sitemap-articles.xml", "sitemap-cases.xml", "sitemap-images.xml"]) {
      if (!robots.includes(`Sitemap: ${base.origin}/${file}`)) throw new Error(`robots.txt is missing ${file}`);
      const sitemap = await fetchText(file);
      if (!sitemap.includes("<?xml version=\"1.0\"")) throw new Error(`${file} is not XML`);
    }

    const app = await fetchText("assets/app.js");
    for (const marker of ["new FormData", "reportValidity", "data-callback", "data-price-quiz", "priceQuiz", "callbackForm"]) {
      if (app.includes(marker)) throw new Error(`published app contains removed data-entry logic: ${marker}`);
    }
    const editorialAnalytics = await fetchText("assets/editorial-analytics.mjs");
    for (const marker of ["publication_scroll_${threshold}", "publication_active_${threshold}s", "publication_section_view", "publication_helpfulness", "analytics_consent"]) {
      if (!editorialAnalytics.includes(marker)) throw new Error(`editorial analytics is missing marker: ${marker}`);
    }

    const videoConfig = await fetchJson("video-config.json");
    if (typeof videoConfig.enabled !== "boolean") throw new Error("video-config.json has no enabled boolean");

    console.log(`Published GitHub Pages build verified: ${expectedSha.slice(0, 12)} · publication pipeline · direct messenger model · ${base}`);
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.log(`Live smoke attempt ${attempt}/${attempts}: ${lastError}`);
    if (attempt < attempts) await sleep(delayMs);
  }
}

throw new Error(`GitHub Pages deployment verification failed: ${lastError}`);
