import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = join(root, "reports", "engagement-nudge");
const port = "4194";
const origin = `http://127.0.0.1:${port}`;
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const errors = [];
const skipped = [];

await mkdir(reports, { recursive: true });
const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Narrow engagement preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Narrow engagement preview server exited: ${code}`)));
});

const waitForStableLayout = (page) => page.evaluate(async () => {
  await document.fonts?.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

const readOverflow = () => {
  const rootElement = document.documentElement;
  const body = document.body;
  const viewportWidth = rootElement.clientWidth;
  const details = [...document.querySelectorAll("body *")]
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 0
        && rect.height > 0
        && (element.scrollWidth > element.clientWidth + 1 || rect.left < -1 || rect.right > viewportWidth + 1);
    })
    .map((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        className: element.className?.toString().slice(0, 100) || "",
        text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) || "",
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        whiteSpace: style.whiteSpace,
        overflowX: style.overflowX,
      };
    })
    .slice(0, 12);
  return {
    viewportWidth,
    rootClientWidth: rootElement.clientWidth,
    rootScrollWidth: rootElement.scrollWidth,
    bodyClientWidth: body.clientWidth,
    bodyScrollWidth: body.scrollWidth,
    overflow: Math.max(rootElement.scrollWidth - rootElement.clientWidth, body.scrollWidth - innerWidth),
    details,
  };
};

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
      const context = await browser.newContext({
        viewport: { width: 320, height: 844 },
        locale: "ru-RU",
        reducedMotion: "no-preference",
      });
      await context.addInitScript(() => {
        localStorage.setItem("analytics_consent", "denied");
        window.__SITE_TEST_ENGAGEMENT_DELAY_MS__ = 0;
      });
      const page = await context.newPage();
      const response = await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      if (!response?.ok()) errors.push(`${engineName}: home returned ${response?.status()}`);

      const nudge = page.locator("#engagement-nudge");
      await nudge.waitFor({ state: "visible", timeout: 2_000 });
      await page.waitForFunction(() => document.querySelector("#engagement-nudge")?.classList.contains("is-visible"));

      await page.addStyleTag({ content: `
        body, body * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }
        main p { margin-bottom: 2em !important; }
      ` });
      await waitForStableLayout(page);

      const state = await page.evaluate(readOverflow);
      if (state.overflow > 1) errors.push(`${engineName}: 320px WCAG text spacing creates overflow ${JSON.stringify(state)}`);

      const controls = await nudge.locator(".engagement-nudge__actions, button").evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          className: element.className,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          width: rect.width,
          left: rect.left,
          right: rect.right,
          whiteSpace: style.whiteSpace,
        };
      }));
      if (controls.some((item) => item.scrollWidth > item.clientWidth + 1 || item.left < -1 || item.right > 321)) {
        errors.push(`${engineName}: narrow nudge controls overflow ${JSON.stringify(controls)}`);
      }

      await page.screenshot({ path: join(reports, `${engineName.toLowerCase()}-narrow-wcag.png`), fullPage: false });
      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Narrow engagement local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Narrow engagement passed: 320px WCAG text spacing without document or control overflow in Chromium and WebKit");
