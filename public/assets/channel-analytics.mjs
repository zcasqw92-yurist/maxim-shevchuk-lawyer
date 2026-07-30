const CHANNEL_EVENTS = Object.freeze({
  whatsapp: "contact_whatsapp",
  telegram: "contact_telegram",
  phone: "contact_phone",
  email: "contact_email",
  map: "contact_map",
});
const ATTRIBUTION_STORAGE_KEY = "traffic_attribution_v1";
const JOURNEY_STORAGE_KEY = "traffic_journey_v1";

const body = document.body;
const analyticsEnabled = body.dataset.analyticsEnabled === "true";
const requiresConsent = body.dataset.analyticsRequiresConsent === "true";
const yandexMetricaId = Number(body.dataset.yandexMetricaId || 0);

const consentGranted = () => {
  if (!analyticsEnabled) return false;
  if (!requiresConsent) return true;
  try { return localStorage.getItem("analytics_consent") === "granted"; } catch { return false; }
};

const clean = (value = "", limit = 120) => String(value).replace(/\s+/g, " ").trim().slice(0, limit);
const safePath = (value = "") => {
  try { return clean(new URL(value, location.origin).pathname || "/", 160); } catch { return clean(String(value).split(/[?#]/)[0] || "/", 160); }
};
const readSession = (key, fallback) => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
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
  return "other";
};
const contentFields = () => {
  const publication = document.querySelector("[data-publication-kind]");
  if (publication) {
    return {
      content_kind: clean(publication.dataset.publicationKind || "publication", 40),
      content_id: clean(publication.dataset.articleId || publication.dataset.caseId || location.pathname.split("/").filter(Boolean).at(-1) || "unknown", 96),
    };
  }
  if (location.pathname.startsWith("/uslugi/") && location.pathname !== "/uslugi/") {
    return { content_kind: "service", content_id: clean(location.pathname.split("/").filter(Boolean).at(-1) || "unknown", 96) };
  }
  return { content_kind: pageGroup(), content_id: "none" };
};
const attributionFields = () => {
  const firstTouch = readSession(ATTRIBUTION_STORAGE_KEY, {}) || {};
  const storedJourney = readSession(JOURNEY_STORAGE_KEY, []);
  const journey = Array.isArray(storedJourney) ? storedJourney.map(safePath).slice(-8) : [safePath(location.pathname)];
  return {
    traffic_source_type: clean(firstTouch.source_type || "direct", 40),
    traffic_landing_path: safePath(firstTouch.landing_path || location.pathname),
    traffic_utm_source: clean(firstTouch.utm_source || "none", 100),
    traffic_utm_medium: clean(firstTouch.utm_medium || "none", 100),
    traffic_utm_campaign: clean(firstTouch.utm_campaign || "none", 100),
    traffic_journey_depth: Math.max(journey.length, 1),
  };
};
const placementFor = (element) => {
  if (element.closest("#contact-dialog")) return "messenger_dialog";
  if (element.closest(".contact-page__methods")) return "contacts_methods";
  if (element.closest(".site-footer")) return "footer";
  return "content";
};

const send = (eventName, payload) => {
  if (!consentGranted()) return false;
  const normalized = Object.fromEntries(Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [key, typeof value === "string" ? clean(value) : value]));
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: eventName, ...normalized });
  if (typeof window.gtag === "function") window.gtag("event", eventName, normalized);
  if (yandexMetricaId && typeof window.ym === "function") window.ym(yandexMetricaId, "reachGoal", eventName, normalized);
  return true;
};

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const control = target?.closest("[data-track]");
  if (!control) return;
  const channel = clean(control.dataset.track || "", 40);
  const eventName = CHANNEL_EVENTS[channel];
  if (!eventName) return;
  send(eventName, {
    channel,
    page_path: safePath(location.pathname),
    page_group: pageGroup(),
    contact_mode: control.closest("#contact-dialog") ? "dialog" : "direct",
    contact_placement: placementFor(control),
    ...contentFields(),
    ...attributionFields(),
  });
}, { capture: true });

window.__channelAnalyticsContract = Object.freeze({ version: 1, events: CHANNEL_EVENTS });
