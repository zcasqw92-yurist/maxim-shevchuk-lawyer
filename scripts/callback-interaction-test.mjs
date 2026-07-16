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

const profiles = [
  { name: "desktop", viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

const checkCentered = async (locator, parentLocator, label) => {
  const box = await locator.boundingBox();
  const parentBox = await parentLocator.boundingBox();
  if (!box || !parentBox) {
    errors.push(`${label}: missing geometry`);
    return;
  }
  const delta = Math.abs((box.x + box.width / 2) - (parentBox.x + parentBox.width / 2));
  if (delta > 2) errors.push(`${label}: link is not centered, delta=${delta.toFixed(2)}px`);
};

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

  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${profile.name} pageerror: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${profile.name} console: ${message.text()}`); });
    await page.addInitScript(() => {
      window.__callbackOpenedUrls = [];
      window.open = (url) => {
        window.__callbackOpenedUrls.push(String(url));
        return null;
      };
    });

    await page.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle" });

    await page.locator(".hero__actions [data-dialog-open]").click();
    const contactDialog = page.locator("#contact-dialog");
    if (!await contactDialog.evaluate((element) => element.open)) errors.push(`${profile.name}: contact dialog did not open`);
    const contactCallbackLink = contactDialog.locator("[data-callback-open]");
    await checkCentered(contactCallbackLink, contactDialog.locator(".messenger-dialog__content"), `${profile.name} contact form`);
    await contactCallbackLink.click();

    const callbackDialog = page.locator("#callback-dialog");
    if (!await callbackDialog.evaluate((element) => element.open)) errors.push(`${profile.name}: callback dialog did not open`);
    if (await contactDialog.evaluate((element) => element.open)) errors.push(`${profile.name}: contact dialog remained open under callback dialog`);

    await callbackDialog.locator("[data-callback-whatsapp]").click();
    const emptyAttempt = await page.evaluate(() => window.__callbackOpenedUrls.length);
    if (emptyAttempt !== 0) errors.push(`${profile.name}: invalid empty form opened a messenger`);

    await callbackDialog.locator('[name="name"]').fill("Тестовый клиент");
    await callbackDialog.locator('[name="contact"]').fill("@test_client");
    await callbackDialog.locator('[name="day"]').selectOption({ label: "Завтра" });
    await callbackDialog.locator('[name="period"]').selectOption({ label: "День, 12:00–17:00" });
    await callbackDialog.locator('[name="summary"]').fill("Нужно обсудить возврат денег по договору.");
    await callbackDialog.locator('[name="consent"]').check();

    const callbackLayout = await callbackDialog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      consentClientWidth: element.querySelector(".callback-consent")?.clientWidth || 0,
      consentScrollWidth: element.querySelector(".callback-consent")?.scrollWidth || 0,
    }));
    if (callbackLayout.scrollWidth > callbackLayout.clientWidth + 1) errors.push(`${profile.name}: callback dialog has horizontal overflow`);
    if (callbackLayout.consentScrollWidth > callbackLayout.consentClientWidth + 1) errors.push(`${profile.name}: privacy consent slid sideways`);

    await callbackDialog.locator("[data-callback-telegram]").click();
    await page.waitForFunction(() => document.querySelector("[data-callback-note]")?.textContent?.includes("скопирован"), null, { timeout: 3000 }).catch(() => {});
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    for (const part of [
      "Прошу связаться со мной позже",
      "Имя: Тестовый клиент",
      "Контакт: @test_client",
      "Удобный день: Завтра",
      "Удобное время: День, 12:00–17:00 МСК",
      "Кратко о ситуации: Нужно обсудить возврат денег по договору.",
      "Страница сайта: /",
    ]) {
      if (!clipboardText.includes(part)) errors.push(`${profile.name}: Telegram clipboard is missing: ${part}`);
    }
    const openedAfterTelegram = await page.evaluate(() => [...window.__callbackOpenedUrls]);
    if (openedAfterTelegram.at(-1) !== "https://t.me/lawrazbor") errors.push(`${profile.name}: Telegram callback URL is invalid`);

    await callbackDialog.locator("[data-callback-whatsapp]").click();
    const openedAfterWhatsapp = await page.evaluate(() => [...window.__callbackOpenedUrls]);
    const whatsappUrl = openedAfterWhatsapp.at(-1) || "";
    if (!whatsappUrl.startsWith("https://api.whatsapp.com/send?phone=79065297970")) errors.push(`${profile.name}: WhatsApp callback URL is invalid`);

    await callbackDialog.locator("[data-callback-close]").click();
    await page.locator(".hero__actions [data-price-quiz-open]").click();
    const quizDialog = page.locator("#price-quiz-dialog");
    for (const choice of ["Не возвращают деньги", "Договор", "В ближайшие дни"]) {
      await quizDialog.getByRole("button", { name: choice, exact: true }).click();
    }
    const quizCallbackLink = quizDialog.locator("[data-price-quiz-result] [data-callback-open]");
    await checkCentered(quizCallbackLink, quizDialog.locator("[data-price-quiz-result]"), `${profile.name} quiz form`);

    await page.goto("http://127.0.0.1:4174/politika-konfidencialnosti/", { waitUntil: "networkidle" });
    const privacyLayout = await page.evaluate(() => {
      const heading = document.querySelector(".legal-page aside h1")?.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      return {
        viewport,
        scrollWidth: document.documentElement.scrollWidth,
        headingLeft: heading?.left ?? 0,
        headingRight: heading?.right ?? 0,
      };
    });
    if (privacyLayout.scrollWidth > privacyLayout.viewport + 1) errors.push(`${profile.name}: privacy page has horizontal overflow`);
    if (privacyLayout.headingLeft < -1 || privacyLayout.headingRight > privacyLayout.viewport + 1) errors.push(`${profile.name}: privacy heading slid sideways`);

    const storedKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => /callback/i.test(key)));
    if (storedKeys.length) errors.push(`${profile.name}: callback data was persisted: ${storedKeys.join(", ")}`);
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (errors.length) {
  const reportDir = join(root, "reports");
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, "callback-errors.txt"), [...new Set(errors)].join("\n"), "utf8");
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Callback interaction test passed: centered links, desktop/mobile clipboard, privacy layout and messenger URLs");
