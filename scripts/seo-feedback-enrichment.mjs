import { createSign } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "config", "seo-data-pipeline.json"), "utf8"));
const stateDir = resolve(String(process.env.SEO_STATE_DIR || join(root, "reports", "seo-data")));
const reportPath = join(stateDir, "feedback-latest.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const origin = `https://${config.webmaster.target_host}`;
const goalEvents = Array.isArray(config?.metrica?.goal_events) ? config.metrica.goal_events : [];

const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value, digits = 2) => Number(asNumber(value).toFixed(digits));
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
const trackedPages = Array.isArray(report.publications) ? report.publications : [];
const trackedPaths = new Set(trackedPages.map((page) => normalizePath(page.url)));

const safeText = (value, limit = 500) => String(value ?? "")
  .replace(/[\r\n\t]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, limit);
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const writeCsv = async (path, headers, rows) => {
  await mkdir(dirname(path), { recursive: true });
  const body = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  await writeFile(path, `\uFEFF${body}\n`, "utf8");
};
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const percent = (clicks, impressions) => impressions > 0 ? round((clicks / impressions) * 100) : 0;
const combinedPosition = (first, second) => {
  const firstWeight = asNumber(first.impressions ?? first.shows);
  const secondWeight = asNumber(second.impressions ?? second.shows);
  const totalWeight = firstWeight + secondWeight;
  if (!totalWeight) return 0;
  return round(((asNumber(first.position ?? first.avg_position) * firstWeight)
    + (asNumber(second.position ?? second.avg_position) * secondWeight)) / totalWeight);
};

const apiJson = async (url, options = {}, label = "API") => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    const message = safeText(payload?.error?.message || payload?.error_message || payload?.message || response.statusText);
    throw new Error(`${label} ${response.status}: ${message}`);
  }
  return payload;
};

const yandexApi = async (url, token, label) => apiJson(url, {
  headers: { Authorization: `OAuth ${token}`, Accept: "application/json" },
}, label);

const actionEvent = (goal = {}) => goal.type === "action"
  ? String((goal.conditions || []).find((item) => typeof item?.url === "string")?.url || "").trim()
  : "";

const collectExactMetrica = async () => {
  const token = String(process.env.YANDEX_METRICA_OAUTH_TOKEN || "").trim();
  if (!token) {
    return {
      available: false,
      status: "not_configured",
      page_attribution: "unavailable",
      goal_attribution: "unavailable",
      rows: [],
      error: "Не передан YANDEX_METRICA_OAUTH_TOKEN",
    };
  }
  console.log(`::add-mask::${token}`);
  const counterId = String(config.metrica.counter_id);
  const date1 = report?.period?.date1;
  const date2 = report?.period?.date2;
  const managementBase = config.metrica.management_api_base;
  const reportingBase = config.metrica.reporting_api_base;
  const goalsPayload = await yandexApi(`${managementBase}/counter/${counterId}/goals`, token, "Metrica management");
  const goals = Array.isArray(goalsPayload.goals) ? goalsPayload.goals : [];
  const goalIds = new Map(goals.filter((goal) => goal.type === "action")
    .map((goal) => [actionEvent(goal), Number(goal.id)]));
  const missingGoals = goalEvents.filter((event) => !goalIds.get(event));

  const pageParams = new URLSearchParams({
    ids: counterId,
    date1,
    date2,
    dimensions: "ym:pv:URLPath",
    metrics: "ym:pv:pageviews,ym:pv:users",
    limit: "10000",
    accuracy: "full",
  });
  const pagePayload = await yandexApi(`${reportingBase}/data?${pageParams}`, token, "Metrica page report");
  const pageRows = (Array.isArray(pagePayload.data) ? pagePayload.data : []).map((row) => ({
    path: normalizePath(row?.dimensions?.[0]?.name || row?.dimensions?.[0]?.id || ""),
    pageviews: asNumber(row?.metrics?.[0]),
    users: asNumber(row?.metrics?.[1]),
  })).filter((row) => trackedPaths.has(row.path));
  const pageByPath = new Map(pageRows.map((row) => [row.path, row]));

  let eventRows = [];
  let goalAttribution = "event_url";
  let goalError = "";
  const availableGoalDefinitions = goalEvents
    .filter((event) => goalIds.get(event))
    .map((event) => ({ key: event, expression: `ym:ev:goal${goalIds.get(event)}reaches` }));
  try {
    if (availableGoalDefinitions.length) {
      const eventParams = new URLSearchParams({
        ids: counterId,
        date1,
        date2,
        dimensions: "ym:ep:eventURLPath",
        metrics: availableGoalDefinitions.map((item) => item.expression).join(","),
        limit: "10000",
        accuracy: "full",
      });
      const eventPayload = await yandexApi(`${reportingBase}/data?${eventParams}`, token, "Metrica event report");
      eventRows = (Array.isArray(eventPayload.data) ? eventPayload.data : []).map((row) => {
        const values = Object.fromEntries(availableGoalDefinitions.map((definition, index) => [
          definition.key,
          asNumber(row?.metrics?.[index]),
        ]));
        return {
          path: normalizePath(row?.dimensions?.[0]?.name || row?.dimensions?.[0]?.id || ""),
          ...values,
        };
      }).filter((row) => trackedPaths.has(row.path));
    }
  } catch (error) {
    goalAttribution = "landing_page_fallback";
    goalError = safeText(error?.message);
  }

  const eventByPath = new Map(eventRows.map((row) => [row.path, row]));
  const legacyRows = Array.isArray(report?.metrica?.rows) ? report.metrica.rows : [];
  const landingByPath = new Map(legacyRows.map((row) => [normalizePath(row.path), row]));
  const rows = [...trackedPaths].map((path) => {
    const page = pageByPath.get(path) || {};
    const event = eventByPath.get(path) || {};
    const landing = landingByPath.get(path) || {};
    const goalSource = goalAttribution === "event_url" ? event : landing;
    const goalsForPath = Object.fromEntries(goalEvents.map((goal) => [goal, asNumber(goalSource[goal])]));
    return {
      path,
      entrance_visits: asNumber(landing.visits),
      entrance_users: asNumber(landing.users),
      pageviews: asNumber(page.pageviews),
      users: asNumber(page.users),
      ...goalsForPath,
    };
  });

  return {
    available: true,
    status: goalError ? "partial" : "ok",
    counter_id: counterId,
    date1,
    date2,
    page_attribution: "viewed_page_url",
    goal_attribution: goalAttribution,
    goal_error: goalError,
    missing_goals: missingGoals,
    sampled: Boolean(pagePayload.sampled),
    contains_sensitive_data: Boolean(pagePayload.contains_sensitive_data),
    rows,
  };
};

const base64Url = (value) => Buffer.from(value).toString("base64url");
const parseServiceAccount = () => {
  const direct = String(process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON || "").trim();
  const encoded = String(process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_BASE64 || "").trim();
  const raw = direct || (encoded ? Buffer.from(encoded, "base64").toString("utf8") : "");
  if (!raw) return null;
  const credentials = JSON.parse(raw);
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("В секрете Google отсутствуют client_email или private_key");
  }
  return credentials;
};

const getGoogleAccessToken = async (credentials) => {
  const tokenUri = credentials.token_uri || "https://oauth2.googleapis.com/token";
  const nowSeconds = Math.floor(Date.now() / 1000);
  const encodedHeader = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const encodedClaims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: tokenUri,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const unsigned = `${encodedHeader}.${encodedClaims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key).toString("base64url")}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const payload = await apiJson(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  }, "Google OAuth");
  if (!payload.access_token) throw new Error("Google OAuth не вернул access_token");
  return payload.access_token;
};

const selectGoogleProperty = (sites, requestedSiteUrl) => {
  const available = (Array.isArray(sites) ? sites : []).filter((site) => site?.siteUrl);
  if (requestedSiteUrl) {
    const exact = available.find((site) => site.siteUrl === requestedSiteUrl);
    if (!exact) throw new Error(`У сервисного аккаунта нет доступа к ${requestedSiteUrl}`);
    return exact;
  }
  const domainProperty = `sc-domain:${config.webmaster.target_host}`;
  const preferred = available.find((site) => site.siteUrl === domainProperty);
  if (preferred) return preferred;
  return available.find((site) => {
    try { return new URL(site.siteUrl).hostname.replace(/^www\./i, "") === config.webmaster.target_host; }
    catch { return false; }
  }) || null;
};

const collectGoogleSearchConsole = async () => {
  let credentials;
  try {
    credentials = parseServiceAccount();
  } catch (error) {
    return { available: false, status: "invalid_credentials", error: safeText(error?.message), pages: [] };
  }
  if (!credentials) {
    return {
      available: false,
      status: "not_configured",
      error: "Нужен секрет GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON и доступ сервисного аккаунта к ресурсу Search Console",
      pages: [],
    };
  }

  try {
    const token = await getGoogleAccessToken(credentials);
    console.log(`::add-mask::${token}`);
    const sitesPayload = await apiJson("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }, "Search Console sites");
    const requestedSiteUrl = String(process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || "").trim();
    const property = selectGoogleProperty(sitesPayload.siteEntry, requestedSiteUrl);
    if (!property) throw new Error(`Не найден ресурс Search Console для ${config.webmaster.target_host}`);

    const queryEndpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property.siteUrl)}/searchAnalytics/query`;
    const query = async (body) => apiJson(queryEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, "Search Console Search Analytics");

    const common = {
      startDate: report?.period?.date1,
      endDate: report?.period?.date2,
      type: "web",
      dataState: "final",
      aggregationType: "auto",
    };
    const pagePayload = await query({ ...common, dimensions: ["page"], rowLimit: 25000 });
    const pageRows = Array.isArray(pagePayload.rows) ? pagePayload.rows : [];

    const queryRows = [];
    for (let startRow = 0; startRow < 50000; startRow += 25000) {
      const payload = await query({
        ...common,
        dimensions: ["page", "query"],
        rowLimit: 25000,
        startRow,
      });
      const batch = Array.isArray(payload.rows) ? payload.rows : [];
      queryRows.push(...batch);
      if (batch.length < 25000) break;
    }

    const queryByPath = new Map();
    for (const row of queryRows) {
      const path = normalizePath(row?.keys?.[0] || "");
      if (!trackedPaths.has(path)) continue;
      const values = queryByPath.get(path) || [];
      values.push({
        query: safeText(row?.keys?.[1]),
        clicks: asNumber(row?.clicks),
        impressions: asNumber(row?.impressions),
        ctr: round(asNumber(row?.ctr) * 100),
        position: round(row?.position),
      });
      queryByPath.set(path, values);
    }
    for (const values of queryByPath.values()) {
      values.sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || a.query.localeCompare(b.query, "ru"));
    }

    const pageByPath = new Map(pageRows.map((row) => {
      const path = normalizePath(row?.keys?.[0] || "");
      return [path, {
        path,
        clicks: asNumber(row?.clicks),
        impressions: asNumber(row?.impressions),
        ctr: round(asNumber(row?.ctr) * 100),
        position: round(row?.position),
      }];
    }).filter(([path]) => trackedPaths.has(path)));

    const pages = [...trackedPaths].map((path) => ({
      path,
      clicks: asNumber(pageByPath.get(path)?.clicks),
      impressions: asNumber(pageByPath.get(path)?.impressions),
      ctr: asNumber(pageByPath.get(path)?.ctr),
      position: asNumber(pageByPath.get(path)?.position),
      queries: (queryByPath.get(path) || []).slice(0, 100),
    }));

    const popularQueriesMap = new Map();
    for (const page of pages) {
      for (const item of page.queries) {
        const current = popularQueriesMap.get(item.query) || {
          query: item.query,
          clicks: 0,
          impressions: 0,
          weighted_position: 0,
        };
        current.clicks += item.clicks;
        current.impressions += item.impressions;
        current.weighted_position += item.position * (item.impressions || 1);
        popularQueriesMap.set(item.query, current);
      }
    }
    const popular_queries = [...popularQueriesMap.values()].map((item) => ({
      query: item.query,
      clicks: round(item.clicks),
      impressions: round(item.impressions),
      ctr: percent(item.clicks, item.impressions),
      position: item.impressions ? round(item.weighted_position / item.impressions) : 0,
    })).sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks).slice(0, 100);

    return {
      available: true,
      status: "ok",
      site_url: property.siteUrl,
      permission_level: property.permissionLevel || "",
      period: { date1: common.startDate, date2: common.endDate },
      data_state: "final",
      pages,
      popular_queries,
      limitations: [
        "Search Console API возвращает верхние строки и не гарантирует полный перечень низкочастотных запросов.",
        "Даты Search Console рассчитываются в часовом поясе Pacific Time.",
      ],
    };
  } catch (error) {
    return {
      available: false,
      status: "api_error",
      error: safeText(error?.message),
      pages: [],
    };
  }
};

const [exactMetrica, google] = await Promise.all([
  collectExactMetrica(),
  collectGoogleSearchConsole(),
]);

const metricaByPath = new Map((exactMetrica.rows || []).map((row) => [normalizePath(row.path), row]));
const googleByPath = new Map((google.pages || []).map((row) => [normalizePath(row.path), row]));

report.metrica = {
  ...report.metrica,
  legacy_attribution: {
    dimension: "ym:s:startURLPath",
    meaning: "страница входа в визит",
  },
  exact_attribution: exactMetrica,
  rows: exactMetrica.available ? exactMetrica.rows : report.metrica.rows,
};
report.google_search_console = google;

for (const page of trackedPages) {
  const path = normalizePath(page.url);
  const behavior = metricaByPath.get(path) || {};
  const googlePage = googleByPath.get(path) || {};
  if (exactMetrica.available) {
    page.entrance_visits = asNumber(behavior.entrance_visits);
    page.visits = asNumber(behavior.entrance_visits);
    page.pageviews = asNumber(behavior.pageviews);
    page.users = asNumber(behavior.users);
    for (const event of goalEvents) page[event] = asNumber(behavior[event]);
    page.publication_view = asNumber(behavior.publication_view);
    page.scroll_50 = asNumber(behavior.publication_scroll_50);
    page.scroll_90 = asNumber(behavior.publication_scroll_90);
    page.active_60s = asNumber(behavior.publication_active_60s);
    page.faq_open = asNumber(behavior.publication_faq_open);
    page.related_click = asNumber(behavior.publication_related_click);
    page.messenger_intent = asNumber(behavior.publication_messenger_intent);
    page.cta_view = asNumber(behavior.cta_view);
    page.cta_click = asNumber(behavior.cta_click);
    page.messenger_dialog_open = asNumber(behavior.messenger_dialog_open);
    page.button_action = asNumber(behavior.button_action);
    page.contact_conversion = asNumber(behavior.contact_conversion);
    page.telegram = asNumber(behavior.contact_telegram);
    page.whatsapp = asNumber(behavior.contact_whatsapp);
  }
  page.metrica_page_attribution = exactMetrica.page_attribution;
  page.metrica_goal_attribution = exactMetrica.goal_attribution;

  page.google_impressions = asNumber(googlePage.impressions);
  page.google_clicks = asNumber(googlePage.clicks);
  page.google_ctr = asNumber(googlePage.ctr);
  page.google_avg_position = asNumber(googlePage.position);
  page.google_queries = googlePage.queries || [];

  const yandex = {
    impressions: asNumber(page.search_shows),
    clicks: asNumber(page.search_clicks),
    position: asNumber(page.search_avg_position),
  };
  const googleStats = {
    impressions: page.google_impressions,
    clicks: page.google_clicks,
    position: page.google_avg_position,
  };
  page.combined_search_impressions = yandex.impressions + googleStats.impressions;
  page.combined_search_clicks = yandex.clicks + googleStats.clicks;
  page.combined_search_ctr = percent(page.combined_search_clicks, page.combined_search_impressions);
  page.combined_search_avg_position = combinedPosition(yandex, googleStats);
  const observationBase = page.type === "Услуга" ? asNumber(page.pageviews) : asNumber(page.publication_view);
  const contact = asNumber(page.contact_conversion);
  page.conversion_to_chat = observationBase > 0 ? `${percent(contact, observationBase).toFixed(2)}%` : "";
  page.decision = observationBase >= 30 || page.combined_search_impressions >= 30
    ? "Данных достаточно для первичного наблюдения; изменение страницы допускается только после сравнения поискового сниппета, поведения и предыдущей версии."
    : "Наблюдение: выборка недостаточна, страницу не менять.";
}

const publicationByPath = new Map(trackedPages.map((page) => [normalizePath(page.url), page]));
for (const cluster of Array.isArray(report.clusters) ? report.clusters : []) {
  const sourcePages = Array.isArray(cluster.pages) ? cluster.pages : [];
  const pages = sourcePages.map((page) => publicationByPath.get(normalizePath(page.url)) || page);
  cluster.pages = pages;
  cluster.totals = {
    ...cluster.totals,
    pages: pages.length,
    pages_in_search: pages.filter((page) => page.in_search).length,
    yandex_shows: pages.reduce((sum, page) => sum + asNumber(page.search_shows), 0),
    yandex_clicks: pages.reduce((sum, page) => sum + asNumber(page.search_clicks), 0),
    google_impressions: pages.reduce((sum, page) => sum + asNumber(page.google_impressions), 0),
    google_clicks: pages.reduce((sum, page) => sum + asNumber(page.google_clicks), 0),
    shows: pages.reduce((sum, page) => sum + asNumber(page.combined_search_impressions), 0),
    clicks: pages.reduce((sum, page) => sum + asNumber(page.combined_search_clicks), 0),
    visits: pages.reduce((sum, page) => sum + asNumber(page.entrance_visits ?? page.visits), 0),
    pageviews: pages.reduce((sum, page) => sum + asNumber(page.pageviews), 0),
    cta_clicks: pages.reduce((sum, page) => sum + asNumber(page.cta_click), 0),
    messenger_dialog_opens: pages.reduce((sum, page) => sum + asNumber(page.messenger_dialog_open), 0),
    contact_conversions: pages.reduce((sum, page) => sum + asNumber(page.contact_conversion), 0),
  };
}

report.rules = {
  ...report.rules,
  metrica_page_metrics_use_viewed_page_url: exactMetrica.page_attribution === "viewed_page_url",
  metrica_goal_metrics_use_event_url: exactMetrica.goal_attribution === "event_url",
  google_search_console_optional_until_authorized: true,
  unified_search_totals_include_yandex_and_google: true,
};
report.safety = {
  ...report.safety,
  google_private_key_saved: false,
  google_access_token_saved: false,
};

await writeJson(reportPath, report);
await writeJson(join(stateDir, "history", `${new Date().toISOString().slice(0, 10)}.json`), report);

const unifiedHeaders = [
  "Период", "Контент ID", "URL", "Тема", "Тип", "Дата публикации",
  "В поиске Яндекса", "Показы Яндекс", "Клики Яндекс", "CTR Яндекс", "Позиция Яндекс",
  "Показы Google", "Клики Google", "CTR Google", "Позиция Google",
  "Показы всего", "Клики всего", "CTR всего", "Средняя позиция",
  "Входные визиты", "Просмотры страницы", "Пользователи", "Просмотры публикации",
  "Скролл 50%", "Скролл 90%", "Активное чтение 60с", "Клики CTA",
  "Открытия выбора мессенджера", "Telegram", "WhatsApp", "Переходы в чат",
  "Атрибуция Метрики", "Решение",
];
const unifiedRows = trackedPages.map((page) => [
  `${report?.period?.date1 || ""}—${report?.period?.date2 || ""}`,
  page.content_id,
  page.url,
  page.title,
  page.type,
  page.published_at,
  page.in_search ? "Да" : "Нет",
  page.search_shows,
  page.search_clicks,
  page.search_shows ? `${asNumber(page.search_ctr).toFixed(2)}%` : "",
  page.search_avg_position || "",
  page.google_impressions,
  page.google_clicks,
  page.google_impressions ? `${page.google_ctr.toFixed(2)}%` : "",
  page.google_avg_position || "",
  page.combined_search_impressions,
  page.combined_search_clicks,
  page.combined_search_impressions ? `${page.combined_search_ctr.toFixed(2)}%` : "",
  page.combined_search_avg_position || "",
  page.entrance_visits ?? page.visits,
  page.pageviews,
  page.users,
  page.publication_view,
  page.scroll_50,
  page.scroll_90,
  page.active_60s,
  page.cta_click,
  page.messenger_dialog_open,
  page.telegram,
  page.whatsapp,
  page.contact_conversion,
  `${page.metrica_page_attribution}; цели: ${page.metrica_goal_attribution}`,
  page.decision,
]);
await writeCsv(join(stateDir, "sheet-unified-search-statistics.csv"), unifiedHeaders, unifiedRows);
await writeCsv(join(stateDir, "google-search-console-pages.csv"), [
  "URL", "Показы", "Клики", "CTR", "Средняя позиция",
], (google.pages || []).map((page) => [
  page.path, page.impressions, page.clicks, page.impressions ? `${page.ctr.toFixed(2)}%` : "", page.position || "",
]));
await writeCsv(join(stateDir, "google-search-console-page-queries.csv"), [
  "URL", "Запрос", "Показы", "Клики", "CTR", "Средняя позиция",
], (google.pages || []).flatMap((page) => (page.queries || []).map((query) => [
  page.path, query.query, query.impressions, query.clicks,
  query.impressions ? `${query.ctr.toFixed(2)}%` : "", query.position || "",
])));

console.log(
  `SEO enrichment: metrica=${exactMetrica.status}, google=${google.status}, pages=${trackedPages.length}`,
);
