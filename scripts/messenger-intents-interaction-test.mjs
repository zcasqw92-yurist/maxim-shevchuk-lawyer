import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const browserDir = join(root, ".browser-bin");
const browserPath = join(browserDir, "chromium");
const browserPackage = join(root, "node_modules", "@sparticuz", "chromium", "bin");
await mkdir(browserDir, { recursive: true });

if (!(await access(browserPath).then(() => true).catch(() => false))) {
  await pipeline(
    createReadStream(join(browserPackage, "chromium.br")),
    createBrotliDecompress(),
    createWriteStream(browserPath),
  );
  await chmod(browserPath, 0o755);
}

const extractTarBrotli = async (archive) => {
  const tar = spawn("tar", ["--no-same-owner", "-xf", "-", "-C", browserDir], { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  tar.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  await Promise.all([
    pipeline(createReadStream(join(browserPackage, archive)), createBrotliDecompress(), tar.stdin),
    new Promise((resolve, reject) => tar.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr || `tar exited: ${code}`)))),
  ]);
};

if (!(await access(join(browserDir, "libGLESv2.so")).then(() => true).catch(() => false))) await extractTarBrotli("swiftshader.tar.br");
if (!(await access(join(browserDir, "fonts.conf")).then(() => true).catch(() => false))) await extractTarBrotli("fonts.tar.br");
await mkdir(join(browserDir, "cache"), { recursive: true });
await mkdir(join(browserDir, "home"), { recursive: true });
process.env.HOME = join(browserDir, "home");
process.env.XDG_CACHE_HOME = join(browserDir, "cache");
process.env.FONTCONFIG_FILE = "/etc/fonts/fonts.conf";
process.env.LD_LIBRARY_PATH = [browserDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: "4176" },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Messenger preview server timeout")), 8000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) { clearTimeout(timer); resolve(); }
  });
  server.on("exit", (code) => reject(new Error(`Messenger preview server exited: ${code}`)));
});

const profiles = [
  { name: "desktop", viewport: { width: 1280, height: 900 }, isMobile: false },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true },
];
const errors = [];
let browser;

const textParam = (href) => {
  try { return new URL(href).searchParams.get("text") || ""; } catch { return ""; }
};
const expectParts = (label, text, parts) => {
  for (const part of parts) if (!text.includes(part)) errors.push(`${label}: missing ${part}`);
};

try {
  browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--disable-extensions"],
  });

  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${profile.name}: pageerror ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${profile.name}: console ${message.text()}`); });
    await page.addInitScript(() => {
      window.__openedUrls = [];
      window.__clipboardCalls = 0;
      window.open = (url) => {
        window.__openedUrls.push(String(url));
        return null;
      };
      try {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: async () => { window.__clipboardCalls += 1; throw new Error("clipboard disabled in test"); } },
        });
      } catch { /* Browser may expose a non-configurable clipboard object. */ }
    });

    await page.goto("http://127.0.0.1:4176/", { waitUntil: "networkidle" });

    await page.evaluate(() => document.querySelector("[data-dialog-open]")?.click());
    const dialog = page.locator("#contact-dialog");
    if (!await dialog.evaluate((element) => element.open)) errors.push(`${profile.name}: generic contact dialog did not open`);
    let telegramHref = await dialog.locator("a[data-track='telegram']").getAttribute("href") || "";
    let whatsappHref = await dialog.locator("[data-whatsapp-link]").getAttribute("href") || "";
    expectParts(`${profile.name}: generic Telegram`, textParam(telegramHref), ["Хочу получить первичную оценку ситуации", "Кратко опишу"]);
    expectParts(`${profile.name}: generic WhatsApp`, textParam(whatsappHref), ["Хочу получить первичную оценку ситуации", "Кратко опишу"]);
    await dialog.locator("[data-dialog-close]").click();

    await page.locator(".hero__quick-choices [data-topic='возврат денежных средств']").click({ force: true });
    telegramHref = await dialog.locator("a[data-track='telegram']").getAttribute("href") || "";
    whatsappHref = await dialog.locator("[data-whatsapp-link]").getAttribute("href") || "";
    expectParts(`${profile.name}: topic Telegram`, textParam(telegramHref), ["Обращаюсь по вопросу: возврат денежных средств", "Кратко опишу ситуацию"]);
    expectParts(`${profile.name}: topic WhatsApp`, textParam(whatsappHref), ["по вопросу: возврат денежных средств", "Кратко опишу ситуацию"]);
    await dialog.locator("[data-dialog-close]").click();

    await page.locator(".section--case-studies [data-dialog-open]").click({ force: true });
    telegramHref = await dialog.locator("a[data-track='telegram']").getAttribute("href") || "";
    whatsappHref = await dialog.locator("[data-whatsapp-link]").getAttribute("href") || "";
    expectParts(`${profile.name}: case CTA Telegram`, textParam(telegramHref), ["похожая юридическая ситуация", "Кратко опишу ситуацию"]);
    expectParts(`${profile.name}: case CTA WhatsApp`, textParam(whatsappHref), ["похожая юридическая ситуация", "Кратко опишу ситуацию"]);
    await dialog.locator("[data-dialog-close]").click();

    await page.evaluate(() => document.querySelector("[data-price-quiz-open]")?.click());
    const quiz = page.locator("#price-quiz-dialog");
    for (const choice of ["Не возвращают деньги", "Договор", "В ближайшие дни"]) {
      await quiz.getByRole("button", { name: choice, exact: true }).click();
    }
    const quizTelegram = quiz.locator("[data-price-quiz-telegram]");
    const quizWhatsapp = quiz.locator("[data-price-quiz-whatsapp]");
    telegramHref = await quizTelegram.getAttribute("href") || "";
    whatsappHref = await quizWhatsapp.getAttribute("href") || "";
    const quizParts = ["Ситуация: Не возвращают деньги", "Материалы: Договор", "Срок: В ближайшие дни"];
    expectParts(`${profile.name}: quiz Telegram href`, textParam(telegramHref), quizParts);
    expectParts(`${profile.name}: quiz WhatsApp href`, textParam(whatsappHref), quizParts);
    const beforeQuizOpen = await page.evaluate(() => window.__openedUrls.length);
    await quizTelegram.click();
    const quizOpened = await page.evaluate(() => window.__openedUrls.at(-1) || "");
    if ((await page.evaluate(() => window.__openedUrls.length)) !== beforeQuizOpen + 1) errors.push(`${profile.name}: quiz Telegram opened more or fewer than one destination`);
    expectParts(`${profile.name}: quiz Telegram opened`, textParam(quizOpened), quizParts);
    if (await page.evaluate(() => window.__clipboardCalls) !== 0) errors.push(`${profile.name}: quiz Telegram still depends on clipboard`);

    await quiz.locator("[data-callback-open]").click();
    const callback = page.locator("#callback-dialog");
    await callback.locator('[name="name"]').fill("Тестовый клиент");
    await callback.locator('[name="contact"]').fill("@test_client");
    await callback.locator('[name="day"]').selectOption({ label: "Завтра" });
    await callback.locator('[name="period"]').selectOption({ label: "День, 12:00–17:00" });
    await callback.locator('[name="summary"]').fill("Нужно обсудить возврат денег по договору.");
    await callback.locator('[name="consent"]').check();

    await callback.locator("[data-callback-telegram]").click();
    const callbackTelegramUrl = await page.evaluate(() => window.__openedUrls.at(-1) || "");
    const callbackParts = [
      "Прошу связаться со мной позже",
      "Имя: Тестовый клиент",
      "Контакт: @test_client",
      "Удобный день: Завтра",
      "Удобное время: День, 12:00–17:00 МСК",
      "Кратко о ситуации: Нужно обсудить возврат денег по договору.",
    ];
    expectParts(`${profile.name}: callback Telegram`, textParam(callbackTelegramUrl), callbackParts);
    if (await page.evaluate(() => window.__clipboardCalls) !== 0) errors.push(`${profile.name}: callback Telegram still depends on clipboard`);

    await callback.locator("[data-callback-whatsapp]").click();
    const callbackWhatsappUrl = await page.evaluate(() => window.__openedUrls.at(-1) || "");
    expectParts(`${profile.name}: callback WhatsApp`, textParam(callbackWhatsappUrl), callbackParts);

    await page.goto("http://127.0.0.1:4176/kontakty/", { waitUntil: "networkidle" });
    const contactTelegram = await page.locator(".contact-method--telegram").getAttribute("href") || "";
    const contactWhatsapp = await page.locator(".contact-method--whatsapp").getAttribute("href") || "";
    expectParts(`${profile.name}: contacts Telegram`, textParam(contactTelegram), ["Хочу получить первичную оценку ситуации", "Кратко опишу"]);
    expectParts(`${profile.name}: contacts WhatsApp`, textParam(contactWhatsapp), ["Нужна юридическая консультация", "Кратко опишу ситуацию"]);

    await context.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (errors.length) {
  const reportDir = join(root, "reports");
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, "messenger-intents-errors.txt"), [...new Set(errors)].join("\n"), "utf8");
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Messenger intent test passed: generic, topic, case-study CTA, quiz and callback flows on desktop and mobile");
