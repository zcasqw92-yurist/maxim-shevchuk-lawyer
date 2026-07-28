import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = "4196";
const origin = `http://127.0.0.1:${port}`;
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const errors = [];
const skipped = [];
const routes = [
  `/razbory/${articles[0].slug}/`,
  `/praktika/${practiceCases[0].slug}/`,
];
const viewports = [
  { width: 320, height: 844 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Editorial helpfulness preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Editorial helpfulness preview server exited: ${code}`)));
});

const metrics = (element) => {
  const block = element.closest("[data-editorial-helpfulness]");
  const actions = block.querySelector(".editorial-helpfulness__actions");
  const buttons = [...actions.querySelectorAll("button")];
  const actionRect = actions.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  const statusRect = block.querySelector("[data-helpfulness-status]").getBoundingClientRect();
  return {
    blockHeight: blockRect.height,
    blockLeft: blockRect.left,
    blockRight: blockRect.right,
    actionWidth: actionRect.width,
    actionDisplay: getComputedStyle(actions).display,
    statusHeight: statusRect.height,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    buttons: buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        text: button.textContent.trim(),
        value: button.dataset.helpfulnessValue,
        pressed: button.getAttribute("aria-pressed"),
        disabled: button.disabled,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        color: style.color,
        background: style.backgroundColor,
        border: style.borderTopColor,
        outline: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    }),
  };
};

try {
  for (const [engineName, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
    const executablePath = engine.executablePath();
    const installed = await access(executablePath).then(() => true).catch(() => false);
    if (!installed) {
      const message = `${engineName}: browser binary is not installed at ${executablePath}`;
      if (requireBrowsers) errors.push(message);
      else skipped.push(message);
      continue;
    }

    const browser = await engine.launch({
      headless: true,
      ...(engineName === "Chromium" ? { args: ["--no-sandbox"] } : {}),
    });

    try {
      for (const viewport of viewports) {
        for (const route of routes) {
          const context = await browser.newContext({ viewport, locale: "ru-RU" });
          await context.addInitScript(() => {
            localStorage.setItem("analytics_consent", "denied");
            sessionStorage.setItem("site_engagement_nudge_shown", "true");
          });
          const page = await context.newPage();
          const response = await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
          if (!response?.ok()) errors.push(`${engineName} ${viewport.width}px ${route}: status ${response?.status()}`);

          const block = page.locator("[data-editorial-helpfulness]");
          const buttons = block.locator("[data-helpfulness-value]");
          if (!(await block.isVisible())) errors.push(`${engineName} ${viewport.width}px ${route}: helpfulness block is not visible`);
          if (await buttons.count() !== 3) errors.push(`${engineName} ${viewport.width}px ${route}: expected three helpfulness buttons`);

          const before = await buttons.first().evaluate(metrics);
          const expectedValues = ["yes", "no", "partly"];
          const actualValues = before.buttons.map((item) => item.value);
          if (JSON.stringify(actualValues) !== JSON.stringify(expectedValues)) {
            errors.push(`${engineName} ${viewport.width}px ${route}: wrong order ${actualValues.join(", ")}`);
          }
          if (before.buttons.some((item) => item.pressed !== "false")) {
            errors.push(`${engineName} ${viewport.width}px ${route}: initial aria-pressed state is incomplete`);
          }
          if (before.actionDisplay !== "grid") errors.push(`${engineName} ${viewport.width}px ${route}: actions are not a grid`);
          if (before.buttons.some((item) => item.height < 44)) errors.push(`${engineName} ${viewport.width}px ${route}: button is below 44px target ${JSON.stringify(before.buttons)}`);
          if (before.overflow > 1 || before.blockLeft < -1 || before.blockRight > viewport.width + 1) {
            errors.push(`${engineName} ${viewport.width}px ${route}: block overflows viewport ${JSON.stringify(before)}`);
          }

          const [yes, no, partly] = before.buttons;
          if (viewport.width <= 350) {
            if (Math.abs(yes.top - no.top) > 1 || partly.top <= yes.top + 1) {
              errors.push(`${engineName} ${viewport.width}px ${route}: narrow 2+1 layout is broken ${JSON.stringify(before.buttons)}`);
            }
            if (partly.width < before.actionWidth - 2) {
              errors.push(`${engineName} ${viewport.width}px ${route}: third button does not span the narrow row ${JSON.stringify(before.buttons)}`);
            }
          } else {
            if (Math.max(...before.buttons.map((item) => item.top)) - Math.min(...before.buttons.map((item) => item.top)) > 1) {
              errors.push(`${engineName} ${viewport.width}px ${route}: buttons are not in one row ${JSON.stringify(before.buttons)}`);
            }
            if (Math.max(...before.buttons.map((item) => item.width)) - Math.min(...before.buttons.map((item) => item.width)) > 2) {
              errors.push(`${engineName} ${viewport.width}px ${route}: buttons do not have equal width ${JSON.stringify(before.buttons)}`);
            }
          }

          const noButton = buttons.filter({ hasText: /^Нет$/ });
          await noButton.focus();
          const focusStyle = await noButton.evaluate((button) => {
            const style = getComputedStyle(button);
            return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
          });
          if (focusStyle.outlineStyle === "none" || Number.parseFloat(focusStyle.outlineWidth) < 1) {
            errors.push(`${engineName} ${viewport.width}px ${route}: focus ring is missing ${JSON.stringify(focusStyle)}`);
          }

          await noButton.click();
          await page.waitForTimeout(240);
          const after = await buttons.first().evaluate(metrics);
          const selected = after.buttons.find((item) => item.value === "no");
          if (selected?.pressed !== "true" || after.buttons.filter((item) => item.pressed === "true").length !== 1) {
            errors.push(`${engineName} ${viewport.width}px ${route}: selected state is not singular ${JSON.stringify(after.buttons)}`);
          }
          if (after.buttons.some((item) => !item.disabled)) {
            errors.push(`${engineName} ${viewport.width}px ${route}: response controls remain active after submission`);
          }
          if (selected?.background === "rgba(0, 0, 0, 0)" || selected?.background === "transparent") {
            errors.push(`${engineName} ${viewport.width}px ${route}: selected state has no filled background`);
          }

          const status = await block.locator("[data-helpfulness-status]").textContent();
          if (!status?.includes("Аналитика отключена")) {
            errors.push(`${engineName} ${viewport.width}px ${route}: privacy status is inaccurate: ${status}`);
          }
          const allowedHeightChange = viewport.width <= 390 ? 3 : 2;
          if (Math.abs(after.blockHeight - before.blockHeight) > allowedHeightChange) {
            errors.push(`${engineName} ${viewport.width}px ${route}: block jumps after selection by ${after.blockHeight - before.blockHeight}px`);
          }

          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Editorial helpfulness local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("Editorial helpfulness passed: yes/no/partly order, equal controls, focus and locked selection without layout shift in Chromium and WebKit");
