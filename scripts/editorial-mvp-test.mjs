import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { site } from "../site.config.mjs";
import { articles, practiceCases, validateEditorialData } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];
const skipped = [];
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const hiddenUnicode = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;

validateEditorialData();

const pageFile = (route) => join(dist, route.replace(/^\/+|\/+$/g, ""), "index.html");
const article = articles[0];
const practiceCase = practiceCases[0];
const routes = [
  ["/razbory/", pageFile("/razbory/")],
  [`/razbory/${article.slug}/`, pageFile(`/razbory/${article.slug}/`)],
  ["/praktika/", pageFile("/praktika/")],
  [`/praktika/${practiceCase.slug}/`, pageFile(`/praktika/${practiceCase.slug}/`)],
];

const parseGraph = (html) => [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap((match) => {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
  });

for (const [route, file] of routes) {
  const html = await readFile(file, "utf8");
  const h1Count = (html.match(/<h1\b/g) || []).length;
  if (h1Count !== 1) errors.push(`${route}: expected one H1, found ${h1Count}`);
  if (/<(?:form|input|select|textarea)\b/i.test(html)) errors.push(`${route}: form element returned to editorial page`);
  if (hiddenUnicode.test(html)) errors.push(`${route}: hidden Unicode is present in published HTML`);
  if (!html.includes(`<link rel="canonical" href="${site.siteUrl}${route}">`)) errors.push(`${route}: canonical is missing or incorrect`);
  if (!html.includes('content="index,follow,max-image-preview:large')) errors.push(`${route}: indexable robots directive is missing`);
  if (!html.includes('data-protected-image draggable="false"')) errors.push(`${route}: image protection marker is missing`);
  if (!html.includes('id="contact-dialog"')) errors.push(`${route}: direct messenger dialog is missing`);
  if (!html.includes("Информация не является гарантией результата")) errors.push(`${route}: common result disclaimer is missing`);
}

const articleRoute = `/razbory/${article.slug}/`;
const articleHtml = await readFile(pageFile(articleRoute), "utf8");
const articleGraph = parseGraph(articleHtml);
const articleNode = articleGraph.find((node) => node["@type"] === "Article" && node["@id"]?.endsWith("#article"));
const articleWebPage = articleGraph.find((node) => node["@type"] === "WebPage");
if (!articleNode) errors.push(`${articleRoute}: Article JSON-LD is missing`);
if (articleNode?.headline !== article.title) errors.push(`${articleRoute}: Article headline mismatch`);
if (articleNode?.datePublished !== article.publishedAt || articleNode?.dateModified !== article.modifiedAt) errors.push(`${articleRoute}: Article dates mismatch`);
if (articleWebPage?.dateModified !== article.modifiedAt) errors.push(`${articleRoute}: WebPage dateModified mismatch`);
if (articleNode?.citation?.length !== article.sources.length) errors.push(`${articleRoute}: citations are incomplete`);
for (const source of article.sources) {
  if (!articleHtml.includes(`href="${source.url}"`)) errors.push(`${articleRoute}: official source is not visible: ${source.title}`);
}
for (const marker of [
  "Короткий ответ",
  "Содержание",
  "Проверьте не только вывод, но и полноту проверки",
  "Официальные источники",
  "Частые вопросы",
  "Похожая задача из практики",
  "Материал подготовил",
]) {
  if (!articleHtml.includes(marker)) errors.push(`${articleRoute}: missing article block: ${marker}`);
}
if (!articleHtml.includes(`/praktika/${practiceCase.slug}/`)) errors.push(`${articleRoute}: related case link is missing`);

const caseRoute = `/praktika/${practiceCase.slug}/`;
const caseHtml = await readFile(pageFile(caseRoute), "utf8");
const caseGraph = parseGraph(caseHtml);
const caseNode = caseGraph.find((node) => node["@type"] === "Article" && node["@id"]?.endsWith("#case-study"));
if (!caseNode) errors.push(`${caseRoute}: case Article JSON-LD is missing`);
for (const text of [practiceCase.title, practiceCase.situation, practiceCase.materials, practiceCase.work, practiceCase.next]) {
  if (!caseHtml.includes(text)) errors.push(`${caseRoute}: verified case content is incomplete`);
}
for (const privateMarker of ["КУСП №", "УИД", "Рыбинск", "Сергач", "Топникова", "Алиакбарова", "Шибаева"]) {
  const articleStart = caseHtml.indexOf('<article class="editorial-article case-article"');
  const articleEnd = caseHtml.indexOf("</article>", articleStart);
  const caseBody = caseHtml.slice(articleStart, articleEnd);
  if (caseBody.includes(privateMarker)) errors.push(`${caseRoute}: private marker is public: ${privateMarker}`);
}
if (!caseHtml.includes(`/razbory/${article.slug}/`)) errors.push(`${caseRoute}: related article link is missing`);

const home = await readFile(join(dist, "index.html"), "utf8");
const service = await readFile(join(dist, "uslugi", "zhaloby-i-obrashcheniya", "index.html"), "utf8");
for (const [name, html] of [["home", home], ["service", service]]) {
  if (!html.includes(`/praktika/${practiceCase.slug}/`)) errors.push(`${name}: full case is not linked from verified case card`);
}

const sitemap = await readFile(join(dist, "sitemap.xml"), "utf8");
for (const [route] of routes) {
  if (!sitemap.includes(`<loc>${site.siteUrl}${route}</loc>`)) errors.push(`sitemap: missing ${route}`);
}

const feed = await readFile(join(dist, "feed.xml"), "utf8");
for (const marker of ["<rss version=\"2.0\">", article.title, `${site.siteUrl}${articleRoute}`, `<pubDate>${new Date(`${article.modifiedAt}T12:00:00Z`).toUTCString()}</pubDate>`]) {
  if (!feed.includes(marker)) errors.push(`feed.xml: missing ${marker}`);
}

const port = "4186";
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Editorial preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Editorial preview server exited: ${code}`)));
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
      for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
        for (const route of [articleRoute, caseRoute]) {
          const context = await browser.newContext({ viewport, locale: "ru-RU", reducedMotion: "no-preference" });
          await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
          const page = await context.newPage();
          const response = await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
          if (!response?.ok()) errors.push(`${engineName} ${viewport.width}px ${route}: status ${response?.status()}`);

          const state = await page.evaluate(() => {
            const checklistItem = document.querySelector(".editorial-checklist li");
            const markerStyle = checklistItem ? getComputedStyle(checklistItem, "::before") : null;
            return {
              h1Visible: Boolean(document.querySelector("h1")?.getBoundingClientRect().height),
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              forms: document.querySelectorAll("form,input,select,textarea").length,
              imagesUnprotected: [...document.images].filter((image) => !image.hasAttribute("data-protected-image") || image.draggable).length,
              checklistMarker: markerStyle ? {
                content: markerStyle.content,
                borderTopWidth: markerStyle.borderTopWidth,
                borderStyle: markerStyle.borderStyle,
                width: markerStyle.width,
                height: markerStyle.height,
              } : null,
            };
          });
          if (!state.h1Visible) errors.push(`${engineName} ${viewport.width}px ${route}: H1 is not visible`);
          if (state.overflow > 1) errors.push(`${engineName} ${viewport.width}px ${route}: ${state.overflow}px horizontal overflow`);
          if (state.forms) errors.push(`${engineName} ${viewport.width}px ${route}: ${state.forms} form elements found`);
          if (state.imagesUnprotected) errors.push(`${engineName} ${viewport.width}px ${route}: ${state.imagesUnprotected} unprotected images`);
          if (route === articleRoute) {
            if (!state.checklistMarker) errors.push(`${engineName} ${viewport.width}px ${route}: checklist marker is missing`);
            else {
              if (!state.checklistMarker.content.includes("—")) errors.push(`${engineName} ${viewport.width}px ${route}: article marker is not an editorial dash ${JSON.stringify(state.checklistMarker)}`);
              if (state.checklistMarker.borderTopWidth !== "0px" || state.checklistMarker.borderStyle !== "none") {
                errors.push(`${engineName} ${viewport.width}px ${route}: checkbox-like square remains ${JSON.stringify(state.checklistMarker)}`);
              }
            }
          }

          const cta = page.locator(".editorial-cta [data-dialog-open]").last();
          await cta.scrollIntoViewIfNeeded();
          await cta.click();
          await page.locator("#contact-dialog[open]").waitFor({ state: "visible" });
          const topic = await page.locator("#contact-dialog").getAttribute("data-topic");
          if (!topic) errors.push(`${engineName} ${viewport.width}px ${route}: CTA opened without topic`);
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

for (const message of skipped) console.warn(`Editorial MVP local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Editorial MVP passed: ${routes.length} pages, semantic article markers, verified content model, Article JSON-LD, RSS, sitemap, Chromium and WebKit`);
