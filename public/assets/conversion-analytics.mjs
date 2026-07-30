const MAX_TEXT_LENGTH = 120;
const ATTRIBUTION_STORAGE_KEY = "traffic_attribution_v1";
const JOURNEY_STORAGE_KEY = "traffic_journey_v1";
const PRIMARY_CONTACT_CHANNELS = new Set(["phone", "email", "telegram", "whatsapp"]);
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_referrer"];
const CLICK_ID_KEYS = ["yclid", "gclid", "fbclid"];

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

const slugify = (value = "") => cleanText(value, 180)
  .toLocaleLowerCase("ru-RU")
  .replace(/ё/g, "е")
  .replace(/[^a-zа-я0-9]+/gi, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 96) || "cta";

const readSessionJson = (key, fallback) => {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const writeSessionJson = (key, value) => {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* session storage may be unavailable */ }
};

const clearAttributionStorage = () => {
  try {
    sessionStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
    sessionStorage.removeItem(JOURNEY_STORAGE_KEY);
  } catch { /* session storage may be unavailable */ }
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

const externalReferrer = () => {
  if (!document.referrer) return {};
  try {
    const referrer = new URL(document.referrer, location.href);
    if (referrer.hostname === location.hostname) return {};
    return {
      referrer_host: cleanText(referrer.hostname, 100),
      referrer_path: safePath(referrer.pathname),
    };
  } catch {
    return {};
  }
};

const safeUtmReferrer = (value = "") => {
  const normalized = cleanText(value, 180);
  if (!normalized) return "";
  try {
    const url = new URL(normalized, location.origin);
    return cleanText(`${url.hostname}${url.pathname}`, 120);
  } catch {
    return normalized.slice(0, 120);
  }
};

const captureFirstTouch = () => {
  const stored = readSessionJson(ATTRIBUTION_STORAGE_KEY, null);
  if (stored && typeof stored === "object" && stored.landing_path) return stored;

  const query = new URLSearchParams(location.search);
  const tags = Object.fromEntries(UTM_KEYS.map((key) => {
    const rawValue = query.get(key) || "";
    return [key, key === "utm_referrer" ? safeUtmReferrer(rawValue) : cleanText(rawValue, 100)];
  }).filter(([, value]) => value));
  const referrer = externalReferrer();
  const clickIds = CLICK_ID_KEYS.filter((key) => query.has(key));
  const captured = {
    landing_path: safePath(location.pathname),
    landing_group: pageGroup(),
    source_type: tags.utm_source ? "tagged" : referrer.referrer_host ? "referral" : "direct",
    ...referrer,
    ...tags,
    ...(clickIds.length ? { click_ids: clickIds.join(",") } : {}),
  };

  writeSessionJson(ATTRIBUTION_STORAGE_KEY, captured);
  return captured;
};

const updateJourney = () => {
  const stored = readSessionJson(JOURNEY_STORAGE_KEY, []);
  const journey = Array.isArray(stored) ? stored.filter((item) => typeof item === "string").map(safePath) : [];
  const currentPath = safePath(location.pathname);
  if (journey.at(-1) !== currentPath) journey.push(currentPath);
  const limited = journey.slice(-8);
  writeSessionJson(JOURNEY_STORAGE_KEY, limited);
  return limited;
};

const firstTouch = captureFirstTouch();
const journey = updateJourney();

const attributionFields = () => ({
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
  traffic_journey_depth: journey.length,
  traffic_journey_first_path: journey[0] || safePath(location.pathname),
  traffic_journey_previous_path: journey.length > 1 ? journey.at(-2) : "none",
  traffic_journey_tail: cleanText(journey.slice(-4).join(" > "), 120),
});

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

const placementRules = [
  ["#contact-dialog", "messenger_dialog"],
  [".engagement-nudge", "engagement_nudge"],
  ["[data-mobile-contact]", "mobile_sticky"],
  ["[data-mobile-menu]", "mobile_menu"],
  [".header__online", "header_status"],
  [".header__actions", "header_primary"],
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

const variantFor = (element) => {
  if (element.matches(".messenger-choice")) return "messenger";
  if (element.matches(".contact-method")) return "contact_card";
  if (element.matches(".hero__quick-choices button")) return "quick_choice";
  if (element.matches(".button--primary, .button--gold")) return "primary";
  if (element.matches(".button--secondary")) return "secondary";
  if (element.matches(".text-link")) return "text_link";
  if (element.matches(".mobile-contact__action")) return "mobile_action";
  if (element.matches(".header__online")) return "status_action";
  return "default";
};

const kindFor = (element) => {
  if (element.matches("[data-dialog-open]")) return "dialog_open";
  if (element.dataset.track) return `direct_${element.dataset.track}`;
  return "action";
};

const sectionTitleFor = (element) => {
  const container = element.closest("section, article, aside, header, footer, nav, dialog");
  const title = container?.querySelector("h1, h2, h3, [role='heading']");
  return cleanText(title?.textContent || "", 100) || "none";
};

const metadataFor = (element, extra = {}) => {
  const label = cleanText(element.getAttribute("aria-label") || element.textContent || element.dataset.track || "CTA");
  const placement = placementFor(element);
  const kind = kindFor(element);
  const topic = cleanText(element.dataset.analyticsTopic || element.dataset.topic || extra.topic || "general", 100);
  const ctaId = cleanText(element.dataset.ctaId || slugify(`${placement}-${kind}-${label}-${topic}`), 96);

  return {
    page_path: location.pathname,
    page_group: pageGroup(),
    viewport: viewportGroup(),
    cta_id: ctaId,
    cta_label: label,
    cta_placement: placement,
    cta_variant: variantFor(element),
    cta_kind: kind,
    section_title: sectionTitleFor(element),
    topic,
    ...contentFields(),
    ...attributionFields(),
    ...extra,
  };
};

let visitAttributionSent = false;
const sendVisitAttribution = () => {
  if (!mayTrack() || visitAttributionSent) return false;
  const payload = attributionFields();
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: "traffic_attribution_ready", ...payload });
  if (yandexMetricaId && typeof window.ym === "function") {
    window.ym(yandexMetricaId, "params", { traffic_attribution: payload });
  }
  visitAttributionSent = true;
  return true;
};

const send = (eventName, params = {}) => {
  if (!mayTrack()) return false;
  sendVisitAttribution();
  const normalized = Object.fromEntries(Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [key, typeof value === "string" ? cleanText(value) : value]));

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: eventName, ...normalized });
  if (typeof window.gtag === "function") window.gtag("event", eventName, normalized);
  if (yandexMetricaId && typeof window.ym === "function") {
    window.ym(yandexMetricaId, "reachGoal", eventName, normalized);
  }
  return true;
};

let lastDialogOrigin = null;

const originFields = () => lastDialogOrigin ? {
  origin_cta_id: lastDialogOrigin.cta_id,
  origin_cta_label: lastDialogOrigin.cta_label,
  origin_cta_placement: lastDialogOrigin.cta_placement,
  origin_cta_variant: lastDialogOrigin.cta_variant,
} : {};

const sourceFields = (contactMeta, insideDialog) => {
  const source = insideDialog && lastDialogOrigin ? lastDialogOrigin : contactMeta;
  return {
    source_cta_id: source.cta_id,
    source_cta_label: source.cta_label,
    source_cta_placement: source.cta_placement,
    source_cta_variant: source.cta_variant,
  };
};

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const dialogControl = target.closest("[data-dialog-open]");
  if (dialogControl) {
    lastDialogOrigin = metadataFor(dialogControl);
    send("cta_click", lastDialogOrigin);
  }

  const contactControl = target.closest("[data-track]");
  if (!contactControl) return;

  const channel = cleanText(contactControl.dataset.track || "unknown", 40);
  const insideDialog = Boolean(contactControl.closest("#contact-dialog"));
  const baseContactMeta = metadataFor(contactControl, {
    channel,
    contact_mode: insideDialog ? "dialog" : "direct",
    ...(insideDialog ? originFields() : {}),
    ...(insideDialog && lastDialogOrigin?.topic ? { topic: lastDialogOrigin.topic } : {}),
  });
  const contactMeta = { ...baseContactMeta, ...sourceFields(baseContactMeta, insideDialog) };

  send("cta_click", contactMeta);
  send(PRIMARY_CONTACT_CHANNELS.has(channel) ? "contact_conversion" : "contact_action", contactMeta);
}, { capture: true });

const trackedViews = new WeakSet();
const visibleTargets = new Set();

const viewMetadataFor = (element) => {
  const insideDialog = Boolean(element.closest("#contact-dialog"));
  return metadataFor(element, insideDialog ? {
    ...(lastDialogOrigin?.topic ? { topic: lastDialogOrigin.topic } : {}),
    ...originFields(),
  } : {});
};

const recordView = (element) => {
  if (!mayTrack() || trackedViews.has(element)) return;
  if (send("cta_view", viewMetadataFor(element))) trackedViews.add(element);
};

const flushVisibleTargets = () => visibleTargets.forEach(recordView);

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.intersectionRatio >= .6) {
        visibleTargets.add(entry.target);
        recordView(entry.target);
      } else {
        visibleTargets.delete(entry.target);
      }
    });
  }, { threshold: [.6] });

  document.querySelectorAll("[data-dialog-open], [data-track]").forEach((element) => observer.observe(element));
} else {
  document.querySelectorAll("[data-dialog-open], [data-track]").forEach((element) => {
    visibleTargets.add(element);
    recordView(element);
  });
}

queueMicrotask(sendVisitAttribution);
document.addEventListener("DOMContentLoaded", sendVisitAttribution, { once: true });

document.querySelector("[data-consent-accept]")?.addEventListener("click", () => {
  setTimeout(() => {
    sendVisitAttribution();
    flushVisibleTargets();
  }, 0);
});

document.querySelector("[data-consent-reject]")?.addEventListener("click", clearAttributionStorage);
