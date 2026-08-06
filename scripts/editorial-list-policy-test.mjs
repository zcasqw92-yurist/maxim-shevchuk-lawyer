import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { articles } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const renderer = await readFile(join(root, "src", "editorial-render-base.mjs"), "utf8");
const styles = await readFile(join(root, "src", "editorial-semantic-lists.css"), "utf8");
const errors = [];
const policyStart = "2026-08-06";
const semanticFields = ["checklist", "avoid", "bullets", "dashes"];
const negativeChecklistPattern = /^(?:не\b|нельзя\b|проигнорир|отказат|признат|пообещат|спорит|ошибк)/iu;

for (const article of articles) {
  const governed = [article.publishedAt, article.modifiedAt]
    .filter(Boolean)
    .some((date) => date >= policyStart);
  if (!governed) continue;

  if (article.listPolicyVersion !== 1) {
    errors.push(`${article.slug}: для новой или существенно изменённой статьи не включена listPolicyVersion=1`);
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
