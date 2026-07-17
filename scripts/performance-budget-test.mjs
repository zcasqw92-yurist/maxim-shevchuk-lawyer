import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];
const report = [];

const limits = {
  "index.html": 260 * 1024,
  "assets/styles.css": 180 * 1024,
  "assets/app.js": 90 * 1024,
  "assets/visual-trust.js": 40 * 1024,
  "assets/web-vitals.js": 10 * 1024,
  "assets/images/maxim-hero.webp": 260 * 1024,
};

const formatKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
for (const [path, limit] of Object.entries(limits)) {
  const size = (await stat(join(dist, path))).size;
  report.push(`${path}: ${formatKb(size)} / ${formatKb(limit)}`);
  if (size > limit) errors.push(`${path}: ${formatKb(size)} exceeds ${formatKb(limit)}`);
}

const criticalPaths = [
  "index.html",
  "assets/styles.css",
  "assets/app.js",
  "assets/visual-trust.js",
  "assets/web-vitals.js",
  "assets/images/maxim-hero.webp",
];
const criticalBytes = (await Promise.all(criticalPaths.map(async (path) => (await stat(join(dist, path))).size)))
  .reduce((sum, size) => sum + size, 0);
const criticalLimit = 680 * 1024;
report.push(`critical first view: ${formatKb(criticalBytes)} / ${formatKb(criticalLimit)}`);
if (criticalBytes > criticalLimit) errors.push(`critical first view: ${formatKb(criticalBytes)} exceeds ${formatKb(criticalLimit)}`);

const walk = async (directory) => {
  const items = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) items.push(...await walk(path));
    else items.push(path);
  }
  return items;
};

const imageFiles = (await walk(join(dist, "assets", "images")))
  .filter((path) => [".avif", ".webp", ".png", ".jpg", ".jpeg", ".svg"].includes(extname(path).toLowerCase()));
let imageBytes = 0;
for (const path of imageFiles) {
  const size = (await stat(path)).size;
  imageBytes += size;
  if (extname(path).toLowerCase() === ".svg" && size > 120 * 1024) {
    errors.push(`${relative(dist, path)}: demonstration SVG exceeds 120 KB`);
  }
}
const imageLimit = 2.5 * 1024 * 1024;
report.push(`all image assets: ${formatKb(imageBytes)} / ${formatKb(imageLimit)}`);
if (imageBytes > imageLimit) errors.push(`all image assets: ${formatKb(imageBytes)} exceeds ${formatKb(imageLimit)}`);

const htmlFiles = (await walk(dist)).filter((path) => extname(path).toLowerCase() === ".html");
for (const path of htmlFiles) {
  const html = await readFile(path, "utf8");
  const name = relative(dist, path);
  if (/<iframe\b/i.test(html)) errors.push(`${name}: iframe must not be present before user action`);
  if (/<video\b/i.test(html) || /\.(?:mp4|webm)(?:[?"'])/i.test(html)) errors.push(`${name}: video must not load before user action`);
  if (/<script[^>]+src=["']https?:\/\//i.test(html)) errors.push(`${name}: third-party script loads before consent/action`);
}

const home = await readFile(join(dist, "index.html"), "utf8");
if (!/maxim-hero\.webp[^>]+fetchpriority="high"/i.test(home)) errors.push("home: hero poster must have fetchpriority=high");
if (!/data-video-launch/.test(home) || !/data-video-config-url/.test(home)) errors.push("home: lightweight on-demand video launcher is missing");
if (!/document-[a-z-]+-demo\.svg[^>]+loading="lazy"/i.test(home)) errors.push("home: document visuals must be lazy-loaded");

const videoConfig = JSON.parse(await readFile(join(dist, "video-config.json"), "utf8"));
if (videoConfig.enabled === false && (videoConfig.sources || videoConfig.poster || videoConfig.captions)) {
  errors.push("disabled video config must not expose or preload media URLs");
}

console.log(report.join("\n"));
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log(`Performance budgets passed: ${htmlFiles.length} HTML pages, ${imageFiles.length} images, no eager third-party media`);