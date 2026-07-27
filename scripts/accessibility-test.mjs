import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const port = "4178";
const origin = `http://127.0.0.1:${port}`;
const routes = [
  "/",
  "/uslugi/",
  "/uslugi/dosudebnoe-uregulirovanie/",
  "/uslugi/vozvrat-deneg/",
  "/uslugi/zhaloby-i-obrashcheniya/",
  "/uslugi/iskovoe-zayavlenie/",
  "/uslugi/spory-biznesa/",
  "/uslugi/marketpleysy/",
  "/o-yuriste/",
  "/kontakty/",
  "/politika-konfidencialnosti/",
];
const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: "mobile-320", viewport: { width: 320, height: 760 }, isMobile: true, hasTouch: true },
];
const failures = [];

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Accessibility preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Accessibility preview server exited: ${code}`)));
});

const runAxe = async (page, label) => {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: "rule", values: ["color-contrast"] },
    resultTypes: ["violations"],
  }));
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      failures.push(`${label}: ${violation.id} · ${node.target.join(" ")} · ${node.failureSummary?.replace(/\s+/g, " ").trim() || violation.help}`);
    }
  }
};

const auditLayout = async (page, label, mobile) => {
  const result = await page.evaluate(({ mobile }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const problems = [];
    const selectors = mobile
      ? "main p, main li, main dd, main button, main a, dialog p, dialog button, dialog a, .mobile-contact button, .engagement-nudge p, .engagement-nudge button, .site-footer p, .site-footer a, .consent-banner p, .consent-banner a"
      : "main p, main li, main dd, dialog p, .site-footer p, .consent-banner p";
    for (const element of document.querySelectorAll(selectors)) {
      if (!visible(element)) continue;
      const text = element.textContent.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const size = Number.parseFloat(getComputedStyle(element).fontSize);
      const noteLike = element.matches("small, figcaption, dt, [class*='__note'], [class*='__privacy'], [class*='__status'], [class*='__meta']");
      const minimum = mobile ? (noteLike ? 14 : 16) : 12;
      if (size + .01 < minimum) problems.push(`${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 2).join(".")}: ${size}px < ${minimum}px · ${text.slice(0, 70)}`);
    }
    const controls = [...document.querySelectorAll("button, a")].filter(visible);
    if (mobile) {
      for (const control of controls) {
        const rect = control.getBoundingClientRect();
        if (rect.width < 44 || rect.height < 44) {
          const text = control.textContent.replace(/\s+/g, " ").trim() || control.getAttribute("aria-label") || "control";
          if (!control.closest(".breadcrumbs, .footer__links")) problems.push(`touch-target ${rect.width.toFixed(1)}×${rect.height.toFixed(1)} · ${text.slice(0, 60)}`);
        }
      }
    }
    return {
      problems,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      forms: document.querySelectorAll("form, input, select, textarea").length,
    };
  }, { mobile });

  if (result.overflow > 1) failures.push(`${label}: horizontal overflow ${result.overflow}px`);
  if (result.forms) failures.push(`${label}: public UI contains ${result.forms} data-entry controls`);
  for (const problem of result.problems.slice(0, 20)) failures.push(`${label}: ${problem}`);
};

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));

    for (const route of routes) {
      const page = await context.newPage();
      try {
        await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
        await runAxe(page, `${profile.name} ${route}`);
        await auditLayout(page, `${profile.name} ${route}`, profile.isMobile);

        if (route === "/") {
          await page.locator("[data-dialog-open]").first().click();
          await page.locator("#contact-dialog[open]").waitFor({ state: "visible" });
          await runAxe(page, `${profile.name} / contact-dialog`);
          await auditLayout(page, `${profile.name} / contact-dialog`, profile.isMobile);
          await page.locator("[data-dialog-close]").click();

          if (profile.isMobile) {
            await page.locator("[data-menu-toggle]").click();
            await runAxe(page, `${profile.name} / mobile-menu`);
            await page.locator("[data-menu-toggle]").click();
          }
        }
      } finally {
        await page.close();
      }
    }
    await context.close();
  }
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}

console.log("Accessibility checks passed: contrast, mobile typography, touch targets, no forms and no horizontal overflow at 320, 390 and 1440 px");
