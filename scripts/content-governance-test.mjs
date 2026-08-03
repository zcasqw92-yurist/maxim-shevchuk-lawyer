import { readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "reports/content-sessions/latest.json");
const experimentPolicyPath = join(root, "config/content-experiment-exceptions.json");
const statisticsPolicyPath = join(root, "config/content-statistics-reuse-policy.json");
const corePath = join(root, "scripts/content-governance-core.mjs");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const exception = manifest?.seoReview?.experimentException;
const statisticsReuse = manifest?.seoReview?.statisticsReuse;

if (exception && statisticsReuse) {
  console.error("content governance manifest cannot combine an experiment exception with existing-statistics reuse");
  process.exit(1);
}

if (!exception && !statisticsReuse) {
  await import("./content-governance-core.mjs");
} else {
  const isExperiment = Boolean(exception);
  const basis = exception || statisticsReuse;
  const policy = JSON.parse(await readFile(isExperiment ? experimentPolicyPath : statisticsPolicyPath, "utf8"));
  const errors = [];
  const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
  const sameMembers = (left, right) => {
    const a = [...left].sort();
    const b = [...right].sort();
    return a.length === b.length && a.every((value, index) => value === b[index]);
  };

  if (isExperiment) {
    if (policy?.schemaVersion !== 1 || policy?.policyId !== "owner-approved-serp-experiment") errors.push("experiment policy is missing or invalid");
    if (exception.mode !== policy.requiredMode) errors.push("experiment exception mode is invalid");
    if (exception.approvedByOwner !== true) errors.push("experiment exception is not approved by the owner");
    if (exception.directSerpSnapshotsAvailable !== false) errors.push("experiment exception must state that direct SERP snapshots are unavailable");
    if (!nonEmpty(exception.contentId)) errors.push("experiment exception contentId is missing");
    if (!nonEmpty(exception.approvedAt) || !Number.isFinite(Date.parse(exception.approvedAt))) errors.push("experiment exception approvedAt is invalid");
    if (!nonEmpty(exception.journalRecord)) errors.push("experiment exception journalRecord is missing");
    if (!nonEmpty(exception.reason)) errors.push("experiment exception reason is missing");
    if (!nonEmpty(exception.successCriteria)) errors.push("experiment exception success criteria are missing");
    if (!nonEmpty(exception.failureCriteria)) errors.push("experiment exception failure criteria are missing");
    if (!Array.isArray(exception.checkpointsDays) || !sameMembers(exception.checkpointsDays, policy.requiredCheckpointsDays || [])) errors.push("experiment checkpoints must be 14, 30, 60 and 90 days");
    if (!Array.isArray(exception.metrics) || !sameMembers(exception.metrics, policy.requiredMetrics || [])) errors.push("experiment metrics do not match the controlled policy");
  } else {
    if (policy?.schemaVersion !== 1 || policy?.policyId !== "owner-approved-existing-seo-pool") errors.push("existing-statistics policy is missing or invalid");
    if (statisticsReuse.mode !== policy.requiredMode) errors.push("existing-statistics reuse mode is invalid");
    if (statisticsReuse.approvedByOwner !== true) errors.push("existing-statistics reuse is not approved by the owner");
    if (statisticsReuse.newPaidRequestsPerformed !== false) errors.push("existing-statistics reuse must confirm that no new paid SEO requests were performed");
    if (statisticsReuse.exhaustionRuleAcknowledged !== true) errors.push("existing-statistics reuse must acknowledge the pool-first rule");
    if (!nonEmpty(statisticsReuse.contentId)) errors.push("existing-statistics reuse contentId is missing");
    if (!nonEmpty(statisticsReuse.approvedAt) || !Number.isFinite(Date.parse(statisticsReuse.approvedAt))) errors.push("existing-statistics reuse approvedAt is invalid");
    if (!nonEmpty(statisticsReuse.journalRecord)) errors.push("existing-statistics reuse journalRecord is missing");
    if (!nonEmpty(statisticsReuse.reason)) errors.push("existing-statistics reuse reason is missing");
    if (!Array.isArray(statisticsReuse.sources) || statisticsReuse.sources.length === 0) errors.push("existing-statistics reuse sources are missing");
    for (const source of statisticsReuse.sources || []) {
      for (const field of policy.requiredSourceFields || []) if (!nonEmpty(source[field]) && typeof source[field] !== "number") errors.push(`existing-statistics source field is missing: ${field}`);
      if (!Number.isFinite(Date.parse(source.checkedAt || ""))) errors.push("existing-statistics source checkedAt is invalid");
    }
  }

  if ((manifest.seoReview?.serpSnapshots || []).length !== 0) errors.push("alternative-basis manifest must not contain fabricated direct SERP snapshots");
  const changedIds = new Set((manifest.contentChanges || []).map((item) => item.contentId));
  if (!changedIds.has(basis.contentId)) errors.push("alternative-basis contentId is not present in contentChanges");

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  let source = await readFile(corePath, "utf8");
  const governedPathsLiteral = JSON.stringify(policy.governedPaths || []);
  const replacements = [
    [
      'try { config = JSON.parse(configText); } catch (error) { errors.push(`config/content-governance.json: invalid JSON: ${error.message}`); }',
      'try { config = JSON.parse(configText); if (config) config.governedContentPaths = [...new Set([...(config.governedContentPaths || []), ...' + governedPathsLiteral + '])]; } catch (error) { errors.push(`config/content-governance.json: invalid JSON: ${error.message}`); }'
    ],
    [
      '        const snapshots = seo?.serpSnapshots || [];\n        if (!nonEmptyArray(snapshots)) errors.push(`${manifestPath}: SERP snapshot gate is missing`);',
      '        const snapshots = seo?.serpSnapshots || [];\n        const ownerApprovedExperiment = seo?.experimentException?.approvedByOwner === true && seo?.experimentException?.directSerpSnapshotsAvailable === false;\n        const ownerApprovedStatisticsReuse = seo?.statisticsReuse?.approvedByOwner === true && seo?.statisticsReuse?.newPaidRequestsPerformed === false;\n        const ownerApprovedAlternative = ownerApprovedExperiment || ownerApprovedStatisticsReuse;\n        if (!ownerApprovedAlternative && !nonEmptyArray(snapshots)) errors.push(`${manifestPath}: SERP snapshot gate is missing`);'
    ],
    [
      '        for (const intent of ownershipIntents) if (!snapshotIntentSet.has(intent)) errors.push(`${manifestPath}: intent owner has no matching SERP snapshot: ${intent}`);',
      '        if (!ownerApprovedAlternative) for (const intent of ownershipIntents) if (!snapshotIntentSet.has(intent)) errors.push(`${manifestPath}: intent owner has no matching SERP snapshot: ${intent}`);'
    ],
    [
      '          if (element.verifiedAgainstSerp !== true) errors.push(`${manifestPath}: practical element was not verified against SERP for ${element.contentId || "unknown content"}`);',
      '          if (!ownerApprovedAlternative && element.verifiedAgainstSerp !== true) errors.push(`${manifestPath}: practical element was not verified against SERP for ${element.contentId || "unknown content"}`);\n          if (ownerApprovedExperiment && element.verifiedAgainstExperiment !== true) errors.push(`${manifestPath}: practical element was not verified against the controlled experiment basis for ${element.contentId || "unknown content"}`);\n          if (ownerApprovedStatisticsReuse && element.verifiedAgainstExistingStatistics !== true) errors.push(`${manifestPath}: practical element was not verified against the existing SEO statistics basis for ${element.contentId || "unknown content"}`);'
    ],
    [
      'organic SERP minimum enforced`);',
      'organic SERP minimum or an owner-approved alternative evidence basis enforced`);'
    ]
  ];

  for (const [from, to] of replacements) {
    const occurrences = source.split(from).length - 1;
    if (occurrences !== 1) {
      console.error(`content governance extension could not be applied safely: expected one occurrence, found ${occurrences}`);
      process.exit(1);
    }
    source = source.replace(from, to);
  }

  const runtimePath = join(root, `scripts/.content-governance-runtime-${process.pid}.mjs`);
  try {
    await writeFile(runtimePath, source, "utf8");
    await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
    if (isExperiment) {
      console.log(`Owner-approved SERP experiment exception validated for ${exception.contentId}; checkpoints: ${exception.checkpointsDays.join("/")} days`);
    } else {
      console.log(`Owner-approved existing SEO statistics reuse validated for ${statisticsReuse.contentId}; no new paid requests performed`);
    }
  } finally {
    await unlink(runtimePath).catch(() => {});
  }
}
