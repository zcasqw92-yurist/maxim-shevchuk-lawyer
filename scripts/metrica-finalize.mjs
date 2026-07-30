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
const counterId = String(process.env.YANDEX_METRICA_ID || "111050150").trim();
const token = String(process.env.YANDEX_METRICA_OAUTH_TOKEN || "").trim();
const managementBase = "https://api-metrika.yandex.net/management/v1";
const reportsBase = "https://api-metrika.yandex.net/stat/v1/data";
if (!token) throw new Error("Не передан YANDEX_METRICA_OAUTH_TOKEN");

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
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
  if (!response.ok) {
    const message = data?.message || data?.errors?.map((item) => item.message).filter(Boolean).join("; ") || response.statusText;
    throw new Error(`Яндекс Метрика API ${response.status}: ${message || "неизвестная ошибка"}`);
  }
  return data;
};
const management = (path, options) => request(`${managementBase}${path}`, options);
const listGoals = async () => (await management(`/counter/${counterId}/goals`)).goals || [];
const actionEvent = (goal = {}) => goal.type === "action"
  ? String((goal.conditions || []).find((item) => typeof item?.url === "string")?.url || "").trim()
  : "";
const stepEvents = (goal = {}) => (goal.steps || []).map((step) => ({
  name: String(step.name || ""),
  event: String((step.conditions || []).find((item) => typeof item?.url === "string")?.url || ""),
}));
const favorite = (value) => value ? 1 : 0;
const actionBody = (definition, id) => ({ goal: {
  ...(id ? { id } : {}), name: definition.name, type: "action",
  is_favorite: favorite(definition.favorite),
  conditions: [{ type: "exact", url: definition.event }],
} });
const archiveActionBody = (goal, archiveName) => ({ goal: {
  id: goal.id,
  name: archiveName,
  type: "action",
  is_favorite: 0,
  conditions: goal.conditions || [],
} });
const funnelBody = (definition, id) => ({ goal: {
  ...(id ? { id } : {}), name: definition.name, type: "step",
  is_favorite: favorite(definition.favorite),
  steps: definition.steps.map((step) => ({
    name: step.name,
    type: "action",
    conditions: [{ type: "exact", url: step.event }],
  })),
} });
const safeGoal = (goal = {}) => ({
  id: goal.id, name: goal.name, type: goal.type, goal_source: goal.goal_source,
  is_favorite: Boolean(goal.is_favorite), status: goal.status,
  event: actionEvent(goal) || null, steps: stepEvents(goal),
});
const goalHistory = async (goalId, date1) => {
  const query = new URLSearchParams({
    ids: counterId, date1, date2: new Date().toISOString().slice(0, 10),
    metrics: `ym:s:goal${goalId}reaches,ym:s:goal${goalId}visits`, accuracy: "full",
  });
  try {
    const result = await request(`${reportsBase}?${query}`);
    return { known: true, reaches: Number(result.totals?.[0] || 0), visits: Number(result.totals?.[1] || 0) };
  } catch (error) {
    return { known: false, reaches: null, visits: null, error: error.message };
  }
};

const counter = (await management(`/counter/${counterId}`)).counter || {};
if (!new Set(["own", "edit"]).has(counter.permission)) throw new Error(`Недостаточно прав: ${counter.permission || "не указаны"}`);
const before = await listGoals();
const operations = [];
const protectedIds = new Set(metricaProtectedGoals.map((item) => Number(item.id)));
const startDate = String(counter.create_time || new Date().toISOString()).slice(0, 10);

for (const obsolete of metricaObsoleteGoals) {
  const goals = await listGoals();
  const current = goals.find((goal) => Number(goal.id) === Number(obsolete.id))
    || goals.find((goal) => obsolete.event && actionEvent(goal) === obsolete.event)
    || goals.find((goal) => goal.name === obsolete.name)
    || goals.find((goal) => obsolete.archiveName && goal.name === obsolete.archiveName);
  if (!current) {
    operations.push({ operation: "obsolete_absent", id: obsolete.id, name: obsolete.name });
    continue;
  }
  if (protectedIds.has(Number(current.id))) throw new Error(`Защищённая цель попала в обработку: ${current.id}`);
  const history = await goalHistory(current.id, startDate);
  if (!history.known || history.reaches > 0 || history.visits > 0) {
    if (current.type !== "action" || current.goal_source === "auto" || !obsolete.archiveName) {
      operations.push({ operation: "obsolete_retained", id: current.id, name: current.name, history });
      continue;
    }
    if (current.name !== obsolete.archiveName || Boolean(current.is_favorite)) {
      await management(`/counter/${counterId}/goal/${current.id}`, {
        method: "PUT",
        body: archiveActionBody(current, obsolete.archiveName),
      });
      operations.push({ operation: "obsolete_archived", id: current.id, before_name: current.name, after_name: obsolete.archiveName, history });
    } else {
      operations.push({ operation: "obsolete_archive_unchanged", id: current.id, name: current.name, history });
    }
    continue;
  }
  await management(`/counter/${counterId}/goal/${current.id}`, { method: "DELETE" });
  operations.push({ operation: "obsolete_deleted", id: current.id, name: current.name, history });
}

for (const definition of metricaActionGoals) {
  const goals = await listGoals();
  const matches = goals.filter((goal) => goal.type === "action" && actionEvent(goal) === definition.event);
  if (matches.length > 1) throw new Error(`Дубли action-цели ${definition.event}: ${matches.map((goal) => goal.id).join(", ")}`);
  const current = matches[0];
  if (!current) {
    const created = await management(`/counter/${counterId}/goals`, { method: "POST", body: actionBody(definition) });
    operations.push({ operation: "action_created", event: definition.event, id: created.goal?.id || null });
  } else if (current.name !== definition.name || Boolean(current.is_favorite) !== definition.favorite) {
    await management(`/counter/${counterId}/goal/${current.id}`, { method: "PUT", body: actionBody(definition, current.id) });
    operations.push({ operation: "action_updated", event: definition.event, id: current.id });
  } else {
    operations.push({ operation: "action_unchanged", event: definition.event, id: current.id });
  }
}

for (const definition of metricaCompositeGoals) {
  const goals = await listGoals();
  const matches = goals.filter((goal) => goal.type === "step" && goal.name === definition.name);
  if (matches.length > 1) throw new Error(`Дубли воронки «${definition.name}»`);
  const current = matches[0];
  const expected = definition.steps.map((step) => ({ name: step.name, event: step.event }));
  if (!current) {
    const created = await management(`/counter/${counterId}/goals`, { method: "POST", body: funnelBody(definition) });
    operations.push({ operation: "funnel_created", name: definition.name, id: created.goal?.id || null });
  } else if (Boolean(current.is_favorite) !== definition.favorite || JSON.stringify(stepEvents(current)) !== JSON.stringify(expected)) {
    await management(`/counter/${counterId}/goal/${current.id}`, { method: "PUT", body: funnelBody(definition, current.id) });
    operations.push({ operation: "funnel_updated", name: definition.name, id: current.id });
  } else {
    operations.push({ operation: "funnel_unchanged", name: definition.name, id: current.id });
  }
}

const after = await listGoals();
const errors = [];
for (const definition of metricaActionGoals) {
  const matches = after.filter((goal) => goal.type === "action" && actionEvent(goal) === definition.event);
  if (matches.length !== 1) errors.push(`${definition.event}: найдено ${matches.length} целей`);
  else if (matches[0].name !== definition.name || Boolean(matches[0].is_favorite) !== definition.favorite) errors.push(`${definition.event}: неверные свойства`);
}
for (const definition of metricaCompositeGoals) {
  const goal = after.find((item) => item.type === "step" && item.name === definition.name);
  if (!goal) errors.push(`Не создана воронка «${definition.name}»`);
  else if (JSON.stringify(stepEvents(goal)) !== JSON.stringify(definition.steps)) errors.push(`Неверные шаги воронки «${definition.name}»`);
}
for (const obsolete of metricaObsoleteGoals) {
  const goal = after.find((item) => Number(item.id) === Number(obsolete.id));
  if (goal && obsolete.archiveName && goal.goal_source !== "auto") {
    if (goal.name !== obsolete.archiveName || Boolean(goal.is_favorite)) errors.push(`Устаревшая цель ${obsolete.id} не переведена в архив`);
  }
}
for (const protectedGoal of metricaProtectedGoals) {
  if (!after.some((goal) => Number(goal.id) === Number(protectedGoal.id))) errors.push(`Удалена защищённая цель ${protectedGoal.id}`);
}
const favoriteGoals = after.filter((goal) => Boolean(goal.is_favorite));
if (favoriteGoals.length !== 1 || actionEvent(favoriteGoals[0]) !== "contact_conversion") errors.push("Главной должна остаться только contact_conversion");

const summary = operations.reduce((result, item) => ({ ...result, [item.operation]: (result[item.operation] || 0) + 1 }), {});
const report = {
  generated_at: new Date().toISOString(), counter: { id: counter.id, name: counter.name, site: counter.site, permission: counter.permission },
  before: before.map(safeGoal), operations, after: after.map(safeGoal), summary,
  verification_errors: errors,
  safety: { token_in_report: false, protected_ids: [...protectedIds], deletion: "только известные устаревшие цели без истории" },
};
await mkdir(reportsDir, { recursive: true });
await writeFile(join(reportsDir, "metrica-sync.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(join(reportsDir, "metrica-sync.md"), `# Итог настройки Метрики\n\nЦелей до: ${before.length}\n\nЦелей после: ${after.length}\n\nОшибок: ${errors.length}\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`, "utf8");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Metrica finalize passed: ${before.length} → ${after.length} goals; ${JSON.stringify(summary)}`);
