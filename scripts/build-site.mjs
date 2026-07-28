import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = join(root, "dist", "assets", "styles.css");
const styleModules = [
  "styles",
  "site-enhancements",
  "case-studies",
  "search-visibility",
  "mobile-actions",
  "visual-trust",
  "video-ready",
  "layout-corrections",
  "content-protection",
  "editorial",
  "editorial-publication",
  "editorial-cards",
  "editorial-rhythm",
].map((id) => ({ id, path: join(root, "src", `${id}.css`) }));

await import("./build.mjs");

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
