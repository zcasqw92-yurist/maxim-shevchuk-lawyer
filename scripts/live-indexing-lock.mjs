import { site } from "../site.config.mjs";
import { services } from "../src/data.mjs";

const publicUrl = String(process.env.SITE_PUBLIC_URL || "").trim();
const attempts = Math.max(1, Number(process.env.LIVE_SMOKE_ATTEMPTS || 18));
const delayMs = Math.max(1000, Number(process.env.LIVE_SMOKE_DELAY_MS || 5000));

if (!publicUrl) throw new Error("SITE_PUBLIC_URL is required");

const base = new URL(publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const noCacheUrl = (pathname) => {
  const url = new URL(pathname, base);
  url.searchParams.set("indexing_lock_check", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return url;
};

const tokensFromRobotsMeta = (html) => {
  const tag = html.match(/<meta\s+name=["']robots["'][^>]*>/i)?.[0] || "";
  const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] || "";
  return content.toLowerCase().split(",").map((value) => value.trim()).filter(Boolean);
};
const requiredTokens = ["noindex", "nofollow", "noarchive", "nosnippet", "noimageindex"];
const canonicalPaths = [
  "",
  "uslugi/",
  ...services.map((service) => `uslugi/${service.slug}/`),
  "o-yuriste/",
  "kontakty/",
  "politika-konfidencialnosti/",
];

let lastError = "published indexing lock has not become available";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const [infoResponse, robotsResponse, sitemapResponse, indexNowResponse, ...pageResponses] = await Promise.all([
      fetch(noCacheUrl("build-info.json"), { cache: "no-store", redirect: "follow" }),
      fetch(noCacheUrl("robots.txt"), { cache: "no-store", redirect: "follow" }),
      fetch(noCacheUrl("sitemap.xml"), { cache: "no-store", redirect: "follow" }),
      fetch(noCacheUrl(`${site.indexNowKey}.txt`), { cache: "no-store", redirect: "follow" }),
      ...canonicalPaths.map((pathname) => fetch(noCacheUrl(pathname), { cache: "no-store", redirect: "follow" })),
    ]);

    for (const [name, response] of [
      ["build-info.json", infoResponse],
      ["robots.txt", robotsResponse],
      ["sitemap.xml", sitemapResponse],
      ...canonicalPaths.map((pathname, index) => [pathname || "home page", pageResponses[index]]),
    ]) {
      if (!response.ok) throw new Error(`${name} returned ${response.status}`);
    }
    if (indexNowResponse.ok) throw new Error("IndexNow key file is still publicly available");

    const info = await infoResponse.json();
    if (info.indexingLocked !== true) throw new Error("build-info.json does not confirm indexingLocked=true");
    if (info.indexingPolicy !== "site-wide-noindex") throw new Error("build-info.json has unexpected indexingPolicy");

    const pages = await Promise.all(pageResponses.map((response) => response.text()));
    for (const [index, html] of pages.entries()) {
      const pathname = canonicalPaths[index] || "home page";
      const robotsTokens = tokensFromRobotsMeta(html);
      for (const token of requiredTokens) {
        if (!robotsTokens.includes(token)) {
          throw new Error(`${pathname} robots meta is missing ${token}: ${robotsTokens.join(",") || "missing"}`);
        }
      }
      if (robotsTokens.includes("index")) throw new Error(`${pathname} contains index directive`);
    }

    const robotsTxt = await robotsResponse.text();
    if (/Sitemap:/i.test(robotsTxt)) throw new Error("robots.txt still advertises sitemap.xml");

    const sitemap = await sitemapResponse.text();
    if (/<loc>/i.test(sitemap)) throw new Error("sitemap.xml still contains indexable URLs");

    console.log(`Published indexing lock verified on ${canonicalPaths.length} canonical pages · ${base}`);
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.log(`Live indexing-lock attempt ${attempt}/${attempts}: ${lastError}`);
    if (attempt < attempts) await sleep(delayMs);
  }
}

throw new Error(`Published indexing-lock verification failed: ${lastError}`);
