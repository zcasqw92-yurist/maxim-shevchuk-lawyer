import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";

const project = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(project, "dist");

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return nested.flat();
};

const files = await walk(dist);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const errors = [];
const warnings = [];
const removeBasePath = (pathname) => {
  if (!site.basePath) return pathname;
  if (pathname === site.basePath || pathname === `${site.basePath}/`) return "/";
  return pathname.startsWith(`${site.basePath}/`) ? pathname.slice(site.basePath.length) : pathname;
};

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const label = relative(dist, file);
  const count = (pattern) => (html.match(pattern) || []).length;
  if (!/<html lang="ru">/.test(html)) errors.push(`${label}: отсутствует lang=ru`);
  if (!/<meta name="viewport"/.test(html)) errors.push(`${label}: отсутствует viewport`);
  if (count(/<h1(?:\s|>)/g) !== 1) errors.push(`${label}: ожидается ровно один H1`);
  if (!/<title>[^<]{10,}<\/title>/.test(html)) errors.push(`${label}: некорректный title`);
  if (!/<meta name="description" content="[^"]{40,}"/.test(html)) errors.push(`${label}: короткий или отсутствующий description`);
  if (!/<link rel="canonical"/.test(html)) errors.push(`${label}: отсутствует canonical`);
  if (!/<main[^>]*\bid="main"[^>]*>/.test(html)) errors.push(`${label}: отсутствует main`);
  if (/<img(?![^>]*\balt=)[^>]*>/g.test(html)) errors.push(`${label}: найдено изображение без alt`);

  for (const match of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    const target = removeBasePath(match[1].split(/[?#]/)[0]);
    if (!target || target === "/") continue;
    let local = join(dist, target);
    if (target.endsWith("/")) local = join(local, "index.html");
    try { await access(local); } catch { errors.push(`${label}: не найден внутренний ресурс ${target}`); }
  }
  if (html.includes("example.ru")) warnings.push(`${label}: используется тестовый домен example.ru`);
}

const uniqueErrors = [...new Set(errors)];
if (warnings.length) console.log(`Warnings: ${[...new Set(warnings)].length} (ожидаемо для прототипа)`);
if (uniqueErrors.length) {
  console.error(uniqueErrors.join("\n"));
  process.exit(1);
}
console.log(`Validated ${htmlFiles.length} HTML pages: no structural errors`);
