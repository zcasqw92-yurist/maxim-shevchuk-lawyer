import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ci = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
const errors = [];

const requireText = (needle, message) => {
  if (!ci.includes(needle)) errors.push(message);
};

requireText("runs-on: ubuntu-22.04", "PF-015: browser CI must stay on the pinned Ubuntu 22.04 runner");
requireText("timeout-minutes: 40", "PF-015: total PR CI window must remain large enough for bounded browser bootstrap");
requireText("- name: Установить системные зависимости браузеров\n        timeout-minutes: 12", "PF-015: system dependency bootstrap must keep the 12-minute bounded window");
requireText('Acquire::Retries "5";', "PF-015: APT network requests must keep bounded retries");
requireText('Acquire::http::Timeout "60";', "PF-015: APT HTTP timeout must remain bounded");
requireText('Acquire::https::Timeout "60";', "PF-015: APT HTTPS timeout must remain bounded");
requireText("npx playwright install-deps chromium firefox webkit", "PF-015: all required browser system dependencies must still be prepared before merge");
requireText("- name: Установить браузеры\n        timeout-minutes: 10", "PF-015: browser binary installation must keep its own bounded window");
requireText("npx playwright install chromium firefox webkit", "PF-015: Chromium, Firefox and WebKit must all remain in pre-merge CI");
requireText("npm run check 2>&1 | tee check.log", "PF-015: full browser-backed project validation must still execute after bootstrap");

if (/timeout-minutes:\s*6\s*[\s\S]{0,120}playwright install-deps/.test(ci)) {
  errors.push("PF-015 regression: the historical 6-minute system dependency timeout returned");
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Browser bootstrap contract passed: PF-015 keeps bounded APT retries, realistic dependency/browser windows and full Chromium/Firefox/WebKit validation before merge");
