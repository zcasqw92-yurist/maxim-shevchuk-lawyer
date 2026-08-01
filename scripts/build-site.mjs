import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { services } from "../src/data.mjs";
import { articles, practiceCases } from "../src/editorial-data.mjs";
import { applyPublicationLinkingToDist } from "../src/publication-linking.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = join(root, "dist", "assets", "styles.css");
const styleModules = [
  "styles",
  "site-enhancements",
  "case-studies",
  "search-visibility",
  "mobile-actions",
  "legal-assistant",
  "visual-trust",
  "video-ready",
  "layout-corrections",
  "page-endings",
  "content-protection",
  "editorial",
  "editorial-publication",
  "editorial-cards",
  "cta-system",
  "editorial-rhythm",
].map((id) => ({ id, path: join(root, "src", `${id}.css`) }));

await import("./build.mjs");
await applyPublicationLinkingToDist({ root, services, articles, practiceCases });

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
