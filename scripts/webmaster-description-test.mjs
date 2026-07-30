import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";

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
const routeFor = (file) => {
  const local = relative(dist, file).split(sep).join("/");
  if (local === "index.html") return "/";
  if (local.endsWith("/index.html")) return `/${local.slice(0, -"index.html".length)}`;
  return `/${local}`;
};

const htmlFiles = (await walk(dist)).filter((file) => file.endsWith(".html"));
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const route = routeFor(file);
  const descriptions = metaTags(html, "name", "description");
  const description = attr(descriptions[0] || "", "content").trim();

  if (descriptions.length !== 1) errors.push(`${route}: должен быть ровно один meta description, найдено ${descriptions.length}`);
  if (!description) errors.push(`${route}: meta description не должен быть пустым`);
}

for (const [pathname, destination] of Object.entries(site.legacyRedirects || {})) {
  const file = join(dist, pathname, "index.html");
  let html = "";
  try {
    html = await readFile(file, "utf8");
  } catch {
    errors.push(`${pathname}: legacy redirect не создан`);
    continue;
  }

  const robots = attr(metaTags(html, "name", "robots")[0] || "", "content");
  const refresh = attr(metaTags(html, "http-equiv", "refresh")[0] || "", "content");
  const canonical = attr(linkTags(html, "canonical")[0] || "", "href");
  const expectedCanonical = `${site.siteUrl}${destination}`;
  const expectedLocalDestination = `${site.basePath || ""}${destination}`;

  if (robots !== "noindex,follow") errors.push(`${pathname}: redirect должен иметь robots=noindex,follow`);
  if (refresh !== `0;url=${expectedLocalDestination}`) errors.push(`${pathname}: неверный meta refresh ${refresh || "отсутствует"}`);
  if (canonical !== expectedCanonical) errors.push(`${pathname}: canonical ${canonical || "отсутствует"}, ожидался ${expectedCanonical}`);
}

const requiredLegacyRoutes = {
  "/blog/": "/razbory/",
  "/услуги/": "/uslugi/",
};
for (const [pathname, destination] of Object.entries(requiredLegacyRoutes)) {
  if (site.legacyRedirects?.[pathname] !== destination) {
    errors.push(`${pathname}: обязательный старый адрес должен вести на ${destination}`);
  }
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Webmaster description contract passed: ${htmlFiles.length} HTML pages, complete descriptions and ${Object.keys(site.legacyRedirects || {}).length} validated legacy redirects`);
