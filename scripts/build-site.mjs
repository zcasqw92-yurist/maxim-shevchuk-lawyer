import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = join(root, "dist", "assets", "styles.css");
const lateStyleModules = [
  { id: "editorial-cards", path: join(root, "src", "editorial-cards.css") },
  { id: "editorial-rhythm", path: join(root, "src", "editorial-rhythm.css") },
];

await import("./build.mjs");

const baseBundle = await readFile(bundlePath, "utf8");
const modules = await Promise.all(lateStyleModules.map(async (module) => ({
  ...module,
  css: (await readFile(module.path, "utf8")).trim(),
})));

for (const module of modules) {
  const marker = `/* source:${module.id} */`;
  if (baseBundle.includes(marker)) {
    throw new Error(`CSS-модуль уже присутствует в базовой сборке: ${module.id}`);
  }
  if (!module.css) throw new Error(`Пустой CSS-модуль: ${module.id}`);
}

const lateBundle = modules
  .map((module) => `/* source:${module.id} */\n${module.css}`)
  .join("\n\n");
const finalBundle = `${baseBundle.trimEnd()}\n\n${lateBundle}\n`;

await writeFile(bundlePath, finalBundle, "utf8");
