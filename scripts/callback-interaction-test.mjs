import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const chromiumBinary = require("@sparticuz/chromium").default;
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
  const tar = spawn("tar", ["--no-same-owner", "-xf", "-", "-C", browserDir], {
    stdio: ["pipe", "ignore", "pipe"],
  });
  let stderr = "";
  tar.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  await Promise.all([
    pipeline(createReadStream(join(browserPackage, archive)), createBrotliDecompress(), tar.stdin),
    new Promise((resolve, reject) => tar.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr || `tar exited: ${code}`)))),
  ]);
};

if (!(await access(join(browserDir, "libGLESv2.so")).then(() => true).catch(() => false))) {
  await extractTarBrotli("swiftshader.tar.br");
}
if (!(await access(join(browserDir, "fonts.conf")).then(() => true).catch(() => false))) {
  await extractTarBrotli("fonts.tar.br");
}

await mkdir(join(browserDir, "cache"), { recursive: true });
await mkdir(join(browserDir, "home"), { recursive: true });
process.env.HOME = join(browserDir, "home");
process.env.XDG_CACHE_HOME = join(browserDir, "cache");
process.env.FONTCONFIG_FILE = "/etc/fonts/fonts.conf";
process.env.LD_LIBRARY_PATH = [browserDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: "4174" },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Callback preview server timeout")), 8000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) { clearTimeout(timer); resolve(); }
  });
  server.on("exit", (code) => reject(new Error(`Callback preview server exited: ${code}`)));
});

const errors = [];
let browser;

try {
  browser = await chromium.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-extensions",
    ],
    executablePath: browserPath,
    headless: true,
  });
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.addInitScript(() => {
    window.__callbackOpenedUrls = [];
    window.open = (url) => {
      window.__callbackOpenedUrls.push(String(url));
      return null;
    };
  });
  await page.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle" });

  await page.locator(".header__actions [data-dialog-open]").click();
  const contactDialog = page.locator("#contact-dialog");
  if (!await contactDialog.evaluate((element) => element.open)) errors.push("contact dialog did not open");
  await contactDialog.locator("[data-callback-open]").click();

  const callbackDialog = page.locator("#callback-dialog");
  if (!await callbackDialog.evaluate((element) => element.open)) errors.push("callback dialog did not open");
  if (await contactDialog.evaluate((element) => element.open)) errors.push("contact dialog remained open under callback dialog");

  await callbackDialog.locator("[data-callback-whatsapp]").click();
  const emptyAttempt = await page.evaluate(() => window.__callbackOpenedUrls.length);
  if (emptyAttempt !== 0) errors.push("invalid empty form opened a messenger");

  await callbackDialog.locator('[name="name"]').fill("Тестовый клиент");
  await callbackDialog.locator('[name="contact"]').fill("@test_client");
  await callbackDialog.locator('[name="day"]').selectOption({ label: "Завтра" });
  await callbackDialog.locator('[name="period"]').selectOption({ label: "День, 12:00–17:00" });
  await callbackDialog.locator('[name="summary"]').fill("Нужно обсудить возврат денег по договору.");
  await callbackDialog.locator('[name="consent"]').check();
  await callbackDialog.locator("[data-callback-whatsapp]").click();

  const openedAfterWhatsapp = await page.evaluate(() => [...window.__callbackOpenedUrls]);
  const whatsappUrl = openedAfterWhatsapp.at(-1) || "";
  if (!whatsappUrl.startsWith("https://api.whatsapp.com/send?phone=79065297970")) errors.push("WhatsApp callback URL is invalid");
  const whatsappText = whatsappUrl ? new URL(whatsappUrl).searchParams.get("text") || "" : "";
  for (const part of [
    "Прошу связаться со мной позже",
    "Имя: Тестовый клиент",
    "Контакт: @test_client",
    "Удобный день: Завтра",
    "Удобное время: День, 12:00–17:00 МСК",
    "Кратко о ситуации: Нужно обсудить возврат денег по договору.",
    "Страница сайта: /",
  ]) {
    if (!whatsappText.includes(part)) errors.push(`WhatsApp summary is missing: ${part}`);
  }

  await callbackDialog.locator("[data-callback-telegram]").click();
  const openedAfterTelegram = await page.evaluate(() => [...window.__callbackOpenedUrls]);
  if (openedAfterTelegram.at(-1) !== "https://t.me/lawrazbor") errors.push("Telegram callback URL is invalid");
  const note = await callbackDialog.locator("[data-callback-note]").textContent();
  if (!note?.includes("Telegram открыт")) errors.push("Telegram instruction was not shown");
  const storedKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => /callback/i.test(key)));
  if (storedKeys.length) errors.push(`callback data was persisted: ${storedKeys.join(", ")}`);

  await context.close();
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Callback interaction test passed: validation, WhatsApp, Telegram and no-storage behavior");
