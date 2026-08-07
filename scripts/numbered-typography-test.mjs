import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium, webkit } from "playwright";
import { services } from "../src/data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const skipped = [];
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const port = "4197";
const origin = `http://127.0.0.1:${port}`;
const serviceRoute = `/uslugi/${services[0].slug}/`;
const viewports = [
  { width: 390, height: 844 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
];

const routes = [
  {
    route: "/",
    indexChecks: [
      [".trust-strip__item > span", 13],
      [".contact-path__steps > li > span", 15],
      [".situation-card__index", 14],
      [".service-card__number", 14],
      [".value-editorial__list > li > span", 16],
      [".position-steps > li > span", 16, true],
      [".value-card > span", 16, true],
    ],
    copyChecks: [
      [".trust-strip__item strong", 14],
      [".trust-strip__item small", 12],
      [".contact-path__steps p", 14],
      [".situation-card small", 14],
      [".value-editorial__list p", 14],
    ],
  },
  {
    route: "/uslugi/",
    indexChecks: [
      [".process-guarantee > span", 15],
      [".service-card__number", 14],
    ],
    copyChecks: [
      [".process-guarantee p", 15],
      [".service-card p", 14],
    ],
  },
  {
    route: serviceRoute,
    indexChecks: [
      [".process-guarantee > span", 15],
      [".process-line > li > span", 15],
      [".service-card__number", 14],
    ],
    copyChecks: [
      [".process-guarantee p", 15],
      [".process-line p", 15],
      [".service-card p", 14],
    ],
  },
  {
    route: "/o-yuriste/",
    indexChecks: [[".process-cards > li > span", 15]],
    copyChecks: [[".process-cards p", 14]],
  },
];

const normalizeFamily = (value = "") => String(value)
  .toLowerCase()
  .replace(/["']/g, "")
  .replace(/\s+/g, "");

const inspectGroup = async ({ page, selector }) => page.locator(selector).evaluateAll((elements) => elements.map((element) => {
  const style = getComputedStyle(element);
  return {
    text: element.textContent.trim(),
    fontSize: Number.parseFloat(style.fontSize),
    fontFamily: style.fontFamily,
    fontWeight: Number.parseInt(style.fontWeight, 10),
    letterSpacing: style.letterSpacing === "normal" ? 0 : Number.parseFloat(style.letterSpacing),
    fontVariantNumeric: style.fontVariantNumeric,
    lineHeight: style.lineHeight,
  };
}));

const isTransientBrowserClosure = (error) => /(?:target page, context or browser has been closed|browser has been closed|browser closed|target closed|browser has disconnected)/i
  .test(String(error?.message || error));

const runEngineChecks = async ({ engineName, engine }) => {
  const browser = await engine.launch({
    headless: true,
    ...(engineName === "Chromium" ? { args: ["--no-sandbox"] } : {}),
  });

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, locale: "ru-RU" });
      try {
        await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
        const page = await context.newPage();

        for (const { route, indexChecks, copyChecks } of routes) {
          const response = await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
          if (!response?.ok()) {
            errors.push(`${engineName} ${viewport.width}px ${route}: status ${response?.status()}`);
            continue;
          }

          const sansToken = normalizeFamily(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--sans"))).split(",")[0];

          for (const [selector, desktopSize, optional = false] of indexChecks) {
            const count = await page.locator(selector).count();
            if (!count) {
              if (!optional) errors.push(`${engineName} ${viewport.width}px ${route}: missing numbered target ${selector}`);
              continue;
            }

            const values = await inspectGroup({ page, selector });
            for (const value of values) {
              if (!/^\d{2}$/.test(value.text)) errors.push(`${engineName} ${viewport.width}px ${route} ${selector}: unexpected label «${value.text}»`);
              if (!normalizeFamily(value.fontFamily).includes(sansToken)) errors.push(`${engineName} ${viewport.width}px ${route} ${selector}: index uses ${value.fontFamily}, expected sans token`);
              if (value.fontWeight < 650) errors.push(`${engineName} ${viewport.width}px ${route} ${selector}: index weight ${value.fontWeight} is too light`);
              if (value.letterSpacing < .5) errors.push(`${engineName} ${viewport.width}px ${route} ${selector}: letter spacing ${value.letterSpacing}px is not deliberate`);
              if (!value.fontVariantNumeric.includes("tabular-nums")) errors.push(`${engineName} ${viewport.width}px ${route} ${selector}: tabular numerals are disabled (${value.fontVariantNumeric})`);
              if (viewport.width >= 1024 && Math.abs(value.fontSize - desktopSize) > .6) {
                errors.push(`${engineName} ${viewport.width}px ${route} ${selector}: ${value.fontSize}px, expected ${desktopSize}px tier`);
              }
              if (viewport.width < 1024 && value.fontSize < 12) errors.push(`${engineName} ${viewport.width}px ${route} ${selector}: mobile index is only ${value.fontSize}px`);
            }

            const uniqueSizes = [...new Set(values.map((value) => value.fontSize.toFixed(2)))];
            if (uniqueSizes.length !== 1) errors.push(`${engineName} ${viewport.width}px ${route} ${selector}: inconsistent sizes ${uniqueSizes.join(", ")}`);
          }

          for (const [selector, desktopMin, optional = false] of copyChecks) {
            const count = await page.locator(selector).count();
            if (!count) {
              if (!optional) errors.push(`${engineName} ${viewport.width}px ${route}: missing supporting copy ${selector}`);
              continue;
            }
            const values = await inspectGroup({ page, selector });
            const minimum = viewport.width >= 1024 ? desktopMin - .25 : 12;
            for (const value of values) {
              if (value.fontSize < minimum) errors.push(`${engineName} ${viewport.width}px ${route} ${selector}: supporting copy is only ${value.fontSize}px, minimum ${minimum}px`);
            }
          }

          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow > 1) errors.push(`${engineName} ${viewport.width}px ${route}: ${overflow}px horizontal overflow after typography update`);
        }
      } finally {
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
};

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Numbered typography preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Numbered typography preview server exited: ${code}`)));
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

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await runEngineChecks({ engineName, engine });
        break;
      } catch (error) {
        if (attempt === 1 && isTransientBrowserClosure(error)) {
          console.warn(`${engineName}: browser process closed unexpectedly; retrying the typography check once with a fresh browser`);
          continue;
        }
        throw error;
      }
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Numbered typography local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Numbered typography passed: consistent sans-serif indices, intentional desktop tiers and readable supporting copy in Chromium and WebKit");
