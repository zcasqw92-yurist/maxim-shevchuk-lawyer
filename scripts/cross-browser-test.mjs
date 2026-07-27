import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = "4175";
const origin = `http://127.0.0.1:${port}`;
const errors = [];
const skipped = [];
const requireAllBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const engines = [
  ["Chromium", chromium],
  ["Firefox", firefox],
  ["WebKit", webkit],
];

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Cross-browser preview server timeout")), 8000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Cross-browser preview server exited: ${code}`)));
});

const state = async (page) => page.evaluate(() => ({
  overflow: Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - innerWidth,
  ),
  bodyPosition: getComputedStyle(document.body).position,
  mainInert: document.querySelector("main")?.inert,
  activeInMenu: Boolean(document.activeElement?.closest("[data-mobile-menu]")),
  activeInDialog: Boolean(document.activeElement?.closest("dialog[open]")),
}));

const assertNoOverflow = async (page, label) => {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - innerWidth,
  ));
  if (overflow > 1) errors.push(`${label}: horizontal overflow ${overflow}px`);
};

const rejectOptionalAnalytics = async (page, engineName) => {
  const rejectButton = page.locator("[data-consent-reject]");
  if (!await rejectButton.count() || !await rejectButton.isVisible()) return;
  await rejectButton.click();
  await page.waitForFunction(() => document.querySelector("[data-consent-banner]")?.hidden === true);
  const consent = await page.evaluate(() => localStorage.getItem("analytics_consent"));
  if (consent !== "denied") errors.push(`${engineName}: analytics refusal was not saved`);
};

for (const [engineName, engine] of engines) {
  let browser;
  try {
    const executablePath = engine.executablePath();
    const installed = await access(executablePath).then(() => true).catch(() => false);
    if (!installed) {
      const message = `${engineName}: browser binary is not installed at ${executablePath}`;
      if (requireAllBrowsers) errors.push(message);
      else skipped.push(message);
      continue;
    }
    browser = await engine.launch({
      headless: true,
      ...(engineName === "Chromium" ? { args: ["--no-sandbox"] } : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      locale: "ru-RU",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${engineName}: page error: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${engineName}: console error: ${message.text()}`);
    });

    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await rejectOptionalAnalytics(page, engineName);
    await assertNoOverflow(page, `${engineName} mobile home`);
    if (await page.locator("form, input, select, textarea, [data-callback-open], [data-price-quiz-open]").count()) {
      errors.push(`${engineName}: removed form or questionnaire controls remain on mobile home`);
    }

    const menuToggle = page.locator("[data-menu-toggle]");
    const menuScrollY = await page.evaluate(() => window.scrollY);
    await menuToggle.click();
    await page.waitForFunction(() => !document.querySelector("[data-mobile-menu]")?.hidden);
    await page.waitForFunction(
      () => Boolean(document.activeElement?.closest("[data-mobile-menu]")),
      null,
      { timeout: 1500 },
    );
    const openMenu = await state(page);
    if (openMenu.bodyPosition !== "fixed" || !openMenu.mainInert || !openMenu.activeInMenu) {
      errors.push(`${engineName}: mobile menu isolation failed ${JSON.stringify(openMenu)}`);
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("[data-mobile-menu]")?.hidden);
    const closedMenu = await page.evaluate((expectedScroll) => ({
      bodyPosition: getComputedStyle(document.body).position,
      mainInert: document.querySelector("main")?.inert,
      scrollY: window.scrollY,
      focusReturned: document.activeElement === document.querySelector("[data-menu-toggle]"),
      expectedScroll,
    }), menuScrollY);
    if (closedMenu.bodyPosition === "fixed"
      || closedMenu.mainInert
      || Math.abs(closedMenu.scrollY - closedMenu.expectedScroll) > 1
      || !closedMenu.focusReturned) {
      errors.push(`${engineName}: mobile menu state was not restored ${JSON.stringify(closedMenu)}`);
    }

    const dialogTrigger = page.locator(".hero__actions [data-dialog-open]").first();
    await dialogTrigger.click();
    await page.waitForFunction(() => document.querySelector("#contact-dialog")?.open);
    const contactState = await state(page);
    if (!contactState.activeInDialog) errors.push(`${engineName}: contact dialog did not receive focus`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#contact-dialog")?.open);
    if (!await dialogTrigger.evaluate((element) => element === document.activeElement)) {
      errors.push(`${engineName}: contact dialog did not return focus`);
    }

    await page.evaluate(() => {
      window.scrollTo(0, 720);
      window.dispatchEvent(new Event("scroll"));
    });
    await page.waitForFunction(() => document.querySelector("[data-mobile-contact]")?.classList.contains("is-visible"));
    const mobilePanel = page.locator("[data-mobile-contact]");
    const buttonSizes = await mobilePanel.locator("button").evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }));
    if (buttonSizes.length !== 1 || buttonSizes.some(({ width, height }) => width < 300 || height < 44)) {
      errors.push(`${engineName}: single mobile messenger action is inaccessible ${JSON.stringify(buttonSizes)}`);
    }

    const mobileMessengerTrigger = page.locator("[data-mobile-contact-now]");
    await mobileMessengerTrigger.click();
    await page.waitForFunction(() => document.querySelector("#contact-dialog")?.open);
    const mobileContactState = await state(page);
    if (!mobileContactState.activeInDialog) errors.push(`${engineName}: mobile messenger dialog did not receive focus`);
    const messengerLinks = await page.locator("#contact-dialog .messenger-choice").evaluateAll((links) => links.map((link) => link.href));
    if (messengerLinks.length !== 2 || messengerLinks.some((href) => !href.includes("text="))) {
      errors.push(`${engineName}: mobile direct messenger drafts are incomplete ${JSON.stringify(messengerLinks)}`);
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#contact-dialog")?.open);
    if (!await mobileMessengerTrigger.evaluate((element) => element === document.activeElement)) {
      errors.push(`${engineName}: mobile messenger dialog did not return focus`);
    }

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "125%";
      window.scrollTo(0, 0);
    });
    await assertNoOverflow(page, `${engineName} mobile 125% text`);
    const scaledText = await page.locator(".hero__lead").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    if (scaledText < 18) errors.push(`${engineName}: 125% text scaling did not enlarge body copy (${scaledText}px)`);

    await page.goto(`${origin}/uslugi/dosudebnoe-uregulirovanie/`, { waitUntil: "networkidle" });
    await assertNoOverflow(page, `${engineName} mobile service`);
    if (!await page.locator("[data-official-sources]").isVisible()) errors.push(`${engineName}: official source section is hidden`);

    if (engineName === "Chromium") {
      await page.emulateMedia({ forcedColors: "active" });
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      const forcedColorCta = page.locator(".hero__actions [data-dialog-open]").first();
      if (!await forcedColorCta.isVisible()) errors.push(`${engineName}: primary CTA is hidden in forced colors`);
      await forcedColorCta.focus();
      if (!await forcedColorCta.evaluate((element) => element === document.activeElement)) {
        errors.push(`${engineName}: primary CTA cannot receive focus in forced colors`);
      }
    }

    await context.close();

    const desktop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await desktop.goto(`${origin}/`, { waitUntil: "networkidle" });
    await assertNoOverflow(desktop, `${engineName} desktop home`);
    const primaryRect = await desktop.locator(".hero__actions [data-dialog-open]").first().boundingBox();
    if (!primaryRect || primaryRect.y < 0 || primaryRect.y + primaryRect.height > 768) {
      errors.push(`${engineName}: primary desktop CTA is outside the first viewport ${JSON.stringify(primaryRect)}`);
    }
    await desktop.close();

    if (engineName === "Chromium") {
      const vitalEvents = [];
      const vitalsContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await vitalsContext.exposeBinding("__recordWebVital", (_source, params) => {
        vitalEvents.push(params);
      });
      await vitalsContext.addInitScript(() => {
        window.__bfcacheRestored = false;
        addEventListener("pageshow", (event) => {
          window.__bfcacheRestored = event.persisted;
        });
        window.gtag = (_command, _eventName, params) => window.__recordWebVital(params);
      });
      const vitalsPage = await vitalsContext.newPage();
      await vitalsPage.goto(`${origin}/`, { waitUntil: "networkidle" });
      await vitalsPage.evaluate(() => {
        dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      });
      await vitalsPage.waitForFunction(() => window.__bfcacheRestored === true);
      await vitalsPage.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }));
      await vitalsPage.goto(`${origin}/kontakty/`, { waitUntil: "networkidle" });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const zeroCls = vitalEvents.some((metric) => metric?.metric_name === "CLS" && metric.metric_value === 0);
      const bfcacheMetric = vitalEvents.some((metric) => metric?.navigation_type === "back-forward-cache");
      if (!zeroCls) errors.push("Chromium: zero CLS was not reported when the page became hidden");
      if (!bfcacheMetric) errors.push("Chromium: synthetic bfcache restore did not produce a Web Vital event");
      await vitalsContext.close();
    }
  } catch (error) {
    errors.push(`${engineName}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await browser?.close();
  }
}

server.kill("SIGTERM");

for (const message of skipped) console.warn(`Cross-browser local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

const completed = engines.length - skipped.length;
console.log(`Cross-browser smoke passed for ${completed}/${engines.length} installed engines: one direct mobile messenger CTA, no forms, focus and overflow contracts`);
