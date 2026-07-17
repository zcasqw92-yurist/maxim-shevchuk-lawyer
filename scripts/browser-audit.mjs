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
const safeName = (value) => value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
const screenshot = async (page, name, options = {}) => {
  const file = join(shotsDir, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled", ...options });
  screenshots.push(`${name}.png`);
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

try {
  browser = await chromium.launch({
    args: chromiumBinary.args.concat(["--disable-background-networking", "--disable-extensions", "--font-render-hinting=none"]),
    executablePath: browserPath,
    headless: true,
  });

  for (const [routeName, routePath] of routes) {
    for (const [modeName, viewport] of modes) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      const label = `${routeName}-${modeName}`;
      page.on("pageerror", (error) => addFinding("error", routeName, modeName, "javascript", error.message));
      page.on("console", (message) => {
        if (message.type() === "error") addFinding("error", routeName, modeName, "console", message.text());
      });
      page.on("requestfailed", (request) => addFinding("error", routeName, modeName, "request", `${request.url()} — ${request.failure()?.errorText || "failed"}`));
      const response = await page.goto(`http://127.0.0.1:4173${routePath}`, { waitUntil: "networkidle" });
      if (!response?.ok()) addFinding("error", routeName, modeName, "http", `HTTP ${response?.status()}`);
      await prepare(page);
      await screenshot(page, `${label}-fold`, { fullPage: false });
      await screenshot(page, `${label}-full`, { fullPage: true });

      const audit = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight;
        const visible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01 && rect.width > 1 && rect.height > 1;
        };
        const descriptor = (element) => ({
          tag: element.tagName.toLowerCase(),
          id: element.id || "",
          className: typeof element.className === "string" ? element.className.slice(0, 120) : "",
          text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100),
        });
        const outside = [...document.querySelectorAll("body *")]
          .filter(visible)
          .map((element) => ({ element, rect: element.getBoundingClientRect(), style: getComputedStyle(element) }))
          .filter(({ rect, style }) => style.position !== "fixed" && (rect.left < -2 || rect.right > viewportWidth + 2))
          .slice(0, 30)
          .map(({ element, rect }) => ({ ...descriptor(element), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }));
        const clipped = [...document.querySelectorAll("body *")]
          .filter(visible)
          .filter((element) => {
            const style = getComputedStyle(element);
            const horizontal = element.scrollWidth > element.clientWidth + 3 && !["visible", "auto", "scroll"].includes(style.overflowX);
            const vertical = element.scrollHeight > element.clientHeight + 3 && !["visible", "auto", "scroll"].includes(style.overflowY);
            return horizontal || vertical;
          })
          .slice(0, 30)
          .map((element) => ({ ...descriptor(element), client: `${element.clientWidth}×${element.clientHeight}`, scroll: `${element.scrollWidth}×${element.scrollHeight}`, overflow: `${getComputedStyle(element).overflowX}/${getComputedStyle(element).overflowY}` }));
        const brokenImages = [...document.images]
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => ({ src: image.currentSrc || image.src, alt: image.alt }));
        const emptyVisuals = [...document.querySelectorAll("figure, picture, [class*='visual'], [class*='media'], [class*='image']")]
          .filter(visible)
          .filter((element) => !element.querySelector("img, svg, video, iframe, canvas") && !(element.textContent || "").trim())
          .slice(0, 20)
          .map(descriptor);
        const fixed = [...document.querySelectorAll("body *")]
          .filter(visible)
          .filter((element) => ["fixed", "sticky"].includes(getComputedStyle(element).position))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return { ...descriptor(element), rect: { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom) } };
          });
        const tinyTargets = [...document.querySelectorAll("a, button, input, select, textarea, summary")]
          .filter(visible)
          .map((element) => ({ element, rect: element.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width < 40 || rect.height < 40)
          .slice(0, 30)
          .map(({ element, rect }) => ({ ...descriptor(element), size: `${Math.round(rect.width)}×${Math.round(rect.height)}` }));
        return {
          title: document.title,
          h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || "",
          viewportWidth,
          viewportHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          outside,
          clipped,
          brokenImages,
          emptyVisuals,
          fixed,
          tinyTargets,
          sections: [...document.querySelectorAll("main section")].map((section, index) => ({
            index,
            id: section.id || "",
            className: typeof section.className === "string" ? section.className.slice(0, 100) : "",
            heading: section.querySelector("h2, h3")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || "",
          })),
        };
      });

      if (audit.scrollWidth > audit.viewportWidth + 2) addFinding("error", routeName, modeName, "horizontal-overflow", `${audit.scrollWidth}px при viewport ${audit.viewportWidth}px`);
      for (const item of audit.outside) addFinding("warning", routeName, modeName, "outside-viewport", JSON.stringify(item));
      for (const item of audit.clipped) addFinding("warning", routeName, modeName, "clipped-content", JSON.stringify(item));
      for (const item of audit.brokenImages) addFinding("error", routeName, modeName, "broken-image", JSON.stringify(item));
      for (const item of audit.emptyVisuals) addFinding("warning", routeName, modeName, "empty-visual", JSON.stringify(item));
      if (modeName === "mobile") for (const item of audit.tinyTargets) addFinding("info", routeName, modeName, "small-target", JSON.stringify(item));

      const sections = page.locator("main section");
      const sectionCount = await sections.count();
      for (let index = 0; index < sectionCount; index += 1) {
        const section = sections.nth(index);
        if (!await section.isVisible()) continue;
        const box = await section.boundingBox();
        if (!box || box.width < 20 || box.height < 20 || box.height > 5000) continue;
        const heading = audit.sections[index]?.heading || audit.sections[index]?.id || `section-${index + 1}`;
        await section.scrollIntoViewIfNeeded();
        await screenshot(page, `${label}-section-${String(index + 1).padStart(2, "0")}-${safeName(heading).slice(0, 45)}`, { fullPage: false });
      }
      await page.close();
    }
  }

  const statePage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await statePage.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await prepare(statePage);
  const captureClick = async (selector, name) => {
    const target = statePage.locator(selector).first();
    if (!await target.count() || !await target.isVisible()) {
      addFinding("warning", "home", "desktop", "missing-state-trigger", selector);
      return false;
    }
    await target.click();
    await statePage.waitForTimeout(150);
    await screenshot(statePage, `state-desktop-${name}`, { fullPage: false });
    return true;
  };
  if (await captureClick(".header__actions [data-dialog-open]", "contact-dialog")) {
    const close = statePage.locator("#contact-dialog [data-dialog-close]").first();
    if (await close.count()) await close.click();
  }
  if (await captureClick("[data-video-launch]", "video-dialog")) {
    const close = statePage.locator("dialog[open] [data-dialog-close]").first();
    if (await close.count()) await close.click();
  }
  const proofButtons = statePage.locator("[data-proof-open]");
  const proofCount = await proofButtons.count();
  for (let index = 0; index < proofCount; index += 1) {
    const button = proofButtons.nth(index);
    if (!await button.isVisible()) continue;
    await button.click();
    await statePage.waitForTimeout(100);
    await screenshot(statePage, `state-desktop-proof-${String(index + 1).padStart(2, "0")}`, { fullPage: false });
    const close = statePage.locator("dialog[open] [data-dialog-close]").first();
    if (await close.count()) await close.click();
  }
  const quizTrigger = statePage.locator("[data-price-quiz-open]").first();
  if (await quizTrigger.count()) {
    await quizTrigger.click();
    const quiz = statePage.locator("#price-quiz-dialog");
    await screenshot(statePage, "state-desktop-quiz-step-1", { fullPage: false });
    for (let step = 1; step <= 3; step += 1) {
      const visibleStep = quiz.locator("[data-price-quiz-step]:visible");
      const choice = visibleStep.locator("button").first();
      if (!await choice.count()) break;
      await choice.click();
      await statePage.waitForTimeout(100);
      await screenshot(statePage, step === 3 ? "state-desktop-quiz-result" : `state-desktop-quiz-step-${step + 1}`, { fullPage: false });
    }
    const close = quiz.locator("[data-dialog-close]").first();
    if (await close.count()) await close.click();
  }
  await statePage.close();

  const mobileState = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobileState.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await prepare(mobileState);
  const menu = mobileState.locator("[data-menu-toggle]").first();
  if (await menu.count()) {
    await menu.click();
    await screenshot(mobileState, "state-mobile-menu-open", { fullPage: false });
    await menu.click();
  }
  const mobileQuiz = mobileState.locator("[data-price-quiz-open]").first();
  if (await mobileQuiz.count()) {
    await mobileQuiz.click();
    await screenshot(mobileState, "state-mobile-quiz-open", { fullPage: false });
    const close = mobileState.locator("#price-quiz-dialog [data-dialog-close]").first();
    if (await close.count()) await close.click();
  }
  await mobileState.evaluate(() => { window.scrollTo(0, Math.min(900, document.body.scrollHeight)); window.dispatchEvent(new Event("scroll")); });
  await mobileState.waitForTimeout(250);
  await screenshot(mobileState, "state-mobile-bottom-panel", { fullPage: false });
  const mobileContact = mobileState.locator("[data-mobile-contact-now]").first();
  if (await mobileContact.count() && await mobileContact.isVisible()) {
    await mobileContact.click();
    await screenshot(mobileState, "state-mobile-contact-dialog", { fullPage: false });
  }
  await mobileState.close();

  const contactsState = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await contactsState.goto("http://127.0.0.1:4173/kontakty/", { waitUntil: "networkidle" });
  await prepare(contactsState);
  const mapButton = contactsState.locator("[data-map-load]").first();
  if (await mapButton.count() && await mapButton.isVisible()) {
    await mapButton.scrollIntoViewIfNeeded();
    await mapButton.click();
    await contactsState.waitForTimeout(300);
    await screenshot(contactsState, "state-desktop-map-loaded", { fullPage: false });
  }
  await contactsState.close();

  const summary = {
    generatedAt: new Date().toISOString(),
    routes: routes.map(([name, path]) => ({ name, path })),
    modes: modes.map(([name, viewport]) => ({ name, viewport })),
    screenshots,
    findings,
    counts: findings.reduce((result, item) => ({ ...result, [item.severity]: (result[item.severity] || 0) + 1 }), {}),
  };
  await writeFile(join(reportDir, "report.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const markdown = [
    "# Браузерный визуальный аудит",
    "",
    `Создан: ${summary.generatedAt}`,
    `Страниц: ${routes.length}; режимов: ${modes.length}; скриншотов: ${screenshots.length}.`,
    "",
    "## Сводка",
    "",
    `- Ошибки: ${summary.counts.error || 0}`,
    `- Предупреждения: ${summary.counts.warning || 0}`,
    `- Информационные замечания: ${summary.counts.info || 0}`,
    "",
    "## Находки",
    "",
    ...findings.map((item) => `- **${item.severity.toUpperCase()}** · ${item.page}/${item.mode} · ${item.category}: ${item.detail}`),
    findings.length ? "" : "- Автоматически обнаруживаемых проблем нет. Требуется визуальный просмотр скриншотов.",
  ].join("\n");
  await writeFile(join(reportDir, "report.md"), `${markdown}\n`, "utf8");
  console.log(`Browser audit created ${screenshots.length} screenshots and ${findings.length} findings`);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
