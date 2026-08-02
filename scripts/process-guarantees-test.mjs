import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { services } from "../src/data.mjs";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const errors = [];

const expectedPages = [
  ["услуги", join("uslugi", "index.html"), "catalog-sequence"],
  ...services.map((service) => [service.slug, join("uslugi", service.slug, "index.html"), "after-contact"]),
];

const titles = [
  "Первое ознакомление бесплатно",
  "Цена фиксируется заранее",
  "Срок известен до оплаты",
  "После документа — на связи",
];

for (const [label, pagePath, placement] of expectedPages) {
  const html = await readFile(join(dist, pagePath), "utf8");
  const sectionCount = (html.match(/class="section section--process-guarantees"/g) || []).length;
  const cardCount = (html.match(/class="process-guarantee reveal"/g) || []).length;
  const finalCtaCount = (html.match(/class="section section--cta"/g) || []).length;
  if (sectionCount !== 1) errors.push(`${label}: ожидался один блок гарантий, найдено ${sectionCount}`);
  if (cardCount !== 4) errors.push(`${label}: ожидалось четыре гарантии, найдено ${cardCount}`);
  for (const title of titles) if (!html.includes(title)) errors.push(`${label}: отсутствует гарантия «${title}»`);
  if (!html.includes("Это условия моей работы, а не обещание решения суда")) {
    errors.push(`${label}: отсутствует разграничение гарантий процесса и результата`);
  }

  const guaranteeIndex = html.indexOf('class="section section--process-guarantees"');
  if (placement === "after-contact") {
    const contactIndex = html.indexOf('class="contact-path');
    if (contactIndex < 0 || guaranteeIndex < contactIndex) errors.push(`${label}: блок должен идти после сценария первого обращения`);
    if (finalCtaCount !== 1) errors.push(`${label}: на странице услуги должен остаться один персональный финальный CTA, найдено ${finalCtaCount}`);
  }
  if (placement === "catalog-sequence") {
    const guideIndex = html.indexOf('class="section section--search-guide section--search-guide-compact"');
    const servicesIndex = html.indexOf('class="section section--services"');
    const pricesIndex = html.indexOf('class="section section--prices"');
    if (!(guideIndex >= 0 && guideIndex < servicesIndex && servicesIndex < guaranteeIndex && guaranteeIndex < pricesIndex)) {
      errors.push(`${label}: ожидается последовательность «основа практики → направления → условия → стоимость»`);
    }
    if (finalCtaCount !== 0) errors.push(`${label}: общий финальный CTA дублирует блок «Не нашли точного совпадения?»`);
    if (!html.includes('class="section section--dark compact-dark"') || !html.includes("Просто опишите, что произошло")) {
      errors.push(`${label}: должен остаться один предметный финальный блок каталога`);
    }
    if (html.includes("Начнём с правильной квалификации")) errors.push(`${label}: дублирующий заголовок финального CTA не удалён`);
  }
}

const home = await readFile(join(dist, "index.html"), "utf8");
if (home.includes('class="section section--process-guarantees"')) errors.push("главная: повторяющий полосу доверия блок гарантий не должен публиковаться");
if (!home.includes("trust-strip__grid")) errors.push("главная: краткие условия работы должны остаться в полосе доверия");

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

const sectionPalette = styles.match(/\.section--process-guarantees\s*\{([\s\S]*?)\}/)?.[1] || "";
const cardPalette = styles.match(/\.process-guarantee\s*\{([\s\S]*?)\}/)?.[1] || "";
if (!sectionPalette.includes("background: var(--paper);")) {
  errors.push("styles.css: фон блока условий должен использовать основной кремовый тон --paper");
}
if (!cardPalette.includes("background: rgba(235,230,220,.52);")) {
  errors.push("styles.css: карточки условий должны использовать тёплый оттенок палитры --paper-2");
}
if (sectionPalette.includes("background: var(--white);")) {
  errors.push("styles.css: почти белый фон снова выбивает блок условий из фирменной палитры");
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Process guarantees checks passed: ${expectedPages.length} service pages; the catalog follows the approved narrative sequence, the palette is consistent, and detail pages keep their personal CTA`);
