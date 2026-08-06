import { articles } from "../src/editorial-data.mjs";
import { findPublicCopyFindings, visibleMainText } from "./public-copy-rules.mjs";

const base = new URL("https://yuristshevchuk.com/");
const expectedSha = "f715849f12ed5242b550aefae68fdcba40f3f6cf";
const targetSlug = "zakazchik-trebuet-vernut-dengi-za-remont";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (pathname, attempt = 1, cacheBust = true) => {
  const url = new URL(pathname, base);
  if (cacheBust) url.searchParams.set("verify_c139", `${expectedSha.slice(0, 12)}-${attempt}-${Date.now()}`);
  const response = await fetch(url, {
    headers: {
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
      accept: pathname.endsWith(".json") ? "application/json,text/plain;q=0.9,*/*;q=0.8" : "text/html,*/*;q=0.8",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  return {
    response,
    text: await response.text(),
    contentType: response.headers.get("content-type") || "",
  };
};

const readMetaSha = (html = "") => html.match(/<meta\s+name=["']site-build-sha["']\s+content=["']([^"']+)["'][^>]*>/i)?.[1]
  || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']site-build-sha["'][^>]*>/i)?.[1]
  || "";

let live = false;
let lastDiagnostic = "none";
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const home = await request("", attempt, true);
    const homeSha = readMetaSha(home.text);
    const build = await request("build-info.json", attempt, false);
    let buildSha = "";
    try {
      buildSha = JSON.parse(build.text).sha || "";
    } catch {
      buildSha = "invalid-json";
    }
    lastDiagnostic = `home=${home.response.status}/${homeSha || "missing"}; build=${build.response.status}/${build.contentType}/${buildSha}`;
    console.log(`Production attempt ${attempt}/30: ${lastDiagnostic}`);
    if (home.response.ok && homeSha === expectedSha && build.response.ok && buildSha === expectedSha) {
      live = true;
      break;
    }
  } catch (error) {
    lastDiagnostic = error.message;
    console.log(`Production attempt ${attempt}/30: ${lastDiagnostic}`);
  }
  if (attempt < 30) await sleep(15_000);
}

if (!live) throw new Error(`Expected live SHA ${expectedSha}; ${lastDiagnostic}`);
console.log(`Live SHA confirmed: ${expectedSha.slice(0, 12)}`);

const target = articles.find((article) => article.slug === targetSlug);
if (!target) throw new Error(`Target article ${targetSlug} is absent from registry`);

for (const article of articles) {
  const { response, text: html } = await request(`razbory/${article.slug}/`, 1, true);
  if (!response.ok) throw new Error(`${article.slug}: live page returned ${response.status}`);
  const pageSha = readMetaSha(html);
  if (pageSha !== expectedSha) throw new Error(`${article.slug}: live page SHA ${pageSha || "missing"} differs from expected`);
  const visible = visibleMainText(html);
  const findings = findPublicCopyFindings([visible]);
  if (findings.length) {
    throw new Error(`${article.slug}: public-copy finding ${findings[0].label}: ${findings[0].match}`);
  }

  if (article.slug === targetSlug) {
    for (const phrase of [
      "Что нельзя писать заказчику до проверки",
      "Как подрядчик теряет возможность доказать свою позицию",
      "Объект уже собираются переделывать?",
      "Проверьте ответ до того, как он станет доказательством",
      "Передать претензию на проверку",
    ]) {
      if (!visible.includes(phrase)) throw new Error(`${targetSlug}: missing live phrase ${phrase}`);
    }
    for (const cssClass of [
      "editorial-list--cross",
      "editorial-list--dash",
      "editorial-list--dot",
      "editorial-micro-cta",
    ]) {
      if (!html.includes(cssClass)) throw new Error(`${targetSlug}: missing live semantic class ${cssClass}`);
    }
    const microCtaCount = (html.match(/editorial-micro-cta/g) || []).length;
    if (microCtaCount < 2) throw new Error(`${targetSlug}: expected at least 2 soft CTAs, got ${microCtaCount}`);
    if (/\b(?:автоматическ[\p{L}\p{M}]*|механическ[\p{L}\p{M}]*)\b/iu.test(visible)) {
      throw new Error(`${targetSlug}: unnatural process wording remains in live text`);
    }
  }
}

console.log(`Live C-139 verified at ${expectedSha.slice(0, 12)}; ${articles.length} article pages passed public-copy regression`);
