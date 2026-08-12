import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [gate, governance] = await Promise.all([
  readFile(join(root, "config/search-quality-ai-gate.json"), "utf8").then(JSON.parse),
  readFile(join(root, "config/content-governance.json"), "utf8").then(JSON.parse),
]);

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
const isSearchAiGovernedArticle = (path) =>
  matchesAny(path, governance.governedContentPaths || []) && matchesAny(path, gate.articleContentPaths || []);

const cases = [
  ["src/trademark-claim-marketplace-data.mjs", true],
  ["src/trademark-claim-marketplace-source.mjs", true],
  ["src/medical-error-first-steps-data.mjs", true],
  ["src/editorial-data-base.mjs", true],
  ["src/refund-imposed-service.mjs", true],
  ["content/articles/example.md", true],
  ["src/privacy-policy.mjs", false],
  ["src/process-guarantees.mjs", false],
  ["src/service-content.mjs", false],
  ["site.config.mjs", false],
];

const errors = [];
for (const [path, expected] of cases) {
  const actual = isSearchAiGovernedArticle(path);
  if (actual !== expected) errors.push(`${path}: expected Search/AI scope=${expected}, got ${actual}`);
}

if (errors.length) {
  console.error("Search/AI scope contract failed:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log("Search/AI scope contract passed: article sources are covered; privacy/process/service/infrastructure are excluded from the article-only gate.");
