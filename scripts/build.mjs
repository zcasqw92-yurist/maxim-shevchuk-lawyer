import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";
import { services } from "../src/data.mjs";
import { composeRenderedPage } from "../src/page-composer.mjs";
import { injectProcessGuarantees } from "../src/process-guarantees.mjs";
import { injectCaseStudies } from "../src/case-studies.mjs";
import { injectSearchVisibility } from "../src/search-visibility.mjs";
import { injectPrivacyPolicy } from "../src/privacy-policy.mjs";
import { injectMobileActions } from "../src/mobile-actions.mjs";
import { injectVisualTrust } from "../src/visual-trust.mjs";
import {
  renderAbout,
  renderContacts,
  renderHome,
  renderPrivacy,
  renderService,
  renderServices,
  renderShell,
} from "../src/render.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const xml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");
const attr = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const rawBuildSha = String(process.env.GITHUB_SHA || process.env.SITE_BUILD_SHA || "local").trim();
const buildSha = /^[A-Za-z0-9._-]{1,64}$/.test(rawBuildSha) ? rawBuildSha : "local";
const buildVersion = buildSha === "local" ? site.contentLastModified.replaceAll("-", "") : buildSha.slice(0, 12);
const buildTime = String(process.env.SITE_BUILD_TIME || new Date().toISOString()).trim();
const buildInfo = {
  sha: buildSha,
  version: buildVersion,
  builtAt: buildTime,
  contentLastModified: site.contentLastModified,
  production: site.production,
};

const injectBuildMetadata = (html) => html
  .replace(
    "</head>",
    `  <meta name="site-build-sha" content="${attr(buildSha)}">\n  <meta name="site-build-version" content="${attr(buildVersion)}">\n  <meta name="site-build-time" content="${attr(buildTime)}">\n</head>`,
  )
  .replace(/(\/assets\/(?:styles\.css|app\.js|visual-trust\.js))(["'])/g, `$1?v=${buildVersion}$2`);

if (!/^\d{4}-\d{2}-\d{2}$/.test(site.contentLastModified)) {
  throw new Error("contentLastModified должен быть датой YYYY-MM-DD");
}
if (site.basePath && !/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(site.basePath)) {
  throw new Error("SITE_BASE_PATH содержит недопустимые символы");
}

if (site.production) {
  const launchErrors = [];
  let hostname = "";
  try {
    const url = new URL(site.siteUrl);
    hostname = url.hostname;
    if (url.protocol !== "https:") launchErrors.push("siteUrl должен использовать HTTPS");
  } catch {
    launchErrors.push("siteUrl должен быть абсолютным URL");
  }
  if (/^example\./i.test(hostname)) launchErrors.push("замените тестовый siteUrl");
  if (!site.phoneHref) launchErrors.push("укажите phoneHref");
  if (!site.whatsapp || !site.telegram) launchErrors.push("укажите WhatsApp и Telegram для обращений");
  if (site.publicOffice?.enabled && !site.publicOffice.streetAddress) launchErrors.push("заполните адрес включённого publicOffice");
  if (site.analytics?.enabled && !/^G-[A-Z0-9]+$/i.test(site.analytics.googleMeasurementId || "") && !/^\d+$/.test(site.analytics.yandexMetricaId || "")) {
    launchErrors.push("укажите хотя бы один корректный идентификатор аналитики либо отключите analytics.enabled");
  }
  const privacyContent = injectPrivacyPolicy(renderPrivacy().content, "/politika-konfidencialnosti");
  if (/заглушк|\[Указать/i.test(privacyContent)) launchErrors.push("замените черновик политики конфиденциальности");
  if (launchErrors.length) {
    throw new Error(`Публикация остановлена:\n- ${launchErrors.join("\n- ")}`);
  }
}

const writePage = async (pathname, options, context = {}) => {
  const output = pathname === "/" ? join(dist, "index.html") : join(dist, pathname, "index.html");
  const rendered = renderShell({ ...options, pathname });
  const composed = composeRenderedPage(rendered, { pathname, ...context });
  const withPrivacyPolicy = injectPrivacyPolicy(composed, pathname);
  const withGuarantees = injectProcessGuarantees(withPrivacyPolicy, pathname);
  const withCases = injectCaseStudies(withGuarantees, pathname);
  const withSearchVisibility = injectSearchVisibility(withCases, pathname, context.service || null);
  const withVisualTrust = injectVisualTrust(withSearchVisibility, pathname);
  const html = injectBuildMetadata(injectMobileActions(withVisualTrust, pathname));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html, "utf8");
};

const writeRedirect = async (pathname, destination) => {
  const output = join(dist, pathname, "index.html");
  const canonical = `${site.siteUrl}${destination}`;
  const localDestination = `${site.basePath || ""}${destination}`;
  await mkdir(dirname(output), { recursive: true });
  const html = injectBuildMetadata(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,follow">
  <meta http-equiv="refresh" content="0;url=${localDestination}">
  <link rel="canonical" href="${canonical}">
  <title>Страница перемещена | Максим Шевчук</title>
  <meta name="description" content="Материал перемещён на актуальную страницу сайта юридической практики Максима Шевчука.">
</head>
<body>
  <main id="main"><h1>Страница перемещена</h1><p><a href="${localDestination}">Перейти к актуальному материалу</a></p></main>
</body>
</html>`);
  await writeFile(output, html, "utf8");
};

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "assets", "images"), { recursive: true });
await cp(join(root, "src", "assets", "images"), join(dist, "assets", "images"), { recursive: true });
const styles = [
  await readFile(join(root, "src", "styles.css"), "utf8"),
  await readFile(join(root, "src", "site-enhancements.css"), "utf8"),
  await readFile(join(root, "src", "case-studies.css"), "utf8"),
  await readFile(join(root, "src", "search-visibility.css"), "utf8"),
  await readFile(join(root, "src", "mobile-actions.css"), "utf8"),
  await readFile(join(root, "src", "visual-trust.css"), "utf8"),
].join("\n");
await writeFile(join(dist, "assets", "styles.css"), styles, "utf8");
await cp(join(root, "src", "app.js"), join(dist, "assets", "app.js"));
await cp(join(root, "src", "visual-trust.js"), join(dist, "assets", "visual-trust.js"));
await cp(join(root, "public"), dist, { recursive: true });

await writePage("/", renderHome());
await writePage("/uslugi", renderServices());
for (const service of services) {
  await writePage(`/uslugi/${service.slug}`, renderService(service), { service });
}
await writePage("/o-yuriste", renderAbout());
await writePage("/kontakty", renderContacts());
await writePage("/politika-konfidencialnosti", renderPrivacy());
for (const [pathname, destination] of Object.entries(site.legacyRedirects || {})) {
  await writeRedirect(pathname, destination);
}

const indexablePages = [
  {
    path: "/",
    images: [
      "/assets/images/maxim-hero.webp",
      "/assets/images/document-pretenziya-demo.svg",
      "/assets/images/document-police-demo.svg",
      "/assets/images/document-claim-demo.svg",
      "/assets/images/case-autoclub-demo.svg",
      "/assets/images/case-engine-demo.svg",
      "/assets/images/case-land-demo.svg",
    ],
  },
  { path: "/uslugi/", images: ["/assets/images/maxim-documents.webp"] },
  ...services.map((service) => ({ path: `/uslugi/${service.slug}/`, images: ["/assets/images/maxim-documents.webp"] })),
  { path: "/o-yuriste/", images: ["/assets/images/maxim-documents.webp", "/assets/images/diploma-demo.svg"] },
  { path: "/kontakty/", images: ["/assets/images/maxim-consultation.webp"] },
  { path: "/politika-konfidencialnosti/", images: [] },
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${indexablePages.map(({ path, images = [] }) => `  <url>
    <loc>${xml(`${site.siteUrl}${path}`)}</loc>
    <lastmod>${xml(site.contentLastModified)}</lastmod>${images.map((image) => `
    <image:image><image:loc>${xml(`${site.siteUrl}${image}`)}</image:loc></image:image>`).join("")}
  </url>`).join("\n")}
</urlset>\n`;
await writeFile(join(dist, "sitemap.xml"), sitemap, "utf8");

const robots = site.production
  ? `User-agent: *\nAllow: /\n\nSitemap: ${site.siteUrl}/sitemap.xml\n`
  : "User-agent: *\nDisallow: /\n";
await writeFile(join(dist, "robots.txt"), robots, "utf8");

const manifest = {
  id: `${site.basePath || ""}/`,
  name: `${site.name} — юридическая помощь`,
  short_name: site.shortName,
  description: site.defaultDescription,
  lang: "ru",
  start_url: `${site.basePath || ""}/`,
  scope: `${site.basePath || ""}/`,
  display: "standalone",
  background_color: "#f3f0e9",
  theme_color: "#10283d",
  icons: [{ src: `${site.basePath || ""}/favicon.svg`, sizes: "any", type: "image/svg+xml" }],
};
await writeFile(join(dist, "site.webmanifest"), JSON.stringify(manifest, null, 2), "utf8");
await writeFile(join(dist, "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");

if (site.indexNowKey) {
  if (!/^[A-Za-z0-9-]{8,128}$/.test(site.indexNowKey)) {
    throw new Error("indexNowKey должен содержать 8–128 латинских букв, цифр или дефисов");
  }
  await writeFile(join(dist, `${site.indexNowKey}.txt`), site.indexNowKey, "utf8");
}

const notFound = await readFile(join(root, "src", "404.html"), "utf8");
const renderedNotFound = notFound
  .replaceAll("{{SITE_URL}}", site.siteUrl)
  .replace(/(\b(?:href|src)=["'])\/(?!\/)/g, `$1${site.basePath || ""}/`);
await writeFile(join(dist, "404.html"), renderedNotFound, "utf8");

console.log(`Built ${6 + services.length + Object.keys(site.legacyRedirects || {}).length} HTML pages in ${dist} · ${buildVersion}`);