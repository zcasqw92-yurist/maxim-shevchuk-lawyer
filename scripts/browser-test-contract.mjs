import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const messengerTest = await readFile(join(root, "scripts", "messenger-intents-interaction-test.mjs"), "utf8");
const consentPreload = await readFile(join(root, "scripts", "playwright-consent-isolation-preload.mjs"), "utf8");
const errors = [];

const visualCommand = String(packageJson.scripts?.["test:visual"] || "");
if (!visualCommand.includes("--import ./scripts/playwright-consent-isolation-preload.mjs")) {
  errors.push("test:visual должен запускаться через preload изоляции consent-баннера");
}
if (!consentPreload.includes('localStorage.setItem("analytics_consent", "denied")')) {
  errors.push("preload визуальных тестов должен фиксировать analytics_consent=denied до загрузки приложения");
}
if (!messengerTest.includes('consent = "denied"')) {
  errors.push("тест мессенджеров должен явно изолировать рабочие сценарии от consent-баннера");
}
if (!messengerTest.includes('"analytics-consent"')) {
  errors.push("поведение consent-баннера должно проверяться отдельным сценарием");
}
if (messengerTest.includes("force: true")) {
  errors.push("браузерные тесты не должны маскировать перекрытия интерфейса через force: true");
}
if (!messengerTest.includes("captureFailure") || !messengerTest.includes("page.screenshot")) {
  errors.push("тест мессенджеров должен сохранять визуальную и DOM-диагностику при падении");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Browser test contract passed: consent is covered separately and feature scenarios are isolated without forced clicks");
