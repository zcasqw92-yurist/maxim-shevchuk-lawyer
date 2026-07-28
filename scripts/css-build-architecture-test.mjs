import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const buildScript = await readFile(join(root, "scripts", "build-site.mjs"), "utf8");
const bundle = await readFile(join(root, "dist", "assets", "styles.css"), "utf8");
const modules = [
  { id: "editorial-cards", path: "src/editorial-cards.css" },
  { id: "editorial-rhythm", path: "src/editorial-rhythm.css" },
];
const errors = [];

if (packageJson.scripts?.build !== "node scripts/build-site.mjs") {
  errors.push(`npm build должен использовать единый CSS-компоновщик: ${packageJson.scripts?.build || "не задан"}`);
}
if (/\bappendFile\b/.test(buildScript)) {
  errors.push("CSS-сборка не должна дописывать production bundle через appendFile");
}
if (!buildScript.includes("lateStyleModules")) {
  errors.push("В CSS-сборке отсутствует явный manifest поздних модулей");
}

let previousIndex = -1;
for (const module of modules) {
  const marker = `/* source:${module.id} */`;
  const markerMatches = bundle.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || [];
  if (markerMatches.length !== 1) {
    errors.push(`${module.id}: marker должен присутствовать ровно один раз, найдено ${markerMatches.length}`);
  }

  const markerIndex = bundle.indexOf(marker);
  if (markerIndex <= previousIndex) errors.push(`${module.id}: нарушен порядок CSS-модулей`);
  previousIndex = markerIndex;

  const source = (await readFile(join(root, module.path), "utf8")).trim();
  const first = bundle.indexOf(source);
  const second = first < 0 ? -1 : bundle.indexOf(source, first + source.length);
  if (first < 0) errors.push(`${module.id}: исходный CSS не найден в production bundle`);
  if (second >= 0) errors.push(`${module.id}: исходный CSS включён в production bundle повторно`);
}

const cardsMarker = bundle.indexOf("/* source:editorial-cards */");
const rhythmMarker = bundle.indexOf("/* source:editorial-rhythm */");
if (!(cardsMarker >= 0 && rhythmMarker > cardsMarker)) {
  errors.push("Карточный слой должен предшествовать слою вертикального ритма");
}
if (!bundle.trimEnd().endsWith((await readFile(join(root, "src", "editorial-rhythm.css"), "utf8")).trim())) {
  errors.push("Слой вертикального ритма должен завершать CSS bundle");
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("CSS build architecture passed: deterministic final write, explicit module order and single inclusion");
