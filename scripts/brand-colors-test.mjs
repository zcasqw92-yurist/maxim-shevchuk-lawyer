import { readFile, readdir } from "node:fs/promises";

const srcDir = new URL("../src/", import.meta.url);
const files = (await readdir(srcDir)).filter((name) => name.endsWith(".css")).sort();
const approvedHexTokens = new Map([
  ["--ink", "#10283d"], ["--ink-deep", "#091c2c"], ["--ink-soft", "#314b60"],
  ["--paper", "#f4f1ea"], ["--paper-2", "#ebe6dc"], ["--white", "#fffefb"],
  ["--gold", "#c39a5d"], ["--gold-bright", "#ddb979"], ["--gold-text", "#765429"],
  ["--muted", "#52636f"], ["--success", "#3f735f"], ["--danger", "#9c3737"],
  ["--status-online", "#41b86b"], ["--status-online-text", "#416550"],
  ["--status-online-bg", "#e5f5ea"], ["--status-offline", "#9da4aa"],
  ["--status-offline-bg", "#edf0f1"], ["--messenger-whatsapp", "#21aa5a"],
  ["--messenger-telegram", "#229ed9"],
]);
const rawHex = /#[0-9a-fA-F]{3,8}\b/g;
const violations = [];
for (const file of files) {
  const css = await readFile(new URL(file, srcDir), "utf8");
  const lines = css.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    for (const match of lines[index].matchAll(rawHex)) {
      const value = match[0].toLowerCase();
      const parsed = lines[index].match(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/);
      const allowed = file === "styles.css" && parsed && approvedHexTokens.get(parsed[1]) === value;
      if (!allowed) violations.push(`${file}:${index + 1}: ${value}`);
    }
  }
}
if (violations.length) throw new Error(`Локальные hex-цвета вне утверждённых токенов:\n${violations.join("\n")}`);

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
for (const [name, value] of approvedHexTokens) {
  if (!styles.includes(`${name}: ${value};`)) throw new Error(`Отсутствует токен ${name}: ${value}`);
}
for (const role of [
  "--surface-page", "--surface-card", "--surface-highlight", "--surface-accent-soft",
  "--link-text", "--text-on-dark", "--border-subtle", "--border-accent",
  "--attention-glow-strong", "--attention-glow-soft",
]) {
  if (!styles.includes(`${role}:`)) throw new Error(`Отсутствует семантический токен ${role}`);
}

const editorial = await readFile(new URL("../src/editorial.css", import.meta.url), "utf8");
if (!editorial.includes("color: var(--link-text);")) throw new Error("Редакционные ссылки не используют --link-text");
if (!editorial.includes(".editorial-sources a:hover")) throw new Error("Нет фирменного hover для ссылок на источники");
if (!editorial.includes(".editorial-related a:focus-visible")) throw new Error("Нет фирменного focus для связанных материалов");
if (!editorial.includes("background: var(--surface-page);")) throw new Error("Редакция не использует --surface-page");
if (!editorial.includes("background: var(--surface-card);")) throw new Error("Карточки не используют --surface-card");
const mobile = await readFile(new URL("../src/mobile-actions.css", import.meta.url), "utf8");
for (const role of ["--attention-glow-clear", "--attention-ring-strong", "--attention-glow-strong", "--attention-glow-soft"]) {
  if (!mobile.includes(`var(${role})`)) throw new Error(`Мобильная CTA не использует ${role}`);
}
const consent = await readFile(new URL("../src/layout-corrections.css", import.meta.url), "utf8");
if (!consent.includes("border: 2px solid var(--gold-bright);")) throw new Error("Кнопка согласия: неверная рамка");
if (!consent.includes("background: var(--gold);")) throw new Error("Кнопка согласия: неверный hover");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (packageJson.scripts["test:brand-colors"] !== "node scripts/brand-colors-test.mjs") throw new Error("Нет test:brand-colors");
if (!packageJson.scripts.check.includes("npm run test:brand-colors")) throw new Error("test:brand-colors не включён в check");
console.log(`Brand color contract passed: ${files.length} CSS modules, no local hex colors.`);
