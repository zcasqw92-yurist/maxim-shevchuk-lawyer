import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];

for (const pagePath of [
  "index.html",
  join("uslugi", "index.html"),
  join("uslugi", "vozvrat-deneg", "index.html"),
  join("o-yuriste", "index.html"),
  join("kontakty", "index.html"),
]) {
  const html = await readFile(join(dist, pagePath), "utf8");
  if (!/assets\/web-vitals\.js\?v=\d{8}/.test(html)) errors.push(`${pagePath}: versioned web-vitals script is missing`);
}

const script = await readFile(join(dist, "assets", "web-vitals.js"), "utf8");
for (const marker of [
  "PerformanceObserver.supportedEntryTypes",
  "largest-contentful-paint",
  "layout-shift",
  "interactionId",
  "durationThreshold: 40",
  "web_vital",
  "visibilitychange",
  "pagehide",
  "value <= 2500",
  "value <= 0.1",
  "value <= 200",
]) {
  if (!script.includes(marker)) errors.push(`web-vitals.js: missing ${marker}`);
}
if (/fetch\(|XMLHttpRequest|sendBeacon/.test(script)) errors.push("web-vitals.js: must use only consent-controlled analytics functions");
if (!script.includes('typeof window.gtag === "function"')) errors.push("web-vitals.js: Google event must wait for analytics initialization");
if (!script.includes('typeof window.ym === "function"')) errors.push("web-vitals.js: Yandex event must wait for analytics initialization");

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log("Core Web Vitals checks passed: LCP, CLS and INP observers are local, versioned and consent-controlled");