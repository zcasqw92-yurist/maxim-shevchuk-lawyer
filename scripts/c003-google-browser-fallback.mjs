import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(root, "reports", "c003-serp-research", "results.json");
const markdownPath = join(root, "reports", "c003-serp-research", "results.md");
const query = "строитель взял аванс и пропал как вернуть деньги без договора";

const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
const blockedHosts = [
  "google.com", "google.ru", "googleusercontent.com", "gstatic.com",
  "googleadservices.com", "doubleclick.net",
];
const isExternalOrganic = (href) => {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return url.protocol.startsWith("http") && !blockedHosts.some((item) => host === item || host.endsWith(`.${item}`));
  } catch { return false; }
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    geolocation: { latitude: 55.7558, longitude: 37.6173 },
    permissions: ["geolocation"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  const searchUrl = `https://www.google.com/search?hl=ru&gl=ru&num=20&pws=0&udm=14&q=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  const consentButtons = [
    page.getByRole("button", { name: /принять все|accept all|согласен|i agree/i }),
    page.locator('button:has-text("Принять все")'),
    page.locator('button:has-text("Accept all")'),
    page.locator('form[action*="consent"] button').last(),
  ];
  for (const button of consentButtons) {
    if (await button.count().catch(() => 0)) {
      await button.first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
      break;
    }
  }

  if (!page.url().includes("/search")) {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  await page.waitForTimeout(3500);

  const bodyText = clean(await page.locator("body").innerText().catch(() => ""));
  if (/unusual traffic|необычн(?:ый|ого) трафик|captcha|провер(?:ьте|ка),? что вы не робот|our systems have detected/i.test(bodyText)) {
    throw new Error("Google browser: поисковик показал challenge вместо выдачи");
  }

  const raw = await page.locator("a").evaluateAll((anchors) => anchors.map((anchor) => {
    const heading = anchor.querySelector("h3") || anchor.closest("div")?.querySelector("h3");
    return {
      href: anchor.href,
      title: heading?.textContent || anchor.getAttribute("aria-label") || "",
      hasHeading: Boolean(heading),
      containerText: anchor.closest("div[data-snhf]")?.textContent || anchor.closest("div.MjjYud")?.textContent || anchor.parentElement?.parentElement?.textContent || "",
    };
  }));

  const seen = new Set();
  const organic = [];
  for (const item of raw) {
    const title = clean(item.title);
    const link = String(item.href || "");
    if (!item.hasHeading || !title || !isExternalOrganic(link)) continue;
    let key;
    try { key = `${new URL(link).hostname.replace(/^www\./, "")}|${title.toLowerCase()}`; }
    catch { continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    organic.push({ position: organic.length + 1, title, link, snippet: clean(item.containerText).slice(0, 500) });
    if (organic.length >= 20) break;
  }

  if (organic.length < 5) {
    const diagnostic = clean(bodyText).slice(0, 700);
    throw new Error(`Google browser: найдено только ${organic.length} органических результатов; начало страницы: ${diagnostic}`);
  }

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  report.engines = (report.engines || []).filter((item) => item.engine !== "Google");
  report.engines.push({ engine: "Google", provider: "Chromium incognito-like browser snapshot", organic, sponsored: [] });
  report.errors = (report.errors || []).filter((item) => !String(item).startsWith("Serper Google") && !String(item).startsWith("Google:"));
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const yandex = report.engines.find((item) => item.engine === "Yandex");
  const google = report.engines.find((item) => item.engine === "Google");
  const lines = [
    "# C-003 — слепок органической выдачи",
    "",
    `Дата проверки: ${report.checkedAt}`,
    "Регион: Москва",
    `Запрос: \`${report.query}\``,
    "",
  ];
  for (const engine of [yandex, google].filter(Boolean)) {
    lines.push(`## ${engine.engine}`, "", `Провайдер: ${engine.provider}`, `Органических результатов: ${engine.organic.length}`, `Рекламных результатов: ${engine.sponsored?.length || 0}`, "");
    engine.organic.forEach((item, index) => lines.push(`${index + 1}. [${item.title}](${item.link})${item.snippet ? ` — ${item.snippet}` : ""}`));
    lines.push("");
  }
  lines.push("## Контроль", "", `- Яндекс: ${yandex?.organic.length || 0} органических результатов.`, `- Google: ${google?.organic.length || 0} органических результатов.`, "- Рекламные элементы не входят в обязательный минимум.", "- Сырые HTML/API-ответы и секреты не сохраняются.", "");
  await writeFile(markdownPath, lines.join("\n"), "utf8");

  if ((yandex?.organic.length || 0) < 5 || organic.length < 5) {
    throw new Error(`SERP-шлюз не пройден: Yandex=${yandex?.organic.length || 0}, Google=${organic.length}`);
  }
  console.log(`C-003 browser fallback: Yandex=${yandex.organic.length}, Google=${organic.length}`);
} finally {
  await browser.close();
}
