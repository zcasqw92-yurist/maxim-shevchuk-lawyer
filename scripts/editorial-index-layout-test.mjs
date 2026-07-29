import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const skipped = [];
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const routes = ["/razbory/", "/praktika/"];
const viewports = [
  { width: 390, height: 844 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
];
const alignmentTolerance = 10;
const port = "4194";
const origin = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Editorial index preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Editorial index preview server exited: ${code}`)));
});

const rounded = (value) => Math.round(value * 10) / 10;

try {
  for (const [engineName, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
    const executablePath = engine.executablePath();
    const installed = await access(executablePath).then(() => true).catch(() => false);
    if (!installed) {
      const message = `${engineName}: browser binary is not installed at ${executablePath}`;
      if (requireBrowsers) errors.push(message);
      else skipped.push(message);
      continue;
    }

    const browser = await engine.launch({
      headless: true,
      ...(engineName === "Chromium" ? { args: ["--no-sandbox"] } : {}),
    });

    try {
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport, locale: "ru-RU" });
        await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
        const page = await context.newPage();

        for (const route of routes) {
          const response = await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
          if (!response?.ok()) {
            errors.push(`${engineName} ${viewport.width}px ${route}: status ${response?.status()}`);
            continue;
          }

          const targets = {
            grid: page.locator(".editorial-grid").first(),
            cta: page.locator(".editorial-cta").first(),
            copy: page.locator(".editorial-cta > div").first(),
            button: page.locator(".editorial-cta .button").first(),
            footer: page.locator(".site-footer").first(),
          };

          for (const [name, locator] of Object.entries(targets)) {
            if (!(await locator.count()) || !(await locator.isVisible())) {
              errors.push(`${engineName} ${viewport.width}px ${route}: ${name} is missing or hidden`);
            }
          }
          if (errors.some((message) => message.includes(`${engineName} ${viewport.width}px ${route}:`) && message.includes("missing or hidden"))) continue;

          const [gridBox, ctaBox, copyBox, buttonBox, footerBox] = await Promise.all(
            Object.values(targets).map((locator) => locator.boundingBox()),
          );
          if (![gridBox, ctaBox, copyBox, buttonBox, footerBox].every(Boolean)) {
            errors.push(`${engineName} ${viewport.width}px ${route}: failed to read layout boxes`);
            continue;
          }

          const gridBottomToCta = ctaBox.y - (gridBox.y + gridBox.height);
          const ctaToFooter = footerBox.y - (ctaBox.y + ctaBox.height);
          const leftAlignment = Math.abs(copyBox.x - gridBox.x);
          const rightAlignment = Math.abs((buttonBox.x + buttonBox.width) - (gridBox.x + gridBox.width));

          if (gridBottomToCta < 36 || gridBottomToCta > 92) {
            errors.push(`${engineName} ${viewport.width}px ${route}: card-to-CTA gap ${rounded(gridBottomToCta)}px is outside 36–92px`);
          }
          if (Math.abs(ctaToFooter) > 2) {
            errors.push(`${engineName} ${viewport.width}px ${route}: light gap between CTA and footer is ${rounded(ctaToFooter)}px`);
          }
          if (leftAlignment > alignmentTolerance) {
            errors.push(`${engineName} ${viewport.width}px ${route}: CTA copy differs from grid left edge by ${rounded(leftAlignment)}px`);
          }
          if (viewport.width > 680 && rightAlignment > alignmentTolerance) {
            errors.push(`${engineName} ${viewport.width}px ${route}: CTA button differs from grid right edge by ${rounded(rightAlignment)}px`);
          }

          const ctaStyle = await targets.cta.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              display: style.display,
              marginBottom: Number.parseFloat(style.marginBottom),
              backgroundColor: style.backgroundColor,
            };
          });
          if (ctaStyle.display !== "grid") errors.push(`${engineName} ${viewport.width}px ${route}: CTA display is ${ctaStyle.display}`);
          if (Math.abs(ctaStyle.marginBottom) > .5) errors.push(`${engineName} ${viewport.width}px ${route}: CTA margin-bottom is ${ctaStyle.marginBottom}px`);
          if (ctaStyle.backgroundColor === "rgba(0, 0, 0, 0)") errors.push(`${engineName} ${viewport.width}px ${route}: CTA background is transparent`);

          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow > 1) errors.push(`${engineName} ${viewport.width}px ${route}: ${overflow}px horizontal overflow`);
        }

        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Editorial index layout local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Editorial index layout passed: compact card-to-CTA transition, shared grid alignment and no light gap before footer in Chromium and WebKit");
