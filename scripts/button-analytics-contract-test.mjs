import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { services } from "../src/data.mjs";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = "4193";
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

const source = await readFile(join(root, "public", "assets", "button-analytics.mjs"), "utf8");
for (const token of [
  'event: "button_action"',
  'window.ym(yandexMetricaId, "reachGoal", "button_action"',
  '"button_id"',
  '"button_label"',
  '"button_kind"',
  '"button_placement"',
  '"button_destination"',
  "ATTRIBUTION_STORAGE_KEY",
  "JOURNEY_STORAGE_KEY",
  "data-price-quiz-option",
  "data-consent-reject",
]) {
  if (!source.includes(token)) errors.push(`button analytics source: отсутствует ${token}`);
}
if (/query\.get\(["'](?:yclid|gclid|fbclid)["']\)|dataset\.quizValue[^\n]*button_label/.test(source)) {
  errors.push("button analytics не должна передавать значения click ID или ответы квиза как видимую метку");
}

for (const pathname of canonicalPaths) {
  const html = await readFile(htmlPath(pathname), "utf8");
  const scripts = html.match(/button-analytics\.mjs/g) || [];
  if (scripts.length !== 1) errors.push(`${pathname}: button-analytics.mjs должен подключаться ровно один раз, найдено ${scripts.length}`);
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
  const timer = setTimeout(() => reject(new Error("Button analytics preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Button analytics preview server exited: ${code}`)));
});

const requiredMetadata = [
  "page_path", "page_group", "viewport", "button_id", "button_label",
  "button_kind", "button_placement", "button_variant", "button_destination",
  "section_title", "topic", "content_kind", "content_id", "traffic_source_type",
  "traffic_landing_path", "traffic_landing_group", "traffic_utm_source",
  "traffic_utm_medium", "traffic_utm_campaign", "traffic_utm_content",
  "traffic_journey_depth", "traffic_journey_first_path", "traffic_journey_tail",
];

let browser;
let totalControls = 0;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ru-RU", reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.setItem("analytics_consent", "granted");
    window.__ymCalls = [];
    window.ym = (...args) => window.__ymCalls.push(args);
  });

  for (const pathname of canonicalPaths) {
    const page = await context.newPage();
    await page.route("https://mc.yandex.ru/**", (route) => route.abort());
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());

    let audit = [];
    try {
      await page.goto(`${origin}${pathname}`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean(window.__buttonAnalyticsContract));
      audit = await page.evaluate(async () => {
        const selector = window.__buttonAnalyticsContract.selector;
        const controls = [...document.querySelectorAll(selector)];
        const results = [];

        // The contract audits analytics, not navigation. Neutralizing href prevents a
        // synthetic click from destroying the execution context while preserving
        // the element's label, role, placement and tracking attributes.
        document.querySelectorAll("a[href]").forEach((anchor) => {
          anchor.dataset.analyticsAuditHref = anchor.getAttribute("href") || "";
          anchor.setAttribute("href", "#analytics-audit");
          anchor.removeAttribute("target");
        });

        for (let index = 0; index < controls.length; index += 1) {
          const control = controls[index];
          localStorage.setItem("analytics_consent", "granted");
          window.dataLayer = [];
          window.__ymCalls = [];

          const info = {
            index,
            tag: control.tagName.toLowerCase(),
            text: (control.getAttribute("aria-label") || control.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100),
            track: control.dataset.track || "",
            dialogOpen: control.hasAttribute("data-dialog-open"),
            consentReject: control.hasAttribute("data-consent-reject"),
            quizOption: control.hasAttribute("data-price-quiz-option"),
          };

          // The reject control is audited in a separate clean-consent context below.
          // Clicking it after analytics has started intentionally reloads the real page,
          // which would destroy this page-wide audit execution context.
          if (info.consentReject) {
            results.push({
              info,
              buttonAction: null,
              ctaClick: null,
              contactConversion: null,
              contactAction: null,
            });
            continue;
          }

          const cancelled = !control.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
          if (!cancelled && control.matches("a[href]")) history.replaceState(null, "", location.pathname);
          await new Promise((resolve) => setTimeout(resolve, 0));

          const events = (window.dataLayer || []).filter((item) => item && typeof item === "object");
          results.push({
            info,
            buttonAction: events.find((item) => item.event === "button_action") || null,
            ctaClick: events.find((item) => item.event === "cta_click") || null,
            contactConversion: events.find((item) => item.event === "contact_conversion") || null,
            contactAction: events.find((item) => item.event === "contact_action") || null,
          });
        }
        return results;
      });
    } finally {
      await page.close().catch(() => {});
    }

    totalControls += audit.length;
    if (!audit.length) errors.push(`${pathname}: не найдено ни одного кнопочного действия`);
    const ids = [];
    for (const item of audit) {
      const marker = `${pathname} #${item.info.index + 1} ${item.info.tag} «${item.info.text || "без текста"}»`;
      if (item.info.consentReject) {
        if (item.buttonAction) errors.push(`${marker}: отказ от аналитики не должен отправляться во внешнюю аналитику`);
        continue;
      }
      const params = item.buttonAction;
      if (!params) {
        errors.push(`${marker}: отсутствует событие button_action`);
        continue;
      }
      for (const key of requiredMetadata) {
        if (params[key] === undefined || params[key] === "") errors.push(`${marker}: отсутствует метка ${key}`);
      }
      if (params.page_path !== pathname) errors.push(`${marker}: page_path=${params.page_path}, ожидалось ${pathname}`);
      if (params.button_destination?.includes("?")) errors.push(`${marker}: destination содержит query-параметры`);
      if (item.info.quizOption && params.button_label !== "Выбор варианта квиза") errors.push(`${marker}: ответ квиза не должен передаваться как button_label`);
      const serialized = JSON.stringify(params);
      if (/Здравствуйте|Кратко опишу|secret-click|sensitive=|token=secret|yclid=|gclid=|fbclid=/i.test(serialized)) {
        errors.push(`${marker}: в метки попали текст сообщения, click ID или query-параметры`);
      }
      ids.push(params.button_id);
      if (item.info.dialogOpen && !item.ctaClick) errors.push(`${marker}: кнопка открытия диалога не передала cta_click`);
      if (item.info.track) {
        if (!item.ctaClick) errors.push(`${marker}: контактная кнопка не передала cta_click`);
        const primary = ["phone", "email", "telegram", "whatsapp"].includes(item.info.track);
        if (primary && !item.contactConversion) errors.push(`${marker}: контактная кнопка не передала contact_conversion`);
        if (!primary && !item.contactAction) errors.push(`${marker}: вспомогательная кнопка не передала contact_action`);
      }
    }
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length) errors.push(`${pathname}: повторяются button_id: ${[...new Set(duplicates)].join(", ")}`);
  }

  // Verify the real reject behavior before analytics starts. In this state the app
  // must persist denial without reloading, and button analytics must emit nothing.
  const rejectContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "ru-RU",
    reducedMotion: "reduce",
  });
  await rejectContext.addInitScript(() => {
    localStorage.removeItem("analytics_consent");
    window.__ymCalls = [];
    window.ym = (...args) => window.__ymCalls.push(args);
  });
  const rejectPage = await rejectContext.newPage();
  await rejectPage.route("https://mc.yandex.ru/**", (route) => route.abort());
  await rejectPage.route("https://www.googletagmanager.com/**", (route) => route.abort());
  try {
    await rejectPage.goto(`${origin}/`, { waitUntil: "networkidle" });
    await rejectPage.waitForFunction(() => Boolean(window.__buttonAnalyticsContract));
    const rejectAudit = await rejectPage.evaluate(async () => {
      const control = document.querySelector("[data-consent-reject]");
      if (!control) return { missing: true };
      window.dataLayer = [];
      window.__ymCalls = [];
      const beforeUrl = location.href;
      control.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        missing: false,
        consent: localStorage.getItem("analytics_consent"),
        urlUnchanged: location.href === beforeUrl,
        buttonActions: (window.dataLayer || []).filter((item) => item?.event === "button_action").length,
        ymButtonActions: (window.__ymCalls || []).filter((args) => args?.[1] === "reachGoal" && args?.[2] === "button_action").length,
      };
    });
    if (rejectAudit.missing) errors.push("Главная: не найдена кнопка отказа от аналитики");
    if (rejectAudit.consent !== "denied") errors.push(`Главная: отказ не сохранил analytics_consent=denied, получено ${rejectAudit.consent}`);
    if (!rejectAudit.urlUnchanged) errors.push("Главная: отказ до запуска аналитики не должен перезагружать страницу");
    if (rejectAudit.buttonActions || rejectAudit.ymButtonActions) errors.push("Главная: отказ от аналитики отправил внешнее событие button_action");
  } finally {
    await rejectPage.close().catch(() => {});
    await rejectContext.close().catch(() => {});
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
console.log(`Button analytics contract passed: ${canonicalPaths.length} pages, ${totalControls} controls, complete action labels, conversion events and privacy-safe metadata`);
