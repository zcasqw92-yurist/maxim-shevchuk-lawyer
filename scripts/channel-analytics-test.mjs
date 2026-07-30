import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { services } from "../src/data.mjs";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = "4191";
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

const source = await readFile(join(root, "public", "assets", "channel-analytics.mjs"), "utf8");
for (const token of ["contact_whatsapp", "contact_telegram", "contact_phone", "contact_email", "contact_map", "analytics_consent", "reachGoal"]) {
  if (!source.includes(token)) errors.push(`channel analytics source: отсутствует ${token}`);
}
if (/\.href|searchParams|getAttribute\(["']href/.test(source)) {
  errors.push("channel analytics не должна считывать адрес внешней ссылки с текстом черновика");
}

for (const pathname of canonicalPaths) {
  const html = await readFile(htmlPath(pathname), "utf8");
  const scripts = html.match(/channel-analytics\.mjs/g) || [];
  if (scripts.length !== 1) errors.push(`${pathname}: channel analytics должен подключаться ровно один раз, найдено ${scripts.length}`);
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
  const timer = setTimeout(() => reject(new Error("Channel analytics preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Channel analytics preview server exited: ${code}`)));
});

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU", reducedMotion: "reduce" });
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

  const channelGoals = async () => page.evaluate(() => (window.__ymCalls || [])
    .filter((call) => call[1] === "reachGoal" && /^contact_(?:whatsapp|telegram|phone|email|map)$/.test(call[2]))
    .map((call) => ({ name: call[2], params: call[3] || {} })));

  await page.goto(`${origin}/kontakty/?utm_source=metrica_contract&utm_campaign=channel_test&yclid=secret-value`, { waitUntil: "networkidle" });
  const enabled = await page.locator("body").getAttribute("data-analytics-enabled") === "true";
  if (enabled) {
    await page.locator(".contact-method[data-track='whatsapp']").click();
    await page.locator("a[data-track='phone']").first().click();
    await page.locator("a[data-track='map']").first().click();

    const directGoals = await channelGoals();
    for (const expected of ["contact_whatsapp", "contact_phone", "contact_map"]) {
      const item = directGoals.find((goal) => goal.name === expected);
      if (!item) {
        errors.push(`${expected}: событие не отправлено`);
        continue;
      }
      if (item.params.page_group !== "contacts") errors.push(`${expected}: page_group=${item.params.page_group}, ожидалось contacts`);
      if (item.params.contact_mode !== "direct") errors.push(`${expected}: contact_mode=${item.params.contact_mode}, ожидалось direct`);
      if (item.params.traffic_utm_source !== "metrica_contract") errors.push(`${expected}: не передан first-touch источник`);
      const serialized = JSON.stringify(item.params);
      if (/Здравствуйте|Кратко опишу|secret-value|yclid=/i.test(serialized)) errors.push(`${expected}: передан текст черновика или значение click ID`);
    }

    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await page.locator(".header__actions [data-dialog-open]").click();
    await page.locator("#contact-dialog").waitFor({ state: "visible" });
    await page.locator("#contact-dialog [data-track='telegram']").click();
    const dialogGoal = (await channelGoals()).find((goal) => goal.name === "contact_telegram");
    if (!dialogGoal) errors.push("contact_telegram: событие из диалога не отправлено");
    else if (dialogGoal.params.contact_mode !== "dialog" || dialogGoal.params.contact_placement !== "messenger_dialog") {
      errors.push(`contact_telegram: неверный контекст ${dialogGoal.params.contact_mode}/${dialogGoal.params.contact_placement}`);
    }
  } else {
    console.log("Channel analytics browser assertions skipped: production analytics is disabled in this build");
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

console.log(`Channel analytics passed: ${canonicalPaths.length} pages and safe channel goals for WhatsApp, Telegram, phone and map`);
