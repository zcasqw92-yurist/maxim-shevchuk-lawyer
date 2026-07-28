import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const originalLaunch = chromium.launch.bind(chromium);

// Visual and interaction smoke tests verify the underlying interface, not the
// consent overlay or the delayed engagement prompt. Both components have
// dedicated browser scenarios. Every page/context created by visual-test
// therefore starts with persisted consent rejection and a suppressed nudge
// before application scripts execute.
const isolateVisualState = () => {
  try { localStorage.setItem("analytics_consent", "denied"); } catch { /* about:blank has no storage; the script runs again on navigation. */ }
  try { sessionStorage.setItem("site_engagement_nudge_shown", "true"); } catch { /* same isolation rule for session storage. */ }
};

chromium.launch = async (...args) => {
  const browser = await originalLaunch(...args);
  const originalNewPage = browser.newPage.bind(browser);
  const originalNewContext = browser.newContext.bind(browser);

  browser.newPage = async (options = {}) => {
    const page = await originalNewPage(options);
    await page.addInitScript(isolateVisualState);
    return page;
  };

  browser.newContext = async (options = {}) => {
    const context = await originalNewContext(options);
    await context.addInitScript(isolateVisualState);
    return context;
  };

  return browser;
};
