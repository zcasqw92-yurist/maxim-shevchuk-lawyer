import { chromium } from "playwright";

const expected = "9c4a449a8bbd5568ce174dfd554cb87ef47678e5";
const site = "https://yuristshevchuk.com";
let published = "";

for (let attempt = 1; attempt <= 36; attempt += 1) {
  const response = await fetch(`${site}/build-info.json?verify=${Date.now()}-${attempt}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
  });
  if (response.ok) {
    const info = await response.json();
    published = String(info.sha || "");
    if (published === expected) break;
  }
  console.log(`Live-попытка ${attempt}: опубликован ${published || "не определён"}`);
  await new Promise((resolve) => setTimeout(resolve, 10000));
}

if (published !== expected) {
  throw new Error(`Основной домен не опубликовал ${expected}; получен ${published || "пустой SHA"}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${site}/uslugi/?verify=${Date.now()}`, { waitUntil: "networkidle" });
  const card = page.locator(".service-card").first();
  const action = card.locator(".card-link");
  await card.hover();
  await page.waitForFunction(() => {
    const node = document.querySelector(".service-card .card-link");
    return node && getComputedStyle(node).backgroundColor === "rgb(221, 185, 121)";
  }, null, { timeout: 3000 });

  const state = await action.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      borderColor: style.borderTopColor,
      borderRadius: style.borderTopLeftRadius,
      text: node.textContent?.trim() || "",
    };
  });
  console.log(JSON.stringify({ published, state }, null, 2));

  if (state.backgroundColor !== "rgb(221, 185, 121)") throw new Error(`Нет золотой заливки: ${state.backgroundColor}`);
  if (state.color !== "rgb(9, 28, 44)") throw new Error(`Неверный цвет текста: ${state.color}`);
  if (state.borderColor !== "rgb(221, 185, 121)") throw new Error(`Неверная рамка: ${state.borderColor}`);
  if (Number.parseFloat(state.borderRadius) < 20) throw new Error(`Кнопка не получила pill-форму: ${state.borderRadius}`);
} finally {
  await browser.close();
}

console.log("Live service action passed: real Chromium received the gold-filled button state");
