import { articles } from "../src/editorial-data.mjs";
import { findPublicCopyFindings, visibleMainText } from "./public-copy-rules.mjs";

const base = new URL("https://yuristshevchuk.com/");
const expectedSha = "f715849f12ed5242b550aefae68fdcba40f3f6cf";
const targetSlug = "zakazchik-trebuet-vernut-dengi-za-remont";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (pathname, attempt = 1) => {
  const url = new URL(pathname, base);
  url.searchParams.set("verify_c139", `${expectedSha.slice(0, 12)}-${attempt}-${Date.now()}`);
  const response = await fetch(url, {
    headers: {
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  return { response, text: await response.text() };
};

let live = false;
let lastSha = "";
for (let attempt = 1; attempt <= 60; attempt += 1) {
  try {
    const { response, text } = await request("build-info.json", attempt);
    if (response.ok) {
      const info = JSON.parse(text);
      lastSha = info.sha || "";
      if (lastSha === expectedSha) {
        live = true;
        console.log(`Live SHA confirmed on attempt ${attempt}: ${expectedSha.slice(0, 12)}`);
        break;
      }
    }
  } catch (error) {
    console.log(`Live SHA attempt ${attempt}: ${error.message}`);
  }
  if (attempt < 60) await sleep(10_000);
}

if (!live) throw new Error(`Expected live SHA ${expectedSha}; last received ${lastSha || "none"}`);

const target = articles.find((article) => article.slug === targetSlug);
if (!target) throw new Error(`Target article ${targetSlug} is absent from registry`);

for (const article of articles) {
  const { response, text: html } = await request(`razbory/${article.slug}/`);
  if (!response.ok) throw new Error(`${article.slug}: live page returned ${response.status}`);
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
