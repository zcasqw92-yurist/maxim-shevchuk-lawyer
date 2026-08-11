import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { services } from "../src/data.mjs";
import { articles, practiceCases } from "../src/editorial-data.mjs";
import { applyPublicationLinkingToDist } from "../src/publication-linking.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const bundlePath = join(dist, "assets", "styles.css");
const styleModules = [
  "styles",
  "site-enhancements",
  "case-studies",
  "search-visibility",
  "mobile-actions",
  "visual-trust",
  "video-ready",
  "layout-corrections",
  "page-endings",
  "content-protection",
  "editorial",
  "editorial-publication",
  "editorial-cards",
  "cta-system",
  "editorial-containment",
  "editorial-semantic-lists",
  "editorial-rhythm",
].map((id) => ({ id, path: join(root, "src", `${id}.css`) }));

await import("./build.mjs");
await applyPublicationLinkingToDist({ root, services, articles, practiceCases });

/* Keep the source renderer stable while making the published homepage describe
   the replaced portrait accurately and expose its real intrinsic dimensions. */
const homePath = join(dist, "index.html");
const homeHtml = await readFile(homePath, "utf8");
const heroImagePattern = /<img\b(?=[^>]*\bsrc="\/assets\/images\/maxim-hero\.webp")(?=[^>]*\bfetchpriority="high")[^>]*>/i;
if (!heroImagePattern.test(homeHtml)) {
  throw new Error("Не найдено главное фото для обновления alt и intrinsic-размеров");
}
await writeFile(
  homePath,
  homeHtml.replace(
    heroImagePattern,
    '<img src="/assets/images/maxim-hero.webp" width="1024" height="1024" alt="Юрист Максим Юрьевич Шевчук" fetchpriority="high" decoding="async">',
  ),
  "utf8",
);

const buildInfo = JSON.parse(await readFile(join(dist, "build-info.json"), "utf8"));
const markerName = /^[A-Fa-f0-9]{40}$/.test(String(buildInfo.sha || "")) ? buildInfo.sha : "local";
const deploymentMarker = {
  schemaVersion: 1,
  sha: buildInfo.sha,
  version: buildInfo.version,
  builtAt: buildInfo.builtAt,
  contentLastModified: buildInfo.contentLastModified,
  production: buildInfo.production,
};
await mkdir(join(dist, "deployments"), { recursive: true });
await writeFile(
  join(dist, "deployments", `${markerName}.json`),
  `${JSON.stringify(deploymentMarker, null, 2)}\n`,
  "utf8",
);

const modules = await Promise.all(styleModules.map(async (module) => ({
  ...module,
  css: (await readFile(module.path, "utf8")).trim(),
})));

for (const module of modules) {
  if (!module.css) throw new Error(`Пустой CSS-модуль: ${module.id}`);
}

const finalBundle = `${modules
  .map((module) => `/* source:${module.id} */\n${module.css}`)
  .join("\n\n")}\n`;

await writeFile(bundlePath, finalBundle, "utf8");
