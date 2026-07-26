import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { site } from "../site.config.mjs";
import { contentDateForPath, formatContentDate } from "../src/content-dates.mjs";
import { services } from "../src/data.mjs";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const errors = [];
const pages = [
  ["/", "index.html"],
  ["/uslugi", join("uslugi", "index.html")],
  ...services.map((service) => [`/uslugi/${service.slug}`, join("uslugi", service.slug, "index.html")]),
  ["/o-yuriste", join("o-yuriste", "index.html")],
  ["/kontakty", join("kontakty", "index.html")],
  ["/politika-konfidencialnosti", join("politika-konfidencialnosti", "index.html")],
];

const sitemap = await readFile(join(dist, "sitemap.xml"), "utf8");
for (const [pathname, file] of pages) {
  const expected = contentDateForPath(pathname);
  const label = formatContentDate(expected);
  const html = await readFile(join(dist, file), "utf8");
  const jsonLd = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((match) => {
      const parsed = JSON.parse(match[1]);
      return Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
    });
  const webPage = jsonLd.find((node) => ["WebPage", "ProfilePage", "ContactPage", "CollectionPage"].includes(node["@type"]));
  if (webPage?.dateModified !== expected) errors.push(`${pathname}: JSON-LD dateModified ${webPage?.dateModified || "missing"} != ${expected}`);
  if (!html.includes(`Страница проверена <time datetime="${expected}">${label}</time>.`)) errors.push(`${pathname}: видимая дата не совпадает с JSON-LD`);
  if (/г\.\./.test(html)) errors.push(`${pathname}: двойная точка после года`);

  const canonicalPath = pathname === "/" ? "/" : `${pathname}/`;
  const sitemapEntry = sitemap.match(new RegExp(`<loc>${site.siteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${canonicalPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/loc>[\\s\\S]*?<lastmod>([^<]+)<\\/lastmod>`));
  if (sitemapEntry?.[1] !== expected) errors.push(`${pathname}: sitemap lastmod ${sitemapEntry?.[1] || "missing"} != ${expected}`);
}

for (const [pathname, file] of pages.filter(([pathname]) => pathname === "/uslugi" || pathname.startsWith("/uslugi/"))) {
  const html = await readFile(join(dist, file), "utf8");
  const expected = contentDateForPath(pathname);
  if (!html.includes(`Проверено <time datetime="${expected}">${formatContentDate(expected)}</time>`)) {
    errors.push(`${pathname}: дата экспертного материала не совпадает с датой страницы`);
  }
}

const privacy = await readFile(join(dist, "politika-konfidencialnosti", "index.html"), "utf8");
const policyDate = contentDateForPath("/politika-konfidencialnosti");
if (!privacy.includes(`Редакция от <time datetime="${policyDate}">${formatContentDate(policyDate)}</time>.`)) {
  errors.push("Политика: дата редакции не синхронизирована");
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Content dates passed: ${pages.length} pages use explicit visible, JSON-LD and sitemap dates`);
