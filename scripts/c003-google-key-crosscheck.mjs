import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(root, "reports", "c003-serp-research", "results.json");
const query = "строитель взял аванс и пропал как вернуть деньги без договора";
const key = String(process.env.SERPER_API_KEY || "").trim();
if (!key) throw new Error("Совместимый Google SERP-ключ отсутствует");
console.log(`::add-mask::${key}`);

const params = new URLSearchParams({
  engine: "google",
  q: query,
  hl: "ru",
  gl: "ru",
  location: "Moscow, Russia",
  num: "20",
  api_key: key,
  output: "json",
});
const response = await fetch(`https://serpapi.com/search.json?${params}`, {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(45000),
});
const text = await response.text();
let payload = {};
try { payload = JSON.parse(text); } catch {}
if (!response.ok || payload.error) {
  throw new Error(`SerpApi compatibility: ${response.status} ${String(payload.error || response.statusText).slice(0, 300)}`);
}
const seen = new Set();
const organic = [];
for (const item of payload.organic_results || []) {
  const title = String(item.title || "").replace(/\s+/g, " ").trim();
  const link = String(item.link || "").trim();
  if (!title || !link) continue;
  let host;
  try { host = new URL(link).hostname.replace(/^www\./, ""); } catch { continue; }
  const identity = `${host}|${title.toLowerCase()}`;
  if (seen.has(identity)) continue;
  seen.add(identity);
  organic.push({
    position: Number(item.position || organic.length + 1),
    title,
    link,
    snippet: String(item.snippet || "").replace(/\s+/g, " ").trim().slice(0, 500),
  });
}
if (organic.length < 5) throw new Error(`SerpApi compatibility: найдено ${organic.length} органических результатов`);

const report = JSON.parse(await readFile(reportPath, "utf8"));
report.engines = (report.engines || []).filter((item) => item.engine !== "Google");
report.engines.push({
  engine: "Google",
  provider: "SerpApi compatibility check",
  organic: organic.slice(0, 20),
  sponsored: (payload.ads || []).map((item) => ({
    position: Number(item.position || 0),
    title: String(item.title || "").replace(/\s+/g, " ").trim(),
    link: String(item.link || ""),
    label: "Ad",
  })),
});
report.errors = (report.errors || []).filter((item) => !String(item).startsWith("Serper Google") && !String(item).startsWith("Google:"));
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`C-003 key compatibility: Google=${organic.length}`);
