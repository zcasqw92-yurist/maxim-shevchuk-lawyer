import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const submitAll = process.argv.includes("--all");
const changedDate = String(process.env.INDEXNOW_CHANGED_DATE || "").trim();
const explicitUrls = String(process.env.INDEXNOW_URLS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!site.production) throw new Error("IndexNow разрешён только после установки production: true");
if (!site.indexNowKey || !/^[A-Za-z0-9-]{8,128}$/.test(site.indexNowKey)) {
  throw new Error("Укажите корректный indexNowKey в site.config.mjs");
}
if (/example\.(ru|com)$/i.test(new URL(site.siteUrl).hostname)) {
  throw new Error("Замените тестовый siteUrl на реальный домен");
}
if (changedDate && !/^\d{4}-\d{2}-\d{2}$/.test(changedDate)) {
  throw new Error("INDEXNOW_CHANGED_DATE должен быть датой YYYY-MM-DD");
}

const sitemap = await readFile(join(root, "dist", "sitemap.xml"), "utf8");
const entries = [...sitemap.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>[\s\S]*?<\/url>/g)]
  .map((match) => ({ url: match[1], lastmod: match[2] }))
  .filter((entry) => !entry.url.includes("/assets/"));

let urlList = [];
if (explicitUrls.length) {
  urlList = explicitUrls;
} else if (submitAll) {
  urlList = entries.map((entry) => entry.url);
} else if (changedDate) {
  urlList = entries.filter((entry) => entry.lastmod === changedDate).map((entry) => entry.url);
} else {
  throw new Error("Укажите INDEXNOW_CHANGED_DATE, INDEXNOW_URLS или флаг --all");
}

const host = new URL(site.siteUrl).hostname;
urlList = [...new Set(urlList)].filter((url) => {
  const parsed = new URL(url);
  if (parsed.hostname !== host) throw new Error(`IndexNow URL относится к другому домену: ${url}`);
  return true;
});

if (!urlList.length) {
  console.log(`IndexNow: нет URL с содержательным обновлением за ${changedDate || "указанный период"}`);
  process.exit(0);
}

const payload = {
  host,
  key: site.indexNowKey,
  keyLocation: `${site.siteUrl}/${site.indexNowKey}.txt`,
  urlList,
};

if (dryRun) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  throw new Error(`IndexNow вернул HTTP ${response.status}: ${await response.text()}`);
}

console.log(`IndexNow принял ${urlList.length} изменённых URL (HTTP ${response.status})`);
