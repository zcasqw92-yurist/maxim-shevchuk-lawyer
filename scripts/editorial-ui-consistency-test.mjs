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
const articleIndexRoute = "/razbory/";
const practiceIndexRoute = "/praktika/";
const articleRoute = `/razbory/${articles[0].slug}/`;
const caseRoute = `/praktika/${practiceCases[0].slug}/`;
const port = "4192";
const origin = `http://127.0.0.1:${port}`;
const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
];

const normalizeFontFamily = (value = "") => String(value)
  .toLowerCase()
  .replace(/["']/g, "")
  .replace(/\s+/g, "");

const firstFontFamily = (value = "") => normalizeFontFamily(value).split(",")[0];

const assertTypography = async ({ page, engineName, viewport, route, checks }) => {
  const response = await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
  if (!response?.ok()) {
    errors.push(`${engineName} ${viewport.width}px ${route}: status ${response?.status()}`);
    return;
  }

  const tokens = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      serif: rootStyle.getPropertyValue("--serif").trim(),
      sans: rootStyle.getPropertyValue("--sans").trim(),
    };
  });

  for (const check of checks) {
    const locator = page.locator(check.selector).first();
    if (!(await locator.count())) {
      if (!check.optional) errors.push(`${engineName} ${viewport.width}px ${route}: missing typography target ${check.selector}`);
      continue;
    }

    const style = await locator.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        fontFamily: computed.fontFamily,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight,
      };
    });
    const expectedFamily = firstFontFamily(tokens[check.family]);
    if (!normalizeFontFamily(style.fontFamily).includes(expectedFamily)) {
      errors.push(`${engineName} ${viewport.width}px ${route} ${check.selector}: expected ${check.family} token, got ${style.fontFamily}`);
    }
    if (check.weight && Number.parseInt(style.fontWeight, 10) !== check.weight) {
      errors.push(`${engineName} ${viewport.width}px ${route} ${check.selector}: expected weight ${check.weight}, got ${style.fontWeight}`);
    }
    if (!Number.isFinite(Number.parseFloat(style.lineHeight)) || Number.parseFloat(style.lineHeight) <= 0) {
      errors.push(`${engineName} ${viewport.width}px ${route} ${check.selector}: invalid line-height ${style.lineHeight}`);
    }
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) errors.push(`${engineName} ${viewport.width}px ${route}: ${overflow}px horizontal overflow after typography rules`);
};

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
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport, locale: "ru-RU" });
        await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
        const page = await context.newPage();

        for (const route of [articleRoute, caseRoute]) {
          const response = await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
          if (!response?.ok()) errors.push(`${engineName} ${viewport.width}px ${route}: status ${response?.status()}`);

          const isCase = route === caseRoute;
          const markerSelector = isCase ? ".editorial-list--dot li" : ".editorial-checklist li";
          const marker = await page.locator(markerSelector).first().evaluate((element) => {
            const itemStyle = getComputedStyle(element);
            const markerStyle = getComputedStyle(element, "::before");
            return {
              content: markerStyle.content,
              color: markerStyle.color,
              itemColor: itemStyle.color,
              borderStyle: markerStyle.borderStyle,
              borderWidth: markerStyle.borderWidth,
              width: markerStyle.width,
              height: markerStyle.height,
            };
          });

          if (isCase) {
            if (!marker.content.includes("•")) errors.push(`${engineName} ${viewport.width}px ${route}: neutral conclusion marker is not a dot ${JSON.stringify(marker)}`);
            if (marker.color !== marker.itemColor) errors.push(`${engineName} ${viewport.width}px ${route}: neutral dot color ${marker.color} differs from text ${marker.itemColor}`);
          } else {
            if (!marker.content.includes("✓")) errors.push(`${engineName} ${viewport.width}px ${route}: positive-action marker is not a check ${JSON.stringify(marker)}`);
          }
          if (marker.borderStyle !== "none" || marker.borderWidth !== "0px") errors.push(`${engineName} ${viewport.width}px ${route}: marker border remains ${JSON.stringify(marker)}`);
          if (marker.width === "10px" && marker.height === "10px") errors.push(`${engineName} ${viewport.width}px ${route}: legacy square marker remains`);

          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow > 1) errors.push(`${engineName} ${viewport.width}px ${route}: ${overflow}px horizontal overflow`);
        }

        await page.goto(`${origin}/`, { waitUntil: "networkidle" });
        const globalDetails = page.locator(".faq-list .faq-item").first();
        const globalSummary = globalDetails.locator("summary");
        const globalToggle = globalSummary.locator(".faq-item__toggle");
        if (!(await globalToggle.isVisible())) errors.push(`${engineName} ${viewport.width}px: brand FAQ control is not visible on home page`);
        const globalControl = await globalToggle.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            width: style.width,
            height: style.height,
            borderStyle: style.borderStyle,
            borderTopWidth: style.borderTopWidth,
            borderRadius: style.borderRadius,
            borderColor: style.borderTopColor,
          };
        });
        const expectedGold = await page.evaluate(() => {
          const token = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim();
          const sample = document.createElement("span");
          sample.style.color = token;
          document.body.append(sample);
          const normalized = getComputedStyle(sample).color;
          sample.remove();
          return normalized;
        });
        if (viewport.width >= 1000) await globalDetails.hover();
        else await globalSummary.focus();
        const globalActiveBorder = await globalToggle.evaluate((element) => getComputedStyle(element).borderTopColor);
        if (globalActiveBorder !== expectedGold) errors.push(`${engineName} ${viewport.width}px: home FAQ hover/focus border is ${globalActiveBorder}, expected ${expectedGold}`);
        if (globalActiveBorder === globalControl.borderColor) errors.push(`${engineName} ${viewport.width}px: home FAQ hover/focus does not change the control border`);

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
            borderColor: style.borderTopColor,
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
        if (viewport.width >= 1000) await details.hover();
        else await summary.focus();
        const editorialActiveBorder = await summary.evaluate((element) => getComputedStyle(element, "::after").borderTopColor);
        if (editorialActiveBorder !== expectedGold) errors.push(`${engineName} ${viewport.width}px: editorial FAQ hover/focus border is ${editorialActiveBorder}, expected ${expectedGold}`);
        if (editorialActiveBorder === openedControl.borderColor) errors.push(`${engineName} ${viewport.width}px: editorial FAQ hover/focus does not change the control border`);

        await summary.click();
        if (await details.getAttribute("open") !== null) errors.push(`${engineName} ${viewport.width}px: FAQ did not close after summary click`);
        const closedBackground = await summary.evaluate((element) => getComputedStyle(element, "::after").backgroundImage);
        if (closedBackground === openedControl.backgroundImage) errors.push(`${engineName} ${viewport.width}px: FAQ chevron did not change direction after closing`);

        await summary.click();
        if (await details.getAttribute("open") === null) errors.push(`${engineName} ${viewport.width}px: FAQ did not reopen after summary click`);
        const reopenedBackground = await summary.evaluate((element) => getComputedStyle(element, "::after").backgroundImage);
        if (reopenedBackground !== openedControl.backgroundImage) errors.push(`${engineName} ${viewport.width}px: FAQ chevron did not restore upward direction after reopening`);

        const typographyRoutes = [
          {
            route: articleIndexRoute,
            checks: [
              { selector: ".editorial-index-hero h1", family: "serif", weight: 500 },
              { selector: ".editorial-card h2", family: "serif", weight: 500 },
              { selector: ".editorial-card > p", family: "sans" },
            ],
          },
          {
            route: practiceIndexRoute,
            checks: [
              { selector: ".editorial-index-hero h1", family: "serif", weight: 500 },
              { selector: ".editorial-card h2", family: "serif", weight: 500 },
              { selector: ".editorial-card__status", family: "sans" },
            ],
          },
          {
            route: articleRoute,
            checks: [
              { selector: ".editorial-article__header h1", family: "serif", weight: 500 },
              { selector: ".article-section h2", family: "serif", weight: 500 },
              { selector: ".article-section h3", family: "serif", weight: 500, optional: true },
              { selector: ".editorial-lead", family: "sans" },
              { selector: "#faq summary", family: "serif", weight: 500 },
            ],
          },
          {
            route: caseRoute,
            checks: [
              { selector: ".editorial-article__header h1", family: "serif", weight: 500 },
              { selector: ".article-section h2", family: "serif", weight: 500 },
              { selector: ".editorial-list--dot li", family: "sans" },
              { selector: ".editorial-author strong", family: "serif", weight: 500 },
            ],
          },
        ];

        for (const typographyRoute of typographyRoutes) {
          await assertTypography({ page, engineName, viewport, ...typographyRoute });
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

for (const message of skipped) console.warn(`Editorial UI local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Editorial UI consistency passed: semantic list markers, FAQ interactions and branded typography in Chromium and WebKit");