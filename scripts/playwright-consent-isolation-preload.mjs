import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const originalLaunch = chromium.launch.bind(chromium);

// Visual and interaction smoke tests verify the underlying interface, not the
// consent overlay. Consent itself is covered by accessibility and messenger
// interaction scenarios. Every page created by visual-test therefore starts
// with an explicit, persisted rejection before application scripts execute.
chromium.launch = async (...args) => {
  const browser = await originalLaunch(...args);
  const originalNewPage = browser.newPage.bind(browser);

  browser.newPage = async (options = {}) => {
    const page = await originalNewPage(options);
    await page.addInitScript(() => {
      try { localStorage.setItem("analytics_consent", "denied"); } catch { /* about:blank has no storage; the script runs again on navigation. */ }
    });
    return page;
  };

  return browser;
};
