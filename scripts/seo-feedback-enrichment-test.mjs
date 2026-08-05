import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = join(root, "scripts", "seo-feedback-enrichment.mjs");
const script = await readFile(scriptPath, "utf8");
const summary = await readFile(join(root, "scripts", "seo-feedback-summary.mjs"), "utf8");
const workflow = await readFile(join(root, ".github", "workflows", "seo-data-pipeline.yml"), "utf8");
const editorialAnalytics = await readFile(join(root, "public", "assets", "editorial-analytics.mjs"), "utf8");

assert.ok(script.includes('dimensions: "ym:pv:URLPath"'), "Просмотры должны группироваться по фактически открытой странице");
assert.ok(script.includes('dimensions: "ym:ep:eventURLPath"'), "Цели должны группироваться по странице события");
assert.ok(script.includes("ym:pv:pageviews,ym:pv:users"), "Нужны pageview-метрики, а не только визиты страницы входа");
assert.ok(script.includes("https://www.googleapis.com/auth/webmasters.readonly"), "Search Console должен использовать только чтение");
assert.ok(script.includes("searchAnalytics/query"), "Должен использоваться официальный Search Analytics endpoint");
assert.ok(script.includes("GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_BASE64"), "Должен поддерживаться безопасный base64-секрет");
assert.ok(script.includes("google_private_key_saved: false"), "Закрытый ключ нельзя сохранять в отчёте");
assert.ok(script.includes("google_access_token_saved: false"), "Access token нельзя сохранять в отчёте");
assert.ok(script.includes("sheet-unified-search-statistics.csv"), "Нужен единый CSV Яндекс + Google + Метрика");
assert.match(workflow, /node scripts\/seo-feedback-pipeline\.mjs[\s\S]*node scripts\/seo-feedback-enrichment\.mjs/, "Обогащение должно выполняться после базового сбора");
assert.match(workflow, /GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON/, "Workflow должен принимать секрет Search Console");
assert.ok(summary.includes("Google Search Console"), "Сводка должна явно показывать статус Google");
assert.ok(summary.includes("Атрибуция Метрики"), "Сводка должна показывать способ атрибуции Метрики");
assert.ok(!editorialAnalytics.includes("recentActivity = activeSeconds < 5"), "Старый пятисекундный счётчик активности должен быть удалён");
assert.ok(editorialAnalytics.includes("activeGraceMs = 45_000"), "Активное чтение должно учитывать разумное окно активности");
assert.ok(editorialAnalytics.includes("pendingYandexEvents"), "События не должны теряться до готовности счётчика Метрики");

const syntax = spawnSync(process.execPath, ["--check", scriptPath], { cwd: root, encoding: "utf8" });
assert.equal(syntax.status, 0, `Скрипт обогащения должен быть синтаксически корректным: ${syntax.stderr}`);

const stateDir = await mkdtemp(join(tmpdir(), "seo-enrichment-test-"));
try {
  const samplePage = {
    content_id: "sample",
    url: "/razbory/sample/",
    title: "Тестовая статья",
    type: "Статья",
    published_at: "2026-08-01",
    in_search: true,
    search_shows: 2,
    search_clicks: 1,
    search_ctr: 50,
    search_avg_position: 3,
    publication_view: 1,
    pageviews: 2,
    visits: 1,
    contact_conversion: 0,
  };
  const sampleReport = {
    generated_at: "2026-08-05T00:00:00.000Z",
    period: { date1: "2026-07-07", date2: "2026-08-05" },
    webmaster: {},
    metrica: { rows: [{ path: samplePage.url, visits: 1, pageviews: 2, users: 1, publication_view: 1 }] },
    publications: [samplePage],
    clusters: [{ id: "sample", name: "Тест", pages: [{ ...samplePage }], totals: {} }],
    rules: {},
    safety: {},
  };
  await writeFile(join(stateDir, "feedback-latest.json"), `${JSON.stringify(sampleReport, null, 2)}\n`, "utf8");
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SEO_STATE_DIR: stateDir,
      YANDEX_METRICA_OAUTH_TOKEN: "",
      GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON: "",
      GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_BASE64: "",
    },
  });
  assert.equal(result.status, 0, `Запуск без секретов должен завершаться безопасно: ${result.stderr}`);
  const enriched = JSON.parse(await readFile(join(stateDir, "feedback-latest.json"), "utf8"));
  assert.equal(enriched.google_search_console.status, "not_configured");
  assert.equal(enriched.metrica.exact_attribution.status, "not_configured");
  assert.equal(enriched.publications[0].combined_search_impressions, 2);
  assert.equal(enriched.clusters[0].totals.shows, 2, "Кластер должен использовать обогащённые публикации");
  assert.equal(enriched.safety.google_private_key_saved, false);
  await readFile(join(stateDir, "sheet-unified-search-statistics.csv"), "utf8");
  await readFile(join(stateDir, "google-search-console-pages.csv"), "utf8");
} finally {
  await rm(stateDir, { recursive: true, force: true });
}

console.log("SEO feedback enrichment contract passed: exact Metrica attribution, optional Search Console and safe unified reporting are enforced");
