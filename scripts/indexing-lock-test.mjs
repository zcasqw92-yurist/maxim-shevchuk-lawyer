import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return children.flat();
};

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "";
const htmlFiles = (await walk(dist)).filter((file) => file.endsWith(".html"));

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const tag = html.match(/<meta\s+name=["']robots["'][^>]*>/i)?.[0] || "";
  const tokens = attr(tag, "content").toLowerCase().split(",").map((value) => value.trim()).filter(Boolean);
  const label = relative(dist, file).split(sep).join("/");
  if (!tag) errors.push(`${label}: отсутствует meta robots`);
  if (!tokens.includes("noindex")) errors.push(`${label}: отсутствует noindex`);
  if (!tokens.includes("nofollow")) errors.push(`${label}: отсутствует nofollow`);
  if (tokens.includes("index")) errors.push(`${label}: обнаружен index`);
}

const robotsTxt = await readFile(join(dist, "robots.txt"), "utf8");
if (!/User-agent:\s*\*/i.test(robotsTxt)) errors.push("robots.txt: отсутствует общий User-agent");
if (/Sitemap:/i.test(robotsTxt)) errors.push("robots.txt: карта сайта не должна рекламироваться, пока действует блокировка");

const sitemap = await readFile(join(dist, "sitemap.xml"), "utf8");
if (/<loc>/i.test(sitemap)) errors.push("sitemap.xml: при блокировке не должно быть URL");

const buildInfo = JSON.parse(await readFile(join(dist, "build-info.json"), "utf8"));
if (buildInfo.indexingLocked !== true) errors.push("build-info.json: indexingLocked должен быть true");
if (buildInfo.indexingPolicy !== "site-wide-noindex") errors.push("build-info.json: неверная indexingPolicy");

if (site.indexNowKey) {
  try {
    await access(join(dist, `${site.indexNowKey}.txt`));
    errors.push("IndexNow key file не должен публиковаться при блокировке индексации");
  } catch {
    // Ожидаем отсутствие файла.
  }
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Indexing lock verified: ${htmlFiles.length} HTML files are noindex,nofollow; sitemap is empty`);
