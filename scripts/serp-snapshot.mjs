import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "config", "refund-services-serp.json");
const outputDir = join(root, "reports", "serp-snapshots", "refund-services");
const outputPath = join(outputDir, "latest.json");
const screenshotDir = join(outputDir, "screenshots");

const config = JSON.parse(await readFile(configPath, "utf8"));
const yandexApiKey = String(process.env.YANDEX_SEARCH_API_KEY || "").trim();
const yandexFolderId = String(process.env.YANDEX_CLOUD_FOLDER_ID || "").trim();
const now = new Date();

const sponsoredLabelPatterns = [
  "Реклама",
  "Промо",
  "Спонсировано",
  "Sponsored",
  "Ad",
  "Ads",
];

const normalizeSpace = (value) => String(value ?? "")
  .replace(/[\r\n\t]+/g, " ")
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
  const text = String(rawData || "");
  if (text.trimStart().startsWith("<")) return text;
  const decoded = Buffer.from(text, "base64").toString("utf8");
  if (!decoded.trimStart().startsWith("<")) {
    throw new Error("Yandex Search API returned unreadable HTML payload");
  }
  return decoded;
};

const yandexSearchHtml = async (queryText) => {
  if (!yandexApiKey) throw new Error("YANDEX_SEARCH_API_KEY is missing");
  console.log(`::add-mask::${yandexApiKey}`);
  if (yandexFolderId) console.log(`::add-mask::${yandexFolderId}`);

  const body = {
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
    responseFormat: "FORMAT_HTML",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/149 Safari/537.36",
  };
  if (yandexFolderId) body.folderId = yandexFolderId;

  const response = await fetch("https://searchapi.api.cloud.yandex.net/v2/web/search", {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${yandexApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    const message = normalizeSpace(payload?.message || payload?.error?.message || response.statusText);
    throw new Error(`Yandex Search API ${response.status}: ${message.slice(0, 300)}`);
  }
  if (!payload.rawData) throw new Error("Yandex Search API response has no rawData");
  return decodeRawData(payload.rawData);
};

const extractYandexResults = async (browser, html) => {
  const page = await browser.newPage({ locale: "ru-RU" });
  try {
    const documentHtml = html.includes("<base ")
      ? html
      : html.replace(/<head([^>]*)>/i, '<head$1><base href="https://yandex.ru/">');
    await page.setContent(documentHtml, { waitUntil: "domcontentloaded", timeout: 30000 });

    const extracted = await page.evaluate((labels) => {
      const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const labelFor = (text) => labels.find((label) => {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|\\s)${escaped}(\\s|$|[·:])`, "i").test(text);
      }) || "";
      const unwrapUrl = (href) => {
        try {
          const url = new URL(href, "https://yandex.ru/");
          const target = url.searchParams.get("url") || url.searchParams.get("target") || url.searchParams.get("rdrnd");
          if (target && /^https?:/i.test(target)) return target;
          return url.href;
        } catch {
          return "";
        }
      };
      const isInternalSearchUrl = (urlValue) => {
        try {
          const url = new URL(urlValue);
          const host = url.hostname.replace(/^www\./, "");
          if (!host.endsWith("yandex.ru")) return false;
          return /^(\/search|\/images|\/video|\/maps|\/turbo|\/clck|\/showcaptcha)/.test(url.pathname);
        } catch {
          return true;
        }
      };
      const titleSelectors = [
        ".OrganicTitle-LinkText",
        ".OrganicTitle-Link",
        ".organic__title-wrapper",
        ".organic__url-text",
        "h2",
        "h3",
        "[role='heading']",
      ];
      const linkSelectors = [
        ".OrganicTitle-Link",
        ".organic__url",
        "h2 a[href]",
        "h3 a[href]",
        "a[href]",
      ];
      const containers = Array.from(document.querySelectorAll([
        "li.serp-item",
        ".serp-item",
        "[data-cid]",
        "[data-fast-name='Organic']",
        "[data-fast-name='Adv']",
        "[data-fast-name='Direct']",
      ].join(",")));
      const organic = [];
      const sponsored = [];
      const diagnostics = { containers: containers.length, headings: document.querySelectorAll("h2,h3").length };

      const addContainer = (container) => {
        const text = norm(container.innerText || container.textContent);
        const classSignal = `${container.className || ""} ${container.getAttribute("data-fast-name") || ""}`;
        const label = labelFor(text);
        const isSponsored = Boolean(label) || /(?:^|\s)(adv|advert|direct|promo)(?:\s|$)/i.test(classSignal);
        const titleNode = titleSelectors.map((selector) => container.querySelector(selector)).find(Boolean);
        const title = norm(titleNode?.innerText || titleNode?.textContent || "");
        const linkNode = titleNode?.closest?.("a[href]") || linkSelectors.map((selector) => container.querySelector(selector)).find(Boolean);
        const url = unwrapUrl(linkNode?.getAttribute("href") || "");
        if (!url || isInternalSearchUrl(url)) return;
        const item = {
          title: title || norm(linkNode?.innerText || linkNode?.textContent || url),
          url,
          domain: (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
          snippet: text.slice(0, 500),
          sponsoredLabel: label || (isSponsored ? "class-signal" : ""),
        };
        if (isSponsored) sponsored.push(item);
        else organic.push(item);
      };

      containers.forEach(addContainer);

      if (organic.length < 5) {
        Array.from(document.querySelectorAll("h2 a[href], h3 a[href], a.OrganicTitle-Link[href]")).forEach((anchor) => {
          const container = anchor.closest("li.serp-item,.serp-item,[data-cid],[data-fast-name]") || anchor.parentElement;
          if (container) addContainer(container);
        });
      }

      return { organic, sponsored, diagnostics };
    }, sponsoredLabelPatterns);

    return {
      organicResults: uniqueByUrl(extracted.organic),
      sponsoredResults: uniqueByUrl(extracted.sponsored),
      diagnostics: extracted.diagnostics,
    };
  } finally {
    await page.close();
  }
};

const extractGoogleResults = async (context, queryItem) => {
  const page = await context.newPage();
  const screenshotPath = join(screenshotDir, `${queryItem.id}-google.png`);
  try {
    const searchUrl = new URL("https://www.google.com/search");
    searchUrl.searchParams.set("q", queryItem.query);
    searchUrl.searchParams.set("num", "10");
    searchUrl.searchParams.set("hl", config.checkedRegion.googleLanguage);
    searchUrl.searchParams.set("gl", config.checkedRegion.googleCountry);
    searchUrl.searchParams.set("pws", "0");
    searchUrl.searchParams.set("filter", "0");

    const response = await page.goto(searchUrl.href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1800);

    if (/consent\.google\./i.test(page.url())) {
      const consentButtons = [
        "button:has-text('Принять все')",
        "button:has-text('Accept all')",
        "button:has-text('Согласен')",
      ];
      for (const selector of consentButtons) {
        const button = page.locator(selector).first();
        if (await button.count()) {
          await button.click({ timeout: 5000 }).catch(() => {});
          await page.waitForLoadState("domcontentloaded").catch(() => {});
          break;
        }
      }
    }

    const bodyText = normalizeSpace(await page.locator("body").innerText().catch(() => ""));
    const blocked = /unusual traffic|необычный трафик|not a robot|не робот|captcha/i.test(`${page.url()} ${bodyText}`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    if (blocked) {
      return {
        status: "blocked",
        httpStatus: response?.status() || null,
        finalUrl: page.url(),
        organicResults: [],
        sponsoredResults: [],
        diagnostics: { reason: "Google returned a robot or unusual-traffic challenge" },
      };
    }

    const extracted = await page.evaluate((labels) => {
      const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const labelFor = (text) => labels.find((label) => {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|\\s)${escaped}(\\s|$|[·:])`, "i").test(text);
      }) || "";
      const unwrapUrl = (href) => {
        try {
          const url = new URL(href, location.origin);
          if (url.pathname === "/url") {
            const target = url.searchParams.get("q") || url.searchParams.get("url");
            if (target) return target;
          }
          return url.href;
        } catch {
          return "";
        }
      };
      const isInternal = (urlValue) => {
        try {
          const url = new URL(urlValue);
          const host = url.hostname.replace(/^www\./, "");
          return host.endsWith("google.com") && /^(\/search|\/preferences|\/setprefs|\/accounts|\/sorry)/.test(url.pathname);
        } catch {
          return true;
        }
      };
      const organic = [];
      const sponsored = [];
      const seenContainers = new Set();
      const addHeading = (heading) => {
        const anchor = heading.closest("a[href]") || heading.parentElement?.closest("a[href]");
        if (!anchor) return;
        const container = heading.closest("div.MjjYud,div.g,[data-text-ad],#tads > div") || anchor.parentElement;
        if (!container || seenContainers.has(container)) return;
        seenContainers.add(container);
        const text = norm(container.innerText || container.textContent);
        const label = labelFor(text);
        const isSponsored = Boolean(label) || Boolean(container.closest("#tads,[data-text-ad]"));
        const url = unwrapUrl(anchor.getAttribute("href") || "");
        if (!url || isInternal(url)) return;
        const item = {
          title: norm(heading.innerText || heading.textContent),
          url,
          domain: (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
          snippet: text.slice(0, 500),
          sponsoredLabel: label || (isSponsored ? "ad-container" : ""),
        };
        if (isSponsored) sponsored.push(item);
        else organic.push(item);
      };

      Array.from(document.querySelectorAll("#search h3, #tads [role='heading'], #tads h3")).forEach(addHeading);

      return {
        organic,
        sponsored,
        diagnostics: {
          h3Count: document.querySelectorAll("#search h3").length,
          adContainers: document.querySelectorAll("#tads,[data-text-ad]").length,
        },
      };
    }, sponsoredLabelPatterns);

    return {
      status: "ok",
      httpStatus: response?.status() || null,
      finalUrl: page.url(),
      organicResults: uniqueByUrl(extracted.organic),
      sponsoredResults: uniqueByUrl(extracted.sponsored),
      diagnostics: extracted.diagnostics,
    };
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    return {
      status: "error",
      organicResults: [],
      sponsoredResults: [],
      diagnostics: { reason: normalizeSpace(error?.message || error) },
    };
  } finally {
    await page.close();
  }
};

await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const googleContext = await browser.newContext({
  locale: "ru-RU",
  timezoneId: "Europe/Moscow",
  geolocation: { latitude: 55.7558, longitude: 37.6173 },
  permissions: ["geolocation"],
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  extraHTTPHeaders: { "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7" },
});
await googleContext.addCookies([{
  name: "CONSENT",
  value: "YES+cb.20210328-17-p0.en+FX+410",
  domain: ".google.com",
  path: "/",
  secure: true,
  sameSite: "None",
}]).catch(() => {});

const report = {
  schemaVersion: 1,
  clusterId: config.clusterId,
  clusterTitle: config.clusterTitle,
  generatedAt: now.toISOString(),
  region: config.checkedRegion,
  minimumOrganicResultsPerEngine: config.minimumOrganicResultsPerEngine,
  excludeSponsoredResultsFromMinimum: config.excludeSponsoredResultsFromMinimum,
  sources: {
    yandex: "Yandex Search API v2 WebSearch.Search, FORMAT_HTML",
    google: "Google public web results opened in headless Chromium",
  },
  rawResponsesSaved: false,
  queries: [],
};

try {
  for (const queryItem of config.queries) {
    const queryReport = {
      ...queryItem,
      yandex: null,
      google: null,
    };

    try {
      const yandexHtml = await yandexSearchHtml(queryItem.query);
      const yandexResults = await extractYandexResults(browser, yandexHtml);
      queryReport.yandex = {
        status: "ok",
        organicResultsReviewed: yandexResults.organicResults.length,
        sponsoredResultsObserved: yandexResults.sponsoredResults.length,
        minimumMet: yandexResults.organicResults.length >= config.minimumOrganicResultsPerEngine,
        organicResults: yandexResults.organicResults.slice(0, 10),
        sponsoredResults: yandexResults.sponsoredResults.slice(0, 10),
        sponsoredResultLabels: [...new Set(yandexResults.sponsoredResults.map((item) => item.sponsoredLabel).filter(Boolean))],
        diagnostics: yandexResults.diagnostics,
      };
    } catch (error) {
      queryReport.yandex = {
        status: "error",
        organicResultsReviewed: 0,
        sponsoredResultsObserved: 0,
        minimumMet: false,
        organicResults: [],
        sponsoredResults: [],
        sponsoredResultLabels: [],
        diagnostics: { reason: normalizeSpace(error?.message || error) },
      };
    }

    const googleResults = await extractGoogleResults(googleContext, queryItem);
    queryReport.google = {
      ...googleResults,
      organicResultsReviewed: googleResults.organicResults.length,
      sponsoredResultsObserved: googleResults.sponsoredResults.length,
      minimumMet: googleResults.organicResults.length >= config.minimumOrganicResultsPerEngine,
      organicResults: googleResults.organicResults.slice(0, 10),
      sponsoredResults: googleResults.sponsoredResults.slice(0, 10),
      sponsoredResultLabels: [...new Set(googleResults.sponsoredResults.map((item) => item.sponsoredLabel).filter(Boolean))],
    };

    report.queries.push(queryReport);
    console.log(`SERP ${queryItem.id}`);
    console.log(`  Yandex: organic=${queryReport.yandex.organicResultsReviewed}, sponsored=${queryReport.yandex.sponsoredResultsObserved}, status=${queryReport.yandex.status}`);
    queryReport.yandex.organicResults.slice(0, 5).forEach((item, index) => console.log(`    Y${index + 1}: ${item.domain} — ${item.title}`));
    console.log(`  Google: organic=${queryReport.google.organicResultsReviewed}, sponsored=${queryReport.google.sponsoredResultsObserved}, status=${queryReport.google.status}`);
    queryReport.google.organicResults.slice(0, 5).forEach((item, index) => console.log(`    G${index + 1}: ${item.domain} — ${item.title}`));
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
} finally {
  await googleContext.close();
  await browser.close();
}

report.gatePassed = report.queries.every((item) => item.yandex.minimumMet && item.google.minimumMet);
await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`SERP snapshot saved to ${outputPath}`);
console.log(`SERP gate passed: ${report.gatePassed}`);

if (!report.gatePassed) process.exitCode = 1;
