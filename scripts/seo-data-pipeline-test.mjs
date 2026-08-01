import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "config", "seo-data-pipeline.json"), "utf8"));
const cache = JSON.parse(await readFile(join(root, "data", "seo", "wordstat-cache.json"), "utf8"));
const wordstatScript = await readFile(join(root, "scripts", "seo-data-pipeline.mjs"), "utf8");
const feedbackScriptPath = join(root, "scripts", "seo-feedback-pipeline.mjs");
const feedbackScript = await readFile(feedbackScriptPath, "utf8");
const workflow = await readFile(join(root, ".github", "workflows", "seo-data-pipeline.yml"), "utf8");

assert.equal(config.schema_version, 2, "Конфигурация должна использовать схему полного feedback-снимка");
assert.equal(config.cache_ttl_days, 30, "Wordstat-кеш должен действовать 30 дней");
assert.equal(config.max_api_calls_per_cluster, 3, "На кластер допускается не более трёх API-вызовов");
assert.equal(config.max_primary_calls, 1, "Основной Wordstat-запрос должен быть один");
assert.equal(config.max_refinement_calls, 2, "Уточняющих запросов должно быть не более двух");
assert.ok(config.stop_rules.length >= 5, "Должны быть зафиксированы правила остановки исследования");
assert.ok(config.blacklist_patterns.length >= 3, "Должен быть чёрный список бесполезных интентов");
assert.ok(config.hypotheses.every((item) => item.reason && item.content_id && item.phrase), "У каждой гипотезы должны быть ID, фраза и причина проверки");
assert.ok(config.metrica.goal_events.includes("cta_click"), "Feedback должен учитывать клики CTA");
assert.ok(config.metrica.goal_events.includes("messenger_dialog_open"), "Feedback должен учитывать открытие выбора мессенджера");
assert.ok(config.metrica.goal_events.includes("button_action"), "Feedback должен учитывать общий контроль кнопочных действий");
assert.ok(config.feedback_clusters.length >= 2, "Регулярный feedback должен охватывать не менее двух утверждённых кластеров");

const refundCluster = config.feedback_clusters.find((cluster) => cluster.id === "refund-services");
assert.ok(refundCluster, "Должен быть определён кластер возврата денег за услуги");
assert.equal(refundCluster.pages.length, 4, "Кластер возврата должен содержать коммерческую страницу и три статьи");
const refundPaths = new Set(refundCluster.pages.map((page) => page.path));
for (const path of [
  "/uslugi/vozvrat-deneg/",
  "/razbory/vernut-dengi-za-neokazannuyu-uslugu/",
  "/razbory/otkaz-ot-dogovora-okazaniya-uslug/",
  "/razbory/vernut-dengi-za-navyazannuyu-uslugu/",
]) assert.ok(refundPaths.has(path), `В кластере возврата отсутствует ${path}`);

const policeCluster = config.feedback_clusters.find((cluster) => cluster.id === "police-inactivity");
assert.ok(policeCluster, "Должен быть определён кластер отказа полиции и бездействия МВД");
assert.equal(policeCluster.pages.length, 4, "Полицейский кластер должен содержать услугу, две статьи и кейс");
const policePaths = new Set(policeCluster.pages.map((page) => page.path));
for (const path of [
  "/uslugi/zhaloby-i-obrashcheniya/",
  "/razbory/politsiya-ne-otvechaet-na-zayavlenie/",
  "/razbory/chto-delat-posle-otkaza-policii/",
  "/praktika/otmena-otkazov-policii-i-dopolnitelnaya-proverka/",
]) assert.ok(policePaths.has(path), `В полицейском кластере отсутствует ${path}`);

const trackedClusterPaths = config.feedback_clusters.flatMap((cluster) => cluster.pages.map((page) => page.path));
assert.equal(new Set(trackedClusterPaths).size, trackedClusterPaths.length, "Один URL не должен одновременно принадлежать нескольким feedback-кластерам");
assert.ok(config.feedback_clusters.every((cluster) => cluster.pages.some((page) => page.path.startsWith("/uslugi/"))), "У каждого кластера должна быть коммерческая страница-центр");

assert.ok(wordstatScript.includes("wordstat_not_called_on_feedback_schedule: true"), "Старый Wordstat-конвейер должен сохранять безопасное правило");
assert.ok(wordstatScript.includes("raw_responses_saved: false"), "Сырые API-ответы Wordstat не должны сохраняться");
assert.ok(feedbackScript.includes("/query-analytics/list"), "Feedback должен получать поисковые данные отдельно по URL");
assert.ok(feedbackScript.includes("/search-urls/in-search/samples"), "Feedback должен проверять присутствие страниц в поиске");
assert.ok(feedbackScript.includes("/important-urls"), "Feedback должен читать доступные причины исключения и canonical/duplicate статусы");
assert.ok(feedbackScript.includes("/uslugi/vozvrat-deneg/") || feedbackScript.includes("feedback_clusters"), "Feedback должен включать коммерческие страницы кластеров");
assert.ok(feedbackScript.includes("canonical_matches"), "Feedback должен проверять canonical на публичном домене");
assert.ok(feedbackScript.includes("assistant_assets_present"), "После отката должен контролироваться возврат удалённого помощника");
assert.ok(feedbackScript.includes("sheet-cluster-statistics.csv"), "Должен формироваться отдельный табличный отчёт кластера");
assert.ok(feedbackScript.includes("sheet-content-contact-signals.csv"), "Контактные сигналы должны выгружаться отдельно от подтверждённых обращений");
assert.ok(feedbackScript.includes("raw_responses_saved: false"), "Сырые API-ответы feedback-сбора не должны сохраняться");
assert.ok(feedbackScript.includes("tokens_saved: false"), "Токены не должны сохраняться в отчётах");

const syntax = spawnSync(process.execPath, ["--check", feedbackScriptPath], { cwd: root, encoding: "utf8" });
assert.equal(syntax.status, 0, `Новый feedback-скрипт должен быть синтаксически корректным: ${syntax.stderr}`);

assert.match(workflow, /schedule:[\s\S]*cron:\s*'25 4 \* \* 1'/, "Должен быть еженедельный сбор обратной связи");
assert.match(workflow, /push:[\s\S]*branches:[\s\S]*- main/, "После изменения конвейера должен выполняться контрольный feedback-запуск");
assert.match(workflow, /PIPELINE_MODE:\s*\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.mode \|\| 'feedback' \}\}/, "Все автоматические события должны использовать безопасный режим feedback");
assert.match(workflow, /feedback\)[\s\S]*node scripts\/seo-feedback-pipeline\.mjs/, "Режим feedback должен запускать новый сборщик");
assert.match(workflow, /wordstat\)[\s\S]*node scripts\/seo-data-pipeline\.mjs/, "Режим wordstat должен оставаться отдельным");
assert.match(workflow, /ref:\s*seo-data/, "История должна сохраняться в отдельной ветке seo-data");

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

console.log("SEO feedback contract passed: refund and police clusters, per-page Webmaster data, Metrica funnels, cache limits and safe reporting are enforced");
