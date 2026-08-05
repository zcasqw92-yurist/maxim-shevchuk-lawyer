import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const errors = [];
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const unique = (values) => [...new Set(values)];
const placeholderPattern = /(^|\b)(replace|example|placeholder)(\b|$)|замен(ить|ите)|укаж(ите|и)|yyyy/i;
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

let config;
let template;
try {
  config = await readJson("config/content-governance.json");
} catch (error) {
  errors.push(`SEO preflight governance: cannot read config/content-governance.json: ${error.message}`);
}
try {
  template = await readJson("reports/content-sessions/template.json");
} catch (error) {
  errors.push(`SEO preflight governance: cannot read reports/content-sessions/template.json: ${error.message}`);
}

if (config) {
  const policy = config.seoKnowledgeBase;
  if (!policy) errors.push("SEO preflight governance: seoKnowledgeBase policy is missing");
  const expectedTabs = {
    collectionRegistryTab: "17_SEO_сборы",
    keywordRegistryTab: "18_SEO_база_ключей",
    preflightTab: "19_SEO_preflight",
  };
  for (const [field, expected] of Object.entries(expectedTabs)) {
    if (policy?.[field] !== expected) errors.push(`SEO preflight governance: ${field} must be ${expected}`);
  }
  for (const field of [
    "requireAccumulatedDataReviewBeforePaidCall",
    "requirePaidCollectionRegisteredBeforeCall",
    "requirePaidCollectionJustification",
    "requireAllReturnedKeywordsImported",
    "requireYandexAndGoogleCollectionIdsBeforeDraft",
    "requireKeywordIdsBeforeDraft",
    "requireDraftAuthorization",
  ]) {
    if (policy?.[field] !== true) errors.push(`SEO preflight governance: ${field} must be true`);
  }
  if (policy?.draftAuthorizationValue !== "РАЗРЕШЕНО") errors.push("SEO preflight governance: draftAuthorizationValue must be РАЗРЕШЕНО");
  if (policy?.blockedValue !== "ЗАБЛОКИРОВАНО") errors.push("SEO preflight governance: blockedValue must be ЗАБЛОКИРОВАНО");
  if (policy?.nonArticleDecisionValue !== "ТЕКСТ СТАТЬИ НЕ НУЖЕН") errors.push("SEO preflight governance: nonArticleDecisionValue is invalid");
  if (config.sessionManifest?.mustPassSeoPreflight !== true) errors.push("SEO preflight governance: session manifest must pass SEO preflight");
}

if (template) {
  const review = template.seoKnowledgeBaseReview;
  if (!review) errors.push("SEO preflight governance: template is missing seoKnowledgeBaseReview");
  if (review?.accumulatedDataChecked !== true) errors.push("SEO preflight governance: template must require accumulatedDataChecked=true");
  if (!Array.isArray(review?.collectionIds)) errors.push("SEO preflight governance: template collectionIds must be an array");
  if (!Array.isArray(review?.keywordIds)) errors.push("SEO preflight governance: template keywordIds must be an array");
  if (!nonEmpty(review?.preflightId)) errors.push("SEO preflight governance: template preflightId is missing");
  if (!Object.hasOwn(review || {}, "newPaidCollectionRequired")) errors.push("SEO preflight governance: template must declare newPaidCollectionRequired");
  if (!Object.hasOwn(review || {}, "paidCollectionReason")) errors.push("SEO preflight governance: template must declare paidCollectionReason");
  if (!Object.hasOwn(review || {}, "draftStartedAfterAuthorization")) errors.push("SEO preflight governance: template must declare draftStartedAfterAuthorization");
}

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
  // Source archives and local validation environments may not have Git history.
}
changedFiles = unique(changedFiles.map((path) => path.trim()).filter(Boolean));

if (config) {
  const governedChanges = changedFiles.filter((path) => matchesAny(path, config.governedContentPaths || []));
  if (governedChanges.length) {
    let manifest;
    try {
      manifest = await readJson(config.sessionManifest?.path || "reports/content-sessions/latest.json");
    } catch (error) {
      errors.push(`SEO preflight governance: cannot read publication manifest: ${error.message}`);
    }
    if (manifest) {
      const review = manifest.seoKnowledgeBaseReview;
      if (!review) {
        errors.push("SEO preflight governance: publication manifest is missing seoKnowledgeBaseReview");
      } else {
        if (review.accumulatedDataChecked !== true) errors.push("SEO preflight governance: accumulated SEO data was not checked");
        if (!nonEmptyArray(review.collectionIds) || review.collectionIds.length < 2) errors.push("SEO preflight governance: Yandex and Google collection IDs are required");
        if ((review.collectionIds || []).some((id) => !nonEmpty(id) || hasPlaceholder(id))) errors.push("SEO preflight governance: collectionIds contain an empty or placeholder value");
        if (unique(review.collectionIds || []).length !== (review.collectionIds || []).length) errors.push("SEO preflight governance: collectionIds contain duplicates");
        if (!nonEmptyArray(review.keywordIds)) errors.push("SEO preflight governance: at least one Keyword ID is required");
        if ((review.keywordIds || []).some((id) => !nonEmpty(id) || hasPlaceholder(id))) errors.push("SEO preflight governance: keywordIds contain an empty or placeholder value");
        if (unique(review.keywordIds || []).length !== (review.keywordIds || []).length) errors.push("SEO preflight governance: keywordIds contain duplicates");
        if (!nonEmpty(review.preflightId) || hasPlaceholder(review.preflightId)) errors.push("SEO preflight governance: a valid preflightId is required");
        if (typeof review.newPaidCollectionRequired !== "boolean") errors.push("SEO preflight governance: newPaidCollectionRequired must be boolean");
        if (review.newPaidCollectionRequired === true && (!nonEmpty(review.paidCollectionReason) || hasPlaceholder(review.paidCollectionReason))) {
          errors.push("SEO preflight governance: paid SEO collection requires a concrete reason");
        }
        if (review.draftAuthorization !== config.seoKnowledgeBase?.draftAuthorizationValue) errors.push("SEO preflight governance: draftAuthorization must be РАЗРЕШЕНО");
        if (review.draftStartedAfterAuthorization !== true) errors.push("SEO preflight governance: draft must start only after authorization");
      }
    }
  }
}

if (errors.length) {
  console.error(unique(errors).join("\n"));
  process.exit(1);
}

console.log(`SEO preflight governance passed: ${changedFiles.length} changed files checked`);
