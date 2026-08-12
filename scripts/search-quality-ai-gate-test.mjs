import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const read = (path) => readFile(join(root, path), "utf8");
const exists = async (path) => {
  try {
    await access(join(root, path));
    return true;
  } catch {
    return false;
  }
};
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const unique = (values) => [...new Set(values)];
const placeholderPattern = /\b(?:replace|todo|tbd|placeholder)\b|заменить|заполнить|пример/iu;
const hasPlaceholder = (value) => nonEmpty(value) && placeholderPattern.test(value);
const globToRegExp = (pattern) => {
  const token = "__DOUBLE_STAR__";
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", token)
    .replaceAll("*", "[^/]*")
    .replaceAll(token, ".*");
  return new RegExp(`^${escaped}$`);
};
const matchesAny = (path, patterns) => patterns.some((pattern) => globToRegExp(pattern).test(path));
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const requireString = (value, label) => {
  if (!nonEmpty(value)) errors.push(`${label} is empty`);
  else if (hasPlaceholder(value)) errors.push(`${label} contains a placeholder`);
};
const requireStringArray = (value, label, minimum = 1) => {
  if (!Array.isArray(value) || value.length < minimum) {
    errors.push(`${label} must contain at least ${minimum} item(s)`);
    return;
  }
  value.forEach((item, index) => requireString(item, `${label}[${index}]`));
};

const [gateText, governanceText, docText, reviewTemplateText] = await Promise.all([
  read("config/search-quality-ai-gate.json"),
  read("config/content-governance.json"),
  read("docs/search-quality-ai-gate.md"),
  read("reports/content-sessions/search-quality-ai-review-template.json"),
]);

let gate;
let governance;
let reviewTemplate;
try { gate = JSON.parse(gateText); } catch (error) { errors.push(`config/search-quality-ai-gate.json: invalid JSON: ${error.message}`); }
try { governance = JSON.parse(governanceText); } catch (error) { errors.push(`config/content-governance.json: invalid JSON: ${error.message}`); }
try { reviewTemplate = JSON.parse(reviewTemplateText); } catch (error) { errors.push(`reports/content-sessions/search-quality-ai-review-template.json: invalid JSON: ${error.message}`); }

if (gate) {
  if (gate.schemaVersion !== 1) errors.push("Search/AI gate: schemaVersion must be 1");
  if (gate.ruleId !== "search-quality-ai-gate-2026-08-12") errors.push("Search/AI gate: unexpected ruleId");
  if (gate.scope !== "new-or-materially-updated-articles") errors.push("Search/AI gate: article scope is not fixed");
  if (gate.basis?.officialGoogleResearch !== "authoritative-public-guidance") errors.push("Search/AI gate: official Google guidance must remain authoritative public guidance");
  if (gate.basis?.contentWarehouseLeak !== "directional-evidence-only-no-known-weights") errors.push("Search/AI gate: leak evidence limitation is missing");
  if (gate.basis?.dojAndJudicialDisclosures !== "system-behavior-evidence-no-ranking-recipe") errors.push("Search/AI gate: judicial evidence limitation is missing");

  const articlePatterns = gate.articleContentPaths;
  if (!Array.isArray(articlePatterns) || articlePatterns.length === 0) {
    errors.push("Search/AI gate: articleContentPaths must be non-empty");
  } else {
    for (const pattern of ["content/**", "src/*-data.mjs", "src/*-source.mjs"]) {
      if (!articlePatterns.includes(pattern)) errors.push(`Search/AI gate: articleContentPaths is missing ${pattern}`);
    }
  }

  const requiredTrue = [
    "ownerIntentAligned",
    "titleH1LeadDirectAnswerAligned",
    "allSupportingQuestionsInsideOwnerIntent",
    "allMaterialH2HaveDirectExtractableAnswer",
    "materialLegalClaimsCheckedAgainstPrimaryOrOfficialSources",
    "practiceClaimsTraceableToInternalEvidence",
    "workProcedureAndOutcomeSeparated",
    "siteClusterFitAndCannibalizationChecked",
    "normalSearchEligibilityChecked",
    "materialFreshnessOnly",
    "postPublishMeasurementPlanRequired",
  ];
  for (const key of requiredTrue) if (gate.requiredReview?.[key] !== true) errors.push(`Search/AI gate: requiredReview.${key} must be true`);
  if ((gate.requiredReview?.minimumBoundedSupportingQuestions || 0) < 2) errors.push("Search/AI gate: at least two bounded supporting questions are required");

  for (const key of ["requireIndexable", "requireCanonical", "requireMobileParity", "requireNormalSnippetEligibility"]) {
    if (gate.searchEligibility?.[key] !== true) errors.push(`Search/AI gate: searchEligibility.${key} must be true`);
  }
  if (gate.searchEligibility?.structuredDataIsEligibilityNotRankingGuarantee !== true) errors.push("Search/AI gate: structured data must not be treated as a ranking guarantee");
  if (gate.searchEligibility?.specialAiSchemaRequired !== false) errors.push("Search/AI gate: special AI schema must not become a requirement");
  if (gate.searchEligibility?.llmsTxtRequiredForGoogleAi !== false) errors.push("Search/AI gate: llms.txt must not become a Google AI requirement");

  const mandatoryBlockers = [
    "owner-intent-drift",
    "title-h1-lead-direct-answer-drift",
    "fan-out-outside-owner-intent",
    "material-h2-without-direct-answer",
    "material-legal-claim-without-primary-or-official-evidence",
    "untraceable-practice-or-outcome-claim",
    "cannibalization-unresolved",
    "normal-search-eligibility-not-proven",
    "keyword-density-or-stuffing-target",
    "arbitrary-word-count-target",
    "click-or-user-behavior-manipulation",
    "link-scheme",
    "fake-freshness",
    "ai-ranking-guarantee-or-magic-schema-claim",
    "invented-leak-weight-or-ranking-formula",
    "major-rewrite-based-only-on-raw-ctr-or-tiny-sample",
  ];
  for (const blocker of mandatoryBlockers) if (!gate.hardBlockers?.includes(blocker)) errors.push(`Search/AI gate: missing hard blocker ${blocker}`);
}

for (const marker of [
  "SITE-R-015",
  "SITE-R-023",
  "query fan-out",
  "Navboost",
  "raw CTR",
  "llms.txt",
  "dateModified",
  "первичный/официальный",
  "canonical",
  "keyword stuffing",
]) {
  if (!docText.includes(marker)) errors.push(`docs/search-quality-ai-gate.md: missing marker ${marker}`);
}

const validateReview = (review, label) => {
  if (!review || typeof review !== "object") {
    errors.push(`${label}: searchQualityAiReview is missing`);
    return;
  }
  if (review.status !== "passed" || review.passed !== true) errors.push(`${label}: Search/AI review must be passed`);
  for (const key of [
    "ownerIntentAligned",
    "titleH1LeadDirectAnswerAligned",
    "allMaterialH2HaveDirectExtractableAnswer",
    "materialLegalClaimsPrimaryOrOfficialSourcesChecked",
    "practiceClaimsTraceable",
    "workProcedureAndOutcomeSeparated",
    "siteClusterFitAndCannibalizationChecked",
  ]) {
    if (review[key] !== true) errors.push(`${label}: ${key} must be true`);
  }

  requireString(review.ownerIntentEvidence?.preflightId, `${label}: ownerIntentEvidence.preflightId`);
  requireString(review.ownerIntentEvidence?.ownerUrl, `${label}: ownerIntentEvidence.ownerUrl`);
  requireString(review.ownerIntentEvidence?.rootQuery, `${label}: ownerIntentEvidence.rootQuery`);
  requireString(review.directAnswerEvidence?.title, `${label}: directAnswerEvidence.title`);
  requireString(review.directAnswerEvidence?.h1, `${label}: directAnswerEvidence.h1`);
  requireString(review.directAnswerEvidence?.shortAnswer, `${label}: directAnswerEvidence.shortAnswer`);

  const questions = review.supportingQuestions;
  if (!Array.isArray(questions) || questions.length < 2) {
    errors.push(`${label}: at least two supportingQuestions are required`);
  } else {
    questions.forEach((item, index) => {
      requireString(item?.question, `${label}: supportingQuestions[${index}].question`);
      requireString(item?.target, `${label}: supportingQuestions[${index}].target`);
      if (item?.inOwnerIntent !== true) errors.push(`${label}: supportingQuestions[${index}] leaves the owner intent`);
      if (item?.directAnswerPlanned !== true) errors.push(`${label}: supportingQuestions[${index}] has no direct answer plan`);
    });
  }

  requireStringArray(review.materialH2Evidence, `${label}: materialH2Evidence`);
  requireStringArray(review.legalSourceIds, `${label}: legalSourceIds`);
  if (review.practiceClaimsUsed === true) requireStringArray(review.practiceSourceIds, `${label}: practiceSourceIds`);
  if (review.practiceClaimsUsed !== true && review.practiceClaimsUsed !== false) errors.push(`${label}: practiceClaimsUsed must be a boolean`);

  requireString(review.clusterEvidence?.clusterCenterUrl, `${label}: clusterEvidence.clusterCenterUrl`);
  requireStringArray(review.clusterEvidence?.excludedQueries, `${label}: clusterEvidence.excludedQueries`);
  if (!Array.isArray(review.clusterEvidence?.relatedOwnerUrls)) errors.push(`${label}: clusterEvidence.relatedOwnerUrls must be an array`);
  else review.clusterEvidence.relatedOwnerUrls.forEach((item, index) => requireString(item, `${label}: clusterEvidence.relatedOwnerUrls[${index}]`));

  const eligibility = review.searchEligibility || {};
  for (const key of ["indexable", "canonical", "mobileParity", "normalSnippetEligible"]) {
    if (eligibility[key] !== true) errors.push(`${label}: searchEligibility.${key} must be true`);
  }
  requireString(eligibility.canonicalUrl, `${label}: searchEligibility.canonicalUrl`);
  if (eligibility.structuredDataTreatedAsRankingBoost !== false) errors.push(`${label}: structured data cannot be treated as a ranking boost`);
  if (eligibility.specialAiSchemaOrLlmsTxtRequired !== false) errors.push(`${label}: special AI schema/llms.txt cannot be required`);

  const prohibitions = review.prohibitions || {};
  for (const key of [
    "fixedKeywordDensityTargetUsed",
    "keywordStuffingUsed",
    "arbitraryFixedWordCountTargetUsed",
    "clickManipulationUsed",
    "linkSchemeUsed",
    "fakeFreshnessUsed",
    "inventedLeakWeightsUsed",
  ]) {
    if (prohibitions[key] !== false) errors.push(`${label}: prohibition ${key} must remain false`);
  }
  if (review.rawCtrUsedAsSoleSuccessMetric !== false) errors.push(`${label}: raw CTR cannot be the sole success metric`);

  const plan = review.postPublishMeasurementPlan;
  const requiredSignals = ["queries", "impressions", "activeReading", "contactIntent", "contactConversion"];
  if (!plan || !Array.isArray(plan.signals)) {
    errors.push(`${label}: postPublishMeasurementPlan.signals is missing`);
  } else {
    for (const signal of requiredSignals) if (!plan.signals.includes(signal)) errors.push(`${label}: post-publish signal ${signal} is required`);
  }
  if (plan?.majorRewriteRequiresMeaningfulEvidence !== true) errors.push(`${label}: major rewrites must require meaningful evidence`);
};

const validateSafeTemplate = (template) => {
  const label = "Search/AI review template";
  if (!template || typeof template !== "object") {
    errors.push(`${label}: template is missing`);
    return;
  }
  if (template.status !== "blocked" || template.passed !== false) errors.push(`${label}: template must be blocked by default`);
  for (const key of [
    "ownerIntentAligned",
    "titleH1LeadDirectAnswerAligned",
    "allMaterialH2HaveDirectExtractableAnswer",
    "materialLegalClaimsPrimaryOrOfficialSourcesChecked",
    "practiceClaimsTraceable",
    "workProcedureAndOutcomeSeparated",
    "siteClusterFitAndCannibalizationChecked",
  ]) {
    if (template[key] !== false) errors.push(`${label}: ${key} must default to false`);
  }
  if (!Array.isArray(template.supportingQuestions) || template.supportingQuestions.length !== 0) errors.push(`${label}: supportingQuestions must start empty`);
  if (!Array.isArray(template.materialH2Evidence) || template.materialH2Evidence.length !== 0) errors.push(`${label}: materialH2Evidence must start empty`);
  if (!Array.isArray(template.legalSourceIds) || template.legalSourceIds.length !== 0) errors.push(`${label}: legalSourceIds must start empty`);
  for (const key of ["indexable", "canonical", "mobileParity", "normalSnippetEligible"]) {
    if (template.searchEligibility?.[key] !== false) errors.push(`${label}: searchEligibility.${key} must default to false`);
  }
  if (nonEmpty(template.ownerIntentEvidence?.preflightId) || nonEmpty(template.ownerIntentEvidence?.ownerUrl) || nonEmpty(template.ownerIntentEvidence?.rootQuery)) errors.push(`${label}: owner intent evidence must start empty`);
  if (nonEmpty(template.searchEligibility?.canonicalUrl)) errors.push(`${label}: canonicalUrl must start empty`);
  if (!Array.isArray(template.postPublishMeasurementPlan?.signals) || template.postPublishMeasurementPlan.signals.length !== 0) errors.push(`${label}: post-publish signals must start empty`);
};

if (reviewTemplate) validateSafeTemplate(reviewTemplate);

let changedFiles = [];
try {
  const base = process.env.CONTENT_GOVERNANCE_BASE_SHA;
  if (base && !/^0+$/.test(base)) {
    changedFiles.push(...git(["diff", "--name-only", `${base}..HEAD`]).split("\n"));
  } else {
    changedFiles.push(...git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]).split("\n"));
  }
  changedFiles.push(...git(["diff", "--name-only"]).split("\n"));
  changedFiles.push(...git(["diff", "--cached", "--name-only"]).split("\n"));
  changedFiles.push(...git(["ls-files", "--others", "--exclude-standard"]).split("\n"));
} catch {
  // Archive and limited validation environments may have no Git history.
}
changedFiles = unique(changedFiles.map((item) => item.trim()).filter(Boolean));

if (governance && gate) {
  const governedPatterns = governance.governedContentPaths || [];
  const articlePatterns = gate.articleContentPaths || [];
  const articleChanges = changedFiles.filter((path) => matchesAny(path, governedPatterns) && matchesAny(path, articlePatterns));
  if (articleChanges.length) {
    const manifestPath = governance.sessionManifest?.path || "reports/content-sessions/latest.json";
    if (!(await exists(manifestPath))) {
      errors.push(`Search/AI gate: governed article change without ${manifestPath}`);
    } else {
      try {
        const manifest = JSON.parse(await read(manifestPath));
        validateReview(manifest.searchQualityAiReview, manifestPath);
      } catch (error) {
        errors.push(`${manifestPath}: invalid JSON for Search/AI gate: ${error.message}`);
      }
    }
  }
}

if (errors.length) {
  console.error("Search/AI quality gate failed:\n- " + [...new Set(errors)].join("\n- "));
  process.exit(1);
}

console.log("Search/AI quality gate passed: template is blocked by default and governed article changes require evidence-backed review.");
