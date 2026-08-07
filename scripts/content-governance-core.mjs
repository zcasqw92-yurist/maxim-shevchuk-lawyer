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

const unique = (values) => [...new Set(values)];
const sameMembers = (left, right) => {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};
const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const normalizeIntent = (value) => String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
const placeholderPattern = /(^|\b)(replace|example|placeholder)(\b|$)|замен(ить|ите)|укаж(ите|и)|yyyy/i;
const hasPlaceholder = (value) => nonEmptyString(value) && placeholderPattern.test(value);
const validUrl = (value) => {
  if (!nonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};
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

const [configText, agents, governanceDoc, publishingDoc, prTemplate, templateText, packageText, workflow, ciWorkflow] = await Promise.all([
  read("config/content-governance.json"),
  read("AGENTS.md"),
  read("docs/content-governance.md"),
  read("docs/PUBLISHING.md"),
  read(".github/pull_request_template.md"),
  read("reports/content-sessions/template.json"),
  read("package.json"),
  read(".github/workflows/pages.yml"),
  read(".github/workflows/ci.yml"),
]);

let config;
let template;
let packageJson;
try { config = JSON.parse(configText); } catch (error) { errors.push(`config/content-governance.json: invalid JSON: ${error.message}`); }
try { template = JSON.parse(templateText); } catch (error) { errors.push(`reports/content-sessions/template.json: invalid JSON: ${error.message}`); }
try { packageJson = JSON.parse(packageText); } catch (error) { errors.push(`package.json: invalid JSON: ${error.message}`); }

const sheetId = "1W4014FzdUJWYDja7VUh5XXUsSuxtQIrcS5fWRX1rm24";
const requiredClusterGates = ["intentOwnership", "serpSnapshot", "originalPracticalElement"];
if (config) {
  if (config.schemaVersion !== 3) errors.push("content governance: schemaVersion must be 3");
  if (config.priority !== "highest-project-content-rule") errors.push("content governance: project priority is not fixed");
  if (config.spreadsheet?.id !== sheetId) errors.push("content governance: wrong canonical spreadsheet ID");
  if (config.spreadsheet?.requireAllTabs !== true) errors.push("content governance: all-tabs requirement must be true");
  if (config.spreadsheet?.discoverTabsDynamically !== true) errors.push("content governance: dynamic tab discovery must be true");
  const baselineTabs = config.spreadsheet?.baselineSnapshot?.tabs || [];
  if (baselineTabs.length !== config.spreadsheet?.baselineSnapshot?.tabCount) errors.push("content governance: baseline tab count does not match tab list");
  if (unique(baselineTabs).length !== baselineTabs.length) errors.push("content governance: duplicate baseline tabs");
  for (const required of ["00_Старт", "10_Контентные_возможности", "11_Кейсы_для_публикации", "16_Контроль_данных", "_События_воронки"]) {
    if (!baselineTabs.includes(required)) errors.push(`content governance: baseline tab is missing: ${required}`);
  }

  const cluster = config.clusterPreparation;
  if (!cluster || !sameMembers(cluster.requiredGates || [], requiredClusterGates)) errors.push("content governance: all three cluster preparation gates must be required");
  if (cluster?.intentOwnership?.requireSingleOwnerPerIntent !== true) errors.push("content governance: single intent owner must be required");
  if (cluster?.intentOwnership?.requireExcludedQueries !== true) errors.push("content governance: excluded queries must be required");
  if (cluster?.intentOwnership?.requireExistingPagesReview !== true) errors.push("content governance: existing page review must be required");
  if (cluster?.intentOwnership?.requireEveryChangedUrlMapped !== true) errors.push("content governance: every changed URL must be mapped to an intent owner");
  if (!sameMembers(cluster?.serpSnapshot?.requiredEngines || [], ["Yandex", "Google"])) errors.push("content governance: Yandex and Google SERP snapshots must both be required");
  if ((cluster?.serpSnapshot?.minimumOrganicResultsReviewedPerEngine || 0) < 5) errors.push("content governance: at least five organic SERP results per engine must be reviewed");
  if (cluster?.serpSnapshot?.organicResultsOnlyForMinimum !== true) errors.push("content governance: sponsored results must not count toward the organic SERP minimum");
  if (cluster?.serpSnapshot?.requireSponsoredResultsRecordedSeparately !== true) errors.push("content governance: sponsored SERP placements must be recorded separately");
  if (!nonEmptyArray(cluster?.serpSnapshot?.sponsoredResultLabels)) errors.push("content governance: sponsored result labels are missing");
  if ((cluster?.serpSnapshot?.maxAgeDaysAtReview || 0) > 14) errors.push("content governance: SERP snapshot may not be older than 14 days");
  if (cluster?.serpSnapshot?.requireBetterAnswerDecision !== true) errors.push("content governance: better-answer decision must be required");
  if ((cluster?.originalPracticalElement?.minimumPerChangedMaterial || 0) < 1) errors.push("content governance: every changed material needs a practical element");
  if (!nonEmptyArray(cluster?.originalPracticalElement?.allowedTypes)) errors.push("content governance: practical element types are missing");
  if (config.sessionManifest?.mustPassAllClusterGates !== true) errors.push("content governance: session manifest must pass all cluster gates");
}

for (const [name, text, markers] of [
  ["AGENTS.md", agents, [sheetId, "каждую", "npm run check", "live-all-publications-smoke.mjs", "reports/content-sessions/latest.json", "владелец интента", "слепок выдачи", "органических результатов", "Рекламные размещения", "оригинальный практический элемент"]],
  ["docs/content-governance.md", governanceDoc, [sheetId, "00_Старт", "_Импорт_ЮД_151_200", "Три обязательных шлюза", "Шлюз владельца интента", "Шлюз слепка выдачи", "органических результатов", "Рекламные размещения", "Шлюз оригинального практического элемента", "Обязательный отчёт в чате"]],
  ["docs/PUBLISHING.md", publishingDoc, [sheetId, "reports/content-sessions/latest.json", "npm run test:content-governance", "Три шлюза до создания страницы", "Слепок выдачи", "органических результатов", "Рекламные размещения", "Оригинальный практический элемент"]],
  [".github/pull_request_template.md", prTemplate, ["единственная страница-владелец", "слепок Яндекса и Google", "органических результатов", "Рекламные размещения", "оригинальный практический элемент"]],
]) {
  for (const marker of markers) if (!text.includes(marker)) errors.push(`${name}: missing marker: ${marker}`);
}

if (template && config) {
  const discovered = template.spreadsheet?.discoveredTabs || [];
  const reviewed = (template.reviewedTabs || []).map((tab) => tab.name);
  const baseline = config.spreadsheet?.baselineSnapshot?.tabs || [];
  if (template.schemaVersion !== 3) errors.push("content session template: schemaVersion must be 3");
  if (template.spreadsheet?.id !== sheetId) errors.push("content session template: wrong spreadsheet ID");
  if (template.spreadsheet?.metadataTabCount !== discovered.length) errors.push("content session template: metadataTabCount does not match discovered tabs");
  if (!sameMembers(discovered, reviewed)) errors.push("content session template: every discovered tab must be reviewed exactly once");
  for (const tab of baseline) if (!discovered.includes(tab)) errors.push(`content session template: baseline tab missing: ${tab}`);
  for (const tab of template.reviewedTabs || []) {
    if (!tab.range || tab.reviewedNonEmptyCells !== true || tab.notesReviewed !== true) errors.push(`content session template: incomplete review contract for ${tab.name || "unknown tab"}`);
  }
  if (!nonEmptyArray(template.seoReview?.intentOwnership)) errors.push("content session template: intent ownership gate is missing");
  if (!nonEmptyArray(template.seoReview?.serpSnapshots)) errors.push("content session template: SERP snapshot gate is missing");
  if (!nonEmptyArray(template.seoReview?.practicalElements)) errors.push("content session template: practical element gate is missing");
  const templateEngines = template.seoReview?.serpSnapshots?.[0]?.engines?.map((item) => item.engine) || [];
  if (!sameMembers(templateEngines, config.clusterPreparation?.serpSnapshot?.requiredEngines || [])) errors.push("content session template: Yandex and Google examples are required");
  for (const engine of template.seoReview?.serpSnapshots?.[0]?.engines || []) {
    if (!Number.isInteger(engine.organicResultsReviewed) || engine.organicResultsReviewed < config.clusterPreparation.serpSnapshot.minimumOrganicResultsReviewedPerEngine) errors.push(`content session template: organic SERP count example is invalid for ${engine.engine || "unknown engine"}`);
    if (!Number.isInteger(engine.sponsoredResultsObserved) || engine.sponsoredResultsObserved < 0) errors.push(`content session template: sponsored SERP count example is invalid for ${engine.engine || "unknown engine"}`);
    if (!Array.isArray(engine.sponsoredResultLabels) || !Array.isArray(engine.sponsoredAdvertiserTypes) || !Array.isArray(engine.sponsoredOfferPatterns)) errors.push(`content session template: sponsored SERP fields are missing for ${engine.engine || "unknown engine"}`);
    if (Object.hasOwn(engine, "topResultsReviewed")) errors.push(`content session template: topResultsReviewed is deprecated for ${engine.engine || "unknown engine"}`);
  }
}

if (!packageJson?.scripts?.["test:content-governance"]) errors.push("package.json: test:content-governance is missing");
if (!packageJson?.scripts?.check?.startsWith("npm run test:content-governance")) errors.push("package.json: content governance must be the first full-check gate");
for (const [label, workflowText] of [["pages.yml", workflow], ["ci.yml", ciWorkflow]]) {
  if (!workflowText.includes("fetch-depth: 1")) errors.push(`${label}: checkout должен получать только текущий commit`);
  if (!workflowText.includes('git fetch --no-tags --depth=1 origin "$BASE_SHA"')) errors.push(`${label}: должен точечно загружаться CONTENT_GOVERNANCE_BASE_SHA`);
  if (workflowText.includes("fetch-depth: 0")) errors.push(`${label}: полная история всех refs больше не должна загружаться`);
  if (!workflowText.includes("CONTENT_GOVERNANCE_BASE_SHA")) errors.push(`${label}: base SHA должен передаваться governance test`);
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
  // Source archives and some local validation environments have no Git history.
}
changedFiles = unique(changedFiles.map((path) => path.trim()).filter(Boolean));

if (config) {
  const governedChanges = changedFiles.filter((path) => matchesAny(path, config.governedContentPaths || []));
  const generatedChanges = changedFiles.filter((path) => matchesAny(path, config.generatedPaths || []));
  if (generatedChanges.length) errors.push(`content governance: generated dist files changed directly: ${generatedChanges.join(", ")}`);

  if (governedChanges.length) {
    const manifestPath = config.sessionManifest?.path;
    if (!manifestPath || !(await exists(manifestPath))) {
      errors.push(`content governance: governed content changed without ${manifestPath || "session manifest"}`);
    } else {
      if (config.sessionManifest?.mustChangeWithGovernedContent && !changedFiles.includes(manifestPath)) {
        errors.push(`content governance: ${manifestPath} must change in the same publication session`);
      }
      let manifest;
      try { manifest = JSON.parse(await read(manifestPath)); } catch (error) { errors.push(`${manifestPath}: invalid JSON: ${error.message}`); }
      if (manifest) {
        const discovered = manifest.spreadsheet?.discoveredTabs || [];
        const reviewedTabs = manifest.reviewedTabs || [];
        const reviewedNames = reviewedTabs.map((tab) => tab.name);
        const baseline = config.spreadsheet?.baselineSnapshot?.tabs || [];
        if (manifest.schemaVersion !== 3) errors.push(`${manifestPath}: schemaVersion must be 3`);
        if (manifest.spreadsheet?.id !== sheetId) errors.push(`${manifestPath}: wrong spreadsheet ID`);
        if (!validDate(manifest.reviewedAt)) errors.push(`${manifestPath}: reviewedAt is missing or invalid`);
        if (!validDate(manifest.spreadsheet?.modifiedTime)) errors.push(`${manifestPath}: spreadsheet modifiedTime is missing or invalid`);
        if (validDate(manifest.reviewedAt) && validDate(manifest.spreadsheet?.modifiedTime) && Date.parse(manifest.reviewedAt) < Date.parse(manifest.spreadsheet.modifiedTime)) {
          errors.push(`${manifestPath}: review predates the spreadsheet snapshot`);
        }
        if (manifest.spreadsheet?.metadataTabCount !== discovered.length) errors.push(`${manifestPath}: metadataTabCount does not match discovered tabs`);
        if (unique(discovered).length !== discovered.length) errors.push(`${manifestPath}: discovered tabs contain duplicates`);
        if (!sameMembers(discovered, reviewedNames)) errors.push(`${manifestPath}: every discovered tab must be reviewed exactly once`);
        for (const tab of baseline) if (!discovered.includes(tab)) errors.push(`${manifestPath}: required baseline tab missing: ${tab}`);
        for (const tab of reviewedTabs) {
          if (!tab.range || tab.reviewedNonEmptyCells !== true || tab.notesReviewed !== true) errors.push(`${manifestPath}: incomplete tab review: ${tab.name || "unknown"}`);
        }
        for (const field of ["factsSeparatedFromHypotheses", "paidWorkSeparatedFromPaymentDetails", "workProcedureAndCaseResultsSeparated", "legalSourcesVerified", "anonymizationVerified", "criticalSourceErrorsResolved"]) {
          if (manifest.editorialChecks?.[field] !== true) errors.push(`${manifestPath}: editorial check is not complete: ${field}`);
        }

        const seo = manifest.seoReview;
        if (seo?.status !== "completed") errors.push(`${manifestPath}: SEO review must be completed`);
        if (!validDate(seo?.checkedAt)) errors.push(`${manifestPath}: SEO checkedAt is missing or invalid`);
        if (!nonEmptyString(seo?.primaryIntent) || hasPlaceholder(seo.primaryIntent)) errors.push(`${manifestPath}: primary intent is missing or still contains a placeholder`);
        if (!nonEmptyArray(seo?.intentMap)) errors.push(`${manifestPath}: intent map is missing`);
        if (seo?.cannibalizationChecked !== true) errors.push(`${manifestPath}: cannibalization check must be completed`);

        const ownership = seo?.intentOwnership || [];
        if (!nonEmptyArray(ownership)) errors.push(`${manifestPath}: intent ownership gate is missing`);
        const ownershipIntents = ownership.map((item) => normalizeIntent(item.intent));
        if (unique(ownershipIntents).length !== ownershipIntents.length) errors.push(`${manifestPath}: an intent has more than one owner record`);
        const ownerTypes = new Set(["service", "article", "case", "page"]);
        const ownershipDecisions = new Set(["new-owner", "update-owner", "support-owner", "no-new-page"]);
        for (const item of ownership) {
          if (!nonEmptyString(item.intent) || hasPlaceholder(item.intent)) errors.push(`${manifestPath}: intent ownership has an invalid intent`);
          if (!validUrl(item.ownerUrl) || hasPlaceholder(item.ownerUrl)) errors.push(`${manifestPath}: intent owner URL is missing or invalid for ${item.intent || "unknown intent"}`);
          if (!ownerTypes.has(item.ownerType)) errors.push(`${manifestPath}: invalid ownerType for ${item.intent || "unknown intent"}`);
          if (!Array.isArray(item.supportingUrls) || item.supportingUrls.some((url) => !validUrl(url))) errors.push(`${manifestPath}: supportingUrls must contain valid URLs for ${item.intent || "unknown intent"}`);
          if (!Array.isArray(item.supportingCaseIds)) errors.push(`${manifestPath}: supportingCaseIds must be an array for ${item.intent || "unknown intent"}`);
          if (!nonEmptyArray(item.excludedQueries) || item.excludedQueries.some((query) => !nonEmptyString(query) || hasPlaceholder(query))) errors.push(`${manifestPath}: excluded queries are missing for ${item.intent || "unknown intent"}`);
          if (!nonEmptyArray(item.existingCompetingUrlsReviewed) || item.existingCompetingUrlsReviewed.some((url) => !validUrl(url) || hasPlaceholder(url))) errors.push(`${manifestPath}: existing competing URLs were not reviewed for ${item.intent || "unknown intent"}`);
          if (!ownershipDecisions.has(item.decision)) errors.push(`${manifestPath}: invalid ownership decision for ${item.intent || "unknown intent"}`);
          if (!nonEmptyString(item.reason) || hasPlaceholder(item.reason)) errors.push(`${manifestPath}: ownership reason is missing for ${item.intent || "unknown intent"}`);
        }

        const snapshots = seo?.serpSnapshots || [];
        if (!nonEmptyArray(snapshots)) errors.push(`${manifestPath}: SERP snapshot gate is missing`);
        const requiredEngines = config.clusterPreparation?.serpSnapshot?.requiredEngines || [];
        const minimumResults = config.clusterPreparation?.serpSnapshot?.minimumOrganicResultsReviewedPerEngine || 5;
        const maxAgeMs = (config.clusterPreparation?.serpSnapshot?.maxAgeDaysAtReview || 14) * 24 * 60 * 60 * 1000;
        const snapshotIntentSet = new Set();
        for (const snapshot of snapshots) {
          const snapshotIntent = normalizeIntent(snapshot.intent);
          snapshotIntentSet.add(snapshotIntent);
          if (!snapshotIntent || hasPlaceholder(snapshot.intent)) errors.push(`${manifestPath}: SERP snapshot has an invalid intent`);
          if (!ownershipIntents.includes(snapshotIntent)) errors.push(`${manifestPath}: SERP snapshot intent has no owner: ${snapshot.intent || "unknown"}`);
          if (!validDate(snapshot.checkedAt)) errors.push(`${manifestPath}: SERP snapshot checkedAt is missing for ${snapshot.intent || "unknown intent"}`);
          if (validDate(snapshot.checkedAt) && validDate(manifest.reviewedAt)) {
            const age = Date.parse(manifest.reviewedAt) - Date.parse(snapshot.checkedAt);
            if (age < -5 * 60 * 1000) errors.push(`${manifestPath}: SERP snapshot is dated after the content review for ${snapshot.intent || "unknown intent"}`);
            if (age > maxAgeMs) errors.push(`${manifestPath}: SERP snapshot is older than ${config.clusterPreparation.serpSnapshot.maxAgeDaysAtReview} days for ${snapshot.intent || "unknown intent"}`);
          }
          const engines = snapshot.engines || [];
          const engineNames = engines.map((item) => item.engine);
          if (!sameMembers(engineNames, requiredEngines)) errors.push(`${manifestPath}: Yandex and Google snapshots are both required for ${snapshot.intent || "unknown intent"}`);
          for (const engine of engines) {
            if (!requiredEngines.includes(engine.engine)) errors.push(`${manifestPath}: unsupported SERP engine: ${engine.engine || "unknown"}`);
            if (!nonEmptyString(engine.query) || hasPlaceholder(engine.query)) errors.push(`${manifestPath}: SERP query is missing for ${engine.engine || "unknown engine"}`);
            if (Object.hasOwn(engine, "topResultsReviewed")) errors.push(`${manifestPath}: topResultsReviewed is deprecated; record organicResultsReviewed for ${engine.engine || "unknown engine"}`);
            if (!Number.isInteger(engine.organicResultsReviewed) || engine.organicResultsReviewed < minimumResults) errors.push(`${manifestPath}: review at least ${minimumResults} organic results in ${engine.engine || "unknown engine"}; sponsored placements do not count`);
            if (!Number.isInteger(engine.sponsoredResultsObserved) || engine.sponsoredResultsObserved < 0) errors.push(`${manifestPath}: sponsoredResultsObserved must be a non-negative integer for ${engine.engine || "unknown engine"}`);
            for (const field of ["sponsoredResultLabels", "sponsoredAdvertiserTypes", "sponsoredOfferPatterns"]) {
              if (!Array.isArray(engine[field])) errors.push(`${manifestPath}: ${field} must be an array for ${engine.engine || "unknown engine"}`);
            }
            if (engine.sponsoredResultsObserved > 0) {
              for (const field of ["sponsoredResultLabels", "sponsoredAdvertiserTypes", "sponsoredOfferPatterns"]) {
                if (!nonEmptyArray(engine[field]) || engine[field].some((value) => !nonEmptyString(value) || hasPlaceholder(value))) errors.push(`${manifestPath}: ${field} must describe observed paid placements for ${engine.engine || "unknown engine"}`);
              }
            }
            if (!nonEmptyString(engine.dominantIntent) || hasPlaceholder(engine.dominantIntent)) errors.push(`${manifestPath}: dominant organic SERP intent is missing for ${engine.engine || "unknown engine"}`);
            if (!nonEmptyArray(engine.resultTypes) || engine.resultTypes.some((value) => !nonEmptyString(value) || hasPlaceholder(value))) errors.push(`${manifestPath}: organic SERP result types are missing for ${engine.engine || "unknown engine"}`);
            if (typeof engine.localPack !== "boolean") errors.push(`${manifestPath}: localPack must be boolean for ${engine.engine || "unknown engine"}`);
            if (!nonEmptyArray(engine.snippetPatterns) || engine.snippetPatterns.some((value) => !nonEmptyString(value) || hasPlaceholder(value))) errors.push(`${manifestPath}: organic snippet patterns are missing for ${engine.engine || "unknown engine"}`);
            if (!nonEmptyArray(engine.competitorCoverageGaps) || engine.competitorCoverageGaps.some((value) => !nonEmptyString(value) || hasPlaceholder(value))) errors.push(`${manifestPath}: organic competitor coverage gaps are missing for ${engine.engine || "unknown engine"}`);
            if (!Array.isArray(engine.staleOrWeakResults)) errors.push(`${manifestPath}: staleOrWeakResults must be an array for ${engine.engine || "unknown engine"}`);
          }
          if (!nonEmptyString(snapshot.pageTypeDecision) || hasPlaceholder(snapshot.pageTypeDecision)) errors.push(`${manifestPath}: page type decision is missing for ${snapshot.intent || "unknown intent"}`);
          if (!nonEmptyString(snapshot.decisionReason) || hasPlaceholder(snapshot.decisionReason)) errors.push(`${manifestPath}: page type decision reason is missing for ${snapshot.intent || "unknown intent"}`);
          if (snapshot.canProvideBetterAnswer !== true) errors.push(`${manifestPath}: new or changed page is not justified by a better practical answer for ${snapshot.intent || "unknown intent"}`);
        }
        for (const intent of ownershipIntents) if (!snapshotIntentSet.has(intent)) errors.push(`${manifestPath}: intent owner has no matching SERP snapshot: ${intent}`);

        const practicalElements = seo?.practicalElements || [];
        if (!nonEmptyArray(practicalElements)) errors.push(`${manifestPath}: original practical element gate is missing`);
        const allowedTypes = new Set(config.clusterPreparation?.originalPracticalElement?.allowedTypes || []);
        for (const element of practicalElements) {
          if (!nonEmptyString(element.contentId) || hasPlaceholder(element.contentId)) errors.push(`${manifestPath}: practical element contentId is missing`);
          if (!validUrl(element.targetUrl) || hasPlaceholder(element.targetUrl)) errors.push(`${manifestPath}: practical element targetUrl is missing or invalid`);
          if (!allowedTypes.has(element.type)) errors.push(`${manifestPath}: unsupported practical element type: ${element.type || "unknown"}`);
          for (const field of ["title", "userValue", "competitorGap", "sourceBasis", "placement"]) {
            if (!nonEmptyString(element[field]) || hasPlaceholder(element[field])) errors.push(`${manifestPath}: practical element ${field} is missing for ${element.contentId || "unknown content"}`);
          }
          if (!nonEmptyArray(element.sourceIds) || element.sourceIds.some((id) => !nonEmptyString(id) || hasPlaceholder(id))) errors.push(`${manifestPath}: practical element sourceIds are missing for ${element.contentId || "unknown content"}`);
          if (element.verifiedAgainstSerp !== true) errors.push(`${manifestPath}: practical element was not verified against SERP for ${element.contentId || "unknown content"}`);
        }

        const contentChanges = manifest.contentChanges || [];
        const sourcePaths = new Set(contentChanges.map((item) => item.path));
        for (const path of governedChanges) if (!sourcePaths.has(path)) errors.push(`${manifestPath}: changed content path is not declared: ${path}`);
        for (const change of contentChanges) {
          if (!validUrl(change.expectedUrl) || hasPlaceholder(change.expectedUrl)) errors.push(`${manifestPath}: content change expectedUrl is missing or invalid for ${change.contentId || change.path || "unknown change"}`);
          const mappedToIntent = ownership.some((item) => item.ownerUrl === change.expectedUrl || item.supportingUrls.includes(change.expectedUrl));
          if (!mappedToIntent) errors.push(`${manifestPath}: changed URL is not mapped to an intent owner: ${change.expectedUrl || "unknown URL"}`);
          const hasPracticalElement = practicalElements.some((element) => element.targetUrl === change.expectedUrl && element.contentId === change.contentId);
          if (!hasPracticalElement) errors.push(`${manifestPath}: changed material has no original practical element: ${change.contentId || change.expectedUrl || "unknown"}`);
        }
        if (!Array.isArray(manifest.publication?.expectedUrls)) errors.push(`${manifestPath}: expected public URLs are missing`);
      }
    }
  }

  if (!errors.length) {
    console.log(`Content governance contract passed: ${config.spreadsheet.baselineSnapshot.tabCount} baseline tabs, ${changedFiles.length} changed files, ${governedChanges.length} governed content changes, 3 cluster gates, organic SERP minimum enforced`);
  }
}

if (errors.length) {
  console.error(unique(errors).join("\n"));
  process.exit(1);
}
