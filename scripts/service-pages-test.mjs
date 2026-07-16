import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { services } from "../src/data.mjs";
import { servicePageContent } from "./service-pages-overrides.mjs";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const errors = [];

for (const service of services) {
  const content = servicePageContent[service.slug];
  const file = join(dist, "uslugi", service.slug, "index.html");
  const html = await readFile(file, "utf8");
  if (!content) {
    errors.push(`${service.slug}: отсутствует индивидуальная конфигурация`);
    continue;
  }
  for (const [label, expected] of [
    ["заголовок", content.title],
    ["первый абзац", content.lead],
    ["тема обращения", `data-topic="${content.topic}"`],
    ["текст обращения", `data-message="${content.message}`],
    ["кнопка", content.button],
    ["карточка материалов", content.cardTitle],
    ["заголовок ситуаций", content.situationsTitle],
    ["заголовок результата", content.resultTitle],
    ["процесс", content.processTitle],
    ["поддержка", content.supportTitle],
    ["финальный призыв", content.ctaTitle],
  ]) {
    if (!html.includes(expected)) errors.push(`${service.slug}: отсутствует ${label}`);
  }
  for (const item of content.cardItems) if (!html.includes(item)) errors.push(`${service.slug}: отсутствует материал ${item}`);
  for (const [title, text] of content.process) {
    if (!html.includes(title) || !html.includes(text)) errors.push(`${service.slug}: неполный этап ${title}`);
  }
  if (html.includes("С чего начинается работа")) errors.push(`${service.slug}: осталась общая карточка вместо материалов`);
  if (html.includes("Документ готовит Максим Юрьевич")) errors.push(`${service.slug}: остался общий блок поддержки`);
}

const styles = await readFile(join(dist, "assets", "styles.css"), "utf8");
for (const marker of [
  "Readable editorial type scale",
  ".service-hero h1 { max-width: 860px; font-size: clamp(2.75rem, 4.6vw, 4.6rem); }",
  ".service-hero h1 + p { font-size: 1.125rem; line-height: 1.65; }",
  "@media (max-width: 680px)",
  ".inner-hero h1, .service-hero h1, .about-hero h1, .contact-page__intro h1 { font-size: clamp(2.25rem, 10vw, 3rem); }",
]) {
  if (!styles.includes(marker)) errors.push(`styles.css: отсутствует маркер типографики ${marker}`);
}

const app = await readFile(join(dist, "assets", "app.js"), "utf8");
for (const marker of ["messageForControl", "control?.dataset?.message", "updateContactLinks", "whatsappDraftUrl"]) {
  if (!app.includes(marker)) errors.push(`app.js: отсутствует логика ${marker}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Service page checks passed: ${services.length} individual pages and responsive type scale`);
