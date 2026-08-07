import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const errors = [];
const requiredSheetId = "1W4014FzdUJWYDja7VUh5XXUsSuxtQIrcS5fWRX1rm24";
const requiredGateTab = "29_Публикационный_шлюз";
const requiredGateGid = "290000290";
const requiredMergeValue = "MERGE РАЗРЕШЕН";
const requiredFinalValue = "ПУБЛИКАЦИЯ ЗАВЕРШЕНА";

const [gateText, contentGovernanceText, failureRegistryText, agents, publishing, prTemplate, releaseGate] = await Promise.all([
  read("config/publication-sheet-gate.json"),
  read("config/content-governance.json"),
  read("config/publication-failure-regressions.json"),
  read("AGENTS.md"),
  read("docs/PUBLISHING.md"),
  read(".github/pull_request_template.md"),
  read("scripts/release-check.mjs"),
]);

let gate;
let contentGovernance;
let failureRegistry;
try { gate = JSON.parse(gateText); } catch (error) { errors.push(`publication sheet gate config is invalid JSON: ${error.message}`); }
try { contentGovernance = JSON.parse(contentGovernanceText); } catch (error) { errors.push(`content governance config is invalid JSON: ${error.message}`); }
try { failureRegistry = JSON.parse(failureRegistryText); } catch (error) { errors.push(`publication failure registry is invalid JSON: ${error.message}`); }

const sameMembers = (left, right) => {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

if (gate) {
  if (gate.schemaVersion !== 1) errors.push("publication sheet gate schemaVersion must be 1");
  if (gate.ruleId !== "canonical-publication-sheet-gate") errors.push("publication sheet gate ruleId changed");
  if (gate.spreadsheetId !== requiredSheetId) errors.push("publication sheet gate points to the wrong spreadsheet");
  if (gate.entryTab !== "00_Старт" || gate.entryGid !== "83276506") errors.push("publication sheet gate must remain visible from 00_Старт");
  if (gate.gateTab !== requiredGateTab || gate.gateGid !== requiredGateGid) errors.push("canonical publication gate tab/gid changed");
  if (gate.mergeStatusCell !== "B2" || gate.requiredMergeAllowedValue !== requiredMergeValue) errors.push("pre-merge gate must remain B2 = MERGE РАЗРЕШЕН");
  if (gate.finalStatusCell !== "L2" || gate.requiredFinalValue !== requiredFinalValue) errors.push("post-deploy completion must remain separately proven by L2 = ПУБЛИКАЦИЯ ЗАВЕРШЕНА");
  if (gate.mergeStatusCell === gate.finalStatusCell) errors.push("PF-014 regression: merge and publication completion may not share one status cell");
  if (gate.unknownFailureCell !== "J2" || gate.unresolvedUnknownFailureValue !== "Да — не закрыт") errors.push("unknown failure blocker must remain tied to J2");
  if (gate.resolvedUnknownFailureValue !== "Да — закрыт regression") errors.push("unknown failure may be resolved only after regression control exists");
  if (!sameMembers(gate.appliesTo || [], ["article", "site-change", "seo", "infrastructure"])) errors.push("publication gate must apply to articles, site changes, SEO and infrastructure");
  for (const field of [
    "liveReadBeforeEveryChange",
    "mustBeAllowedBeforeMerge",
    "mustKeepPostDeployCompletionSeparateFromMerge",
    "mustRecordEvidenceForPassedChecks",
    "mustRecordBranchPrAndHeadSha",
    "mustRecordMergeSha",
    "mustVerifyExactProductionSha",
    "mustRecordProductionHttpAndPublicCopy",
    "mustRecordIndexNowOutcome",
    "mustAppendReleaseLog",
  ]) {
    if (gate.requirements?.[field] !== true) errors.push(`publication gate requirement must remain enabled: ${field}`);
  }
  for (const field of [
    "blockUntilRootCauseKnown",
    "requireEvidence",
    "requireMachineRegressionOrBoundedRecovery",
    "requireFullGateRerun",
    "forbidClosingSessionWhileUnresolved",
  ]) {
    if (gate.unknownFailurePolicy?.[field] !== true) errors.push(`unknown failure policy must remain enabled: ${field}`);
  }
  if (gate.unknownFailurePolicy?.nextIdStartsAt !== "PF-015") errors.push("new unknown failures must start at PF-015 because PF-014 is already registered");
}

if (contentGovernance) {
  if (contentGovernance.spreadsheet?.id !== requiredSheetId) errors.push("content governance and publication gate must use the same spreadsheet");
  if (contentGovernance.spreadsheet?.requireAllTabs !== true || contentGovernance.spreadsheet?.discoverTabsDynamically !== true) {
    errors.push("content sessions must still dynamically review every spreadsheet tab, including the publication gate");
  }
  if (contentGovernance.publicationSheetGate?.requiredTab !== requiredGateTab) errors.push("content governance must point to the canonical publication gate tab");
  if (contentGovernance.publicationSheetGate?.mergeStatusCell !== "B2" || contentGovernance.publicationSheetGate?.requiredMergeValue !== requiredMergeValue) errors.push("content governance must preserve the pre-merge B2 contract");
  if (contentGovernance.publicationSheetGate?.finalStatusCell !== "L2" || contentGovernance.publicationSheetGate?.requiredFinalValue !== requiredFinalValue) errors.push("content governance must preserve the separate post-deploy L2 contract");
  const oldBrowserLiveChecks = (contentGovernance.publication?.liveChecks || []).filter((item) =>
    /npm run test:live|live-all-publications-smoke|playwright/i.test(String(item))
  );
  if (oldBrowserLiveChecks.length) errors.push(`content governance still contains browser-heavy post-deploy checks: ${oldBrowserLiveChecks.join(", ")}`);
}

const pf014 = failureRegistry?.incidents?.find((item) => item.id === "PF-014");
if (!pf014) {
  errors.push("PF-014 must remain in the publication failure registry as the regression for stage-deadlock");
} else {
  if (!String(pf014.class || "").toLowerCase().includes("stage")) errors.push("PF-014 class must describe publication gate stage separation");
  if (!String(pf014.rootCause || "").toLowerCase().includes("pre-merge") || !String(pf014.rootCause || "").toLowerCase().includes("post-deploy")) errors.push("PF-014 root cause must preserve the pre-merge/post-deploy distinction");
}

for (const [label, text, markers] of [
  ["AGENTS.md", agents, [requiredGateTab, requiredMergeValue, requiredFinalValue, "PF-015+", "ЖУРНАЛ РЕЛИЗОВ", "не может быть выставлен по предположению"]],
  ["docs/PUBLISHING.md", publishing, [requiredGateTab, requiredMergeValue, requiredFinalValue, "PF-015+", "ЖУРНАЛ РЕЛИЗОВ", "живой таблицы"]],
  [".github/pull_request_template.md", prTemplate, [requiredGateTab, requiredMergeValue, requiredFinalValue, "новый PF", "Доказательства пунктов шлюза"]],
]) {
  for (const marker of markers) if (!text.includes(marker)) errors.push(`${label}: publication sheet gate marker is missing: ${marker}`);
}

if (!releaseGate.includes('"scripts/publication-sheet-gate-contract-test.mjs"')) {
  errors.push("release-check must execute the publication sheet gate contract before packing a release");
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Publication sheet gate contract passed: pre-merge B2 and post-deploy L2 are separated, live table review is mandatory, PF-014 protects stage separation, and the next unknown class starts at PF-015");
