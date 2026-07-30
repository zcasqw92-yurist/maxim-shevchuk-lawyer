const MAX_TEXT_LENGTH = 120;
const ATTRIBUTION_STORAGE_KEY = "traffic_attribution_v1";
const JOURNEY_STORAGE_KEY = "traffic_journey_v1";
const BUTTON_SELECTOR = [
  "button",
  "a.button",
  "a.text-link",
  "[role='button']",
  "[data-dialog-open]",
  "[data-track]",
].join(", ");
const REQUIRED_BUTTON_METADATA = Object.freeze([
  "button_id",
  "button_label",
  "button_kind",
  "button_placement",
  "button_destination",
]);

const analyticsEnabled = document.body.dataset.analyticsEnabled === "true";
const analyticsRequiresConsent = document.body.dataset.analyticsRequiresConsent === "true";
const yandexMetricaId = Number(document.body.dataset.yandexMetricaId || 0);

const consentValue = () => {
  try { return localStorage.getItem("analytics_consent") || ""; } catch { return ""; }
};

const mayTrack = () => analyticsEnabled && (!analyticsRequiresConsent || consentValue() === "granted");

const cleanText = (value = "", limit = MAX_TEXT_LENGTH) => String(value)
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, limit);

const slugify = (value = "") => cleanText(value, 220)
  .toLocaleLowerCase("ru-RU")
  .replace(/ё/g, "е")
  .replace(/[^a-zа-я0-9]+/gi, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 96) || "action";

const shortHash = (value = "") => {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 7);
};

const readSessionJson = (key, fallback) => {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const viewportGroup = () => {
  if (matchMedia("(max-width: 680px)").matches) return "mobile";
  if (matchMedia("(max-width: 1024px)").matches) return "tablet";
  return "desktop";
};

const pageGroup = () => {
  const path = location.pathname;
  if (path === "/") return "home";
  if (path === "/uslugi/" || path === "/uslugi") return "services_index";
  if (path.startsWith("/uslugi/")) return "service";
  if (path === "/razbory/" || path === "/razbory") return "articles_index";
  if (path.startsWith("/razbory/")) return "article";
  if (path === "/praktika/" || path === "/praktika") return "practice_index";
  if (path.startsWith("/praktika/")) return "practice_case";
  if (path.startsWith("/o-yuriste")) return "about";
  if (path.startsWith("/kontakty")) return "contacts";
  if (path.startsWith("/politika-konfidencialnosti")) return "privacy";
  return "other";
};

const safePath = (value = "") => {
  try {
    const url = new URL(value, location.origin);
    return cleanText(url.pathname || "/", 160);
  } catch {
    return cleanText(String(value).split(/[?#]/)[0] || "/", 160);
  }
};

const contentFields = () => {
  const publication = document.querySelector("[data-publication-kind]");
  if (publication) {
    return {
      content_kind: cleanText(publication.dataset.publicationKind || "publication", 40),
      content_id: cleanText(
        publication.dataset.articleId
        || publication.dataset.caseId
        || publication.dataset.publicationId
        || location.pathname.split("/").filter(Boolean).at(-1)
        || "unknown",
        96,
      ),
    };
  }
  if (location.pathname.startsWith("/uslugi/") && location.pathname !== "/uslugi/") {
    return {
      content_kind: "service",
      content_id: cleanText(location.pathname.split("/").filter(Boolean).at(-1) || "unknown", 96),
    };
  }
  return { content_kind: pageGroup(), content_id: "none" };
};

const attributionFields = () => {
  const firstTouch = readSessionJson(ATTRIBUTION_STORAGE_KEY, {}) || {};
  const storedJourney = readSessionJson(JOURNEY_STORAGE_KEY, []);
  const journey = Array.isArray(storedJourney) ? storedJourney.map(safePath).slice(-8) : [safePath(location.pathname)];
  return {
    traffic_source_type: firstTouch.source_type || "direct",
    traffic_landing_path: firstTouch.landing_path || safePath(location.pathname),
    traffic_landing_group: firstTouch.landing_group || pageGroup(),
    traffic_initial_referrer_host: firstTouch.referrer_host || "none",
    traffic_initial_referrer_path: firstTouch.referrer_path || "none",
    traffic_utm_source: firstTouch.utm_source || "none",
    traffic_utm_medium: firstTouch.utm_medium || "none",
    traffic_utm_campaign: firstTouch.utm_campaign || "none",
    traffic_utm_content: firstTouch.utm_content || "none",
    traffic_utm_term: firstTouch.utm_term || "none",
    traffic_utm_referrer: firstTouch.utm_referrer || "none",
    traffic_click_ids: firstTouch.click_ids || "none",
    traffic_journey_depth: Math.max(journey.length, 1),
    traffic_journey_first_path: journey[0] || safePath(location.pathname),
    traffic_journey_previous_path: journey.length > 1 ? journey.at(-2) : "none",
    traffic_journey_tail: cleanText((journey.length ? journey : [safePath(location.pathname)]).slice(-4).join(" > "), 120),
  };
};

const placementRules = [
  ["#contact-dialog", "messenger_dialog"],
  ["#price-quiz-dialog", "price_quiz"],
  ["[data-consent-banner]", "consent_banner"],
  [".engagement-nudge", "engagement_nudge"],
  ["[data-mobile-contact]", "mobile_sticky"],
  ["[data-mobile-menu]", "mobile_menu"],
  [".site-header", "header"],
  [".hero__quick-choices", "hero_quick_choice"],
  [".hero__actions", "hero_primary"],
  [".service-hero", "service_hero"],
  [".contact-path", "contact_path"],
  [".editorial-intake", "editorial_intake"],
  [".editorial-cta", "editorial_closing"],
  [".section--closing-cta", "closing_cta"],
  [".section--cta", "section_cta"],
  [".contact-page__methods", "contacts_methods"],
  [".contact-page", "contacts_page"],
  [".about-hero", "about_hero"],
  [".search-guide__summary", "search_summary"],
  [".site-footer", "footer"],
];

const placementFor = (element) => placementRules.find(([selector]) => element.closest(selector))?.[1] || "content";

const buttonKindFor = (element) => {
  if (element.matches("[data-consent-accept]")) return "consent_accept";
  if (element.matches("[data-consent-reject]")) return "consent_reject";
  if (element.matches("[data-consent-settings]")) return "consent_settings";
  if (element.matches("[data-price-quiz-option]")) return `quiz_option_${slugify(element.dataset.quizKey || "step")}`;
  if (element.matches("[data-price-quiz-back]")) return "quiz_back";
  if (element.matches("[data-price-quiz-close]")) return "quiz_close";
  if (element.matches("[data-dialog-close]")) return "dialog_close";
  if (element.matches("[data-menu-toggle]")) return "menu_toggle";
  if (element.matches("[data-menu-backdrop]")) return "menu_backdrop";
  if (element.matches("[data-dialog-open]")) return "dialog_open";
  if (element.dataset.track) return `contact_${slugify(element.dataset.track)}`;
  if (element.matches("a[href]")) {
    try {
      const url = new URL(element.href, location.origin);
      return url.origin === location.origin ? "navigation_internal" : "navigation_external";
    } catch {
      return "navigation";
    }
  }
  if (element.matches("[aria-expanded]")) return "disclosure_toggle";
  return "interface_action";
};

const variantFor = (element) => {
  if (element.matches(".messenger-choice")) return "messenger";
  if (element.matches(".contact-method")) return "contact_card";
  if (element.matches(".hero__quick-choices button")) return "quick_choice";
  if (element.matches(".button--primary, .button--gold")) return "primary";
  if (element.matches(".button--secondary")) return "secondary";
  if (element.matches(".button--compact")) return "compact";
  if (element.matches(".text-link")) return "text_link";
  if (element.matches(".mobile-contact__action")) return "mobile_action";
  if (element.matches(".dialog__close")) return "close";
  return "default";
};

const publicLabelFor = (element) => {
  if (element.matches("[data-price-quiz-option]")) return "Выбор варианта квиза";
  if (element.matches("[data-consent-accept]")) return "Согласие на аналитику";
  if (element.matches("[data-consent-reject]")) return "Отказ от аналитики";
  return cleanText(element.getAttribute("aria-label") || element.textContent || "Кнопка");
};

const destinationFor = (element) => {
  if (!element.matches("a[href]")) return "none";
  try {
    const url = new URL(element.href, location.origin);
    if (url.origin === location.origin) return safePath(url.pathname);
    return cleanText(url.hostname || url.protocol.replace(":", "") || "external", 100);
  } catch {
    return "invalid";
  }
};

const sectionTitleFor = (element) => {
  const container = element.closest("section, article, aside, header, footer, nav, dialog");
  return cleanText(container?.querySelector("h1, h2, h3, [role='heading']")?.textContent || "") || "none";
};

const topicFor = (element) => {
  const explicit = cleanText(element.dataset.analyticsTopic || element.dataset.topic || "", 100);
  if (explicit) return explicit;
  const publicationTitle = cleanText(document.querySelector("[data-publication-kind] h1")?.textContent || "", 100);
  if (publicationTitle) return publicationTitle;
  if (location.pathname.startsWith("/uslugi/") && location.pathname !== "/uslugi/") {
    return cleanText(document.querySelector("main h1")?.textContent || contentFields().content_id, 100);
  }
  return cleanText(document.querySelector("main h1")?.textContent || pageGroup(), 100);
};

const duplicateOrdinal = (element, identity) => {
  const controls = [...document.querySelectorAll(BUTTON_SELECTOR)];
  const matching = controls.filter((candidate) => {
    const candidateIdentity = `${placementFor(candidate)}|${buttonKindFor(candidate)}|${publicLabelFor(candidate)}|${destinationFor(candidate)}`;
    return candidateIdentity === identity;
  });
  return Math.max(matching.indexOf(element) + 1, 1);
};

const metadataFor = (element) => {
  const placement = placementFor(element);
  const buttonKind = buttonKindFor(element);
  const buttonLabel = publicLabelFor(element);
  const destination = destinationFor(element);
  const identity = `${placement}|${buttonKind}|${buttonLabel}|${destination}`;
  const sensitiveIdentity = element.matches("[data-price-quiz-option]")
    ? `${element.dataset.quizKey || "step"}|${element.dataset.quizValue || "option"}`
    : identity;
  const ordinal = duplicateOrdinal(element, identity);
  const generatedId = `${slugify(`${placement}-${buttonKind}-${buttonLabel}`)}-${shortHash(sensitiveIdentity)}${ordinal > 1 ? `-${ordinal}` : ""}`;

  return {
    page_path: safePath(location.pathname),
    page_group: pageGroup(),
    viewport: viewportGroup(),
    button_id: cleanText(element.dataset.ctaId || element.dataset.analyticsButtonId || generatedId, 96),
    button_label: buttonLabel,
    button_kind: buttonKind,
    button_placement: placement,
    button_variant: variantFor(element),
    button_destination: destination,
    section_title: sectionTitleFor(element),
    topic: topicFor(element),
    ...contentFields(),
    ...attributionFields(),
  };
};

const send = (metadata) => {
  if (!mayTrack()) return false;
  const normalized = Object.fromEntries(Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [key, typeof value === "string" ? cleanText(value) : value]));
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: "button_action", ...normalized });
  if (typeof window.gtag === "function") window.gtag("event", "button_action", normalized);
  if (yandexMetricaId && typeof window.ym === "function") window.ym(yandexMetricaId, "reachGoal", "button_action", normalized);
  return true;
};

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const control = target?.closest(BUTTON_SELECTOR);
  if (!control) return;
  if (control.matches("[data-consent-reject]")) return;
  const metadata = metadataFor(control);
  if (control.matches("[data-consent-accept]") && !mayTrack()) {
    setTimeout(() => send(metadata), 0);
    return;
  }
  send(metadata);
}, { capture: true });

window.__buttonAnalyticsContract = Object.freeze({
  version: 1,
  selector: BUTTON_SELECTOR,
  event: "button_action",
  requiredMetadata: REQUIRED_BUTTON_METADATA,
});
