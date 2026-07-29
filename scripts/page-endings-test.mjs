import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const skipped = [];
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const routes = [
  { path: "/o-yuriste/", previous: "#process" },
  { path: "/kontakty/", previous: ".section--faq", requireContactMethods: true },
];
const viewports = [
  { width: 390, height: 844 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
];
const port = "4195";
const origin = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Page endings preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Page endings preview server exited: ${code}`)));
});

const rounded = (value) => Math.round(value * 10) / 10;

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

        for (const route of routes) {
          const response = await page.goto(`${origin}${route.path}`, { waitUntil: "networkidle" });
          if (!response?.ok()) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: status ${response?.status()}`);
            continue;
          }

          const ctas = page.locator("main > .section--closing-cta");
          if (await ctas.count() !== 1) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: expected one closing CTA, found ${await ctas.count()}`);
            continue;
          }

          const cta = ctas.first();
          const panel = cta.locator(":scope > .cta-panel");
          const button = cta.locator("[data-dialog-open]");
          const previous = page.locator(route.previous).last();
          const footer = page.locator(".site-footer").first();

          for (const [name, locator] of [["panel", panel], ["button", button], ["previous section", previous], ["footer", footer]]) {
            if (!(await locator.count()) || !(await locator.isVisible())) {
              errors.push(`${engineName} ${viewport.width}px ${route.path}: ${name} is missing or hidden`);
            }
          }
          if (errors.some((message) => message.includes(`${engineName} ${viewport.width}px ${route.path}:`) && message.includes("missing or hidden"))) continue;

          const [ctaBox, panelBox, previousBox, footerBox] = await Promise.all([
            cta.boundingBox(),
            panel.boundingBox(),
            previous.boundingBox(),
            footer.boundingBox(),
          ]);
          if (![ctaBox, panelBox, previousBox, footerBox].every(Boolean)) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: failed to read layout boxes`);
            continue;
          }

          const previousGap = ctaBox.y - (previousBox.y + previousBox.height);
          const footerGap = footerBox.y - (ctaBox.y + ctaBox.height);
          if (Math.abs(previousGap) > 2) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: gap before closing CTA is ${rounded(previousGap)}px`);
          }
          if (Math.abs(footerGap) > 2) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: gap before footer is ${rounded(footerGap)}px`);
          }
          if (ctaBox.height < 150 || ctaBox.height > 380) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: closing CTA height ${rounded(ctaBox.height)}px is outside 150–380px`);
          }

          const styles = await cta.evaluate((element) => {
            const section = getComputedStyle(element);
            const panelElement = element.querySelector(".cta-panel");
            const panelStyle = panelElement ? getComputedStyle(panelElement) : null;
            return {
              paddingTop: Number.parseFloat(section.paddingTop),
              paddingBottom: Number.parseFloat(section.paddingBottom),
              backgroundColor: section.backgroundColor,
              panelBackground: panelStyle?.backgroundColor || "",
              panelShadow: panelStyle?.boxShadow || "",
            };
          });
          if (Math.abs(styles.paddingTop) > .5 || Math.abs(styles.paddingBottom) > .5) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: outer CTA padding is ${styles.paddingTop}/${styles.paddingBottom}px`);
          }
          if (styles.backgroundColor === "rgba(0, 0, 0, 0)") {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: closing CTA background is transparent`);
          }
          if (styles.panelBackground !== "rgba(0, 0, 0, 0)") {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: inner CTA panel still has a card background`);
          }
          if (styles.panelShadow !== "none") {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: inner CTA panel still has a shadow`);
          }

          const expectedPanelWidth = await page.evaluate(() => {
            const rootStyle = getComputedStyle(document.documentElement);
            const probe = document.createElement("div");
            probe.className = "wrap";
            probe.style.position = "fixed";
            probe.style.visibility = "hidden";
            document.body.append(probe);
            const width = probe.getBoundingClientRect().width;
            probe.remove();
            return { width, rootWidth: rootStyle.width };
          });
          if (Math.abs(panelBox.width - expectedPanelWidth.width) > 2) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: CTA panel width differs from wrap by ${rounded(Math.abs(panelBox.width - expectedPanelWidth.width))}px`);
          }

          if (route.requireContactMethods && await page.locator(".contact-page__methods .contact-method").count() < 2) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: direct WhatsApp/Telegram methods were lost`);
          }

          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow > 1) errors.push(`${engineName} ${viewport.width}px ${route.path}: ${overflow}px horizontal overflow`);
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

for (const message of skipped) console.warn(`Page endings local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Page endings passed: about and contacts close with one full-width CTA, no light gaps, preserved direct contacts and no overflow in Chromium and WebKit");
