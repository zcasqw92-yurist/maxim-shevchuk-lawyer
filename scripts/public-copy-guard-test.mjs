import { articles } from "../src/editorial-data.mjs";
import { collectTextValues, findPublicCopyFindings } from "./public-copy-rules.mjs";

const candidates = articles.filter((item) => item.status !== "archived");
const published = candidates.filter((item) => item.status === "published");
const errors = [];

for (const article of candidates) {
  const findings = findPublicCopyFindings(collectTextValues(article));
  for (const finding of findings) {
    errors.push(`${article.slug} [${article.status || "status missing"}]: ${finding.label}: ${finding.value}`);
  }
}

if (errors.length) {
  console.error([
    "Предпубликационная проверка публичного текста не пройдена.",
    "Новая или ранее опубликованная статья содержит внутреннюю редакционную терминологию, идентификатор либо черновой артефакт:",
    ...errors.map((item) => `- ${item}`),
  ].join("\n"));
  process.exit(1);
}

console.log(`Pre-publication public-copy review passed: ${candidates.length} current article sources checked`);
console.log(`Regression source review passed: ${published.length} previously published articles checked`);
