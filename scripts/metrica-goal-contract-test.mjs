import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  metricaActionGoals,
  metricaCompositeGoals,
  metricaObsoleteGoals,
  metricaProtectedGoals,
} from "../src/metrica-goals.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const sources = {
  app: await readFile(join(root, "src", "app.js"), "utf8"),
  conversion: await readFile(join(root, "public", "assets", "conversion-analytics.mjs"), "utf8"),
  channel: await readFile(join(root, "public", "assets", "channel-analytics.mjs"), "utf8"),
  button: await readFile(join(root, "public", "assets", "button-analytics.mjs"),
  editorial: await readFile(join(root, "public", "assets", "editorial-analytics.mjs"), "utf8"),
};

const eventSources = new Map([
  ["contact_conversion", ["conversion"]],
  ["contact_action", ["conversion"]],
  ["cta_click", ["conversion"]],
  ["cta_view", ["conversion"]],
  ["contact_click", ["app"]],
  ["messenger_dialog_open", ["app"]],
  ["button_action", ["button"]],
  ["contact_whatsapp", ["channel"]],
  ["contact_telegram", ["channel"]],
  ["contact_phone", ["channel"]],
  ["contact_email", ["channel"]],
  ["contact_map", ["channel"]],
]);

const editorialEventImplemented = (event) => {
  if (sources.editorial.includes(event)) return true;
  const scroll = event.match(/^publication_scroll_(25|50|75|90|100)$/);
  if (scroll) {
    return sources.editorial.includes("`publication_scroll_${threshold}`")
      && sources.editorial.includes("[25, 50, 75, 90, 100]")
      && sources.editorial.includes(scroll[1]);
  }
  const active = event.match(/^publication_active_(30|60|120)s$/);
  if (active) {
    return sources.editorial.includes("`publication_active_${threshold}s`")
      && sources.editorial.includes("[30, 60, 120]")
      && sources.editorial.includes(active[1]);
  }
  return false;
};

for (const goal of metricaActionGoals) {
  if (!goal.event || !goal.name || typeof goal.favorite !== "boolean" || !goal.role) {
    errors.push(`Некорректное описание action-цели: ${JSON.stringify(goal)}`);
    continue;
  }
  const expectedSources = eventSources.get(goal.event)
    || (goal.event.startsWith("publication_") ? ["editorial"] : []);
  if (!expectedSources.length) {
    errors.push(`${goal.event}: не определён источник события`);
    continue;
  }
  const implemented = goal.event.startsWith("publication_")
    ? editorialEventImplemented(goal.event)
    : expectedSources.some((source) => sources[source].includes(goal.event));
  if (!implemented) errors.push(`${goal.event}: событие отсутствует в ожидаемом клиентском модуле ${expectedSources.join(", ")}`);
}

const actionEvents = new Set(metricaActionGoals.map((goal) => goal.event));
if (actionEvents.size !== metricaActionGoals.length) errors.push("В модели Метрики повторяются event ID action-целей");
const primary = metricaActionGoals.filter((goal) => goal.favorite);
if (primary.length !== 1 || primary[0].event !== "contact_conversion") {
  errors.push("Единственной избранной целью должна быть contact_conversion");
}

for (const funnel of metricaCompositeGoals) {
  if (!funnel.name || funnel.steps.length < 2 || funnel.steps.length > 5) errors.push(`${funnel.name || "Воронка"}: нужно 2–5 шагов`);
  for (const step of funnel.steps) {
    if (!actionEvents.has(step.event)) errors.push(`${funnel.name}: шаг ${step.event} отсутствует среди управляемых action-целей`);
  }
}

for (const obsolete of metricaObsoleteGoals) {
  if (!obsolete.id || !obsolete.name || !obsolete.reason) errors.push(`Некорректное описание устаревшей цели: ${JSON.stringify(obsolete)}`);
  if (obsolete.event && Object.values(sources).some((source) => source.includes(obsolete.event))) {
    errors.push(`${obsolete.event}: устаревшее событие осталось в клиентском коде`);
  }
}
for (const protectedGoal of metricaProtectedGoals) {
  if (!protectedGoal.id || !protectedGoal.name || !protectedGoal.reason) errors.push(`Некорректная защищённая цель: ${JSON.stringify(protectedGoal)}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Metrica goal contract passed: ${metricaActionGoals.length} action goals, ${metricaCompositeGoals.length} funnels, ${metricaObsoleteGoals.length} controlled obsolete goals`);
