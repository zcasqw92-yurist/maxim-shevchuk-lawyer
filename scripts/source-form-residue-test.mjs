import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const errors = [];
const cleanFiles = [
  "src/app.js",
  "src/page-composer.mjs",
  "src/mobile-actions.mjs",
  "src/site-enhancements.css",
  "src/mobile-actions.css",
  "public/assets/engagement-nudge.mjs",
];
const forbidden = [
  "new FormData",
  "reportValidity",
  "callback-form",
  "callback-dialog",
  "data-callback-open",
  "data-callback-form",
  "callback-consent",
  "callback-field",
];

for (const file of cleanFiles) {
  const text = await readFile(join(root, file), "utf8");
  for (const marker of forbidden) {
    if (text.includes(marker)) errors.push(`${file}: form residue remains: ${marker}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Source form residue check passed: active composition, runtime and shipped styles contain no callback form implementation");
