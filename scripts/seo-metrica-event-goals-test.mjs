import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = join(root, "scripts", "seo-metrica-event-goals.mjs");
const script = await readFile(scriptPath, "utf8");
const workflow = await readFile(join(root, ".github", "workflows", "seo-data-pipeline.yml"), "utf8");

assert.ok(script.includes('dimensions: "ym:ep:eventURLPath,ym:ep:actionGoal"'), "URL и цель должны группироваться в одном event-отчёте");
assert.ok(script.includes('metrics: "ym:ep:eventsNumber"'), "Счётчик должен использовать совместимую event-метрику");
assert.ok(!script.includes("ym:ev:goal"), "Нельзя смешивать event URL и visit goal metric");
assert.ok(script.includes("event_url_action_goal"), "Отчёт должен явно фиксировать точную атрибуцию цели");
assert.match(workflow, /seo-feedback-enrichment\.mjs[\s\S]*seo-metrica-event-goals\.mjs/, "Точная атрибуция должна выполняться после базового обогащения");

const syntax = spawnSync(process.execPath, ["--check", scriptPath], { cwd: root, encoding: "utf8" });
assert.equal(syntax.status, 0, `Скрипт должен быть синтаксически корректным: ${syntax.stderr}`);

const stateDir = await mkdtemp(join(tmpdir(), "seo-metrica-goals-test-"));
try {
  await writeFile(join(stateDir, "feedback-latest.json"), `${JSON.stringify({
    period: { date1: "2026-07-07", date2: "2026-08-05" },
    publications: [],
    clusters: [],
    metrica: {},
  }, null, 2)}\n`, "utf8");
  const run = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SEO_STATE_DIR: stateDir, YANDEX_METRICA_OAUTH_TOKEN: "" },
  });
  assert.equal(run.status, 0, `Без токена скрипт должен завершаться безопасно: ${run.stderr}`);
  assert.match(run.stdout, /skipped/, "Без токена причина пропуска должна быть видна");
} finally {
  await rm(stateDir, { recursive: true, force: true });
}

console.log("Metrica event-goal attribution contract passed: compatible event dimensions and metrics are enforced");
