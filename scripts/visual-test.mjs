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
const shots = join(root, "reports", "screenshots");
await mkdir(shots, { recursive: true });
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
  env: { ...process.env, PORT: "4173" },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Preview server timeout")), 8000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) { clearTimeout(timer); resolve(); }
  });
  server.on("exit", (code) => reject(new Error(`Preview server exited: ${code}`)));
});

const checks = [
  { name: "home-desktop", path: "/", viewport: { width: 1440, height: 1000 }, fullPage: true },
  { name: "home-mobile", path: "/", viewport: { width: 390, height: 844 }, fullPage: true },
  { name: "services-tablet", path: "/uslugi/", viewport: { width: 820, height: 1180 }, fullPage: true },
  { name: "service-mobile", path: "/uslugi/dosudebnoe-uregulirovanie/", viewport: { width: 390, height: 844 }, fullPage: true },
  { name: "about-desktop", path: "/o-yuriste/", viewport: { width: 1440, height: 1000 }, fullPage: true },
  { name: "about-mobile", path: "/o-yuriste/", viewport: { width: 390, height: 844 }, fullPage: true },
  { name: "contacts-mobile", path: "/kontakty/", viewport: { width: 390, height: 844 }, fullPage: true },
];
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
      "--font-render-hinting=none",
    ],
    executablePath: browserPath,
    headless: true,
  });
  for (const check of checks) {
    const page = await browser.newPage({ viewport: check.viewport, deviceScaleFactor: 1 });
    page.on("pageerror", (error) => errors.push(`${check.name}: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${check.name}: console ${message.text()}`); });
    const response = await page.goto(`http://127.0.0.1:4173${check.path}`, { waitUntil: "networkidle" });
    if (!response?.ok()) errors.push(`${check.name}: HTTP ${response?.status()}`);
    await page.evaluate(async () => {
      document.querySelectorAll(".reveal").forEach((item) => item.classList.add("is-visible"));
      document.querySelectorAll("img").forEach((image) => { image.loading = "eager"; });
      await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })));
    });
    await page.screenshot({ path: join(shots, `${check.name}-fold.png`), fullPage: false });
    await page.screenshot({ path: join(shots, `${check.name}.png`), fullPage: check.fullPage });
    const layout = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll("body *")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName.toLowerCase(), className: element.className?.toString().slice(0, 80) || "", left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
        })
        .filter((item) => item.left < -1 || item.right > viewport + 1)
        .slice(0, 8);
      const wideContainers = [...document.querySelectorAll("body *")]
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: element.className?.toString().slice(0, 80) || "",
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }))
        .filter((item) => item.scrollWidth > viewport + 1 || item.scrollWidth > item.clientWidth + 40)
        .slice(0, 8);
      return { viewport, scrollWidth: document.documentElement.scrollWidth, offenders, wideContainers };
    });
    if (layout.scrollWidth > layout.viewport + 1) errors.push(`${check.name}: horizontal overflow ${JSON.stringify(layout)}`);
    await page.close();
  }

  const interactionPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await interactionPage.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  const dialogButton = interactionPage.locator(".header__actions [data-dialog-open]");
  if (await dialogButton.count() !== 1) errors.push("interaction: header dialog trigger is not unique");
  else await dialogButton.click();
  const dialog = interactionPage.locator("#contact-dialog");
  if (!await dialog.evaluate((element) => element.open)) errors.push("interaction: contact dialog did not open");
  if (await interactionPage.locator("[data-online-status]").count() < 2) errors.push("interaction: online status indicators are missing");
  const whatsappHref = await interactionPage.locator("#contact-dialog [data-whatsapp-link]").getAttribute("href");
  const telegramHref = await interactionPage.locator("#contact-dialog [data-track='telegram']").getAttribute("href");
  if (!whatsappHref?.startsWith("https://api.whatsapp.com/send?phone=79065297970&text=")) errors.push("interaction: WhatsApp link is missing prepared message");
  if (telegramHref !== "https://t.me/lawrazbor") errors.push("interaction: Telegram link is invalid");
  await interactionPage.locator("[data-dialog-close]").click();
  await interactionPage.locator(".hero__quick-choices [data-topic='возврат денежных средств']").click();
  const selectedTopic = await interactionPage.locator("#contact-dialog [data-dialog-topic]").textContent();
  const selectedWhatsappHref = await interactionPage.locator("#contact-dialog [data-whatsapp-link]").getAttribute("href");
  const selectedWhatsappText = selectedWhatsappHref ? new URL(selectedWhatsappHref).searchParams.get("text") : "";
  if (selectedTopic !== "Вы выбрали: возврат денежных средств") errors.push("interaction: selected topic is not shown in dialog");
  if (!selectedWhatsappText?.includes("по вопросу: возврат денежных средств")) errors.push("interaction: WhatsApp message does not include selected topic");
  await interactionPage.locator("[data-dialog-close]").click();
  await interactionPage.locator(".header__online").click();
  if (!await dialog.evaluate((element) => element.open)) errors.push("interaction: online status did not open contact dialog");
  await interactionPage.close();

  const quizPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await quizPage.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await quizPage.locator(".hero__actions [data-price-quiz-open]").click();
  const quizDialog = quizPage.locator("#price-quiz-dialog");
  if (!await quizDialog.evaluate((element) => element.open)) errors.push("interaction: price quiz did not open");
  if (await quizDialog.locator("[data-price-quiz-step]").count() !== 3) errors.push("interaction: price quiz must contain exactly three steps");
  const quizChoices = ["Не возвращают деньги", "Договор", "В ближайшие дни"];
  for (const choice of quizChoices) {
    await quizDialog.getByRole("button", { name: choice, exact: true }).click();
  }
  if (await quizPage.locator("[data-price-quiz-result]").isHidden()) errors.push("interaction: price quiz result did not open");
  const quizWhatsappHref = await quizPage.locator("[data-price-quiz-whatsapp]").getAttribute("href");
  const quizWhatsappText = quizWhatsappHref ? new URL(quizWhatsappHref).searchParams.get("text") : "";
  if (!quizWhatsappText?.includes("Ситуация: Не возвращают деньги") || !quizWhatsappText.includes("Материалы: Договор") || !quizWhatsappText.includes("Срок: В ближайшие дни")) errors.push("interaction: price quiz WhatsApp summary is incomplete");
  await quizPage.close();

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  const menuButton = mobilePage.locator("[data-menu-toggle]");
  if (await menuButton.count() !== 1) errors.push("interaction: mobile menu trigger is not unique");
  else await menuButton.click();
  if (!await mobilePage.locator("[data-mobile-menu]").isVisible()) errors.push("interaction: mobile menu did not open");
  await mobilePage.close();
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log(`Visual and interaction smoke test passed: ${checks.length} viewports, dialogs, price quiz, menu`);
