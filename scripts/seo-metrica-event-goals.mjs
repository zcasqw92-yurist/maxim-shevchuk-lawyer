import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "config", "seo-data-pipeline.json"), "utf8"));
const stateDir = resolve(String(process.env.SEO_STATE_DIR || join(root, "reports", "seo-data")));
const reportPath = join(stateDir, "feedback-latest.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const token = String(process.env.YANDEX_METRICA_OAUTH_TOKEN || "").trim();
const coreGoalEvents = Array.isArray(config?.metrica?.goal_events) ? config.metrica.goal_events : [];
const diagnosticGoalEvents = Array.isArray(config?.metrica?.diagnostic_goal_events) ? config.metrica.diagnostic_goal_events : [];
const goalEvents = [...new Set([...coreGoalEvents, ...diagnosticGoalEvents])];
const origin = `https://${config.webmaster.target_host}`;

if (!token) {
  console.log("Metrica event-goal attribution skipped: YANDEX_METRICA_OAUTH_TOKEN is not configured");
  process.exit(0);
}
console.log(`::add-mask::${token}`);

const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value, digits = 2) => Number(asNumber(value).toFixed(digits));
const normalizePath = (value) => {
  try {
    const pathname = new URL(String(value || "/"), origin).pathname.replace(/\/{2,}/g, "/");
    return pathname === "/" ? "/" : `${pathname.replace(/\/+$/, "")}/`;
  } catch {
    const pathname = String(value || "/").split(/[?#]/)[0].replace(/\/{2,}/g, "/");
    return pathname === "/" ? "/" : `${pathname.replace(/\/+$/, "")}/`;
  }
};
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
const yandexApi = async (url, label) => apiJson(url, {
  headers: { Authorization: `OAuth ${token}`, Accept: "application/json" },
}, label);
const dimensionValue = (dimension) => safeText(dimension?.name || dimension?.id || "");
const actionEvent = (goal = {}) => goal.type === "action"
  ? String((goal.conditions || []).find((item) => typeof item?.url === "string")?.url || "").trim()
  : "";
const percent = (numerator, denominator) => denominator > 0 ? round((numerator / denominator) * 100) : 0;

const trackedPages = Array.isArray(report.publications) ? report.publications : [];
const trackedPaths = new Set(trackedPages.map((page) => normalizePath(page.url)));
const counterId = String(config.metrica.counter_id);
const managementBase = config.metrica.management_api_base;
const reportingBase = config.metrica.reporting_api_base;
const goalsPayload = await yandexApi(`${managementBase}/counter/${counterId}/goals`, "Metrica management");
const goals = Array.isArray(goalsPayload.goals) ? goalsPayload.goals : [];
const aliases = new Map();
for (const event of goalEvents) aliases.set(event, event);
for (const goal of goals) {
  const event = actionEvent(goal);
  if (!event || !goalEvents.includes(event)) continue;
  aliases.set(String(goal.id || ""), event);
  aliases.set(String(goal.name || "").trim(), event);
  aliases.set(event, event);
}

const params = new URLSearchParams({
  ids: counterId,
  date1: report?.period?.date1,
  date2: report?.period?.date2,
  dimensions: "ym:ep:eventURLPath,ym:ep:actionGoal",
  metrics: "ym:ep:eventsNumber",
  limit: "10000",
  accuracy: "full",
});
const payload = await yandexApi(`${reportingBase}/data?${params}`, "Metrica event-goal report");
const byPath = new Map();
for (const row of Array.isArray(payload.data) ? payload.data : []) {
  const path = normalizePath(dimensionValue(row?.dimensions?.[0]));
  if (!trackedPaths.has(path)) continue;
  const rawGoal = dimensionValue(row?.dimensions?.[1]);
  const event = aliases.get(rawGoal);
  if (!event) continue;
  const current = byPath.get(path) || Object.fromEntries(goalEvents.map((name) => [name, 0]));
  current[event] = asNumber(current[event]) + asNumber(row?.metrics?.[0]);
  byPath.set(path, current);
}

const existingRows = Array.isArray(report?.metrica?.exact_attribution?.rows)
  ? report.metrica.exact_attribution.rows
  : (Array.isArray(report?.metrica?.rows) ? report.metrica.rows : []);
const exactRows = existingRows.map((row) => ({
  ...row,
  ...Object.fromEntries(goalEvents.map((event) => [event, asNumber(byPath.get(normalizePath(row.path))?.[event])])),
}));
const exactByPath = new Map(exactRows.map((row) => [normalizePath(row.path), row]));
report.metrica = report.metrica || {};
report.metrica.exact_attribution = {
  ...(report.metrica.exact_attribution || {}),
  available: true,
  status: "ok",
  page_attribution: "viewed_page_url",
  goal_attribution: "event_url_action_goal",
  goal_error: "",
  core_goal_events: coreGoalEvents,
  diagnostic_goal_events: diagnosticGoalEvents,
  missing_goals: goalEvents.filter((event) => !aliases.has(event)),
  sampled: Boolean(payload.sampled),
  contains_sensitive_data: Boolean(payload.contains_sensitive_data),
  rows: exactRows,
};
report.metrica.rows = exactRows;

for (const page of trackedPages) {
  const behavior = exactByPath.get(normalizePath(page.url)) || {};
  for (const event of goalEvents) page[event] = asNumber(behavior[event]);
  page.publication_view = asNumber(behavior.publication_view);
  page.scroll_25 = asNumber(behavior.publication_scroll_25);
  page.scroll_50 = asNumber(behavior.publication_scroll_50);
  page.scroll_75 = asNumber(behavior.publication_scroll_75);
  page.scroll_90 = asNumber(behavior.publication_scroll_90);
  page.scroll_100 = asNumber(behavior.publication_scroll_100);
  page.active_30s = asNumber(behavior.publication_active_30s);
  page.active_60s = asNumber(behavior.publication_active_60s);
  page.active_120s = asNumber(behavior.publication_active_120s);
  page.section_view = asNumber(behavior.publication_section_view);
  page.toc_click = asNumber(behavior.publication_toc_click);
  page.faq_open = asNumber(behavior.publication_faq_open);
  page.source_click = asNumber(behavior.publication_source_click);
  page.related_click = asNumber(behavior.publication_related_click);
  page.case_click = asNumber(behavior.publication_case_click);
  page.service_click = asNumber(behavior.publication_service_click);
  page.article_click = asNumber(behavior.publication_article_click);
  page.messenger_intent = asNumber(behavior.publication_messenger_intent);
  page.helpfulness = asNumber(behavior.publication_helpfulness);
  page.cta_view = asNumber(behavior.cta_view);
  page.cta_click = asNumber(behavior.cta_click);
  page.messenger_dialog_open = asNumber(behavior.messenger_dialog_open);
  page.button_action = asNumber(behavior.button_action);
  page.contact_click = asNumber(behavior.contact_click);
  page.contact_action = asNumber(behavior.contact_action);
  page.contact_conversion = asNumber(behavior.contact_conversion);
  page.telegram = asNumber(behavior.contact_telegram);
  page.whatsapp = asNumber(behavior.contact_whatsapp);
  page.phone = asNumber(behavior.contact_phone);
  page.email = asNumber(behavior.contact_email);
  page.map = asNumber(behavior.contact_map);
  page.chat_transitions = page.telegram + page.whatsapp;
  page.metrica_goal_attribution = "event_url_action_goal";
  const observationBase = page.type === "Услуга" ? asNumber(page.pageviews) : asNumber(page.publication_view);
  const searchBase = asNumber(page.combined_search_impressions || page.search_shows);
  page.conversion_to_chat = observationBase > 0 ? `${percent(page.chat_transitions, observationBase).toFixed(2)}%` : "";
  page.conversion_to_contact = observationBase > 0 ? `${percent(page.contact_conversion, observationBase).toFixed(2)}%` : "";
  if (observationBase >= 30 && searchBase >= 30) {
    page.decision = "Поведенческой и поисковой выборки достаточно для первичного сравнения; менять материал только после сопоставления с предыдущей версией, запросами и конверсией.";
  } else if (observationBase >= 30) {
    page.decision = "Поведенческий сигнал уже можно анализировать, но поисковой выборки недостаточно. UX наблюдать; SEO-текст и структуру по одному этому сигналу пока не менять.";
  } else if (searchBase >= 30) {
    page.decision = "Поисковая видимость уже набирает выборку, но данных по чтению недостаточно. Проверять CTR и интент; содержательную структуру пока не менять.";
  } else {
    page.decision = "Наблюдение: выборка недостаточна, страницу не менять.";
  }
}

const publicationByPath = new Map(trackedPages.map((page) => [normalizePath(page.url), page]));
for (const cluster of Array.isArray(report.clusters) ? report.clusters : []) {
  const pages = (cluster.pages || []).map((page) => publicationByPath.get(normalizePath(page.url)) || page);
  cluster.pages = pages;
  cluster.totals = {
    ...(cluster.totals || {}),
    cta_clicks: pages.reduce((sum, page) => sum + asNumber(page.cta_click), 0),
    messenger_dialog_opens: pages.reduce((sum, page) => sum + asNumber(page.messenger_dialog_open), 0),
    chat_transitions: pages.reduce((sum, page) => sum + asNumber(page.chat_transitions), 0),
    contact_conversions: pages.reduce((sum, page) => sum + asNumber(page.contact_conversion), 0),
  };
}
report.rules = {
  ...(report.rules || {}),
  metrica_goal_metrics_use_event_url: true,
  metrica_goal_count_uses_action_goal_events: true,
  publication_scroll_scope_from_2026_08_11: "publication",
  publication_scroll_measurement_version: 2,
  related_clicks_split_by_destination: true,
  chat_transition_definition: "contact_telegram + contact_whatsapp",
  contact_conversion_definition: "all configured contact channels",
  decisions_require_behavior_and_search_context: true,
};

await writeJson(reportPath, report);
await writeJson(join(stateDir, "history", `${new Date().toISOString().slice(0, 10)}.json`), report);
const headers = [
  "Период", "Контент ID", "URL", "Тема", "Тип", "Дата публикации",
  "В поиске Яндекса", "Показы Яндекс", "Клики Яндекс", "CTR Яндекс", "Позиция Яндекс",
  "Показы Google", "Клики Google", "CTR Google", "Позиция Google",
  "Показы всего", "Клики всего", "CTR всего", "Средняя позиция",
  "Входные визиты", "Просмотры страницы", "Пользователи", "Просмотры публикации",
  "Скролл 25%", "Скролл 50%", "Скролл 75%", "Скролл 90%", "Дочитал публикацию 100%",
  "Активное чтение 30с", "Активное чтение 60с", "Активное чтение 120с",
  "Просмотры смысловых блоков", "Клики по оглавлению", "Открытия FAQ", "Клики по источникам", "Клики по связанным материалам",
  "Клики по кейсам", "Клики по услугам", "Клики по статьям", "Намерение написать", "Оценки полезности",
  "Просмотры CTA", "Клики CTA", "Открытия выбора мессенджера", "Все кнопочные действия",
  "Telegram", "WhatsApp", "Переходы в чат", "Телефон", "Email", "Карта", "Все переходы к контакту",
  "Конверсия в чат", "Конверсия в контакт", "Атрибуция Метрики", "Решение",
];
const rows = trackedPages.map((page) => [
  `${report?.period?.date1 || ""}—${report?.period?.date2 || ""}`,
  page.content_id, page.url, page.title, page.type, page.published_at,
  page.in_search ? "Да" : "Нет", page.search_shows, page.search_clicks,
  page.search_shows ? `${asNumber(page.search_ctr).toFixed(2)}%` : "", page.search_avg_position || "",
  page.google_impressions, page.google_clicks,
  page.google_impressions ? `${asNumber(page.google_ctr).toFixed(2)}%` : "", page.google_avg_position || "",
  page.combined_search_impressions, page.combined_search_clicks,
  page.combined_search_impressions ? `${asNumber(page.combined_search_ctr).toFixed(2)}%` : "", page.combined_search_avg_position || "",
  page.entrance_visits ?? page.visits, page.pageviews, page.users, page.publication_view,
  page.scroll_25, page.scroll_50, page.scroll_75, page.scroll_90, page.scroll_100,
  page.active_30s, page.active_60s, page.active_120s,
  page.section_view, page.toc_click, page.faq_open, page.source_click, page.related_click,
  page.case_click, page.service_click, page.article_click, page.messenger_intent, page.helpfulness,
  page.cta_view, page.cta_click, page.messenger_dialog_open, page.button_action,
  page.telegram, page.whatsapp, page.chat_transitions, page.phone, page.email, page.map, page.contact_conversion,
  page.conversion_to_chat, page.conversion_to_contact,
  `${page.metrica_page_attribution}; цели: ${page.metrica_goal_attribution}`,
  page.decision,
]);
await writeCsv(join(stateDir, "sheet-unified-search-statistics.csv"), headers, rows);
console.log(`Metrica event-goal attribution: paths=${byPath.size}, rows=${exactRows.length}, goals=${goalEvents.length}, status=ok`);
