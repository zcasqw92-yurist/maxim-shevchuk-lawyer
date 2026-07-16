const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const moscowHour = () => {
  try {
    const hour = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .find((part) => part.type === "hour")?.value;
    return Number(hour);
  } catch {
    return new Date().getHours();
  }
};

const updateOnlineStatus = () => {
  const online = moscowHour() >= 7 && moscowHour() < 23;
  $$('[data-online-status]').forEach((status) => {
    status.classList.toggle("is-offline", !online);
    const label = $('[data-online-label]', status);
    if (label) label.textContent = status.classList.contains("header__online")
      ? (online ? "Юрист онлайн" : "Юрист офлайн")
      : (online ? "На связи в мессенджерах" : "Сейчас офлайн · отвечу после 07:00 МСК");
    if (status.classList.contains("header__online")) status.setAttribute("aria-label", `${online ? "Юрист онлайн" : "Юрист офлайн"} — задать вопрос`);
  });
};

updateOnlineStatus();
setInterval(updateOnlineStatus, 60_000);

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
menuToggle?.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") === "true";
  header?.classList.remove("is-header-hidden");
  menuToggle.setAttribute("aria-expanded", String(!open));
  mobileMenu.hidden = open;
});

const genericMessage = "Здравствуйте, Максим Юрьевич. Хочу получить первичную оценку ситуации. Кратко опишу, что произошло, и приложу имеющиеся документы:";
const defaultDialogCopy = "Напишите, что произошло, и приложите имеющиеся материалы. Максим Юрьевич лично ознакомится с ними, ответит на основные вопросы и объяснит, с чего разумнее начать.";
const quizNoteText = "Telegram откроется с заполненным черновиком. Проверьте ответы и отправьте сообщение Максиму Юрьевичу.";

const cleanTelegramBase = (href) => {
  const url = new URL(href || "https://t.me/lawrazbor", location.href);
  url.searchParams.delete("text");
  return url.toString();
};

const cleanWhatsappBase = (href) => {
  const url = new URL(href || "https://api.whatsapp.com/send?phone=79065297970", location.href);
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
    ? "Опишите, что произошло, и приложите важные детали. Максим Юрьевич лично уточнит недостающее и подскажет, с чего начать."
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

const priceQuizDialog = $("#price-quiz-dialog");
const priceQuizSteps = $$('[data-price-quiz-step]', priceQuizDialog);
const priceQuizResult = $('[data-price-quiz-result]', priceQuizDialog);
const priceQuizProgress = $('[data-price-quiz-progress]', priceQuizDialog);
const priceQuizProgressBar = $('[data-price-quiz-progress-bar]', priceQuizDialog);
const priceQuizBack = $('[data-price-quiz-back]', priceQuizDialog);
const priceQuizControls = $('[data-price-quiz-controls]', priceQuizDialog);
const priceQuizWhatsapp = $('[data-price-quiz-whatsapp]', priceQuizDialog);
const priceQuizTelegram = $('[data-price-quiz-telegram]', priceQuizDialog);
const priceQuizTelegramNote = $('[data-price-quiz-telegram-note]', priceQuizDialog);
const priceQuizFields = [
  ["issue", "Ситуация"],
  ["materials", "Материалы"],
  ["timing", "Срок"],
];
const priceQuizWhatsappBase = cleanWhatsappBase(priceQuizWhatsapp?.href);
const priceQuizTelegramBase = cleanTelegramBase(priceQuizTelegram?.href);
let priceQuizStep = 0;
let priceQuizAnswers = {};

const quizSummaryText = () => priceQuizFields
  .map(([key, label]) => `${label}: ${priceQuizAnswers[key] || "Не указано"}`)
  .join("\n");

const priceQuizMessage = () => `Здравствуйте, Максим Юрьевич. Я прошёл(а) короткий опрос на сайте и хочу уточнить ориентир стоимости.\n\n${quizSummaryText()}\n\nКратко дополню обстоятельства:`;

const renderPriceQuiz = () => {
  if (!priceQuizDialog) return;
  const finished = priceQuizStep >= priceQuizSteps.length;
  priceQuizSteps.forEach((step, index) => { step.hidden = finished || index !== priceQuizStep; });
  if (priceQuizResult) priceQuizResult.hidden = !finished;
  if (priceQuizControls) priceQuizControls.hidden = finished || priceQuizStep === 0;
  if (priceQuizProgress) priceQuizProgress.textContent = finished ? "Готово" : `Шаг ${priceQuizStep + 1} из ${priceQuizSteps.length}`;
  if (priceQuizProgressBar) priceQuizProgressBar.style.width = `${finished ? 100 : ((priceQuizStep + 1) / priceQuizSteps.length) * 100}%`;
  if (priceQuizBack) priceQuizBack.hidden = priceQuizStep === 0 || finished;
  $$('[data-price-quiz-option]', priceQuizDialog).forEach((option) => {
    option.setAttribute("aria-pressed", String(priceQuizAnswers[option.dataset.quizKey] === option.dataset.quizValue));
  });
};

const resetPriceQuiz = () => {
  priceQuizStep = 0;
  priceQuizAnswers = {};
  if (priceQuizTelegramNote) priceQuizTelegramNote.textContent = quizNoteText;
  renderPriceQuiz();
};

const showPriceQuizResult = () => {
  priceQuizStep = priceQuizSteps.length;
  const message = priceQuizMessage();
  if (priceQuizWhatsapp) priceQuizWhatsapp.href = whatsappDraftUrl(priceQuizWhatsappBase, message);
  if (priceQuizTelegram) priceQuizTelegram.href = telegramDraftUrl(priceQuizTelegramBase, message);
  renderPriceQuiz();
  track("price_quiz_complete", { page_path: location.pathname });
};

$$('[data-price-quiz-open]').forEach((control) => {
  control.addEventListener("click", () => {
    if (!priceQuizDialog) return;
    resetPriceQuiz();
    priceQuizDialog.showModal();
    track("price_quiz_open", { page_path: location.pathname });
  });
});

$$('[data-price-quiz-option]', priceQuizDialog).forEach((option) => {
  option.addEventListener("click", () => {
    const { quizKey: key, quizValue: value } = option.dataset;
    priceQuizAnswers[key] = value;
    if (priceQuizStep === priceQuizSteps.length - 1) showPriceQuizResult();
    else {
      priceQuizStep += 1;
      renderPriceQuiz();
    }
  });
});

priceQuizBack?.addEventListener("click", () => {
  priceQuizStep = Math.max(0, priceQuizStep - 1);
  renderPriceQuiz();
});

priceQuizTelegram?.addEventListener("click", (event) => {
  event.preventDefault();
  priceQuizTelegram.href = telegramDraftUrl(priceQuizTelegramBase, priceQuizMessage());
  window.open(priceQuizTelegram.href, "_blank", "noopener");
  if (priceQuizTelegramNote) priceQuizTelegramNote.textContent = quizNoteText;
  track("contact_click", { channel: "telegram", source: "price_quiz", page_path: location.pathname });
});

$$('[data-price-quiz-close]').forEach((control) => control.addEventListener("click", () => priceQuizDialog?.close()));
priceQuizDialog?.addEventListener("click", (event) => {
  if (event.target === priceQuizDialog) priceQuizDialog.close();
});

const callbackDialog = $("#callback-dialog");
const callbackForm = callbackDialog?.querySelector("[data-callback-form]");
const callbackNote = callbackDialog?.querySelector("[data-callback-note]");
const callbackCopy = callbackDialog?.querySelector("[data-callback-copy]");
const callbackWhatsapp = callbackDialog?.querySelector("[data-callback-whatsapp]");
const callbackTelegram = callbackDialog?.querySelector("[data-callback-telegram]");

const callbackMessage = () => {
  const data = new FormData(callbackForm);
  return [
    "Здравствуйте, Максим Юрьевич. Прошу связаться со мной позже.",
    "",
    `Имя: ${String(data.get("name") || "").trim()}`,
    `Контакт: ${String(data.get("contact") || "").trim()}`,
    `Удобный день: ${String(data.get("day") || "").trim()}`,
    `Удобное время: ${String(data.get("period") || "").trim()}`,
    `Кратко о ситуации: ${String(data.get("summary") || "").trim()}`,
    `Страница сайта: ${String(data.get("source") || location.pathname).trim()}`,
  ].join("\n");
};

const validateCallbackForm = () => {
  const valid = Boolean(callbackForm?.reportValidity());
  if (!valid && callbackNote) callbackNote.textContent = "Заполните обязательные поля и подтвердите согласие на обработку данных.";
  return valid;
};

$$('[data-callback-open]').forEach((control) => {
  control.addEventListener("click", (event) => {
    event.preventDefault();
    const parentDialog = control.closest("dialog");
    if (parentDialog?.open) parentDialog.close();
    const source = callbackForm?.elements.namedItem("source");
    if (source) source.value = location.pathname;
    if (callbackNote) callbackNote.textContent = "Первичное знакомство с ситуацией бесплатно. Данные не сохраняются на сайте и передаются только через выбранный вами мессенджер.";
    if (callbackCopy) callbackCopy.hidden = true;
    callbackDialog?.showModal();
    callbackForm?.elements.namedItem("name")?.focus();
    track("callback_open", { page_path: location.pathname });
  });
});

callbackForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validateCallbackForm() || !callbackWhatsapp) return;
  const url = whatsappDraftUrl(callbackWhatsapp.dataset.baseHref, callbackMessage());
  window.open(url, "_blank", "noopener");
  if (callbackNote) callbackNote.textContent = "WhatsApp открыт с готовым сообщением. Проверьте текст и нажмите отправить.";
  track("callback_request_whatsapp", { page_path: location.pathname });
});

callbackTelegram?.addEventListener("click", (event) => {
  event.preventDefault();
  if (!validateCallbackForm()) return;
  const url = telegramDraftUrl(callbackTelegram.dataset.telegramHref, callbackMessage());
  if (callbackCopy) callbackCopy.hidden = true;
  if (callbackNote) callbackNote.textContent = "Telegram открыт с заполненным обращением. Проверьте текст и нажмите отправить.";
  window.open(url, "_blank", "noopener");
  track("callback_request_telegram", { page_path: location.pathname });
});

callbackDialog?.querySelector("[data-callback-close]")?.addEventListener("click", () => callbackDialog.close());
callbackDialog?.addEventListener("click", (event) => {
  if (event.target === callbackDialog) callbackDialog.close();
});

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
