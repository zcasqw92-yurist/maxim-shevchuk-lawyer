import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "config", "seo-data-pipeline.json");
const initialCachePath = join(root, "data", "seo", "wordstat-cache.json");

const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [rawKey, ...rawValue] = argument.replace(/^--/, "").split("=");
  return [rawKey, rawValue.length ? rawValue.join("=") : "true"];
}));
const mode = String(args.mode || "feedback").trim();
const stateDir = resolve(String(process.env.SEO_STATE_DIR || join(root, "reports", "seo-data")));
const now = new Date(String(process.env.SEO_NOW || new Date().toISOString()));
const today = now.toISOString().slice(0, 10);
const force = String(args.force || process.env.SEO_FORCE_WORDSTAT || "false") === "true";
const selectedHypothesis = String(args.hypothesis || process.env.SEO_HYPOTHESIS_ID || "").trim();

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const fileExists = async (path) => {
  try { await access(path); return true; } catch { return false; }
};
const normalizeSpace = (value) => String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
const safeText = (value, secrets = []) => {
  let text = normalizeSpace(value);
  for (const secret of secrets.filter(Boolean)) text = text.replaceAll(secret, "[masked]");
  return text.slice(0, 500);
};
const dateMinusDays = (date, days) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
};
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const writeCsv = async (path, headers, rows) => {
  await mkdir(dirname(path), { recursive: true });
  const content = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  await writeFile(path, `\uFEFF${content}\n`, "utf8");
};
const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const percent = (numerator, denominator) => denominator > 0 ? `${((numerator / denominator) * 100).toFixed(2)}%` : "";

const config = await readJson(configPath);
await mkdir(stateDir, { recursive: true });
const cachePath = join(stateDir, "wordstat-cache.json");
if (!(await fileExists(cachePath))) {
  await writeFile(cachePath, await readFile(initialCachePath, "utf8"), "utf8");
}

const publications = [
  ...articles.map((item) => ({
    id: item.id,
    type: "Статья",
    title: item.title,
    path: `/razbory/${item.slug}/`,
    publishedAt: item.publishedAt,
  })),
  ...practiceCases.map((item) => ({
    id: item.id,
    type: "Кейс",
    title: item.title,
    path: `/praktika/${item.slug}/`,
    publishedAt: item.publishedAt,
  })),
];

const cacheKeyFor = (hypothesis, phrase = hypothesis.phrase) => [
  "topRequests",
  normalizeSpace(phrase).toLowerCase(),
  String(hypothesis.region || config.default_region),
  String(hypothesis.device || config.default_device),
].join("|");

const isFresh = (entry) => entry?.expires_at && entry.expires_at >= today;
const isBlacklisted = (phrase) => config.blacklist_patterns.some((pattern) =>
  normalizeSpace(phrase).toLowerCase().includes(normalizeSpace(pattern).toLowerCase())
);

const callWordstat = async ({ apiKey, phrase, region, device, reason }) => {
  if (!normalizeSpace(reason)) throw new Error(`Wordstat-вызов «${phrase}» не имеет причины`);
  if (isBlacklisted(phrase)) throw new Error(`Wordstat-вызов заблокирован чёрным списком: ${phrase}`);
  const response = await fetch(config.wordstat.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      phrase,
      numPhrases: config.wordstat.num_phrases,
      regions: [String(region)],
      devices: [String(device)],
    }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    throw new Error(`Wordstat API ${response.status}: ${safeText(payload?.message || payload?.error?.message || response.statusText, [apiKey])}`);
  }
  if (!Object.hasOwn(payload, "totalCount") || !Array.isArray(payload.results)) {
    throw new Error("Wordstat API вернул неожиданную структуру");
  }
  return {
    total_count: asNumber(payload.totalCount),
    results: payload.results.slice(0, config.wordstat.num_phrases).map((item) => ({
      phrase: safeText(item?.phrase, [apiKey]),
      count: asNumber(item?.count),
    })),
    associations: (Array.isArray(payload.associations) ? payload.associations : []).slice(0, 10).map((item) => ({
      phrase: safeText(item?.phrase, [apiKey]),
      count: asNumber(item?.count),
    })),
  };
};

const runWordstat = async () => {
  const cache = await readJson(cachePath);
  const candidates = config.hypotheses.filter((hypothesis) =>
    selectedHypothesis ? hypothesis.content_id === selectedHypothesis : hypothesis.status === "pending"
  );
  const report = {
    generated_at: now.toISOString(),
    mode: "wordstat",
    selected_hypothesis: selectedHypothesis || null,
    limits: {
      max_calls_per_cluster: config.max_api_calls_per_cluster,
      max_primary_calls: config.max_primary_calls,
      max_refinement_calls: config.max_refinement_calls,
      cache_ttl_days: config.cache_ttl_days,
    },
    clusters: [],
    totals: { clusters: candidates.length, api_calls: 0, cache_hits: 0 },
    safety: { raw_responses_saved: false, secrets_saved: false },
  };

  for (const hypothesis of candidates) {
    const phrases = [
      { phrase: hypothesis.phrase, reason: hypothesis.reason, role: "primary" },
      ...(hypothesis.refinements || []).slice(0, config.max_refinement_calls).map((item) => ({ ...item, role: "refinement" })),
    ].slice(0, config.max_api_calls_per_cluster);
    const cluster = {
      content_id: hypothesis.content_id,
      publication_id: hypothesis.publication_id,
      phrase: hypothesis.phrase,
      reason: hypothesis.reason,
      calls: [],
      decision: "",
    };

    for (const request of phrases) {
      const key = cacheKeyFor(hypothesis, request.phrase);
      const existing = cache.entries?.[key];
      if (!force && isFresh(existing)) {
        report.totals.cache_hits += 1;
        cluster.calls.push({ role: request.role, phrase: request.phrase, source: "cache", api_calls: 0, result: existing });
        continue;
      }
      const apiKey = String(process.env.YANDEX_SEARCH_API_KEY || "").trim();
      if (!apiKey) throw new Error("Не передан YANDEX_SEARCH_API_KEY для нового Wordstat-вызова");
      console.log(`::add-mask::${apiKey}`);
      const normalized = await callWordstat({
        apiKey,
        phrase: request.phrase,
        region: hypothesis.region || config.default_region,
        device: hypothesis.device || config.default_device,
        reason: request.reason,
      });
      const expires = new Date(now);
      expires.setUTCDate(expires.getUTCDate() + config.cache_ttl_days);
      const entry = {
        content_id: hypothesis.content_id,
        phrase: request.phrase,
        region: String(hypothesis.region || config.default_region),
        device: String(hypothesis.device || config.default_device),
        method: "topRequests",
        checked_at: today,
        expires_at: expires.toISOString().slice(0, 10),
        api_calls: 1,
        reason: request.reason,
        ...normalized,
      };
      cache.entries ||= {};
      cache.entries[key] = entry;
      report.totals.api_calls += 1;
      cluster.calls.push({ role: request.role, phrase: request.phrase, source: "api", api_calls: 1, result: entry });
    }
    const primary = cluster.calls.find((item) => item.role === "primary")?.result;
    cluster.decision = primary
      ? `Получено ${primary.total_count} запросов; решение принимается по внутреннему сигналу, интенту и фактическим данным после публикации.`
      : "Запрос не выполнялся: нет ожидающей проверки гипотезы.";
    report.clusters.push(cluster);
  }

  cache.updated_at = now.toISOString();
  await writeJson(cachePath, cache);
  await writeJson(join(stateDir, "wordstat-latest.json"), report);
  const wordstatRows = Object.values(cache.entries || {}).map((entry) => [
    entry.content_id,
    entry.phrase,
    entry.region,
    entry.checked_at,
    entry.expires_at,
    entry.total_count,
    entry.api_calls,
    entry.decision || entry.reason || "",
  ]);
  await writeCsv(join(stateDir, "sheet-wordstat-cache.csv"), [
    "Контент ID", "Фраза", "Регион", "Дата проверки", "Кеш действует до", "Частотность", "API-вызовов", "Решение / причина",
  ], wordstatRows);
  console.log(`Wordstat pipeline: clusters=${report.totals.clusters}, api_calls=${report.totals.api_calls}, cache_hits=${report.totals.cache_hits}`);
  return report;
};

const apiGet = async (url, token, label) => {
  const response = await fetch(url, {
    headers: { Authorization: `OAuth ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) throw new Error(`${label} API ${response.status}: ${safeText(payload?.message || payload?.error_code || response.statusText, [token])}`);
  return payload;
};

const normalizeHostname = (urlValue) => {
  try { return new URL(String(urlValue || "")).hostname.replace(/^www\./i, "").toLowerCase(); }
  catch { return ""; }
};

const fetchWebmaster = async (token) => {
  const base = config.webmaster.api_base;
  const user = await apiGet(`${base}/user`, token, "Webmaster");
  if (!user.user_id) throw new Error("Webmaster API не вернул user_id");
  const hostsPayload = await apiGet(`${base}/user/${encodeURIComponent(user.user_id)}/hosts`, token, "Webmaster");
  const hosts = Array.isArray(hostsPayload.hosts) ? hostsPayload.hosts : [];
  const host = hosts.find((item) =>
    normalizeHostname(item?.ascii_host_url) === config.webmaster.target_host ||
    normalizeHostname(item?.unicode_host_url) === config.webmaster.target_host
  );
  if (!host?.host_id) throw new Error(`Сайт ${config.webmaster.target_host} не найден в Вебмастере`);
  const params = new URLSearchParams();
  params.set("order_by", "TOTAL_SHOWS");
  params.append("query_indicator", "TOTAL_SHOWS");
  params.append("query_indicator", "TOTAL_CLICKS");
  params.append("query_indicator", "AVG_SHOW_POSITION");
  params.set("device_type_indicator", "ALL");
  params.set("limit", String(config.webmaster.popular_queries_limit));
  const payload = await apiGet(
    `${base}/user/${encodeURIComponent(user.user_id)}/hosts/${encodeURIComponent(host.host_id)}/search-queries/popular?${params}`,
    token,
    "Webmaster",
  );
  return {
    target_host: config.webmaster.target_host,
    verified: Boolean(host.verified),
    queries: (Array.isArray(payload.queries) ? payload.queries : []).map((item) => ({
      query: safeText(item?.query_text, [token]),
      shows: asNumber(item?.indicators?.TOTAL_SHOWS),
      clicks: asNumber(item?.indicators?.TOTAL_CLICKS),
      avg_position: asNumber(item?.indicators?.AVG_SHOW_POSITION),
    })),
  };
};

const actionEvent = (goal = {}) => goal.type === "action"
  ? String((goal.conditions || []).find((item) => typeof item?.url === "string")?.url || "").trim()
  : "";

const fetchMetrica = async (token, date1, date2) => {
  const management = config.metrica.management_api_base;
  const counterId = String(config.metrica.counter_id);
  const goalsPayload = await apiGet(`${management}/counter/${counterId}/goals`, token, "Metrica management");
  const goals = Array.isArray(goalsPayload.goals) ? goalsPayload.goals : [];
  const goalIds = new Map(goals.filter((goal) => goal.type === "action").map((goal) => [actionEvent(goal), Number(goal.id)]));
  const missing = config.metrica.goal_events.filter((event) => !goalIds.get(event));
  if (missing.length) throw new Error(`В Метрике отсутствуют цели: ${missing.join(", ")}`);

  const metricDefinitions = [
    { key: "visits", expression: "ym:s:visits" },
    { key: "pageviews", expression: "ym:s:pageviews" },
    { key: "users", expression: "ym:s:users" },
    ...config.metrica.goal_events.map((event) => ({
      key: event,
      expression: `ym:s:goal${goalIds.get(event)}reaches`,
    })),
  ];
  const params = new URLSearchParams({
    ids: counterId,
    date1,
    date2,
    dimensions: "ym:s:startURLPath",
    metrics: metricDefinitions.map((item) => item.expression).join(","),
    limit: "1000",
    accuracy: "full",
  });
  const payload = await apiGet(`${config.metrica.reporting_api_base}/data?${params}`, token, "Metrica reporting");
  const rows = (Array.isArray(payload.data) ? payload.data : []).map((row) => {
    const path = String(row?.dimensions?.[0]?.name || row?.dimensions?.[0]?.id || "");
    const values = Object.fromEntries(metricDefinitions.map((definition, index) => [definition.key, asNumber(row?.metrics?.[index])]));
    return { path, ...values };
  }).filter((row) => row.path.startsWith("/razbory/") || row.path.startsWith("/praktika/"));
  return {
    counter_id: counterId,
    date1,
    date2,
    contains_sensitive_data: Boolean(payload.contains_sensitive_data),
    sampled: Boolean(payload.sampled),
    rows,
  };
};

const runFeedback = async () => {
  const webmasterToken = String(process.env.YANDEX_WEBMASTER_TOKEN || "").trim();
  const metricaToken = String(process.env.YANDEX_METRICA_OAUTH_TOKEN || "").trim();
  if (!webmasterToken) throw new Error("Не передан YANDEX_WEBMASTER_TOKEN");
  if (!metricaToken) throw new Error("Не передан YANDEX_METRICA_OAUTH_TOKEN");
  console.log(`::add-mask::${webmasterToken}`);
  console.log(`::add-mask::${metricaToken}`);

  const date2 = String(args.date2 || today);
  const date1 = String(args.date1 || dateMinusDays(now, config.metrica.lookback_days - 1));
  const [webmaster, metrica] = await Promise.all([
    fetchWebmaster(webmasterToken),
    fetchMetrica(metricaToken, date1, date2),
  ]);
  const metricaByPath = new Map(metrica.rows.map((row) => [row.path, row]));
  const statistics = publications.map((publication) => {
    const data = metricaByPath.get(publication.path) || {};
    const views = asNumber(data.publication_view);
    const contact = asNumber(data.contact_conversion);
    return {
      period: `${date1}—${date2}`,
      content_id: publication.id,
      url: publication.path,
      title: publication.title,
      type: publication.type,
      published_at: publication.publishedAt,
      visits: asNumber(data.visits),
      pageviews: asNumber(data.pageviews),
      users: asNumber(data.users),
      publication_view: views,
      scroll_50: asNumber(data.publication_scroll_50),
      scroll_90: asNumber(data.publication_scroll_90),
      active_60s: asNumber(data.publication_active_60s),
      faq_open: asNumber(data.publication_faq_open),
      related_click: asNumber(data.publication_related_click),
      messenger_intent: asNumber(data.publication_messenger_intent),
      contact_conversion: contact,
      telegram: asNumber(data.contact_telegram),
      whatsapp: asNumber(data.contact_whatsapp),
      conversion_to_chat: percent(contact, views),
      decision: views >= 30 ? "Данных достаточно для первичного наблюдения; редакционное решение требует сравнения с версией и поисковым спросом." : "Наблюдение: выборка недостаточна, материал не менять.",
    };
  });
  const report = {
    generated_at: now.toISOString(),
    period: { date1, date2 },
    webmaster,
    metrica,
    publications: statistics,
    rules: {
      no_decision_below_publication_views: 30,
      wordstat_not_called_on_feedback_schedule: true,
      conclusions_require_version_comparison: true,
    },
    safety: { raw_responses_saved: false, tokens_saved: false, personal_data_saved: false },
  };
  await writeJson(join(stateDir, "feedback-latest.json"), report);
  await writeJson(join(stateDir, "history", `${today}.json`), report);
  await writeCsv(join(stateDir, "webmaster-popular-queries.csv"), ["Запрос", "Показы", "Клики", "Средняя позиция"],
    webmaster.queries.map((item) => [item.query, item.shows, item.clicks, item.avg_position || ""]));
  await writeCsv(join(stateDir, "sheet-content-statistics.csv"), [
    "Период", "Контент ID", "URL", "Тема", "Тип материала", "Дата публикации", "Показы", "Клики", "CTR", "Средняя позиция",
    "Просмотры статьи", "Скролл 25%", "Скролл 50%", "Скролл 75%", "Скролл 90%", "Дочитали 100%", "Активное чтение 60с",
    "Открытия FAQ", "Клики по кейсам", "Клики по услугам", "Telegram", "WhatsApp", "Всего переходов в чат", "Обращения с материала",
    "Конверсия в чат", "Конверсия в обращение", "Новые формулировки клиентов", "Решение / что изменить",
  ], statistics.map((item) => [
    item.period, item.content_id, item.url, item.title, item.type, item.published_at, "", "", "", "",
    item.publication_view, "", item.scroll_50, "", item.scroll_90, "", item.active_60s,
    item.faq_open, item.related_click, "", item.telegram, item.whatsapp, item.contact_conversion, "",
    item.conversion_to_chat, "", "", item.decision,
  ]));
  const summary = [
    "# SEO feedback snapshot",
    "",
    `- Период: ${date1}—${date2}`,
    `- Запросов Вебмастера: ${webmaster.queries.length}`,
    `- Публикаций в отчёте: ${statistics.length}`,
    `- Посещений публикаций: ${statistics.reduce((sum, item) => sum + item.visits, 0)}`,
    `- Переходов к контакту: ${statistics.reduce((sum, item) => sum + item.contact_conversion, 0)}`,
    "- Wordstat по расписанию не вызывается.",
    "- При малой выборке материалы автоматически не переписываются.",
    "",
  ].join("\n");
  await writeFile(join(stateDir, "summary.md"), summary, "utf8");
  console.log(`Feedback pipeline: queries=${webmaster.queries.length}, publications=${statistics.length}`);
  return report;
};

if (!new Set(["feedback", "wordstat", "all"]).has(mode)) {
  throw new Error(`Неизвестный режим: ${mode}`);
}
if (mode === "feedback" || mode === "all") await runFeedback();
if (mode === "wordstat" || mode === "all") await runWordstat();
