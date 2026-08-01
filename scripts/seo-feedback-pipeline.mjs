import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "config", "seo-data-pipeline.json"), "utf8"));
const stateDir = resolve(String(process.env.SEO_STATE_DIR || join(root, "reports", "seo-data")));
const now = new Date(String(process.env.SEO_NOW || new Date().toISOString()));
const today = now.toISOString().slice(0, 10);
const origin = `https://${config.webmaster.target_host}`;

const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [rawKey, ...rawValue] = argument.replace(/^--/, "").split("=");
  return [rawKey, rawValue.length ? rawValue.join("=") : "true"];
}));

const normalizeSpace = (value) => String(value ?? "")
  .replace(/[\r\n\t]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const safeText = (value, secrets = [], limit = 500) => {
  let text = normalizeSpace(value);
  for (const secret of secrets.filter(Boolean)) text = text.replaceAll(secret, "[masked]");
  return text.slice(0, limit);
};
const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value, digits = 2) => Number(asNumber(value).toFixed(digits));
const percentNumber = (numerator, denominator) => denominator > 0 ? round((numerator / denominator) * 100) : 0;
const percentText = (numerator, denominator) => denominator > 0 ? `${percentNumber(numerator, denominator).toFixed(2)}%` : "";
const dateMinusDays = (date, days) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
};
const normalizePath = (value) => {
  try {
    const pathname = new URL(String(value || "/"), origin).pathname.replace(/\/{2,}/g, "/");
    if (pathname === "/") return "/";
    return `${pathname.replace(/\/+$/, "")}/`;
  } catch {
    const pathname = String(value || "/").split(/[?#]/)[0].replace(/\/{2,}/g, "/");
    if (pathname === "/") return "/";
    return `${pathname.replace(/\/+$/, "")}/`;
  }
};
const absoluteUrl = (path) => new URL(normalizePath(path), origin).toString();
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const writeCsv = async (path, headers, rows) => {
  await mkdir(dirname(path), { recursive: true });
  const content = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  await writeFile(path, `\uFEFF${content}\n`, "utf8");
};
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const clusterDefinitions = Array.isArray(config.feedback_clusters) ? config.feedback_clusters : [];
const clusterPages = clusterDefinitions.flatMap((cluster) => (cluster.pages || []).map((page) => ({
  ...page,
  path: normalizePath(page.path),
  cluster_id: cluster.id,
  cluster_name: cluster.name,
})));
const editorialPages = [
  ...articles.map((item) => ({
    content_id: item.id,
    path: normalizePath(`/razbory/${item.slug}/`),
    title: item.title,
    type: "Статья",
    published_at: item.publishedAt || "",
  })),
  ...practiceCases.map((item) => ({
    content_id: item.id,
    path: normalizePath(`/praktika/${item.slug}/`),
    title: item.title,
    type: "Кейс",
    published_at: item.publishedAt || "",
  })),
];
const pageMap = new Map(editorialPages.map((page) => [page.path, page]));
for (const page of clusterPages) pageMap.set(page.path, { ...(pageMap.get(page.path) || {}), ...page });
const trackedPages = [...pageMap.values()];
const trackedPaths = new Set(trackedPages.map((page) => page.path));

if (!clusterDefinitions.length) throw new Error("В config/seo-data-pipeline.json не определены feedback_clusters");
for (const cluster of clusterDefinitions) {
  if (!cluster.id || !cluster.name || !Array.isArray(cluster.pages) || cluster.pages.length < 2) {
    throw new Error(`Некорректное описание feedback-кластера: ${cluster.id || "без ID"}`);
  }
}

const apiRequest = async (url, token, label, options = {}) => {
  const method = options.method || "GET";
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json; charset=UTF-8" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    throw new Error(`${label} API ${response.status}: ${safeText(payload?.error_message || payload?.message || payload?.error_code || response.statusText, [token])}`);
  }
  return payload;
};

const getWebmasterContext = async (token) => {
  const base = config.webmaster.api_base;
  const user = await apiRequest(`${base}/user`, token, "Webmaster user");
  if (!user.user_id) throw new Error("Webmaster API не вернул user_id");
  const hostsPayload = await apiRequest(`${base}/user/${encodeURIComponent(user.user_id)}/hosts`, token, "Webmaster hosts");
  const hosts = Array.isArray(hostsPayload.hosts) ? hostsPayload.hosts : [];
  const host = hosts.find((item) => {
    const candidates = [item?.ascii_host_url, item?.unicode_host_url].filter(Boolean);
    return candidates.some((candidate) => {
      try { return new URL(candidate).hostname.replace(/^www\./i, "").toLowerCase() === config.webmaster.target_host; }
      catch { return false; }
    });
  });
  if (!host?.host_id) throw new Error(`Сайт ${config.webmaster.target_host} не найден в Вебмастере`);
  return { base, userId: user.user_id, host };
};

const fetchPopularQueries = async (context, token) => {
  const params = new URLSearchParams();
  params.set("order_by", "TOTAL_SHOWS");
  params.append("query_indicator", "TOTAL_SHOWS");
  params.append("query_indicator", "TOTAL_CLICKS");
  params.append("query_indicator", "AVG_SHOW_POSITION");
  params.set("device_type_indicator", "ALL");
  params.set("limit", String(config.webmaster.popular_queries_limit || 100));
  const payload = await apiRequest(
    `${context.base}/user/${encodeURIComponent(context.userId)}/hosts/${encodeURIComponent(context.host.host_id)}/search-queries/popular?${params}`,
    token,
    "Webmaster popular queries",
  );
  return (Array.isArray(payload.queries) ? payload.queries : []).map((item) => ({
    query: safeText(item?.query_text, [token]),
    shows: asNumber(item?.indicators?.TOTAL_SHOWS),
    clicks: asNumber(item?.indicators?.TOTAL_CLICKS),
    avg_position: round(item?.indicators?.AVG_SHOW_POSITION),
  }));
};

const fetchInSearchSamples = async (context, token) => {
  const limit = Math.min(100, Math.max(1, Number(config.webmaster.in_search_page_limit || 100)));
  const samples = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total && offset < 50000) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    const payload = await apiRequest(
      `${context.base}/user/${encodeURIComponent(context.userId)}/hosts/${encodeURIComponent(context.host.host_id)}/search-urls/in-search/samples?${params}`,
      token,
      "Webmaster pages in search",
    );
    const batch = Array.isArray(payload.samples) ? payload.samples : [];
    total = asNumber(payload.count);
    samples.push(...batch.map((sample) => ({
      url: safeText(sample?.url, [token], 300),
      path: normalizePath(sample?.url),
      last_access: sample?.last_access || "",
      title: safeText(sample?.title, [token]),
    })));
    if (batch.length < limit) break;
    offset += batch.length;
  }
  return { count: Number.isFinite(total) ? total : samples.length, samples };
};

const fetchImportantUrls = async (context, token) => {
  try {
    const payload = await apiRequest(
      `${context.base}/user/${encodeURIComponent(context.userId)}/hosts/${encodeURIComponent(context.host.host_id)}/important-urls`,
      token,
      "Webmaster important URLs",
    );
    return (Array.isArray(payload.urls) ? payload.urls : []).map((item) => ({
      url: safeText(item?.url, [token], 300),
      path: normalizePath(item?.url),
      update_date: item?.update_date || "",
      indexing_status: item?.indexing_status || null,
      search_status: item?.search_status || null,
    }));
  } catch (error) {
    return [{ unavailable: true, error: safeText(error?.message, [token]) }];
  }
};

const aggregateQueryStatistics = (rows, token, targetPath) => {
  const queries = [];
  for (const row of rows) {
    const query = safeText(row?.text_indicator?.value, [token]);
    const complementaryUrl = safeText(row?.popular_complementary_indicator?.value, [token], 300);
    if (complementaryUrl && normalizePath(complementaryUrl) !== targetPath) continue;
    const perDate = new Map();
    for (const statistic of Array.isArray(row?.statistics) ? row.statistics : []) {
      const date = String(statistic?.date || "");
      const current = perDate.get(date) || {};
      current[String(statistic?.field || "").toUpperCase()] = asNumber(statistic?.value);
      perDate.set(date, current);
    }
    let shows = 0;
    let clicks = 0;
    let weightedPosition = 0;
    let positionWeight = 0;
    for (const values of perDate.values()) {
      const impressions = asNumber(values.IMPRESSIONS);
      const position = asNumber(values.POSITION);
      shows += impressions;
      clicks += asNumber(values.CLICKS);
      if (position > 0) {
        const weight = impressions || 1;
        weightedPosition += position * weight;
        positionWeight += weight;
      }
    }
    queries.push({
      query,
      shows: round(shows),
      clicks: round(clicks),
      ctr: percentNumber(clicks, shows),
      avg_position: positionWeight ? round(weightedPosition / positionWeight) : 0,
    });
  }
  queries.sort((a, b) => b.shows - a.shows || b.clicks - a.clicks || a.query.localeCompare(b.query, "ru"));
  const shows = queries.reduce((sum, item) => sum + item.shows, 0);
  const clicks = queries.reduce((sum, item) => sum + item.clicks, 0);
  const positionWeight = queries.reduce((sum, item) => sum + (item.avg_position > 0 ? (item.shows || 1) : 0), 0);
  const weightedPosition = queries.reduce((sum, item) => sum + (item.avg_position > 0 ? item.avg_position * (item.shows || 1) : 0), 0);
  return {
    shows: round(shows),
    clicks: round(clicks),
    ctr: percentNumber(clicks, shows),
    avg_position: positionWeight ? round(weightedPosition / positionWeight) : 0,
    queries: queries.slice(0, 50),
  };
};

const fetchQueriesForPage = async (context, token, page) => {
  const payload = await apiRequest(
    `${context.base}/user/${encodeURIComponent(context.userId)}/hosts/${encodeURIComponent(context.host.host_id)}/query-analytics/list`,
    token,
    `Webmaster query analytics ${page.path}`,
    {
      method: "POST",
      body: {
        offset: 0,
        limit: Math.min(500, Math.max(1, Number(config.webmaster.query_analytics_limit || 500))),
        device_type_indicator: "ALL",
        search_location: "WEB_LOCATION",
        text_indicator: "QUERY",
        filters: {
          text_filters: [{
            text_indicator: "URL",
            operation: "TEXT_CONTAINS",
            value: page.path,
          }],
        },
      },
    },
  );
  const rows = Array.isArray(payload.text_indicator_to_statistics) ? payload.text_indicator_to_statistics : [];
  return aggregateQueryStatistics(rows, token, page.path);
};

const fetchWebmaster = async (token) => {
  const context = await getWebmasterContext(token);
  const [popularQueries, inSearch, importantUrls] = await Promise.all([
    fetchPopularQueries(context, token),
    fetchInSearchSamples(context, token),
    fetchImportantUrls(context, token),
  ]);
  const inSearchByPath = new Map(inSearch.samples.map((item) => [item.path, item]));
  const availableImportantUrls = importantUrls.filter((item) => !item.unavailable);
  const importantByPath = new Map(availableImportantUrls.map((item) => [item.path, item]));
  const pageQueries = new Map();
  for (const page of trackedPages) {
    pageQueries.set(page.path, await fetchQueriesForPage(context, token, page));
  }
  const pages = trackedPages.map((page) => {
    const sample = inSearchByPath.get(page.path) || null;
    const important = importantByPath.get(page.path) || null;
    const searchStatus = important?.search_status || null;
    const excludedStatus = String(searchStatus?.excluded_url_status || "");
    const queryStats = pageQueries.get(page.path) || { shows: 0, clicks: 0, ctr: 0, avg_position: 0, queries: [] };
    return {
      content_id: page.content_id,
      path: page.path,
      absolute_url: absoluteUrl(page.path),
      in_search: Boolean(sample || searchStatus?.searchable),
      in_search_sample: sample,
      important_url_monitored: Boolean(important),
      robot_http_status: important?.indexing_status?.status || "",
      robot_http_code: asNumber(important?.indexing_status?.http_code) || "",
      robot_access_date: important?.indexing_status?.access_date || sample?.last_access || "",
      excluded_url_status: excludedStatus,
      target_url: safeText(searchStatus?.target_url || "", [token], 300),
      canonical_or_duplicate_issue: ["NOT_CANONICAL", "DUPLICATE"].includes(excludedStatus),
      ...queryStats,
    };
  });
  return {
    target_host: config.webmaster.target_host,
    verified: Boolean(context.host.verified),
    host_data_status: context.host.host_data_status || "",
    query_period: "последние 14 дней",
    popular_queries: popularQueries,
    in_search_samples_count: inSearch.count,
    important_urls_count: availableImportantUrls.length,
    important_urls_available: !importantUrls.some((item) => item.unavailable),
    important_urls_error: importantUrls.find((item) => item.unavailable)?.error || "",
    pages,
  };
};

const actionEvent = (goal = {}) => goal.type === "action"
  ? String((goal.conditions || []).find((item) => typeof item?.url === "string")?.url || "").trim()
  : "";

const fetchMetrica = async (token, date1, date2) => {
  const management = config.metrica.management_api_base;
  const counterId = String(config.metrica.counter_id);
  const goalsPayload = await apiRequest(`${management}/counter/${counterId}/goals`, token, "Metrica management");
  const goals = Array.isArray(goalsPayload.goals) ? goalsPayload.goals : [];
  const goalIds = new Map(goals.filter((goal) => goal.type === "action").map((goal) => [actionEvent(goal), Number(goal.id)]));
  const missing = config.metrica.goal_events.filter((event) => !goalIds.get(event));
  if (missing.length) throw new Error(`В Метрике отсутствуют цели: ${missing.join(", ")}`);

  const metricDefinitions = [
    { key: "visits", expression: "ym:s:visits" },
    { key: "pageviews", expression: "ym:s:pageviews" },
    { key: "users", expression: "ym:s:users" },
    ...config.metrica.goal_events.map((event) => ({ key: event, expression: `ym:s:goal${goalIds.get(event)}reaches` })),
  ];
  if (metricDefinitions.length > 20) throw new Error(`Слишком много метрик для одного запроса Метрики: ${metricDefinitions.length}`);
  const params = new URLSearchParams({
    ids: counterId,
    date1,
    date2,
    dimensions: "ym:s:startURLPath",
    metrics: metricDefinitions.map((item) => item.expression).join(","),
    limit: "1000",
    accuracy: "full",
  });
  const payload = await apiRequest(`${config.metrica.reporting_api_base}/data?${params}`, token, "Metrica reporting");
  const rows = (Array.isArray(payload.data) ? payload.data : []).map((row) => {
    const rawPath = String(row?.dimensions?.[0]?.name || row?.dimensions?.[0]?.id || "");
    const values = Object.fromEntries(metricDefinitions.map((definition, index) => [definition.key, asNumber(row?.metrics?.[index])]));
    return { path: normalizePath(rawPath), ...values };
  }).filter((row) => trackedPaths.has(row.path));
  return {
    counter_id: counterId,
    date1,
    date2,
    contains_sensitive_data: Boolean(payload.contains_sensitive_data),
    sampled: Boolean(payload.sampled),
    rows,
  };
};

const extractHtmlAttribute = (html, pattern) => html.match(pattern)?.[1]?.trim() || "";
const fetchLivePage = async (page) => {
  const url = new URL(page.path, origin);
  url.searchParams.set("seo_snapshot", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const html = await response.text();
  const canonical = extractHtmlAttribute(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)
    || extractHtmlAttribute(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i);
  const robots = extractHtmlAttribute(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
  const expectedCanonical = absoluteUrl(page.path);
  let canonicalMatches = false;
  try { canonicalMatches = new URL(canonical, origin).toString() === expectedCanonical; } catch { canonicalMatches = false; }
  return {
    path: page.path,
    http_status: response.status,
    final_url: response.url.split("?")[0],
    title: safeText(title),
    canonical,
    canonical_matches: canonicalMatches,
    noindex: /(?:^|[,\s])noindex(?:[,\s]|$)/i.test(robots),
    assistant_assets_present: /legal-assistant(?:-model)?\.mjs|data-legal-assistant|legal-assistant__/i.test(html),
  };
};

const buildStatistics = ({ webmaster, metrica, livePages, date1, date2 }) => {
  const webmasterByPath = new Map(webmaster.pages.map((page) => [page.path, page]));
  const metricaByPath = new Map(metrica.rows.map((row) => [row.path, row]));
  const liveByPath = new Map(livePages.map((page) => [page.path, page]));
  return trackedPages.map((page) => {
    const search = webmasterByPath.get(page.path) || {};
    const behavior = metricaByPath.get(page.path) || {};
    const live = liveByPath.get(page.path) || null;
    const observationBase = page.type === "Услуга" ? asNumber(behavior.visits) : asNumber(behavior.publication_view);
    const contact = asNumber(behavior.contact_conversion);
    return {
      period: `${date1}—${date2}`,
      content_id: page.content_id,
      cluster_id: page.cluster_id || "",
      url: page.path,
      title: page.title,
      type: page.type,
      published_at: page.published_at || "",
      in_search: Boolean(search.in_search),
      important_url_monitored: Boolean(search.important_url_monitored),
      excluded_url_status: search.excluded_url_status || "",
      target_url: search.target_url || "",
      robot_http_code: search.robot_http_code || "",
      search_shows: asNumber(search.shows),
      search_clicks: asNumber(search.clicks),
      search_ctr: asNumber(search.ctr),
      search_avg_position: asNumber(search.avg_position),
      search_queries: search.queries || [],
      visits: asNumber(behavior.visits),
      pageviews: asNumber(behavior.pageviews),
      users: asNumber(behavior.users),
      publication_view: asNumber(behavior.publication_view),
      scroll_50: asNumber(behavior.publication_scroll_50),
      scroll_90: asNumber(behavior.publication_scroll_90),
      active_60s: asNumber(behavior.publication_active_60s),
      faq_open: asNumber(behavior.publication_faq_open),
      related_click: asNumber(behavior.publication_related_click),
      messenger_intent: asNumber(behavior.publication_messenger_intent),
      cta_view: asNumber(behavior.cta_view),
      cta_click: asNumber(behavior.cta_click),
      messenger_dialog_open: asNumber(behavior.messenger_dialog_open),
      button_action: asNumber(behavior.button_action),
      contact_conversion: contact,
      telegram: asNumber(behavior.contact_telegram),
      whatsapp: asNumber(behavior.contact_whatsapp),
      conversion_to_chat: percentText(contact, observationBase || asNumber(behavior.visits)),
      live,
      decision: observationBase >= 30
        ? "Данных достаточно для первичного наблюдения; решение требует сравнения с предыдущей версией и поисковым спросом."
        : "Наблюдение: выборка недостаточна, страницу не менять.",
    };
  });
};

const run = async () => {
  const webmasterToken = String(process.env.YANDEX_WEBMASTER_TOKEN || "").trim();
  const metricaToken = String(process.env.YANDEX_METRICA_OAUTH_TOKEN || "").trim();
  if (!webmasterToken) throw new Error("Не передан YANDEX_WEBMASTER_TOKEN");
  if (!metricaToken) throw new Error("Не передан YANDEX_METRICA_OAUTH_TOKEN");
  console.log(`::add-mask::${webmasterToken}`);
  console.log(`::add-mask::${metricaToken}`);

  const date2 = String(args.date2 || today);
  const date1 = String(args.date1 || dateMinusDays(now, config.metrica.lookback_days - 1));
  const [webmaster, metrica, livePages] = await Promise.all([
    fetchWebmaster(webmasterToken),
    fetchMetrica(metricaToken, date1, date2),
    Promise.all(clusterPages.map(fetchLivePage)),
  ]);
  const statistics = buildStatistics({ webmaster, metrica, livePages, date1, date2 });
  const clusters = clusterDefinitions.map((cluster) => {
    const paths = new Set((cluster.pages || []).map((page) => normalizePath(page.path)));
    const pages = statistics.filter((item) => paths.has(item.url));
    return {
      id: cluster.id,
      name: cluster.name,
      pages,
      totals: {
        pages: pages.length,
        pages_in_search: pages.filter((page) => page.in_search).length,
        shows: pages.reduce((sum, page) => sum + page.search_shows, 0),
        clicks: pages.reduce((sum, page) => sum + page.search_clicks, 0),
        visits: pages.reduce((sum, page) => sum + page.visits, 0),
        cta_clicks: pages.reduce((sum, page) => sum + page.cta_click, 0),
        messenger_dialog_opens: pages.reduce((sum, page) => sum + page.messenger_dialog_open, 0),
        contact_conversions: pages.reduce((sum, page) => sum + page.contact_conversion, 0),
      },
    };
  });
  const report = {
    generated_at: now.toISOString(),
    period: { date1, date2 },
    webmaster,
    metrica,
    live_pages: livePages,
    publications: statistics,
    clusters,
    rules: {
      no_decision_below_observations: 30,
      wordstat_not_called_on_feedback_schedule: true,
      conclusions_require_version_comparison: true,
      service_pages_included: true,
      per_page_webmaster_queries_included: true,
    },
    safety: { raw_responses_saved: false, tokens_saved: false, personal_data_saved: false },
  };

  await writeJson(join(stateDir, "feedback-latest.json"), report);
  await writeJson(join(stateDir, "history", `${today}.json"`.replace('"', "")), report);
  await writeCsv(join(stateDir, "webmaster-popular-queries.csv"), ["Запрос", "Показы", "Клики", "Средняя позиция"],
    webmaster.popular_queries.map((item) => [item.query, item.shows, item.clicks, item.avg_position || ""]));
  await writeCsv(join(stateDir, "webmaster-page-queries.csv"), ["Контент ID", "URL", "Запрос", "Показы", "Клики", "CTR", "Средняя позиция"],
    statistics.flatMap((item) => item.search_queries.map((query) => [
      item.content_id, item.url, query.query, query.shows, query.clicks, query.ctr ? `${query.ctr.toFixed(2)}%` : "", query.avg_position || "",
    ])));
  const contentHeaders = [
    "Период", "Контент ID", "URL", "Тема", "Тип материала", "Дата публикации", "В поиске Яндекса", "Причина исключения",
    "Показы", "Клики", "CTR", "Средняя позиция", "Визиты", "Просмотры страниц", "Просмотры статьи",
    "Скролл 50%", "Скролл 90%", "Активное чтение 60с", "Открытия FAQ", "Клики по связанным материалам",
    "Намерение написать", "Просмотры CTA", "Клики CTA", "Открытия выбора мессенджера", "Все кнопочные действия",
    "Telegram", "WhatsApp", "Всего переходов в чат", "Конверсия в чат", "Решение / что изменить",
  ];
  const contentRows = statistics.map((item) => [
    item.period, item.content_id, item.url, item.title, item.type, item.published_at, item.in_search ? "Да" : "Нет", item.excluded_url_status,
    item.search_shows, item.search_clicks, item.search_shows ? `${item.search_ctr.toFixed(2)}%` : "", item.search_avg_position || "",
    item.visits, item.pageviews, item.publication_view, item.scroll_50, item.scroll_90, item.active_60s, item.faq_open, item.related_click,
    item.messenger_intent, item.cta_view, item.cta_click, item.messenger_dialog_open, item.button_action,
    item.telegram, item.whatsapp, item.contact_conversion, item.conversion_to_chat, item.decision,
  ]);
  await writeCsv(join(stateDir, "sheet-content-statistics.csv"), contentHeaders, contentRows);
  await writeCsv(join(stateDir, "sheet-cluster-statistics.csv"), [
    "Кластер", ...contentHeaders, "Live HTTP", "Canonical совпадает", "Noindex", "Помощник присутствует",
  ], clusters.flatMap((cluster) => cluster.pages.map((item) => [
    cluster.name, ...contentRows[statistics.indexOf(item)], item.live?.http_status || "", item.live?.canonical_matches ? "Да" : "Нет",
    item.live?.noindex ? "Да" : "Нет", item.live?.assistant_assets_present ? "Да" : "Нет",
  ])));
  await writeCsv(join(stateDir, "sheet-content-contact-signals.csv"), [
    "Период", "Контент ID", "URL", "Просмотры CTA", "Клики CTA", "Открытия выбора мессенджера", "Намерение написать",
    "Telegram", "WhatsApp", "Всего переходов в чат", "Примечание",
  ], statistics.map((item) => [
    item.period, item.content_id, item.url, item.cta_view, item.cta_click, item.messenger_dialog_open, item.messenger_intent,
    item.telegram, item.whatsapp, item.contact_conversion,
    "Сигналы Метрики не равны подтверждённому обращению клиента; фактическое обращение фиксируется отдельно.",
  ]));

  const primaryCluster = clusters[0];
  const summary = [
    "# SEO feedback snapshot",
    "",
    `- Период Метрики: ${date1}—${date2}`,
    `- Запросы Вебмастера по страницам: ${webmaster.query_period}`,
    `- Страниц в общем отчёте: ${statistics.length}`,
    `- Страниц контрольного кластера: ${primaryCluster?.totals.pages || 0}`,
    `- Страниц кластера в поиске: ${primaryCluster?.totals.pages_in_search || 0}`,
    `- Показы кластера: ${primaryCluster?.totals.shows || 0}`,
    `- Клики кластера: ${primaryCluster?.totals.clicks || 0}`,
    `- Визиты кластера: ${primaryCluster?.totals.visits || 0}`,
    `- Переходы к контакту из кластера: ${primaryCluster?.totals.contact_conversions || 0}`,
    "- Коммерческая страница /uslugi/vozvrat-deneg/ включена в отчёт.",
    "- Wordstat при feedback-сборе не вызывается.",
    "- При малой выборке страницы автоматически не переписываются.",
    "",
  ].join("\n");
  await writeFile(join(stateDir, "summary.md"), summary, "utf8");
  console.log(`SEO feedback v2: pages=${statistics.length}, cluster_pages=${primaryCluster?.totals.pages || 0}, queries=${webmaster.popular_queries.length}`);
};

await mkdir(stateDir, { recursive: true });
await run();
