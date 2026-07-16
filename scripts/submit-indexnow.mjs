import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

if (!site.production) throw new Error("IndexNow разрешён только после установки production: true");
if (!site.indexNowKey || !/^[A-Za-z0-9-]{8,128}$/.test(site.indexNowKey)) {
  throw new Error("Укажите корректный indexNowKey в site.config.mjs");
}
if (/example\.(ru|com)$/i.test(new URL(site.siteUrl).hostname)) {
  throw new Error("Замените тестовый siteUrl на реальный домен");
}

const sitemap = await readFile(join(root, "dist", "sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => match[1])
  .filter((url) => !url.includes("/assets/"));

const payload = {
  host: new URL(site.siteUrl).hostname,
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

console.log(`IndexNow принял ${urlList.length} URL (HTTP ${response.status})`);
