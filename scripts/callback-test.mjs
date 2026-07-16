import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { services } from "../src/data.mjs";
import { site } from "../site.config.mjs";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const errors = [];

const pagePaths = [
  "index.html",
  join("uslugi", "index.html"),
  ...services.map((service) => join("uslugi", service.slug, "index.html")),
  join("o-yuriste", "index.html"),
  join("kontakty", "index.html"),
  join("politika-konfidencialnosti", "index.html"),
];

for (const pagePath of pagePaths) {
  const html = await readFile(join(dist, pagePath), "utf8");
  const dialogCount = (html.match(/id="callback-dialog"/g) || []).length;
  const triggerCount = (html.match(/data-callback-open/g) || []).length;
  if (dialogCount !== 1) errors.push(`${pagePath}: expected one callback dialog, found ${dialogCount}`);
  if (triggerCount < 3) errors.push(`${pagePath}: expected at least three callback triggers, found ${triggerCount}`);
  for (const field of ["name", "contact", "day", "period", "summary", "consent"]) {
    if (!html.includes(`name="${field}"`)) errors.push(`${pagePath}: missing callback field ${field}`);
  }
  if (!html.includes("Попросить связаться со мной")) errors.push(`${pagePath}: missing callback submit label`);
  if (!html.includes("Данные не сохраняются на сайте")) errors.push(`${pagePath}: missing no-storage notice`);
  if (!html.includes(site.whatsapp)) errors.push(`${pagePath}: missing WhatsApp base link`);
  if (!html.includes(site.telegram)) errors.push(`${pagePath}: missing Telegram link`);
  const privacyHref = `${site.basePath || ""}/politika-konfidencialnosti/`;
  if (!html.includes(`href="${privacyHref}"`)) errors.push(`${pagePath}: missing privacy-policy link`);
}

const app = await readFile(join(dist, "assets", "app.js"), "utf8");
const styles = await readFile(join(dist, "assets", "styles.css"), "utf8");

for (const marker of [
  "callback_request_whatsapp",
  "callback_request_telegram",
  "callback_open",
  "callbackForm.reportValidity()",
  "new FormData(callbackForm)",
  "data is persisted in browser storage",
]) {
  if (!app.includes(marker)) errors.push(`app.js: missing callback marker ${marker}`);
}

const callbackSection = app.split("// Callback-later flow:")[1] || "";
if (/localStorage|sessionStorage/.test(callbackSection)) errors.push("app.js: callback flow must not use browser storage");
if (!styles.includes(".callback-form__fields")) errors.push("styles.css: callback form styles are missing");
if (!styles.includes(".callback-consent")) errors.push("styles.css: callback consent styles are missing");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Callback-later checks passed: ${pagePaths.length} pages, fields, links, privacy and no-storage rules`);
