import { spawn } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = join(root, "reports", "hero-consent");
const port = "4180";
const origin = `http://127.0.0.1:${port}`;
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const analyticsExpected = process.env.SITE_ANALYTICS_ENABLED === "true";
const errors = [];
const skipped = [];
const styles = await readFile(join(root, "dist", "assets", "styles.css"), "utf8");

for (const marker of [
  ".consent-banner__actions [data-consent-reject]",
  "border: 0",
  ".consent-banner__actions [data-consent-accept]",
  "border: 2px solid #f4d89e",
  ".home .hero__visual::before",
  ".home .hero__image-wrap",
  "border-radius: 0",
]) {
  if (!styles.includes(marker)) errors.push(`Compiled styles are missing contract marker: ${marker}`);
}

await mkdir(reports, { recursive: true });
const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Hero/consent preview server timeout")), 8000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Hero/consent preview server exited: ${code}`)));
});

const engines = [["Chromium", chromium], ["WebKit", webkit]];
const viewports = [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]];

try {
  for (const [engineName, engine] of engines) {
    const executablePath = engine.executablePath();
    const installed = await access(executablePath).then(() => true).catch(() => false);
    if (!installed) {
      const message = `${engineName}: browser binary is not installed at ${executablePath}`;
      if (requireBrowsers) errors.push(message);
      else skipped.push(message);
      continue;
    }

    const browser = await engine.launch({ headless: true, ...(engineName === "Chromium" ? { args: ["--no-sandbox"] } : {}) });
    try {
      for (const [viewportName, viewport] of viewports) {
        const page = await browser.newPage({ viewport, locale: "ru-RU" });
        const response = await page.goto(`${origin}/`, { waitUntil: "networkidle" });
        if (!response?.ok()) errors.push(`${engineName} ${viewportName}: HTTP ${response?.status()}`);

        const banner = page.locator("[data-consent-banner]");
        const bannerExists = await banner.count() > 0;
        if (analyticsExpected && !bannerExists) errors.push(`${engineName} ${viewportName}: consent banner is missing in production mode`);
        if (bannerExists && await banner.isVisible()) {
          const actions = await page.evaluate(() => {
            const reject = document.querySelector("[data-consent-reject]");
            const accept = document.querySelector("[data-consent-accept]");
            const pick = (element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return {
                borderTop: Number.parseFloat(style.borderTopWidth),
                borderRight: Number.parseFloat(style.borderRightWidth),
                borderBottom: Number.parseFloat(style.borderBottomWidth),
                borderLeft: Number.parseFloat(style.borderLeftWidth),
                background: style.backgroundColor,
                color: style.color,
                opacity: Number.parseFloat(style.opacity),
                width: rect.width,
                height: rect.height,
              };
            };
            return { reject: pick(reject), accept: pick(accept) };
          });
          if ([actions.reject.borderTop, actions.reject.borderRight, actions.reject.borderBottom, actions.reject.borderLeft].some((value) => value !== 0)) {
            errors.push(`${engineName} ${viewportName}: reject action still has a border ${JSON.stringify(actions.reject)}`);
          }
          if ([actions.accept.borderTop, actions.accept.borderRight, actions.accept.borderBottom, actions.accept.borderLeft].some((value) => value < 2)) {
            errors.push(`${engineName} ${viewportName}: accept action is not outlined strongly enough ${JSON.stringify(actions.accept)}`);
          }
          if (actions.accept.background === actions.reject.background || actions.accept.opacity < actions.reject.opacity) {
            errors.push(`${engineName} ${viewportName}: consent action is not visually primary ${JSON.stringify(actions)}`);
          }
          if (actions.accept.width < 44 || actions.accept.height < 44 || actions.reject.width < 44 || actions.reject.height < 44) {
            errors.push(`${engineName} ${viewportName}: consent actions are below the touch target minimum ${JSON.stringify(actions)}`);
          }
          await banner.screenshot({ path: join(reports, `${engineName.toLowerCase()}-${viewportName}-consent.png`) });
          await page.locator("[data-consent-reject]").click();
          await page.waitForFunction(() => document.querySelector("[data-consent-banner]")?.hidden === true);
        }

        const hero = page.locator(".home .hero__visual");
        await hero.scrollIntoViewIfNeeded();
        const heroState = await page.evaluate(() => {
          const visual = document.querySelector(".home .hero__visual");
          const wrap = document.querySelector(".home .hero__image-wrap");
          const image = wrap?.querySelector("img");
          const wrapStyle = getComputedStyle(wrap);
          const imageStyle = getComputedStyle(image);
          const cornerStyle = getComputedStyle(visual, "::before");
          const rect = wrap.getBoundingClientRect();
          return {
            wrapRadius: [wrapStyle.borderTopLeftRadius, wrapStyle.borderTopRightRadius, wrapStyle.borderBottomRightRadius, wrapStyle.borderBottomLeftRadius],
            imageRadius: [imageStyle.borderTopLeftRadius, imageStyle.borderTopRightRadius, imageStyle.borderBottomRightRadius, imageStyle.borderBottomLeftRadius],
            cornerContent: cornerStyle.content,
            cornerTop: Number.parseFloat(cornerStyle.borderTopWidth),
            cornerLeft: Number.parseFloat(cornerStyle.borderLeftWidth),
            cornerWidth: Number.parseFloat(cornerStyle.width),
            cornerHeight: Number.parseFloat(cornerStyle.height),
            imageVisible: image.complete && image.naturalWidth > 0 && rect.width > 0 && rect.height > 0,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });
        if ([...heroState.wrapRadius, ...heroState.imageRadius].some((value) => Number.parseFloat(value) !== 0)) {
          errors.push(`${engineName} ${viewportName}: hero portrait still has rounded corners ${JSON.stringify(heroState)}`);
        }
        if (heroState.cornerContent === "none" || heroState.cornerTop < 2 || heroState.cornerLeft < 2 || heroState.cornerWidth < 30 || heroState.cornerHeight < 30) {
          errors.push(`${engineName} ${viewportName}: gold corner accent is missing ${JSON.stringify(heroState)}`);
        }
        if (!heroState.imageVisible) errors.push(`${engineName} ${viewportName}: hero image is not visible`);
        if (heroState.overflow > 1) errors.push(`${engineName} ${viewportName}: horizontal overflow ${heroState.overflow}px`);
        await hero.screenshot({ path: join(reports, `${engineName.toLowerCase()}-${viewportName}-hero.png`) });
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Hero/consent local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Hero and consent contract passed: secondary refusal, primary consent, rectangular portrait and gold corner on desktop/mobile");
