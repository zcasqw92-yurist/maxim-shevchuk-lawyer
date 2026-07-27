import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { site } from "../site.config.mjs";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const errors = [];
const sitemap = await readFile(join(dist, "sitemap.xml"), "utf8");
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => new URL(match[1]).pathname)
  .filter((pathname) => !pathname.startsWith("/assets/"));

const fileForRoute = (pathname) => pathname === "/"
  ? join(dist, "index.html")
  : join(dist, pathname.replace(/^\/+|\/+$/g, ""), "index.html");

for (const pathname of routes) {
  const html = await readFile(fileForRoute(pathname), "utf8");
  if (!html.includes(`meta name="service-area" content="${site.serviceGeography.publicLabel}"`)) {
    errors.push(`${pathname}: отсутствует единое описание географии услуг`);
  }
  if (!html.includes(site.serviceGeography.publicLabel)) {
    errors.push(`${pathname}: география не показана посетителю в подвале`);
  }
  if (html.includes("Утро, 07:00–12:00")) {
    errors.push(`${pathname}: в форме осталось старое время начала связи`);
  }
}

const home = await readFile(join(dist, "index.html"), "utf8");
for (const marker of [
  '"addressLocality":"Химки"',
  '"@type":"City","name":"Москва"',
  '"@type":"AdministrativeArea","name":"Московская область"',
  '"@type":"Country","name":"Россия","description":"Дистанционные юридические услуги"',
  "Москва и область",
]) {
  if (!home.includes(marker)) errors.push(`Главная: отсутствует географический маркер ${marker}`);
}
if (home.includes("<small>юрист · Москва</small>")) errors.push("Главная: офис и территория услуг всё ещё смешаны");

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(`Geography checks passed: office in Khimki, services in Moscow and Moscow Region, online across Russia (${routes.length} pages)`);
