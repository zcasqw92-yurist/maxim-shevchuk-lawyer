import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { services } from "../src/data.mjs";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = "4181";
const origin = `http://127.0.0.1:${port}`;
const errors = [];

const canonicalPaths = [
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

const htmlPath = (pathname) => pathname === "/"
  ? join(dist, "index.html")
  : join(dist, pathname.replace(/^\/+|\/+$/g, ""), "index.html");

const analyticsSource = await readFile(join(root, "public", "assets", "conversion-analytics.mjs"), "utf8");
const requiredSourceTokens = [
  'send("cta_view"',
  'send("cta_click"',
  '"contact_conversion"',
  'origin_cta_placement',
  'source_cta_placement',
  'contact_mode',
  'page_group',
  'cta_placement',
  'traffic_utm_source',
  'traffic_landing_path',
  'traffic_journey_depth',
  'sendVisitAttribution',
  'window.ym(yandexMetricaId, "params"',
  'sessionStorage.removeItem(ATTRIBUTION_STORAGE_KEY)',
];
for (const token of requiredSourceTokens) {
  if (!analyticsSource.includes(token)) errors.push(`conversion analytics source: отсутствует ${token}`);
}
if (/dataset\.message|intentMessage|data-message/.test(analyticsSource)) {
  errors.push("conversion analytics не должна считывать или отправлять текст подготовленного сообщения");
}
if (/query\.get\(["'](?:yclid|gclid|fbclid)["']\)/.test(analyticsSource)) {
  errors.push("conversion analytics не должна сохранять значения рекламных click ID; допустим только признак наличия");
}

for (const pathname of canonicalPaths) {
  const html = await readFile(htmlPath(pathname), "utf8");
  const scripts = html.match(/conversion-analytics\.mjs/g) || [];
  if (scripts.length !== 1) errors.push(`${pathname}: модуль аналитики должен подключаться ровно один раз, найдено ${scripts.length}`);
  if (!html.includes('id="engagement-nudge-write" type="button" data-dialog-open')) {
    errors.push(`${pathname}: CTA подсказки должен напрямую открывать выбор мессенджера`);
  }
}

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
  const timer = setTimeout(() => reject(new Error("Conversion analytics preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Conversion analytics preview server exited: ${code}`)));
});

const requiredMetadata = [
  "page_path",
  "page_group",
  "viewport",
  "cta_id",
  "cta_label",
  "cta_placement",
  "cta_variant",
  "cta_kind",
  "section_title",
  "topic",
  "content_kind",
  "content_id",
  "traffic_source_type",
  "traffic_landing_path",
  "traffic_landing_group",
  "traffic_utm_source",
  "traffic_utm_medium",
  "traffic_utm_campaign",
  "traffic_utm_content",
  "traffic_journey_depth",
  "traffic_journey_first_path",
  "traffic_journey_tail",
];

const validateMetadata = (eventName, params, expected = {}) => {
  if (!params) {
    errors.push(`${eventName}: параметры не переданы`);
    return;
  }
  requiredMetadata.forEach((key) => {
    if (params[key] === undefined || params[key] === "") errors.push(`${eventName}: отсутствует ${key}`);
  });
  Object.entries(expected).forEach(([key, value]) => {
    if (params[key] !== value) errors.push(`${eventName}: ${key}=${params[key]}, ожидалось ${value}`);
  });
  const serialized = JSON.stringify(params);
  if (/Здравствуйте|Кратко опишу|intent_message|data-message/i.test(serialized)) {
    errors.push(`${eventName}: в аналитику попал текст черновика сообщения`);
  }
  if (/secret-click|sensitive=|token=secret/i.test(serialized)) {
    errors.push(`${eventName}: в аналитику попало значение click ID или query-параметр реферера`);
  }
};

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "ru-RU",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    localStorage.setItem("analytics_consent", "granted");
    window.__ymCalls = [];
    window.ym = (...args) => window.__ymCalls.push(args);
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("a[data-track]")) event.preventDefault();
    }, { capture: true });
  });

  const page = await context.newPage();
  await page.route("https://mc.yandex.ru/**", (route) => route.abort());
  await page.route("https://www.googletagmanager.com/**", (route) => route.abort());

  const events = async () => page.evaluate(() => (window.__ymCalls || [])
    .filter((call) => call[1] === "reachGoal")
    .map((call) => ({ name: call[2], params: call[3] || {} })));
  const visitParams = async () => page.evaluate(() => (window.__ymCalls || [])
    .filter((call) => call[1] === "params")
    .map((call) => call[2]?.traffic_attribution || {}));

  const entryUrl = `${origin}/?utm_source=avito&utm_medium=classified&utm_campaign=vzyskanie_dolga&utm_content=ad_01&yclid=secret-click`;
  await page.goto(entryUrl, {
    waitUntil: "networkidle",
    referer: "https://www.avito.ru/profile?sensitive=1&token=secret",
  });
  const enabled = await page.locator("body").getAttribute("data-analytics-enabled") === "true";

  if (enabled) {
    await page.waitForFunction(() => (window.__ymCalls || []).some((call) => call[1] === "init"));
    await page.waitForFunction(() => (window.__ymCalls || []).some((call) => call[1] === "params"));

    const attribution = (await visitParams()).at(-1);
    const expectedAttribution = {
      traffic_source_type: "tagged",
      traffic_landing_path: "/",
      traffic_landing_group: "home",
      traffic_initial_referrer_host: "www.avito.ru",
      traffic_initial_referrer_path: "/profile",
      traffic_utm_source: "avito",
      traffic_utm_medium: "classified",
      traffic_utm_campaign: "vzyskanie_dolga",
      traffic_utm_content: "ad_01",
      traffic_click_ids: "yclid",
      traffic_journey_depth: 1,
      traffic_journey_first_path: "/",
    };
    Object.entries(expectedAttribution).forEach(([key, value]) => {
      if (attribution?.[key] !== value) errors.push(`traffic attribution: ${key}=${attribution?.[key]}, ожидалось ${value}`);
    });
    if (/secret-click|sensitive=|token=secret/i.test(JSON.stringify(attribution))) {
      errors.push("traffic attribution: сохранено значение click ID или query-параметр реферера");
    }

    await page.locator(".hero__quick-choices button", { hasText: "Не возвращают деньги" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);

    const viewEvent = (await events()).find((item) => item.name === "cta_view" && item.params.cta_placement === "hero_quick_choice");
    validateMetadata("cta_view", viewEvent?.params, {
      page_group: "home",
      viewport: "desktop",
      cta_placement: "hero_quick_choice",
      traffic_utm_source: "avito",
      traffic_landing_path: "/",
    });

    await page.locator(".hero__quick-choices button", { hasText: "Не возвращают деньги" }).click();
    await page.locator("#contact-dialog").waitFor({ state: "visible" });

    const homeEvents = await events();
    const ctaClick = homeEvents.find((item) => item.name === "cta_click" && item.params.cta_placement === "hero_quick_choice");
    validateMetadata("cta_click", ctaClick?.params, {
      page_group: "home",
      cta_placement: "hero_quick_choice",
      topic: "возврат денежных средств",
      traffic_utm_source: "avito",
    });

    const legacyOpen = homeEvents.find((item) => item.name === "messenger_dialog_open");
    if (!legacyOpen || legacyOpen.params.topic !== "возврат денежных средств") {
      errors.push("messenger_dialog_open: существующая микроконверсия должна сохраняться");
    }

    await page.locator("#contact-dialog [data-track='whatsapp']").click();
    const dialogConversion = (await events()).find((item) => item.name === "contact_conversion" && item.params.contact_mode === "dialog");
    validateMetadata("contact_conversion dialog", dialogConversion?.params, {
      channel: "whatsapp",
      contact_mode: "dialog",
      cta_placement: "messenger_dialog",
      origin_cta_placement: "hero_quick_choice",
      source_cta_placement: "hero_quick_choice",
      topic: "возврат денежных средств",
      traffic_utm_source: "avito",
      traffic_journey_depth: 1,
    });

    await page.goto(`${origin}/kontakty/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => (window.__ymCalls || []).some((call) => call[1] === "init"));
    await page.locator(".contact-method[data-track='whatsapp']").click();
    const directConversion = (await events()).find((item) => item.name === "contact_conversion" && item.params.contact_mode === "direct");
    validateMetadata("contact_conversion direct", directConversion?.params, {
      page_group: "contacts",
      channel: "whatsapp",
      contact_mode: "direct",
      cta_placement: "contacts_methods",
      source_cta_placement: "contacts_methods",
      traffic_utm_source: "avito",
      traffic_landing_path: "/",
      traffic_journey_depth: 2,
      traffic_journey_first_path: "/",
      traffic_journey_previous_path: "/",
    });
  } else {
    console.log("Conversion analytics browser assertions skipped: production analytics is disabled in this build");
  }

  await context.close();
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Conversion analytics passed: ${canonicalPaths.length} pages, first-touch source, session journey, CTA views and final conversions without message or click-ID content`);
