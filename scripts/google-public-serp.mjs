import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "config", "refund-services-serp.json"), "utf8"));
const outputDir = join(root, "reports", "serp-snapshots", "refund-services");
const screenshotDir = join(outputDir, "screenshots");
const outputPath = join(outputDir, "google-public.json");
const sponsoredLabels = ["Реклама", "Промо", "Спонсировано", "Sponsored", "Ad", "Ads"];

const clean = (value) => String(value ?? "")
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

const attemptDefinitions = (queryText) => {
  const params = (extra = {}) => new URLSearchParams({
    q: queryText,
    num: "10",
    hl: "ru",
    gl: "ru",
    pws: "0",
    filter: "0",
    ...extra,
  }).toString();
  return [
    { url: `https://www.google.com/search?${params()}`, mobile: false },
    { url: `https://www.google.com/search?${params({ igu: "1" })}`, mobile: false },
    { url: `https://www.google.com/search?${params({ gbv: "1" })}`, mobile: true },
    { url: `https://www.google.co.uk/search?${params({ client: "firefox-b-d" })}`, mobile: false },
    { url: `https://www.google.de/search?${params({ udm: "14" })}`, mobile: false },
    { url: `https://www.google.pl/search?${params({ gbv: "1" })}`, mobile: true },
    { url: `https://www.google.ca/search?${params({ client: "firefox-b-d" })}`, mobile: false },
    { url: `https://www.google.nl/search?${params({ client: "ms-android-google" })}`, mobile: true },
  ];
};

const acceptConsent = async (page) => {
  const candidates = [
    "button:has-text('Принять все')",
    "button:has-text('Accept all')",
    "button:has-text('Согласен')",
    "button:has-text('I agree')",
    "form[action*='consent'] button",
  ];
  for (const selector of candidates) {
    const button = page.locator(selector).first();
    if (await button.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {}),
        button.click({ timeout: 5000 }).catch(() => {}),
      ]);
      return true;
    }
  }
  return false;
};

const extractResults = async (page) => page.evaluate((labels) => {
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
  const isGoogleInternal = (urlValue) => {
    try {
      const url = new URL(urlValue);
      const googleHost = /(^|\.)google\.[a-z.]+$/i.test(url.hostname);
      return googleHost && /^(\/search|\/preferences|\/setprefs|\/accounts|\/sorry|\/policies|\/webhp)/.test(url.pathname);
    } catch { return true; }
  };

  const organic = [];
  const sponsored = [];
  const seen = new Set();
  const headings = Array.from(document.querySelectorAll(
    "#search h3, #rso h3, #tads h3, [data-text-ad] [role='heading'], main h3"
  ));

  for (const heading of headings) {
    const anchor = heading.closest("a[href]") || heading.parentElement?.closest("a[href]");
    if (!anchor) continue;
    const url = unwrap(anchor.getAttribute("href") || "");
    if (!/^https?:\/\//i.test(url) || isGoogleInternal(url) || seen.has(url)) continue;
    seen.add(url);
    const container = heading.closest("div.MjjYud, div.g, #tads > div, [data-text-ad], article") || anchor.parentElement;
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

const collectQuery = async (browser, queryItem) => {
  const attempts = [];
  for (const [index, attempt] of attemptDefinitions(queryItem.query).entries()) {
    const context = await browser.newContext({
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
      geolocation: { latitude: 55.7558, longitude: 37.6173 },
      permissions: ["geolocation"],
      userAgent: attempt.mobile
        ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/149 Mobile Safari/537.36"
        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36",
      extraHTTPHeaders: {
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
        DNT: "1",
      },
    });
    await context.addCookies([{
      name: "CONSENT",
      value: "YES+cb.20250731-00-p0.ru+FX+001",
      domain: new URL(attempt.url).hostname.replace(/^www\./, "."),
      path: "/",
      secure: true,
      sameSite: "Lax",
    }]).catch(() => {});
    const page = await context.newPage();
    try {
      const response = await page.goto(attempt.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(800);
      await acceptConsent(page);
      await page.waitForTimeout(700);
      const bodyText = clean(await page.locator("body").innerText().catch(() => ""));
      const blocked = /unusual traffic|необычный трафик|not a robot|не робот|captcha|наши системы обнаружили|automated queries/i.test(`${page.url()} ${bodyText}`);
      const extracted = blocked ? { organic: [], sponsored: [], diagnostics: {} } : await extractResults(page);
      const organic = uniqueByUrl(extracted.organic);
      const sponsored = uniqueByUrl(extracted.sponsored);
      attempts.push({
        attempt: index + 1,
        requestedUrl: attempt.url,
        finalUrl: page.url(),
        httpStatus: response?.status() || null,
        blocked,
        organicCount: organic.length,
        sponsoredCount: sponsored.length,
      });
      if (!blocked && organic.length >= config.minimumOrganicResultsPerEngine) {
        await page.screenshot({ path: join(screenshotDir, `${queryItem.id}-google-alt.png`), fullPage: true }).catch(() => {});
        return {
          id: queryItem.id,
          query: queryItem.query,
          status: "ok",
          sourceUrl: page.url(),
          organicResultsReviewed: organic.length,
          sponsoredResultsObserved: sponsored.length,
          minimumMet: true,
          organicResults: organic.slice(0, 10),
          sponsoredResults: sponsored.slice(0, 10),
          sponsoredResultLabels: [...new Set(sponsored.map((item) => item.sponsoredLabel).filter(Boolean))],
          diagnostics: { ...extracted.diagnostics, attempts },
        };
      }
    } catch (error) {
      attempts.push({ attempt: index + 1, requestedUrl: attempt.url, error: clean(error?.message || error) });
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }
  return {
    id: queryItem.id,
    query: queryItem.query,
    status: attempts.some((item) => item.blocked) ? "blocked" : "error",
    organicResultsReviewed: 0,
    sponsoredResultsObserved: 0,
    minimumMet: false,
    organicResults: [],
    sponsoredResults: [],
    sponsoredResultLabels: [],
    diagnostics: {
      reason: attempts.some((item) => item.blocked)
        ? "Google returned a robot or unusual-traffic challenge for all alternate Google domains and modes"
        : "Google did not return five classifiable organic results",
      attempts,
    },
  };
};

await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  clusterId: config.clusterId,
  source: "Google public SERP via alternate official Google domains and result modes",
  minimumOrganicResultsPerEngine: config.minimumOrganicResultsPerEngine,
  queries: [],
};

try {
  for (const queryItem of config.queries) {
    const result = await collectQuery(browser, queryItem);
    report.queries.push(result);
    console.log(`Google alternate ${queryItem.id}: organic=${result.organicResultsReviewed}, sponsored=${result.sponsoredResultsObserved}, status=${result.status}`);
    result.organicResults.slice(0, 5).forEach((item, index) => console.log(`  G${index + 1}: ${item.domain} — ${item.title}`));
  }
} finally {
  await browser.close();
}

report.gatePassed = report.queries.every((item) => item.minimumMet);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Google alternate report saved to ${outputPath}`);
console.log(`Google alternate gate passed: ${report.gatePassed}`);
if (!report.gatePassed) process.exitCode = 1;
