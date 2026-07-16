import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { services } from "../src/data.mjs";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const errors = [];

const expectedPages = [
  ["главная", "index.html", "after-contact"],
  ["услуги", join("uslugi", "index.html"), "before-services"],
  ...services.map((service) => [service.slug, join("uslugi", service.slug, "index.html"), "after-contact"]),
];

const titles = [
  "Первично — бесплатно",
  "Цена фиксируется заранее",
  "Срок известен до оплаты",
  "После документа — на связи",
];

for (const [label, pagePath, placement] of expectedPages) {
  const html = await readFile(join(dist, pagePath), "utf8");
  const sectionCount = (html.match(/class="section section--process-guarantees"/g) || []).length;
  const cardCount = (html.match(/class="process-guarantee reveal"/g) || []).length;
  if (sectionCount !== 1) errors.push(`${label}: ожидался один блок гарантий, найдено ${sectionCount}`);
  if (cardCount !== 4) errors.push(`${label}: ожидалось четыре гарантии, найдено ${cardCount}`);
  for (const title of titles) if (!html.includes(title)) errors.push(`${label}: отсутствует гарантия «${title}»`);
  if (!html.includes("Это гарантии порядка работы, а не обещание конкретного решения")) {
    errors.push(`${label}: отсутствует разграничение гарантий процесса и результата`);
  }

  const guaranteeIndex = html.indexOf('class="section section--process-guarantees"');
  if (placement === "after-contact") {
    const contactIndex = html.indexOf('class="contact-path');
    if (contactIndex < 0 || guaranteeIndex < contactIndex) errors.push(`${label}: блок должен идти после сценария первого обращения`);
  }
  if (placement === "before-services") {
    const servicesIndex = html.indexOf('class="section section--services"');
    if (servicesIndex < 0 || guaranteeIndex > servicesIndex) errors.push(`${label}: блок должен идти перед каталогом услуг`);
  }
}

for (const pagePath of [join("o-yuriste", "index.html"), join("kontakty", "index.html"), join("politika-konfidencialnosti", "index.html")]) {
  const html = await readFile(join(dist, pagePath), "utf8");
  if (html.includes('class="section section--process-guarantees"')) errors.push(`${pagePath}: блок гарантий добавлен на непредусмотренную страницу`);
}

const styles = await readFile(join(dist, "assets", "styles.css"), "utf8");
for (const marker of [
  ".process-guarantees__grid",
  "grid-template-columns: repeat(4, minmax(0, 1fr))",
  "grid-template-columns: repeat(2, minmax(0, 1fr))",
  ".process-guarantees__grid { grid-template-columns: 1fr; }",
]) {
  if (!styles.includes(marker)) errors.push(`styles.css: отсутствует адаптивный маркер ${marker}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Process guarantees checks passed: ${expectedPages.length} pages, four items and responsive layout`);
