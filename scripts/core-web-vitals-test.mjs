import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  if (!/assets\/web-vitals\.js\?v=\d{8}/.test(html)) errors.push(`${pagePath}: versioned web-vitals wrapper is missing`);
}

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (packageJson.devDependencies?.["web-vitals"] !== "6.0.0") {
  errors.push("package.json: web-vitals must be pinned exactly to 6.0.0");
}

const wrapperPath = join(dist, "assets", "web-vitals.js");
const vendorPath = join(dist, "assets", "vendor-web-vitals.js");
const wrapper = await readFile(wrapperPath, "utf8");
const vendor = await readFile(vendorPath, "utf8");
const installedVendor = await readFile(join(root, "node_modules", "web-vitals", "dist", "web-vitals.js"), "utf8");
const license = await readFile(join(dist, "assets", "vendor-web-vitals.LICENSE.txt"), "utf8");

if (vendor !== installedVendor) errors.push("vendor-web-vitals.js: built file differs from the pinned official package");
if (!license.includes("Apache License")) errors.push("vendor-web-vitals.LICENSE.txt: official license is missing");
for (const marker of ["onCLS", "onINP", "onLCP", "back-forward-cache"]) {
  if (!vendor.includes(marker)) errors.push(`vendor-web-vitals.js: missing official marker ${marker}`);
}
for (const marker of [
  'import { onCLS, onINP, onLCP } from "./vendor-web-vitals.js?v=6.0.0"',
  "Number.isFinite(metric.value)",
  "sentMetricValues",
  "metric_delta",
  "web_vital",
  'typeof window.gtag === "function"',
  'typeof window.ym === "function"',
]) {
  if (!wrapper.includes(marker)) errors.push(`web-vitals.js: missing ${marker}`);
}
if (/fetch\(|XMLHttpRequest|sendBeacon/.test(wrapper)) {
  errors.push("web-vitals.js: wrapper must use only consent-controlled analytics functions");
}
if (/!metric\.value|!value/.test(wrapper)) {
  errors.push("web-vitals.js: zero metric values must not be discarded");
}

const googleEvents = [];
const yandexEvents = [];
globalThis.window = {
  gtag: (...args) => googleEvents.push(args),
  ym: (...args) => yandexEvents.push(args),
};
globalThis.document = { body: { dataset: { yandexMetricaId: "123" } } };
globalThis.location = { pathname: "/test/" };

const wrapperModule = await import(`${pathToFileURL(wrapperPath).href}?test=${Date.now()}`);
const zeroMetric = {
  id: "v6-zero",
  name: "CLS",
  value: 0,
  delta: 0,
  rating: "good",
  navigationType: "navigate",
};
wrapperModule.reportWebVital(zeroMetric);
wrapperModule.reportWebVital(zeroMetric);
wrapperModule.reportWebVital({ ...zeroMetric, value: 0.05, delta: 0.05 });

if (googleEvents.length !== 2 || yandexEvents.length !== 2) {
  errors.push(`web-vitals.js: expected two unique zero/change events per configured channel, got Google=${googleEvents.length}, Yandex=${yandexEvents.length}`);
}
if (googleEvents[0]?.[2]?.metric_value !== 0 || yandexEvents[0]?.[3]?.metric_value !== 0) {
  errors.push("web-vitals.js: zero CLS was not delivered to analytics adapters");
}
if (googleEvents[0]?.[2]?.navigation_type !== "navigate") {
  errors.push("web-vitals.js: navigation type is missing from the metric payload");
}

delete globalThis.window;
delete globalThis.document;
delete globalThis.location;

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log("Core Web Vitals checks passed: official web-vitals 6.0.0, zero values, bfcache and duplicate protection");
