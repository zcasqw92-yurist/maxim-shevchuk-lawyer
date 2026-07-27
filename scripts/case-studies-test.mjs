import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { caseStudies, pageCaseIds } from "../src/case-studies.mjs";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const errors = [];

const walk = async (directory) => {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
};

const fileForRoute = (route) => route === "/"
  ? join(dist, "index.html")
  : join(dist, route.replace(/^\/+|\/+$/g, ""), "index.html");

const htmlFiles = (await walk(dist)).filter((path) => extname(path) === ".html");
const expectedFiles = new Set(Object.keys(pageCaseIds).map(fileForRoute));

for (const [route, ids] of Object.entries(pageCaseIds)) {
  const path = fileForRoute(route);
  const html = await readFile(path, "utf8");
  const name = relative(dist, path);

  if (!html.includes('class="section section--case-studies"')) {
    errors.push(`${name}: verified case block is missing`);
    continue;
  }
  if (!html.includes("Кейсы обезличены")) errors.push(`${name}: anonymization notice is missing`);
  if (!html.includes("не означает гарантии аналогичного результата")) errors.push(`${name}: result disclaimer is missing`);

  const actualCardCount = (html.match(/<article class="case-study reveal"/g) || []).length;
  if (actualCardCount !== ids.length) {
    errors.push(`${name}: expected ${ids.length} case cards, got ${actualCardCount}`);
  }

  for (const id of ids) {
    const item = caseStudies[id];
    if (!item) {
      errors.push(`${route}: unknown configured case ${id}`);
      continue;
    }
    if (!html.includes(`id="case-${item.id}"`)) errors.push(`${name}: case marker is missing: ${item.id}`);
    for (const text of [item.title, item.situation, item.materials, item.work, item.next]) {
      if (!html.includes(text)) errors.push(`${name}: verified case content is missing: ${item.id}`);
    }
  }
}

for (const path of htmlFiles) {
  const html = await readFile(path, "utf8");
  const name = relative(dist, path);
  if (!expectedFiles.has(path) && html.includes('class="section section--case-studies"')) {
    errors.push(`${name}: case block is public on an unrelated route`);
  }
  for (const marker of [
    'class="section section--featured-case"',
    'class="section section--visual-cases"',
    "Демо-визуал",
    "case-autoclub-demo.svg",
    "case-engine-demo.svg",
    "case-land-demo.svg",
  ]) {
    if (html.includes(marker)) errors.push(`${name}: demo or obsolete case marker is public: ${marker}`);
  }
}

for (const privateMarker of [
  "Топникова",
  "Алиакбарова",
  "Шибаева",
  "Тялина",
  "Щенникова",
  "Крыленко",
  "Лобачевского",
  "Сергач",
  "Рыбинск",
  "КУСП №",
  "УИД",
]) {
  for (const path of htmlFiles) {
    const html = await readFile(path, "utf8");
    if (html.includes(privateMarker)) errors.push(`${relative(dist, path)}: private marker is public: ${privateMarker}`);
  }
}

for (const unsupportedClaim of [
  "дело выиграно",
  "суд взыскал",
  "деньги возвращены полностью",
  "гарантированный результат",
]) {
  for (const path of htmlFiles) {
    const html = (await readFile(path, "utf8")).toLowerCase();
    if (html.includes(unsupportedClaim)) errors.push(`${relative(dist, path)}: unsupported outcome claim: ${unsupportedClaim}`);
  }
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Verified anonymized case studies are published on ${expectedFiles.size} routes without private markers or unsupported outcomes`);
