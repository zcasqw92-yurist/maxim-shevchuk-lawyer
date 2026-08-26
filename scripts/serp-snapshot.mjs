import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "config", "refund-services-serp.json"), "utf8"));
const outputDir = join(root, "reports", "serp-snapshots", "refund-services");
const screenshotDir = join(outputDir, "screenshots");
const outputPath = join(outputDir, "latest.json");
const yandexApiKey = String(process.env.YANDEX_SEARCH_API_KEY || "").trim();
const sponsoredLabels = ["Реклама", "Промо", "Спонсировано", "Sponsored", "Ad", "Ads"];

const clean = (value) => String(value ?? "")
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/\s+/g, " ")
  .trim();

const uniqueByUrl = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.url || "").replace(/\/$/, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const decodeRawData = (rawData) => {
  const value = String(rawData || "");
  if (value.trimStart().startsWith("<")) return value;
  return Buffer.from(value, "base64").toString("utf8");
};

const xmlTag = (source, tag) => {
  const match = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return clean(match?.[1] || "");
};

const yandexSearch = async (queryText) => {
  if (!yandexApiKey) throw new Error("YANDEX_SEARCH_API_KEY is missing");
  console.log(`::add-mask::${yandexApiKey}`);

  const response = await fetch("https://searchapi.api.cloud.yandex.net/v2/web/search", {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${yandexApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: {
        searchType: "SEARCH_TYPE_RU",
        queryText,
        familyMode: "FAMILY_MODE_MODERATE",
        page: "0",
        fixTypoMode: "FIX_TYPO_MODE_ON",
      },
      sortSpec: {
        sortMode: "SORT_MODE_BY_RELEVANCE",
        sortOrder: "SORT_ORDER_DESC",
      },
      groupSpec: {
        groupMode: "GROUP_MODE_FLAT",
        groupsOnPage: "20",
        docsInGroup: "1",
      },
      maxPassages: "3",
      region: String(config.checkedRegion.yandexRegionId),
      l10n: "LOCALIZATION_RU",
      responseFormat: "FORMAT_XML",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36",
    }),
    signal: AbortSignal.timeout(60000),
  });

  const responseText = await response.text();
  let payload = {};
  try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = {}; }
  if (!response.ok) {
    const message = clean(payload?.message || payload?.error?.message || response.statusText);
    throw new Error(`Yandex Search API ${response.status}: ${message.slice(0, 300)}`);
  }
  if (!payload.rawData) throw new Error("Yandex Search API response has no rawData");

  const xml = decodeRawData(payload.rawData);
  const error = xmlTag(xml, "error");
  if (error) throw new Error(`Yandex Search XML error: ${error}`);

  const docs = [...xml.matchAll(/<doc(?:\s[^>]*)?>([\s\S]*?)<\/doc>/gi)].map((match) => match[1]);
  const organicResults = uniqueByUrl(docs.map((doc) => {
    const url = xmlTag(doc, "url");
    return {
      title: xmlTag(doc, "title"),
      url,
      domain: xmlTag(doc, "domain") || (() => {
        try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
      })(),
      snippet: clean(xmlTag(doc, "passages") || xmlTag(doc, "headline")).slice(0, 500),
      sponsoredLabel: "",
    };
  }).filter((item) => /^https?:\/\//i.test(item.url)));

  return {
    status: "ok",
    organicResults,
    sponsoredResults: [],
    diagnostics: {
      documentCount: docs.length,
      note: "Yandex Search API organic documents; paid placements are not returned in the XML document list.",
    },
  };
};

const detectSponsoredLabel = (text) => sponsoredLabels.find((label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$|[·:])`, "i").test(text);
}) || "";

const googleAttempts = (queryText) => {
  const base = new URLSearchParams({ q: queryText, num: "10", hl: "ru", gl: "ru", pws: "0", filter: "0" });
  return [
    `https://www.google.com/search?${base}`,
    `https://www.google.com/search?${base}&udm=14`,
    `https://www.google.com/search?${base}&gbv=1`,
  ];
};

const extractGooglePage = async (page) => page.evaluate((labels) => {
  const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const labelFor = (text) => labels.find((label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(\\s|$|[·:])`, "i").test(text);
  }) || "";
  const unwrap = (href) => {
    try {
      const url = new URL(href, location.origin);
      if (url.pathname === "/url") return url.searchParams.get("q") || url.searchParams.get("url") || "";
      return url.href;
    } catch { return ""; }
  };
  const internal = (urlValue) => {
    try {
      const url = new URL(urlValue);
      return url.hostname.endsWith("google.com") && /^(\/search|\/preferences|\/setprefs|\/accounts|\/sorry)/.test(url.pathname);
    } catch { return true; }
  };

  const organic = [];
  const sponsored = [];
  const seen = new Set();
  const headings = Array.from(document.querySelectorAll("#search h3, #rso h3, #tads h3, [data-text-ad] [role='heading']"));

  for (const heading of headings) {
    const anchor = heading.closest("a[href]") || heading.parentElement?.closest("a[href]");
    if (!anchor) continue;
    const url = unwrap(anchor.getAttribute("href") || "");
    if (!url || internal(url) || seen.has(url)) continue;
    seen.add(url);
    const container = heading.closest("div.MjjYud,div.g,#tads > div,[data-text-ad]") || anchor.parentElement;
    const text = norm(container?.innerText || container?.textContent || "");
    const label = labelFor(text);
    const isSponsored = Boolean(label) || Boolean(container?.closest?.("#tads,[data-text-ad]"));
    const item = {
      title: norm(heading.innerText || heading.textContent),
      url,
      domain: (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
      snippet: text.slice(0, 500),
      sponsoredLabel: label || (isSponsored ? "ad-container" : ""),
    };
    (isSponsored ? sponsored : organic).push(item);
  }

  return {
    organic,
    sponsored,
    diagnostics: {
      headingCount: headings.length,
      adContainerCount: document.querySelectorAll("#tads,[data-text-ad]").length,
    },
  };
}, sponsoredLabels);

const googleSearch = async (browser, queryItem) => {
  const attempts = [];
  for (const [index, url] of googleAttempts(queryItem.query).entries()) {
    const context = await browser.newContext({
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
      geolocation: { latitude: 55.7558, longitude: 37.6173 },
      permissions: ["geolocation"],
      userAgent: index === 2
        ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/149 Mobile Safari/537.36"
        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36",
      extraHTTPHeaders: { "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7" },
    });
    const page = await context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      const bodyText = clean(await page.locator("body").innerText().catch(() => ""));
      const blocked = /unusual traffic|необычный трафик|not a robot|не робот|captcha|наши системы обнаружили/i.test(`${page.url()} ${bodyText}`);
      const extracted = blocked ? { organic: [], sponsored: [], diagnostics: {} } : await extractGooglePage(page);
      attempts.push({
        attempt: index + 1,
        url,
        finalUrl: page.url(),
        httpStatus: response?.status() || null,
        blocked,
        organicCount: extracted.organic.length,
        sponsoredCount: extracted.sponsored.length,
      });
      if (!blocked && extracted.organic.length >= config.minimumOrganicResultsPerEngine) {
        await page.screenshot({ path: join(screenshotDir, `${queryItem.id}-google.png`), fullPage: true }).catch(() => {});
        return {
          status: "ok",
          finalUrl: page.url(),
          httpStatus: response?.status() || null,
          organicResults: uniqueByUrl(extracted.organic),
          sponsoredResults: uniqueByUrl(extracted.sponsored),
          diagnostics: { ...extracted.diagnostics, attempts },
        };
      }
    } catch (error) {
      attempts.push({ attempt: index + 1, url, error: clean(error?.message || error) });
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }
  return {
    status: attempts.some((item) => item.blocked) ? "blocked" : "error",
    organicResults: [],
    sponsoredResults: [],
    diagnostics: {
      reason: attempts.some((item) => item.blocked)
        ? "Google returned a robot or unusual-traffic challenge for all public result modes"
        : "Google did not return five classifiable organic results",
      attempts,
    },
  };
};

await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {
  schemaVersion: 1,
  clusterId: config.clusterId,
  clusterTitle: config.clusterTitle,
  generatedAt: new Date().toISOString(),
  region: config.checkedRegion,
  minimumOrganicResultsPerEngine: config.minimumOrganicResultsPerEngine,
  excludeSponsoredResultsFromMinimum: config.excludeSponsoredResultsFromMinimum,
  sources: {
    yandex: "Yandex Search API v2 WebSearch.Search, FORMAT_XML",
    google: "Google public search result pages opened in headless Chromium",
  },
  rawResponsesSaved: false,
  queries: [],
};

try {
  for (const queryItem of config.queries) {
    const item = { ...queryItem, yandex: null, google: null };
    try {
      const yandex = await yandexSearch(queryItem.query);
      item.yandex = {
        ...yandex,
        organicResultsReviewed: yandex.organicResults.length,
        sponsoredResultsObserved: yandex.sponsoredResults.length,
        minimumMet: yandex.organicResults.length >= config.minimumOrganicResultsPerEngine,
        organicResults: yandex.organicResults.slice(0, 10),
        sponsoredResults: yandex.sponsoredResults.slice(0, 10),
        sponsoredResultLabels: [...new Set(yandex.sponsoredResults.map((entry) => entry.sponsoredLabel).filter(Boolean))],
      };
    } catch (error) {
      item.yandex = {
        status: "error",
        organicResultsReviewed: 0,
        sponsoredResultsObserved: 0,
        minimumMet: false,
        organicResults: [],
        sponsoredResults: [],
        sponsoredResultLabels: [],
        diagnostics: { reason: clean(error?.message || error) },
      };
    }

    const google = await googleSearch(browser, queryItem);
    item.google = {
      ...google,
      organicResultsReviewed: google.organicResults.length,
      sponsoredResultsObserved: google.sponsoredResults.length,
      minimumMet: google.organicResults.length >= config.minimumOrganicResultsPerEngine,
      organicResults: google.organicResults.slice(0, 10),
      sponsoredResults: google.sponsoredResults.slice(0, 10),
      sponsoredResultLabels: [...new Set(google.sponsoredResults.map((entry) => entry.sponsoredLabel).filter(Boolean))],
    };

    report.queries.push(item);
    console.log(`SERP ${queryItem.id}`);
    console.log(`  Yandex: organic=${item.yandex.organicResultsReviewed}, sponsored=${item.yandex.sponsoredResultsObserved}, status=${item.yandex.status}`);
    item.yandex.organicResults.slice(0, 5).forEach((entry, index) => console.log(`    Y${index + 1}: ${entry.domain} — ${entry.title}`));
    console.log(`  Google: organic=${item.google.organicResultsReviewed}, sponsored=${item.google.sponsoredResultsObserved}, status=${item.google.status}`);
    item.google.organicResults.slice(0, 5).forEach((entry, index) => console.log(`    G${index + 1}: ${entry.domain} — ${entry.title}`));
  }
} finally {
  await browser.close();
}

report.gatePassed = report.queries.every((item) => item.yandex.minimumMet && item.google.minimumMet);
await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`SERP snapshot saved to ${outputPath}`);
console.log(`SERP gate passed: ${report.gatePassed}`);
if (!report.gatePassed) process.exitCode = 1;
