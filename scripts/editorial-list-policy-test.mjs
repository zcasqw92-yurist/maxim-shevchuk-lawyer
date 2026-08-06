import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { articles } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const renderer = await readFile(join(root, "src", "editorial-render-base.mjs"), "utf8");
const styles = await readFile(join(root, "src", "editorial-semantic-lists.css"), "utf8");
const errors = [];
const semanticFields = ["checklist", "avoid", "bullets", "dashes"];
const targetId = "contractor-repair-quality-claim-response";
const targetSelector = `data-article-id="${targetId}"`;
const negativeChecklistPattern = /^(?:не\b|нельзя\b|проигнорир|отказат|признат|пообещат|спорит|ошибк)/iu;

const usesNewPolicy = (article) => article.listPolicyVersion !== undefined
  || (article.sections || []).some((section) => section.avoid !== undefined
    || section.bullets !== undefined
    || section.dashes !== undefined
    || section.microCta !== undefined);

const optedIn = articles.filter(usesNewPolicy);
for (const article of optedIn) {
  if (article.id !== targetId) {
    errors.push(`${article.slug}: новая система маркеров включена без отдельного решения; сейчас она разрешена только для C-139`);
  }
}

const article = articles.find((item) => item.id === targetId);
if (!article) {
  errors.push(`обязательная статья ${targetId} отсутствует в реестре`);
} else {
  if (article.listPolicyVersion !== 1) {
    errors.push(`${article.slug}: обязательное правило смысловых маркеров отключено`);
  }

  for (const section of article.sections || []) {
    for (const field of semanticFields) {
      const value = section[field];
      if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim()))) {
        errors.push(`${article.slug}/${section.id}: поле ${field} должно быть непустым массивом строк`);
      }
    }
    for (const item of section.checklist || []) {
      if (negativeChecklistPattern.test(item.trim())) {
        errors.push(`${article.slug}/${section.id}: запрет или ошибка оформлены галочкой: ${item}`);
      }
    }
    if (section.microCta) {
      for (const field of ["title", "text", "label", "href"]) {
        if (typeof section.microCta[field] !== "string" || !section.microCta[field].trim()) {
          errors.push(`${article.slug}/${section.id}: у мягкого CTA отсутствует ${field}`);
        }
      }
    }
  }
}

for (const marker of [
  'semanticList(section.avoid, "cross")',
  'semanticList(section.bullets, "dot")',
  'semanticList(section.dashes, "dash")',
  'class="editorial-micro-cta"',
]) {
  if (!renderer.includes(marker)) errors.push(`renderer: отсутствует обязательный контракт ${marker}`);
}

for (const marker of [
  targetSelector,
  '--editorial-marker-indent: 26px',
  '--editorial-marker-width: 18px',
  '--editorial-marker-item-gap: 10px',
  '--editorial-marker-block-gap: 18px',
  'gap: var(--editorial-marker-item-gap)',
  'margin: var(--editorial-marker-block-gap) 0 0',
  'padding: 0 0 0 var(--editorial-marker-indent)',
  'width: var(--editorial-marker-width)',
  'content: "✓"',
  'content: "×"',
  'content: "•"',
  'content: "—"',
  '.editorial-article:not([data-article-id="contractor-repair-quality-claim-response"])',
  'gap: 12px',
  'padding: 0 0 0 28px',
]) {
  if (!styles.includes(marker)) errors.push(`editorial-semantic-lists.css: отсутствует обязательный контракт ${marker}`);
}

if (/^\s*\.article-page,\s*\n\s*\.case-page\s*\{/m.test(styles)) {
  errors.push("editorial-semantic-lists.css: новые переменные снова применены ко всем статьям и кейсам");
}
if (/^\s*\.article-section\s+:is\(/m.test(styles)) {
  errors.push("editorial-semantic-lists.css: найден глобальный селектор новых отступов без привязки к C-139");
}
if (/^\s*\.editorial-list--(?:cross|dot|dash)\s+li::before/m.test(styles)) {
  errors.push("editorial-semantic-lists.css: смысловой маркер действует глобально, а не только внутри C-139");
}

if (errors.length) {
  console.error(["Проверка смысловых маркеров списков не пройдена:", ...errors.map((item) => `- ${item}`)].join("\n"));
  process.exit(1);
}

console.log("Editorial list policy passed: C-139 uses semantic markers and unified spacing; earlier articles keep their previous list presentation");
