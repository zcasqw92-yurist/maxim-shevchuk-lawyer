import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = join(root, "reports", "intake-assistant");
const port = "4191";
const origin = `http://127.0.0.1:${port}`;
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const failures = [];
const skipped = [];
await mkdir(reports, { recursive: true });

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Intake preview server timeout")), 10_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Intake preview server exited: ${code}`)));
});

const capture = async (page, label, error) => {
  failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  if (!page || page.isClosed()) return;
  const safe = label.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  await page.screenshot({ path: join(reports, `${safe}.png`), fullPage: true }).catch(() => {});
  await writeFile(join(reports, `${safe}.html`), await page.content().catch(() => ""), "utf8").catch(() => {});
};

const createContext = async (browser, viewport) => {
  const mobile = viewport.width <= 430;
  const context = await browser.newContext({
    viewport,
    locale: "ru-RU",
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
  return context;
};

const storageKeys = (page) => page.evaluate(() => ({
  local: Object.keys(localStorage).sort(),
  session: Object.keys(sessionStorage).sort(),
}));

const overflow = (page) => page.evaluate(() => {
  const width = document.documentElement.clientWidth;
  const offenders = [...document.querySelectorAll("body *")]
    .map((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { element, style, rect };
    })
    .filter(({ style, rect }) => style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && (rect.left < -1 || rect.right > width + 1))
    .slice(0, 8)
    .map(({ element, rect }) => ({
      tag: element.tagName.toLowerCase(),
      className: String(element.className || "").slice(0, 80),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
    }));
  return {
    overflow: Math.max(document.documentElement.scrollWidth - width, document.body.scrollWidth - innerWidth),
    offenders,
  };
});

const assertTargets = async (page, label) => {
  const invalid = await page.locator("#contact-dialog[open] button, #contact-dialog[open] a, [data-intake-launcher]").evaluateAll((items) => items
    .filter((item) => {
      const style = getComputedStyle(item);
      const rect = item.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    })
    .map((item) => {
      const rect = item.getBoundingClientRect();
      return { label: (item.getAttribute("aria-label") || item.textContent || "").trim().slice(0, 50), width: rect.width, height: rect.height };
    })
    .filter((item) => item.width < 44 || item.height < 44));
  if (invalid.length) failures.push(`${label}: touch targets below 44×44 ${JSON.stringify(invalid)}`);
};

const phase = (page) => page.evaluate(() => window.__intakeAssistantContract?.getPhase?.() || "missing");
const fillEditor = async (page, text) => {
  const editor = page.locator("[data-intake-work] [data-intake-editor]:visible").last();
  await editor.fill(text);
};

const answerCurrentQuestion = async (page, step = 0) => {
  const work = page.locator("[data-intake-work]");
  const editor = work.locator("[data-intake-editor]:visible");
  if (await editor.count()) {
    await editor.last().fill(step === 0 ? "Ирина" : `Тестовый ответ ${step}: 90 000 рублей, 1 августа 2026 года`);
    await work.locator(".intake-button--primary:visible").last().click();
    return;
  }
  const multi = work.locator(".intake-options--multi:visible");
  if (await multi.count()) {
    await multi.locator(".intake-option").first().click();
    await work.locator(".intake-button--primary:visible").last().click();
    const detail = work.locator("[data-intake-editor]:visible");
    if (await detail.count()) {
      await detail.last().fill(`Дополнительное уточнение ${step}`);
      await work.locator(".intake-button--primary:visible").last().click();
    }
    return;
  }
  const options = work.locator(".intake-option:visible");
  if (!await options.count()) throw new Error(`No answer controls in phase ${await phase(page)}`);
  await options.first().click();
  const detail = work.locator("[data-intake-editor]:visible");
  if (await detail.count()) {
    await detail.last().fill(`Уточнение ${step}: 11 августа 2026 года`);
    await work.locator(".intake-button--primary:visible").last().click();
  }
};

const completeToReview = async (page, { exerciseBack = false } = {}) => {
  let step = 0;
  let backDone = false;
  while (await phase(page) === "questions") {
    const prompt = await page.locator("[data-intake-work] h3").first().textContent();
    await answerCurrentQuestion(page, step);
    step += 1;
    if (exerciseBack && !backDone && step === 1) {
      const back = page.locator("[data-intake-back]:visible");
      if (!await back.count()) throw new Error("Back control is missing after first answer");
      await back.click();
      const restoredPrompt = await page.locator("[data-intake-work] h3").first().textContent();
      if (restoredPrompt !== prompt) throw new Error(`Back restored wrong question: ${restoredPrompt}`);
      await answerCurrentQuestion(page, step);
      step += 1;
      backDone = true;
    }
    if (step > 30) throw new Error("Question loop exceeded finite graph limit");
  }
  if (await phase(page) !== "review") throw new Error(`Expected review phase, got ${await phase(page)}`);
  return step;
};

const startFlow = async (page, description, { chooseOther = false } = {}) => {
  await page.locator("[data-intake-launcher]").click();
  await page.locator("#contact-dialog[open] [data-intake-assistant]").waitFor({ state: "visible" });
  await fillEditor(page, description);
  await page.locator("[data-intake-description-submit]").click();
  if (await phase(page) !== "classification") throw new Error(`Expected classification, got ${await phase(page)}`);
  if (chooseOther) {
    await page.locator("[data-intake-choose-category]").click();
    await page.locator("[data-intake-category='other']").click();
  } else {
    await page.locator("[data-intake-confirm-category]").click();
  }
  if (await phase(page) !== "questions") throw new Error(`Expected questions, got ${await phase(page)}`);
};

const assertSummary = async (page, marker) => {
  await page.locator("[data-intake-work] .intake-button--primary", { hasText: "Подготовить сообщение" }).click();
  if (await phase(page) !== "summary") throw new Error(`Expected summary, got ${await phase(page)}`);
  const summary = await page.locator(".intake-summary").textContent();
  for (const part of [marker, "Ситуация:", "Желаемый результат:"]) {
    if (!summary.includes(part)) throw new Error(`Summary missing ${part}`);
  }
  if (/\b(?:undefined|null|NaN)\b|__unknown__|__skipped__/i.test(summary)) throw new Error("Summary contains an internal placeholder");
  const links = await page.locator(".intake-messenger-choices a").evaluateAll((items) => items.map((item) => item.href));
  if (links.length !== 2 || links.some((href) => !href.includes("text="))) throw new Error(`Messenger drafts invalid: ${JSON.stringify(links)}`);
  if (!links.every((href) => new URL(href).searchParams.get("text")?.includes(marker))) throw new Error("Messenger draft lost source description");
};

const runLayout = async (engineName, browser, viewport) => {
  const label = `${engineName}-${viewport.width}`;
  const context = await createContext(browser, viewport);
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__intakeAssistantContract));
    const launcher = page.locator("[data-intake-launcher]");
    if (!await launcher.isVisible()) throw new Error("Floating launcher is not visible");
    const launcherBox = await launcher.boundingBox();
    if (!launcherBox || launcherBox.width < 44 || launcherBox.height < 44) throw new Error(`Launcher is too small ${JSON.stringify(launcherBox)}`);
    await launcher.click();
    const assistant = page.locator("#contact-dialog[open] [data-intake-assistant]");
    await assistant.waitFor({ state: "visible" });
    if (await assistant.locator("form, input, select, textarea").count()) throw new Error("Assistant contains a form control");
    const introduction = await assistant.textContent();
    for (const text of ["Я помощник юриста Максима Шевчука", "не придётся несколько раз объяснять", "Кратко опишите, что произошло"]) {
      if (!introduction.includes(text)) throw new Error(`Introduction missing: ${text}`);
    }
    const state = await overflow(page);
    if (state.overflow > 1) throw new Error(`Horizontal overflow ${JSON.stringify(state)}`);
    await assertTargets(page, label);
    await page.locator("[data-dialog-close]").click();
    await page.locator("#contact-dialog").waitFor({ state: "hidden" });
  } finally {
    await context.close();
  }
};

const runInteraction = async (engineName, browser) => {
  const context = await createContext(browser, { width: 390, height: 844 });
  const page = await context.newPage();
  const marker = `МАРКЕР-${engineName}-9137`;
  const requests = [];
  page.on("request", (request) => requests.push(`${request.url()} ${request.postData() || ""}`));
  try {
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__intakeAssistantContract));
    const beforeStorage = await storageKeys(page);
    await startFlow(page, `Передал человеку ${marker} и 90 000 рублей в долг, срок прошёл, есть переписка.`);
    const category = await page.evaluate(() => window.__intakeAssistantContract.getState().categoryId);
    if (category !== "debt") throw new Error(`Debt classifier chose ${category}`);
    await completeToReview(page, { exerciseBack: true });

    const edit = page.locator("[data-intake-edit]").first();
    await edit.click();
    if (await phase(page) !== "questions") throw new Error("Review edit did not return to question");
    const editor = page.locator("[data-intake-editor]:visible");
    if (await editor.count()) {
      await editor.fill("Исправленный ответ для проверки");
      await page.locator("[data-intake-work] .intake-button--primary:visible").last().click();
    } else {
      await page.locator("[data-intake-work] .intake-option:visible").first().click();
    }
    if (await phase(page) !== "review") throw new Error("Edited answer did not return to review");
    await assertSummary(page, marker);

    const afterStorage = await storageKeys(page);
    if (JSON.stringify(beforeStorage) !== JSON.stringify(afterStorage)) throw new Error(`Assistant changed browser storage ${JSON.stringify({ beforeStorage, afterStorage })}`);
    if (requests.some((entry) => entry.includes(marker))) throw new Error("User answer leaked into a network request");
    const dataLayer = await page.evaluate(() => JSON.stringify(window.dataLayer || []));
    if (dataLayer.includes(marker)) throw new Error("User answer leaked into analytics dataLayer");
    if (page.url().includes(marker)) throw new Error("User answer leaked into the site URL");

    await page.locator("[data-intake-reset]").click();
    if (await phase(page) !== "description") throw new Error("Reset did not return to description");
    const resetState = await page.evaluate(() => window.__intakeAssistantContract.getState());
    if (resetState.description || Object.keys(resetState.answers).length) throw new Error("Reset did not erase memory state");

    await page.locator("[data-dialog-close]").click();
    await page.locator("[data-dialog-open][data-topic*='возврат']").first().click();
    await fillEditor(page, `Оплатил услугу ${marker}, работа не сделана, исполнитель перестал отвечать.`);
    await page.locator("[data-intake-description-submit]").click();
    await page.locator("[data-intake-confirm-category]").click();
    const refundCategory = await page.evaluate(() => window.__intakeAssistantContract.getState().categoryId);
    if (refundCategory !== "refund") throw new Error(`Topic flow chose ${refundCategory}`);

    await answerCurrentQuestion(page, 1);
    await answerCurrentQuestion(page, 2);
    const finish = page.locator("[data-intake-finish]:visible");
    if (!await finish.count()) throw new Error("Early finish is missing after sufficient initial answers");
    await finish.click();
    if (await phase(page) !== "review") throw new Error("Early finish did not reach review");
  } finally {
    await context.close();
  }
};

const runFallback = async (browser) => {
  const context = await createContext(browser, { width: 1024, height: 768 });
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__intakeAssistantContract));
    await startFlow(page, "Совершенно нестандартная ситуация без понятной юридической категории.", { chooseOther: true });
    const category = await page.evaluate(() => window.__intakeAssistantContract.getState().categoryId);
    if (category !== "other") throw new Error(`Fallback chose ${category}`);
    await completeToReview(page);
    await assertSummary(page, "Совершенно нестандартная ситуация");
  } finally {
    await context.close();
  }
};

const engines = [["Chromium", chromium], ["Firefox", firefox], ["WebKit", webkit]];
const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

try {
  for (const [name, engine] of engines) {
    const executablePath = engine.executablePath();
    if (!await access(executablePath).then(() => true).catch(() => false)) {
      const message = `${name}: browser binary is not installed at ${executablePath}`;
      if (requireBrowsers) failures.push(message); else skipped.push(message);
      continue;
    }
    const browser = await engine.launch({ headless: true, ...(name === "Chromium" ? { args: ["--no-sandbox"] } : {}) });
    try {
      for (const viewport of viewports) {
        try { await runLayout(name, browser, viewport); } catch (error) { await capture(null, `${name}-${viewport.width}`, error); }
      }
      try { await runInteraction(name, browser); } catch (error) { await capture(null, `${name}-interaction`, error); }
      if (name === "Chromium") {
        try { await runFallback(browser); } catch (error) { await capture(null, `${name}-fallback`, error); }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Intake browser local skip: ${message}`);
if (failures.length) {
  await writeFile(join(reports, "errors.txt"), `${[...new Set(failures)].join("\n")}\n`, "utf8");
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Intake browser passed: Chromium, Firefox and WebKit; 320/390/768/1024/1440px; full, edited, early-finish and fallback flows; no forms, overflow, storage or answer leakage");
