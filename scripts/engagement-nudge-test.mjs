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

const checkMobileScenario = async (engineName, browser) => {
  const context = await prepareContext(browser, { width: 390, height: 844 });
  try {
    const page = await context.newPage();
    const response = await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    if (!response?.ok()) errors.push(`${engineName}: home returned ${response?.status()}`);

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
    if (Math.abs(panelState.leftGap - panelState.rightGap) > 4) errors.push(`${engineName}: single CTA is not balanced across mobile width ${JSON.stringify(panelState)}`);
    if (!panelState.animationName.includes("mobile-contact-soft-attention")) errors.push(`${engineName}: attention animation is missing ${JSON.stringify(panelState)}`);
    if (!panelState.animationDuration.includes("18s") || !panelState.animationDelay.includes("8s")) errors.push(`${engineName}: attention rhythm is incorrect ${JSON.stringify(panelState)}`);
    if (panelState.overflow > 1) errors.push(`${engineName}: mobile panel creates ${panelState.overflow}px overflow`);
    if (panelState.callbackCount) errors.push(`${engineName}: callback controls remain in public mobile UI`);

    const nudge = page.locator("#engagement-nudge");
    await nudge.waitFor({ state: "visible", timeout: 2_000 });
    const nudgeState = await page.evaluate(() => {
      const element = document.querySelector("#engagement-nudge");
      const rect = element.getBoundingClientRect();
      return {
        sessionFlag: sessionStorage.getItem("site_engagement_nudge_shown"),
        dialogOpen: Boolean(document.querySelector("dialog[open]")),
        focusStolen: element.contains(document.activeElement),
        insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        text: element.textContent.replace(/\s+/g, " ").trim(),
      };
    });
    if (nudgeState.sessionFlag !== "true") errors.push(`${engineName}: session flag is not written when the nudge appears`);
    if (nudgeState.dialogOpen) errors.push(`${engineName}: delayed nudge must not open a modal automatically`);
    if (nudgeState.focusStolen) errors.push(`${engineName}: delayed nudge steals keyboard focus`);
    if (!nudgeState.insideViewport) errors.push(`${engineName}: delayed nudge is outside mobile viewport ${JSON.stringify(nudgeState)}`);
    if (!nudgeState.text.includes("Выбрать мессенджер")) errors.push(`${engineName}: delayed nudge is not limited to direct messenger choice`);
    await nudge.screenshot({ path: join(reports, `${engineName.toLowerCase()}-mobile-nudge.png`) });

    await page.locator(".engagement-nudge__dismiss").click();
    await page.waitForFunction(() => document.querySelector("#engagement-nudge")?.hidden === true);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    if (await page.locator("#engagement-nudge").isVisible()) errors.push(`${engineName}: nudge reappeared in the same session after dismissal`);
    await page.close();
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
    await page.close();
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
      await checkMobileScenario(engineName, browser);
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

console.log("Engagement nudge passed: one direct messenger CTA, 18-second pulse, 60-second prompt and one display per session");
