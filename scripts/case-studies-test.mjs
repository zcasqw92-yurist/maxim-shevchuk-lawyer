import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { caseStudies } from "../src/case-studies.mjs";

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

const htmlFiles = (await walk(dist)).filter((path) => extname(path) === ".html");
for (const path of htmlFiles) {
  const html = await readFile(path, "utf8");
  const name = relative(dist, path);
  for (const marker of [
    'class="section section--case-studies"',
    'class="section section--featured-case"',
    'class="section section--visual-cases"',
    "data-case-study-id=",
    "Демо-визуал",
    "case-autoclub-demo.svg",
    "case-engine-demo.svg",
    "case-land-demo.svg",
  ]) {
    if (html.includes(marker)) errors.push(`${name}: unconfirmed case marker is public: ${marker}`);
  }
  for (const item of Object.values(caseStudies)) {
    for (const text of [item.title, item.situation, item.materials, item.work, item.next]) {
      if (html.includes(text)) errors.push(`${name}: unconfirmed case content is public: ${item.id}`);
    }
  }
}

for (const privateMarker of [
  "Топникова",
  "Шибаева",
  "Тялина",
  "Щенникова",
  "Крыленко",
  "Лобачевского",
  "КУСП №",
  "УИД",
]) {
  for (const path of htmlFiles) {
    const html = await readFile(path, "utf8");
    if (html.includes(privateMarker)) errors.push(`${relative(dist, path)}: private marker is public: ${privateMarker}`);
  }
}
for (const unsupportedClaim of ["дело выиграно", "суд взыскал", "деньги возвращены полностью", "гарантированный результат"]) {
  for (const path of htmlFiles) {
    const html = (await readFile(path, "utf8")).toLowerCase();
    if (html.includes(unsupportedClaim)) errors.push(`${relative(dist, path)}: unsupported outcome claim: ${unsupportedClaim}`);
  }
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Unconfirmed case studies are not published on ${htmlFiles.length} HTML pages`);
