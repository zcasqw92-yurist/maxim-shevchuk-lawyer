import { houseConstructionContractorRefundArticles } from "../src/house-construction-contractor-refund-data.mjs";
import { articles } from "../src/editorial-data.mjs";

const fail = (message) => {
  throw new Error(`C-125 publication contract: ${message}`);
};

if (houseConstructionContractorRefundArticles.length !== 1) {
  fail("dedicated source module must contain exactly one article");
}

const [sourceArticle] = houseConstructionContractorRefundArticles;
const article = articles.find((item) => item.id === "house-construction-contractor-refund");

if (!article) fail("article is absent from editorial registry");
if (article !== sourceArticle) fail("registry must use the dedicated source object without a public-copy wrapper");
if (article.status !== "published") fail("article status must be published");
if (article.slug !== "podryadchik-ne-postroil-dom-posle-oplaty") fail("unexpected slug");
if (!article.title.includes("как отказаться от договора и вернуть деньги")) fail("H1 does not answer the primary intent");
if (!article.lead.includes("зафиксируйте фактическое состояние участка")) fail("lead lacks the immediate first action");
if (!article.lead.includes("не просить подрядчика «расторгнуть договор»")) fail("lead lacks the refusal-versus-termination distinction");

const requiredSections = [
  "first-actions",
  "proper-party",
  "land-and-construction",
  "right-to-refuse",
  "partial-result",
  "evidence-matrix",
  "claim-amount",
  "pretrial-claim",
  "interim-measures",
  "police-route",
  "practice-boundaries",
  "common-errors",
];
const sectionIds = new Set(article.sections.map((section) => section.id));
for (const id of requiredSections) {
  if (!sectionIds.has(id)) fail(`missing section ${id}`);
}

if (!Array.isArray(article.faq) || article.faq.length < 10) fail("FAQ coverage is insufficient");
if (!Array.isArray(article.sources) || article.sources.length < 10) fail("legal source coverage is insufficient");

const relatedServiceSlugs = new Set((article.relatedServices || []).map((item) => item.slug));
for (const slug of ["dosudebnoe-uregulirovanie", "iskovoe-zayavlenie", "zhaloby-i-obrashcheniya"]) {
  if (!relatedServiceSlugs.has(slug)) fail(`missing related service ${slug}`);
}

const copy = JSON.stringify(article).toLowerCase();
for (const forbidden of ["маша", "гаишник", "узбек", "40 домов", "6500000", "6 500 000"]) {
  if (copy.includes(forbidden)) fail(`source personal or unverified detail leaked: ${forbidden}`);
}
for (const requiredBoundary of ["не позволяет заявлять", "не подтверждены", "не доказывают мошенничество"]) {
  if (!copy.includes(requiredBoundary)) fail(`missing evidentiary boundary: ${requiredBoundary}`);
}

if (!copy.includes("одностороннего отказа")) fail("target document does not contain unilateral-refusal logic");
if (!copy.includes("соразмер")) fail("interim-measures proportionality is missing");
if (!copy.includes("до их получения")) fail("fraud route lacks the initial-intent boundary");

console.log("C-125 publication contract passed");
