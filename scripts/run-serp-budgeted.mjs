import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "config", "refund-services-serp.json");
const budgetPath = join(root, "config", "serp-api-budget.json");
const cachePath = join(root, "reports", "serp-cache", "refund-services.json");
const usagePath = join(root, "reports", "serp-usage", "api-usage.json");
const outputDir = join(root, "reports", "serp-snapshots", "refund-services");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const bool = (value) => ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
const clean = (value) => String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
const normalizeQuery = (value) => clean(value).toLowerCase().replace(/ё/g, "е");
const now = new Date();
const nowIso = now.toISOString();
const currentCycle = nowIso.slice(0, 7);

const engine = String(process.env.SERP_ENGINE || "google").trim().toLowerCase();
const allowPaidRequests = bool(process.env.SERP_ALLOW_PAID_REQUESTS);
const forceRefresh = bool(process.env.SERP_FORCE_REFRESH);
const approvedQueryIds = new Set(
  String(process.env.SERP_QUERY_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

const engineSettings = {
  google: {
    cacheKey: "google",
    providerKey: "serpapi",
    providerScript: join(root, "scripts", "google-serp-api.mjs"),
    outputPath: join(outputDir, "google-api.json"),
    reportSource: "SerpApi Google Search API",
  },
  yandex: {
    cacheKey: "yandex",
    providerKey: "yandexSearchApi",
    providerScript: join(root, "scripts", "yandex-search-api-serp.mjs"),
    outputPath: join(outputDir, "yandex-api.json"),
    reportSource: "Yandex Search API v2 WebSearch.Search",
  },
};

if (!engineSettings[engine]) throw new Error(`Unsupported SERP_ENGINE: ${engine}`);
const settings = engineSettings[engine];
const [config, budget, cache, usage, originalConfigText] = await Promise.all([
  readJson(configPath),
  readJson(budgetPath),
  readJson(cachePath),
  readJson(usagePath),
  readFile(configPath, "utf8"),
]);

const ttlDays = Number(budget.cacheTtlDays || cache.cacheTtlDays || 14);
const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
const engineCache = cache.engines?.[settings.cacheKey];
if (!engineCache) throw new Error(`Cache has no engine section: ${settings.cacheKey}`);
const providerBudget = budget.providers?.[settings.providerKey] || {};
const providerUsage = usage.providers?.[settings.providerKey];
if (!providerUsage) throw new Error(`Usage ledger has no provider: ${settings.providerKey}`);

const freshness = (entry) => {
  if (!entry?.checkedAt) return { fresh: false, ageDays: null };
  const checked = new Date(entry.checkedAt).getTime();
  if (!Number.isFinite(checked)) return { fresh: false, ageDays: null };
  const ageMs = now.getTime() - checked;
  return { fresh: ageMs >= 0 && ageMs <= ttlMs, ageDays: Math.max(0, ageMs / 86400000) };
};

const desired = [];
const blocked = new Map();
let cacheHits = 0;
for (const queryItem of config.queries) {
  const entry = engineCache.queries?.[queryItem.id];
  const exactMatch = entry?.query === queryItem.query;
  const state = freshness(entry);
  const explicitlySelected = approvedQueryIds.has(queryItem.id);
  const needsRefresh = forceRefresh && explicitlySelected;

  if (entry && exactMatch && state.fresh && !needsRefresh) {
    cacheHits += 1;
    continue;
  }

  if (entry && exactMatch && !state.fresh && !needsRefresh) {
    blocked.set(queryItem.id, `Cached ${engine} result is ${state.ageDays?.toFixed(1) ?? "unknown"} days old. Automatic refresh is forbidden; approve this query ID and set SERP_FORCE_REFRESH=1.`);
    continue;
  }

  if (!allowPaidRequests) {
    blocked.set(queryItem.id, `No fresh cache for ${engine}; paid request is disabled.`);
    continue;
  }
  if (budget.requireApprovedQueryIds && !explicitlySelected) {
    blocked.set(queryItem.id, `Query ID is not explicitly approved in SERP_QUERY_IDS.`);
    continue;
  }
  if (entry && exactMatch && state.fresh && forceRefresh && !explicitlySelected) {
    continue;
  }
  desired.push(queryItem);
}

if (forceRefresh && approvedQueryIds.size === 0) {
  throw new Error("SERP_FORCE_REFRESH requires explicit SERP_QUERY_IDS; bulk refresh is forbidden.");
}

const grouped = new Map();
for (const queryItem of desired) {
  const key = normalizeQuery(queryItem.query);
  const group = grouped.get(key) || { representative: queryItem, ids: [] };
  group.ids.push(queryItem.id);
  grouped.set(key, group);
}
const requestGroups = [...grouped.values()];
const plannedRequests = requestGroups.length;
const maxPerRun = Number(budget.maxPaidRequestsPerRun || 3);

if (plannedRequests > maxPerRun) {
  throw new Error(`Planned ${plannedRequests} paid requests, but the per-run limit is ${maxPerRun}. Split the approved query IDs into smaller runs.`);
}

if (plannedRequests > 0) {
  if (!allowPaidRequests) throw new Error("Internal guard: planned requests exist while paid requests are disabled.");
  if (providerUsage.cycleResetPolicy === "manual" && providerUsage.cycleId !== currentCycle) {
    throw new Error(`Usage cycle is ${providerUsage.cycleId}, current month is ${currentCycle}. Update the dashboard-confirmed cycle manually before spending.`);
  }
  if (Number.isFinite(Number(providerBudget.hardStopAt)) && Number.isFinite(Number(providerUsage.knownUsed))) {
    const projected = Number(providerUsage.knownUsed) + plannedRequests;
    if (projected > Number(providerBudget.hardStopAt)) {
      throw new Error(`Projected ${settings.providerKey} usage ${projected} exceeds project hard stop ${providerBudget.hardStopAt}.`);
    }
  }
}

let providerReport = null;
let usageRecord = null;
if (plannedRequests > 0) {
  const representatives = requestGroups.map((group) => group.representative);
  const narrowedConfig = { ...config, queries: representatives };

  usageRecord = {
    at: nowIso,
    clusterId: config.clusterId,
    engine,
    count: plannedRequests,
    queryIds: requestGroups.flatMap((group) => group.ids),
    normalizedQueries: requestGroups.map((group) => normalizeQuery(group.representative.query)),
    reason: forceRefresh ? "Explicit approved refresh" : "Explicit approved cache miss",
    status: "reserved-before-provider-call",
    workflowCommit: process.env.GITHUB_SHA || null,
  };
  providerUsage.requests = Array.isArray(providerUsage.requests) ? providerUsage.requests : [];
  providerUsage.requests.push(usageRecord);
  if (Number.isFinite(Number(providerUsage.knownUsed))) {
    providerUsage.knownUsed = Number(providerUsage.knownUsed) + plannedRequests;
    if (Number.isFinite(Number(providerUsage.limit))) {
      providerUsage.remainingToProviderLimit = Math.max(0, Number(providerUsage.limit) - providerUsage.knownUsed);
    }
    if (Number.isFinite(Number(providerBudget.hardStopAt))) {
      providerUsage.remainingToProjectHardStop = Math.max(0, Number(providerBudget.hardStopAt) - providerUsage.knownUsed);
    }
  }
  usage.updatedAt = nowIso;
  await writeJson(usagePath, usage);

  try {
    await writeJson(configPath, narrowedConfig);
    const child = spawnSync(process.execPath, [settings.providerScript], {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      timeout: 180000,
    });
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    try {
      providerReport = await readJson(settings.outputPath);
    } catch (error) {
      usageRecord.status = "provider-report-missing";
      usageRecord.error = clean(error?.message || error);
    }
    if (!providerReport && child.status !== 0) {
      usageRecord.status = "provider-failed";
      usageRecord.exitCode = child.status;
    }
  } finally {
    await writeFile(configPath, originalConfigText, "utf8");
  }

  if (providerReport) {
    const byId = new Map((providerReport.queries || []).map((item) => [item.id, item]));
    for (const group of requestGroups) {
      const fetched = byId.get(group.representative.id);
      if (!fetched) continue;
      for (const id of group.ids) {
        const configured = config.queries.find((item) => item.id === id);
        engineCache.queries[id] = {
          query: configured?.query || group.representative.query,
          checkedAt: nowIso,
          source: providerReport.source || settings.reportSource,
          result: { ...fetched, id: undefined, query: undefined },
        };
        blocked.delete(id);
      }
    }
    usageRecord.status = providerReport.gatePassed ? "completed" : "completed-with-provider-errors";
  }
  usage.updatedAt = new Date().toISOString();
  await Promise.all([writeJson(cachePath, cache), writeJson(usagePath, usage)]);
}

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  clusterId: config.clusterId,
  source: `${settings.reportSource} with persistent query cache`,
  engine,
  region: engineCache.region,
  minimumOrganicResultsPerEngine: config.minimumOrganicResultsPerEngine,
  excludeSponsoredResultsFromMinimum: true,
  cachePolicy: {
    ttlDays,
    neverRefreshAutomatically: Boolean(budget.neverRefreshAutomatically),
    cacheHits,
    paidRequestsThisRun: plannedRequests,
    maxPaidRequestsPerRun: maxPerRun,
    approvedQueryIds: [...approvedQueryIds],
    forceRefresh,
  },
  budget: {
    provider: settings.providerKey,
    cycleId: providerUsage.cycleId,
    limit: providerUsage.limit ?? providerBudget.monthlyLimit ?? null,
    hardStopAt: providerBudget.hardStopAt ?? null,
    knownUsed: providerUsage.knownUsed ?? null,
    remainingToProviderLimit: providerUsage.remainingToProviderLimit ?? null,
    remainingToProjectHardStop: providerUsage.remainingToProjectHardStop ?? null,
  },
  queries: [],
};

for (const queryItem of config.queries) {
  const entry = engineCache.queries?.[queryItem.id];
  const exactMatch = entry?.query === queryItem.query;
  const state = freshness(entry);
  const reason = blocked.get(queryItem.id);
  if (entry && exactMatch && state.fresh && !reason) {
    report.queries.push({
      id: queryItem.id,
      query: queryItem.query,
      ...entry.result,
      minimumMet: Boolean(entry.result?.minimumMet),
      cache: { status: plannedRequests > 0 && entry.checkedAt === nowIso ? "updated" : "hit", checkedAt: entry.checkedAt, ageDays: state.ageDays },
    });
  } else {
    report.queries.push({
      id: queryItem.id,
      query: queryItem.query,
      status: entry && exactMatch ? "stale" : "error",
      organicResultsReviewed: entry?.result?.organicResultsReviewed ?? 0,
      sponsoredResultsObserved: entry?.result?.sponsoredResultsObserved ?? 0,
      minimumMet: false,
      organicResults: entry?.result?.organicResults || [],
      sponsoredResults: entry?.result?.sponsoredResults || [],
      sponsoredResultLabels: entry?.result?.sponsoredResultLabels || [],
      diagnostics: { reason: reason || "No matching cached result" },
      cache: { status: entry && exactMatch ? "stale" : "miss", checkedAt: entry?.checkedAt || null, ageDays: state.ageDays },
    });
  }
}

report.gatePassed = report.queries.length > 0 && report.queries.every((item) => item.minimumMet);
await writeJson(settings.outputPath, report);
console.log(`${engine} SERP: cache hits=${cacheHits}, paid requests=${plannedRequests}, gate=${report.gatePassed}`);
if (settings.providerKey === "serpapi") {
  console.log(`SerpApi usage: ${report.budget.knownUsed}/${report.budget.limit}, project hard stop ${report.budget.hardStopAt}`);
}
for (const item of report.queries) {
  console.log(`${engine} ${item.id}: ${item.cache?.status}, organic=${item.organicResultsReviewed}, status=${item.status}`);
}
if (!report.gatePassed) process.exitCode = 1;
