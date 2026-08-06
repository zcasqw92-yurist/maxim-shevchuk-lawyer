import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const messengerTest = await readFile(join(root, "scripts", "messenger-intents-interaction-test.mjs"), "utf8");
const heroConsentTest = await readFile(join(root, "scripts", "hero-consent-contract-test.mjs"), "utf8");
const servicePagesInteractionTest = await readFile(join(root, "scripts", "service-pages-interaction-test.mjs"), "utf8");
const consentPreload = await readFile(join(root, "scripts", "playwright-consent-isolation-preload.mjs"), "utf8");
const errors = [];

const visualCommand = String(packageJson.scripts?.["test:visual"] || "");
if (!visualCommand.includes("--import ./scripts/playwright-consent-isolation-preload.mjs")) {
  errors.push("test:visual должен запускаться через preload изоляции consent-баннера");
}
if (!consentPreload.includes('localStorage.setItem("analytics_consent", "denied")')) {
  errors.push("preload визуальных тестов должен фиксировать analytics_consent=denied до загрузки приложения");
}
if (!messengerTest.includes('localStorage.setItem("analytics_consent", "denied")')) {
  errors.push("тест мессенджеров должен явно изолировать рабочие сценарии от consent-баннера");
}
for (const marker of [
  "[data-consent-banner]",
  "[data-consent-reject]",
  "[data-consent-accept]",
  "analyticsExpected",
  "Chromium",
  "WebKit",
]) {
  if (!heroConsentTest.includes(marker)) errors.push(`специализированный consent-тест не содержит обязательный маркер: ${marker}`);
}
if (!String(packageJson.scripts?.["test:hero-consent"] || "").includes("hero-consent-contract-test.mjs")) {
  errors.push("поведение consent-баннера должно запускаться отдельным специализированным тестом");
}
if (!String(packageJson.scripts?.check || "").includes("test:hero-consent")) {
  errors.push("полный npm run check должен включать специализированный consent-тест");
}
if (messengerTest.includes("force: true") || heroConsentTest.includes("force: true")) {
  errors.push("браузерные тесты не должны маскировать перекрытия интерфейса через force: true");
}
if (!messengerTest.includes("captureFailure") || !messengerTest.includes("page.screenshot")) {
  errors.push("тест мессенджеров должен сохранять визуальную и DOM-диагностику при падении");
}
if (!heroConsentTest.includes("screenshot")) {
  errors.push("специализированный consent-тест должен сохранять визуальные подтверждения");
}
if (!servicePagesInteractionTest.includes('const usesSparticuzChromium = process.platform === "linux";')) {
  errors.push("тест страниц услуг должен ограничивать Linux-only Chromium пакетом платформы Linux");
}
if (!servicePagesInteractionTest.includes("...(usesSparticuzChromium ? { executablePath: browserPath } : {})")) {
  errors.push("на macOS тест страниц услуг должен запускать установленный браузер Playwright без Linux executablePath");
}
if (servicePagesInteractionTest.includes("executablePath: browserPath,\n    headless")) {
  errors.push("Linux executablePath снова применяется безусловно и сломает macOS fallback");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Browser test contract passed: consent is isolated and service interaction tests select a platform-compatible Chromium");