import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { caseStudies } from "../src/case-studies.mjs";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const errors = [];

const expectedPages = new Map([
  ["index.html", ["autoclub", "engine", "land"]],
  [join("uslugi", "dosudebnoe-uregulirovanie", "index.html"), ["autoclub"]],
  [join("uslugi", "vozvrat-deneg", "index.html"), ["autoclub"]],
  [join("uslugi", "zhaloby-i-obrashcheniya", "index.html"), ["engine"]],
  [join("uslugi", "iskovoe-zayavlenie", "index.html"), ["autoclub", "land"]],
]);

for (const [pagePath, ids] of expectedPages) {
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
  if (pagePath === "index.html") {
    const servicesPosition = html.indexOf('class="section section--services"');
    const casesPosition = html.indexOf('class="section section--case-studies"');
    if (servicesPosition < 0 || casesPosition < servicesPosition) errors.push("home: case studies must follow services");
  } else {
    const processPosition = html.indexOf('class="section section--process"');
    const casesPosition = html.indexOf('class="section section--case-studies"');
    if (processPosition < 0 || casesPosition < processPosition) errors.push(`${pagePath}: case studies must follow work process`);
  }
}

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
}

const allPublicCases = await readFile(join(dist, "index.html"), "utf8");
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
  if (allPublicCases.includes(privateMarker)) errors.push(`public case studies expose private marker: ${privateMarker}`);
}
for (const unsupportedClaim of ["дело выиграно", "суд взыскал", "деньги возвращены полностью", "гарантированный результат"]) {
  if (allPublicCases.toLowerCase().includes(unsupportedClaim)) errors.push(`unsupported outcome claim: ${unsupportedClaim}`);
}

const styles = await readFile(join(dist, "assets", "styles.css"), "utf8");
for (const marker of [
  ".case-studies__grid {",
  "grid-template-columns: repeat(3, minmax(0, 1fr));",
  ".case-studies__grid--single",
  "@media (max-width: 980px)",
  "@media (max-width: 680px)",
  ".case-studies__footer .button { width: 100%; }",
]) {
  if (!styles.includes(marker)) errors.push(`styles.css: missing case-study layout marker ${marker}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Case-study checks passed: ${expectedPages.size} pages, 3 anonymized matters, relevant placement and responsive layout`);
