import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const publicUrl = String(process.env.SITE_PUBLIC_URL || "").trim();
const canonicalUrl = String(process.env.SITE_CANONICAL_URL || publicUrl).trim();
const expectedSha = String(process.env.EXPECTED_BUILD_SHA || "").trim();

if (!publicUrl) throw new Error("SITE_PUBLIC_URL is required");
if (!canonicalUrl) throw new Error("SITE_CANONICAL_URL or SITE_PUBLIC_URL is required");
if (!/^[A-Fa-f0-9]{40}$/.test(expectedSha)) throw new Error("EXPECTED_BUILD_SHA must be a full Git commit SHA");

const base = new URL(publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`);
const canonicalBase = new URL(canonicalUrl.endsWith("/") ? canonicalUrl : `${canonicalUrl}/`);
const reportPath = "reports/live-publication-smoke.json";
const report = {
  checkedAt: new Date().toISOString(),
  publicUrl: base.toString(),
  expectedSha,
  transientOverflows: [],
  failures: [],
};
const thematicIntakeArticlePaths = new Set([
  "/razbory/zakazchik-trebuet-vernut-dengi-za-remont/",
]);
const usesThematicIntake = (item) => thematicIntakeArticlePaths.has(new URL(item.url).pathname);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const noCacheUrl = (pathname) => {
  const url = new URL(pathname, base);
  url.searchParams.set("all_publications_check", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
const writeReport = async () => {
  await mkdir("reports", { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
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
const publicationPath = (url) => new URL(url).pathname.replace(/^\//, "");
const waitForStableLayout = async (page) => {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
};
const inspectLayout = () => {
  const viewportWidth = innerWidth;
  const rootWidth = document.documentElement.scrollWidth;
  const bodyWidth = document.body.scrollWidth;
  const selectorFor = (element) => {
    if (element.id) return `${element.tagName.toLowerCase()}#${element.id}`;
    const classes = [...element.classList].slice(0, 4).join(".");
    return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`;
  };
  const offenders = [...document.body.querySelectorAll("*")]
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const rightOverflow = rect.right - viewportWidth;
      const leftOverflow = -rect.left;
      const internalOverflow = element.scrollWidth - element.clientWidth;
      return {
        selector: selectorFor(element),
        text: String(element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 140),
        left: Number(rect.left.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        rightOverflow: Number(rightOverflow.toFixed(2)),
        leftOverflow: Number(leftOverflow.toFixed(2)),
        internalOverflow,
        display: style.display,
        position: style.position,
        overflowX: style.overflowX,
        whiteSpace: style.whiteSpace,
        wordBreak: style.wordBreak,
        overflowWrap: style.overflowWrap,
        transform: style.transform,
      };
    })
    .filter((item) => item.rightOverflow > 1 || item.leftOverflow > 1 || (item.internalOverflow > 1 && item.overflowX === "visible"))
    .sort((a, b) => Math.max(b.rightOverflow, b.leftOverflow, b.internalOverflow) - Math.max(a.rightOverflow, a.leftOverflow, a.internalOverflow))
    .slice(0, 20);
  const stylesheets = [...document.querySelectorAll('link[rel~="stylesheet"]')].map((link) => ({
    href: link.href,
    media: link.media,
    disabled: link.disabled,
  }));
  return {
    innerWidth: viewportWidth,
    rootWidth,
    bodyWidth,
    overflow: Math.max(rootWidth, bodyWidth) - viewportWidth,
    controls: document.querySelectorAll("form, input, select, textarea").length,
    sha: document.querySelector('meta[name="site-build-sha"]')?.content || "",
    version: document.querySelector('meta[name="site-build-version"]')?.content || "",
    h1: document.querySelectorAll("h1").length,
    stylesheets,
    offenders,
  };
};
const verifyStableOverflow = async ({ page, label, path }) => {
  const attempts = [];
  let state = await page.evaluate(inspectLayout);
  attempts.push({ phase: "initial", ...state });
  if (state.overflow <= 1.5) return state;

  await page.waitForTimeout(800);
  await waitForStableLayout(page);
  state = await page.evaluate(inspectLayout);
  attempts.push({ phase: "settled", ...state });
  if (state.overflow <= 1.5) {
    report.transientOverflows.push({ label, path, attempts });
    console.warn(`${label}: transient horizontal overflow resolved after layout stabilization`);
    return state;
  }

  const response = await page.goto(noCacheUrl(path).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
  assert(response?.ok(), `${label}: diagnostic reload returned ${response?.status() || "no response"}`);
  await waitForStableLayout(page);
  state = await page.evaluate(inspectLayout);
  attempts.push({ phase: "reload", ...state });
  if (state.overflow <= 1.5) {
    report.transientOverflows.push({ label, path, attempts });
    console.warn(`${label}: transient horizontal overflow resolved after no-cache reload`);
    return state;
  }

  const failure = { label, path, attempts };
  report.failures.push(failure);
  await writeReport();
  throw new Error(`${label}: persistent horizontal overflow ${state.overflow}px\n${JSON.stringify(state.offenders, null, 2)}`);
};

const buildInfo = await fetchJson("build-info.json");
assert(buildInfo.sha === expectedSha, `published SHA ${buildInfo.sha || "missing"}, expected ${expectedSha}`);

const manifest = await fetchJson("editorial-publications.json");
assert(manifest.schemaVersion === 1, "editorial-publications.json has unsupported schemaVersion");
assert(Array.isArray(manifest.articles) && Array.isArray(manifest.practiceCases), "editorial publication arrays are missing");
assert(manifest.articles.length === manifest.counts?.articles, "article count does not match manifest");
assert(manifest.practiceCases.length === manifest.counts?.practiceCases, "practice case count does not match manifest");

const publications = [
  ...manifest.articles.map((item) => ({ ...item, kind: "article" })),
  ...manifest.practiceCases.map((item) => ({ ...item, kind: "case" })),
];
assert(publications.length > 0, "editorial manifest has no publications");

for (const item of publications) {
  const label = `${item.kind} ${item.url}`;
  assert(item.status === "published", `${label}: status is not published`);
  assert(new URL(item.url).origin === canonicalBase.origin, `${label}: URL origin is not canonical`);

  const html = await fetchText(publicationPath(item.url));
  assert(meta(html, "name", "site-build-sha") === expectedSha, `${label}: build SHA meta is incorrect`);
  assert(canonical(html) === item.url, `${label}: canonical is incorrect`);
  assert(h1Count(html) === 1, `${label}: exactly one H1 is required`);
  assert(meta(html, "property", "og:type") === "article", `${label}: og:type must be article`);
  assert(html.includes('data-editorial-helpfulness'), `${label}: helpfulness block is missing`);
  assert(html.includes('/assets/editorial-analytics.mjs?v='), `${label}: editorial analytics module is missing`);
  assert(html.includes(`data-publication-kind="${item.kind}"`), `${label}: publication kind marker is missing`);
  assert(!/<(?:form|input|select|textarea)\b/i.test(html), `${label}: data-entry element appeared`);

  const helpfulnessOrder = [...html.matchAll(/data-helpfulness-value=["'](yes|no|partly)["']/g)].map((match) => match[1]);
  assert(JSON.stringify(helpfulnessOrder) === JSON.stringify(["yes", "no", "partly"]), `${label}: helpfulness order is incorrect`);

  const jsonLdBlocks = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  assert(jsonLdBlocks.length > 0, `${label}: JSON-LD is missing`);
  const graph = [];
  for (const block of jsonLdBlocks) {
    const parsed = JSON.parse(block[1]);
    graph.push(...(Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed]));
  }
  assert(graph.some((node) => {
    const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
    return types.includes("Article");
  }), `${label}: Article JSON-LD is missing`);

  if (item.kind === "article") {
    for (const marker of ['id="self-check"', 'id="faq"', "faq-item"]) {
      assert(html.includes(marker), `${label}: missing ${marker}`);
    }

    if (usesThematicIntake(item)) {
      for (const marker of ["Что передать на проверку", "В работу входит", "Передать претензию на проверку"]) {
        assert(html.includes(marker), `${label}: thematic intake is missing ${marker}`);
      }
      for (const forbidden of ['id="message-guide"', "Проверить свою ситуацию", "Что написать юристу"]) {
        assert(!html.includes(forbidden), `${label}: removed generic block returned: ${forbidden}`);
      }
    } else {
      assert(html.includes('id="message-guide"'), `${label}: missing id="message-guide"`);
    }
  }
}

for (const { name, launcher } of [{ name: "Chromium", launcher: chromium }, { name: "WebKit", launcher: webkit }]) {
  const browser = await launcher.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    await context.addInitScript(() => {
      localStorage.setItem("analytics_consent", "denied");
      sessionStorage.setItem("site_engagement_nudge_shown", "true");
    });

    for (const item of publications) {
      const width = item.kind === "article" ? 320 : 390;
      const path = publicationPath(item.url);
      const label = `${name} ${item.kind} ${new URL(item.url).pathname}`;
      const page = await context.newPage();
      try {
        await page.setViewportSize({ width, height: 844 });
        const response = await page.goto(noCacheUrl(path).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
        assert(response?.ok(), `${label}: navigation returned ${response?.status() || "no response"}`);
        await waitForStableLayout(page);

        const state = await verifyStableOverflow({ page, label, path });
        assert(state.controls === 0, `${label}: ${state.controls} data-entry controls in DOM`);
        assert(state.sha === expectedSha, `${label}: browser received build ${state.sha || "missing"}`);
        assert(state.h1 === 1, `${label}: incorrect H1 count`);
        assert(await page.locator("[data-editorial-helpfulness]").isVisible(), `${label}: helpfulness is not visible`);

        const order = await page.locator("[data-helpfulness-value]").evaluateAll((buttons) => buttons.map((button) => button.dataset.helpfulnessValue));
        assert(JSON.stringify(order) === JSON.stringify(["yes", "no", "partly"]), `${label}: incorrect helpfulness order`);

        if (item.kind === "article") {
          assert(await page.locator(".faq-item").count() > 0, `${label}: FAQ is missing`);
          assert(await page.locator("#self-check").isVisible(), `${label}: self-check is not visible`);

          if (usesThematicIntake(item)) {
            assert(await page.locator("#message-guide").count() === 0, `${label}: generic message guide returned`);
            assert(await page.getByText("Что передать на проверку", { exact: true }).isVisible(), `${label}: thematic intake title is not visible`);
            assert(await page.getByText("В работу входит", { exact: true }).isVisible(), `${label}: paid-work heading is not visible`);
            assert(await page.getByRole("button", { name: "Передать претензию на проверку", exact: true }).isVisible(), `${label}: thematic intake button is not visible`);
            assert(await page.getByText("Проверить свою ситуацию", { exact: true }).count() === 0, `${label}: generic intake CTA returned`);
            assert(await page.getByText("Что написать юристу", { exact: true }).count() === 0, `${label}: duplicate message guide returned`);
          } else {
            assert(await page.locator("#message-guide").isVisible(), `${label}: message guide is not visible`);
          }
        }
      } finally {
        await page.close();
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

await writeReport();
console.log(`All published editorial routes verified: ${manifest.counts.articles} articles and ${manifest.counts.practiceCases} cases · ${expectedSha.slice(0, 12)} · ${base}`);
