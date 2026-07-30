import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";
import { services } from "../src/data.mjs";
import { articles, practiceCases } from "../src/editorial-data.mjs";
import { validatePublicationLinking } from "../src/publication-linking.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];
const base = site.basePath || "";
const href = (pathname) => `${base}${pathname}`;
const articlePath = (item) => `/razbory/${item.slug}/`;
const casePath = (item) => `/praktika/${item.slug}/`;
const servicePath = (item) => `/uslugi/${item.slug}/`;
const pageFile = (pathname) => pathname === "/" ? join(dist, "index.html") : join(dist, pathname.replace(/^\/+|\/+$/g, ""), "index.html");
const readPage = (pathname) => readFile(pageFile(pathname), "utf8");
const hasHref = (html, pathname) => html.includes(`href="${href(pathname)}"`) || html.includes(`href="${pathname}"`);

validatePublicationLinking({ services, articles, practiceCases });

const articleIndex = await readPage("/razbory/");
const practiceIndex = await readPage("/praktika/");
const sitemap = await readFile(join(dist, "sitemap.xml"), "utf8");
const feed = await readFile(join(dist, "feed.xml"), "utf8");

for (const service of services) {
  const html = await readPage(servicePath(service));
  const serviceArticles = articles.filter((item) => item.serviceSlug === service.slug);
  const serviceCases = practiceCases.filter((item) => item.serviceSlug === service.slug);
  if (serviceArticles.length && !html.includes("publication-linking--service")) errors.push(`${service.slug}: отсутствует автоматический блок публикаций`);
  for (const article of serviceArticles) if (!hasHref(html, articlePath(article))) errors.push(`${service.slug}: не отображается статья ${article.slug}`);
  for (const item of serviceCases) if (!hasHref(html, casePath(item))) errors.push(`${service.slug}: не отображается кейс ${item.slug}`);
}

for (const article of articles) {
  const path = articlePath(article);
  const html = await readPage(path);
  const service = services.find((item) => item.slug === article.serviceSlug);
  const peers = articles.filter((item) => item.serviceSlug === article.serviceSlug && item.slug !== article.slug);
  const cases = practiceCases.filter((item) => item.serviceSlug === article.serviceSlug);
  if (!service || !hasHref(html, servicePath(service))) errors.push(`${article.slug}: отсутствует ссылка на связанную услугу`);
  if (!hasHref(articleIndex, path)) errors.push(`${article.slug}: отсутствует в индексе разборов`);
  if (!sitemap.includes(`${site.siteUrl}${path}`)) errors.push(`${article.slug}: отсутствует в sitemap`);
  if (!feed.includes(`${site.siteUrl}${path}`)) errors.push(`${article.slug}: отсутствует в RSS`);
  if (peers.length && !peers.some((item) => hasHref(html, articlePath(item)))) errors.push(`${article.slug}: отсутствует ссылка на соседний разбор направления`);
  if (cases.length && !cases.some((item) => hasHref(html, casePath(item)))) errors.push(`${article.slug}: отсутствует ссылка на практику направления`);
}

for (const item of practiceCases) {
  const path = casePath(item);
  const html = await readPage(path);
  const service = services.find((entry) => entry.slug === item.serviceSlug);
  const serviceArticles = articles.filter((article) => article.serviceSlug === item.serviceSlug);
  if (!service || !hasHref(html, servicePath(service))) errors.push(`${item.slug}: отсутствует ссылка на связанную услугу`);
  if (!hasHref(practiceIndex, path)) errors.push(`${item.slug}: отсутствует в индексе практики`);
  if (!sitemap.includes(`${site.siteUrl}${path}`)) errors.push(`${item.slug}: отсутствует в sitemap`);
  if (serviceArticles.length && !serviceArticles.some((article) => hasHref(html, articlePath(article)))) errors.push(`${item.slug}: отсутствует ссылка на разбор направления`);
  if (service) {
    const expectedTopic = `похожая ситуация: ${service.name.toLowerCase()}`;
    if (!html.includes(`data-topic="${expectedTopic}"`)) errors.push(`${item.slug}: итоговый CTA не соответствует направлению ${service.slug}`);
  }
}

const knownRoutes = new Set([
  "/",
  "/uslugi/",
  ...services.map(servicePath),
  "/razbory/",
  ...articles.map(articlePath),
  "/praktika/",
  ...practiceCases.map(casePath),
  "/o-yuriste/",
  "/kontakty/",
  "/politika-konfidencialnosti/",
]);
const pageRoutes = [...knownRoutes];
const ignoredPrefixes = ["/assets/", "/favicon", "/site.webmanifest", "/feed.xml", "/sitemap", "/robots.txt"];
const normalizeRoute = (value) => {
  let route = value.replaceAll("&amp;", "&").split(/[?#]/, 1)[0];
  if (base && route.startsWith(`${base}/`)) route = route.slice(base.length);
  if (!route.startsWith("/") || ignoredPrefixes.some((prefix) => route.startsWith(prefix))) return "";
  if (route === "/") return route;
  return route.endsWith("/") ? route : `${route}/`;
};

for (const route of pageRoutes) {
  const html = await readPage(route);
  for (const match of html.matchAll(/\bhref="([^"]+)"/g)) {
    const target = normalizeRoute(match[1]);
    if (target && !knownRoutes.has(target)) errors.push(`${route}: внутренняя ссылка ведёт на несуществующий маршрут ${target}`);
  }
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Publication linking passed: ${services.length} services, ${articles.length} articles and ${practiceCases.length} cases are connected without orphan or broken routes`);
