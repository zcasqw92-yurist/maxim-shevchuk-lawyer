import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const errors = [];

const walk = async (directory) => {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
};

const htmlFiles = (await walk(dist)).filter((path) => extname(path) === ".html");
const forbiddenPublished = [
  [/<form\b/i, "form element"],
  [/<input\b/i, "input element"],
  [/<select\b/i, "select element"],
  [/<textarea\b/i, "textarea element"],
  [/\bdata-callback(?:-[a-z0-9-]+)?\b/i, "callback form hook"],
  [/\bcallback-(?:dialog|form|field|consent|copy)\b/i, "callback form class"],
  [/\bdata-price-quiz(?:-[a-z0-9-]+)?\b/i, "questionnaire hook"],
  [/\bprice-quiz-dialog\b/i, "questionnaire dialog"],
];

for (const path of htmlFiles) {
  const html = await readFile(path, "utf8");
  const name = relative(dist, path);
  for (const [pattern, label] of forbiddenPublished) {
    if (pattern.test(html)) errors.push(`${name}: published ${label} is forbidden`);
  }

  const contactDialogCount = (html.match(/<dialog\b[^>]*id="contact-dialog"/g) || []).length;
  if (contactDialogCount !== 1) errors.push(`${name}: expected one direct messenger dialog, got ${contactDialogCount}`);
  if (!html.includes('class="messenger-choice messenger-choice--telegram"')) errors.push(`${name}: Telegram direct choice is missing`);
  if (!html.includes('class="messenger-choice messenger-choice--whatsapp"')) errors.push(`${name}: WhatsApp direct choice is missing`);
  if (!html.includes("text=")) errors.push(`${name}: prefilled messenger draft is missing`);
  if (/<form\b[^>]*\baction=/i.test(html)) errors.push(`${name}: form action must not exist`);
}

const activeFiles = [
  "src/app.js",
  "src/page-composer.mjs",
  "src/mobile-actions.mjs",
  "public/assets/engagement-nudge.mjs",
];
const forbiddenActive = [
  "new FormData",
  "reportValidity",
  "data-callback-open",
  "data-callback-form",
  "callback-dialog",
  "callback-form",
  "data-price-quiz",
  "priceQuiz",
  "price-quiz-dialog",
];
for (const file of activeFiles) {
  const source = await readFile(join(root, file), "utf8");
  for (const marker of forbiddenActive) {
    if (source.includes(marker)) errors.push(`${file}: active form/questionnaire marker remains: ${marker}`);
  }
}

const app = await readFile(join(dist, "assets", "app.js"), "utf8");
for (const marker of ["new FormData", "reportValidity", "data-callback", "data-price-quiz", "priceQuiz", "callbackForm"]) {
  if (app.includes(marker)) errors.push(`dist/assets/app.js: shipped data-entry logic remains: ${marker}`);
}

const policy = await readFile(join(dist, "politika-konfidencialnosti", "index.html"), "utf8");
for (const statement of [
  "На сайте отсутствуют формы заявки",
  "Сайт не формирует и не передаёт оператору базу контактных данных",
  "Подготовленный текст является только черновиком",
  "оператор не получает его имя, контакт, текст черновика",
  "Политика не является публичным предложением передать оператору любые сведения",
]) {
  if (!policy.includes(statement)) errors.push(`privacy policy: required direct-contact statement is missing: ${statement}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Direct contact model passed: ${htmlFiles.length} HTML pages contain no data-entry forms or questionnaires; only prefilled messenger drafts remain`);
