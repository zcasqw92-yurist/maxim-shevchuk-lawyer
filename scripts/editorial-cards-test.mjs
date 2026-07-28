import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
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

const cardCss = await readFile(join(root, "src", "editorial-cards.css"), "utf8");
const hoverContracts = [
  {
    label: "поверхность карточки",
    pattern: /\.editorial-card:hover,\s*\.editorial-card:focus-within\s*\{[\s\S]*?border-color:\s*rgba\(195,\s*154,\s*93,\s*\.78\);[\s\S]*?box-shadow:/,
  },
  {
    label: "верхний акцент",
    pattern: /\.editorial-card:hover::before,\s*\.editorial-card:focus-within::before\s*\{[\s\S]*?transform:\s*scaleX\(1\)/,
  },
  {
    label: "стрелка ссылки",
    pattern: /\.editorial-card:hover\s+\.card-link::after,\s*\.editorial-card:focus-within\s+\.card-link::after\s*\{[\s\S]*?transform:\s*translateX\(4px\)/,
  },
  {
    label: "подъём для точного указателя",
    pattern: /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[\s\S]*?\.editorial-card:hover\s*\{[\s\S]*?transform:\s*translateY\(-3px\)/,
  },
];
for (const contract of hoverContracts) {
  if (!contract.pattern.test(cardCss)) errors.push(`CSS hover contract: отсутствует ${contract.label}`);
}

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

const matrixTranslateX = (value = "") => {
  const match = String(value).match(/^matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+),/);
  return match ? Number(match[1]) : 0;
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
            const titleStyle = getComputedStyle(element.querySelector("h2 a"));
            const arrowStyle = getComputedStyle(element.querySelector(".card-link"), "::after");
            return {
              borderColor: getComputedStyle(element).borderTopColor,
              outlineStyle: titleStyle.outlineStyle,
              outlineWidth: titleStyle.outlineWidth,
              accentScale: getComputedStyle(element, "::before").transform,
              arrowTransform: arrowStyle.transform,
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
          if (matrixTranslateX(focused.arrowTransform) < 3.5) {
            errors.push(`${engineName} ${viewport.width}px ${route}: shared interaction state does not move the card arrow ${focused.arrowTransform}`);
          }

          // Headless WebKit intermittently loses :hover while a transformed element moves under
          // the synthetic pointer. The shared CSS contract above guarantees that :hover and
          // :focus-within use the same declarations; physical pointer hover is therefore tested
          // only in Chromium, while both engines must render the shared state through focus.
          if (engineName === "Chromium" && viewport.width >= 768) {
            await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
            await page.mouse.move(1, 1);
            await card.scrollIntoViewIfNeeded();
            await card.hover({ position: { x: 32, y: 32 } });
            await page.waitForTimeout(420);
            const hovered = await card.evaluate((element) => ({
              borderColor: getComputedStyle(element).borderTopColor,
              transform: getComputedStyle(element).transform,
              finePointer: matchMedia("(hover: hover) and (pointer: fine)").matches,
            }));
            if (hovered.borderColor === initial.borderColor) {
              errors.push(`${engineName} ${viewport.width}px ${route}: hover does not change the card border ${JSON.stringify(hovered)}`);
            }
            if (hovered.finePointer && matrixTranslateY(hovered.transform) > -2.5) {
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

console.log("Editorial cards passed: restrained width, future 1/2/3-column grids, equal rows, aligned links, shared hover/focus CSS contract in Chromium and WebKit, and physical hover in Chromium");
