import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(scriptsDir, "browser-audit.mjs");
const runtimePath = join(scriptsDir, ".browser-audit-runtime.mjs");

let source = await readFile(sourcePath, "utf8");
const oldArgs = 'args: chromiumBinary.args.concat(["--disable-background-networking", "--disable-extensions", "--font-render-hinting=none"]),';
const newArgs = 'args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--disable-extensions", "--font-render-hinting=none"],';
if (!source.includes(oldArgs)) throw new Error("Не найдена строка запуска Chromium для аудита");
source = source.replace(oldArgs, newArgs);

const oldPrepare = `    window.scrollTo(0, 0);
  });
};`;
const newPrepare = `    window.scrollTo(0, 0);
  });
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewport = page.viewportSize();
  const step = Math.max(420, Math.floor((viewport?.height || 844) * 0.72));
  for (let y = 0; y < pageHeight; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(45);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(160);
};`;
if (!source.includes(oldPrepare)) throw new Error("Не найдена функция подготовки страницы");
source = source.replace(oldPrepare, newPrepare);
source = source.replace(
  'desktop.locator("dialog[open] [data-dialog-close]").first().click()',
  'desktop.locator("[data-video-dialog] [data-video-close]").first().click()',
);
source = source.replace(
  'desktop.locator("dialog[open] [data-dialog-close]").first().click()',
  'desktop.locator("[data-proof-dialog][open] [data-proof-close]").first().click()',
);

await writeFile(runtimePath, source, "utf8");
try {
  await import(`${pathToFileURL(runtimePath).href}?run=${Date.now()}`);
} finally {
  await rm(runtimePath, { force: true });
}
