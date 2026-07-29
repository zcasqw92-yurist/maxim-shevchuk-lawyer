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

const removedInteractionHooks = new Set([
  "data-callback-close",
  "data-callback-copy",
  "data-callback-form",
  "data-callback-note",
  "data-callback-open",
  "data-callback-telegram",
  "data-callback-whatsapp",
  "data-mobile-contact-later",
  "data-price-quiz-back",
  "data-price-quiz-close",
  "data-price-quiz-controls",
  "data-price-quiz-open",
  "data-price-quiz-option",
  "data-price-quiz-progress",
  "data-price-quiz-progress-bar",
  "data-price-quiz-result",
  "data-price-quiz-step",
  "data-price-quiz-telegram",
  "data-price-quiz-telegram-note",
  "data-price-quiz-whatsapp",
  "data-quiz-value",
]);
const contextualHooks = new Set([
  "data-message",
  "data-mobile-contact-now",
  "data-protected-image",
  "data-topic",
]);
const removedDialogs = new Set(["callback-dialog", "price-quiz-dialog"]);
const removedHeadings = new Set([
  "h2:Что произошло?",
  "h2:С чем связан вопрос?",
  "h2:Какой результат нужен?",
  "h2:Кто вторая сторона?",
  "h2:Какие материалы есть?",
  "h2:Что уже есть?",
  "h2:Насколько срочно?",
  "h2:Есть ли срок?",
  "h2:Можно уточнить стоимость по вашей ситуации",
  "h2:Оставьте контакт и удобное время",
]);
const intentionallyRemovedCatalogSections = new Set(["section section--cta"]);
const intentionallyRemovedCatalogHeadings = new Set(["h2:Начнём с правильной квалификации"]);
const closingSection = "section section--cta section--closing-cta";
const closingContactHeading = "h2:Готовы передать ситуацию?";
const isEditorialRoute = (route = "") => /^\/(?:razbory|praktika)(?:\/|$)/.test(route);
const isTechnicalDiscoveryRoute = (route = "") => route === "/feed.xml";

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
  if (route !== privacyRoute) return headings.filter((heading) => !removedHeadings.has(heading));
  const footerIndex = headings.indexOf(privacyFooterHeading);
  if (footerIndex < 0) throw new Error(`${privacyRoute}: не найдена граница между политикой и подвалом`);
  const policyHeadings = headings.slice(0, footerIndex);
  if (validatePrivacy && JSON.stringify(policyHeadings) !== JSON.stringify(privacyPolicyHeadingContract)) {
    throw new Error(`${privacyRoute}: заголовки политики не соответствуют утверждённому контракту`);
  }
  return [privacyHeadingToken, ...headings.slice(footerIndex).filter((heading) => !removedHeadings.has(heading))];
};

const normalizeClosingSections = (route, sections = []) => sections
  .map((section) => route === "/o-yuriste" && section === closingSection ? "section section--cta" : section)
  .filter((section) => route !== "/kontakty" || section !== closingSection);

const normalizeClosingHeadings = (route, headings = []) => headings
  .filter((heading) => route !== "/kontakty" || heading !== closingContactHeading);

const structuralSignature = (route, signature = {}) => {
  const {
    title: _seoTitle,
    headings = [],
    sections = [],
    dialogs = [],
    dataHooks = [],
    internalRoutes = [],
    ...structure
  } = signature;
  const normalizedSections = normalizeClosingSections(route, sections)
    .filter((section) => !section.includes("price-quiz__step") && !section.includes("price-quiz__result"))
    .filter((section) => route !== "/uslugi" || !intentionallyRemovedCatalogSections.has(section));
  const normalizedHeadings = normalizeClosingHeadings(route, normalizeHeadings(route, headings))
    .filter((heading) => route !== "/uslugi" || !intentionallyRemovedCatalogHeadings.has(heading));
  return {
    ...structure,
    internalRoutes: internalRoutes.filter((path) => !isEditorialRoute(path) && !isTechnicalDiscoveryRoute(path)),
    sections: normalizedSections,
    headings: normalizedHeadings,
    dialogs: dialogs.filter((dialog) => !removedDialogs.has(dialog)),
    dataHooks: dataHooks.filter((hook) => !analyticsConsentHookSet.has(hook) && !removedInteractionHooks.has(hook) && !contextualHooks.has(hook)),
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
      .filter((field) => JSON.stringify(actualPage[field]) !== JSON.stringify(expectedPage[field]))
      .map((field) => {
        if (field !== "dataHooks") return field;
        const actualHooks = new Set(actualPage.dataHooks || []);
        const expectedHooks = new Set(expectedPage.dataHooks || []);
        const added = [...actualHooks].filter((hook) => !expectedHooks.has(hook));
        const removed = [...expectedHooks].filter((hook) => !actualHooks.has(hook));
        return `dataHooks(+${added.join("|") || "-"};-${removed.join("|") || "-"})`;
      });
    return `${route}: ${fields.join(", ") || "unknown"}`;
  });
  throw new Error(`Структурный golden-контракт изменился: ${changedFields.join("; ")}. Проверьте diff и обновляйте эталон только осознанно.`);
}

console.log(`Composition contract passed: named slots, privacy policy headings, analytics consent mode and form-free golden structure for ${routes.length} canonical pages; editorial routes are verified separately`);
