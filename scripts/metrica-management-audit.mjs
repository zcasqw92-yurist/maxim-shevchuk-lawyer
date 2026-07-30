import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = join(root, "reports");
const token = String(process.env.YANDEX_METRICA_OAUTH_TOKEN || "").trim();
const counterId = String(process.env.YANDEX_METRICA_ID || "111050150").trim();
const apiBase = "https://api-metrika.yandex.net/management/v1";

if (!/^\d+$/.test(counterId)) throw new Error("YANDEX_METRICA_ID должен содержать только цифры");
if (!token) throw new Error("GitHub Secret YANDEX_METRICA_OAUTH_TOKEN не передан в задачу");

const api = async (path) => {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    const message = data?.message || data?.errors?.map((item) => item.message).filter(Boolean).join("; ") || response.statusText;
    throw new Error(`Яндекс Метрика API ${response.status}: ${message || "неизвестная ошибка"}`);
  }
  return data;
};

const safeCounter = (counter = {}) => ({
  id: counter.id,
  name: counter.name,
  site: counter.site,
  status: counter.status,
  activity_status: counter.activity_status,
  type: counter.type,
  favorite: counter.favorite,
  permission: counter.permission,
  time_zone_name: counter.time_zone_name,
  create_time: counter.create_time,
  code_options: counter.code_options || null,
  webvisor_options: counter.webvisor_options || null,
  counter_flags: counter.counter_flags || null,
});

const goalEventId = (goal = {}) => {
  if (goal.type !== "action") return "";
  const condition = (goal.conditions || []).find((item) => item && typeof item.url === "string");
  return String(condition?.url || "").trim();
};

const goalSignature = (goal = {}) => JSON.stringify({
  type: goal.type || "unknown",
  event: goalEventId(goal),
  conditions: goal.conditions || [],
  steps: goal.steps || [],
  flag: goal.flag || "",
});

const requiredEvents = new Set([
  "contact_conversion",
  "messenger_dialog_open",
  "cta_click",
  "contact_action",
  "contact_click",
]);

const diagnosticEvents = new Set([
  "button_action",
  "cta_view",
  "publication_view",
  "publication_scroll_25",
  "publication_scroll_50",
  "publication_scroll_75",
  "publication_scroll_90",
  "publication_scroll_100",
  "publication_active_30s",
  "publication_active_60s",
  "publication_active_120s",
  "publication_section_view",
  "publication_toc_click",
  "publication_faq_open",
  "publication_source_click",
  "publication_related_click",
  "publication_messenger_intent",
  "publication_helpfulness",
]);

const legacyEventPattern = /(?:price_quiz|callback_request|send_form|form_submit|quiz_complete)/i;

const [counterResponse, goalsResponse, goalsWithDeletedResponse, availableResponse] = await Promise.all([
  api(`/counter/${counterId}?field=goals,mirrors,filters,operations,counter_flags,measurement_tokens`),
  api(`/counter/${counterId}/goals`),
  api(`/counter/${counterId}/goals?useDeleted=true`),
  api(`/counters?counter_ids=${counterId}&field=goals,counter_flags`),
]);

const counter = counterResponse.counter || {};
const goals = Array.isArray(goalsResponse.goals) ? goalsResponse.goals : [];
const allGoals = Array.isArray(goalsWithDeletedResponse.goals) ? goalsWithDeletedResponse.goals : [];
const deletedGoals = allGoals.filter((goal) => String(goal.status || "").toLowerCase().includes("delete"));

if (String(counter.id || "") !== counterId) throw new Error(`API вернул другой счётчик: ${counter.id || "не указан"}`);
if (!Array.isArray(availableResponse.counters) || !availableResponse.counters.some((item) => String(item.id) === counterId)) {
  throw new Error(`Счётчик ${counterId} отсутствует среди доступных текущему OAuth-токену`);
}

const signatureGroups = new Map();
for (const goal of goals) {
  const signature = goalSignature(goal);
  signatureGroups.set(signature, [...(signatureGroups.get(signature) || []), goal.id]);
}

const classifiedGoals = goals.map((goal) => {
  const eventId = goalEventId(goal);
  const duplicates = signatureGroups.get(goalSignature(goal)) || [];
  let assessment = "review";
  if (goal.goal_source === "auto") assessment = "automatic_keep_review";
  else if (requiredEvents.has(eventId)) assessment = eventId === "contact_conversion" ? "required_primary" : "required_secondary";
  else if (diagnosticEvents.has(eventId)) assessment = "diagnostic_secondary";
  else if (legacyEventPattern.test(eventId) || legacyEventPattern.test(goal.name || "")) assessment = "legacy_review";
  if (duplicates.length > 1) assessment = "exact_duplicate_review";
  return {
    id: goal.id,
    name: goal.name,
    type: goal.type,
    goal_source: goal.goal_source,
    is_favorite: Boolean(goal.is_favorite),
    status: goal.status,
    event_id: eventId || null,
    conditions: goal.conditions || [],
    steps: goal.steps || [],
    duplicate_ids: duplicates.length > 1 ? duplicates : [],
    assessment,
  };
});

const presentEvents = new Set(classifiedGoals.map((goal) => goal.event_id).filter(Boolean));
const missingRequiredEvents = [...requiredEvents].filter((event) => !presentEvents.has(event));
const missingDiagnosticEvents = [...diagnosticEvents].filter((event) => !presentEvents.has(event));
const duplicateGroups = [...signatureGroups.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([signature, ids]) => ({ signature: JSON.parse(signature), ids }));

const report = {
  generated_at: new Date().toISOString(),
  mode: "read_only_audit",
  counter: safeCounter(counter),
  totals: {
    active_goals: goals.length,
    deleted_goals_visible: deletedGoals.length,
    automatic_goals: goals.filter((goal) => goal.goal_source === "auto").length,
    favorite_goals: goals.filter((goal) => goal.is_favorite).length,
    exact_duplicate_groups: duplicateGroups.length,
  },
  missing_required_events: missingRequiredEvents,
  missing_diagnostic_events: missingDiagnosticEvents,
  duplicate_groups: duplicateGroups,
  goals: classifiedGoals,
  deleted_goals: deletedGoals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    type: goal.type,
    goal_source: goal.goal_source,
    status: goal.status,
    event_id: goalEventId(goal) || null,
  })),
  safety: {
    changed_counter: false,
    created_goals: 0,
    updated_goals: 0,
    deleted_goals: 0,
    token_in_report: false,
  },
};

const markdownRows = classifiedGoals.map((goal) => [
  goal.id,
  String(goal.name || "").replaceAll("|", "\\|"),
  goal.type,
  goal.goal_source || "",
  goal.event_id || "—",
  goal.is_favorite ? "да" : "нет",
  goal.assessment,
].join(" | "));

const markdown = `# Аудит Яндекс Метрики\n\n- Счётчик: ${counterId}\n- Сайт: ${counter.site || "не указан"}\n- Доступ: ${counter.permission || "не указан"}\n- Активных целей: ${goals.length}\n- Автоматических целей: ${report.totals.automatic_goals}\n- Избранных целей: ${report.totals.favorite_goals}\n- Групп точных дублей: ${duplicateGroups.length}\n\n## Отсутствующие обязательные события\n\n${missingRequiredEvents.length ? missingRequiredEvents.map((item) => `- \`${item}\``).join("\n") : "Нет."}\n\n## Отсутствующие диагностические события\n\n${missingDiagnosticEvents.length ? missingDiagnosticEvents.map((item) => `- \`${item}\``).join("\n") : "Нет."}\n\n## Цели\n\nID | Название | Тип | Источник | Событие | Избранная | Оценка\n--- | --- | --- | --- | --- | --- | ---\n${markdownRows.join("\n")}\n\n## Безопасность\n\nАудит выполнен только методами GET. Настройки счётчика и цели не изменялись. OAuth-токен в отчёт не записан.\n`;

await mkdir(reportsDir, { recursive: true });
await writeFile(join(reportsDir, "metrica-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(join(reportsDir, "metrica-audit.md"), markdown, "utf8");

console.log(`Metrica audit passed: counter ${counterId}, permission ${counter.permission || "unknown"}, ${goals.length} active goals, ${missingRequiredEvents.length} required events missing, ${duplicateGroups.length} exact duplicate groups`);
for (const goal of classifiedGoals) {
  console.log(`goal ${goal.id}: ${goal.name} | ${goal.type} | ${goal.event_id || "no-event"} | ${goal.assessment}`);
}
