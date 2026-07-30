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
const apiBase = "https://api-metrika.yandex.net/management/v1";
if (!token) throw new Error("Не передан YANDEX_METRICA_OAUTH_TOKEN");

const api = async (path) => {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `OAuth ${token}`, Accept: "application/json" },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    const message = data?.message || data?.errors?.map((item) => item.message).filter(Boolean).join("; ") || response.statusText;
    throw new Error(`Яндекс Метрика API ${response.status}: ${message || "неизвестная ошибка"}`);
  }
  return data;
};
const actionEvent = (goal = {}) => goal.type === "action"
  ? String((goal.conditions || []).find((item) => typeof item?.url === "string")?.url || "").trim()
  : "";
const stepEvents = (goal = {}) => (goal.steps || []).map((step) => ({
  name: String(step.name || ""),
  event: String((step.conditions || []).find((item) => typeof item?.url === "string")?.url || ""),
}));

const [counterResponse, goalsResponse] = await Promise.all([
  api(`/counter/${counterId}?field=counter_flags`),
  api(`/counter/${counterId}/goals`),
]);
const counter = counterResponse.counter || {};
const goals = Array.isArray(goalsResponse.goals) ? goalsResponse.goals : [];
const errors = [];

if (String(counter.id || "") !== counterId) errors.push(`API вернул другой счётчик: ${counter.id || "не указан"}`);
if (!new Set(["own", "edit", "view"]).has(counter.permission)) errors.push(`Неожиданный доступ: ${counter.permission || "не указан"}`);
if (counter.code_options?.webvisor === true || counter.webvisor_options?.enabled === true) {
  errors.push("Вебвизор должен оставаться отключённым для юридического сайта");
}

for (const definition of metricaActionGoals) {
  const matches = goals.filter((goal) => goal.type === "action" && actionEvent(goal) === definition.event);
  if (matches.length !== 1) {
    errors.push(`${definition.event}: ожидалась одна action-цель, найдено ${matches.length}`);
    continue;
  }
  const goal = matches[0];
  if (goal.name !== definition.name) errors.push(`${definition.event}: название «${goal.name}», ожидалось «${definition.name}»`);
  if (Boolean(goal.is_favorite) !== definition.favorite) errors.push(`${definition.event}: неверный статус избранной цели`);
}

for (const definition of metricaCompositeGoals) {
  const matches = goals.filter((goal) => goal.type === "step" && goal.name === definition.name);
  if (matches.length !== 1) {
    errors.push(`Воронка «${definition.name}»: ожидалась одна цель, найдено ${matches.length}`);
    continue;
  }
  const expected = definition.steps.map((step) => ({ name: step.name, event: step.event }));
  if (JSON.stringify(stepEvents(matches[0])) !== JSON.stringify(expected)) errors.push(`Воронка «${definition.name}»: неверные шаги`);
  if (Boolean(matches[0].is_favorite) !== definition.favorite) errors.push(`Воронка «${definition.name}»: неверный статус избранной цели`);
}

for (const obsolete of metricaObsoleteGoals) {
  const goal = goals.find((item) => Number(item.id) === Number(obsolete.id));
  if (!goal) continue;
  if (goal.goal_source === "auto") errors.push(`Устаревшая автоцель ${obsolete.id} должна отсутствовать`);
  else if (obsolete.archiveName && (goal.name !== obsolete.archiveName || Boolean(goal.is_favorite))) {
    errors.push(`Устаревшая цель ${obsolete.id} должна быть неактивной архивной целью «${obsolete.archiveName}»`);
  }
}

for (const protectedGoal of metricaProtectedGoals) {
  if (!goals.some((goal) => Number(goal.id) === Number(protectedGoal.id))) errors.push(`Отсутствует защищённая цель ${protectedGoal.id}: ${protectedGoal.name}`);
}

const actionSignatures = new Map();
for (const goal of goals.filter((item) => item.type === "action")) {
  const event = actionEvent(goal);
  if (!event) continue;
  actionSignatures.set(event, [...(actionSignatures.get(event) || []), goal.id]);
}
for (const [event, ids] of actionSignatures) {
  if (ids.length > 1) errors.push(`Дублируется action ID ${event}: ${ids.join(", ")}`);
}
const favoriteGoals = goals.filter((goal) => Boolean(goal.is_favorite));
if (favoriteGoals.length !== 1 || actionEvent(favoriteGoals[0]) !== "contact_conversion") {
  errors.push(`Главной должна быть только contact_conversion; сейчас: ${favoriteGoals.map((goal) => `${goal.id}:${goal.name}`).join(", ") || "нет"}`);
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
    webvisor_enabled: counter.code_options?.webvisor === true || counter.webvisor_options?.enabled === true,
  },
  totals: {
    goals: goals.length,
    managed_actions: metricaActionGoals.length,
    managed_funnels: metricaCompositeGoals.length,
    favorites: favoriteGoals.length,
    errors: errors.length,
  },
  errors,
  safety: { read_only: true, token_in_report: false },
};
await mkdir(reportsDir, { recursive: true });
await writeFile(join(reportsDir, "metrica-state.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Metrica state passed: counter ${counterId}, ${goals.length} goals, ${metricaActionGoals.length} managed actions, ${metricaCompositeGoals.length} funnels, Webvisor disabled`);
