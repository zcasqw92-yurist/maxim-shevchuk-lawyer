import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = join(root, "reports", "engagement-nudge");
const port = "4182";
const origin = `http://127.0.0.1:${port}`;
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const errors = [];
const skipped = [];
const centeredViewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

await mkdir(reports, { recursive: true });
const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Engagement preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Engagement preview server exited: ${code}`)));
});

const prepareContext = async (browser, viewport) => {
  const context = await browser.newContext({ viewport, locale: "ru-RU", reducedMotion: "no-preference" });
  await context.addInitScript(() => {
    localStorage.setItem("analytics_consent", "denied");
    window.__SITE_TEST_ENGAGEMENT_DELAY_MS__ = 120;
  });
  return context;
};

const readNudgeState = () => {
  const element = document.querySelector("#engagement-nudge");
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const style = getComputedStyle(element);
  return {
    sessionFlag: sessionStorage.getItem("site_engagement_nudge_shown"),
    dialogOpen: Boolean(document.querySelector("dialog[open]")),
    focusStolen: element.contains(document.activeElement),
    insideViewport: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
    horizontalCenterDelta: Math.abs(centerX - innerWidth / 2),
    verticalCenterDelta: Math.abs(centerY - innerHeight / 2),
    position: style.position,
    text: element.textContent.replace(/\s+/g, " ").trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
};

const waitForSettledNudge = (page) => page.waitForFunction(() => {
  const element = document.querySelector("#engagement-nudge.is-visible");
  if (!element || element.hidden) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return Number(style.opacity) > .99
    && Math.abs(centerX - innerWidth / 2) <= 2
    && Math.abs(centerY - innerHeight / 2) <= 2;
}, { timeout: 2_000 });

const checkCenteredNudge = async (engineName, browser, viewport) => {
  const context = await prepareContext(browser, { width: viewport.width, height: viewport.height });
  try {
    const page = await context.newPage();
    const response = await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    if (!response?.ok()) errors.push(`${engineName} ${viewport.name}: home returned ${response?.status()}`);

    const nudge = page.locator("#engagement-nudge");
    await nudge.waitFor({ state: "visible", timeout: 2_000 });
    await waitForSettledNudge(page);
    const state = await page.evaluate(readNudgeState);

    if (state.sessionFlag !== "true") errors.push(`${engineName} ${viewport.name}: session flag is not written`);
    if (state.dialogOpen) errors.push(`${engineName} ${viewport.name}: nudge opened a modal automatically`);
    if (state.focusStolen) errors.push(`${engineName} ${viewport.name}: nudge stole keyboard focus`);
    if (!state.insideViewport) errors.push(`${engineName} ${viewport.name}: nudge is outside viewport ${JSON.stringify(state)}`);
    if (state.horizontalCenterDelta > 2 || state.verticalCenterDelta > 2) {
      errors.push(`${engineName} ${viewport.name}: nudge is not centered ${JSON.stringify(state)}`);
    }
    if (state.position !== "fixed") errors.push(`${engineName} ${viewport.name}: nudge is not viewport-fixed`);
    if (!state.text.includes("Нужен ориентир по вашей ситуации?")) errors.push(`${engineName} ${viewport.name}: expected prompt title is missing`);
    if (!state.text.includes("Выбрать мессенджер")) errors.push(`${engineName} ${viewport.name}: prompt is not limited to direct messenger choice`);
    if (state.overflow > 1) errors.push(`${engineName} ${viewport.name}: nudge creates ${state.overflow}px horizontal overflow`);

    await nudge.screenshot({ path: join(reports, `${engineName.toLowerCase()}-${viewport.name}-centered-nudge.png`) });
    await page.locator(".engagement-nudge__dismiss").click();
    await page.waitForFunction(() => document.querySelector("#engagement-nudge")?.hidden === true);
  } finally {
    await context.close();
  }
};

const checkMobilePanelAndSession = async (engineName, browser) => {
  const context = await prepareContext(browser, { width: 390, height: 844 });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 760));
    await page.waitForFunction(() => document.querySelector("[data-mobile-contact]")?.classList.contains("is-visible"));

    const panelState = await page.evaluate(() => {
      const panel = document.querySelector("[data-mobile-contact]");
      const now = document.querySelector("[data-mobile-contact-now]");
      const panelRect = panel.getBoundingClientRect();
      const nowRect = now.getBoundingClientRect();
      const nowStyle = getComputedStyle(now);
      return {
        panelWidth: panelRect.width,
        nowWidth: nowRect.width,
        rightGap: innerWidth - nowRect.right,
        leftGap: nowRect.left,
        animationName: nowStyle.animationName,
        animationDuration: nowStyle.animationDuration,
        animationDelay: nowStyle.animationDelay,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        callbackCount: document.querySelectorAll("[data-mobile-contact-later], [data-callback-open]").length,
      };
    });

    if (panelState.nowWidth < 300) errors.push(`${engineName}: direct messenger CTA is not thumb-friendly ${JSON.stringify(panelState)}`);
    if (Math.abs(panelState.leftGap - panelState.rightGap) > 4) errors.push(`${engineName}: single CTA is not balanced ${JSON.stringify(panelState)}`);
    if (!panelState.animationName.includes("mobile-contact-soft-attention")) errors.push(`${engineName}: attention animation is missing ${JSON.stringify(panelState)}`);
    if (!panelState.animationDuration.includes("18s") || !panelState.animationDelay.includes("8s")) errors.push(`${engineName}: attention rhythm is incorrect ${JSON.stringify(panelState)}`);
    if (panelState.overflow > 1) errors.push(`${engineName}: mobile panel creates ${panelState.overflow}px overflow`);
    if (panelState.callbackCount) errors.push(`${engineName}: callback controls remain in public mobile UI`);

    const nudge = page.locator("#engagement-nudge");
    await nudge.waitFor({ state: "visible", timeout: 2_000 });
    await page.locator(".engagement-nudge__dismiss").click();
    await page.waitForFunction(() => document.querySelector("#engagement-nudge")?.hidden === true);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    if (await page.locator("#engagement-nudge").isVisible()) errors.push(`${engineName}: nudge reappeared in the same session after dismissal`);
  } finally {
    await context.close();
  }
};

const checkWriteAction = async (engineName, browser) => {
  const context = await prepareContext(browser, { width: 390, height: 844 });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    const nudge = page.locator("#engagement-nudge");
    await nudge.waitFor({ state: "visible", timeout: 2_000 });
    await page.locator("#engagement-nudge-write").click();
    await page.waitForFunction(() => document.querySelector("#engagement-nudge")?.hidden === true);
    await page.locator("#contact-dialog[open]").waitFor({ state: "visible" });
    if (await page.locator("form, input, select, textarea").count()) errors.push(`${engineName}: data-entry controls appeared after nudge action`);
    const links = await page.locator("#contact-dialog .messenger-choice").evaluateAll((elements) => elements.map((element) => element.href));
    if (links.length !== 2 || links.some((href) => !href.includes("text="))) errors.push(`${engineName}: direct messenger drafts are incomplete ${JSON.stringify(links)}`);
  } finally {
    await context.close();
  }
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

    const browser = await engine.launch({ headless: true, ...(engineName === "Chromium" ? { args: ["--no-sandbox"] } : {}) });
    try {
      for (const viewport of centeredViewports) await checkCenteredNudge(engineName, browser, viewport);
      await checkMobilePanelAndSession(engineName, browser);
      await checkWriteAction(engineName, browser);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Engagement nudge local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Engagement nudge passed: settled and centered on phone, tablet and desktop; one direct messenger CTA; 18-second pulse; one display per session");
