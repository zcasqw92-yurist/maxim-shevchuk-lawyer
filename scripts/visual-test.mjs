import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const chromiumBinary = require("@sparticuz/chromium").default;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(root, "reports", "screenshots");
await mkdir(shots, { recursive: true });
const browserDir = join(root, ".browser-bin");
const browserPath = join(browserDir, "chromium");
const browserPackage = join(root, "node_modules", "@sparticuz", "chromium", "bin");
await mkdir(browserDir, { recursive: true });
if (!(await access(browserPath).then(() => true).catch(() => false))) {
  await pipeline(
    createReadStream(join(browserPackage, "chromium.br")),
    createBrotliDecompress(),
    createWriteStream(browserPath),
  );
  await chmod(browserPath, 0o755);
}

const extractTarBrotli = async (archive) => {
  const tar = spawn("tar", ["--no-same-owner", "-xf", "-", "-C", browserDir], {
    stdio: ["pipe", "ignore", "pipe"],
  });
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
  env: { ...process.env, PORT: "4173" },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Preview server timeout")), 8000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) { clearTimeout(timer); resolve(); }
  });
  server.on("exit", (code) => reject(new Error(`Preview server exited: ${code}`)));
});

const checks = [
  { name: "home-mobile-small", path: "/", viewport: { width: 320, height: 568 }, fullPage: true },
  { name: "home-mobile", path: "/", viewport: { width: 390, height: 844 }, fullPage: true },
  { name: "home-mobile-wide", path: "/", viewport: { width: 430, height: 932 }, fullPage: true },
  { name: "home-tablet", path: "/", viewport: { width: 768, height: 1024 }, fullPage: true },
  { name: "home-laptop", path: "/", viewport: { width: 1366, height: 768 }, fullPage: true },
  { name: "home-desktop", path: "/", viewport: { width: 1440, height: 900 }, fullPage: true },
  { name: "home-fullhd", path: "/", viewport: { width: 1920, height: 1080 }, fullPage: true },
  { name: "services-tablet", path: "/uslugi/", viewport: { width: 820, height: 1180 }, fullPage: true },
  { name: "service-mobile", path: "/uslugi/dosudebnoe-uregulirovanie/", viewport: { width: 390, height: 844 }, fullPage: true },
  { name: "about-desktop", path: "/o-yuriste/", viewport: { width: 1440, height: 1000 }, fullPage: true },
  { name: "about-mobile", path: "/o-yuriste/", viewport: { width: 390, height: 844 }, fullPage: true },
  { name: "contacts-mobile", path: "/kontakty/", viewport: { width: 390, height: 844 }, fullPage: true },
];
const errors = [];
let browser;

const messageText = (href) => {
  try { return new URL(href).searchParams.get("text") || ""; } catch { return ""; }
};

try {
  browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--disable-extensions", "--font-render-hinting=none"],
    executablePath: browserPath,
    headless: true,
  });
  for (const check of checks) {
    const page = await browser.newPage({ viewport: check.viewport, deviceScaleFactor: 1 });
    page.on("pageerror", (error) => errors.push(`${check.name}: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${check.name}: console ${message.text()}`); });
    const response = await page.goto(`http://127.0.0.1:4173${check.path}`, { waitUntil: "networkidle" });
    if (!response?.ok()) errors.push(`${check.name}: HTTP ${response?.status()}`);
    await page.evaluate(async () => {
      document.querySelectorAll(".reveal").forEach((item) => item.classList.add("is-visible"));
      document.querySelectorAll("img").forEach((image) => { image.loading = "eager"; });
      await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })));
    });
    await page.screenshot({ path: join(shots, `${check.name}-fold.png`), fullPage: false });
    await page.screenshot({ path: join(shots, `${check.name}.png`), fullPage: check.fullPage });
    const layout = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll("body *")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName.toLowerCase(), className: element.className?.toString().slice(0, 80) || "", left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
        })
        .filter((item) => item.left < -1 || item.right > viewport + 1)
        .slice(0, 8);
      const wideContainers = [...document.querySelectorAll("body *")]
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: element.className?.toString().slice(0, 80) || "",
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }))
        .filter((item) => item.scrollWidth > viewport + 1 || item.scrollWidth > item.clientWidth + 40)
        .slice(0, 8);
      return { viewport, scrollWidth: document.documentElement.scrollWidth, offenders, wideContainers };
    });
    if (layout.scrollWidth > layout.viewport + 1) errors.push(`${check.name}: horizontal overflow ${JSON.stringify(layout)}`);
    if (check.path === "/") {
      const primaryCta = page.locator(".hero__actions [data-dialog-open]");
      if (await primaryCta.count() !== 1) errors.push(`${check.name}: primary hero CTA is not unique`);
      else {
        const box = await primaryCta.boundingBox();
        if (!box || box.y < 0 || box.y + box.height > check.viewport.height + 1) {
          errors.push(`${check.name}: primary hero CTA is outside the first viewport ${JSON.stringify(box)}`);
        }
      }
    }
    await page.close();
  }

  const interactionPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await interactionPage.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  const dialogButton = interactionPage.locator(".header__actions [data-dialog-open]");
  if (await dialogButton.count() !== 1) errors.push("interaction: header dialog trigger is not unique");
  else await dialogButton.click();
  const dialog = interactionPage.locator("#contact-dialog");
  if (!await dialog.evaluate((element) => element.open)) errors.push("interaction: contact dialog did not open");
  if (await interactionPage.locator("[data-online-status]").count() < 2) errors.push("interaction: online status indicators are missing");
  const whatsappHref = await interactionPage.locator("#contact-dialog [data-whatsapp-link]").getAttribute("href");
  const telegramHref = await interactionPage.locator("#contact-dialog [data-track='telegram']").getAttribute("href");
  if (!whatsappHref?.startsWith("https://api.whatsapp.com/send?phone=79065297970&text=")) errors.push("interaction: WhatsApp link is missing prepared message");
  if (!telegramHref?.startsWith("https://t.me/lawrazbor?text=")) errors.push("interaction: Telegram link is missing prepared message");
  if (!messageText(telegramHref).includes("Хочу получить первичную оценку ситуации")) errors.push("interaction: Telegram generic message is incomplete");
  await interactionPage.locator("[data-dialog-close]").click();
  await interactionPage.locator(".hero__actions [data-dialog-open]").click();
  if (!await dialog.evaluate((element) => element.open)) errors.push("interaction: primary hero CTA did not open the contact dialog");
  await interactionPage.locator("[data-dialog-close]").click();
  await interactionPage.locator(".hero__quick-choices [data-topic='возврат денежных средств']").click();
  const selectedTopic = await interactionPage.locator("#contact-dialog [data-dialog-topic]").textContent();
  const selectedWhatsappHref = await interactionPage.locator("#contact-dialog [data-whatsapp-link]").getAttribute("href");
  const selectedTelegramHref = await interactionPage.locator("#contact-dialog [data-track='telegram']").getAttribute("href");
  const selectedWhatsappText = messageText(selectedWhatsappHref);
  const selectedTelegramText = messageText(selectedTelegramHref);
  if (selectedTopic !== "Вы выбрали: возврат денежных средств") errors.push("interaction: selected topic is not shown in dialog");
  if (!selectedWhatsappText.includes("по вопросу: возврат денежных средств")) errors.push("interaction: WhatsApp message does not include selected topic");
  if (!selectedTelegramText.includes("Обращаюсь по вопросу: возврат денежных средств")) errors.push("interaction: Telegram message does not include selected topic");
  await interactionPage.locator("[data-dialog-close]").click();
  await interactionPage.locator(".header__online").click();
  if (!await dialog.evaluate((element) => element.open)) errors.push("interaction: online status did not open contact dialog");
  await interactionPage.close();

  for (const width of [320, 390, 430]) {
    const targetPage = await browser.newPage({ viewport: { width, height: 844 } });
    await targetPage.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
    const status = targetPage.locator(".header__online");
    const box = await status.boundingBox();
    if (!box || box.width < 24 || box.height < 24) {
      errors.push(`interaction: online status target is smaller than 24×24 at ${width}px: ${JSON.stringify(box)}`);
    }
    let keyboardFocused = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await targetPage.keyboard.press("Tab");
      if (await status.evaluate((element) => element === document.activeElement)) {
        keyboardFocused = true;
        break;
      }
    }
    if (!keyboardFocused) errors.push(`interaction: online status is not keyboard reachable at ${width}px`);

    const trustTypography = await targetPage.locator(".trust-strip").evaluate((strip) => {
      const items = [...strip.querySelectorAll(".trust-strip__item")];
      const sizes = items.flatMap((item) => [...item.querySelectorAll("strong, small")].map((node) => parseFloat(getComputedStyle(node).fontSize)));
      return {
        minSize: Math.min(...sizes),
        clipped: items.some((item) => item.scrollHeight > item.clientHeight + 1 || item.scrollWidth > item.clientWidth + 1),
        boxes: items.map((item) => ({
          text: item.textContent.trim().replace(/\s+/g, " ").slice(0, 60),
          clientWidth: item.clientWidth,
          scrollWidth: item.scrollWidth,
          clientHeight: item.clientHeight,
          scrollHeight: item.scrollHeight,
        })),
      };
    });
    if (trustTypography.minSize < 14 || trustTypography.clipped) {
      errors.push(`interaction: trust strip is unreadable at ${width}px ${JSON.stringify(trustTypography)}`);
    }

    await targetPage.addStyleTag({ content: `
      html { font-size: 200% !important; }
      * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }
    ` });
    const enlargedTrust = await targetPage.locator(".trust-strip").evaluate((strip) => {
      const items = [...strip.querySelectorAll(".trust-strip__item")];
      return {
        scrollWidth: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
        clipped: items.some((item) => item.scrollHeight > item.clientHeight + 1 || item.scrollWidth > item.clientWidth + 1),
        boxes: items.map((item) => ({
          text: item.textContent.trim().replace(/\s+/g, " ").slice(0, 60),
          clientWidth: item.clientWidth,
          scrollWidth: item.scrollWidth,
          clientHeight: item.clientHeight,
          scrollHeight: item.scrollHeight,
        })),
      };
    });
    if (enlargedTrust.clipped || enlargedTrust.scrollWidth > enlargedTrust.viewport + 1) {
      errors.push(`interaction: trust strip fails 200% text spacing at ${width}px ${JSON.stringify(enlargedTrust)}`);
    }
    await targetPage.close();
  }

  const quizPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await quizPage.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await quizPage.locator(".hero__actions [data-price-quiz-open]").click();
  const quizDialog = quizPage.locator("#price-quiz-dialog");
  if (!await quizDialog.evaluate((element) => element.open)) errors.push("interaction: price quiz did not open");
  if (await quizDialog.locator("[data-price-quiz-step]").count() !== 3) errors.push("interaction: price quiz must contain exactly three steps");
  const quizChoices = ["Не возвращают деньги", "Договор", "В ближайшие дни"];
  for (const choice of quizChoices) await quizDialog.getByRole("button", { name: choice, exact: true }).click();
  if (await quizPage.locator("[data-price-quiz-result]").isHidden()) errors.push("interaction: price quiz result did not open");
  const quizWhatsappHref = await quizPage.locator("[data-price-quiz-whatsapp]").getAttribute("href");
  const quizTelegramHref = await quizPage.locator("[data-price-quiz-telegram]").getAttribute("href");
  const quizWhatsappText = messageText(quizWhatsappHref);
  const quizTelegramText = messageText(quizTelegramHref);
  const completeQuiz = (text) => text.includes("Ситуация: Не возвращают деньги") && text.includes("Материалы: Договор") && text.includes("Срок: В ближайшие дни");
  if (!completeQuiz(quizWhatsappText)) errors.push("interaction: price quiz WhatsApp summary is incomplete");
  if (!completeQuiz(quizTelegramText)) errors.push("interaction: price quiz Telegram summary is incomplete");
  await quizPage.close();

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobilePage.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  const menuButton = mobilePage.locator("[data-menu-toggle]");
  const mobileMenu = mobilePage.locator("[data-mobile-menu]");
  const menuBackdrop = mobilePage.locator("[data-menu-backdrop]");
  if (await menuButton.count() !== 1) errors.push("interaction: mobile menu trigger is not unique");
  await mobilePage.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 600);
  });
  await mobilePage.waitForFunction(() => window.scrollY >= 590);
  await mobilePage.evaluate(() => window.scrollTo(0, 550));
  await mobilePage.waitForFunction(() => window.scrollY <= 560 && !document.querySelector("[data-header]")?.classList.contains("is-header-hidden"));
  await mobilePage.waitForTimeout(320);
  const menuStartScroll = await mobilePage.evaluate(() => window.scrollY);
  if (await menuButton.count() === 1) await menuButton.tap();
  await mobilePage.waitForFunction(() => document.activeElement?.closest("[data-mobile-menu]"));
  if (!await mobileMenu.isVisible() || !await menuBackdrop.isVisible()) errors.push("interaction: mobile menu layers did not open");
  await mobilePage.screenshot({ path: join(shots, "home-mobile-menu.png"), fullPage: false });
  const openMenuState = await mobilePage.evaluate(() => {
    const menu = document.querySelector("[data-mobile-menu]");
    const backdrop = document.querySelector("[data-menu-backdrop]");
    const backdropRect = backdrop.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const activeRect = document.activeElement?.getBoundingClientRect();
    const alpha = (color) => color.startsWith("rgba(") ? Number(color.split(",").at(-1).replace(")", "").trim()) : 1;
    return {
      expanded: document.querySelector("[data-menu-toggle]")?.getAttribute("aria-expanded"),
      bodyPosition: getComputedStyle(document.body).position,
      bodyTop: document.body.style.top,
      mainInert: document.querySelector("main")?.inert,
      menuAlpha: alpha(getComputedStyle(menu).backgroundColor),
      backdropAlpha: alpha(getComputedStyle(backdrop).backgroundColor),
      backdropDisplay: getComputedStyle(backdrop).display,
      backdropRect: { top: backdropRect.top, right: backdropRect.right, bottom: backdropRect.bottom, left: backdropRect.left, width: backdropRect.width, height: backdropRect.height },
      backdropZ: getComputedStyle(backdrop).zIndex,
      menuRect: { top: menuRect.top, right: menuRect.right, bottom: menuRect.bottom, left: menuRect.left, width: menuRect.width, height: menuRect.height },
      menuZ: getComputedStyle(menu).zIndex,
      activeRect: activeRect ? { top: activeRect.top, right: activeRect.right, bottom: activeRect.bottom, left: activeRect.left, width: activeRect.width, height: activeRect.height } : null,
      headerTransform: getComputedStyle(document.querySelector("[data-header]")).transform,
    };
  });
  if (openMenuState.expanded !== "true"
    || openMenuState.bodyPosition !== "fixed"
    || openMenuState.bodyTop !== `-${menuStartScroll}px`
    || !openMenuState.mainInert
    || openMenuState.menuAlpha !== 1
    || openMenuState.backdropAlpha !== 1
    || openMenuState.menuRect.top < 70
    || openMenuState.menuRect.top > 74
    || openMenuState.menuRect.bottom <= openMenuState.menuRect.top
    || Number(openMenuState.menuZ) <= Number(openMenuState.backdropZ)
    || !openMenuState.activeRect
    || openMenuState.activeRect.top < openMenuState.menuRect.top
    || openMenuState.activeRect.bottom > 844) {
    errors.push(`interaction: mobile menu is not isolated ${JSON.stringify(openMenuState)}`);
  }

  await mobilePage.keyboard.press("Shift+Tab");
  if (!await menuButton.evaluate((element) => element === document.activeElement)) errors.push("interaction: mobile menu does not include its toggle in the focus cycle");
  await mobilePage.keyboard.press("Tab");
  if (!await mobileMenu.locator("a").first().evaluate((element) => element === document.activeElement)) errors.push("interaction: mobile menu did not return focus to its first link");
  await mobileMenu.locator("button").last().focus();
  await mobilePage.keyboard.press("Tab");
  if (!await menuButton.evaluate((element) => element === document.activeElement)) errors.push("interaction: mobile menu focus did not wrap to its toggle");

  await mobilePage.keyboard.press("Escape");
  const escapedMenuState = await mobilePage.evaluate(() => ({
    hidden: document.querySelector("[data-mobile-menu]")?.hidden,
    backdropHidden: document.querySelector("[data-menu-backdrop]")?.hidden,
    expanded: document.querySelector("[data-menu-toggle]")?.getAttribute("aria-expanded"),
    bodyPosition: getComputedStyle(document.body).position,
    mainInert: document.querySelector("main")?.inert,
    scrollY: window.scrollY,
    focusReturned: document.activeElement === document.querySelector("[data-menu-toggle]"),
  }));
  if (!escapedMenuState.hidden
    || !escapedMenuState.backdropHidden
    || escapedMenuState.expanded !== "false"
    || escapedMenuState.bodyPosition === "fixed"
    || escapedMenuState.mainInert
    || Math.abs(escapedMenuState.scrollY - menuStartScroll) > 1
    || !escapedMenuState.focusReturned) {
    errors.push(`interaction: Escape did not restore mobile menu state ${JSON.stringify(escapedMenuState)}`);
  }

  await menuButton.tap();
  await mobilePage.waitForFunction(() => !document.querySelector("[data-mobile-menu]")?.hidden);
  await menuButton.tap();
  await mobilePage.waitForFunction(() => document.querySelector("[data-mobile-menu]")?.hidden);
  if (await mobileMenu.isVisible()) errors.push("interaction: repeated menu toggle did not close the menu");

  await menuButton.tap();
  await mobilePage.waitForFunction(() => !document.querySelector("[data-menu-backdrop]")?.hidden);
  if (await menuBackdrop.isVisible()) await menuBackdrop.click();
  else {
    const state = await menuBackdrop.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }, display: style.display, visibility: style.visibility, opacity: style.opacity, position: style.position };
    });
    errors.push(`interaction: mobile menu backdrop has no clickable area ${JSON.stringify(state)}`);
    await menuBackdrop.evaluate((element) => element.click());
  }
  await mobilePage.waitForFunction(() => document.querySelector("[data-mobile-menu]")?.hidden);
  if (await mobileMenu.isVisible()) errors.push("interaction: backdrop did not close the mobile menu");

  await menuButton.tap();
  await mobilePage.waitForFunction(() => !document.querySelector("[data-mobile-menu]")?.hidden);
  const firstMenuLink = mobileMenu.locator("a").first();
  await firstMenuLink.evaluate((element) => element.addEventListener("click", (event) => event.preventDefault(), { once: true }));
  await firstMenuLink.tap();
  if (await mobileMenu.isVisible()) errors.push("interaction: selecting a navigation item did not close the mobile menu");

  await mobilePage.evaluate(() => {
    window.scrollTo(0, 720);
    window.dispatchEvent(new Event("scroll"));
  });
  await mobilePage.waitForFunction(() => {
    const panel = document.querySelector("[data-mobile-contact]");
    if (!panel?.classList.contains("is-visible")) return false;
    const style = getComputedStyle(panel);
    return Number(style.opacity) > .9 && panel.getBoundingClientRect().bottom <= innerHeight + 1;
  }, null, { timeout: 2500 });
  const mobilePanel = mobilePage.locator("[data-mobile-contact]");
  if (await mobilePanel.locator("button").count() !== 2) errors.push("interaction: mobile panel must contain exactly two buttons");
  const mobileLayout = await mobilePanel.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll("button")].map((button) => {
      const buttonRect = button.getBoundingClientRect();
      return { width: buttonRect.width, height: buttonRect.height, left: buttonRect.left, right: buttonRect.right };
    });
    return { display: style.display, opacity: style.opacity, rect: { left: rect.left, right: rect.right, bottom: rect.bottom }, buttons, viewport: innerWidth };
  });
  if (mobileLayout.display !== "grid" || Number(mobileLayout.opacity) < .9 || mobileLayout.buttons.some((button) => button.height < 44 || button.width < 120)) errors.push(`interaction: mobile panel sizing is invalid ${JSON.stringify(mobileLayout)}`);
  if (mobileLayout.rect.left < -1 || mobileLayout.rect.right > mobileLayout.viewport + 1 || mobileLayout.buttons.some((button) => button.left < -1 || button.right > mobileLayout.viewport + 1)) errors.push(`interaction: mobile panel overflows viewport ${JSON.stringify(mobileLayout)}`);

  await mobilePage.locator("[data-mobile-contact-now]").click();
  const mobileDialog = mobilePage.locator("#contact-dialog");
  if (!await mobileDialog.evaluate((element) => element.open)) errors.push("interaction: 'Написать сейчас' did not open messenger dialog");
  const mobileTelegram = await mobileDialog.locator("[data-track='telegram']").getAttribute("href");
  if (!messageText(mobileTelegram).includes("Хочу получить первичную оценку ситуации")) errors.push("interaction: immediate mobile action has incomplete starter message");
  await mobileDialog.locator("[data-dialog-close]").click();

  await mobilePage.locator("[data-mobile-contact-later]").click();
  const callbackDialog = mobilePage.locator("#callback-dialog");
  if (!await callbackDialog.evaluate((element) => element.open)) errors.push("interaction: 'Связаться позже' did not open callback form");
  await mobilePage.close();
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log(`Visual and interaction smoke test passed: ${checks.length} viewports, dialogs, messenger drafts, price quiz, menu and dual mobile actions`);
