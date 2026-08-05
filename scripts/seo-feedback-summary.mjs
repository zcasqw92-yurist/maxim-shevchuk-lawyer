import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = resolve(String(process.env.SEO_STATE_DIR || join(root, "reports", "seo-data")));
const reportPath = join(stateDir, "feedback-latest.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const clusters = Array.isArray(report.clusters) ? report.clusters : [];
const publications = Array.isArray(report.publications) ? report.publications : [];
const google = report.google_search_console || { available: false, status: "not_configured" };
const exactMetrica = report?.metrica?.exact_attribution || { available: false, status: "not_configured" };

const totals = clusters.reduce((result, cluster) => {
  const current = cluster?.totals || {};
  result.pages += Number(current.pages || 0);
  result.pagesInSearch += Number(current.pages_in_search || 0);
  result.yandexShows += Number(current.yandex_shows ?? current.shows ?? 0);
  result.yandexClicks += Number(current.yandex_clicks ?? current.clicks ?? 0);
  result.googleImpressions += Number(current.google_impressions || 0);
  result.googleClicks += Number(current.google_clicks || 0);
  result.shows += Number(current.shows || 0);
  result.clicks += Number(current.clicks || 0);
  result.visits += Number(current.visits || 0);
  result.pageviews += Number(current.pageviews || 0);
  result.contactConversions += Number(current.contact_conversions || 0);
  return result;
}, {
  pages: 0,
  pagesInSearch: 0,
  yandexShows: 0,
  yandexClicks: 0,
  googleImpressions: 0,
  googleClicks: 0,
  shows: 0,
  clicks: 0,
  visits: 0,
  pageviews: 0,
  contactConversions: 0,
});

const servicePages = clusters.flatMap((cluster) => (cluster.pages || [])
  .filter((page) => String(page.url || "").startsWith("/uslugi/"))
  .map((page) => page.url));

const googleStatus = google.available
  ? `подключена, ресурс ${google.site_url || "определён"}`
  : `не используется (${google.status || "не настроена"})`;
const metricaStatus = exactMetrica.available
  ? `страницы: ${exactMetrica.page_attribution}; цели: ${exactMetrica.goal_attribution}`
  : `точная атрибуция недоступна (${exactMetrica.status || "не настроена"})`;

const lines = [
  "# SEO feedback snapshot",
  "",
  `- Период Метрики: ${report?.period?.date1 || ""}—${report?.period?.date2 || ""}`,
  `- Запросы Вебмастера по страницам: ${report?.webmaster?.query_period || ""}`,
  `- Google Search Console: ${googleStatus}`,
  `- Атрибуция Метрики: ${metricaStatus}`,
  `- Страниц в общем отчёте: ${publications.length}`,
  `- Контрольных кластеров: ${clusters.length}`,
  `- Страниц в контрольных кластерах: ${totals.pages}`,
  `- Страниц кластеров в поиске Яндекса: ${totals.pagesInSearch}`,
  `- Показы Яндекса: ${totals.yandexShows}`,
  `- Клики Яндекса: ${totals.yandexClicks}`,
  `- Показы Google: ${totals.googleImpressions}`,
  `- Клики Google: ${totals.googleClicks}`,
  `- Показы двух поисковиков: ${totals.shows}`,
  `- Клики двух поисковиков: ${totals.clicks}`,
  `- Входные визиты кластеров: ${totals.visits}`,
  `- Просмотры страниц кластеров: ${totals.pageviews}`,
  `- Переходы к контакту из кластеров: ${totals.contactConversions}`,
  `- Коммерческие страницы в контроле: ${servicePages.join(", ") || "нет"}`,
  "",
];

for (const cluster of clusters) {
  const current = cluster?.totals || {};
  lines.push(
    `## ${cluster.name || cluster.id || "Кластер"}`,
    `- Страниц: ${Number(current.pages || 0)}`,
    `- В поиске Яндекса: ${Number(current.pages_in_search || 0)}`,
    `- Показы Яндекса: ${Number(current.yandex_shows ?? current.shows ?? 0)}`,
    `- Клики Яндекса: ${Number(current.yandex_clicks ?? current.clicks ?? 0)}`,
    `- Показы Google: ${Number(current.google_impressions || 0)}`,
    `- Клики Google: ${Number(current.google_clicks || 0)}`,
    `- Входные визиты: ${Number(current.visits || 0)}`,
    `- Просмотры страниц: ${Number(current.pageviews || 0)}`,
    `- Переходы к контакту: ${Number(current.contact_conversions || 0)}`,
    "",
  );
}

if (!google.available) {
  lines.push(`- Для Google требуется доступ: ${google.error || "сервисный аккаунт не настроен"}.`);
}
if (exactMetrica.goal_attribution === "landing_page_fallback") {
  lines.push(`- Цели Метрики временно привязаны к странице входа: ${exactMetrica.goal_error || "точный отчёт недоступен"}.`);
}
lines.push(
  "- Wordstat при feedback-сборе не вызывается.",
  "- При малой выборке страницы автоматически не переписываются.",
  "",
);

await writeFile(join(stateDir, "summary.md"), lines.join("\n"), "utf8");
console.log(`SEO feedback summary: clusters=${clusters.length}, cluster_pages=${totals.pages}, visits=${totals.visits}, google=${google.status}`);
