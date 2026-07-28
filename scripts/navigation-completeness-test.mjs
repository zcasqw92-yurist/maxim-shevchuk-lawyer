import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { services } from "../src/data.mjs";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];
const skipped = [];
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const primaryRoutes = ["/", "/uslugi/", "/razbory/", "/praktika/", "/o-yuriste/", "/kontakty/"];
const footerRoutes = ["/uslugi/", "/razbory/", "/praktika/", "/o-yuriste/", "/kontakty/", "/politika-konfidencialnosti/"];
const articleRoute = `/razbory/${articles[0].slug}/`;
const practiceRoute = `/praktika/${practiceCases[0].slug}/`;
const pageFile = (route) => route === "/"
  ? join(dist, "index.html")
  : join(dist, route.replace(/^\/+|\/+$/g, ""), "index.html");
const routes = [
  "/",
  "/uslugi/",
  ...services.map((service) => `/uslugi/${service.slug}/`),
  "/razbory/",
  ...articles.map((article) => `/razbory/${article.slug}/`),
  "/praktika/",
  ...practiceCases.map((practiceCase) => `/praktika/${practiceCase.slug}/`),
  "/o-yuriste/",
  "/kontakty/",
  "/politika-konfidencialnosti/",
];

const linksFrom = (block = "") => [...block.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map((match) => ({
  href: match[1],
  current: /\baria-current="page"/.test(match[0]),
}));

const currentSection = (route) => {
  if (route === "/") return "/";
  return primaryRoutes.find((candidate) => candidate !== "/" && route.startsWith(candidate)) || "";
};

for (const route of routes) {
  const html = await readFile(pageFile(route), "utf8");
  const desktop = html.match(/<nav class="desktop-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  const mobile = html.match(/<nav class="mobile-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  const footer = html.match(/<h2 class="footer__title">Информация<\/h2>\s*<ul class="footer__links">([\s\S]*?)<\/ul>/)?.[1] || "";
  if (!desktop) errors.push(`${route}: desktop navigation is missing`);
  if (!mobile) errors.push(`${route}: mobile navigation is missing`);
  if (!footer) errors.push(`${route}: footer information navigation is missing`);

  const desktopLinks = linksFrom(desktop);
  const mobileLinks = linksFrom(mobile);
  const footerLinks = linksFrom(footer);
  if (JSON.stringify(desktopLinks.map(({ href }) => href)) !== JSON.stringify(primaryRoutes)) {
    errors.push(`${route}: desktop routes are incomplete or out of order: ${JSON.stringify(desktopLinks)}`);
  }
  if (JSON.stringify(mobileLinks.map(({ href }) => href)) !== JSON.stringify(primaryRoutes)) {
    errors.push(`${route}: mobile routes are incomplete or out of order: ${JSON.stringify(mobileLinks)}`);
  }
  if (JSON.stringify(footerLinks.map(({ href }) => href)) !== JSON.stringify(footerRoutes)) {
    errors.push(`${route}: footer routes are incomplete or out of order: ${JSON.stringify(footerLinks)}`);
  }
  for (const label of ["Главная", "Услуги", "Разборы", "Практика", "О юристе", "Контакты"]) {
    if (!desktop.includes(`>${label}<`) && !desktop.includes(`>${label}`)) errors.push(`${route}: desktop label is missing: ${label}`);
    if (!mobile.includes(`>${label}`)) errors.push(`${route}: mobile label is missing: ${label}`);
  }
  for (const label of ["Все услуги", "Разборы", "Практика", "О юристе", "Контакты", "Конфиденциальность"]) {
    if (!footer.includes(`>${label}<`)) errors.push(`${route}: footer label is missing: ${label}`);
  }

  const expectedCurrent = currentSection(route);
  const desktopCurrent = desktopLinks.filter(({ current }) => current).map(({ href }) => href);
  const mobileCurrent = mobileLinks.filter(({ current }) => current).map(({ href }) => href);
  if (expectedCurrent && JSON.stringify(desktopCurrent) !== JSON.stringify([expectedCurrent])) {
    errors.push(`${route}: desktop current section mismatch: ${JSON.stringify(desktopCurrent)}`);
  }
  if (expectedCurrent && JSON.stringify(mobileCurrent) !== JSON.stringify([expectedCurrent])) {
    errors.push(`${route}: mobile current section mismatch: ${JSON.stringify(mobileCurrent)}`);
  }
}

const port = "4187";
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Navigation preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Navigation preview server exited: ${code}`)));
});

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

    const browser = await engine.launch({ headless: true, ...(engineName === "Chromium" ? { args: ["--no-sandbox"] } : {}) });
    try {
      for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
        for (const route of ["/", articleRoute, practiceRoute]) {
          const context = await browser.newContext({ viewport, locale: "ru-RU" });
          await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
          const page = await context.newPage();
          await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
          const state = await page.evaluate(() => {
            const header = document.querySelector(".header__inner");
            const brand = document.querySelector(".brand");
            const nav = document.querySelector(".desktop-nav");
            const actions = document.querySelector(".header__actions");
            const visibleRect = (element) => element && getComputedStyle(element).display !== "none" ? element.getBoundingClientRect() : null;
            const headerRect = visibleRect(header);
            const brandRect = visibleRect(brand);
            const navRect = visibleRect(nav);
            const actionsRect = visibleRect(actions);
            return {
              links: [...nav.querySelectorAll("a")].map((link) => ({ href: new URL(link.href).pathname, visible: link.getBoundingClientRect().width > 0 })),
              headerOverflow: header.scrollWidth - header.clientWidth,
              documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              brandOverlap: Boolean(brandRect && navRect && brandRect.right > navRect.left + 1),
              actionsOverlap: Boolean(actionsRect && navRect && navRect.right > actionsRect.left + 1),
              navInsideHeader: Boolean(headerRect && navRect && navRect.left >= headerRect.left - 1 && navRect.right <= headerRect.right + 1),
            };
          });
          if (JSON.stringify(state.links.map(({ href }) => href)) !== JSON.stringify(primaryRoutes)) errors.push(`${engineName} ${viewport.width}px ${route}: desktop links mismatch ${JSON.stringify(state)}`);
          if (state.links.some(({ visible }) => !visible)) errors.push(`${engineName} ${viewport.width}px ${route}: a desktop link is hidden`);
          if (state.headerOverflow > 1 || state.documentOverflow > 1 || state.brandOverlap || state.actionsOverlap || !state.navInsideHeader) {
            errors.push(`${engineName} ${viewport.width}px ${route}: desktop navigation collision ${JSON.stringify(state)}`);
          }
          await context.close();
        }
      }

      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
      await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
      const page = await context.newPage();
      await page.goto(`${origin}${articleRoute}`, { waitUntil: "networkidle" });
      await page.locator("[data-menu-toggle]").click();
      await page.locator("#mobile-menu").waitFor({ state: "visible" });
      const mobileState = await page.evaluate(() => {
        const menu = document.querySelector("#mobile-menu");
        const rect = menu.getBoundingClientRect();
        return {
          links: [...menu.querySelectorAll(":scope > .wrap > a")].map((link) => ({
            href: new URL(link.href).pathname,
            current: link.getAttribute("aria-current"),
            visible: link.getBoundingClientRect().height > 0,
          })),
          insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.top < innerHeight,
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          menuScrollable: menu.scrollHeight <= menu.clientHeight || getComputedStyle(menu).overflowY === "auto",
        };
      });
      if (JSON.stringify(mobileState.links.map(({ href }) => href)) !== JSON.stringify(primaryRoutes)) errors.push(`${engineName} mobile: links mismatch ${JSON.stringify(mobileState)}`);
      if (mobileState.links.some(({ visible }) => !visible)) errors.push(`${engineName} mobile: a primary link is hidden`);
      if (mobileState.links.find(({ href }) => href === "/razbory/")?.current !== "page") errors.push(`${engineName} mobile: article section is not current`);
      if (!mobileState.insideViewport || mobileState.documentOverflow > 1 || !mobileState.menuScrollable) errors.push(`${engineName} mobile: menu geometry is invalid ${JSON.stringify(mobileState)}`);
      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Navigation local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Navigation completeness passed: ${routes.length} pages, six primary sections, footer discovery, responsive Chromium and WebKit`);
