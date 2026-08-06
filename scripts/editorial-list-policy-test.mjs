import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { articles } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const renderer = await readFile(join(root, "src", "editorial-render-base.mjs"), "utf8");
const styles = await readFile(join(root, "src", "editorial-semantic-lists.css"), "utf8");
const errors = [];
const semanticFields = ["checklist", "avoid", "bullets", "dashes"];
const requiredPolicyArticleIds = new Set(["contractor-repair-quality-claim-response"]);
const negativeChecklistPattern = /^(?:не\b|нельзя\b|проигнорир|отказат|признат|пообещат|спорит|ошибк)/iu;

for (const article of articles) {
  const usesSemanticPolicy = requiredPolicyArticleIds.has(article.id)
    || article.listPolicyVersion !== undefined
    || (article.sections || []).some((section) => section.avoid !== undefined
      || section.bullets !== undefined
      || section.dashes !== undefined
      || section.microCta !== undefined);
  if (!usesSemanticPolicy) continue;

  if (article.listPolicyVersion !== 1) {
    errors.push(`${article.slug}: статья использует новые смысловые списки, но listPolicyVersion=1 не включена`);
    continue;
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

for (const requiredId of requiredPolicyArticleIds) {
  const article = articles.find((item) => item.id === requiredId);
  if (!article) errors.push(`обязательная статья ${requiredId} отсутствует в реестре`);
  else if (article.listPolicyVersion !== 1) errors.push(`${article.slug}: обязательное правило смысловых маркеров отключено`);
}

for (const marker of [
  'semanticList(section.avoid, "cross")',
  'semanticList(section.bullets, "dot")',
  'semanticList(section.dashes, "dash")',
  'class="editorial-micro-cta"',
  'editorial-list editorial-list--dash',
  'editorial-list editorial-list--dot',
]) {
  if (!renderer.includes(marker)) errors.push(`renderer: отсутствует обязательный контракт ${marker}`);
}

for (const marker of [
  '.editorial-list--cross li::before',
  'content: "×"',
  'color: var(--gold-text)',
  '.editorial-list--dot li::before',
  'content: "•"',
  '.editorial-list--dash li::before',
  'content: "—"',
  'color: var(--ink-soft)',
  '.editorial-micro-cta',
]) {
  if (!styles.includes(marker)) errors.push(`editorial-semantic-lists.css: отсутствует обязательный контракт ${marker}`);
}

if (errors.length) {
  console.error(["Проверка смысловых маркеров списков не пройдена:", ...errors.map((item) => `- ${item}`)].join("\n"));
  process.exit(1);
}

console.log("Editorial list policy passed: checks confirm actions, crosses mark prohibitions, neutral bullets keep text color");
