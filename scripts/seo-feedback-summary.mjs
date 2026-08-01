import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = resolve(String(process.env.SEO_STATE_DIR || join(root, "reports", "seo-data")));
const reportPath = join(stateDir, "feedback-latest.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const clusters = Array.isArray(report.clusters) ? report.clusters : [];
const publications = Array.isArray(report.publications) ? report.publications : [];

const totals = clusters.reduce((result, cluster) => {
  const current = cluster?.totals || {};
  result.pages += Number(current.pages || 0);
  result.pagesInSearch += Number(current.pages_in_search || 0);
  result.shows += Number(current.shows || 0);
  result.clicks += Number(current.clicks || 0);
  result.visits += Number(current.visits || 0);
  result.contactConversions += Number(current.contact_conversions || 0);
  return result;
}, {
  pages: 0,
  pagesInSearch: 0,
  shows: 0,
  clicks: 0,
  visits: 0,
  contactConversions: 0,
});

const servicePages = clusters.flatMap((cluster) => (cluster.pages || [])
  .filter((page) => String(page.url || "").startsWith("/uslugi/"))
  .map((page) => page.url));

const lines = [
  "# SEO feedback snapshot",
  "",
  `- Период Метрики: ${report?.period?.date1 || ""}—${report?.period?.date2 || ""}`,
  `- Запросы Вебмастера по страницам: ${report?.webmaster?.query_period || ""}`,
  `- Страниц в общем отчёте: ${publications.length}`,
  `- Контрольных кластеров: ${clusters.length}`,
  `- Страниц в контрольных кластерах: ${totals.pages}`,
  `- Страниц кластеров в поиске: ${totals.pagesInSearch}`,
  `- Показы кластеров: ${totals.shows}`,
  `- Клики кластеров: ${totals.clicks}`,
  `- Визиты кластеров: ${totals.visits}`,
  `- Переходы к контакту из кластеров: ${totals.contactConversions}`,
  `- Коммерческие страницы в контроле: ${servicePages.join(", ") || "нет"}`,
  "",
];

for (const cluster of clusters) {
  const current = cluster?.totals || {};
  lines.push(
    `## ${cluster.name || cluster.id || "Кластер"}`,
    `- Страниц: ${Number(current.pages || 0)}`,
    `- В поиске: ${Number(current.pages_in_search || 0)}`,
    `- Показы: ${Number(current.shows || 0)}`,
    `- Клики: ${Number(current.clicks || 0)}`,
    `- Визиты: ${Number(current.visits || 0)}`,
    `- Переходы к контакту: ${Number(current.contact_conversions || 0)}`,
    "",
  );
}

lines.push(
  "- Wordstat при feedback-сборе не вызывается.",
  "- При малой выборке страницы автоматически не переписываются.",
  "",
);

await writeFile(join(stateDir, "summary.md"), lines.join("\n"), "utf8");
console.log(`SEO feedback summary: clusters=${clusters.length}, cluster_pages=${totals.pages}, visits=${totals.visits}`);
