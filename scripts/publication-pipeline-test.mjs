import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";
import { services } from "../src/data.mjs";
import { articles, practiceCases } from "../src/editorial-data.mjs";
import { validatePublicationPipeline } from "../src/publication-pipeline.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];

validatePublicationPipeline({ articles, practiceCases, services });

const article = articles[0];
const practiceCase = practiceCases[0];
const articleRoute = `/razbory/${article.slug}/`;
const caseRoute = `/praktika/${practiceCase.slug}/`;
const pageFile = (route) => join(dist, route.replace(/^\/+|\/+$/g, ""), "index.html");
const expectedHelpfulnessOrder = ["yes", "no", "partly"];

for (const route of [articleRoute, caseRoute]) {
  const html = await readFile(pageFile(route), "utf8");
  if (!html.includes('rel="alternate" type="application/rss+xml"')) errors.push(`${route}: RSS discovery link is missing`);
  if (!html.includes('/assets/editorial-analytics.mjs?v=')) errors.push(`${route}: editorial analytics module is missing or not versioned`);
  if (!html.includes('data-publication-kind=')) errors.push(`${route}: publication kind marker is missing`);
  if (!html.includes('data-editorial-helpfulness')) errors.push(`${route}: helpfulness block is missing`);
  if (/<(?:form|input|select|textarea)\b/i.test(html)) errors.push(`${route}: data-entry element appeared in publication`);

  const actualHelpfulnessOrder = [...html.matchAll(/data-helpfulness-value="(yes|no|partly)"/g)].map((match) => match[1]);
  if (JSON.stringify(actualHelpfulnessOrder) !== JSON.stringify(expectedHelpfulnessOrder)) {
    errors.push(`${route}: helpfulness buttons must be ordered yes, no, partly; got ${actualHelpfulnessOrder.join(", ")}`);
  }
  const initialPressedStates = [...html.matchAll(/aria-pressed="(true|false)"\s+data-helpfulness-value=/g)].map((match) => match[1]);
  if (initialPressedStates.length !== 3 || initialPressedStates.some((value) => value !== "false")) {
    errors.push(`${route}: helpfulness buttons must expose three initial aria-pressed=false states`);
  }
}

const articleHtml = await readFile(pageFile(articleRoute), "utf8");
for (const marker of [
  'id="self-check"',
  'id="message-guide"',
  "Что подготовить для предметного первого сообщения",
  "Что можно спросить у юриста",
  "Что написать юристу",
  'data-helpfulness-value="yes"',
  'data-helpfulness-value="no"',
  'data-helpfulness-value="partly"',
]) {
  if (!articleHtml.includes(marker)) errors.push(`${articleRoute}: missing publication marker ${marker}`);
}

const manifest = JSON.parse(await readFile(join(dist, "editorial-publications.json"), "utf8"));
if (manifest.schemaVersion !== 1) errors.push("editorial-publications.json: unsupported schemaVersion");
if (manifest.counts?.articles !== articles.length || manifest.counts?.practiceCases !== practiceCases.length) {
  errors.push("editorial-publications.json: publication counts mismatch");
}
if (manifest.articles?.some((item) => item.status !== "published") || manifest.practiceCases?.some((item) => item.status !== "published")) {
  errors.push("editorial-publications.json: non-published entry exposed");
}

const expectedSitemaps = [
  "sitemap.xml",
  "sitemap-pages.xml",
  "sitemap-services.xml",
  "sitemap-articles.xml",
  "sitemap-cases.xml",
  "sitemap-images.xml",
];
for (const file of expectedSitemaps) {
  await access(join(dist, file)).catch(() => errors.push(`${file}: file is missing`));
}
const articleSitemap = await readFile(join(dist, "sitemap-articles.xml"), "utf8");
if (!articleSitemap.includes(`${site.siteUrl}${articleRoute}`)) errors.push("sitemap-articles.xml: article URL is missing");
const caseSitemap = await readFile(join(dist, "sitemap-cases.xml"), "utf8");
if (!caseSitemap.includes(`${site.siteUrl}${caseRoute}`)) errors.push("sitemap-cases.xml: case URL is missing");
const imageSitemap = await readFile(join(dist, "sitemap-images.xml"), "utf8");
if (!imageSitemap.includes("<image:image>")) errors.push("sitemap-images.xml: image entries are missing");

const robots = await readFile(join(dist, "robots.txt"), "utf8");
if (site.production) {
  for (const file of expectedSitemaps) {
    if (!robots.includes(`Sitemap: ${site.siteUrl}/${file}`)) errors.push(`robots.txt: ${file} is not declared`);
  }
}

const feed = await readFile(join(dist, "feed.xml"), "utf8");
for (const marker of [
  'xmlns:atom="http://www.w3.org/2005/Atom"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  '<atom:link ',
  '<dc:creator>',
  `${site.siteUrl}${articleRoute}`,
]) {
  if (!feed.includes(marker)) errors.push(`feed.xml: missing ${marker}`);
}

const analytics = await readFile(join(dist, "assets", "editorial-analytics.mjs"), "utf8");
for (const marker of [
  "publication_scroll_${threshold}",
  "publication_active_${threshold}s",
  "publication_section_view",
  "publication_helpfulness",
  "analytics_consent",
  'helpfulness.dataset.submitted = "true"',
  "Аналитика отключена настройками конфиденциальности",
]) {
  if (!analytics.includes(marker)) errors.push(`editorial-analytics.mjs: missing ${marker}`);
}
for (const forbidden of ["FormData", "document.cookie", "fetch(", "XMLHttpRequest", "textContent.slice"]) {
  if (analytics.includes(forbidden)) errors.push(`editorial-analytics.mjs: forbidden collection or transport marker ${forbidden}`);
}

const mobileActions = await readFile(join(root, "src", "mobile-actions.mjs"), "utf8");
if (mobileActions.includes("navigation-discovery")) errors.push("mobile-actions.mjs: navigation is still coupled to mobile CTA");
const build = await readFile(join(root, "scripts", "build.mjs"), "utf8");
if (!build.includes("injectNavigationDiscovery(withVideo")) errors.push("build.mjs: navigation is not an explicit build stage");
if (!build.includes("injectEditorialEnhancements(withNavigation")) errors.push("build.mjs: editorial enhancements are not an explicit build stage");

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Publication pipeline passed: ${articles.length} articles, ${practiceCases.length} cases, accessible fixed helpfulness order, truthful privacy status, RSS discovery, supplemental sitemaps, anonymous reading analytics and direct build stages`);
