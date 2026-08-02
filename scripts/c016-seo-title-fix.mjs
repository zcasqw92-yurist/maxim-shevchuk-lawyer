import { readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const path = "src/unpaid-services-without-contract-data.mjs";
let text = await readFile(path, "utf8");
const before = 'seoTitle: "Заказчик не оплатил работу без договора: что делать",';
const after = 'seoTitle: "Заказчик не оплатил работу без договора",';
if (!text.includes(before)) throw new Error("Исходный SEO-title C-016 не найден");
text = text.replace(before, after);
await writeFile(path, text, "utf8");
await rm(".github/workflows/c016-seo-title-fix.yml", { force: true });
await rm("scripts/c016-seo-title-fix.mjs", { force: true });
execFileSync("git", ["config", "user.name", "github-actions[bot]"]);
execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
execFileSync("git", ["add", "-A"]);
const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
if (!status) process.exit(0);
execFileSync("git", ["commit", "-m", "Сократить SEO-title C-016"]);
execFileSync("git", ["push", "origin", "HEAD"]);
