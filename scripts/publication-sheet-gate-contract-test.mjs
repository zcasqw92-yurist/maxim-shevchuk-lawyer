import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const errors = [];
const requiredSheetId = "1W4014FzdUJWYDja7VUh5XXUsSuxtQIrcS5fWRX1rm24";
const requiredGateTab = "29_Публикационный_шлюз";
const requiredGateGid = "290000290";
const requiredAllowedValue = "ПУБЛИКАЦИЯ РАЗРЕШЕНА";

const [gateText, contentGovernanceText, agents, publishing, prTemplate, releaseGate] = await Promise.all([
  read("config/publication-sheet-gate.json"),
  read("config/content-governance.json"),
  read("AGENTS.md"),
  read("docs/PUBLISHING.md"),
  read(".github/pull_request_template.md"),
  read("scripts/release-check.mjs"),
]);

let gate;
let contentGovernance;
try { gate = JSON.parse(gateText); } catch (error) { errors.push(`publication sheet gate config is invalid JSON: ${error.message}`); }
try { contentGovernance = JSON.parse(contentGovernanceText); } catch (error) { errors.push(`content governance config is invalid JSON: ${error.message}`); }

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
  if (gate.statusCell !== "B2" || gate.requiredAllowedValue !== requiredAllowedValue) errors.push("publication gate must block merge until B2 says ПУБЛИКАЦИЯ РАЗРЕШЕНА");
  if (gate.unknownFailureCell !== "J2" || gate.unresolvedUnknownFailureValue !== "Да — не закрыт") errors.push("unknown failure blocker must remain tied to J2");
  if (gate.resolvedUnknownFailureValue !== "Да — закрыт regression") errors.push("unknown failure may be resolved only after regression control exists");
  if (!sameMembers(gate.appliesTo || [], ["article", "site-change", "seo", "infrastructure"])) errors.push("publication gate must apply to articles, site changes, SEO and infrastructure");
  for (const field of [
    "liveReadBeforeEveryChange",
    "mustBeAllowedBeforeMerge",
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
  if (gate.unknownFailurePolicy?.nextIdStartsAt !== "PF-014") errors.push("new unknown failures must start at PF-014 and continue sequentially");
}

if (contentGovernance) {
  if (contentGovernance.spreadsheet?.id !== requiredSheetId) errors.push("content governance and publication gate must use the same spreadsheet");
  if (contentGovernance.spreadsheet?.requireAllTabs !== true || contentGovernance.spreadsheet?.discoverTabsDynamically !== true) {
    errors.push("content sessions must still dynamically review every spreadsheet tab, including the publication gate");
  }
  const oldBrowserLiveChecks = (contentGovernance.publication?.liveChecks || []).filter((item) =>
    /npm run test:live|live-all-publications-smoke|playwright/i.test(String(item))
  );
  if (oldBrowserLiveChecks.length) errors.push(`content governance still contains browser-heavy post-deploy checks: ${oldBrowserLiveChecks.join(", ")}`);
}

for (const [label, text, markers] of [
  ["AGENTS.md", agents, [requiredGateTab, requiredAllowedValue, "PF-014+", "ЖУРНАЛ РЕЛИЗОВ", "не может быть выставлен по предположению"]],
  ["docs/PUBLISHING.md", publishing, [requiredGateTab, requiredAllowedValue, "PF-014+", "ЖУРНАЛ РЕЛИЗОВ", "живой таблицы"]],
  [".github/pull_request_template.md", prTemplate, [requiredGateTab, requiredAllowedValue, "новый PF", "Доказательства пунктов шлюза"]],
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

console.log("Publication sheet gate contract passed: live 29_Публикационный_шлюз remains mandatory for every article/site/SEO/infrastructure change and unknown failures require PF regression before closure");
