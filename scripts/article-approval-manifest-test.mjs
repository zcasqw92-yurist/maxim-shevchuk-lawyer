import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { fingerprintArticleEditorRows } from "./article-editor-fingerprint.mjs";

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestsDir = join(root, "reports", "article-approvals");
const errors = [];

const config = JSON.parse(await readFile(join(root, "config", "article-editor-gate.json"), "utf8"));
const registry = await readFile(join(root, "src", "editorial-data.mjs"), "utf8");
const sourceModules = new Set(
  [...registry.matchAll(/from\s+"\.\/([^"\n]+\.mjs)"/g)]
    .map((match) => `src/${match[1]}`),
);

// Некоторые опубликованные статьи подключаются через data-wrapper, а фактический
// утверждённый текст живёт в соседнем *-source.mjs. Такой источник также должен
// быть защищён manifest gate, иначе body можно изменить в обход snapshot редактора.
for (const wrapper of [...sourceModules]) {
  try {
    const wrapperText = await readFile(join(root, wrapper), "utf8");
    for (const match of wrapperText.matchAll(/from\s+"(\.\/[^"\n]+\.mjs)"/g)) {
      const nested = relative(root, resolve(dirname(join(root, wrapper)), match[1])).replaceAll("\\", "/");
      if (nested.startsWith("src/") && nested.endsWith("-source.mjs")) sourceModules.add(nested);
    }
  } catch {
    // Не каждый импорт registry обязан быть article-wrapper; остальные контракты
    // проверят существование модулей. Здесь важна только дополнительная защита source.
  }
}

const decodeManifestRows = (manifest) => {
  if (Array.isArray(manifest.rows) && manifest.rows.length) return manifest.rows;
  if (typeof manifest.rowsGzipBase64 !== "string" || !manifest.rowsGzipBase64.trim()) return null;
  try {
    const decoded = gunzipSync(Buffer.from(manifest.rowsGzipBase64, "base64")).toString("utf8");
    const rows = JSON.parse(decoded);
    return Array.isArray(rows) && rows.length ? rows : null;
  } catch {
    return null;
  }
};

const manifestFiles = (await readdir(manifestsDir))
  .filter((name) => name.endsWith(".json") && name !== "template.json")
  .sort();
const manifests = [];
for (const name of manifestFiles) {
  const path = join(manifestsDir, name);
  try {
    const manifest = JSON.parse(await readFile(path, "utf8"));
    manifests.push({ name, path: relative(root, path), manifest });
  } catch (error) {
    errors.push(`${name}: invalid JSON: ${error.message}`);
  }
}

const validManifestBySource = new Map();
for (const { name, manifest } of manifests) {
  const approvedRows = decodeManifestRows(manifest);
  if (manifest.schemaVersion !== 1) errors.push(`${name}: schemaVersion must be 1`);
  if (!manifest.articleId || !manifest.version) errors.push(`${name}: articleId and version are required`);
  if (manifest.editorTab !== config.editorTab) errors.push(`${name}: editorTab must be ${config.editorTab}`);
  if (manifest.approvalEvidence !== "explicit-user-chat-command-after-review") errors.push(`${name}: explicit user chat approval evidence is required`);
  if (manifest.finalPreflight !== "passed-after-user-command") errors.push(`${name}: final preflight must be passed after the user command`);
  if (manifest.fingerprintAlgorithm !== "sha256") errors.push(`${name}: fingerprintAlgorithm must be sha256`);
  if (!/^[a-f0-9]{64}$/.test(String(manifest.approvedFingerprint || ""))) errors.push(`${name}: approvedFingerprint must be lowercase SHA-256 hex`);
  if (!approvedRows) errors.push(`${name}: full approved editor snapshot must be embedded as rows[] or rowsGzipBase64`);
  if (!manifest.sourceModule || !String(manifest.sourceModule).startsWith("src/")) errors.push(`${name}: sourceModule must be a src/ path`);
  if (manifest.status !== "approved-for-publish" && manifest.status !== "published") errors.push(`${name}: status must be approved-for-publish or published`);
  if (approvedRows) {
    const actual = fingerprintArticleEditorRows(approvedRows);
    if (actual !== manifest.approvedFingerprint) errors.push(`${name}: approvedFingerprint does not match embedded approved snapshot`);
  }
  if (manifest.editorFingerprintRecheckedBeforeSourceChange !== true) errors.push(`${name}: live editor fingerprint must be rechecked before changing production source`);
  if (manifest.sourceModule) validManifestBySource.set(manifest.sourceModule, manifest);
}

const baseSha = process.env.CONTENT_GOVERNANCE_BASE_SHA?.trim();
if (baseSha) {
  let changedFiles = [];
  try {
    // PF-013: CI deliberately uses shallow checkout and fetches only BASE_SHA.
    // Compare the two available trees directly; triple-dot requires merge-base ancestry
    // and would incorrectly force full Git history into an otherwise bounded gate.
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", baseSha, "HEAD", "--"], { cwd: root });
    changedFiles = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    errors.push(`cannot determine changed files from CONTENT_GOVERNANCE_BASE_SHA=${baseSha}: ${error.message}`);
  }

  const changedArticleModules = changedFiles.filter((path) => sourceModules.has(path));
  const registryChanged = changedFiles.includes("src/editorial-data.mjs");

  for (const sourceModule of changedArticleModules) {
    if (!validManifestBySource.has(sourceModule)) {
      errors.push(`${sourceModule}: article source changed without a matching approved manifest from ${config.editorTab}`);
    }
  }
  if (registryChanged && changedArticleModules.length === 0 && manifests.length === 0) {
    errors.push("src/editorial-data.mjs changed without any approved article manifest; public editorial registry changes require explicit user-approved article evidence");
  }
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

const enforcement = baseSha
  ? "changed editorial source modules (including nested *-source.mjs bodies) are approval-manifest gated with full embedded editor snapshots"
  : "manifest structure validated; changed-file enforcement awaits CONTENT_GOVERNANCE_BASE_SHA";
console.log(`Article approval manifest contract passed: ${enforcement}`);
