import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "config", "c061-serp.json"), "utf8"));
const outputDir = join(root, "reports", "serp-snapshots", "c061");
const outputPath = join(outputDir, "google-programmable.json");
const cx = "15706c4a58e938cd4";
const clean = (value) => String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();

const browser = await chromium.launch({ headless: true });
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  clusterId: config.clusterId,
  source: "Google Programmable Search Engine configured for whole-web search",
  sourceLimitations: "Programmable Search uses Google core search technology but can return a subset and different ordering from Google.com.",
  minimumOrganicResultsPerEngine: config.minimumOrganicResultsPerEngine,
  queries: []
};

try {
  for (const queryItem of config.queries) {
    const context = await browser.newContext({
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36",
      extraHTTPHeaders: { "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7" }
    });
    const page = await context.newPage();
    const url = `https://cse.google.com/cse?cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(queryItem.query)}`;
    let result;
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForSelector(".gsc-result, .gsc-webResult", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const bodyText = clean(await page.locator("body").innerText().catch(() => ""));
      const blocked = /unusual traffic|необычный трафик|not a robot|не робот|captcha|automated queries/i.test(`${page.url()} ${bodyText}`);
      const extracted = blocked ? { organic: [], sponsored: [] } : await page.evaluate(() => {
        const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const organic = [];
        const sponsored = [];
        const seen = new Set();
        for (const card of document.querySelectorAll(".gsc-webResult.gsc-result, .gsc-result")) {
          if (card.closest(".gsc-adBlock, .gsc-adBlockVertical")) continue;
          const anchor = card.querySelector("a.gs-title[href]");
          const title = norm(anchor?.textContent);
          const url = anchor?.href || "";
          if (!title || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
          seen.add(url);
          organic.push({
            title,
            url,
            domain: (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
            snippet: norm(card.querySelector(".gs-snippet")?.textContent).slice(0, 500),
            placementType: "organic"
          });
        }
        for (const ad of document.querySelectorAll(".gsc-adBlock a[href], .gsc-adBlockVertical a[href]")) {
          const url = ad.href || "";
          const title = norm(ad.textContent);
          if (!title || !/^https?:\/\//i.test(url)) continue;
          sponsored.push({ title, url, placementType: "sponsored", sponsoredLabel: "Google Programmable Search ad block" });
        }
        return { organic, sponsored };
      });
      const organic = extracted.organic.slice(0, 10);
      const sponsored = extracted.sponsored.slice(0, 10);
      result = {
        id: queryItem.id,
        query: queryItem.query,
        status: organic.length >= config.minimumOrganicResultsPerEngine ? "ok" : (blocked ? "blocked" : "error"),
        sourceUrl: page.url(),
        httpStatus: response?.status() || null,
        organicResultsReviewed: organic.length,
        sponsoredResultsObserved: sponsored.length,
        minimumMet: organic.length >= config.minimumOrganicResultsPerEngine,
        organicResults: organic,
        sponsoredResults: sponsored,
        sponsoredResultLabels: sponsored.length ? ["Google Programmable Search ad block"] : [],
        diagnostics: {
          blocked,
          resultCardCount: await page.locator(".gsc-webResult.gsc-result, .gsc-result").count().catch(() => 0),
          note: report.sourceLimitations
        }
      };
      console.log(`Google Programmable ${queryItem.id}: organic=${organic.length}, sponsored=${sponsored.length}, status=${result.status}`);
      organic.forEach((item, index) => console.log(`GP${index + 1}: ${item.domain} | ${item.title} | ${item.snippet}`));
    } catch (error) {
      result = {
        id: queryItem.id,
        query: queryItem.query,
        status: "error",
        organicResultsReviewed: 0,
        sponsoredResultsObserved: 0,
        minimumMet: false,
        organicResults: [],
        sponsoredResults: [],
        sponsoredResultLabels: [],
        diagnostics: { reason: clean(error?.message || error), note: report.sourceLimitations }
      };
      console.error(`Google Programmable ${queryItem.id}: ${result.diagnostics.reason}`);
    } finally {
      await context.close();
    }
    report.queries.push(result);
  }
} finally {
  await browser.close();
}

report.gatePassed = report.queries.every((item) => item.minimumMet);
await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Google Programmable gate passed: ${report.gatePassed}`);
if (!report.gatePassed) process.exitCode = 1;
