import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const robotsValue = "noindex,nofollow,noarchive,nosnippet,noimageindex";

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return children.flat();
};

const htmlFiles = (await walk(dist)).filter((file) => file.endsWith(".html"));
for (const file of htmlFiles) {
  let html = await readFile(file, "utf8");
  const robotsTag = `<meta name="robots" content="${robotsValue}">`;
  if (/<meta\s+name=["']robots["'][^>]*>/i.test(html)) {
    html = html.replace(/<meta\s+name=["']robots["'][^>]*>/gi, robotsTag);
  } else if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `  ${robotsTag}\n</head>`);
  } else {
    throw new Error(`${relative(dist, file).split(sep).join("/")}: отсутствует </head>`);
  }
  await writeFile(file, html, "utf8");
}

const robotsTxt = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /assets/images/\nDisallow: /uploads/\n\n# Индексация HTML запрещена глобальными meta robots.\n`;
await writeFile(join(dist, "robots.txt"), robotsTxt, "utf8");

const emptySitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n`;
await writeFile(join(dist, "sitemap.xml"), emptySitemap, "utf8");

const buildInfoPath = join(dist, "build-info.json");
const buildInfo = JSON.parse(await readFile(buildInfoPath, "utf8"));
buildInfo.indexingLocked = true;
buildInfo.indexingPolicy = "site-wide-noindex";
await writeFile(buildInfoPath, `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");

if (site.indexNowKey) {
  await rm(join(dist, `${site.indexNowKey}.txt`), { force: true });
}

console.log(`Indexing lock applied to ${htmlFiles.length} HTML files; sitemap cleared; IndexNow disabled`);
