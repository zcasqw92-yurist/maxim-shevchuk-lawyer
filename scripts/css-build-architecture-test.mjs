import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const buildScript = await readFile(join(root, "scripts", "build-site.mjs"), "utf8");
const bundle = await readFile(join(root, "dist", "assets", "styles.css"), "utf8");
const editorialBase = await readFile(join(root, "src", "editorial.css"), "utf8");
const editorialContainment = await readFile(join(root, "src", "editorial-containment.css"), "utf8");
const moduleIds = [
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
];
const errors = [];

if (packageJson.scripts?.build !== "node scripts/build-site.mjs") {
  errors.push(`npm build должен использовать единый CSS-компоновщик: ${packageJson.scripts?.build || "не задан"}`);
}
if (/\bappendFile\b/.test(buildScript)) {
  errors.push("CSS-сборка не должна дописывать production bundle через appendFile");
}
if (!buildScript.includes("styleModules")) {
  errors.push("В CSS-сборке отсутствует явный manifest всех модулей");
}

let previousIndex = -1;
for (const id of moduleIds) {
  const marker = `/* source:${id} */`;
  const markerMatches = bundle.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || [];
  if (markerMatches.length !== 1) {
    errors.push(`${id}: marker должен присутствовать ровно один раз, найдено ${markerMatches.length}`);
  }

  const markerIndex = bundle.indexOf(marker);
  if (markerIndex <= previousIndex) errors.push(`${id}: нарушен порядок CSS-модулей`);
  previousIndex = markerIndex;

  const source = (await readFile(join(root, "src", `${id}.css`), "utf8")).trim();
  const first = bundle.indexOf(source);
  const second = first < 0 ? -1 : bundle.indexOf(source, first + source.length);
  if (first < 0) errors.push(`${id}: исходный CSS не найден в production bundle`);
  if (second >= 0) errors.push(`${id}: исходный CSS включён в production bundle повторно`);
}

const sourceMarkerMatches = bundle.match(/\/\* source:[a-z0-9-]+ \*\//g) || [];
if (sourceMarkerMatches.length !== moduleIds.length) {
  errors.push(`Production bundle должен содержать ${moduleIds.length} source-marker, найдено ${sourceMarkerMatches.length}`);
}
if (!bundle.startsWith("/* source:styles */")) {
  errors.push("Базовый styles.css должен открывать production bundle");
}
if (!bundle.trimEnd().endsWith((await readFile(join(root, "src", "editorial-rhythm.css"), "utf8")).trim())) {
  errors.push("Слой вертикального ритма должен завершать CSS bundle");
}

for (const snippet of [
  ".article-page :is(",
  "overflow-wrap: anywhere",
  "@media (max-width: 390px)",
  "@media (prefers-reduced-motion: reduce)",
]) {
  if (!editorialContainment.includes(snippet)) {
    errors.push(`editorial-containment.css: отсутствует обязательный контракт ${snippet}`);
  }
}

const forbiddenLegacyRules = [
  [".editorial-checklist {", "старые отдельные интервалы списка с галочками"],
  [".editorial-checklist li {", "старый отдельный левый отступ галочек"],
  [".editorial-checklist li::before", "старый квадратный маркер списка"],
  ["margin-top: 46px", "старый фиксированный интервал разделов"],
  ["margin-top: 54px", "старый фиксированный интервал авторского блока"],
  [".editorial-related > .editorial-card", "старый отступ связанной карточки"],
  ["grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 24px", "старая фиксированная сетка публикаций"],
];
for (const [snippet, label] of forbiddenLegacyRules) {
  if (editorialBase.includes(snippet)) errors.push(`editorial.css содержит ${label}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("CSS build architecture passed: one ordered manifest, deterministic final write, single inclusion and no legacy editorial overrides");
