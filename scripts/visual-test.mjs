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
    new Promise((resolve, reject) => tar.on("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(stderr || `tar exited: ${code}`)))),
  ]);
};

if (!(await access(join(browserDir, "libGLESv2.so")).then(() => true).catch(() => false))) {
  await extractTarBrotli("swiftshader.tar.br");
}
if (!(await access(join(browserDir, "fonts.conf")).then(() => true).catch(() => false))) {
  await extractTarBrotli("fonts.tar.br");
}

await mkdir(join(browserDir, "cache"), { recursive: true });
await mkdir(join(browserDir, "home"), { recursive: true });
process.env.HOME = join(browserDir, "home");
process.env.XDG_CACHE_HOME = join(browserDir, "cache");
process.env.FONTCONFIG_FILE = "/etc/fonts/fonts.conf";
process.env.LD_LIBRARY_PATH = [browserDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

const port = "4173";
const origin = `http://127.0.0.1:${port}`;
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
  { name: "home-mobile-small", path: "/", viewport: { width: 320, height: 568 } },
  { name: "home-mobile", path: "/", viewport: { width: 390, height: 844 } },
  { name: "home-mobile-wide", path: "/", viewport: { width: 430, height: 932 } },
  { name: "home-tablet", path: "/", viewport: { width: 768, height: 1024 } },
  { name: "home-laptop", path: "/", viewport: { width: 1366, height: 768 } },
  { name: "home-desktop", path: "/", viewport: { width: 1440, height: 900 } },
  { name: "home-fullhd", path: "/", viewport: { width: 1920, height: 1080 } },
  { name: "services-tablet", path: "/uslugi/", viewport: { width: 820, height: 1180 } },
  { name: "service-mobile", path: "/uslugi/dosudebnoe-uregulirovanie/", viewport: { width: 390, height: 844 } },
  { name: "about-desktop", path: "/o-yuriste/", viewport: { width: 1440, height: 1000 } },
  { name: "about-mobile", path: "/o-yuriste/", viewport: { width: 390, height: 844 } },
  { name: "contacts-mobile", path: "/kontakty/", viewport: { width: 390, height: 844 } },
  { name: "privacy-mobile", path: "/politika-konfidencialnosti/", viewport: { width: 390, height: 844 } },
];

const errors = [];
let browser;

const messageText = (href) => {
  try { return new URL(href).searchParams.get("text") || ""; } catch { return ""; }
};

const visible = async (locator) => locator.evaluate((element) => {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity) > 0
    && rect.width > 0
    && rect.height > 0;
});

const assertNoOverflow = async (page, label) => {
  const layout = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const overflow = Math.max(
      document.documentElement.scrollWidth - viewport,
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
      .filter((item) => item.left < -1 || item.right > viewport + 1)
      .slice(0, 8);
    return { viewport, overflow, offenders };
  });
  if (layout.overflow > 1) errors.push(`${label}: horizontal overflow ${JSON.stringify(layout)}`);
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
  if (invalid.length) errors.push(`${label}: touch targets below 44×44 ${JSON.stringify(invalid)}`);
};

const preparePage = async (page) => {
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
};

try {
  browser = await chromium.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-extensions",
      "--font-render-hinting=none",
    ],
    executablePath: browserPath,
    headless: true,
  });

  for (const check of checks) {
    const page = await browser.newPage({ viewport: check.viewport, deviceScaleFactor: 1 });
    page.on("pageerror", (error) => errors.push(`${check.name}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${check.name}: console ${message.text()}`);
    });
    const response = await page.goto(`${origin}${check.path}`, { waitUntil: "networkidle" });
    if (!response?.ok()) errors.push(`${check.name}: HTTP ${response?.status()}`);
    await preparePage(page);
    await page.screenshot({ path: join(shots, `${check.name}-fold.png`), fullPage: false });
    await page.screenshot({ path: join(shots, `${check.name}.png`), fullPage: true });
    await assertNoOverflow(page, check.name);

    if (await page.locator("form, input, select, textarea, [data-callback-open], [data-price-quiz-open]").count()) {
      errors.push(`${check.name}: removed form or questionnaire control remains`);
    }

    if (check.path === "/") {
      const primaryCta = page.locator(".hero__actions .button--primary[data-dialog-open]");
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
  await interactionPage.goto(`${origin}/`, { waitUntil: "networkidle" });
  const dialog = interactionPage.locator("#contact-dialog");

  const headerTrigger = interactionPage.locator(".header__actions [data-dialog-open]");
  if (await headerTrigger.count() !== 1) errors.push("interaction: header dialog trigger is not unique");
  else await headerTrigger.click();
  if (!await dialog.evaluate((element) => element.open)) errors.push("interaction: contact dialog did not open");
  const genericWhatsapp = await dialog.locator("[data-whatsapp-link]").getAttribute("href");
  const genericTelegram = await dialog.locator("[data-track='telegram']").getAttribute("href");
  if (!genericWhatsapp?.startsWith("https://api.whatsapp.com/send?phone=79065297970&text=")) errors.push("interaction: WhatsApp draft is missing");
  if (!genericTelegram?.startsWith("https://t.me/lawrazbor?text=")) errors.push("interaction: Telegram draft is missing");
  if (!messageText(genericTelegram).includes("Хочу получить первичную оценку ситуации")) errors.push("interaction: generic prefilled text changed");
  await dialog.locator("[data-dialog-close]").click();

  const primaryHeroTrigger = interactionPage.locator(".hero__actions .button--primary[data-dialog-open]");
  await primaryHeroTrigger.click();
  if (!await dialog.evaluate((element) => element.open)) errors.push("interaction: primary hero CTA did not open messenger dialog");
  await dialog.locator("[data-dialog-close]").click();

  const priceTrigger = interactionPage.locator('[data-topic="ориентир стоимости юридической помощи"]').first();
  await priceTrigger.click();
  const priceTelegram = await dialog.locator("[data-track='telegram']").getAttribute("href");
  if (!messageText(priceTelegram).includes("Хочу уточнить ориентир стоимости юридической помощи")) {
    errors.push("interaction: price CTA does not create the approved messenger draft");
  }
  await dialog.locator("[data-dialog-close]").click();

  const topicTrigger = interactionPage.locator(".hero__quick-choices [data-topic='возврат денежных средств']");
  await topicTrigger.click();
  const selectedTopic = await dialog.locator("[data-dialog-topic]").textContent();
  const topicTelegram = await dialog.locator("[data-track='telegram']").getAttribute("href");
  if (selectedTopic !== "Вы выбрали: возврат денежных средств") errors.push("interaction: selected topic is not shown");
  if (!messageText(topicTelegram).includes("Обращаюсь по вопросу: возврат денежных средств")) errors.push("interaction: topic is missing from draft");
  await dialog.locator("[data-dialog-close]").click();
  await interactionPage.close();

  for (const width of [320, 390, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await auditTouchTargets(page, `mobile ${width}px`, "[data-menu-toggle], .hero__actions .button, .hero__quick-choices button");

    const menuToggle = page.locator("[data-menu-toggle]");
    const menu = page.locator("[data-mobile-menu]");
    await menuToggle.tap();
    await page.waitForFunction(() => Boolean(document.activeElement?.closest("[data-mobile-menu]")));
    const menuState = await page.evaluate(() => ({
      expanded: document.querySelector("[data-menu-toggle]")?.getAttribute("aria-expanded"),
      bodyPosition: getComputedStyle(document.body).position,
      mainInert: document.querySelector("main")?.inert,
      menuVisible: !document.querySelector("[data-mobile-menu]")?.hidden,
    }));
    if (menuState.expanded !== "true" || menuState.bodyPosition !== "fixed" || !menuState.mainInert || !menuState.menuVisible) {
      errors.push(`mobile ${width}px: menu isolation failed ${JSON.stringify(menuState)}`);
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("[data-mobile-menu]")?.hidden === true);
    if (!await menuToggle.evaluate((element) => element === document.activeElement)) errors.push(`mobile ${width}px: menu focus was not restored`);

    await page.evaluate(() => {
      window.scrollTo(0, 720);
      window.dispatchEvent(new Event("scroll"));
    });
    await page.waitForFunction(() => document.querySelector("[data-mobile-contact]")?.classList.contains("is-visible"));
    const mobilePanel = page.locator("[data-mobile-contact]");
    const buttons = mobilePanel.locator("button");
    if (await buttons.count() !== 1) errors.push(`mobile ${width}px: panel must contain exactly one direct CTA`);
    const panelState = await mobilePanel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const button = element.querySelector("button");
      const buttonRect = button?.getBoundingClientRect();
      return {
        viewport: innerWidth,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        buttonWidth: buttonRect?.width || 0,
        buttonHeight: buttonRect?.height || 0,
      };
    });
    if (panelState.left < -1 || panelState.right > panelState.viewport + 1 || panelState.bottom > 845
      || panelState.buttonWidth < width - 40 || panelState.buttonHeight < 44) {
      errors.push(`mobile ${width}px: single CTA layout is invalid ${JSON.stringify(panelState)}`);
    }

    const mobileTrigger = page.locator("[data-mobile-contact-now]");
    await mobileTrigger.click();
    const mobileDialog = page.locator("#contact-dialog[open]");
    await mobileDialog.waitFor({ state: "visible" });
    const mobileTelegram = await mobileDialog.locator("[data-track='telegram']").getAttribute("href");
    if (!messageText(mobileTelegram).includes("Хочу получить первичную оценку ситуации")) {
      errors.push(`mobile ${width}px: starter message is incomplete`);
    }
    if (await mobileDialog.locator("form, input, select, textarea").count()) errors.push(`mobile ${width}px: dialog contains data-entry controls`);
    await mobileDialog.locator("[data-dialog-close]").click();

    await page.addStyleTag({ content: `
      html { font-size: 200% !important; }
      * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }
    ` });
    await assertNoOverflow(page, `mobile ${width}px at 200% text`);
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Visual and interaction smoke passed: ${checks.length} viewports, direct messenger drafts, mobile menu and one form-free mobile CTA`);
