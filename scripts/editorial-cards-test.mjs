import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = "4197";
const origin = `http://127.0.0.1:${port}`;
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const errors = [];
const skipped = [];
const routes = ["/razbory/", "/praktika/"];
const viewports = [
  { width: 320, height: 844 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
];

if (!articles.length || !practiceCases.length) throw new Error("Для проверки карточек нужна хотя бы одна статья и один кейс");

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Editorial cards preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Editorial cards preview server exited: ${code}`)));
});

const waitForLayout = (page) => page.evaluate(async () => {
  await document.fonts?.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

const matrixScaleX = (value = "") => {
  const match = String(value).match(/^matrix\(([-\d.]+)/);
  return match ? Number(match[1]) : value === "none" ? 0 : Number.NaN;
};

const matrixTranslateY = (value = "") => {
  const match = String(value).match(/^matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+)\)$/);
  return match ? Number(match[1]) : 0;
};

const normalizeRows = (cards) => {
  const rows = [];
  for (const card of cards) {
    let row = rows.find((item) => item.top === card.top);
    if (!row) {
      row = { top: card.top, cards: [] };
      rows.push(row);
    }
    row.cards.push(card);
  }
  return rows.sort((a, b) => a.top - b.top);
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
      for (const viewport of viewports) {
        for (const route of routes) {
          const context = await browser.newContext({ viewport, locale: "ru-RU", reducedMotion: "no-preference" });
          await context.addInitScript(() => {
            localStorage.setItem("analytics_consent", "denied");
            sessionStorage.setItem("site_engagement_nudge_shown", "true");
          });
          const page = await context.newPage();
          const response = await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
          if (!response?.ok()) errors.push(`${engineName} ${viewport.width}px ${route}: status ${response?.status()}`);
          await waitForLayout(page);

          const grid = page.locator(".editorial-grid");
          const card = grid.locator(".editorial-card").first();
          if (!(await grid.isVisible()) || !(await card.isVisible())) {
            errors.push(`${engineName} ${viewport.width}px ${route}: editorial grid or card is not visible`);
            await context.close();
            continue;
          }

          const initial = await card.evaluate((element) => {
            const gridElement = element.closest(".editorial-grid");
            const link = element.querySelector(".card-link");
            const cardRect = element.getBoundingClientRect();
            const gridRect = gridElement.getBoundingClientRect();
            const linkRect = link.getBoundingClientRect();
            const style = getComputedStyle(element);
            const linkAfter = getComputedStyle(link, "::after");
            return {
              gridDisplay: getComputedStyle(gridElement).display,
              cardWidth: cardRect.width,
              cardHeight: cardRect.height,
              gridWidth: gridRect.width,
              borderColor: style.borderTopColor,
              background: style.backgroundColor,
              linkHeight: linkRect.height,
              linkAfter: linkAfter.content,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
          });

          if (initial.gridDisplay !== "grid") errors.push(`${engineName} ${viewport.width}px ${route}: editorial list is not a grid`);
          if (initial.cardHeight < 240) errors.push(`${engineName} ${viewport.width}px ${route}: card is unexpectedly short ${initial.cardHeight}`);
          if (initial.linkHeight < 44) errors.push(`${engineName} ${viewport.width}px ${route}: card link target is below 44px ${initial.linkHeight}`);
          if (!initial.linkAfter.includes("→")) errors.push(`${engineName} ${viewport.width}px ${route}: directional card affordance is missing ${initial.linkAfter}`);
          if (initial.overflow > 1) errors.push(`${engineName} ${viewport.width}px ${route}: ${initial.overflow}px horizontal overflow`);
          if (viewport.width >= 1024 && initial.cardWidth > 762) {
            errors.push(`${engineName} ${viewport.width}px ${route}: a single publication card stretches to ${initial.cardWidth}px`);
          }

          const titleLink = card.locator("h2 a");
          await titleLink.focus();
          await page.waitForTimeout(360);
          const focused = await card.evaluate((element) => {
            const linkStyle = getComputedStyle(element.querySelector("h2 a"));
            return {
              borderColor: getComputedStyle(element).borderTopColor,
              outlineStyle: linkStyle.outlineStyle,
              outlineWidth: linkStyle.outlineWidth,
              accentScale: getComputedStyle(element, "::before").transform,
            };
          });
          if (focused.borderColor === initial.borderColor) {
            errors.push(`${engineName} ${viewport.width}px ${route}: focus does not change the card border ${JSON.stringify(focused)}`);
          }
          if (focused.outlineStyle === "none" || Number.parseFloat(focused.outlineWidth) < 1) {
            errors.push(`${engineName} ${viewport.width}px ${route}: title link focus ring is missing ${JSON.stringify(focused)}`);
          }
          if (matrixScaleX(focused.accentScale) < .95) {
            errors.push(`${engineName} ${viewport.width}px ${route}: focus does not reveal the card accent ${focused.accentScale}`);
          }

          if (viewport.width >= 768) {
            const finePointer = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
            await card.hover();
            await page.waitForTimeout(360);
            const hovered = await card.evaluate((element) => ({
              borderColor: getComputedStyle(element).borderTopColor,
              transform: getComputedStyle(element).transform,
            }));
            if (hovered.borderColor === initial.borderColor) {
              errors.push(`${engineName} ${viewport.width}px ${route}: hover does not change the card border ${JSON.stringify(hovered)}`);
            }
            if (finePointer && matrixTranslateY(hovered.transform) > -2.5) {
              errors.push(`${engineName} ${viewport.width}px ${route}: fine-pointer card hover has no completed lift ${hovered.transform}`);
            }
          }

          await page.mouse.move(1, 1);
          await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
          await page.evaluate(() => {
            const gridElement = document.querySelector(".editorial-grid");
            const source = gridElement.querySelector(".editorial-card");
            const variants = [
              { title: "Короткий разбор", summary: "Краткое описание ситуации." },
              { title: "Разбор с более длинным заголовком для проверки единой высоты карточек", summary: "Описание средней длины, которое занимает несколько строк и проверяет вертикальное выравнивание элементов." },
              { title: "Практический материал", summary: "Подробное описание с дополнительными обстоятельствами, документами, этапами работы и текущим процессуальным статусом, чтобы карточки оставались ровными при разном объёме текста." },
            ];
            gridElement.replaceChildren(...variants.map((variant, index) => {
              const clone = source.cloneNode(true);
              const title = clone.querySelector("h2 a");
              const summary = clone.querySelector(":scope > p");
              title.textContent = variant.title;
              title.href = `${location.pathname}#fixture-${index + 1}`;
              if (summary) summary.textContent = variant.summary;
              return clone;
            }));
          });
          await page.mouse.move(1, 1);
          await page.waitForTimeout(260);
          await waitForLayout(page);

          const synthetic = await grid.locator(".editorial-card").evaluateAll((elements) => elements.map((element) => {
            const link = element.querySelector(".card-link");
            return {
              top: element.offsetTop,
              left: element.offsetLeft,
              width: element.offsetWidth,
              height: element.offsetHeight,
              linkBottom: link.offsetTop + link.offsetHeight,
            };
          }));
          const rows = normalizeRows(synthetic);
          const expectedFirstRow = viewport.width <= 480 ? 1 : viewport.width < 1000 ? 2 : 3;
          if (rows[0]?.cards.length !== expectedFirstRow) {
            errors.push(`${engineName} ${viewport.width}px ${route}: expected ${expectedFirstRow} cards in first row, got ${rows[0]?.cards.length || 0} ${JSON.stringify(synthetic)}`);
          }
          for (const row of rows) {
            if (row.cards.length < 2) continue;
            const heights = row.cards.map((item) => item.height);
            const linkBottoms = row.cards.map((item) => item.linkBottom);
            if (Math.max(...heights) - Math.min(...heights) > 1) {
              errors.push(`${engineName} ${viewport.width}px ${route}: cards in one row have unequal heights ${JSON.stringify(row.cards)}`);
            }
            if (Math.max(...linkBottoms) - Math.min(...linkBottoms) > 1) {
              errors.push(`${engineName} ${viewport.width}px ${route}: card links are not aligned ${JSON.stringify(row.cards)}`);
            }
          }

          const syntheticOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (syntheticOverflow > 1) errors.push(`${engineName} ${viewport.width}px ${route}: synthetic publication grid creates ${syntheticOverflow}px overflow`);

          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Editorial cards local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Editorial cards passed: restrained single-card width, future 1/2/3-column grids, equal row heights, aligned links and unified hover/focus in Chromium and WebKit");
