import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = join(root, "reports");
const shots = join(reports, "screenshots");
const port = "4173";
const origin = `http://127.0.0.1:${port}`;
const failures = [];

await mkdir(shots, { recursive: true });

const executablePath = chromium.executablePath();
if (!await access(executablePath).then(() => true).catch(() => false)) {
  throw new Error(`Chromium не установлен: ${executablePath}. Выполните npx playwright install chromium`);
}

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Preview server exited: ${code}`)));
});

const checks = [
  { name: "home-mobile-small", path: "/", viewport: { width: 320, height: 568 }, mobile: true },
  { name: "home-mobile", path: "/", viewport: { width: 390, height: 844 }, mobile: true },
  { name: "home-mobile-wide", path: "/", viewport: { width: 430, height: 932 }, mobile: true },
  { name: "home-tablet", path: "/", viewport: { width: 768, height: 1024 } },
  { name: "home-laptop", path: "/", viewport: { width: 1366, height: 768 } },
  { name: "home-desktop", path: "/", viewport: { width: 1440, height: 900 } },
  { name: "home-fullhd", path: "/", viewport: { width: 1920, height: 1080 } },
  { name: "services-tablet", path: "/uslugi/", viewport: { width: 820, height: 1180 } },
  { name: "service-mobile", path: "/uslugi/dosudebnoe-uregulirovanie/", viewport: { width: 390, height: 844 }, mobile: true },
  { name: "about-desktop", path: "/o-yuriste/", viewport: { width: 1440, height: 1000 } },
  { name: "about-mobile", path: "/o-yuriste/", viewport: { width: 390, height: 844 }, mobile: true },
  { name: "contacts-mobile", path: "/kontakty/", viewport: { width: 390, height: 844 }, mobile: true },
  { name: "privacy-mobile", path: "/politika-konfidencialnosti/", viewport: { width: 390, height: 844 }, mobile: true },
];

const prefilledText = (href) => {
  try {
    return new URL(href).searchParams.get("text") || "";
  } catch {
    return "";
  }
};

const createContext = async (browser, viewport, mobile = false) => {
  const context = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "ru-RU",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
  return context;
};

const overflowState = (page) => page.evaluate(() => {
  const viewportWidth = document.documentElement.clientWidth;
  const overflow = Math.max(
    document.documentElement.scrollWidth - viewportWidth,
    document.body.scrollWidth - innerWidth,
  );
  const offenders = [...document.querySelectorAll("body *")]
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        className: element.className?.toString().slice(0, 80) || "",
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      };
    })
    .filter((item) => item.left < -1 || item.right > viewportWidth + 1)
    .slice(0, 8);
  return { viewportWidth, viewportHeight: innerHeight, overflow, offenders };
});

const assertNoOverflow = async (page, label) => {
  const state = await overflowState(page);
  if (state.overflow > 1) failures.push(`${label}: horizontal overflow ${JSON.stringify(state)}`);
};

const auditTouchTargets = async (page, label, selector) => {
  const invalid = await page.locator(selector).evaluateAll((items) => items
    .filter((item) => {
      const style = getComputedStyle(item);
      const rect = item.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    })
    .map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        text: item.textContent.trim().replace(/\s+/g, " ").slice(0, 60),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      };
    })
    .filter((item) => item.width < 44 || item.height < 44));
  if (invalid.length) failures.push(`${label}: touch targets below 44×44 ${JSON.stringify(invalid)}`);
};

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  for (const check of checks) {
    const context = await createContext(browser, check.viewport, check.mobile);
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(`${check.name}: page error ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`${check.name}: console error ${message.text()}`);
    });

    const response = await page.goto(`${origin}${check.path}`, { waitUntil: "networkidle" });
    if (!response?.ok()) failures.push(`${check.name}: HTTP ${response?.status()}`);
    await page.evaluate(async () => {
      document.querySelectorAll(".reveal").forEach((item) => item.classList.add("is-visible"));
      document.querySelectorAll("img").forEach((image) => { image.loading = "eager"; });
      await Promise.all([...document.images].map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        })));
    });

    await page.screenshot({ path: join(shots, `${check.name}-fold.png`), fullPage: false });
    await page.screenshot({ path: join(shots, `${check.name}.png`), fullPage: true });
    await assertNoOverflow(page, check.name);

    if (await page.locator("form, input, select, textarea, [data-callback-open], [data-price-quiz-open]").count()) {
      failures.push(`${check.name}: removed form or questionnaire control remains`);
    }
    if (await page.locator("#contact-dialog").count() !== 1) failures.push(`${check.name}: direct messenger dialog is not unique`);

    if (check.path === "/") {
      const primaryCta = page.locator(".hero__actions .button--primary[data-dialog-open]");
      if (await primaryCta.count() !== 1) failures.push(`${check.name}: primary hero CTA is not unique`);
      else {
        const state = await page.evaluate(() => ({ height: innerHeight }));
        const box = await primaryCta.boundingBox();
        if (!box || box.y < 0 || box.y + box.height > state.height + 1) {
          failures.push(`${check.name}: primary hero CTA is outside the first viewport ${JSON.stringify({ box, state })}`);
        }
      }
    }
    await context.close();
  }

  const desktop = await createContext(browser, { width: 1280, height: 900 });
  const interactionPage = await desktop.newPage();
  await interactionPage.goto(`${origin}/`, { waitUntil: "networkidle" });
  const dialog = interactionPage.locator("#contact-dialog");

  const headerTrigger = interactionPage.locator(".header__actions [data-dialog-open]");
  if (await headerTrigger.count() !== 1) failures.push("interaction: header dialog trigger is not unique");
  else await headerTrigger.click();
  if (!await dialog.evaluate((element) => element.open)) failures.push("interaction: contact dialog did not open");
  if (await dialog.locator("form, input, select, textarea").count()) failures.push("interaction: messenger dialog contains data-entry controls");

  const genericWhatsapp = await dialog.locator("[data-whatsapp-link]").getAttribute("href");
  const genericTelegram = await dialog.locator("[data-track='telegram']").getAttribute("href");
  if (!genericWhatsapp?.startsWith("https://api.whatsapp.com/send?phone=79806574199&text=")) failures.push("interaction: WhatsApp draft is missing");
  if (!genericTelegram?.startsWith("https://t.me/lawrazbor?text=")) failures.push("interaction: Telegram draft is missing");
  if (!prefilledText(genericTelegram).includes("Хочу понять, что можно сделать в моей ситуации")) failures.push("interaction: generic prefilled text changed");
  await dialog.locator("[data-dialog-close]").click();

  await interactionPage.locator('[data-topic="ориентир стоимости юридической помощи"]').first().click();
  const priceTelegram = await dialog.locator("[data-track='telegram']").getAttribute("href");
  if (!prefilledText(priceTelegram).includes("Хочу уточнить ориентир стоимости юридической помощи")) {
    failures.push("interaction: price CTA does not create the approved messenger draft");
  }
  await dialog.locator("[data-dialog-close]").click();

  await interactionPage.locator(".hero__quick-choices [data-topic='возврат денежных средств']").click();
  const selectedTopic = await dialog.locator("[data-dialog-topic]").textContent();
  const topicTelegram = await dialog.locator("[data-track='telegram']").getAttribute("href");
  if (selectedTopic !== "Вы выбрали: возврат денежных средств") failures.push("interaction: selected topic is not shown");
  if (!prefilledText(topicTelegram).includes("Обращаюсь по вопросу: возврат денежных средств")) failures.push("interaction: topic is missing from draft");
  await dialog.locator("[data-dialog-close]").click();
  await desktop.close();

  for (const width of [320, 390, 430]) {
    const context = await createContext(browser, { width, height: 844 }, true);
    const page = await context.newPage();
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await auditTouchTargets(page, `mobile ${width}px`, "[data-menu-toggle], .hero__actions .button, .hero__quick-choices button");

    const menuToggle = page.locator("[data-menu-toggle]");
    await menuToggle.tap();
    await page.waitForFunction(() => Boolean(document.activeElement?.closest("[data-mobile-menu]")));
    const menuState = await page.evaluate(() => ({
      expanded: document.querySelector("[data-menu-toggle]")?.getAttribute("aria-expanded"),
      bodyPosition: getComputedStyle(document.body).position,
      mainInert: document.querySelector("main")?.inert,
      menuVisible: !document.querySelector("[data-mobile-menu]")?.hidden,
    }));
    if (menuState.expanded !== "true" || menuState.bodyPosition !== "fixed" || !menuState.mainInert || !menuState.menuVisible) {
      failures.push(`mobile ${width}px: menu isolation failed ${JSON.stringify(menuState)}`);
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("[data-mobile-menu]")?.hidden === true);
    if (!await menuToggle.evaluate((element) => element === document.activeElement)) failures.push(`mobile ${width}px: menu focus was not restored`);

    await page.evaluate(() => {
      window.scrollTo(0, 720);
      window.dispatchEvent(new Event("scroll"));
    });
    await page.waitForFunction(() => {
      const panel = document.querySelector("[data-mobile-contact]");
      if (!panel?.classList.contains("is-visible")) return false;
      const rect = panel.getBoundingClientRect();
      const style = getComputedStyle(panel);
      return Number(style.opacity) > .9 && rect.top < innerHeight && rect.bottom <= innerHeight + 1;
    });

    const mobilePanel = page.locator("[data-mobile-contact]");
    if (await mobilePanel.locator("button").count() !== 1) failures.push(`mobile ${width}px: panel must contain exactly one direct CTA`);
    const panelState = await mobilePanel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const buttonRect = element.querySelector("button")?.getBoundingClientRect();
      return {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        buttonWidth: buttonRect?.width || 0,
        buttonHeight: buttonRect?.height || 0,
      };
    });
    if (panelState.left < -1 || panelState.right > panelState.viewportWidth + 1
      || panelState.top < -1 || panelState.bottom > panelState.viewportHeight + 1
      || panelState.buttonWidth < panelState.viewportWidth - 40 || panelState.buttonHeight < 44) {
      failures.push(`mobile ${width}px: single CTA layout is invalid ${JSON.stringify(panelState)}`);
    }

    await page.locator("[data-mobile-contact-now]").click();
    const mobileDialog = page.locator("#contact-dialog[open]");
    await mobileDialog.waitFor({ state: "visible" });
    const mobileTelegram = await mobileDialog.locator("[data-track='telegram']").getAttribute("href");
    if (!prefilledText(mobileTelegram).includes("Хочу понять, что можно сделать в моей ситуации")) failures.push(`mobile ${width}px: starter message is incomplete`);
    if (await mobileDialog.locator("form, input, select, textarea").count()) failures.push(`mobile ${width}px: dialog contains data-entry controls`);
    await mobileDialog.locator("[data-dialog-close]").click();

    await page.addStyleTag({ content: `
      body, body * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }
      main p { margin-bottom: 2em !important; }
    ` });
    await assertNoOverflow(page, `mobile ${width}px with WCAG text spacing`);
    await context.close();
  }
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}

if (failures.length) {
  const output = `${[...new Set(failures)].join("\n")}\n`;
  await writeFile(join(reports, "visual-direct-contact-errors.txt"), output, "utf8");
  console.error(output.trim());
  process.exit(1);
}

console.log(`Visual direct-contact smoke passed: ${checks.length} viewports, prefilled drafts, mobile menu, WCAG text spacing and one form-free mobile CTA`);
