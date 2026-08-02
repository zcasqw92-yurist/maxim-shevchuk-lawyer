import { readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const manifestPath = "reports/content-sessions/latest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const element = manifest.seoReview?.practicalElements?.find((item) => item.contentId === "unpaid-services-without-contract");
if (!element) throw new Error("Практический элемент C-016 не найден");
element.type = "evidence-matrix";
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

await rm(".github/workflows/c016-manifest-fix.yml", { force: true });
await rm("scripts/c016-manifest-fix.mjs", { force: true });

execFileSync("git", ["config", "user.name", "github-actions[bot]"]);
execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
execFileSync("git", ["add", "-A"]);
const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
if (!status) process.exit(0);
execFileSync("git", ["commit", "-m", "Исправить тип практического элемента C-016"]);
execFileSync("git", ["push", "origin", "HEAD"]);
