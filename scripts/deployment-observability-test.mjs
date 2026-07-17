import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];

const info = JSON.parse(await readFile(join(dist, "build-info.json"), "utf8"));
for (const field of ["sha", "version", "builtAt", "contentLastModified"]) {
  if (!String(info[field] || "").trim()) errors.push(`build-info.json: missing ${field}`);
}
if (!/^\d{4}-\d{2}-\d{2}T/.test(info.builtAt)) errors.push("build-info.json: builtAt must be ISO date-time");

for (const pagePath of [
  "index.html",
  join("uslugi", "index.html"),
  join("uslugi", "iskovoe-zayavlenie", "index.html"),
  join("o-yuriste", "index.html"),
  join("kontakty", "index.html"),
]) {
  const html = await readFile(join(dist, pagePath), "utf8");
  if (!html.includes(`<meta name="site-build-sha" content="${info.sha}">`)) errors.push(`${pagePath}: missing build SHA meta`);
  if (!html.includes(`<meta name="site-build-version" content="${info.version}">`)) errors.push(`${pagePath}: missing build version meta`);
  for (const asset of ["styles.css", "app.js", "visual-trust.js"]) {
    if (!html.includes(`/assets/${asset}?v=${info.version}`)) errors.push(`${pagePath}: ${asset} is not cache-versioned`);
  }
}

const visualScript = await readFile(join(dist, "assets", "visual-trust.js"), "utf8");
for (const eventName of [
  "video_placeholder_open",
  "video_placeholder_close",
  "video_placeholder_contact",
  "document_sample_open",
  "document_sample_close",
  "document_sample_contact",
  "case_details_open",
  "education_proof_open",
  "office_map_load",
]) {
  if (!visualScript.includes(eventName)) errors.push(`visual-trust.js: missing event ${eventName}`);
}
if (visualScript.includes("dataLayer.push({ event")) errors.push("visual-trust.js: events must not enter dataLayer before analytics consent");

const config = await readFile(join(root, "site.config.mjs"), "utf8");
for (const variable of ["SITE_ANALYTICS_ENABLED", "GOOGLE_ANALYTICS_ID", "YANDEX_METRICA_ID"]) {
  if (!config.includes(variable)) errors.push(`site.config.mjs: missing ${variable}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Deployment observability checks passed · build ${info.version} · analytics events ready`);