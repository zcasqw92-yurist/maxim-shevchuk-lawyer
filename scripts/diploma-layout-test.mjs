import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = join(root, "reports", "diploma-layout");
const port = "4178";
const origin = `http://127.0.0.1:${port}`;
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const errors = [];
const skipped = [];
const engines = [
  ["Chromium", chromium],
  ["WebKit", webkit],
];
const viewports = [
  ["desktop", { width: 1440, height: 1000 }],
  ["tablet", { width: 768, height: 1024 }],
  ["mobile", { width: 390, height: 844 }],
  ["mobile-narrow", { width: 320, height: 720 }],
];

await mkdir(reports, { recursive: true });

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Diploma preview server timeout")), 8000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Diploma preview server exited: ${code}`)));
});

const round = (value) => Math.round(value * 10) / 10;

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

    const browser = await engine.launch({
      headless: true,
      ...(engineName === "Chromium" ? { args: ["--no-sandbox"] } : {}),
    });

    try {
      for (const [viewportName, viewport] of viewports) {
        const context = await browser.newContext({ viewport, locale: "ru-RU" });
        await context.addInitScript(() => {
          localStorage.setItem("analytics_consent", "denied");
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(`${engineName} ${viewportName}: ${error.message}`));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(`${engineName} ${viewportName}: console ${message.text()}`);
        });

        const response = await page.goto(`${origin}/o-yuriste/`, { waitUntil: "networkidle" });
        if (!response?.ok()) errors.push(`${engineName} ${viewportName}: HTTP ${response?.status()}`);
        const imageLocator = page.locator(".section--education .diploma-card img");
        await imageLocator.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => {
          const image = document.querySelector(".section--education .diploma-card img");
          return Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
        });

        const metrics = await page.evaluate(() => {
          const section = document.querySelector(".section--education");
          const grid = section?.querySelector(".education-grid");
          const copy = section?.querySelector(".education-copy");
          const card = section?.querySelector(".diploma-card");
          const image = card?.querySelector("img");
          const rect = (element) => {
            const box = element.getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
          };
          const imageStyle = getComputedStyle(image);
          const cardStyle = getComputedStyle(card);
          const gridStyle = getComputedStyle(grid);
          return {
            viewport: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            section: rect(section),
            grid: rect(grid),
            copy: rect(copy),
            card: rect(card),
            image: rect(image),
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            objectFit: imageStyle.objectFit,
            aspectRatioStyle: imageStyle.aspectRatio,
            cardTransform: cardStyle.transform,
            gridColumns: gridStyle.gridTemplateColumns,
            facts: [...copy.querySelectorAll("dd")].map((item) => item.textContent.trim()),
          };
        });

        const label = `${engineName} ${viewportName}`;
        const renderedRatio = metrics.image.width / metrics.image.height;
        const naturalRatio = metrics.naturalWidth / metrics.naturalHeight;
        if (metrics.scrollWidth > metrics.viewport + 1) {
          errors.push(`${label}: horizontal overflow ${round(metrics.scrollWidth - metrics.viewport)}px`);
        }
        if (renderedRatio < 1.3 || renderedRatio > 1.7) {
          errors.push(`${label}: diploma is visibly distorted, rendered ratio ${round(renderedRatio)}`);
        }
        if (naturalRatio < 1.3 || naturalRatio > 1.7) {
          errors.push(`${label}: source diploma is not landscape, natural ratio ${round(naturalRatio)}`);
        }
        if (Math.abs(renderedRatio - naturalRatio) > 0.035) {
          errors.push(`${label}: rendered ratio ${round(renderedRatio)} differs from source ${round(naturalRatio)}`);
        }
        if (metrics.objectFit !== "contain") errors.push(`${label}: diploma object-fit is ${metrics.objectFit}`);
        if (metrics.cardTransform !== "none") errors.push(`${label}: diploma card remains rotated (${metrics.cardTransform})`);
        if (metrics.card.height > metrics.image.height + 80) {
          errors.push(`${label}: diploma card has excessive empty height ${JSON.stringify(metrics.card)}`);
        }
        if (!metrics.facts.some((value) => value.includes("Российский государственный университет правосудия"))
          || !metrics.facts.includes("40.03.01 «Юриспруденция»")
          || !metrics.facts.includes("Бакалавр")
          || !metrics.facts.includes("2010")) {
          errors.push(`${label}: education facts changed ${JSON.stringify(metrics.facts)}`);
        }

        if (viewport.width > 900) {
          if (metrics.card.x <= metrics.copy.x || metrics.copy.right > metrics.card.x + 2) {
            errors.push(`${label}: desktop columns overlap or are reversed ${JSON.stringify({ copy: metrics.copy, card: metrics.card })}`);
          }
          if (metrics.card.width > 651 || metrics.card.height > 560) {
            errors.push(`${label}: diploma dominates desktop section ${JSON.stringify(metrics.card)}`);
          }
          if (metrics.gridColumns.split(" ").length < 2) {
            errors.push(`${label}: education section is not two-column on desktop (${metrics.gridColumns})`);
          }
        } else {
          if (metrics.card.y < metrics.copy.bottom - 2) {
            errors.push(`${label}: diploma is not below education copy ${JSON.stringify({ copy: metrics.copy, card: metrics.card })}`);
          }
          if (metrics.card.width > metrics.viewport - 28 || metrics.card.width < Math.min(280, metrics.viewport - 30)) {
            errors.push(`${label}: mobile diploma width is unbalanced ${round(metrics.card.width)}px`);
          }
        }

        await page.addStyleTag({
          content: ".site-header,.mobile-contact,.skip-link{display:none!important}",
        });
        const sectionLocator = page.locator(".section--education");
        await sectionLocator.scrollIntoViewIfNeeded();
        await sectionLocator.screenshot({
          path: join(reports, `${engineName.toLowerCase()}-${viewportName}.png`),
        });
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Diploma layout local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Diploma layout passed: landscape proportions, balanced desktop card and stacked mobile layout in Chromium and WebKit");
