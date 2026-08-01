import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(root, "reports", "intake-assistant-live.json");
const base = String(process.env.SITE_PUBLIC_URL || "https://yuristshevchuk.com").replace(/\/$/, "");
const expectedSha = String(process.env.EXPECTED_BUILD_SHA || "").trim();
const failures = [];
const checks = [];
await mkdir(dirname(reportPath), { recursive: true });

const record = (engine, name, ok, detail = "") => {
  checks.push({ engine, name, ok, detail });
  if (!ok) failures.push(`${engine}: ${name}${detail ? ` — ${detail}` : ""}`);
};

for (const asset of ["/assets/intake-assistant-engine.mjs", "/assets/intake-assistant.mjs", "/assets/intake-assistant.css"]) {
  const response = await fetch(`${base}${asset}?live=${Date.now()}`, { cache: "no-store", headers: { "cache-control": "no-cache" } });
  record("HTTP", asset, response.ok, `HTTP ${response.status}`);
}

for (const [engineName, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
  const executable = engine.executablePath();
  if (!await access(executable).then(() => true).catch(() => false)) {
    record(engineName, "browser installed", false, executable);
    continue;
  }
  const browser = await engine.launch({ headless: true, ...(engineName === "Chromium" ? { args: ["--no-sandbox"] } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU", reducedMotion: "reduce" });
  await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
  const page = await context.newPage();
  const marker = `LIVE-${engineName}-9137`;
  const requests = [];
  page.on("request", (request) => requests.push(`${request.url()} ${request.postData() || ""}`));
  try {
    const response = await page.goto(`${base}/?intake-live=${Date.now()}`, { waitUntil: "networkidle" });
    record(engineName, "home responds", Boolean(response?.ok()), `HTTP ${response?.status()}`);
    await page.waitForFunction(() => Boolean(window.__intakeAssistantContract));
    record(engineName, "runtime contract", await page.evaluate(() => window.__intakeAssistantContract?.storage === "memory-only" && window.__intakeAssistantContract?.automaticSend === false));
    if (expectedSha) {
      const sha = await page.locator('meta[name="site-build-sha"]').getAttribute("content");
      record(engineName, "exact production SHA", sha === expectedSha, `got ${sha}`);
    }
    const launcher = page.locator("[data-intake-launcher]");
    record(engineName, "floating launcher visible", await launcher.isVisible());
    await launcher.click();
    const assistant = page.locator("#contact-dialog[open] [data-intake-assistant]");
    await assistant.waitFor({ state: "visible" });
    record(engineName, "assistant introduction", (await assistant.textContent()).includes("Я помощник юриста Максима Шевчука"));
    record(engineName, "form-free assistant", await assistant.locator("form, input, select, textarea").count() === 0);

    await page.locator("[data-intake-editor]:visible").fill(`Передал ${marker} 90 000 рублей, долг не возвращают, есть переписка.`);
    await page.locator("[data-intake-description-submit]").click();
    await page.locator("[data-intake-confirm-category]").click();
    record(engineName, "debt route selected", await page.evaluate(() => window.__intakeAssistantContract.getState().categoryId === "debt"));

    for (let index = 0; index < 2; index += 1) {
      const editor = page.locator("[data-intake-work] [data-intake-editor]:visible");
      if (await editor.count()) {
        await editor.fill(index ? "1 августа 2026 года" : "Ирина");
        await page.locator("[data-intake-work] .intake-button--primary:visible").last().click();
      } else {
        await page.locator("[data-intake-work] .intake-option:visible").first().click();
      }
    }
    await page.locator("[data-intake-finish]:visible").click();
    await page.locator(".intake-button--primary", { hasText: "Подготовить сообщение" }).click();
    const summary = await page.locator(".intake-summary").textContent();
    record(engineName, "summary preserves source facts", summary.includes(marker) && summary.includes("Ситуация:"));
    const links = await page.locator(".intake-messenger-choices a").evaluateAll((items) => items.map((item) => item.href));
    record(engineName, "Telegram and WhatsApp drafts", links.length === 2 && links.every((href) => href.includes("text=")));
    record(engineName, "no automatic answer request", !requests.some((request) => request.includes(marker)));
    record(engineName, "no analytics answer leakage", !(await page.evaluate(() => JSON.stringify(window.dataLayer || []))).includes(marker));
    const dimensions = await assistant.evaluate((element) => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
    }));
    record(engineName, "mobile layout", dimensions.scrollWidth <= dimensions.viewport + 1 && dimensions.left >= -1 && dimensions.right <= dimensions.viewport + 1, JSON.stringify(dimensions));
  } catch (error) {
    record(engineName, "flow exception", false, error instanceof Error ? error.message : String(error));
    await page.screenshot({ path: join(root, "reports", `intake-live-${engineName.toLowerCase()}.png`), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
    await browser.close();
  }
}

const report = { checkedAt: new Date().toISOString(), base, expectedSha, checks, failures };
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Live intake assistant verified on ${base}: exact SHA, Chromium/WebKit, source facts, messenger drafts, mobile layout and no answer leakage`);
