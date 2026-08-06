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
if (article.listPolicyVersion !== 1) fail("semantic list policy is not enabled");

const expectedSections = [
  "first-actions",
  "dangerous-messages",
  "consumer-or-business",
  "claim-breakdown",
  "acceptance-act",
  "guarantee-and-proof",
  "inspection-access",
  "evidence-loss",
  "expert-evidence",
  "response-options",
  "response-content",
  "response-deadlines",
  "high-risk-cases",
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

const sections = Object.fromEntries(article.sections.map((section) => [section.id, section]));
if ((sections["first-actions"].checklist || []).length < 3) fail("positive first actions must use gold checks");
if ((sections["first-actions"].avoid || []).length < 3) fail("first-action prohibitions must use gold crosses");
if ((sections["dangerous-messages"].avoid || []).length < 5) fail("dangerous messages need a cross-marked warning list");
if (sections["dangerous-messages"].microCta?.href !== "#self-check") fail("first soft CTA must lead to document intake");
if ((sections["evidence-loss"].dashes || []).length < 5) fail("evidence-loss sequence must use neutral dashes");
if (sections["evidence-loss"].microCta?.href !== "#self-check") fail("urgent soft CTA must lead to document intake");
if ((sections["high-risk-cases"].bullets || []).length < 8) fail("high-risk signs must use neutral dots");
if ((sections["common-errors"].avoid || []).length < 7) fail("contractor errors must use gold crosses");
if (sections["common-errors"].checklist?.length) fail("contractor errors may not use check marks");

const negativeChecklistPattern = /^(?:не\b|нельзя\b|проигнорир|отказат|признат|пообещат|спорит)/iu;
for (const section of article.sections) {
  for (const field of ["checklist", "avoid", "bullets", "dashes"]) {
    if (section[field] !== undefined && (!Array.isArray(section[field]) || section[field].some((item) => typeof item !== "string" || !item.trim()))) {
      fail(`${section.id}: invalid semantic list ${field}`);
    }
  }
  for (const item of section.checklist || []) {
    if (negativeChecklistPattern.test(item.trim())) fail(`${section.id}: prohibition or error incorrectly marked with a check: ${item}`);
  }
}

if (!Array.isArray(article.faq) || article.faq.length < 8) fail("FAQ coverage is insufficient");
if (!Array.isArray(article.sources) || article.sources.length < 8) fail("legal source coverage is insufficient");
if (article.editorialGateVersion !== 1) fail("commercial editorial gate is not enabled");
if (article.relatedArticleMode !== "explicit" || article.relatedArticleLimit !== 1) {
  fail("related materials must stay limited to one explicitly selected article");
}
if (!article.hideMessageGuide) fail("duplicate generic message guide must stay disabled");
if (!article.intakeTitle?.includes("передать на проверку")) fail("intake is not tied to document review");
if (article.intakeQuestionsTitle !== "В работу входит") fail("public registry must retain the approved client-facing intake heading");
if (!article.intakeButtonLabel?.includes("Передать претензию")) fail("intake CTA is generic");

const copy = JSON.stringify(article).toLowerCase();
for (const required of [
  "само получение претензии не означает",
  "одно сообщение может выглядеть как признание дефекта",
  "что нельзя писать заказчику до проверки",
  "объект уже собираются переделывать",
  "как подрядчик теряет возможность доказать свою позицию",
  "признать полностью",
  "предложить осмотр",
  "десятиднев",
  "ошибки подрядчика и их цена",
  "мотивированном ответе",
  "проверьте ответ до того, как он станет доказательством",
  "формулировки ответа без лишних признаний",
]) {
  if (!copy.includes(required)) fail(`required legal, risk or commercial boundary is missing: ${required}`);
}

for (const forbidden of [
  "c-139",
  "юд-имп-151",
  "оплаченная работа",
  "гарантирую результат",
  "точно выигра",
  "рабочей базе",
  "content id",
  "проверить свою ситуацию",
  "автоматическ",
  "механическ",
]) {
  if (copy.includes(forbidden)) fail(`internal, generic, unnatural or misleading phrase leaked: ${forbidden}`);
}

if (!article.ctaTitle?.includes("до того, как он станет доказательством")) fail("CTA title does not communicate the irreversible risk");
if (!article.ctaDescription?.includes("претензию, договор, смету, акты")) fail("CTA does not name the input documents");
if (!article.ctaButtonLabel?.includes("Передать претензию")) fail("CTA button is generic");
if (!(article.relatedArticleSlugs || []).includes("zakazchik-ne-oplatil-rabotu-bez-dogovora")) {
  fail("mandatory related contractor article is missing");
}

console.log("C-139 publication contract passed: stronger risk path, soft CTAs, conversational copy and semantic list markers locked");
