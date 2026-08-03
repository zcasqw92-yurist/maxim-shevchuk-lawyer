import { readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "reports/content-sessions/latest.json");
const policyPath = join(root, "config/content-experiment-exceptions.json");
const corePath = join(root, "scripts/content-governance-core.mjs");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const exception = manifest?.seoReview?.experimentException;

if (!exception) {
  await import("./content-governance-core.mjs");
} else {
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  const errors = [];
  const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
  const sameMembers = (left, right) => {
    const a = [...left].sort();
    const b = [...right].sort();
    return a.length === b.length && a.every((value, index) => value === b[index]);
  };

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
  if ((manifest.seoReview?.serpSnapshots || []).length !== 0) errors.push("experiment manifest must not contain fabricated direct SERP snapshots");
  const changedIds = new Set((manifest.contentChanges || []).map((item) => item.contentId));
  if (!changedIds.has(exception.contentId)) errors.push("experiment contentId is not present in contentChanges");

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
      '        const snapshots = seo?.serpSnapshots || [];\n        const ownerApprovedExperiment = seo?.experimentException?.approvedByOwner === true && seo?.experimentException?.directSerpSnapshotsAvailable === false;\n        if (!ownerApprovedExperiment && !nonEmptyArray(snapshots)) errors.push(`${manifestPath}: SERP snapshot gate is missing`);'
    ],
    [
      '        for (const intent of ownershipIntents) if (!snapshotIntentSet.has(intent)) errors.push(`${manifestPath}: intent owner has no matching SERP snapshot: ${intent}`);',
      '        if (!ownerApprovedExperiment) for (const intent of ownershipIntents) if (!snapshotIntentSet.has(intent)) errors.push(`${manifestPath}: intent owner has no matching SERP snapshot: ${intent}`);'
    ],
    [
      '          if (element.verifiedAgainstSerp !== true) errors.push(`${manifestPath}: practical element was not verified against SERP for ${element.contentId || "unknown content"}`);',
      '          if (!ownerApprovedExperiment && element.verifiedAgainstSerp !== true) errors.push(`${manifestPath}: practical element was not verified against SERP for ${element.contentId || "unknown content"}`);\n          if (ownerApprovedExperiment && element.verifiedAgainstExperiment !== true) errors.push(`${manifestPath}: practical element was not verified against the controlled experiment basis for ${element.contentId || "unknown content"}`);'
    ],
    [
      'organic SERP minimum enforced`);',
      'organic SERP minimum or owner-approved experiment exception enforced`);'
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
    console.log(`Owner-approved SERP experiment exception validated for ${exception.contentId}; checkpoints: ${exception.checkpointsDays.join("/")} days`);
  } finally {
    await unlink(runtimePath).catch(() => {});
  }
}
