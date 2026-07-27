import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = join(root, "reports", "messenger-intents");
const port = "4176";
const origin = `http://127.0.0.1:${port}`;
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const errors = [];
const skipped = [];
await mkdir(reportDir, { recursive: true });

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Messenger preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Messenger preview server exited: ${code}`)));
});

const textParam = (href) => {
  try { return new URL(href).searchParams.get("text") || ""; } catch { return ""; }
};

const expectParts = (label, text, parts) => {
  for (const part of parts) if (!text.includes(part)) errors.push(`${label}: missing ${part}`);
};

const openPage = async (browser, viewport, path = "/") => {
  const context = await browser.newContext({ viewport, locale: "ru-RU" });
  await context.addInitScript(() => {
    localStorage.setItem("analytics_consent", "denied");
  });
  const page = await context.newPage();
  await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
  return { context, page };
};

const dialogLinks = async (page) => {
  const dialog = page.locator("#contact-dialog[open]");
  await dialog.waitFor({ state: "visible" });
  return {
    dialog,
    telegram: await dialog.locator("a[data-track='telegram']").getAttribute("href") || "",
    whatsapp: await dialog.locator("[data-whatsapp-link]").getAttribute("href") || "",
  };
};

const closeDialog = async (dialog) => {
  await dialog.locator("[data-dialog-close]").click();
  await dialog.waitFor({ state: "hidden" });
};

const captureFailure = async (page, label, error) => {
  errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  if (!page || page.isClosed()) return;
  const safe = label.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  await page.screenshot({ path: join(reportDir, `${safe}.png`), fullPage: true }).catch(() => {});
  await writeFile(join(reportDir, `${safe}.html`), await page.content().catch(() => ""), "utf8").catch(() => {});
};

const runEngine = async (engineName, engine) => {
  const executablePath = engine.executablePath();
  const installed = await access(executablePath).then(() => true).catch(() => false);
  if (!installed) {
    const message = `${engineName}: browser binary is not installed at ${executablePath}`;
    if (requireBrowsers) errors.push(message);
    else skipped.push(message);
    return;
  }

  const browser = await engine.launch({ headless: true, ...(engineName === "Chromium" ? { args: ["--no-sandbox"] } : {}) });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const label = `${engineName}-${viewport.width}`;
      let context;
      let page;
      try {
        ({ context, page } = await openPage(browser, viewport));
        if (await page.locator("form, input, select, textarea").count()) errors.push(`${label}: public page contains data-entry controls`);
        if (await page.locator("#callback-dialog, #price-quiz-dialog, [data-callback-open], [data-price-quiz-open]").count()) errors.push(`${label}: removed form or questionnaire UI is still public`);

        await page.locator("[data-header] [data-dialog-open]").first().click();
        let links = await dialogLinks(page);
        const genericParts = ["Хочу получить первичную оценку ситуации", "Кратко опишу"];
        expectParts(`${label}: generic Telegram`, textParam(links.telegram), genericParts);
        expectParts(`${label}: generic WhatsApp`, textParam(links.whatsapp), genericParts);
        await closeDialog(links.dialog);

        const topicTrigger = page.locator(".hero__quick-choices [data-topic='возврат денежных средств']");
        await topicTrigger.scrollIntoViewIfNeeded();
        await topicTrigger.click();
        links = await dialogLinks(page);
        const topicParts = ["Обращаюсь по вопросу: возврат денежных средств", "Кратко опишу ситуацию"];
        expectParts(`${label}: topic Telegram`, textParam(links.telegram), topicParts);
        expectParts(`${label}: topic WhatsApp`, textParam(links.whatsapp), topicParts);
        await closeDialog(links.dialog);

        const priceTrigger = page.locator('[data-topic="ориентир стоимости юридической помощи"]').first();
        await priceTrigger.scrollIntoViewIfNeeded();
        await priceTrigger.click();
        links = await dialogLinks(page);
        const priceParts = ["Хочу уточнить ориентир стоимости юридической помощи", "Кратко опишу ситуацию"];
        expectParts(`${label}: price Telegram`, textParam(links.telegram), priceParts);
        expectParts(`${label}: price WhatsApp`, textParam(links.whatsapp), priceParts);
        await closeDialog(links.dialog);

        for (const href of [links.telegram, links.whatsapp]) {
          if (!/^https:\/\//.test(href) || !href.includes("text=")) errors.push(`${label}: invalid direct messenger draft ${href}`);
        }
      } catch (error) {
        await captureFailure(page, label, error);
      } finally {
        await page?.close().catch(() => {});
        await context?.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }
};

try {
  await runEngine("Chromium", chromium);
  await runEngine("WebKit", webkit);
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Messenger test local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Messenger intents passed: no forms, prefilled direct drafts, generic/topic/price flows in Chromium and WebKit");
