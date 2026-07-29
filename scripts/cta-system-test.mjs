import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { services } from "../src/data.mjs";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = "4177";
const origin = `http://127.0.0.1:${port}`;
const failures = [];
const expected = {
  fontSize: "14px",
  primaryBackground: "rgb(221, 185, 121)",
  primaryText: "rgb(9, 28, 44)",
  secondaryText: "rgb(16, 40, 61)",
  secondaryTextDarkContext: "rgba(255, 255, 255, 0.72)",
  goldText: "rgb(118, 84, 41)",
};

const paths = [
  "/",
  "/uslugi/",
  ...services.map((service) => `/uslugi/${service.slug}/`),
  "/razbory/",
  ...articles.map((article) => `/razbory/${article.slug}/`),
  "/praktika/",
  ...practiceCases.map((item) => `/praktika/${item.slug}/`),
  "/o-yuriste/",
  "/kontakty/",
  "/politika-konfidencialnosti/",
];

const executablePath = chromium.executablePath();
if (!await access(executablePath).then(() => true).catch(() => false)) {
  throw new Error(`Chromium не установлен: ${executablePath}`);
}

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("CTA preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`CTA preview server exited: ${code}`)));
});

const inspectPage = async (page, path, viewportLabel) => {
  const response = await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
  if (!response?.ok()) {
    failures.push(`${path} ${viewportLabel}: HTTP ${response?.status()}`);
    return;
  }

  const result = await page.evaluate(() => {
    const darkContextSelector = ".consent-banner, .section--dark, .section--closing-cta, .editorial-cta, .cta-panel, .cta-portrait";
    const styleOf = (element) => {
      const style = getComputedStyle(element);
      return {
        className: element.className?.toString() || "",
        text: element.textContent.trim().replace(/\s+/g, " ").slice(0, 80),
        fontSize: style.fontSize,
        fontWeight: Number(style.fontWeight) || 0,
        fontFamily: style.fontFamily,
        color: style.color,
        background: style.backgroundColor,
        borderColor: style.borderTopColor,
        minHeight: style.minHeight,
        darkContext: Boolean(element.closest(darkContextSelector)),
      };
    };

    const collect = (selector) => [...document.querySelectorAll(selector)].map(styleOf);
    const contactMethods = [...document.querySelectorAll(".contact-method")].map((element) => ({
      ...styleOf(element),
      iconColor: getComputedStyle(element.querySelector("svg:first-child")).color,
      labelFontSize: getComputedStyle(element.querySelector("small")).fontSize,
      valueFontSize: getComputedStyle(element.querySelector("strong")).fontSize,
    }));

    return {
      buttons: collect(".button"),
      primary: collect(".button--primary, .button--gold, .messenger-choice, .mobile-contact__action--now, .engagement-nudge__write"),
      secondary: collect(".button--secondary"),
      tertiary: collect(".text-link, .card-link"),
      quickChoices: collect(".hero__quick-choices button"),
      contactMethods,
      messengerChoices: collect(".messenger-choice"),
      conversionCount: document.querySelectorAll("[data-dialog-open], .contact-method, .messenger-choice").length,
    };
  });

  const label = `${path} ${viewportLabel}`;
  if (result.conversionCount < 2) failures.push(`${label}: недостаточно точек обращения (${result.conversionCount})`);

  for (const item of [...result.buttons, ...result.tertiary, ...result.quickChoices]) {
    if (item.fontSize !== expected.fontSize) failures.push(`${label}: CTA «${item.text}» имеет font-size ${item.fontSize}`);
    if (item.fontWeight < 700 || item.fontWeight > 800) failures.push(`${label}: CTA «${item.text}» имеет font-weight ${item.fontWeight}`);
    if (!/Inter|ui-sans-serif|Segoe UI/i.test(item.fontFamily)) failures.push(`${label}: CTA «${item.text}» использует ${item.fontFamily}`);
  }

  for (const item of result.primary) {
    if (item.fontSize !== expected.fontSize) failures.push(`${label}: основной CTA «${item.text}» имеет font-size ${item.fontSize}`);
    if (item.background !== expected.primaryBackground || item.color !== expected.primaryText) {
      failures.push(`${label}: основной CTA «${item.text}» имеет цвета ${item.background} / ${item.color}`);
    }
  }

  for (const item of result.secondary) {
    if (item.fontSize !== expected.fontSize) failures.push(`${label}: вторичный CTA «${item.text}» имеет font-size ${item.fontSize}`);
    const expectedColor = item.darkContext ? expected.secondaryTextDarkContext : expected.secondaryText;
    if (item.color !== expectedColor) failures.push(`${label}: вторичный CTA «${item.text}» имеет цвет ${item.color}, ожидался ${expectedColor}`);
  }

  if (result.messengerChoices.length >= 2) {
    const backgrounds = new Set(result.messengerChoices.map((item) => item.background));
    const colors = new Set(result.messengerChoices.map((item) => item.color));
    if (backgrounds.size !== 1 || colors.size !== 1) failures.push(`${label}: WhatsApp и Telegram оформлены разными CTA-цветами`);
  }

  if (result.contactMethods.length >= 2) {
    const backgrounds = new Set(result.contactMethods.map((item) => item.background));
    const iconColors = new Set(result.contactMethods.map((item) => item.iconColor));
    if (backgrounds.size !== 1 || iconColors.size !== 1) failures.push(`${label}: прямые способы связи оформлены несогласованно`);
    const expectedLabelFontSize = viewportLabel === "mobile" ? "14px" : "12px";
    for (const item of result.contactMethods) {
      if (item.labelFontSize !== expectedLabelFontSize || item.valueFontSize !== "16px") {
        failures.push(`${label}: карточка контакта «${item.text}» имеет шкалу ${item.labelFontSize} / ${item.valueFontSize}`);
      }
      if (item.iconColor !== expected.goldText) failures.push(`${label}: иконка контакта имеет цвет ${item.iconColor}`);
    }
  }
};

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ru-RU", reducedMotion: "reduce" });
  await desktop.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
  const desktopPage = await desktop.newPage();
  for (const path of paths) await inspectPage(desktopPage, path, "desktop");
  await desktop.close();

  const responsivePaths = [
    "/",
    "/uslugi/dosudebnoe-uregulirovanie/",
    `/razbory/${articles[0].slug}/`,
    `/praktika/${practiceCases[0].slug}/`,
    "/o-yuriste/",
    "/kontakty/",
  ];
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ru-RU", reducedMotion: "reduce" });
  await mobile.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
  const mobilePage = await mobile.newPage();
  for (const path of responsivePaths) await inspectPage(mobilePage, path, "mobile");
  await mobile.close();
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}

console.log(`CTA system passed: ${paths.length} public pages, ${6} responsive templates, one font scale and one primary color`);
