import { site } from "../site.config.mjs";

const base = site.basePath || "";
const primaryItems = [
  { label: "Разборы", route: "/razbory/" },
  { label: "Практика", route: "/praktika/" },
];

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hrefFor = (route) => `${base}${route}`;
const isCurrent = (pathname, route) => pathname === route.slice(0, -1) || pathname.startsWith(route);
const arrowIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const desktopLinks = (pathname) => primaryItems
  .map(({ label, route }) => `<a href="${hrefFor(route)}"${isCurrent(pathname, route) ? ' aria-current="page"' : ""}>${label}</a>`)
  .join("");

const mobileLinks = (pathname) => primaryItems
  .map(({ label, route }) => `<a href="${hrefFor(route)}"${isCurrent(pathname, route) ? ' aria-current="page"' : ""}>${label}${arrowIcon}</a>`)
  .join("");

const insertAfterServices = (html, className, markup, pathname) => {
  const navPattern = new RegExp(`(<nav class="${escapePattern(className)}"[\\s\\S]*?<\\/nav>)`);
  const nav = html.match(navPattern)?.[1];
  if (!nav) throw new Error(`Не найдена навигация ${className}: ${pathname}`);
  if (nav.includes(hrefFor("/razbory/")) || nav.includes(hrefFor("/praktika/"))) {
    throw new Error(`Редакционные ссылки уже присутствуют в ${className}: ${pathname}`);
  }

  const servicesHref = escapePattern(hrefFor("/uslugi/"));
  const serviceLinkPattern = new RegExp(`(<a href="${servicesHref}"[^>]*>[\\s\\S]*?Услуги[\\s\\S]*?<\\/a>)`);
  if (!serviceLinkPattern.test(nav)) throw new Error(`Не найдена ссылка «Услуги» в ${className}: ${pathname}`);

  return html.replace(navPattern, nav.replace(serviceLinkPattern, `$1${markup}`));
};

const insertFooterLinks = (html, pathname) => {
  if (html.includes('data-editorial-footer-links')) throw new Error(`Редакционные ссылки подвала уже добавлены: ${pathname}`);
  const marker = '<h2 class="footer__title">Информация</h2>\n        <ul class="footer__links">';
  if (!html.includes(marker)) throw new Error(`Не найден раздел «Информация» в подвале: ${pathname}`);
  const links = `<li data-editorial-footer-links><a href="${hrefFor("/uslugi/")}">Все услуги</a></li><li><a href="${hrefFor("/razbory/")}">Разборы</a></li><li><a href="${hrefFor("/praktika/")}">Практика</a></li>`;
  return html.replace(marker, `${marker}\n          ${links}`);
};

const markMobileCurrentPage = (html, pathname) => {
  const navPattern = /(<nav class="mobile-nav"[\s\S]*?<\/nav>)/;
  const nav = html.match(navPattern)?.[1];
  if (!nav) return html;
  const routes = ["/", "/uslugi/", "/razbory/", "/praktika/", "/o-yuriste/", "/kontakty/"];
  let updated = nav.replace(/\saria-current="page"/g, "");
  for (const route of routes) {
    const current = route === "/" ? pathname === "/" : pathname === route.slice(0, -1) || pathname.startsWith(route);
    if (!current) continue;
    const href = escapePattern(hrefFor(route));
    updated = updated.replace(new RegExp(`<a href="${href}"`), `<a href="${href}" aria-current="page"`);
    break;
  }
  return html.replace(navPattern, updated);
};

export const injectNavigationDiscovery = (html, pathname) => {
  let result = insertAfterServices(html, "desktop-nav", desktopLinks(pathname), pathname);
  result = insertAfterServices(result, "mobile-nav", mobileLinks(pathname), pathname);
  result = markMobileCurrentPage(result, pathname);
  return insertFooterLinks(result, pathname);
};
