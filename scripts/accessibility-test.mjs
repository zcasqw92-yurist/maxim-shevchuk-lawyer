import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
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

const port = "4178";
const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Accessibility preview server timeout")), 8000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Accessibility preview server exited: ${code}`)));
});

const routes = [
  "/",
  "/uslugi/",
  "/uslugi/dosudebnoe-uregulirovanie/",
  "/uslugi/vozvrat-deneg/",
  "/uslugi/zhaloby-i-obrashcheniya/",
  "/uslugi/iskovoe-zayavlenie/",
  "/uslugi/spory-biznesa/",
  "/uslugi/marketpleysy/",
  "/o-yuriste/",
  "/kontakty/",
  "/politika-konfidencialnosti/",
];
const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const failures = [];
let browser;

const runAxe = async (page, label) => {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: "rule", values: ["color-contrast"] },
    resultTypes: ["violations"],
  }));
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      failures.push({
        label,
        rule: violation.id,
        target: node.target.join(" "),
        summary: node.failureSummary?.replace(/\s+/g, " ").trim() || violation.help,
      });
    }
  }
};

const typographySelectors = {
  primary: [
    "main p",
    "main dd",
    "main blockquote",
    "main .plain-checks li",
    "dialog p",
    "dialog dd",
  ].join(","),
  secondary: [
    "main small",
    "main figcaption",
    "main dt",
    "main label",
    "main button",
    "main a",
    "main summary",
    "dialog small",
    "dialog figcaption",
    "dialog dt",
    "dialog label",
    "dialog button",
    "dialog a",
    ".document-sample__copy li",
    ".about-proof strong",
    ".about-proof em",
    ".site-header small",
    ".header__online",
    ".breadcrumbs li",
    ".breadcrumbs a",
    ".mobile-contact button",
    ".site-footer p",
    ".site-footer li",
    ".site-footer small",
    ".site-footer em",
    ".site-footer a",
    ".consent-banner p",
    ".consent-banner a",
  ].join(","),
  optional: [
    ".eyebrow",
    ".hero__kicker",
    ".hero__quick-choices > span",
    ".service-card__number",
    ".identity-card > span",
    ".identity-card > small",
    ".brand__text small",
    ".brand--footer small",
    ".header__online",
    ".about-preview__seal small",
    ".about-hero__role",
    ".inner-hero__aside > span",
    ".service-hero__price small",
    ".document-sample__copy > small",
    ".featured-case__copy dt",
    ".visual-case > div > span",
    ".visual-case dt",
    ".about-proof small",
    ".footer__title",
    ".footer__office small",
    ".footer-map-card small",
    ".map-poster small",
    ".callback-form__availability",
    ".process-guarantee > span",
    ".case-study__category",
    ".service-guide__checklist > span",
  ].join(","),
};

const auditMobileTypography = async (page, label, scopeSelector = "body") => {
  const result = await page.evaluate(({ selectors, scopeSelector }) => {
    const scope = document.querySelector(scopeSelector);
    if (!scope) return [{ selector: scopeSelector, role: "scope", size: 0, minimum: 0, text: "scope-not-found" }];
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0;
    };
    const noteLike = (element) => element.matches([
      "small",
      "figcaption",
      "dt",
      "label",
      "[class*='__note']",
      "[class*='__privacy']",
      "[class*='__status']",
      "[class*='__progress']",
      "[class*='__caption']",
      "[class*='__meta']",
    ].join(","));
    const path = (element) => {
      const classes = [...element.classList].slice(0, 3).join(".");
      return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`;
    };
    const candidates = [...document.querySelectorAll([
      selectors.primary,
      selectors.secondary,
      selectors.optional,
    ].join(","))].filter((element) => scope.contains(element));
    const violations = [];

    for (const element of candidates) {
      const sourceText = element.textContent.trim()
        || element.getAttribute("placeholder")
        || element.getAttribute("aria-label")
        || "";
      if (!visible(element) || !sourceText) continue;
      const text = sourceText.replace(/\s+/g, " ");
      const size = Number.parseFloat(getComputedStyle(element).fontSize);
      const isOptional = element.matches(selectors.optional);
      let role = "secondary";
      let minimum = 14;

      if (isOptional) {
        role = "optional";
        minimum = 12;
        if (text.length > 48) {
          violations.push({ selector: path(element), role, size, text: text.slice(0, 90), reason: "optional-label-too-long" });
          continue;
        }
      } else if (element.matches(selectors.primary) && !noteLike(element)) {
        role = "primary";
        minimum = 16;
      }

      if (size + .01 < minimum) {
        violations.push({ selector: path(element), role, size, minimum, text: text.slice(0, 90) });
      }
    }

    return violations;
  }, { selectors: typographySelectors, scopeSelector });

  for (const violation of result) failures.push({
    label,
    rule: "mobile-typography",
    target: violation.selector,
    summary: `${violation.role}: ${violation.size}px < ${violation.minimum || 12}px · ${violation.reason || violation.text}`,
  });
};

const auditTextSpacing = async (page, label) => {
  await page.addStyleTag({ content: `
    html { font-size: 200% !important; }
    * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }
  ` });
  const result = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const clipped = [...document.querySelectorAll("main p, main dd, main small, main figcaption, main button, main a, dialog p, dialog button, dialog a, .site-footer p, .site-footer a, .consent-banner p, .consent-banner a")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) return false;
        const clipsX = ["hidden", "clip"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
        const clipsY = ["hidden", "clip"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
        return clipsX || clipsY;
      })
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 3).join(".")}`);
    return {
      viewport,
      scrollWidth: document.documentElement.scrollWidth,
      clipped,
    };
  });

  if (result.scrollWidth > result.viewport + 1) failures.push({
    label,
    rule: "mobile-text-spacing",
    target: "html",
    summary: `horizontal overflow ${result.scrollWidth}px > ${result.viewport}px`,
  });
  for (const target of result.clipped) failures.push({
    label,
    rule: "mobile-text-spacing",
    target,
    summary: "content is clipped at 200% text size with custom spacing",
  });
};

try {
  browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--disable-extensions"],
    executablePath: browserPath,
    headless: true,
  });

  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      reducedMotion: "reduce",
    });
    for (const route of routes) {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "networkidle" });
      await runAxe(page, `${profile.name} ${route}`);

      if (route === "/") {
        await page.locator("[data-dialog-open]").first().click();
        await runAxe(page, `${profile.name} / contact-dialog`);
        await page.locator("[data-dialog-close]").click();

        await page.locator("[data-price-quiz-open]").first().click();
        await runAxe(page, `${profile.name} / price-quiz`);
        await page.locator("[data-price-quiz-close]").click();

        await page.locator("[data-proof-open]").first().click();
        await runAxe(page, `${profile.name} / proof-dialog`);
        await page.locator("[data-proof-close]").first().click();

        if (profile.isMobile) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.locator("[data-menu-toggle]").click();
          await runAxe(page, `${profile.name} / mobile-menu`);
        }
      }
      await page.close();
    }
    await context.close();
  }

  for (const width of [320, 390, 430]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    for (const route of routes) {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "networkidle" });
      await auditMobileTypography(page, `${width}px ${route}`);
      await auditTextSpacing(page, `${width}px ${route}`);

      if (route === "/") {
        await page.locator("[data-dialog-open]").first().click();
        await auditMobileTypography(page, `${width}px / contact-dialog`, "#contact-dialog");
        await page.locator("[data-dialog-close]").click();

        await page.locator("[data-price-quiz-open]").first().click();
        await auditMobileTypography(page, `${width}px / price-quiz`, "#price-quiz-dialog");
        await page.locator("[data-price-quiz-close]").click();

        await page.locator("[data-proof-open]").first().click();
        await auditMobileTypography(page, `${width}px / proof-dialog`, ".proof-dialog[open]");
        await page.locator("[data-proof-close]").first().click();
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (failures.length) {
  const grouped = new Map();
  failures.forEach((failure) => {
    const key = `${failure.target}\n${failure.summary}`;
    const item = grouped.get(key) || { ...failure, count: 0, labels: new Set() };
    item.count += 1;
    item.labels.add(failure.label);
    grouped.set(key, item);
  });
  const summary = [...grouped.values()]
    .sort((a, b) => b.count - a.count)
    .map((item) => `${item.count}× ${item.target} · ${item.summary} · ${[...item.labels].slice(0, 4).join(", ")}`)
    .join("\n");
  console.error(`Accessibility violations: ${failures.length} nodes in ${grouped.size} groups\n${summary}`);
  if (process.env.A11Y_REPORT_ONLY !== "true" && process.env.MOBILE_TYPOGRAPHY_REPORT_ONLY !== "true") process.exit(1);
} else {
  console.log(`Accessibility checks passed: contrast plus mobile typography at 320, 390 and 430 px`);
}
