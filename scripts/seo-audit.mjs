import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];
const warnings = [];
const blockers = [];

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return children.flat();
};

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "";
const meta = (html, key) => {
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = match[0];
    if (attr(tag, "name") === key || attr(tag, "property") === key) return attr(tag, "content");
  }
  return "";
};
const link = (html, rel) => {
  for (const match of html.matchAll(/<link\s+[^>]*>/gi)) {
    const tag = match[0];
    if (attr(tag, "rel").split(/\s+/).includes(rel)) return attr(tag, "href");
  }
  return "";
};
const routeFor = (file) => {
  const local = relative(dist, file).split(sep).join("/");
  if (local === "index.html") return "/";
  if (local.endsWith("/index.html")) return `/${local.slice(0, -"index.html".length)}`;
  return `/${local}`;
};
const isLegacyRedirect = (route) => Boolean(site.legacyRedirects?.[route]);
const expectedIndexable = (route) => {
  if (route === "/404.html") return false;
  if (isLegacyRedirect(route)) return false;
  return true;
};
const stripText = (html) => html
  .replace(/<(script|style|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z0-9#]+;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();
const shingles = (text, size = 5) => {
  const words = text.toLocaleLowerCase("ru").split(/\s+/).filter(Boolean);
  return new Set(words.slice(0, Math.max(0, words.length - size + 1)).map((_, index) => words.slice(index, index + size).join(" ")));
};
const jaccard = (left, right) => {
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
};
const removeBasePath = (pathname) => {
  if (!site.basePath) return pathname;
  if (pathname === site.basePath || pathname === `${site.basePath}/`) return "/";
  return pathname.startsWith(`${site.basePath}/`) ? pathname.slice(site.basePath.length) : pathname;
};

const files = (await walk(dist)).filter((file) => file.endsWith(".html"));
const pages = [];

for (const file of files) {
  const html = await readFile(file, "utf8");
  const route = routeFor(file);
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || "";
  const description = meta(html, "description");
  const robots = meta(html, "robots");
  const canonical = link(html, "canonical");
  const shouldIndex = expectedIndexable(route);
  const isIndex = robots.split(",").map((value) => value.trim()).includes("index");
  const expectedCanonical = isLegacyRedirect(route)
    ? `${site.siteUrl}${site.legacyRedirects[route]}`
    : `${site.siteUrl}${route}`;
  const mainHtml = html.match(/<main[^>]*>[\s\S]*?<\/main>/i)?.[0] || html;
  const mainText = stripText(mainHtml);
  const wordCount = mainText.split(/\s+/).filter(Boolean).length;
  const internalLinks = [...html.matchAll(/href=["'](\/[^"'#?]*)/g)].map((match) => removeBasePath(match[1]));

  if (!title) errors.push(`${route}: отсутствует title`);
  if (title.length < 30 || title.length > 78) warnings.push(`${route}: длина title ${title.length} знаков`);
  if (description.length < 70 || description.length > 180) warnings.push(`${route}: длина description ${description.length} знаков`);
  if ((html.match(/<h1(?:\s|>)/g) || []).length !== 1) errors.push(`${route}: нужен ровно один H1`);
  if (canonical !== expectedCanonical) errors.push(`${route}: canonical ${canonical || "отсутствует"}, ожидался ${expectedCanonical}`);
  if (!robots) errors.push(`${route}: отсутствует meta robots`);
  if (site.production && shouldIndex && !isIndex) errors.push(`${route}: production-страница ошибочно закрыта от индексации`);
  if (site.production && !shouldIndex && isIndex) errors.push(`${route}: служебная/черновая страница ошибочно индексируется`);
  if (route !== "/404.html" && !isLegacyRedirect(route) && (!meta(html, "og:title") || !meta(html, "og:description") || !meta(html, "og:image"))) errors.push(`${route}: неполный Open Graph`);
  if (route !== "/404.html" && !isLegacyRedirect(route) && (!meta(html, "og:image:width") || !meta(html, "og:image:height") || !meta(html, "og:image:alt"))) warnings.push(`${route}: неполные атрибуты изображения Open Graph`);
  if (/<img(?![^>]*\balt=)[^>]*>/i.test(html)) errors.push(`${route}: изображение без alt`);
  if (/<img(?![^>]*\bwidth=)[^>]*>/i.test(html) || /<img(?![^>]*\bheight=)[^>]*>/i.test(html)) errors.push(`${route}: изображение без width/height`);

  const jsonLdBlocks = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  const graphTypes = [];
  const graphNodes = [];
  for (const block of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const graph = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
      graphNodes.push(...graph);
      graphTypes.push(...graph.flatMap((node) => Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]));
      const webPage = graph.find((node) => ["WebPage", "ProfilePage", "ContactPage", "CollectionPage"].includes(node["@type"]));
      if (route !== "/404.html" && !isLegacyRedirect(route) && !webPage) errors.push(`${route}: нет сущности WebPage/подтипа в JSON-LD`);
      if (webPage && webPage.dateModified !== site.contentLastModified) errors.push(`${route}: неверный dateModified в JSON-LD`);
    } catch (error) {
      errors.push(`${route}: JSON-LD не разбирается (${error.message})`);
    }
  }
  if (route !== "/404.html" && !isLegacyRedirect(route) && !graphTypes.includes("WebSite")) errors.push(`${route}: нет WebSite в JSON-LD`);
  if (/mail@example\.ru/i.test(html)) errors.push(`${route}: найден тестовый email`);

  if (route === "/kontakty/" && site.publicOffice?.enabled) {
    const organization = graphNodes.find((node) => node["@type"] === "LegalService");
    const person = graphNodes.find((node) => node["@type"] === "Person");
    if (!organization) errors.push(`${route}: нет LegalService для подтверждённого офиса`);
    else {
      if (organization.name !== site.businessName) errors.push(`${route}: название LegalService не совпадает с Яндекс Бизнес`);
      if (organization.telephone !== site.phoneHref) errors.push(`${route}: телефон LegalService не совпадает с публичным телефоном`);
      if (!organization.address?.streetAddress || !organization.address?.addressLocality || !organization.address?.addressRegion) errors.push(`${route}: неполный PostalAddress в LegalService`);
      if (!organization.geo?.latitude || !organization.geo?.longitude) errors.push(`${route}: отсутствуют координаты офиса в LegalService`);
      if (!organization.openingHours?.length) errors.push(`${route}: отсутствует график офиса в LegalService`);
      if (site.publicOffice.mapUrl && organization.hasMap !== site.publicOffice.mapUrl) errors.push(`${route}: hasMap не совпадает с карточкой организации`);
      if (site.publicOffice.mapUrl && !organization.sameAs?.includes(site.publicOffice.mapUrl)) errors.push(`${route}: карточка организации отсутствует в sameAs`);
    }
    if (site.publicOffice.mapUrl && person?.sameAs?.includes(site.publicOffice.mapUrl)) errors.push(`${route}: карточка организации ошибочно присвоена Person`);
    for (const value of [site.publicOffice.postalCode, site.publicOffice.addressRegion, site.publicOffice.addressLocality, site.publicOffice.streetAddress]) {
      if (value && !mainText.includes(value)) errors.push(`${route}: адресная часть «${value}» отсутствует в видимом тексте`);
    }
  }

  pages.push({ route, title, description, robots, shouldIndex, internalLinks, wordCount, mainText });
}

for (const field of ["title", "description"]) {
  const groups = new Map();
  for (const page of pages.filter((item) => item.route !== "/404.html" && !isLegacyRedirect(item.route))) {
    const value = page[field];
    groups.set(value, [...(groups.get(value) || []), page.route]);
  }
  for (const [value, routes] of groups) {
    if (value && routes.length > 1) errors.push(`Дублируется ${field}: ${routes.join(", ")}`);
  }
}

const contentPages = pages.filter((page) => page.shouldIndex && page.route !== "/404.html");
for (let leftIndex = 0; leftIndex < contentPages.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < contentPages.length; rightIndex += 1) {
    const left = contentPages[leftIndex];
    const right = contentPages[rightIndex];
    const similarity = jaccard(shingles(left.mainText), shingles(right.mainText));
    if (similarity > 0.86) {
      warnings.push(`Высокая схожесть основного контента (${Math.round(similarity * 100)}%): ${left.route} и ${right.route}`);
    }
  }
}

const sitemap = await readFile(join(dist, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => match[1].replaceAll("&amp;", "&"))
  .filter((url) => !url.includes("/assets/"));
const expectedUrls = pages.filter((page) => page.shouldIndex).map((page) => `${site.siteUrl}${page.route}`).sort();
if (new Set(sitemapUrls).size !== sitemapUrls.length) errors.push("sitemap.xml содержит дубли URL");
if (JSON.stringify([...sitemapUrls].sort()) !== JSON.stringify(expectedUrls)) {
  errors.push("Состав sitemap.xml не совпадает с набором канонических индексируемых страниц");
}
if ((sitemap.match(/<lastmod>/g) || []).length !== expectedUrls.length) errors.push("Не для всех URL sitemap указан lastmod");

const linked = new Set(pages.flatMap((page) => page.internalLinks));
for (const page of pages.filter((item) => item.shouldIndex && item.route !== "/")) {
  if (!linked.has(page.route)) warnings.push(`${page.route}: возможная страница-сирота`);
}

const robotsTxt = await readFile(join(dist, "robots.txt"), "utf8");
if (site.production && !robotsTxt.includes(`Sitemap: ${site.siteUrl}/sitemap.xml`)) errors.push("robots.txt не содержит ссылку на sitemap");
if (!site.production && !/Disallow:\s*\//.test(robotsTxt)) errors.push("Прототип не закрыт в robots.txt");

for (const page of pages) {
  for (const target of page.internalLinks) {
    if (target === "/") continue;
    const local = target.endsWith("/") ? join(dist, target, "index.html") : join(dist, target);
    try { await access(local); } catch { errors.push(`${page.route}: битая внутренняя ссылка ${target}`); }
  }
}

if (/example\.(ru|com)$/i.test(new URL(site.siteUrl).hostname)) blockers.push("Заменить тестовый домен siteUrl");
if (!site.phoneHref) blockers.push("Указать реальный телефон");
if (!site.whatsapp || !site.telegram) blockers.push("Указать WhatsApp и Telegram для обращений");
if (!site.webmasterVerification?.google) blockers.push("Подтвердить сайт в Google Search Console");
if (!site.webmasterVerification?.yandex) blockers.push("Подтвердить сайт в Яндекс Вебмастере");
if (!site.publicOffice?.enabled) warnings.push("Публичный офис не указан: локальная разметка LegalService и адресная карточка отключены");
if (!site.production) blockers.push("После заполнения данных переключить production: true");

console.log(`SEO audit: ${pages.length} HTML-страниц, ${expectedUrls.length} URL в карте сайта`);
console.log(`Ошибки: ${new Set(errors).size}; предупреждения: ${new Set(warnings).size}; блокеры запуска: ${new Set(blockers).size}`);
if (blockers.length) console.log(`\nБлокеры запуска:\n- ${[...new Set(blockers)].join("\n- ")}`);
if (warnings.length) console.log(`\nПредупреждения:\n- ${[...new Set(warnings)].join("\n- ")}`);
if (errors.length) {
  console.error(`\nОшибки:\n- ${[...new Set(errors)].join("\n- ")}`);
  process.exit(1);
}
console.log("\nКритических технических SEO-ошибок не найдено.");
