import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const canonicalFields = [
  "articleId",
  "version",
  "slugOrUrl",
  "order",
  "blockType",
  "textOrValue",
  "linkOrAction",
];

const normalizeScalar = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value).replace(/\r\n?/g, "\n").trim();
};

export const normalizeArticleEditorRows = (rows) => rows
  .map((row, index) => ({
    __index: index,
    ...Object.fromEntries(canonicalFields.map((field) => [field, normalizeScalar(row?.[field])])),
  }))
  .filter((row) => row.articleId || row.blockType || row.textOrValue || row.linkOrAction)
  .sort((left, right) => {
    const leftOrder = Number(left.order);
    const rightOrder = Number(right.order);
    const leftFinite = Number.isFinite(leftOrder);
    const rightFinite = Number.isFinite(rightOrder);
    if (leftFinite && rightFinite && leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (leftFinite !== rightFinite) return leftFinite ? -1 : 1;
    return left.__index - right.__index;
  })
  .map(({ __index, ...row }) => row);

export const serializeArticleEditorRows = (rows) => JSON.stringify(normalizeArticleEditorRows(rows));

export const fingerprintArticleEditorRows = (rows) => createHash("sha256")
  .update(serializeArticleEditorRows(rows), "utf8")
  .digest("hex");

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/article-editor-fingerprint.mjs <snapshot.json>");
    process.exit(2);
  }
  const payload = JSON.parse(await readFile(inputPath, "utf8"));
  const rows = Array.isArray(payload) ? payload : payload.rows;
  if (!Array.isArray(rows)) {
    console.error("Snapshot must be an array or an object with rows[]");
    process.exit(2);
  }
  process.stdout.write(`${fingerprintArticleEditorRows(rows)}\n`);
}
