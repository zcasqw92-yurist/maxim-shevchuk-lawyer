import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium, webkit } from "playwright";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const skipped = [];
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const articleRoute = `/razbory/${articles[0].slug}/`;
const caseRoute = `/praktika/${practiceCases[0].slug}/`;
const port = "4192";
const origin = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Editorial UI preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Editorial UI preview server exited: ${code}`)));
});

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
      for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
        const context = await browser.newContext({ viewport, locale: "ru-RU" });
        await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
        const page = await context.newPage();

        for (const route of [articleRoute, caseRoute]) {
          const response = await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
          if (!response?.ok()) errors.push(`${engineName} ${viewport.width}px ${route}: status ${response?.status()}`);

          const marker = await page.locator(".editorial-checklist li").first().evaluate((element) => {
            const style = getComputedStyle(element, "::before");
            return {
              content: style.content,
              borderStyle: style.borderStyle,
              borderWidth: style.borderWidth,
              width: style.width,
              height: style.height,
            };
          });
          if (!marker.content.includes("✓")) errors.push(`${engineName} ${viewport.width}px ${route}: checklist marker is not a check ${JSON.stringify(marker)}`);
          if (marker.borderStyle !== "none" || marker.borderWidth !== "0px") errors.push(`${engineName} ${viewport.width}px ${route}: checkbox border remains ${JSON.stringify(marker)}`);
          if (marker.width === "10px" && marker.height === "10px") errors.push(`${engineName} ${viewport.width}px ${route}: legacy square marker remains`);

          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow > 1) errors.push(`${engineName} ${viewport.width}px ${route}: ${overflow}px horizontal overflow`);
        }

        await page.goto(`${origin}/`, { waitUntil: "networkidle" });
        const globalToggle = page.locator(".faq-item__toggle").first();
        if (!(await globalToggle.isVisible())) errors.push(`${engineName} ${viewport.width}px: brand FAQ control is not visible on home page`);
        const globalControl = await globalToggle.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            width: style.width,
            height: style.height,
            borderStyle: style.borderStyle,
            borderTopWidth: style.borderTopWidth,
            borderRadius: style.borderRadius,
          };
        });

        await page.goto(`${origin}${articleRoute}`, { waitUntil: "networkidle" });
        const details = page.locator("#faq .faq-item").first();
        const summary = details.locator("summary");
        if (!(await details.isVisible()) || !(await summary.isVisible())) errors.push(`${engineName} ${viewport.width}px: editorial FAQ is not visible`);

        const openedControl = await summary.evaluate((element) => {
          const style = getComputedStyle(element, "::after");
          return {
            content: style.content,
            width: style.width,
            height: style.height,
            borderStyle: style.borderStyle,
            borderTopWidth: style.borderTopWidth,
            borderRadius: style.borderRadius,
            backgroundImage: style.backgroundImage,
          };
        });
        if (openedControl.content.includes("+") || openedControl.content.includes("−")) {
          errors.push(`${engineName} ${viewport.width}px: legacy plus/minus FAQ control remains ${JSON.stringify(openedControl)}`);
        }
        if (openedControl.backgroundImage === "none") errors.push(`${engineName} ${viewport.width}px: editorial FAQ chevron is missing`);
        for (const property of ["width", "height", "borderStyle", "borderTopWidth", "borderRadius"]) {
          if (openedControl[property] !== globalControl[property]) {
            errors.push(`${engineName} ${viewport.width}px: editorial FAQ ${property} ${openedControl[property]} differs from brand FAQ ${globalControl[property]}`);
          }
        }

        await summary.click();
        if (await details.getAttribute("open") !== null) errors.push(`${engineName} ${viewport.width}px: FAQ did not close after summary click`);
        const closedBackground = await summary.evaluate((element) => getComputedStyle(element, "::after").backgroundImage);
        if (closedBackground === openedControl.backgroundImage) errors.push(`${engineName} ${viewport.width}px: FAQ chevron did not change direction after closing`);

        await summary.click();
        if (await details.getAttribute("open") === null) errors.push(`${engineName} ${viewport.width}px: FAQ did not reopen after summary click`);
        const reopenedBackground = await summary.evaluate((element) => getComputedStyle(element, "::after").backgroundImage);
        if (reopenedBackground !== openedControl.backgroundImage) errors.push(`${engineName} ${viewport.width}px: FAQ chevron did not restore upward direction after reopening`);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Editorial UI local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Editorial UI consistency passed: semantic checklist markers and one brand FAQ chevron control in Chromium and WebKit");
