import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { caseStudies } from "../src/case-studies.mjs";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const errors = [];

const servicePages = new Map([
  [join("uslugi", "dosudebnoe-uregulirovanie", "index.html"), ["autoclub"]],
  [join("uslugi", "vozvrat-deneg", "index.html"), ["autoclub"]],
  [join("uslugi", "zhaloby-i-obrashcheniya", "index.html"), ["engine"]],
  [join("uslugi", "iskovoe-zayavlenie", "index.html"), ["autoclub", "land"]],
]);

for (const [pagePath, ids] of servicePages) {
  const html = await readFile(join(dist, pagePath), "utf8");
  const blockCount = (html.match(/class="section section--case-studies"/g) || []).length;
  const cardCount = (html.match(/data-case-study-id=/g) || []).length;
  if (blockCount !== 1) errors.push(`${pagePath}: expected one case-study block, found ${blockCount}`);
  if (cardCount !== ids.length) errors.push(`${pagePath}: expected ${ids.length} case cards, found ${cardCount}`);
  if (!html.includes("От фактов и документов — к конкретному следующему шагу")) errors.push(`${pagePath}: missing section heading`);
  if (!html.includes("Обсудить похожую ситуацию")) errors.push(`${pagePath}: missing relevant CTA`);
  if (!html.includes("не означает гарантии аналогичного результата")) errors.push(`${pagePath}: missing no-guarantee note`);
  for (const id of ids) {
    const item = caseStudies[id];
    if (!html.includes(`data-case-study-id="${id}"`)) errors.push(`${pagePath}: missing case ${id}`);
    for (const text of [item.category, item.title, item.situation, item.materials, item.work, item.next]) {
      if (!html.includes(text)) errors.push(`${pagePath}: incomplete case ${id}`);
    }
  }
  const processPosition = html.indexOf('class="section section--process"');
  const casesPosition = html.indexOf('class="section section--case-studies"');
  if (processPosition < 0 || casesPosition < processPosition) errors.push(`${pagePath}: case studies must follow work process`);
}

const home = await readFile(join(dist, "index.html"), "utf8");
for (const marker of [
  'class="section section--featured-case"',
  'class="section section--visual-cases"',
  "case-autoclub-demo.svg",
  "case-engine-demo.svg",
  "case-land-demo.svg",
  "Демо-визуал · заменить",
  "Пример показывает объём выполненной работы и не является обещанием аналогичного результата",
]) {
  if (!home.includes(marker)) errors.push(`home: missing visual case marker ${marker}`);
}
for (const item of Object.values(caseStudies)) {
  for (const text of [item.category, item.title, item.situation, item.materials, item.work, item.next]) {
    if (!home.includes(text)) errors.push(`home: incomplete visual case ${item.id}`);
  }
}
const situationsPosition = home.indexOf('class="section section--situations"');
const featuredPosition = home.indexOf('class="section section--featured-case"');
const servicesPosition = home.indexOf('class="section section--services"');
const visualCasesPosition = home.indexOf('class="section section--visual-cases"');
if (situationsPosition < 0 || featuredPosition < situationsPosition) errors.push("home: featured case must follow situations");
if (servicesPosition < 0 || visualCasesPosition < servicesPosition) errors.push("home: secondary visual cases must follow services");

for (const pagePath of [
  join("uslugi", "index.html"),
  join("uslugi", "spory-biznesa", "index.html"),
  join("uslugi", "marketpleysy", "index.html"),
  join("o-yuriste", "index.html"),
  join("kontakty", "index.html"),
  join("politika-konfidencialnosti", "index.html"),
]) {
  const html = await readFile(join(dist, pagePath), "utf8");
  if (html.includes('class="section section--case-studies"')) errors.push(`${pagePath}: irrelevant case-study block must not be shown`);
  if (html.includes('class="section section--featured-case"') || html.includes('class="section section--visual-cases"')) errors.push(`${pagePath}: home-only visual cases must not be shown`);
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
  if (home.includes(privateMarker)) errors.push(`public case studies expose private marker: ${privateMarker}`);
}
for (const unsupportedClaim of ["дело выиграно", "суд взыскал", "деньги возвращены полностью", "гарантированный результат"]) {
  if (home.toLowerCase().includes(unsupportedClaim)) errors.push(`unsupported outcome claim: ${unsupportedClaim}`);
}

const styles = await readFile(join(dist, "assets", "styles.css"), "utf8");
for (const marker of [
  ".case-studies__grid {",
  ".featured-case {",
  ".visual-cases__grid {",
  "grid-template-columns: repeat(2, minmax(0, 1fr));",
  "@media (max-width: 980px)",
  "@media (max-width: 680px)",
]) {
  if (!styles.includes(marker)) errors.push(`styles.css: missing case-study layout marker ${marker}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Case-study checks passed: ${servicePages.size} service pages and 3 proof-led home cases`);
