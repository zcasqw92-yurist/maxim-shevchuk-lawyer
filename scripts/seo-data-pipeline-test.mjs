import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "config", "seo-data-pipeline.json"), "utf8"));
const cache = JSON.parse(await readFile(join(root, "data", "seo", "wordstat-cache.json"), "utf8"));
const script = await readFile(join(root, "scripts", "seo-data-pipeline.mjs"), "utf8");

assert.equal(config.cache_ttl_days, 30, "Wordstat-кеш должен действовать 30 дней");
assert.equal(config.max_api_calls_per_cluster, 3, "На кластер допускается не более трёх API-вызовов");
assert.equal(config.max_primary_calls, 1, "Основной Wordstat-запрос должен быть один");
assert.equal(config.max_refinement_calls, 2, "Уточняющих запросов должно быть не более двух");
assert.ok(config.stop_rules.length >= 5, "Должны быть зафиксированы правила остановки исследования");
assert.ok(config.blacklist_patterns.length >= 3, "Должен быть чёрный список бесполезных интентов");
assert.ok(config.hypotheses.every((item) => item.reason && item.content_id && item.phrase), "У каждой гипотезы должны быть ID, фраза и причина проверки");
assert.ok(script.includes("wordstat_not_called_on_feedback_schedule: true"), "Плановый сбор статистики не должен вызывать Wordstat");
assert.ok(script.includes("raw_responses_saved: false"), "Сырые API-ответы не должны сохраняться");
assert.ok(script.includes("secrets_saved: false") || script.includes("tokens_saved: false"), "Секреты не должны сохраняться в отчётах");

const cacheEntry = cache.entries["topRequests|вернуть долг без расписки|213|DEVICE_ALL"];
assert.ok(cacheEntry, "Первый подтверждённый кластер должен находиться в кеше");
assert.equal(cacheEntry.total_count, 89, "Должна быть сохранена подтверждённая частотность C-001");
assert.equal(cacheEntry.api_calls, 1, "Для C-001 должен быть сохранён один API-вызов");

const stateDir = await mkdtemp(join(tmpdir(), "seo-pipeline-test-"));
try {
  const result = spawnSync(process.execPath, [
    join(root, "scripts", "seo-data-pipeline.mjs"),
    "--mode=wordstat",
    "--hypothesis=C-001",
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SEO_STATE_DIR: stateDir,
      SEO_NOW: "2026-07-31T00:00:00.000Z",
      YANDEX_SEARCH_API_KEY: "",
    },
  });
  assert.equal(result.status, 0, `Кешированный запуск должен проходить без API-ключа: ${result.stderr}`);
  const report = JSON.parse(await readFile(join(stateDir, "wordstat-latest.json"), "utf8"));
  assert.equal(report.totals.api_calls, 0, "Свежий кеш должен исключать повторный платный запрос");
  assert.equal(report.totals.cache_hits, 1, "C-001 должен быть получен из кеша");
  assert.equal(report.clusters[0].calls[0].source, "cache", "Источник результата должен быть обозначен как кеш");
} finally {
  await rm(stateDir, { recursive: true, force: true });
}

console.log("SEO data pipeline contract passed: cache, call limits, stop rules and safe reporting are enforced");
