import { startOnlineStatus } from "./online-status.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

startOnlineStatus();

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
let mobileMenuOpen = false;

const updateScroll = () => {
  const y = window.scrollY;
  header?.classList.toggle("is-scrolled", y > 12);
  if (mobileMenuOpen) {
    header?.classList.remove("is-header-hidden");
    mobileContact?.classList.remove("is-visible");
    previousScrollY = y;
    return;
  }
  const scrollingDown = y > previousScrollY + 8;
  const scrollingUp = y < previousScrollY - 8;
  const mobileViewport = matchMedia("(max-width: 680px)").matches;
  if (header) {
    if (!mobileViewport || y <= 80 || scrollingUp) header.classList.remove("is-header-hidden");
    else if (scrollingDown) header.classList.add("is-header-hidden");
  }
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
addEventListener("resize", updateScroll, { passive: true });

const menuToggle = $("[data-menu-toggle]");
const mobileMenu = $("[data-mobile-menu]");
const menuBackdrop = $("[data-menu-backdrop]");
const menuLabel = $("[data-menu-label]", menuToggle);
const menuInertTargets = $$(`main, .site-footer, [data-mobile-contact], [data-consent-banner], [data-header] .brand, [data-header] .desktop-nav, [data-header] .header__actions`);
let menuScrollY = 0;
let menuBodyStyles = null;

const setMenuBackgroundInert = (inert) => {
  menuInertTargets.forEach((element) => {
    if (inert && !element.inert) {
      element.inert = true;
      element.dataset.menuInerted = "true";
    } else if (!inert && element.dataset.menuInerted === "true") {
      element.inert = false;
      delete element.dataset.menuInerted;
    }
  });
};

const menuFocusables = () => [
  menuToggle,
  ...$$("a[href], button:not([disabled])", mobileMenu),
].filter(Boolean);

const openMobileMenu = () => {
  if (!menuToggle || !mobileMenu || !menuBackdrop || mobileMenuOpen) return;
  menuScrollY = window.scrollY;
  menuBodyStyles = {
    position: document.body.style.position,
    top: document.body.style.top,
    width: document.body.style.width,
    overflowY: document.body.style.overflowY,
  };
  mobileMenuOpen = true;
  header?.classList.remove("is-header-hidden");
  mobileContact?.classList.remove("is-visible");
  menuToggle.setAttribute("aria-expanded", "true");
  if (menuLabel) menuLabel.textContent = "Закрыть меню";
  mobileMenu.hidden = false;
  menuBackdrop.hidden = false;
  document.documentElement.classList.add("mobile-menu-open");
  document.body.style.position = "fixed";
  document.body.style.top = `-${menuScrollY}px`;
  document.body.style.width = "100%";
  document.body.style.overflowY = "scroll";
  setMenuBackgroundInert(true);
  const firstMenuControl = $("a[href], button:not([disabled])", mobileMenu);
  firstMenuControl?.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    if (!document.activeElement?.closest("[data-mobile-menu]")) firstMenuControl?.focus({ preventScroll: true });
  });
};

const closeMobileMenu = ({ restoreFocus = true } = {}) => {
  if (!menuToggle || !mobileMenu || !menuBackdrop || !mobileMenuOpen) return;
  mobileMenuOpen = false;
  mobileMenu.hidden = true;
  menuBackdrop.hidden = true;
  menuToggle.setAttribute("aria-expanded", "false");
  if (menuLabel) menuLabel.textContent = "Открыть меню";
  document.documentElement.classList.remove("mobile-menu-open");
  setMenuBackgroundInert(false);
  if (menuBodyStyles) {
    document.body.style.position = menuBodyStyles.position;
    document.body.style.top = menuBodyStyles.top;
    document.body.style.width = menuBodyStyles.width;
    document.body.style.overflowY = menuBodyStyles.overflowY;
  }
  window.scrollTo(0, menuScrollY);
  previousScrollY = menuScrollY;
  if (restoreFocus) menuToggle.focus({ preventScroll: true });
};

menuToggle?.addEventListener("click", () => {
  if (mobileMenuOpen) closeMobileMenu();
  else openMobileMenu();
});
menuBackdrop?.addEventListener("click", () => closeMobileMenu());
$$("a[href], button", mobileMenu).forEach((control) => {
  control.addEventListener("click", () => closeMobileMenu({ restoreFocus: false }));
});
document.addEventListener("keydown", (event) => {
  if (!mobileMenuOpen) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeMobileMenu();
    return;
  }
  if (event.key !== "Tab") return;
  const focusables = menuFocusables();
  const first = focusables[0];
  const last = focusables.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
});
addEventListener("resize", () => {
  if (mobileMenuOpen && matchMedia("(min-width: 901px)").matches) closeMobileMenu({ restoreFocus: false });
}, { passive: true });

const genericMessage = "Здравствуйте, Максим Юрьевич. Хочу понять, что можно сделать в моей ситуации. Кратко опишу, что произошло, и приложу имеющиеся документы:";
const defaultDialogCopy = "Выберите мессенджер. Откроется готовое сообщение: его можно изменить перед отправкой. Сайт не получает его текст.";

const cleanTelegramBase = (href) => {
  const url = new URL(href || "https://t.me/lawrazbor", location.href);
  url.searchParams.delete("text");
  return url.toString();
};

const cleanWhatsappBase = (href) => {
  const url = new URL(href || "https://api.whatsapp.com/send?phone=79806574199", location.href);
  url.searchParams.delete("text");
  return url.toString();
};

const telegramDraftUrl = (baseHref, message) => {
  const url = new URL(cleanTelegramBase(baseHref));
  url.searchParams.set("text", message);
  return url.toString();
};

const whatsappDraftUrl = (baseHref, message) => {
  const url = new URL(cleanWhatsappBase(baseHref));
  url.searchParams.set("text", message);
  return url.toString();
};

const topicMessage = (topic = "") => topic
  ? `Здравствуйте, Максим Юрьевич. Обращаюсь по вопросу: ${topic}. Кратко опишу ситуацию и приложу имеющиеся материалы:`
  : genericMessage;

const messageForControl = (control) => {
  const explicit = String(control?.dataset?.message || "").trim();
  if (explicit) return explicit;
  return topicMessage(String(control?.dataset?.topic || "").trim());
};

const dialog = $("#contact-dialog");
const contactTelegram = dialog?.querySelector("a[data-track='telegram']");
const contactWhatsapp = dialog?.querySelector("[data-whatsapp-link]");
const contactTelegramBase = cleanTelegramBase(contactTelegram?.href);
const contactWhatsappBase = cleanWhatsappBase(contactWhatsapp?.href);

const updateContactLinks = (control = null) => {
  if (!dialog || !contactTelegram || !contactWhatsapp) return;
  const message = control ? messageForControl(control) : genericMessage;
  const topic = String(control?.dataset?.topic || "").trim();
  dialog.dataset.topic = topic || "general";
  dialog.dataset.intentMessage = message;
  contactTelegram.href = telegramDraftUrl(contactTelegramBase, message);
  contactWhatsapp.href = whatsappDraftUrl(contactWhatsappBase, message);
};

const openDialog = (control) => {
  if (!dialog) return;
  const topic = String(control?.dataset?.topic || "").trim();
  updateContactLinks(control);
  const topicLabel = $("[data-dialog-topic]", dialog);
  const dialogCopy = $("[data-dialog-copy]", dialog);
  if (topicLabel) {
    topicLabel.hidden = !topic;
    topicLabel.textContent = topic ? `Вы выбрали: ${topic}` : "";
  }
  if (dialogCopy) dialogCopy.textContent = topic
    ? "Выберите мессенджер. Откроется готовое сообщение по выбранному вопросу. При необходимости измените его и отправьте самостоятельно."
    : defaultDialogCopy;
  dialog.showModal();
  track("messenger_dialog_open", { topic: topic || "general", page_path: location.pathname });
};

$$('[data-dialog-open]').forEach((control) => {
  control.addEventListener("click", (event) => {
    if (control.tagName === "A") event.preventDefault();
    openDialog(control);
  });
});
$("[data-dialog-close]")?.addEventListener("click", () => dialog?.close());
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
updateContactLinks();

$$('[data-track]').forEach((link) => {
  link.addEventListener("click", () => {
    const dialogTopic = link.closest("#contact-dialog")?.dataset.topic;
    track("contact_click", {
      channel: link.dataset.track,
      page_path: location.pathname,
      ...(dialogTopic ? { topic: dialogTopic } : {}),
    });
  });
});
