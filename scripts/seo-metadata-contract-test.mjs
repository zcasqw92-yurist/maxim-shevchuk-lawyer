import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";
import { seoMetadataContract } from "../src/seo-metadata.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }))).flat();
};

const decode = (value = "") => String(value)
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

const attr = (tag, name) => decode(tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "");
const metaTags = (html, attribute, key) => [...html.matchAll(/<meta\s+[^>]*>/gi)]
  .map((match) => match[0])
  .filter((tag) => attr(tag, attribute) === key);
const linkTags = (html, rel) => [...html.matchAll(/<link\s+[^>]*>/gi)]
  .map((match) => match[0])
  .filter((tag) => attr(tag, "rel").split(/\s+/).includes(rel));
const textOf = (html) => decode(String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const routeFor = (file) => {
  const local = relative(dist, file).split(sep).join("/");
  if (local === "index.html") return "/";
  if (local.endsWith("/index.html")) return `/${local.slice(0, -"index.html".length)}`;
  return `/${local}`;
};
const expectedCanonical = (route) => `${site.siteUrl}${route}`;
const isPublication = (route) => /^\/(?:razbory|praktika)\/[^/]+\/$/.test(route);
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const files = (await walk(dist)).filter((file) => file.endsWith(".html"));
const collected = [];

for (const file of files) {
  const html = await readFile(file, "utf8");
  const route = routeFor(file);
  const robots = attr(metaTags(html, "name", "robots")[0] || "", "content");
  const indexable = robots.split(",").map((value) => value.trim()).includes("index");
  if (!indexable) continue;

  const titleMatches = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)];
  const title = textOf(titleMatches[0]?.[1]);
  const descriptions = metaTags(html, "name", "description");
  const description = attr(descriptions[0] || "", "content");
  const canonicals = linkTags(html, "canonical");
  const canonical = attr(canonicals[0] || "", "href");
  const h1Matches = [...html.matchAll(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/gi)];
  const h1 = textOf(h1Matches[0]?.[1]);

  if (titleMatches.length !== 1) errors.push(`${route}: должен быть ровно один title, найдено ${titleMatches.length}`);
  if (title.length < seoMetadataContract.title.min || title.length > seoMetadataContract.title.max) {
    errors.push(`${route}: title ${title.length} знаков, допустимо ${seoMetadataContract.title.min}–${seoMetadataContract.title.max}`);
  }
  if (!title.includes(site.shortName)) errors.push(`${route}: title не содержит бренд «${site.shortName}»`);
  if (descriptions.length !== 1) errors.push(`${route}: должен быть ровно один meta description, найдено ${descriptions.length}`);
  if (description.length < seoMetadataContract.description.min || description.length > seoMetadataContract.description.max) {
    errors.push(`${route}: description ${description.length} знаков, допустимо ${seoMetadataContract.description.min}–${seoMetadataContract.description.max}`);
  }
  if (canonicals.length !== 1) errors.push(`${route}: должен быть ровно один canonical, найдено ${canonicals.length}`);
  if (canonical !== expectedCanonical(route)) errors.push(`${route}: canonical ${canonical || "отсутствует"}, ожидался ${expectedCanonical(route)}`);
  if (h1Matches.length !== 1 || !h1) errors.push(`${route}: нужен один непустой H1`);

  const requiredMeta = [
    ["property", "og:type"],
    ["property", "og:title"],
    ["property", "og:description"],
    ["property", "og:url"],
    ["property", "og:image"],
    ["property", "og:image:width"],
    ["property", "og:image:height"],
    ["property", "og:image:alt"],
    ["name", "twitter:card"],
    ["name", "twitter:title"],
    ["name", "twitter:description"],
    ["name", "twitter:image"],
    ["name", "twitter:image:alt"],
  ];
  const values = {};
  for (const [attribute, key] of requiredMeta) {
    const tags = metaTags(html, attribute, key);
    if (tags.length !== 1) errors.push(`${route}: ${key} должен присутствовать ровно один раз, найдено ${tags.length}`);
    values[key] = attr(tags[0] || "", "content");
    if (!values[key]) errors.push(`${route}: ${key} не должен быть пустым`);
  }

  if (values["og:title"] !== title) errors.push(`${route}: og:title не совпадает с title`);
  if (values["twitter:title"] !== title) errors.push(`${route}: twitter:title не совпадает с title`);
  if (values["og:description"] !== description) errors.push(`${route}: og:description не совпадает с description`);
  if (values["twitter:description"] !== description) errors.push(`${route}: twitter:description не совпадает с description`);
  if (values["og:url"] !== canonical) errors.push(`${route}: og:url не совпадает с canonical`);
  if (values["twitter:card"] !== "summary_large_image") errors.push(`${route}: twitter:card должен быть summary_large_image`);

  const jsonLdMatches = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  if (jsonLdMatches.length !== 1) errors.push(`${route}: должен быть один JSON-LD graph, найдено ${jsonLdMatches.length}`);
  let graph = [];
  try {
    const parsed = JSON.parse(jsonLdMatches[0]?.[1] || "{}");
    graph = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
  } catch (error) {
    errors.push(`${route}: JSON-LD не разбирается (${error.message})`);
  }

  const webPage = graph.find((node) => ["WebPage", "ProfilePage", "ContactPage", "CollectionPage"].includes(node["@type"]));
  if (!webPage) errors.push(`${route}: в JSON-LD отсутствует WebPage или его подтип`);
  else {
    if (webPage.name !== title) errors.push(`${route}: WebPage.name не совпадает с title`);
    if (webPage.description !== description) errors.push(`${route}: WebPage.description не совпадает с description`);
    if (webPage.url !== canonical) errors.push(`${route}: WebPage.url не совпадает с canonical`);
  }

  const publication = isPublication(route);
  const articleTags = {
    published: metaTags(html, "property", "article:published_time"),
    modified: metaTags(html, "property", "article:modified_time"),
    author: metaTags(html, "property", "article:author"),
    section: metaTags(html, "property", "article:section"),
  };

  if (publication) {
    if (values["og:type"] !== "article") errors.push(`${route}: публикация должна иметь og:type=article`);
    for (const [key, tags] of Object.entries(articleTags)) {
      if (tags.length !== 1 || !attr(tags[0] || "", "content")) errors.push(`${route}: article:${key} должен быть заполнен ровно один раз`);
    }
    const published = attr(articleTags.published[0] || "", "content");
    const modified = attr(articleTags.modified[0] || "", "content");
    if (!validDate(published) || !validDate(modified)) errors.push(`${route}: article dates должны быть YYYY-MM-DD`);
    const articleNode = graph.find((node) => node["@type"] === "Article");
    if (!articleNode) errors.push(`${route}: отсутствует Article в JSON-LD`);
    else {
      if (articleNode.headline !== h1) errors.push(`${route}: Article.headline не совпадает с H1`);
      if (articleNode.description !== description) errors.push(`${route}: Article.description не совпадает с description`);
      if (articleNode.datePublished !== published) errors.push(`${route}: Article.datePublished не совпадает с Open Graph`);
      if (articleNode.dateModified !== modified) errors.push(`${route}: Article.dateModified не совпадает с Open Graph`);
      if (articleNode.mainEntityOfPage?.["@id"] !== webPage?.["@id"]) errors.push(`${route}: Article.mainEntityOfPage не связан с WebPage`);
    }
  } else {
    if (values["og:type"] !== "website") errors.push(`${route}: обычная страница должна иметь og:type=website`);
    if (Object.values(articleTags).some((tags) => tags.length)) errors.push(`${route}: article:* метаданные не должны присутствовать на обычной странице`);
  }

  collected.push({ route, title, description });
}

for (const field of ["title", "description"]) {
  const groups = new Map();
  for (const page of collected) groups.set(page[field], [...(groups.get(page[field]) || []), page.route]);
  for (const [value, routes] of groups) {
    if (value && routes.length > 1) errors.push(`Дублируется ${field}: ${routes.join(", ")}`);
  }
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`SEO metadata passed: ${collected.length} indexable pages, unique bounded titles and descriptions, synchronized canonical, Open Graph, Twitter and JSON-LD`);
