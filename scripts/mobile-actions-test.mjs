import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { services } from "../src/data.mjs";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const errors = [];
const pages = [
  "index.html",
  join("uslugi", "index.html"),
  ...services.map((service) => join("uslugi", service.slug, "index.html")),
  join("o-yuriste", "index.html"),
  join("kontakty", "index.html"),
  join("politika-konfidencialnosti", "index.html"),
];

for (const pagePath of pages) {
  const html = await readFile(join(dist, pagePath), "utf8");
  const panelCount = (html.match(/data-mobile-contact(?:[ >])/g) || []).length;
  const nowCount = (html.match(/data-mobile-contact-now/g) || []).length;
  const laterCount = (html.match(/data-mobile-contact-later/g) || []).length;
  const nudgeCount = (html.match(/id="engagement-nudge"/g) || []).length;
  if (panelCount !== 1) errors.push(`${pagePath}: expected one mobile panel, found ${panelCount}`);
  if (nowCount !== 1 || laterCount !== 1) errors.push(`${pagePath}: mobile actions are incomplete`);
  if (nudgeCount !== 1) errors.push(`${pagePath}: expected one engagement nudge, found ${nudgeCount}`);
  if (!html.includes("Написать сейчас")) errors.push(`${pagePath}: missing immediate action label`);
  if (!html.includes("Связаться позже")) errors.push(`${pagePath}: missing callback action label`);
  if (!html.includes("Нужен ориентир по вашей ситуации?")) errors.push(`${pagePath}: missing engagement nudge copy`);
  if (!html.includes("data-mobile-contact-now") || !html.includes("data-dialog-open")) errors.push(`${pagePath}: immediate action is not connected to messenger dialog`);
  if (!html.includes("data-mobile-contact-later") || !html.includes("data-callback-open")) errors.push(`${pagePath}: later action is not connected to callback form`);
  if (!html.includes("/assets/engagement-nudge.mjs")) errors.push(`${pagePath}: engagement module is not loaded`);

  const panelStart = html.indexOf('class="mobile-contact mobile-contact--dual"');
  const laterPosition = html.indexOf("data-mobile-contact-later", panelStart);
  const nowPosition = html.indexOf("data-mobile-contact-now", panelStart);
  if (panelStart < 0 || laterPosition < panelStart || nowPosition < panelStart || laterPosition > nowPosition) {
    errors.push(`${pagePath}: immediate action must be the right-hand second control`);
  }
}

const styles = await readFile(join(dist, "assets", "styles.css"), "utf8");
for (const marker of [
  ".mobile-contact--dual",
  "grid-template-columns: repeat(2, minmax(0, 1fr));",
  "padding-bottom: calc(80px + env(safe-area-inset-bottom));",
  ".mobile-contact__action--now",
  ".mobile-contact__action--later",
  "order: 2",
  "mobile-contact-soft-attention 18s ease-out 8s infinite",
  ".engagement-nudge",
  "bottom: calc(90px + env(safe-area-inset-bottom));",
  "@media (prefers-reduced-motion: reduce)",
  "@media (max-width: 350px)",
]) {
  if (!styles.includes(marker)) errors.push(`styles.css: missing ${marker}`);
}

const engagementScript = await readFile(join(dist, "assets", "engagement-nudge.mjs"), "utf8");
for (const marker of [
  "DEFAULT_DELAY_MS = 60_000",
  "AUTO_HIDE_MS = 20_000",
  "sessionStorage.setItem",
  "document.visibilityState",
  "dialog[open]",
  "[data-consent-banner]",
  "#engagement-nudge-write",
  "[data-mobile-contact-now]",
]) {
  if (!engagementScript.includes(marker)) errors.push(`engagement-nudge.mjs: missing ${marker}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Mobile action panel checks passed: ${pages.length} pages, right-thumb CTA, subtle pulse and one-session nudge`);
