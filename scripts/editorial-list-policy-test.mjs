import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { articles } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const renderer = await readFile(join(root, "src", "editorial-render-base.mjs"), "utf8");
const styles = await readFile(join(root, "src", "editorial-semantic-lists.css"), "utf8");
const rhythm = await readFile(join(root, "src", "editorial-rhythm.css"), "utf8");
const errors = [];
const semanticFields = ["checklist", "avoid", "bullets", "dashes"];
const policyIds = new Set([
  "contractor-repair-quality-claim-response",
  "theft-police-statement",
]);
const negativeChecklistPattern = /^(?:не\b|нельзя\b|проигнорир|отказат|признат|пообещат|спорит|ошибк)/iu;

const usesNewPolicy = (article) => article.listPolicyVersion !== undefined
  || (article.sections || []).some((section) => section.avoid !== undefined
    || section.bullets !== undefined
    || section.dashes !== undefined
    || section.microCta !== undefined);

for (const article of articles.filter(usesNewPolicy)) {
  if (!policyIds.has(article.id)) {
    errors.push(`${article.slug}: новая система маркеров включена без отдельного решения; разрешены только C-139 и C-170`);
  }
}

for (const articleId of policyIds) {
  const article = articles.find((item) => item.id === articleId);
  if (!article) {
    errors.push(`обязательная статья ${articleId} отсутствует в реестре`);
    continue;
  }
  if (article.listPolicyVersion !== 1) errors.push(`${article.slug}: обязательное правило смысловых маркеров отключено`);

  for (const section of article.sections || []) {
    for (const field of semanticFields) {
      const value = section[field];
      if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim()))) {
        errors.push(`${article.slug}/${section.id}: поле ${field} должно быть непустым массивом строк`);
      }
    }
    for (const item of section.checklist || []) {
      if (negativeChecklistPattern.test(item.trim())) errors.push(`${article.slug}/${section.id}: запрет или ошибка оформлены галочкой: ${item}`);
    }
    if (section.microCta) {
      for (const field of ["title", "text", "label", "href"]) {
        if (typeof section.microCta[field] !== "string" || !section.microCta[field].trim()) errors.push(`${article.slug}/${section.id}: у мягкого CTA отсутствует ${field}`);
      }
      if (!section.microCta.href.startsWith("#")) errors.push(`${article.slug}/${section.id}: мягкий CTA должен вести только на внутренний якорь`);
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
  'data-article-id="contractor-repair-quality-claim-response"',
  'data-article-id="theft-police-statement"',
  ':not([data-article-id="contractor-repair-quality-claim-response"]):not([data-article-id="theft-police-statement"])',
  '--editorial-c139-space: 16px',
  '--editorial-c139-section-space: 24px',
  '--editorial-marker-indent: 30px',
  '--editorial-marker-width: 18px',
  'content: "✓"',
  'content: "×"',
  'content: "•"',
  'content: "—"',
]) {
  if (!styles.includes(marker)) errors.push(`editorial-semantic-lists.css: отсутствует обязательный контракт ${marker}`);
}

for (const marker of [
  'data-article-id="contractor-repair-quality-claim-response"',
  'data-article-id="theft-police-statement"',
  'margin-top: var(--editorial-c139-section-space)',
  'margin-bottom: var(--editorial-c139-space)',
  'padding: var(--editorial-c139-space)',
]) {
  if (!rhythm.includes(marker)) errors.push(`editorial-rhythm.css: отсутствует обязательный контракт ${marker}`);
}

if (/^\s*\.article-page\s+\.editorial-body\s*>\s*\.article-section\s*\{[^}]*var\(--editorial-c139-/ms.test(rhythm)) {
  errors.push("editorial-rhythm.css: компактный ритм выбранных статей применён глобально");
}

if (errors.length) {
  console.error(["Проверка смысловых маркеров и ритма C-139/C-170 не пройдена:", ...errors.map((item) => `- ${item}`)].join("\n"));
  process.exit(1);
}

console.log("Editorial list policy passed: C-139 and C-170 use the approved semantic markers and compact rhythm; earlier articles keep their previous presentation");
