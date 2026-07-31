import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "config", "refund-services-serp.json"), "utf8"));
const outputDir = join(root, "reports", "serp-snapshots", "refund-services");
const outputPath = join(outputDir, "google-api.json");
const serperApiKey = String(process.env.SERPER_API_KEY || "").trim();
const serpApiKey = String(process.env.SERPAPI_API_KEY || "").trim();

const clean = (value) => String(value ?? "")
  .replace(/[\r\n\t]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const domainFor = (urlValue) => {
  try { return new URL(String(urlValue || "")).hostname.replace(/^www\./i, ""); }
  catch { return ""; }
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

const normalizeOrganic = (items) => uniqueByUrl((Array.isArray(items) ? items : []).map((item) => {
  const url = item?.link || item?.url || "";
  return {
    title: clean(item?.title),
    url,
    domain: domainFor(url),
    snippet: clean(item?.snippet || item?.description).slice(0, 500),
    placementType: "organic",
    position: Number(item?.position) || null,
  };
}).filter((item) => /^https?:\/\//i.test(item.url)));

const normalizeSponsored = (items, label) => uniqueByUrl((Array.isArray(items) ? items : []).map((item) => {
  const url = item?.link || item?.url || item?.tracking_link || "";
  return {
    title: clean(item?.title || item?.name),
    url,
    domain: domainFor(url),
    snippet: clean(item?.description || item?.snippet).slice(0, 500),
    placementType: "sponsored",
    sponsoredLabel: label,
    position: Number(item?.position) || null,
  };
}).filter((item) => /^https?:\/\//i.test(item.url)));

const requestJson = async (url, options, secrets) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`Google SERP provider returned non-JSON response (${response.status})`); }
  if (!response.ok) {
    let message = clean(payload?.message || payload?.error || payload?.error_message || response.statusText);
    for (const secret of secrets.filter(Boolean)) message = message.replaceAll(secret, "[masked]");
    throw new Error(`Google SERP provider ${response.status}: ${message.slice(0, 500)}`);
  }
  return payload;
};

const searchSerper = async (queryText) => {
  console.log(`::add-mask::${serperApiKey}`);
  const payload = await requestJson("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperApiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      q: queryText,
      gl: "ru",
      hl: "ru",
      location: "Moscow, Moscow, Russia",
      num: 10,
      autocorrect: true,
    }),
  }, [serperApiKey]);

  const organicResults = normalizeOrganic(payload?.organic);
  const sponsoredResults = [
    ...normalizeSponsored(payload?.ads, "ads"),
    ...normalizeSponsored(payload?.shopping, "shopping"),
  ];
  return {
    provider: "serper",
    organicResults,
    sponsoredResults: uniqueByUrl(sponsoredResults),
    diagnostics: {
      searchParameters: payload?.searchParameters || null,
      credits: payload?.credits ?? null,
    },
  };
};

const searchSerpApi = async (queryText) => {
  console.log(`::add-mask::${serpApiKey}`);
  const params = new URLSearchParams({
    engine: "google",
    q: queryText,
    location: "Moscow, Russia",
    google_domain: "google.com",
    gl: "ru",
    hl: "ru",
    num: "10",
    filter: "0",
    api_key: serpApiKey,
  });
  const payload = await requestJson(`https://serpapi.com/search.json?${params}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  }, [serpApiKey]);

  const organicResults = normalizeOrganic(payload?.organic_results);
  const sponsoredResults = [
    ...normalizeSponsored(payload?.ads, "ads"),
    ...normalizeSponsored(payload?.inline_ads, "inline_ads"),
    ...normalizeSponsored(payload?.local_ads, "local_ads"),
    ...normalizeSponsored(payload?.shopping_results?.filter?.((item) => item?.sponsored), "sponsored_shopping"),
  ];
  return {
    provider: "serpapi",
    organicResults,
    sponsoredResults: uniqueByUrl(sponsoredResults),
    diagnostics: {
      searchMetadata: payload?.search_metadata || null,
      searchParameters: payload?.search_parameters || null,
      searchInformation: payload?.search_information || null,
    },
  };
};

const search = async (queryText) => {
  if (serperApiKey) return searchSerper(queryText);
  if (serpApiKey) return searchSerpApi(queryText);
  throw new Error("Neither SERPER_API_KEY nor SERPAPI_API_KEY is configured");
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  clusterId: config.clusterId,
  source: serperApiKey ? "Serper Google Search API" : (serpApiKey ? "SerpApi Google Search API" : "not configured"),
  region: {
    label: "Москва",
    country: "ru",
    language: "ru",
  },
  minimumOrganicResultsPerEngine: config.minimumOrganicResultsPerEngine,
  excludeSponsoredResultsFromMinimum: true,
  queries: [],
};

for (const queryItem of config.queries) {
  let result;
  try {
    const response = await search(queryItem.query);
    const organicResults = response.organicResults;
    const sponsoredResults = response.sponsoredResults;
    result = {
      status: organicResults.length >= config.minimumOrganicResultsPerEngine ? "ok" : "error",
      provider: response.provider,
      organicResultsReviewed: organicResults.length,
      sponsoredResultsObserved: sponsoredResults.length,
      minimumMet: organicResults.length >= config.minimumOrganicResultsPerEngine,
      organicResults: organicResults.slice(0, 10),
      sponsoredResults: sponsoredResults.slice(0, 10),
      sponsoredResultLabels: [...new Set(sponsoredResults.map((item) => item.sponsoredLabel).filter(Boolean))],
      diagnostics: response.diagnostics,
    };
    if (!result.minimumMet) result.diagnostics.reason = "Provider returned fewer than five classifiable organic Google results";
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
  console.log(`Google API ${queryItem.id}: organic=${result.organicResultsReviewed}, sponsored=${result.sponsoredResultsObserved}, status=${result.status}`);
  result.organicResults.slice(0, 5).forEach((item, index) => console.log(`  G${index + 1}: ${item.domain} — ${item.title}`));
}

report.gatePassed = report.queries.every((item) => item.minimumMet);
await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Google API report saved to ${outputPath}`);
console.log(`Google API gate passed: ${report.gatePassed}`);
if (!report.gatePassed) process.exitCode = 1;
