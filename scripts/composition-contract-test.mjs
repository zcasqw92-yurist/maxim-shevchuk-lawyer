import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "../site.config.mjs";
import { services } from "../src/data.mjs";
import { appendToBuildSlot, buildSlot, fillBuildSlot, finalizeBuildSlots } from "../src/html-slots.mjs";
import { privacyPolicyHeadingContract } from "../src/privacy-policy.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const goldenPath = join(root, "tests", "golden-render-contract.json");
const privacyRoute = "/politika-konfidencialnosti";
const privacyFooterHeading = "h2:Направления";
const privacyHeadingToken = "privacy-policy-headings:validated";
const routes = [
  ["/", "index.html"],
  ["/uslugi", join("uslugi", "index.html")],
  ...services.map((service) => [`/uslugi/${service.slug}`, join("uslugi", service.slug, "index.html")]),
  ["/o-yuriste", join("o-yuriste", "index.html")],
  ["/kontakty", join("kontakty", "index.html")],
  [privacyRoute, join("politika-konfidencialnosti", "index.html")],
];

const analyticsConsentHooks = [
  "data-consent-accept",
  "data-consent-banner",
  "data-consent-reject",
  "data-consent-settings",
];
const analyticsConsentHookSet = new Set(analyticsConsentHooks);
const analyticsConsentRequired = Boolean(site.analytics?.enabled && site.analytics?.requireConsent);

const decodeText = (value = "") => value
  .replace(/<[^>]+>/g, " ")
  .replaceAll("&nbsp;", " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replace(/\s+/g, " ")
  .trim();

const normalizeInternalRoute = (value) => {
  let route = value.replaceAll("&amp;", "&");
  if (site.basePath && route.startsWith(`${site.basePath}/`)) route = route.slice(site.basePath.length);
  if (!route.startsWith("/")) return "";
  return route.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/");
};

const jsonLdTypes = (html) => [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap((match) => {
    const parsed = JSON.parse(match[1]);
    const graph = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
    return graph.flatMap((node) => Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]).filter(Boolean);
  })
  .sort();

const pageSignature = (html) => ({
  title: decodeText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]),
  sections: [...html.matchAll(/<section\b[^>]*class="([^"]+)"/g)].map((match) => match[1].replace(/\s+/g, " ").trim()),
  headings: [...html.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((match) => `h${match[1]}:${decodeText(match[2])}`),
  dialogs: [...html.matchAll(/<dialog\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]),
  internalRoutes: [...new Set(
    [...html.matchAll(/\bhref="([^"]+)"/g)]
      .map((match) => normalizeInternalRoute(match[1]))
      .filter(Boolean),
  )].sort(),
  dataHooks: [...new Set([...html.matchAll(/\s(data-[a-z0-9-]+)(?:=|\s|>)/g)].map((match) => match[1]))].sort(),
  jsonLdTypes: jsonLdTypes(html),
});

const normalizeHeadings = (route, headings = [], validatePrivacy = false) => {
  if (route !== privacyRoute) return headings;
  const footerIndex = headings.indexOf(privacyFooterHeading);
  if (footerIndex < 0) throw new Error(`${privacyRoute}: не найдена граница между политикой и подвалом`);
  const policyHeadings = headings.slice(0, footerIndex);
  if (validatePrivacy && JSON.stringify(policyHeadings) !== JSON.stringify(privacyPolicyHeadingContract)) {
    throw new Error(`${privacyRoute}: заголовки политики не соответствуют утверждённому контракту`);
  }
  return [privacyHeadingToken, ...headings.slice(footerIndex)];
};

const structuralSignature = (route, signature = {}) => {
  const {
    title: _seoTitle,
    headings = [],
    dataHooks = [],
    ...structure
  } = signature;
  return {
    ...structure,
    headings: normalizeHeadings(route, headings),
    // Баннер согласия и кнопка настроек появляются только при включённой аналитике.
    // Их наличие проверяется отдельно ниже, а golden-контракт остаётся одинаковым
    // для локальной preview-сборки и production.
    dataHooks: dataHooks.filter((hook) => !analyticsConsentHookSet.has(hook)),
  };
};

const actual = {};
for (const [route, file] of routes) {
  const html = await readFile(join(dist, file), "utf8");
  if (html.includes("<!-- build-slot:")) throw new Error(`${route}: в публикации остался сборочный слот`);
  actual[route] = pageSignature(html);
  normalizeHeadings(route, actual[route].headings, true);

  const hookSet = new Set(actual[route].dataHooks);
  const presentConsentHooks = analyticsConsentHooks.filter((hook) => hookSet.has(hook));
  if (analyticsConsentRequired && presentConsentHooks.length !== analyticsConsentHooks.length) {
    const missing = analyticsConsentHooks.filter((hook) => !hookSet.has(hook));
    throw new Error(`${route}: при включённой аналитике отсутствуют hooks согласия: ${missing.join(", ")}`);
  }
  if (!analyticsConsentRequired && presentConsentHooks.length) {
    throw new Error(`${route}: hooks согласия не должны выводиться при выключенной аналитике: ${presentConsentHooks.join(", ")}`);
  }
}

// Именованный слот не зависит от текста или класса соседнего контейнера.
const changedWrapper = `<section class="renamed-wrapper">Новый текст</section>${buildSlot("example")}${buildSlot("head-assets")}`;
const withContent = fillBuildSlot(changedWrapper, "example", "<aside>Соседний блок сохранён</aside>");
const withHeadAsset = appendToBuildSlot(withContent, "head-assets", "<script></script>");
const finalized = finalizeBuildSlots(withHeadAsset, "/contract");
if (!finalized.includes("renamed-wrapper") || !finalized.includes("Соседний блок сохранён") || finalized.includes("build-slot:")) {
  throw new Error("Именованные слоты не выдержали изменение соседнего wrapper-класса или текста");
}

if (process.env.UPDATE_GOLDEN === "1") {
  await writeFile(goldenPath, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
  console.log(`Golden render contract updated: ${routes.length} canonical pages`);
  process.exit(0);
}

const expected = JSON.parse(await readFile(goldenPath, "utf8"));
// SEO-title является управляемым контентом. Его корректность проверяется SEO-аудитом,
// а golden-контракт защищает постоянную структуру страниц и клиентские hooks.
// Заголовки политики имеют отдельный строгий контракт, потому что сам текст политики
// формируется специализированным модулем и может осознанно обновляться независимо.
const actualStructure = Object.fromEntries(
  Object.entries(actual).map(([route, signature]) => [route, structuralSignature(route, signature)]),
);
const expectedStructure = Object.fromEntries(
  Object.entries(expected).map(([route, signature]) => [route, structuralSignature(route, signature)]),
);

if (JSON.stringify(actualStructure) !== JSON.stringify(expectedStructure)) {
  const changedRoutes = routes
    .map(([route]) => route)
    .filter((route) => JSON.stringify(actualStructure[route]) !== JSON.stringify(expectedStructure[route]));
  const changedFields = changedRoutes.map((route) => {
    const actualPage = actualStructure[route] || {};
    const expectedPage = expectedStructure[route] || {};
    const fields = [...new Set([...Object.keys(actualPage), ...Object.keys(expectedPage)])]
      .filter((field) => JSON.stringify(actualPage[field]) !== JSON.stringify(expectedPage[field]));
    return `${route}: ${fields.join(", ") || "unknown"}`;
  });
  throw new Error(`Структурный golden-контракт изменился: ${changedFields.join("; ")}. Проверьте diff и обновляйте эталон только осознанно.`);
}

console.log(`Composition contract passed: named slots, privacy policy headings, analytics consent mode and golden structure for ${routes.length} canonical pages`);
