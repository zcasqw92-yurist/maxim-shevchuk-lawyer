import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { articles } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const renderer = await readFile(join(root, "src", "editorial-render-base.mjs"), "utf8");
const extendedRenderer = await readFile(join(root, "src", "editorial-render.mjs"), "utf8");
const enhancements = await readFile(join(root, "src", "editorial-enhancements.mjs"), "utf8");
const linking = await readFile(join(root, "src", "publication-linking.mjs"), "utf8");
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

const theftArticle = articles.find((item) => item.id === "theft-police-statement");
if (theftArticle) {
  const final = theftArticle.finalSection;
  if (!final?.id || !final?.title) errors.push(`${theftArticle.slug}: отсутствует тематический якорный блок перед связанными материалами`);
  if (!Array.isArray(final?.groups) || final.groups.length < 2) errors.push(`${theftArticle.slug}: финальный блок должен иметь две смысловые колонки`);
  for (const [index, group] of (final?.groups || []).entries()) {
    if (!group?.title || !Array.isArray(group.items) || !group.items.length) errors.push(`${theftArticle.slug}: колонка ${index + 1} финального блока не заполнена`);
  }
  if (!final?.buttonLabel || !final?.topic) errors.push(`${theftArticle.slug}: в тематическом блоке отсутствует рабочая кнопка связи`);
  const target = final?.id ? `#${final.id}` : "";
  const microCtas = (theftArticle.sections || []).flatMap((section) => section.microCta ? [section.microCta] : []);
  if (!microCtas.length || microCtas.some((cta) => cta.href !== target)) errors.push(`${theftArticle.slug}: мягкие CTA должны вести в тематический двухколоночный блок`);
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
  'class="article-section editorial-intake editorial-final-conversion"',
  'article.inlineFinalCta && !article.finalSection',
]) {
  if (!extendedRenderer.includes(marker)) errors.push(`editorial-render.mjs: отсутствует контракт канонического финального блока: ${marker}`);
}

for (const marker of [
  'const hasCanonicalFinal = Boolean(article.finalSection);',
  '!article.inlineFinalCta || hasCanonicalFinal',
  '`${pathname}: перед итоговым CTA`',
]) {
  if (!enhancements.includes(marker)) errors.push(`editorial-enhancements.mjs: нарушен порядок финальных блоков: ${marker}`);
}

for (const marker of [
  'Другие материалы по этому направлению',
  "insertBefore(html, '<aside class=\"editorial-author\"'",
]) {
  if (!linking.includes(marker)) errors.push(`publication-linking.mjs: нарушен контракт связанных материалов перед карточкой автора: ${marker}`);
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
  '.editorial-intake__questions :is(.editorial-checklist, .editorial-list) li',
  'color: var(--text-on-dark-strong)',
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
  console.error(["Проверка смысловых маркеров, ритма и финальной сборки C-139/C-170 не пройдена:", ...errors.map((item) => `- ${item}`)].join("\n"));
  process.exit(1);
}

console.log("Editorial policy passed: C-139/C-170 keep semantic markers, readable dark-panel contrast and canonical endflow: themed intake -> related materials -> author -> helpfulness -> final CTA");