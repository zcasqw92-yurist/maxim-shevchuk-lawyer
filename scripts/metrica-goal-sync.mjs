import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  metricaActionGoals,
  metricaCompositeGoals,
  metricaObsoleteGoals,
  metricaProtectedGoals,
} from "../src/metrica-goals.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = join(root, "reports");
const token = String(process.env.YANDEX_METRICA_OAUTH_TOKEN || "").trim();
const counterId = String(process.env.YANDEX_METRICA_ID || "111050150").trim();
const managementBase = "https://api-metrika.yandex.net/management/v1";
const reportsBase = "https://api-metrika.yandex.net/stat/v1";

if (!/^\d+$/.test(counterId)) throw new Error("YANDEX_METRICA_ID должен содержать только цифры");
if (!token) throw new Error("GitHub Secret YANDEX_METRICA_OAUTH_TOKEN не передан в задачу");

const request = async (url, { method = "GET", body } = {}) => {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    const message = data?.message || data?.errors?.map((item) => item.message).filter(Boolean).join("; ") || response.statusText;
    const error = new Error(`Яндекс Метрика API ${response.status}: ${message || "неизвестная ошибка"}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
};

const management = (path, options) => request(`${managementBase}${path}`, options);
const actionEvent = (goal = {}) => goal.type === "action"
  ? String((goal.conditions || []).find((condition) => typeof condition?.url === "string")?.url || "").trim()
  : "";
const normalizedSteps = (goal = {}) => (goal.steps || []).map((step) => ({
  name: String(step.name || ""),
  event: String((step.conditions || []).find((condition) => typeof condition?.url === "string")?.url || ""),
}));
const safeGoal = (goal = {}) => ({
  id: goal.id,
  name: goal.name,
  type: goal.type,
  goal_source: goal.goal_source,
  is_favorite: Boolean(goal.is_favorite),
  status: goal.status,
  event: actionEvent(goal) || null,
  conditions: goal.conditions || [],
  steps: normalizedSteps(goal),
});

const listGoals = async () => {
  const response = await management(`/counter/${counterId}/goals`);
  return Array.isArray(response.goals) ? response.goals : [];
};

const goalReaches = async (goalId, date1) => {
  const query = new URLSearchParams({
    ids: counterId,
    date1,
    date2: new Date().toISOString().slice(0, 10),
    metrics: `ym:s:goal${goalId}reaches,ym:s:goal${goalId}visits`,
    accuracy: "full",
  });
  try {
    const response = await request(`${reportsBase}/data?${query}`);
    return {
      known: true,
      reaches: Number(response.totals?.[0] || 0),
      visits: Number(response.totals?.[1] || 0),
    };
  } catch (error) {
    return { known: false, reaches: null, visits: null, error: error.message };
  }
};

const createActionGoal = async (definition) => management(`/counter/${counterId}/goals`, {
  method: "POST",
  body: {
    goal: {
      name: definition.name,
      type: "action",
      is_favorite: definition.favorite,
      conditions: [{ type: "exact", url: definition.event }],
    },
  },
});

const updateActionGoal = async (goal, definition) => management(`/counter/${counterId}/goal/${goal.id}`, {
  method: "PUT",
  body: {
    goal: {
      id: goal.id,
      name: definition.name,
      type: "action",
      is_favorite: definition.favorite,
      conditions: [{ type: "exact", url: definition.event }],
    },
  },
});

const compositePayload = (definition, id = undefined) => ({
  goal: {
    ...(id ? { id } : {}),
    name: definition.name,
    type: "step",
    is_favorite: definition.favorite,
    steps: definition.steps.map((step) => ({
      name: step.name,
      type: "action",
      conditions: [{ type: "action", url: step.event }],
    })),
  },
});

const createCompositeGoal = async (definition) => management(`/counter/${counterId}/goals`, {
  method: "POST",
  body: compositePayload(definition),
});
const updateCompositeGoal = async (goal, definition) => management(`/counter/${counterId}/goal/${goal.id}`, {
  method: "PUT",
  body: compositePayload(definition, goal.id),
});

const counterResponse = await management(`/counter/${counterId}?field=counter_flags`);
const counter = counterResponse.counter || {};
if (String(counter.id || "") !== counterId) throw new Error(`API вернул другой счётчик: ${counter.id || "не указан"}`);
if (counter.permission !== "own" && counter.permission !== "edit") throw new Error(`Недостаточно прав для синхронизации: ${counter.permission || "не указаны"}`);

const before = await listGoals();
const operations = [];
const protectedIds = new Set(metricaProtectedGoals.map((goal) => Number(goal.id)));
const startDate = String(counter.create_time || new Date().toISOString()).slice(0, 10);

for (const obsolete of metricaObsoleteGoals) {
  const current = before.find((goal) => Number(goal.id) === Number(obsolete.id))
    || before.find((goal) => obsolete.event && actionEvent(goal) === obsolete.event)
    || before.find((goal) => goal.name === obsolete.name);
  if (!current) {
    operations.push({ operation: "obsolete_absent", name: obsolete.name, id: obsolete.id });
    continue;
  }
  if (protectedIds.has(Number(current.id))) throw new Error(`Защищённая цель ошибочно попала в удаление: ${current.id}`);
  const history = await goalReaches(current.id, startDate);
  if (!history.known || history.reaches > 0 || history.visits > 0) {
    operations.push({
      operation: "obsolete_retained",
      id: current.id,
      name: current.name,
      reason: !history.known ? "статистика недоступна" : "есть исторические достижения",
      history,
    });
    continue;
  }
  try {
    await management(`/counter/${counterId}/goal/${current.id}`, { method: "DELETE" });
    operations.push({ operation: "obsolete_deleted", id: current.id, name: current.name, history, reason: obsolete.reason });
  } catch (error) {
    operations.push({ operation: "obsolete_delete_failed", id: current.id, name: current.name, history, error: error.message });
  }
}

let goals = await listGoals();
for (const definition of metricaActionGoals) {
  const matches = goals.filter((goal) => goal.type === "action" && actionEvent(goal) === definition.event);
  if (matches.length > 1) throw new Error(`Найдены дубли action-цели ${definition.event}: ${matches.map((goal) => goal.id).join(", ")}`);
  const current = matches[0];
  if (!current) {
    const response = await createActionGoal(definition);
    operations.push({ operation: "action_created", event: definition.event, name: definition.name, id: response.goal?.id || null });
    goals = await listGoals();
    continue;
  }
  const needsUpdate = current.name !== definition.name || Boolean(current.is_favorite) !== definition.favorite;
  if (needsUpdate) {
    await updateActionGoal(current, definition);
    operations.push({ operation: "action_updated", event: definition.event, id: current.id, before_name: current.name, after_name: definition.name, favorite: definition.favorite });
  } else {
    operations.push({ operation: "action_unchanged", event: definition.event, id: current.id });
  }
}

goals = await listGoals();
for (const definition of metricaCompositeGoals) {
  const matches = goals.filter((goal) => goal.type === "step" && goal.name === definition.name);
  if (matches.length > 1) throw new Error(`Найдены дубли составной цели «${definition.name}»: ${matches.map((goal) => goal.id).join(", ")}`);
  const current = matches[0];
  if (!current) {
    const response = await createCompositeGoal(definition);
    operations.push({ operation: "funnel_created", name: definition.name, id: response.goal?.id || null });
    goals = await listGoals();
    continue;
  }
  const expectedSteps = definition.steps.map((step) => ({ name: step.name, event: step.event }));
  const needsUpdate = Boolean(current.is_favorite) !== definition.favorite
    || JSON.stringify(normalizedSteps(current)) !== JSON.stringify(expectedSteps);
  if (needsUpdate) {
    await updateCompositeGoal(current, definition);
    operations.push({ operation: "funnel_updated", name: definition.name, id: current.id });
  } else {
    operations.push({ operation: "funnel_unchanged", name: definition.name, id: current.id });
  }
}

const after = await listGoals();
const afterEvents = new Map(after.filter((goal) => goal.type === "action").map((goal) => [actionEvent(goal), goal]));
const errors = [];
for (const definition of metricaActionGoals) {
  const goal = afterEvents.get(definition.event);
  if (!goal) errors.push(`Не создана action-цель ${definition.event}`);
  else if (goal.name !== definition.name || Boolean(goal.is_favorite) !== definition.favorite) errors.push(`Цель ${definition.event} не синхронизирована`);
}
for (const definition of metricaCompositeGoals) {
  const goal = after.find((item) => item.type === "step" && item.name === definition.name);
  if (!goal) errors.push(`Не создана составная цель «${definition.name}»`);
  else if (JSON.stringify(normalizedSteps(goal)) !== JSON.stringify(definition.steps)) errors.push(`Неверные шаги составной цели «${definition.name}»`);
}
for (const protectedGoal of metricaProtectedGoals) {
  if (!after.some((goal) => Number(goal.id) === Number(protectedGoal.id))) errors.push(`Удалена защищённая цель ${protectedGoal.id}: ${protectedGoal.name}`);
}

const report = {
  generated_at: new Date().toISOString(),
  counter: {
    id: counter.id,
    name: counter.name,
    site: counter.site,
    permission: counter.permission,
    status: counter.status,
    activity_status: counter.activity_status,
    code_options: counter.code_options || null,
    counter_flags: counter.counter_flags || null,
  },
  before: before.map(safeGoal),
  operations,
  after: after.map(safeGoal),
  verification_errors: errors,
  safety: {
    token_in_report: false,
    deletion_rule: "только известная устаревшая цель с нулём исторических достижений",
    protected_goal_ids: [...protectedIds],
  },
};

const summary = operations.reduce((acc, operation) => {
  acc[operation.operation] = (acc[operation.operation] || 0) + 1;
  return acc;
}, {});
const markdown = `# Синхронизация целей Яндекс Метрики\n\n- Счётчик: ${counterId}\n- Права: ${counter.permission}\n- Целей до: ${before.length}\n- Целей после: ${after.length}\n- Ошибок проверки: ${errors.length}\n\n## Операции\n\n${operations.map((operation) => `- **${operation.operation}**: ${operation.event || operation.name || operation.id}${operation.id ? ` (ID ${operation.id})` : ""}`).join("\n")}\n\n## Сводка\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n\nOAuth-токен в отчёт не записан. Удаление допускалось только для заранее известных устаревших целей без исторических достижений.\n`;

await mkdir(reportsDir, { recursive: true });
await writeFile(join(reportsDir, "metrica-sync.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(join(reportsDir, "metrica-sync.md"), markdown, "utf8");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Metrica sync passed: ${before.length} → ${after.length} goals; ${JSON.stringify(summary)}`);
