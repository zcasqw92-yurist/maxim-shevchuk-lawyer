import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const browserDir = join(root, ".browser-bin");
const browserPath = join(browserDir, "chromium");
const browserPackage = join(root, "node_modules", "@sparticuz", "chromium", "bin");
const reportDir = join(root, "reports", "messenger-intents");
await mkdir(browserDir, { recursive: true });
await mkdir(reportDir, { recursive: true });

if (!(await access(browserPath).then(() => true).catch(() => false))) {
  await pipeline(
    createReadStream(join(browserPackage, "chromium.br")),
    createBrotliDecompress(),
    createWriteStream(browserPath),
  );
  await chmod(browserPath, 0o755);
}

const extractTarBrotli = async (archive) => {
  const tar = spawn("tar", ["--no-same-owner", "-xf", "-", "-C", browserDir], { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  tar.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  await Promise.all([
    pipeline(createReadStream(join(browserPackage, archive)), createBrotliDecompress(), tar.stdin),
    new Promise((resolve, reject) => tar.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr || `tar exited: ${code}`)))),
  ]);
};

if (!(await access(join(browserDir, "libGLESv2.so")).then(() => true).catch(() => false))) await extractTarBrotli("swiftshader.tar.br");
if (!(await access(join(browserDir, "fonts.conf")).then(() => true).catch(() => false))) await extractTarBrotli("fonts.tar.br");
await mkdir(join(browserDir, "cache"), { recursive: true });
await mkdir(join(browserDir, "home"), { recursive: true });
process.env.HOME = join(browserDir, "home");
process.env.XDG_CACHE_HOME = join(browserDir, "cache");
process.env.FONTCONFIG_FILE = "/etc/fonts/fonts.conf";
process.env.LD_LIBRARY_PATH = [browserDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: "4176" },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Messenger preview server timeout")), 8000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) { clearTimeout(timer); resolve(); }
  });
  server.on("exit", (code) => reject(new Error(`Messenger preview server exited: ${code}`)));
});

const profiles = [
  { name: "desktop", viewport: { width: 1280, height: 900 }, isMobile: false },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true },
];
const errors = [];
let browser;

const textParam = (href) => {
  try { return new URL(href).searchParams.get("text") || ""; } catch { return ""; }
};
const expectParts = (label, text, parts) => {
  for (const part of parts) if (!text.includes(part)) errors.push(`${label}: missing ${part}`);
};
const safeName = (value) => value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

const captureFailure = async (page, label, error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  errors.push(`${label}: ${message}`);
  if (!page || page.isClosed()) return;
  const prefix = safeName(label);
  await page.screenshot({ path: join(reportDir, `${prefix}.png`), fullPage: true }).catch(() => {});
  await writeFile(join(reportDir, `${prefix}.html`), await page.content().catch(() => ""), "utf8").catch(() => {});
  const state = await page.evaluate(() => ({
    url: location.href,
    activeElement: document.activeElement?.outerHTML || "",
    consent: (() => { try { return localStorage.getItem("analytics_consent") || ""; } catch { return "unavailable"; } })(),
    dialogs: [...document.querySelectorAll("dialog")].map((dialog) => ({
      id: dialog.id,
      open: dialog.open,
      hidden: dialog.hidden,
      display: getComputedStyle(dialog).display,
      visibility: getComputedStyle(dialog).visibility,
    })),
  })).catch(() => ({}));
  await writeFile(join(reportDir, `${prefix}.json`), `${JSON.stringify({ message, ...state }, null, 2)}\n`, "utf8").catch(() => {});
};

const installPageState = async (page, consent = "denied") => {
  await page.route("https://mc.yandex.ru/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("https://www.googletagmanager.com/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.addInitScript(({ consentValue }) => {
    window.__openedUrls = [];
    window.__clipboardCalls = 0;
    try {
      if (consentValue) localStorage.setItem("analytics_consent", consentValue);
      else localStorage.removeItem("analytics_consent");
    } catch { /* about:blank may not expose storage; script runs again for the target origin. */ }
    window.open = (url) => {
      window.__openedUrls.push(String(url));
      return null;
    };
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => { window.__clipboardCalls += 1; throw new Error("clipboard disabled in test"); } },
      });
    } catch { /* Browser may expose a non-configurable clipboard object. */ }
  }, { consentValue: consent });
};

const openPage = async (context, profile, path = "/", consent = "denied") => {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${profile.name}: pageerror ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${profile.name}: console ${message.text()}`); });
  await installPageState(page, consent);
  await page.goto(`http://127.0.0.1:4176${path}`, { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor({ state: "visible" });
  return page;
};

const waitDialogOpen = async (page, selector) => {
  await page.waitForFunction((dialogSelector) => {
    const element = document.querySelector(dialogSelector);
    return element instanceof HTMLDialogElement && element.open && getComputedStyle(element).display !== "none";
  }, selector, { timeout: 6000 });
  return page.locator(selector);
};

const waitDialogClosed = async (page, selector) => {
  await page.waitForFunction((dialogSelector) => {
    const element = document.querySelector(dialogSelector);
    return !(element instanceof HTMLDialogElement) || !element.open;
  }, selector, { timeout: 6000 });
};

const closeDialogState = async (page, selector) => {
  await page.locator(selector).evaluate((element) => {
    if (element instanceof HTMLDialogElement && element.open) element.close();
  });
  await waitDialogClosed(page, selector);
};

const runScenario = async (context, profile, label, scenario, { path = "/", consent = "denied" } = {}) => {
  let page;
  try {
    page = await openPage(context, profile, path, consent);
    await scenario(page);
  } catch (error) {
    await captureFailure(page, `${profile.name}-${label}`, error);
  } finally {
    await page?.close().catch(() => {});
  }
};

try {
  browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--disable-extensions"],
  });

  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile });

    await runScenario(context, profile, "analytics-consent", async (page) => {
      const analyticsEnabled = await page.locator("body").getAttribute("data-analytics-enabled") === "true";
      const banner = page.locator("[data-consent-banner]");
      if (!analyticsEnabled) {
        if (await banner.count()) errors.push(`${profile.name}: consent banner rendered while analytics is disabled`);
        return;
      }
      await banner.waitFor({ state: "visible" });
      await banner.locator("[data-consent-reject]").click();
      await banner.waitFor({ state: "hidden" });
      if (await page.evaluate(() => localStorage.getItem("analytics_consent")) !== "denied") errors.push(`${profile.name}: analytics rejection was not stored`);
      await page.locator("[data-consent-settings]").click();
      await banner.waitFor({ state: "visible" });
      await banner.locator("[data-consent-accept]").click();
      await banner.waitFor({ state: "hidden" });
      if (await page.evaluate(() => localStorage.getItem("analytics_consent")) !== "granted") errors.push(`${profile.name}: analytics consent was not stored`);
    }, { consent: "" });

    await runScenario(context, profile, "contact-dialogs", async (page) => {
      const dialogSelector = "#contact-dialog";
      await page.locator("[data-header] [data-dialog-open]").first().click();
      const dialog = await waitDialogOpen(page, dialogSelector);
      let telegramHref = await dialog.locator("a[data-track='telegram']").getAttribute("href") || "";
      let whatsappHref = await dialog.locator("[data-whatsapp-link]").getAttribute("href") || "";
      expectParts(`${profile.name}: generic Telegram`, textParam(telegramHref), ["Хочу получить первичную оценку ситуации", "Кратко опишу"]);
      expectParts(`${profile.name}: generic WhatsApp`, textParam(whatsappHref), ["Хочу получить первичную оценку ситуации", "Кратко опишу"]);
      await dialog.locator("[data-dialog-close]").click();
      await waitDialogClosed(page, dialogSelector);

      const topicTrigger = page.locator(".hero__quick-choices [data-topic='возврат денежных средств']");
      await topicTrigger.scrollIntoViewIfNeeded();
      await topicTrigger.click();
      await waitDialogOpen(page, dialogSelector);
      telegramHref = await dialog.locator("a[data-track='telegram']").getAttribute("href") || "";
      whatsappHref = await dialog.locator("[data-whatsapp-link]").getAttribute("href") || "";
      expectParts(`${profile.name}: topic Telegram`, textParam(telegramHref), ["Обращаюсь по вопросу: возврат денежных средств", "Кратко опишу ситуацию"]);
      expectParts(`${profile.name}: topic WhatsApp`, textParam(whatsappHref), ["по вопросу: возврат денежных средств", "Кратко опишу ситуацию"]);
      await closeDialogState(page, dialogSelector);
    });

    await runScenario(context, profile, "quiz-callback", async (page) => {
      await page.locator("[data-price-quiz-open]").first().click();
      const quiz = await waitDialogOpen(page, "#price-quiz-dialog");
      for (const choice of ["Не возвращают деньги", "Договор", "В ближайшие дни"]) {
        await quiz.getByRole("button", { name: choice, exact: true }).click();
      }
      const quizTelegram = quiz.locator("[data-price-quiz-telegram]");
      const quizWhatsapp = quiz.locator("[data-price-quiz-whatsapp]");
      let telegramHref = await quizTelegram.getAttribute("href") || "";
      let whatsappHref = await quizWhatsapp.getAttribute("href") || "";
      const quizParts = ["Ситуация: Не возвращают деньги", "Материалы: Договор", "Срок: В ближайшие дни"];
      expectParts(`${profile.name}: quiz Telegram href`, textParam(telegramHref), quizParts);
      expectParts(`${profile.name}: quiz WhatsApp href`, textParam(whatsappHref), quizParts);
      const beforeQuizOpen = await page.evaluate(() => window.__openedUrls.length);
      await quizTelegram.click();
      const quizOpened = await page.evaluate(() => window.__openedUrls.at(-1) || "");
      if ((await page.evaluate(() => window.__openedUrls.length)) !== beforeQuizOpen + 1) errors.push(`${profile.name}: quiz Telegram opened more or fewer than one destination`);
      expectParts(`${profile.name}: quiz Telegram opened`, textParam(quizOpened), quizParts);
      if (await page.evaluate(() => window.__clipboardCalls) !== 0) errors.push(`${profile.name}: quiz Telegram still depends on clipboard`);

      await quiz.locator("[data-callback-open]").click();
      await waitDialogClosed(page, "#price-quiz-dialog");
      const callback = await waitDialogOpen(page, "#callback-dialog");
      await callback.locator('[name="name"]').fill("Тестовый клиент");
      await callback.locator('[name="contact"]').fill("@test_client");
      await callback.locator('[name="day"]').selectOption({ label: "Завтра" });
      await callback.locator('[name="period"]').selectOption({ label: "День, 12:00–17:00" });
      await callback.locator('[name="issue"]').selectOption({ label: "Договор, покупка или услуга" });
      await callback.locator('[name="stage"]').selectOption({ label: "Переговоры или претензия" });
      await callback.locator('[name="deadline"]').selectOption({ label: "В течение недели" });
      await callback.locator('[name="materials"]').selectOption({ label: "Документы есть" });
      await callback.locator('[name="consent"]').check();

      await callback.locator("[data-callback-telegram]").click();
      const callbackTelegramUrl = await page.evaluate(() => window.__openedUrls.at(-1) || "");
      const callbackParts = [
        "Прошу связаться со мной позже",
        "Имя: Тестовый клиент",
        "Контакт: @test_client",
        "Удобный день: Завтра",
        "Удобное время: День, 12:00–17:00 МСК",
        "Тип вопроса: Договор, покупка или услуга",
        "Стадия: Переговоры или претензия",
        "Ближайший срок: В течение недели",
        "Материалы: Документы есть",
      ];
      expectParts(`${profile.name}: callback Telegram`, textParam(callbackTelegramUrl), callbackParts);
      if (await page.evaluate(() => window.__clipboardCalls) !== 0) errors.push(`${profile.name}: callback Telegram still depends on clipboard`);

      await callback.locator("[data-callback-whatsapp]").click();
      const callbackWhatsappUrl = await page.evaluate(() => window.__openedUrls.at(-1) || "");
      expectParts(`${profile.name}: callback WhatsApp`, textParam(callbackWhatsappUrl), callbackParts);
    });

    await runScenario(context, profile, "contact-page", async (page) => {
      const contactTelegram = await page.locator(".contact-method--telegram").getAttribute("href") || "";
      const contactWhatsapp = await page.locator(".contact-method--whatsapp").getAttribute("href") || "";
      expectParts(`${profile.name}: contacts Telegram`, textParam(contactTelegram), ["Хочу получить первичную оценку ситуации", "Кратко опишу"]);
      expectParts(`${profile.name}: contacts WhatsApp`, textParam(contactWhatsapp), ["Нужна юридическая консультация", "Кратко опишу ситуацию"]);
    }, { path: "/kontakty/" });

    await context.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (errors.length) {
  await writeFile(join(reportDir, "errors.txt"), [...new Set(errors)].join("\n"), "utf8");
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Messenger intent test passed: consent, generic, topic, quiz and callback flows are isolated on desktop and mobile");
