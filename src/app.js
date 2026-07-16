const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const analyticsEnabled = document.body.dataset.analyticsEnabled === "true";
const analyticsRequiresConsent = document.body.dataset.analyticsRequiresConsent === "true";
const googleAnalyticsId = document.body.dataset.googleAnalyticsId || "";
const yandexMetricaId = document.body.dataset.yandexMetricaId || "";
window.dataLayer = window.dataLayer || [];
let analyticsStarted = false;

const loadExternalScript = (src) => {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.append(script);
};

const startAnalytics = () => {
  if (!analyticsEnabled || analyticsStarted) return;
  analyticsStarted = true;
  if (/^G-[A-Z0-9]+$/i.test(googleAnalyticsId)) {
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", googleAnalyticsId, { anonymize_ip: true });
    loadExternalScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAnalyticsId)}`);
  }
  if (/^\d+$/.test(yandexMetricaId)) {
    window.ym = window.ym || function ym() { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    window.ym(Number(yandexMetricaId), "init", {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: false,
    });
    loadExternalScript("https://mc.yandex.ru/metrika/tag.js");
  }
};

const consentBanner = $("[data-consent-banner]");
const consentValue = () => {
  try { return localStorage.getItem("analytics_consent") || ""; } catch { return ""; }
};
const saveConsent = (value) => {
  try { localStorage.setItem("analytics_consent", value); } catch { /* storage may be unavailable */ }
};

if (analyticsEnabled) {
  if (!analyticsRequiresConsent || consentValue() === "granted") startAnalytics();
  else if (consentValue() !== "denied" && consentBanner) consentBanner.hidden = false;
}

$("[data-consent-accept]")?.addEventListener("click", () => {
  saveConsent("granted");
  if (consentBanner) consentBanner.hidden = true;
  startAnalytics();
});

$("[data-consent-reject]")?.addEventListener("click", () => {
  const reloadToStop = analyticsStarted;
  saveConsent("denied");
  if (consentBanner) consentBanner.hidden = true;
  if (reloadToStop) location.reload();
});

$("[data-consent-settings]")?.addEventListener("click", () => {
  if (consentBanner) consentBanner.hidden = false;
});

const track = (event, params = {}) => {
  if (!analyticsStarted) return;
  window.dataLayer.push({ event, ...params });
  if (analyticsEnabled && /^\d+$/.test(yandexMetricaId) && typeof window.ym === "function") {
    window.ym(Number(yandexMetricaId), "reachGoal", event, params);
  }
};

const header = $("[data-header]");
const progress = $("[data-scroll-progress]");
const mobileContact = $("[data-mobile-contact]");
let previousScrollY = window.scrollY;

const updateScroll = () => {
  const y = window.scrollY;
  header?.classList.toggle("is-scrolled", y > 12);
  const scrollingDown = y > previousScrollY + 8;
  const scrollingUp = y < previousScrollY - 8;
  if (mobileContact && y <= 420) mobileContact.classList.remove("is-visible");
  else if (scrollingDown) mobileContact?.classList.add("is-visible");
  else if (scrollingUp) mobileContact?.classList.remove("is-visible");
  previousScrollY = y;
  if (progress) {
    const max = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    progress.style.transform = `scaleX(${Math.min(y / max, 1)})`;
  }
};
updateScroll();
addEventListener("scroll", updateScroll, { passive: true });

const menuToggle = $("[data-menu-toggle]");
const mobileMenu = $("[data-mobile-menu]");
menuToggle?.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!open));
  mobileMenu.hidden = open;
});

const dialog = $("#contact-dialog");
const openDialog = (topic = "") => {
  if (!dialog) return;
  const whatsapp = $("[data-whatsapp-link]", dialog);
  if (whatsapp) {
    const message = `Здравствуйте, Максим Юрьевич. Нужна юридическая консультация${topic ? ` по вопросу: ${topic}` : ""}. Кратко опишу ситуацию:`;
    whatsapp.href = `https://api.whatsapp.com/send?phone=79065297970&text=${encodeURIComponent(message)}`;
  }
  dialog.showModal();
  track("messenger_dialog_open", { topic: topic || "general", page_path: location.pathname });
};

$$('[data-dialog-open]').forEach((control) => {
  control.addEventListener("click", (event) => {
    if (control.tagName === "A") event.preventDefault();
    openDialog(control.dataset.topic || "");
  });
});
$("[data-dialog-close]")?.addEventListener("click", () => dialog?.close());
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

$$('[data-track]').forEach((link) => {
  link.addEventListener("click", () => track("contact_click", {
    channel: link.dataset.track,
    page_path: location.pathname,
  }));
});

const districtSearch = $("[data-district-search]");
if (districtSearch) {
  const cards = $$("[data-search]");
  const counter = $("[data-search-count]");
  const empty = $("[data-empty-state]");
  districtSearch.addEventListener("input", () => {
    const query = districtSearch.value.trim().toLocaleLowerCase("ru");
    let visible = 0;
    cards.forEach((card) => {
      const match = !query || card.dataset.search.includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    });
    if (counter) counter.textContent = query ? `Найдено: ${visible}` : "Показаны все округа";
    if (empty) empty.hidden = visible !== 0;
  });
}

if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -40px" });
  $$(".reveal").forEach((item) => observer.observe(item));
} else {
  $$(".reveal").forEach((item) => item.classList.add("is-visible"));
}
