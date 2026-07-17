import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const chromiumBinary = require("@sparticuz/chromium").default;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = join(root, "reports", "browser-audit");
const shotsDir = join(reportDir, "screenshots");
await rm(reportDir, { recursive: true, force: true });
await mkdir(shotsDir, { recursive: true });

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

const routes = [
  ["home", "/"],
  ["services", "/uslugi/"],
  ["service-settlement", "/uslugi/dosudebnoe-uregulirovanie/"],
  ["service-refund", "/uslugi/vozvrat-deneg/"],
  ["service-claim", "/uslugi/iskovoe-zayavlenie/"],
  ["service-complaints", "/uslugi/zhaloby-i-obrashcheniya/"],
  ["service-business", "/uslugi/spory-biznesa/"],
  ["service-marketplaces", "/uslugi/marketpleysy/"],
  ["about", "/o-yuriste/"],
  ["contacts", "/kontakty/"],
  ["privacy", "/politika-konfidencialnosti/"],
];
const modes = [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
];
const findings = [];
const screenshots = [];
let browser;
const addFinding = (severity, page, mode, category, detail) => findings.push({ severity, page, mode, category, detail });
const capture = async (page, name, fullPage = false) => {
  const full = fullPage ? `${name}.jpg` : `${name}.png`;
  const options = fullPage
    ? { path: join(shotsDir, full), fullPage: true, type: "jpeg", quality: 68, animations: "disabled", timeout: 20000 }
    : { path: join(shotsDir, full), fullPage: false, type: "png", animations: "disabled", timeout: 20000 };
  await page.screenshot(options);
  screenshots.push(full);
};
const prepare = async (page) => {
  await page.evaluate(async () => {
    document.querySelectorAll(".reveal").forEach((item) => item.classList.add("is-visible"));
    document.querySelectorAll("img").forEach((image) => { image.loading = "eager"; });
    await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    })));
    window.scrollTo(0, 0);
  });
};
const auditLayout = async (page) => page.evaluate(() => {
  const viewport = document.documentElement.clientWidth;
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01 && rect.width > 1 && rect.height > 1;
  };
  const describe = (element) => ({
    tag: element.tagName.toLowerCase(),
    id: element.id || "",
    className: typeof element.className === "string" ? element.className.slice(0, 100) : "",
    text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90),
  });
  const outside = [...document.querySelectorAll("body *")]
    .filter(visible)
    .map((element) => ({ element, rect: element.getBoundingClientRect(), style: getComputedStyle(element) }))
    .filter(({ rect, style }) => style.position !== "fixed" && (rect.left < -2 || rect.right > viewport + 2))
    .slice(0, 20)
    .map(({ element, rect }) => ({ ...describe(element), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }));
  const clipped = [...document.querySelectorAll("body *")]
    .filter(visible)
    .filter((element) => {
      const style = getComputedStyle(element);
      return (element.scrollWidth > element.clientWidth + 3 && !["visible", "auto", "scroll"].includes(style.overflowX))
        || (element.scrollHeight > element.clientHeight + 3 && !["visible", "auto", "scroll"].includes(style.overflowY));
    })
    .slice(0, 20)
    .map((element) => ({ ...describe(element), client: `${element.clientWidth}×${element.clientHeight}`, scroll: `${element.scrollWidth}×${element.scrollHeight}` }));
  const brokenImages = [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => ({ src: image.currentSrc || image.src, alt: image.alt }));
  const smallTargets = [...document.querySelectorAll("a, button, input, select, textarea, summary")]
    .filter(visible)
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width < 40 || rect.height < 40)
    .slice(0, 20)
    .map(({ element, rect }) => ({ ...describe(element), size: `${Math.round(rect.width)}×${Math.round(rect.height)}` }));
  return {
    title: document.title,
    h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || "",
    viewport,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    outside,
    clipped,
    brokenImages,
    smallTargets,
  };
});
const safeClickShot = async (page, selector, name, mode = "desktop") => {
  try {
    const target = page.locator(selector).first();
    if (!await target.count() || !await target.isVisible()) {
      addFinding("warning", "state", mode, "missing-trigger", selector);
      return false;
    }
    await target.click();
    await page.waitForTimeout(120);
    await capture(page, name, false);
    return true;
  } catch (error) {
    addFinding("error", "state", mode, "interaction", `${selector}: ${error.message}`);
    return false;
  }
};

try {
  browser = await chromium.launch({
    args: chromiumBinary.args.concat(["--disable-background-networking", "--disable-extensions", "--font-render-hinting=none"]),
    executablePath: browserPath,
    headless: true,
  });

  for (const [routeName, routePath] of routes) {
    for (const [modeName, viewport] of modes) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      page.on("pageerror", (error) => addFinding("error", routeName, modeName, "javascript", error.message));
      page.on("console", (message) => { if (message.type() === "error") addFinding("error", routeName, modeName, "console", message.text()); });
      page.on("requestfailed", (request) => addFinding("error", routeName, modeName, "request", `${request.url()} — ${request.failure()?.errorText || "failed"}`));
      try {
        const response = await page.goto(`http://127.0.0.1:4173${routePath}`, { waitUntil: "networkidle", timeout: 20000 });
        if (!response?.ok()) addFinding("error", routeName, modeName, "http", `HTTP ${response?.status()}`);
        await prepare(page);
        await capture(page, `${routeName}-${modeName}-fold`, false);
        await capture(page, `${routeName}-${modeName}-full`, true);
        const audit = await auditLayout(page);
        if (audit.scrollWidth > audit.viewport + 2) addFinding("error", routeName, modeName, "horizontal-overflow", `${audit.scrollWidth}px при viewport ${audit.viewport}px`);
        for (const item of audit.outside) addFinding("warning", routeName, modeName, "outside-viewport", JSON.stringify(item));
        for (const item of audit.clipped) addFinding("warning", routeName, modeName, "clipped-content", JSON.stringify(item));
        for (const item of audit.brokenImages) addFinding("error", routeName, modeName, "broken-image", JSON.stringify(item));
        if (modeName === "mobile") for (const item of audit.smallTargets) addFinding("info", routeName, modeName, "small-target", JSON.stringify(item));
      } catch (error) {
        addFinding("error", routeName, modeName, "audit-crash", error.message);
      } finally {
        await page.close().catch(() => {});
      }
    }
  }

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await desktop.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await prepare(desktop);
  if (await safeClickShot(desktop, ".header__actions [data-dialog-open]", "state-desktop-contact-dialog")) await desktop.locator("#contact-dialog [data-dialog-close]").first().click().catch(() => {});
  if (await safeClickShot(desktop, "[data-video-launch]", "state-desktop-video-dialog")) await desktop.locator("dialog[open] [data-dialog-close]").first().click().catch(() => {});
  const proofButtons = desktop.locator("[data-proof-open]");
  for (let index = 0; index < Math.min(await proofButtons.count(), 6); index += 1) {
    const button = proofButtons.nth(index);
    if (!await button.isVisible()) continue;
    try {
      await button.click();
      await desktop.waitForTimeout(100);
      await capture(desktop, `state-desktop-proof-${index + 1}`);
      await desktop.locator("dialog[open] [data-dialog-close]").first().click().catch(() => {});
    } catch (error) {
      addFinding("error", "home", "desktop", "proof-dialog", error.message);
    }
  }
  const quizTrigger = desktop.locator("[data-price-quiz-open]").first();
  if (await quizTrigger.count()) {
    await quizTrigger.click();
    await capture(desktop, "state-desktop-quiz-step-1");
    const quiz = desktop.locator("#price-quiz-dialog");
    for (let step = 1; step <= 3; step += 1) {
      const choice = quiz.locator("[data-price-quiz-step]:visible button").first();
      if (!await choice.count()) break;
      await choice.click();
      await desktop.waitForTimeout(100);
      await capture(desktop, step === 3 ? "state-desktop-quiz-result" : `state-desktop-quiz-step-${step + 1}`);
    }
    await quiz.locator("[data-dialog-close]").first().click().catch(() => {});
  }
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await prepare(mobile);
  const menu = mobile.locator("[data-menu-toggle]").first();
  if (await menu.count()) {
    await menu.click();
    await capture(mobile, "state-mobile-menu-open");
    await menu.click();
  }
  if (await safeClickShot(mobile, "[data-price-quiz-open]", "state-mobile-quiz-open", "mobile")) await mobile.locator("#price-quiz-dialog [data-dialog-close]").first().click().catch(() => {});
  await mobile.evaluate(() => { window.scrollTo(0, Math.min(900, document.body.scrollHeight)); window.dispatchEvent(new Event("scroll")); });
  await mobile.waitForTimeout(250);
  await capture(mobile, "state-mobile-bottom-panel");
  if (await safeClickShot(mobile, "[data-mobile-contact-now]", "state-mobile-contact-dialog", "mobile")) await mobile.locator("#contact-dialog [data-dialog-close]").first().click().catch(() => {});
  await mobile.close();

  const contacts = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await contacts.goto("http://127.0.0.1:4173/kontakty/", { waitUntil: "networkidle" });
  await prepare(contacts);
  const mapButton = contacts.locator("[data-map-load]").first();
  if (await mapButton.count() && await mapButton.isVisible()) {
    await mapButton.scrollIntoViewIfNeeded();
    await mapButton.click();
    await contacts.waitForTimeout(250);
    await capture(contacts, "state-desktop-map-loaded");
  }
  await contacts.close();
} catch (error) {
  addFinding("error", "global", "all", "fatal", error.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill("SIGTERM");
  const counts = findings.reduce((result, item) => ({ ...result, [item.severity]: (result[item.severity] || 0) + 1 }), {});
  const summary = { generatedAt: new Date().toISOString(), routes: routes.map(([name, path]) => ({ name, path })), modes: modes.map(([name, viewport]) => ({ name, viewport })), screenshots, findings, counts };
  await writeFile(join(reportDir, "report.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const markdown = [
    "# Браузерный визуальный аудит",
    "",
    `Создан: ${summary.generatedAt}`,
    `Страниц: ${routes.length}; режимов: ${modes.length}; скриншотов: ${screenshots.length}.`,
    "",
    "## Сводка",
    "",
    `- Ошибки: ${counts.error || 0}`,
    `- Предупреждения: ${counts.warning || 0}`,
    `- Информационные замечания: ${counts.info || 0}`,
    "",
    "## Находки",
    "",
    ...(findings.length ? findings.map((item) => `- **${item.severity.toUpperCase()}** · ${item.page}/${item.mode} · ${item.category}: ${item.detail}`) : ["- Автоматически обнаруживаемых проблем нет. Требуется визуальный просмотр скриншотов."]),
  ].join("\n");
  await writeFile(join(reportDir, "report.md"), `${markdown}\n`, "utf8");
  console.log(`Browser audit created ${screenshots.length} screenshots and ${findings.length} findings`);
}
