import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "config", "refund-services-serp.json"), "utf8"));
const outputDir = join(root, "reports", "serp-snapshots", "refund-services");
const outputPath = join(outputDir, "yandex-api.json");
const apiKey = String(process.env.YANDEX_SEARCH_API_KEY || "").trim();

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

const xmlTag = (source, tag) => {
  const match = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return clean(match?.[1] || "");
};

const decodeRawData = (rawData) => {
  const value = String(rawData || "");
  if (value.trimStart().startsWith("<")) return value;
  return Buffer.from(value, "base64").toString("utf8");
};

const uniqueByUrl = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.url || "").replace(/\/$/, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const search = async (queryText) => {
  if (!apiKey) throw new Error("YANDEX_SEARCH_API_KEY is missing");
  console.log(`::add-mask::${apiKey}`);
  const response = await fetch("https://searchapi.api.cloud.yandex.net/v2/web/search", {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${apiKey}`,
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
    signal: AbortSignal.timeout(30000),
  });

  const responseText = await response.text();
  let payload = {};
  try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = {}; }
  if (!response.ok) {
    const message = clean(payload?.message || payload?.error?.message || response.statusText);
    throw new Error(`Yandex Search API ${response.status}: ${message.slice(0, 500)}`);
  }
  if (!payload.rawData) throw new Error("Yandex Search API response has no rawData");

  const xml = decodeRawData(payload.rawData);
  const xmlError = xmlTag(xml, "error");
  if (xmlError) throw new Error(`Yandex Search XML error: ${xmlError}`);
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
      placementType: "organic",
    };
  }).filter((item) => /^https?:\/\//i.test(item.url)));

  return {
    status: "ok",
    organicResultsReviewed: organicResults.length,
    sponsoredResultsObserved: 0,
    minimumMet: organicResults.length >= config.minimumOrganicResultsPerEngine,
    organicResults: organicResults.slice(0, 10),
    sponsoredResults: [],
    sponsoredResultLabels: [],
    diagnostics: {
      documentCount: docs.length,
      note: "Search API XML document list contains organic documents; paid placements are not included.",
    },
  };
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  clusterId: config.clusterId,
  source: "Yandex Search API v2 WebSearch.Search, FORMAT_XML",
  region: config.checkedRegion,
  minimumOrganicResultsPerEngine: config.minimumOrganicResultsPerEngine,
  queries: [],
};

for (const queryItem of config.queries) {
  let result;
  try {
    result = await search(queryItem.query);
  } catch (error) {
    result = {
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
  report.queries.push({ id: queryItem.id, query: queryItem.query, ...result });
  console.log(`Yandex API ${queryItem.id}: organic=${result.organicResultsReviewed}, status=${result.status}`);
  result.organicResults.slice(0, 5).forEach((item, index) => console.log(`  Y${index + 1}: ${item.domain} — ${item.title}`));
}

report.gatePassed = report.queries.every((item) => item.minimumMet);
await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Yandex API report saved to ${outputPath}`);
console.log(`Yandex API gate passed: ${report.gatePassed}`);
if (!report.gatePassed) process.exitCode = 1;
