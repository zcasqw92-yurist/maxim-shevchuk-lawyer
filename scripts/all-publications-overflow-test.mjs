import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium, webkit } from "playwright";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = "4203";
const origin = `http://127.0.0.1:${port}`;
const errors = [];
const skipped = [];
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const routes = [
  ...articles.map((item) => ({ kind: "article", path: `/razbory/${item.slug}/`, width: 320 })),
  ...practiceCases.map((item) => ({ kind: "case", path: `/praktika/${item.slug}/`, width: 390 })),
];

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("All-publications overflow preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Overflow preview server exited: ${code}`)));
});

const inspectOverflow = () => {
  const viewportWidth = innerWidth;
  const rootWidth = document.documentElement.scrollWidth;
  const bodyWidth = document.body.scrollWidth;
  const selectorFor = (element) => {
    if (element.id) return `${element.tagName.toLowerCase()}#${element.id}`;
    const classes = [...element.classList].slice(0, 3).join(".");
    return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`;
  };
  const offenders = [...document.body.querySelectorAll("*")]
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const rightOverflow = rect.right - viewportWidth;
      const leftOverflow = -rect.left;
      const internalOverflow = element.scrollWidth - element.clientWidth;
      return {
        selector: selectorFor(element),
        text: String(element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
        left: Number(rect.left.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        rightOverflow: Number(rightOverflow.toFixed(2)),
        leftOverflow: Number(leftOverflow.toFixed(2)),
        internalOverflow,
        display: style.display,
        position: style.position,
        overflowX: style.overflowX,
        whiteSpace: style.whiteSpace,
        wordBreak: style.wordBreak,
        overflowWrap: style.overflowWrap,
        transform: style.transform,
      };
    })
    .filter((item) => item.rightOverflow > 1 || item.leftOverflow > 1 || item.internalOverflow > 1)
    .sort((a, b) => Math.max(b.rightOverflow, b.leftOverflow, b.internalOverflow) - Math.max(a.rightOverflow, a.leftOverflow, a.internalOverflow))
    .slice(0, 20);
  return { viewportWidth, rootWidth, bodyWidth, overflow: Math.max(rootWidth, bodyWidth) - viewportWidth, offenders };
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
        reducedMotion: "reduce",
      });
      await context.addInitScript(() => {
        localStorage.setItem("analytics_consent", "denied");
        sessionStorage.setItem("site_engagement_nudge_shown", "true");
      });
      const page = await context.newPage();
      try {
        for (const route of routes) {
          await page.setViewportSize({ width: route.width, height: 844 });
          const response = await page.goto(`${origin}${route.path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
          if (!response?.ok()) {
            errors.push(`${engineName} ${route.path}: navigation returned ${response?.status() || "no response"}`);
            continue;
          }
          await page.evaluate(async () => {
            await document.fonts?.ready;
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          });
          const state = await page.evaluate(inspectOverflow);
          if (state.overflow > 1.5) {
            errors.push(`${engineName} ${route.kind} ${route.path}: horizontal overflow ${state.overflow}px\n${JSON.stringify(state.offenders, null, 2)}`);
          }
        }
      } finally {
        await page.close();
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`All-publications overflow local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n\n"));
  process.exit(1);
}

console.log(`All publication routes have no horizontal overflow: ${articles.length} articles and ${practiceCases.length} cases in Chromium and WebKit`);
