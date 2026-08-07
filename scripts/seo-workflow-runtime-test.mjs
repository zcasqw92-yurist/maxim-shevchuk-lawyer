import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = await readFile(join(root, ".github", "workflows", "seo-data-pipeline.yml"), "utf8");
const errors = [];

const requirePattern = (pattern, message) => {
  if (!pattern.test(workflow)) errors.push(message);
};
const forbidPattern = (pattern, message) => {
  if (pattern.test(workflow)) errors.push(message);
};
const count = (pattern) => (workflow.match(pattern) || []).length;

requirePattern(/runs-on:\s*ubuntu-22\.04/, "SEO workflow должен использовать закреплённый ubuntu-22.04");
forbidPattern(/runs-on:\s*ubuntu-latest/, "SEO workflow не должен зависеть от плавающего ubuntu-latest");

if (count(/uses:\s*actions\/checkout@v6/g) !== 2) {
  errors.push("SEO workflow должен использовать checkout@v6 ровно для кода и persistent seo-data state");
}
forbidPattern(/actions\/checkout@v[1-5]\b/, "Устаревший checkout@v1-v5 не должен возвращаться в SEO workflow");

requirePattern(/uses:\s*actions\/setup-node@v6[\s\S]*node-version:\s*['"]22\.17\.0['"][\s\S]*package-manager-cache:\s*false/, "SEO workflow должен использовать setup-node@v6 и закреплённый Node 22.17.0 без лишнего package cache");
forbidPattern(/actions\/setup-node@v[1-5]\b/, "Устаревший setup-node@v1-v5 не должен возвращаться в SEO workflow");

requirePattern(/uses:\s*actions\/upload-artifact@v7/, "SEO reports должны загружаться через upload-artifact@v7");
forbidPattern(/actions\/upload-artifact@v[1-6]\b/, "Устаревший upload-artifact@v1-v6 не должен возвращаться в SEO workflow");

requirePattern(/Checkout persistent SEO state[\s\S]*ref:\s*seo-data[\s\S]*path:\s*\.seo-state[\s\S]*fetch-depth:\s*1/, "Persistent seo-data checkout должен получать только текущую вершину ветки");
forbidPattern(/Checkout persistent SEO state[\s\S]*fetch-depth:\s*0/, "SEO state не должен скачивать полную историю репозитория");

requirePattern(/permissions:[\s\S]*contents:\s*write/, "SEO workflow должен сохранять право обновлять отдельную ветку seo-data");
requirePattern(/concurrency:[\s\S]*group:\s*seo-data-feedback[\s\S]*cancel-in-progress:\s*false/, "SEO state writer не должен обрывать текущую запись новым запуском");
requirePattern(/timeout-minutes:\s*15/, "SEO workflow должен иметь конечный job timeout");
requirePattern(/git push origin HEAD:seo-data/, "Нормализованное состояние должно сохраняться только в ветку seo-data");

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("SEO workflow runtime contract passed: pinned Ubuntu/Node, Node 24-compatible actions, shallow persistent state checkout and bounded execution");
