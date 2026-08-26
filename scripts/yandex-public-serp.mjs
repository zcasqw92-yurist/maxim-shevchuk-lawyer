import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "config", "refund-services-serp.json"), "utf8"));
const outputDir = join(root, "reports", "serp-snapshots", "refund-services");
const screenshotDir = join(outputDir, "screenshots");
const outputPath = join(outputDir, "yandex-public.json");
const labels = ["Реклама", "Промо", "Спонсировано", "Sponsored", "Ad", "Ads"];

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const uniqueByUrl = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.url || "").replace(/\/$/, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "ru-RU",
  timezoneId: "Europe/Moscow",
  geolocation: { latitude: 55.7558, longitude: 37.6173 },
  permissions: ["geolocation"],
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149 Safari/537.36",
  extraHTTPHeaders: { "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7" },
});

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "Yandex public search page opened in headless Chromium",
  region: config.checkedRegion,
  minimumOrganicResultsPerEngine: config.minimumOrganicResultsPerEngine,
  queries: [],
};

try {
  for (const queryItem of config.queries) {
    const page = await context.newPage();
    try {
      const url = new URL("https://yandex.ru/search/");
      url.searchParams.set("text", queryItem.query);
      url.searchParams.set("lr", String(config.checkedRegion.yandexRegionId));
      url.searchParams.set("numdoc", "20");
      url.searchParams.set("noreask", "1");

      const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1800);
      const bodyText = clean(await page.locator("body").innerText().catch(() => ""));
      const blocked = /captcha|showcaptcha|подтвердите, что запросы отправляли вы|робот|необычный трафик/i.test(`${page.url()} ${bodyText}`);
      await page.screenshot({ path: join(screenshotDir, `${queryItem.id}-yandex.png`), fullPage: true }).catch(() => {});

      if (blocked) {
        report.queries.push({
          id: queryItem.id,
          query: queryItem.query,
          status: "blocked",
          finalUrl: page.url(),
          httpStatus: response?.status() || null,
          organicResultsReviewed: 0,
          sponsoredResultsObserved: 0,
          minimumMet: false,
          organicResults: [],
          sponsoredResults: [],
          diagnostics: { reason: "Yandex returned a robot challenge" },
        });
        continue;
      }

      const extracted = await page.evaluate((sponsoredLabels) => {
        const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const labelFor = (text) => sponsoredLabels.find((label) => {
          const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`(^|\\s)${escaped}(\\s|$|[·:])`, "i").test(text);
        }) || "";
        const unwrap = (href) => {
          try {
            const url = new URL(href, location.origin);
            for (const key of ["url", "target", "rdrnd"]) {
              const target = url.searchParams.get(key);
              if (target && /^https?:/i.test(target)) return target;
            }
            return url.href;
          } catch { return ""; }
        };
        const internal = (urlValue) => {
          try {
            const url = new URL(urlValue);
            const host = url.hostname.replace(/^www\./, "");
            return host.endsWith("yandex.ru") && /^(\/search|\/images|\/video|\/maps|\/turbo|\/clck|\/showcaptcha)/.test(url.pathname);
          } catch { return true; }
        };
        const organic = [];
        const sponsored = [];
        const seen = new Set();
        const containers = Array.from(document.querySelectorAll([
          "li.serp-item",
          ".serp-item",
          "[data-cid]",
          "[data-fast-name='Organic']",
          "[data-fast-name='Adv']",
          "[data-fast-name='Direct']",
        ].join(",")));

        for (const container of containers) {
          const text = norm(container.innerText || container.textContent);
          const classSignal = `${container.className || ""} ${container.getAttribute("data-fast-name") || ""}`;
          const label = labelFor(text);
          const isSponsored = Boolean(label) || /(?:^|\s)(adv|advert|direct|promo)(?:\s|$)/i.test(classSignal);
          const titleNode = container.querySelector(".OrganicTitle-LinkText,.OrganicTitle-Link,h2,h3,[role='heading']");
          const linkNode = titleNode?.closest?.("a[href]") || container.querySelector(".OrganicTitle-Link[href],h2 a[href],h3 a[href],a[href]");
          const url = unwrap(linkNode?.getAttribute("href") || "");
          if (!url || internal(url) || seen.has(url)) continue;
          seen.add(url);
          const item = {
            title: norm(titleNode?.innerText || titleNode?.textContent || linkNode?.innerText || url),
            url,
            domain: (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
            snippet: text.slice(0, 500),
            sponsoredLabel: label || (isSponsored ? "class-signal" : ""),
          };
          (isSponsored ? sponsored : organic).push(item);
        }
        return { organic, sponsored, containerCount: containers.length };
      }, labels);

      const organicResults = uniqueByUrl(extracted.organic);
      const sponsoredResults = uniqueByUrl(extracted.sponsored);
      report.queries.push({
        id: queryItem.id,
        query: queryItem.query,
        status: "ok",
        finalUrl: page.url(),
        httpStatus: response?.status() || null,
        organicResultsReviewed: organicResults.length,
        sponsoredResultsObserved: sponsoredResults.length,
        minimumMet: organicResults.length >= config.minimumOrganicResultsPerEngine,
        organicResults: organicResults.slice(0, 10),
        sponsoredResults: sponsoredResults.slice(0, 10),
        sponsoredResultLabels: [...new Set(sponsoredResults.map((item) => item.sponsoredLabel).filter(Boolean))],
        diagnostics: { containerCount: extracted.containerCount },
      });
      console.log(`Yandex public ${queryItem.id}: organic=${organicResults.length}, sponsored=${sponsoredResults.length}`);
      organicResults.slice(0, 5).forEach((item, index) => console.log(`  Y${index + 1}: ${item.domain} — ${item.title}`));
    } catch (error) {
      report.queries.push({
        id: queryItem.id,
        query: queryItem.query,
        status: "error",
        organicResultsReviewed: 0,
        sponsoredResultsObserved: 0,
        minimumMet: false,
        organicResults: [],
        sponsoredResults: [],
        diagnostics: { reason: clean(error?.message || error) },
      });
    } finally {
      await page.close().catch(() => {});
    }
  }
} finally {
  await context.close();
  await browser.close();
}

report.gatePassed = report.queries.every((item) => item.minimumMet);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Yandex public snapshot saved to ${outputPath}`);
console.log(`Yandex public gate passed: ${report.gatePassed}`);
if (!report.gatePassed) process.exitCode = 1;
