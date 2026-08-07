import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprintArticleEditorRows, normalizeArticleEditorRows } from "./article-editor-fingerprint.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const errors = [];

const [editorText, publicationText, workflowDoc, releaseCheck, fingerprintSource, approvalManifestSource, approvalTemplateText] = await Promise.all([
  read("config/article-editor-gate.json"),
  read("config/publication-sheet-gate.json"),
  read("docs/ARTICLE_EDITOR_WORKFLOW.md"),
  read("scripts/release-check.mjs"),
  read("scripts/article-editor-fingerprint.mjs"),
  read("scripts/article-approval-manifest-test.mjs"),
  read("reports/article-approvals/template.json"),
]);

let editor;
let publication;
let approvalTemplate;
try { editor = JSON.parse(editorText); } catch (error) { errors.push(`article editor config is invalid JSON: ${error.message}`); }
try { publication = JSON.parse(publicationText); } catch (error) { errors.push(`publication sheet gate config is invalid JSON: ${error.message}`); }
try { approvalTemplate = JSON.parse(approvalTemplateText); } catch (error) { errors.push(`article approval template is invalid JSON: ${error.message}`); }

const expectedGateIds = ["PUB-025", "PUB-026", "PUB-027", "PUB-028", "PUB-029"];
const expectedFields = ["articleId", "version", "slugOrUrl", "order", "blockType", "textOrValue", "linkOrAction"];
const sameMembers = (left = [], right = []) => {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

if (editor) {
  if (editor.schemaVersion !== 1 || editor.ruleId !== "canonical-article-editor-approval-gate") errors.push("article editor gate identity changed");
  if (editor.spreadsheetId !== "1W4014FzdUJWYDja7VUh5XXUsSuxtQIrcS5fWRX1rm24") errors.push("article editor points to the wrong spreadsheet");
  if (editor.editorTab !== "34_Редактор_статей_сайта" || editor.editorGid !== "340000340") errors.push("canonical article editor tab/gid changed");
  if (editor.historyTab !== "_35_Версии_статей_сайта" || editor.historyGid !== "350000350") errors.push("approved snapshot history tab/gid changed");
  if (editor.headerRow !== 5 || editor.firstDataRow !== 6) errors.push("article editor row contract changed");
  if (!sameMembers(editor.publicationGateIds, expectedGateIds)) errors.push("article editor must remain blocked by PUB-025…PUB-029");
  if (editor.approvalManifestDir !== "reports/article-approvals") errors.push("article approval manifests must remain under reports/article-approvals");
  if (editor.fingerprint?.algorithm !== "sha256") errors.push("approved article fingerprint must remain SHA-256");
  if (editor.fingerprint?.normalizationVersion !== 1) errors.push("article fingerprint normalization version changed without a migration");
  if (JSON.stringify(editor.fingerprint?.canonicalFields) !== JSON.stringify(expectedFields)) errors.push("article fingerprint canonical fields changed");
  if (editor.fingerprint?.preserveInternalWhitespace !== true) errors.push("fingerprint must preserve internal article whitespace");
  if (editor.fingerprint?.sortByOrder !== true) errors.push("fingerprint must normalize rows by article order");
  for (const field of [
    "prepareFullSiteStructureInEditorBeforeApproval",
    "editorIsOnlyPrepublicationCopySource",
    "explicitUserChatCommandRequired",
    "sheetStatusAloneNeverCountsAsApproval",
    "rereadLiveEditorAfterApprovalCommand",
    "runFinalEditorialPreflightAfterCommand",
    "reportEveryFoundIssueInChat",
    "stopPublicationWhenIssueFound",
    "forbidSilentCorrectionsAfterApprovalCommand",
    "requireUserAgreementBeforeApplyingFoundCorrections",
    "snapshotOnlyAfterCleanAgreedPreflight",
    "requireSha256Fingerprint",
    "invalidateApprovalOnFingerprintDrift",
    "rereadAndRecomputeFingerprintBeforeSourceChange",
    "rereadAndRecomputeFingerprintBeforeMerge",
    "publishOnlyApprovedSnapshot",
    "recordPublishedShaBackToEditor",
  ]) {
    if (editor.requirements?.[field] !== true) errors.push(`article editor requirement must remain enabled: ${field}`);
  }
  for (const block of ["META_TITLE", "META_DESCRIPTION", "H1", "LEAD", "SHORT_ANSWER", "H2", "P", "CTA_SOFT", "CTA_MAIN", "FAQ_Q", "FAQ_A"]) {
    if (!editor.allowedBlockTypes?.includes(block)) errors.push(`required article block type is missing: ${block}`);
  }
}

if (publication) {
  if (publication.articleEditor?.configPath !== "config/article-editor-gate.json") errors.push("publication gate lost its article editor config link");
  if (!sameMembers(publication.articleEditor?.premergeCheckIds, expectedGateIds)) errors.push("publication gate lost PUB-025…PUB-029");
  if (publication.articleEditor?.requiredForChangeType !== "Статья") errors.push("article checks must activate for Статья");
  if (publication.requirements?.mustEnforceArticleEditorApprovalGate !== true) errors.push("publication gate may not disable article editor enforcement");
  if (publication.releaseLogHeaderRow !== 54 || publication.releaseLogFirstDataRow !== 55) errors.push("publication release log rows must remain aligned after article gate insertion");
}

for (const marker of [
  "34_Редактор_статей_сайта",
  "явную команду",
  "финальный preflight",
  "Молча исправлять",
  "SHA-256 fingerprint",
  "аннулированным",
  "PUB-025",
  "PUB-029",
]) {
  if (!workflowDoc.includes(marker)) errors.push(`article editor workflow doc is missing marker: ${marker}`);
}

for (const script of [
  "scripts/article-editor-gate-contract-test.mjs",
  "scripts/article-approval-manifest-test.mjs",
]) {
  if (!releaseCheck.includes(`\"${script}\"`)) errors.push(`release-check must execute ${script} before release packaging`);
}
for (const marker of ["createHash", "sha256", "normalizeArticleEditorRows", "fingerprintArticleEditorRows"]) {
  if (!fingerprintSource.includes(marker)) errors.push(`fingerprint implementation is missing marker: ${marker}`);
}

// PF-013 invariant: approval gating must remain compatible with fetch-depth:1 + targeted BASE_SHA.
// A triple-dot diff requires merge-base ancestry that shallow CI intentionally does not fetch.
if (approvalManifestSource.includes("...HEAD")) errors.push("PF-013 regression: article approval manifest gate may not require merge-base ancestry via triple-dot diff");
if (!approvalManifestSource.includes('["diff", "--name-only", baseSha, "HEAD", "--"]')) errors.push("article approval manifest gate must compare the explicitly fetched BASE_SHA tree directly with HEAD");

if (approvalTemplate) {
  if (approvalTemplate.schemaVersion !== 1) errors.push("approval manifest template schemaVersion must remain 1");
  if (approvalTemplate.editorTab !== "34_Редактор_статей_сайта") errors.push("approval manifest template must point to canonical editor tab");
  if (approvalTemplate.approvalEvidence !== "explicit-user-chat-command-after-review") errors.push("approval manifest template must require explicit user chat approval");
  if (approvalTemplate.finalPreflight !== "passed-after-user-command") errors.push("approval manifest template must require final preflight after the user command");
  if (approvalTemplate.fingerprintAlgorithm !== "sha256") errors.push("approval manifest template must use sha256");
}

const sample = [
  { articleId: "C-test", version: "v1", slugOrUrl: "/razbory/test/", order: 2, blockType: "P", textOrValue: "Второй абзац", linkOrAction: "" },
  { articleId: "C-test", version: "v1", slugOrUrl: "/razbory/test/", order: 1, blockType: "H1", textOrValue: "  Заголовок\r\n", linkOrAction: "" },
];
const reordered = [...sample].reverse();
const changed = structuredClone(sample);
changed[0].textOrValue = "Изменённый второй абзац";
const changedLink = structuredClone(sample);
changedLink[1].linkOrAction = "/services/changed/";
const changedOrder = structuredClone(sample);
changedOrder[0].order = 3;

const baseFingerprint = fingerprintArticleEditorRows(sample);
if (!/^[a-f0-9]{64}$/.test(baseFingerprint)) errors.push("article fingerprint must be lowercase 64-character SHA-256 hex");
if (fingerprintArticleEditorRows(reordered) !== baseFingerprint) errors.push("row input order must not change fingerprint when explicit article order is unchanged");
if (fingerprintArticleEditorRows(changed) === baseFingerprint) errors.push("article text drift must invalidate the approved fingerprint");
if (fingerprintArticleEditorRows(changedLink) === baseFingerprint) errors.push("article link/action drift must invalidate the approved fingerprint");
if (fingerprintArticleEditorRows(changedOrder) === baseFingerprint) errors.push("article block order drift must invalidate the approved fingerprint");
const normalized = normalizeArticleEditorRows(sample);
if (normalized[0].textOrValue !== "Заголовок") errors.push("fingerprint normalization must normalize line endings and outer whitespace");
if (normalized[0].order !== 1 && normalized[0].order !== "1") errors.push("fingerprint normalization must sort by article order");

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Article editor gate contract passed: live editor source, explicit chat approval, post-command preflight, shallow-safe approval manifest, snapshot SHA-256 and drift invalidation remain mandatory before article merge");
