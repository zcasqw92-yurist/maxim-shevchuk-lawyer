import { articles } from "../src/editorial-data.mjs";

const fail = (article, message) => {
  throw new Error(`Commercial editorial gate (${article.contentId || article.id}): ${message}`);
};

const normalizedText = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
const articleText = (article) => normalizedText(JSON.stringify(article));

const gatedArticles = articles.filter((article) => Number(article.editorialGateVersion) >= 1);
if (!gatedArticles.length) throw new Error("Commercial editorial gate: no opt-in articles found");

for (const article of gatedArticles) {
  const text = articleText(article);
  const sectionIds = article.sections.map((section) => section.id);

  if (!article.contentId) fail(article, "Content ID is required");
  if (!article.ctaTitle || !article.ctaDescription || !article.ctaButtonLabel) {
    fail(article, "specific CTA title, description and button label are required");
  }
  if (!text.includes("ошиб") || (!text.includes("→") && !text.includes("последств"))) {
    fail(article, "price-of-error chain is missing");
  }
  if (!text.includes("самостоятель") && !text.includes("можно сделать самому")) {
    fail(article, "self-service boundary is missing");
  }
  if (!text.includes("юрист") || !text.includes("в работу входит")) {
    fail(article, "scope of the paid legal work is missing");
  }
  if (!text.includes("не гарант") && !text.includes("не означает")) {
    fail(article, "result boundary is missing");
  }
  if (new Set(sectionIds).size !== sectionIds.length) fail(article, "duplicate section IDs found");

  const repeatedParagraphs = new Map();
  for (const section of article.sections) {
    for (const paragraph of section.paragraphs || []) {
      const normalized = normalizedText(paragraph);
      if (normalized.length < 80) continue;
      repeatedParagraphs.set(normalized, (repeatedParagraphs.get(normalized) || 0) + 1);
    }
  }
  for (const [paragraph, count] of repeatedParagraphs) {
    if (count > 1) fail(article, `repeated paragraph found: ${paragraph.slice(0, 80)}…`);
  }

  for (const forbidden of [
    "следует отметить",
    "необходимо понимать",
    "в рамках сложившейся ситуации",
    "осуществить направление",
    "произвести фиксацию",
    "проверить свою ситуацию",
  ]) {
    if (text.includes(forbidden)) fail(article, `bureaucratic or generic phrase found: ${forbidden}`);
  }
}

console.log(`Commercial editorial gate passed for ${gatedArticles.length} article(s)`);
