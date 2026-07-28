import { spawn } from "node:child_process";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { services } from "../src/data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];
const skipped = [];
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const canonicalPages = [
  "index.html",
  join("uslugi", "index.html"),
  ...services.map((service) => join("uslugi", service.slug, "index.html")),
  join("o-yuriste", "index.html"),
  join("kontakty", "index.html"),
  join("politika-konfidencialnosti", "index.html"),
];

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
};

for (const pagePath of canonicalPages) {
  const html = await readFile(join(dist, pagePath), "utf8");
  const images = html.match(/<img\b[^>]*>/gi) || [];
  if (!images.length && pagePath !== join("politika-konfidencialnosti", "index.html")) {
    errors.push(`${pagePath}: expected public images`);
  }
  for (const tag of images) {
    if (!/\bdata-protected-image(?:\s|=|>)/i.test(tag)) errors.push(`${pagePath}: image lacks data-protected-image: ${tag.slice(0, 140)}`);
    if (!/\bdraggable="false"/i.test(tag)) errors.push(`${pagePath}: image remains draggable: ${tag.slice(0, 140)}`);
    if (!/\balt="[^"]*"/i.test(tag)) errors.push(`${pagePath}: image lacks alt: ${tag.slice(0, 140)}`);
    if (!/\bwidth="\d+"/i.test(tag) || !/\bheight="\d+"/i.test(tag)) errors.push(`${pagePath}: image lacks intrinsic dimensions: ${tag.slice(0, 140)}`);
  }
  if (!html.includes("/assets/content-protection.mjs")) errors.push(`${pagePath}: protection module is not loaded`);
  if (!html.includes("Материалы и изображения сайта защищены авторским правом")) errors.push(`${pagePath}: copyright notice is missing`);
  if (/<a\b[^>]*\bdownload(?:\s|=|>)[^>]*>[\s\S]*?<img\b/i.test(html)) errors.push(`${pagePath}: downloadable image link remains`);
  if (!/max-image-preview:large/i.test(html)) errors.push(`${pagePath}: image search preview directive was lost`);
}

const files = await walk(dist);
for (const path of files) {
  const name = relative(dist, path).replaceAll("\\", "/");
  const extension = extname(path).toLowerCase();
  if (extension === ".map") errors.push(`${name}: source map must not be published`);
  if ([".psd", ".ai", ".tif", ".tiff", ".raw", ".cr2", ".nef", ".dng"].includes(extension)) {
    errors.push(`${name}: editable or camera-original image format must not be published`);
  }
  if ([".js", ".mjs", ".css", ".html"].includes(extension)) {
    const content = await readFile(path, "utf8");
    const isPinnedVendor = name === "assets/vendor-web-vitals.js";
    if (!isPinnedVendor && /sourceMappingURL\s*=/.test(content)) errors.push(`${name}: sourceMappingURL must not be published in project code`);
  }
  if ([".webp", ".avif", ".jpg", ".jpeg", ".png", ".svg"].includes(extension)) {
    const info = await stat(path);
    if (info.size > 3_000_000) errors.push(`${name}: public image exceeds 3 MB (${info.size} bytes)`);
  }
}

const styles = await readFile(join(dist, "assets", "styles.css"), "utf8");
for (const marker of ["-webkit-user-drag: none", "-webkit-touch-callout: none", "img[data-protected-image]", ".footer__copyright-note"]) {
  if (!styles.includes(marker)) errors.push(`styles.css: missing ${marker}`);
}
if (/(?:body|html|main|article|p)\s*\{[^}]*user-select\s*:\s*none/is.test(styles)) {
  errors.push("styles.css: global text selection must remain enabled");
}

const script = await readFile(join(dist, "assets", "content-protection.mjs"), "utf8");
for (const marker of ["dragstart", "contextmenu", "selectstart", "auxclick", "stopImmediatePropagation", "HTMLImageElement"]) {
  if (!script.includes(marker)) errors.push(`content-protection.mjs: missing ${marker}`);
}
if (/keydown|ctrlKey|metaKey|F12|preventDefault\(\).*copy/is.test(script)) {
  errors.push("content-protection.mjs: global keyboard or copy blocking is forbidden");
}

const port = "4184";
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Content protection preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Content protection preview server exited: ${code}`)));
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
      for (const path of ["/", "/o-yuriste/", "/kontakty/"]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
        await context.addInitScript(() => localStorage.setItem("analytics_consent", "denied"));
        const page = await context.newPage();
        await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });

        const state = await page.evaluate(async () => {
          await import("/assets/content-protection.mjs");
          const images = [...document.images];
          const interactiveImage = document.querySelector("a img[data-protected-image], button img[data-protected-image]");
          const paragraph = document.querySelector("main p") || document.querySelector("footer p");
          const imageContextEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
          const textContextEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
          const dragEvent = new DragEvent("dragstart", { bubbles: true, cancelable: true });
          const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
          const before = location.href;
          const imageContextAllowed = images[0]?.dispatchEvent(imageContextEvent);
          const textContextAllowed = paragraph?.dispatchEvent(textContextEvent);
          const dragAllowed = images[0]?.dispatchEvent(dragEvent);
          const interactiveClickAllowed = interactiveImage ? interactiveImage.dispatchEvent(clickEvent) : false;
          await new Promise((resolve) => setTimeout(resolve, 30));
          return {
            count: images.length,
            unmarked: images.filter((image) => !image.hasAttribute("data-protected-image") || image.draggable).length,
            userSelect: getComputedStyle(document.body).userSelect,
            paragraphUserSelect: paragraph ? getComputedStyle(paragraph).userSelect : "",
            imageContextAllowed,
            textContextAllowed,
            dragAllowed,
            hasInteractiveImage: Boolean(interactiveImage),
            interactiveClickAllowed,
            stayedOnPage: location.href === before,
            copyrightVisible: document.body.innerText.includes("Материалы и изображения сайта защищены авторским правом"),
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });

        if (!state.count && path !== "/politika-konfidencialnosti/") errors.push(`${engineName} ${path}: no images found`);
        if (state.unmarked) errors.push(`${engineName} ${path}: ${state.unmarked} images are unprotected or draggable`);
        if (state.userSelect === "none" || state.paragraphUserSelect === "none") errors.push(`${engineName} ${path}: normal text selection is blocked`);
        if (state.imageContextAllowed !== false) errors.push(`${engineName} ${path}: image context menu was not prevented`);
        if (state.textContextAllowed !== true) errors.push(`${engineName} ${path}: text context menu was incorrectly prevented`);
        if (state.dragAllowed !== false) errors.push(`${engineName} ${path}: image drag was not prevented`);
        if (state.hasInteractiveImage && (state.interactiveClickAllowed !== false || !state.stayedOnPage)) errors.push(`${engineName} ${path}: image remains clickable`);
        if (!state.copyrightVisible) errors.push(`${engineName} ${path}: copyright notice is not visible`);
        if (state.horizontalOverflow > 1) errors.push(`${engineName} ${path}: protection styles create ${state.horizontalOverflow}px overflow`);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Content protection local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Content protection passed: ${canonicalPages.length} pages, non-clickable images, no source-map files, selectable text, Chromium and WebKit`);
