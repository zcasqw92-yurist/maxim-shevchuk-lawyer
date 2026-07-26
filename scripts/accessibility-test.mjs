import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const browserDir = join(root, ".browser-bin");
const browserPath = join(browserDir, "chromium");
const browserPackage = join(root, "node_modules", "@sparticuz", "chromium", "bin");
await mkdir(browserDir, { recursive: true });

if (!(await access(browserPath).then(() => true).catch(() => false))) {
  await pipeline(
    createReadStream(join(browserPackage, "chromium.br")),
    createBrotliDecompress(),
    createWriteStream(browserPath),
  );
  await chmod(browserPath, 0o755);
}

const extractTarBrotli = async (archive) => {
  const tar = spawn("tar", ["--no-same-owner", "-xf", "-", "-C", browserDir], {
    stdio: ["pipe", "ignore", "pipe"],
  });
  let stderr = "";
  tar.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  await Promise.all([
    pipeline(createReadStream(join(browserPackage, archive)), createBrotliDecompress(), tar.stdin),
    new Promise((resolve, reject) => tar.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr || `tar exited: ${code}`)))),
  ]);
};

if (!(await access(join(browserDir, "libGLESv2.so")).then(() => true).catch(() => false))) {
  await extractTarBrotli("swiftshader.tar.br");
}
if (!(await access(join(browserDir, "fonts.conf")).then(() => true).catch(() => false))) {
  await extractTarBrotli("fonts.tar.br");
}

await mkdir(join(browserDir, "cache"), { recursive: true });
await mkdir(join(browserDir, "home"), { recursive: true });
process.env.HOME = join(browserDir, "home");
process.env.XDG_CACHE_HOME = join(browserDir, "cache");
process.env.FONTCONFIG_FILE = "/etc/fonts/fonts.conf";
process.env.LD_LIBRARY_PATH = [browserDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

const port = "4178";
const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Accessibility preview server timeout")), 8000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Accessibility preview server exited: ${code}`)));
});

const routes = [
  "/",
  "/uslugi/",
  "/uslugi/dosudebnoe-uregulirovanie/",
  "/uslugi/vozvrat-deneg/",
  "/uslugi/zhaloby-i-obrashcheniya/",
  "/uslugi/iskovoe-zayavlenie/",
  "/uslugi/spory-biznesa/",
  "/uslugi/marketpleysy/",
  "/o-yuriste/",
  "/kontakty/",
  "/politika-konfidencialnosti/",
];
const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const failures = [];
let browser;

const runAxe = async (page, label) => {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: "rule", values: ["color-contrast"] },
    resultTypes: ["violations"],
  }));
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      failures.push({
        label,
        rule: violation.id,
        target: node.target.join(" "),
        summary: node.failureSummary?.replace(/\s+/g, " ").trim() || violation.help,
      });
    }
  }
};

try {
  browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--disable-extensions"],
    executablePath: browserPath,
    headless: true,
  });

  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      reducedMotion: "reduce",
    });
    for (const route of routes) {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "networkidle" });
      await runAxe(page, `${profile.name} ${route}`);

      if (route === "/") {
        await page.locator("[data-dialog-open]").first().click();
        await runAxe(page, `${profile.name} / contact-dialog`);
        await page.locator("[data-dialog-close]").click();

        await page.locator("[data-price-quiz-open]").first().click();
        await runAxe(page, `${profile.name} / price-quiz`);
        await page.locator("[data-price-quiz-close]").click();

        await page.locator("[data-proof-open]").first().click();
        await runAxe(page, `${profile.name} / proof-dialog`);
        await page.locator("[data-proof-close]").first().click();

        if (profile.isMobile) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.locator("[data-menu-toggle]").click();
          await runAxe(page, `${profile.name} / mobile-menu`);
        }
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (failures.length) {
  const grouped = new Map();
  failures.forEach((failure) => {
    const key = `${failure.target}\n${failure.summary}`;
    const item = grouped.get(key) || { ...failure, count: 0, labels: new Set() };
    item.count += 1;
    item.labels.add(failure.label);
    grouped.set(key, item);
  });
  const summary = [...grouped.values()]
    .sort((a, b) => b.count - a.count)
    .map((item) => `${item.count}× ${item.target} · ${item.summary} · ${[...item.labels].slice(0, 4).join(", ")}`)
    .join("\n");
  console.error(`Color contrast violations: ${failures.length} nodes in ${grouped.size} groups\n${summary}`);
  if (process.env.A11Y_REPORT_ONLY !== "true") process.exit(1);
} else {
  console.log(`Accessibility contrast passed: ${routes.length} pages, ${profiles.length} profiles and interactive states`);
}
