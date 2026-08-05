import { contractorRepairQualityClaimResponseArticles } from "../src/contractor-repair-quality-claim-response-data.mjs";
import { articles } from "../src/editorial-data.mjs";

const fail = (message) => {
  throw new Error(`C-139 publication contract: ${message}`);
};

if (contractorRepairQualityClaimResponseArticles.length !== 1) {
  fail("dedicated source module must contain exactly one article");
}

const [sourceArticle] = contractorRepairQualityClaimResponseArticles;
const article = articles.find((item) => item.id === "contractor-repair-quality-claim-response");

if (!article) fail("article is absent from editorial registry");
if (article === sourceArticle) fail("public registry must strip internal source metadata");
if (sourceArticle.contentId !== "C-139") fail("internal source lost Content ID");
if (Object.hasOwn(article, "contentId")) fail("internal Content ID leaked into public article");
if (article.status !== "published") fail("article status must be published");
if (article.slug !== "zakazchik-trebuet-vernut-dengi-za-remont") fail("unexpected slug");
if (!article.title.includes("как подрядчику ответить на претензию")) fail("H1 does not answer the contractor-side intent");
if (!article.description || article.description.length < 70 || article.description.length > 170) {
  fail(`description length must be 70-170 characters, got ${article.description?.length ?? 0}`);
}

const expectedSections = [
  "first-actions",
  "consumer-or-business",
  "claim-breakdown",
  "acceptance-act",
  "guarantee-and-proof",
  "inspection-access",
  "expert-evidence",
  "response-options",
  "response-content",
  "response-deadlines",
  "lawyer-work",
  "common-errors",
];
const actualSections = article.sections.map((section) => section.id);
if (actualSections.length !== expectedSections.length) fail("approved section count changed");
for (let index = 0; index < expectedSections.length; index += 1) {
  if (actualSections[index] !== expectedSections[index]) {
    fail(`section order changed at position ${index + 1}: expected ${expectedSections[index]}, got ${actualSections[index]}`);
  }
}

if (!Array.isArray(article.faq) || article.faq.length < 8) fail("FAQ coverage is insufficient");
if (!Array.isArray(article.sources) || article.sources.length < 8) fail("legal source coverage is insufficient");
if (article.editorialGateVersion !== 1) fail("commercial editorial gate is not enabled");

const copy = JSON.stringify(article).toLowerCase();
for (const required of [
  "подписанный акт",
  "скрытые",
  "гарантийн",
  "предложите осмотр",
  "десятиднев",
  "лишних признаний",
  "ошибки подрядчика и их цена",
  "мотивированный ответ",
]) {
  if (!copy.includes(required)) fail(`required legal or commercial boundary is missing: ${required}`);
}

for (const forbidden of [
  "c-139",
  "юд-имп-151",
  "оплаченная работа",
  "гарантирую результат",
  "точно выигра",
  "рабочей базе",
  "seo",
  "content id",
]) {
  if (copy.includes(forbidden)) fail(`internal or misleading phrase leaked: ${forbidden}`);
}

if (!article.ctaTitle?.includes("ответ подрядчика")) fail("CTA title is not tied to the target document");
if (!article.ctaDescription?.includes("претензию, договор, смету, акты")) fail("CTA does not name the input documents");
if (!article.ctaButtonLabel?.includes("Передать документы")) fail("CTA button is generic");
if (!(article.relatedArticleSlugs || []).includes("zakazchik-ne-oplatil-rabotu-bez-dogovora")) {
  fail("mandatory related contractor article is missing");
}

console.log("C-139 publication contract passed");