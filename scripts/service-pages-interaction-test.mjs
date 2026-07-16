import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { servicePageContent } from "./service-pages-overrides.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const browserDir = join(root, ".browser-bin");
const browserPath = join(browserDir, "chromium");
const browserPackage = join(root, "node_modules", "@sparticuz", "chromium", "bin");
await mkdir(browserDir, { recursive: true });

if (!(await access(browserPath).then(() => true).catch(() => false))) {
  await pipeline(createReadStream(join(browserPackage, "chromium.br")), createBrotliDecompress(), createWriteStream(browserPath));
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
  env: { ...process.env, PORT: "4177" },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Service preview server timeout")), 8000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) { clearTimeout(timer); resolve(); }
  });
  server.on("exit", (code) => reject(new Error(`Service preview server exited: ${code}`)));
});

const profiles = [
  { name: "desktop", viewport: { width: 1280, height: 900 }, h1: [44, 74], h2: [32, 56], lead: [17, 20], button: [13, 15] },
  { name: "mobile", viewport: { width: 390, height: 844 }, h1: [36, 48], h2: [29, 40], lead: [16.5, 18], button: [14.5, 16] },
];
const samples = ["vozvrat-deneg", "iskovoe-zayavlenie", "marketpleysy"];
const errors = [];
let browser;

const textParam = (href) => {
  try { return new URL(href).searchParams.get("text") || ""; } catch { return ""; }
};
const inRange = (value, [min, max]) => value >= min && value <= max;

try {
  browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--disable-extensions"],
  });

  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.name === "mobile", hasTouch: profile.name === "mobile" });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${profile.name}: pageerror ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${profile.name}: console ${message.text()}`); });

    for (const slug of samples) {
      const expected = servicePageContent[slug];
      await page.goto(`http://127.0.0.1:4177/uslugi/${slug}/`, { waitUntil: "networkidle" });
      const metrics = await page.evaluate(() => {
        const number = (selector) => Number.parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
        const h1 = document.querySelector(".service-hero h1");
        return {
          body: Number.parseFloat(getComputedStyle(document.body).fontSize),
          h1: number(".service-hero h1"),
          lead: number(".service-hero h1 + p"),
          h2: number(".section--process h2"),
          button: number(".service-hero .button--primary"),
          serif: getComputedStyle(h1).fontFamily,
          viewport: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      if (metrics.body !== 16) errors.push(`${profile.name}/${slug}: body font ${metrics.body}px`);
      if (!inRange(metrics.h1, profile.h1)) errors.push(`${profile.name}/${slug}: h1 ${metrics.h1}px outside ${profile.h1.join("-")}`);
      if (!inRange(metrics.h2, profile.h2)) errors.push(`${profile.name}/${slug}: h2 ${metrics.h2}px outside ${profile.h2.join("-")}`);
      if (!inRange(metrics.lead, profile.lead)) errors.push(`${profile.name}/${slug}: lead ${metrics.lead}px outside ${profile.lead.join("-")}`);
      if (!inRange(metrics.button, profile.button)) errors.push(`${profile.name}/${slug}: button ${metrics.button}px outside ${profile.button.join("-")}`);
      if (!/Iowan|Palatino|Georgia|serif/i.test(metrics.serif)) errors.push(`${profile.name}/${slug}: heading serif stack is missing`);
      if (metrics.scrollWidth > metrics.viewport + 1) errors.push(`${profile.name}/${slug}: horizontal overflow`);

      await page.locator(".service-hero .button--primary[data-dialog-open]").click();
      const dialog = page.locator("#contact-dialog");
      const whatsapp = await dialog.locator("[data-whatsapp-link]").getAttribute("href") || "";
      const telegram = await dialog.locator("a[data-track='telegram']").getAttribute("href") || "";
      if (textParam(whatsapp) !== expected.message) errors.push(`${profile.name}/${slug}: WhatsApp received a different service message`);
      if (textParam(telegram) !== expected.message) errors.push(`${profile.name}/${slug}: Telegram received a different service message`);
      const shownTopic = await dialog.locator("[data-dialog-topic]").textContent() || "";
      if (!shownTopic.includes(expected.topic)) errors.push(`${profile.name}/${slug}: dialog topic is incorrect`);
      await dialog.locator("[data-dialog-close]").click();
    }
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (errors.length) {
  await mkdir(join(root, "reports"), { recursive: true });
  await writeFile(join(root, "reports", "service-pages-errors.txt"), [...new Set(errors)].join("\n"), "utf8");
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Service page interaction test passed: individual messages and readable typography on desktop and mobile");
