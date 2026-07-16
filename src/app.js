const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Контент остаётся видимым без ожидания JavaScript: это важно для медленных
// мобильных соединений и встроенных браузеров мессенджеров.
const heroRotator = $("[data-hero-rotator]");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (heroRotator && !reducedMotion) {
  const phrases = [
    "с точных фактов",
    "с проверки документов",
    "с убедительных доказательств",
    "с верной квалификации",
    "с понятного плана действий",
  ];
  let phraseIndex = 0;
  setInterval(() => {
    heroRotator.classList.add("is-changing");
    setTimeout(() => {
      phraseIndex = (phraseIndex + 1) % phrases.length;
      heroRotator.textContent = phrases[phraseIndex];
      heroRotator.classList.remove("is-changing");
    }, 170);
  }, 4200);
}

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

const dialog = $("#contact-dialog");
const defaultDialogCopy = "Напишите в удобный мессенджер, что произошло. Максим Юрьевич лично уточнит важные детали и подскажет, с чего начать.";
const openDialog = (topic = "") => {
  if (!dialog) return;
  const normalizedTopic = topic.trim();
  const whatsapp = $("[data-whatsapp-link]", dialog);
  if (whatsapp) {
    const message = `Здравствуйте, Максим Юрьевич. Нужна юридическая консультация${normalizedTopic ? ` по вопросу: ${normalizedTopic}` : ""}. Кратко опишу ситуацию:`;
    const whatsappUrl = new URL(whatsapp.href);
    whatsappUrl.searchParams.set("text", message);
    whatsapp.href = whatsappUrl.toString();
  }
  const topicLabel = $("[data-dialog-topic]", dialog);
  const dialogCopy = $("[data-dialog-copy]", dialog);
  dialog.dataset.topic = normalizedTopic || "general";
  if (topicLabel) {
    topicLabel.hidden = !normalizedTopic;
    topicLabel.textContent = normalizedTopic ? `Вы выбрали: ${normalizedTopic}` : "";
  }
  if (dialogCopy) {
    dialogCopy.textContent = normalizedTopic
      ? "Опишите, что произошло, и приложите важные детали. Максим Юрьевич лично уточнит недостающее и подскажет, с чего начать."
      : defaultDialogCopy;
  }
  dialog.showModal();
  track("messenger_dialog_open", { topic: normalizedTopic || "general", page_path: location.pathname });
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

const priceQuizDialog = $("#price-quiz-dialog");
const priceQuizSteps = $$('[data-price-quiz-step]', priceQuizDialog);
const priceQuizResult = $('[data-price-quiz-result]', priceQuizDialog);
const priceQuizProgress = $('[data-price-quiz-progress]', priceQuizDialog);
const priceQuizProgressBar = $('[data-price-quiz-progress-bar]', priceQuizDialog);
const priceQuizNext = $('[data-price-quiz-next]', priceQuizDialog);
const priceQuizBack = $('[data-price-quiz-back]', priceQuizDialog);
const priceQuizControls = $('[data-price-quiz-controls]', priceQuizDialog);
const priceQuizSummary = $('[data-price-quiz-summary]', priceQuizDialog);
const priceQuizWhatsapp = $('[data-price-quiz-whatsapp]', priceQuizDialog);
const priceQuizTelegram = $('[data-price-quiz-telegram]', priceQuizDialog);
const priceQuizTelegramNote = $('[data-price-quiz-telegram-note]', priceQuizDialog);
const priceQuizFields = [
  ["issue", "Вопрос"],
  ["goal", "Задача"],
  ["other-side", "Вторая сторона"],
  ["materials", "Материалы"],
  ["timing", "Срок"],
];
let priceQuizStep = 0;
let priceQuizAnswers = {};

const quizHasAnswer = (key) => {
  const answer = priceQuizAnswers[key];
  return Array.isArray(answer) ? answer.length > 0 : Boolean(answer);
};

const quizSummaryText = () => priceQuizFields
  .map(([key, label]) => `${label}: ${Array.isArray(priceQuizAnswers[key]) ? priceQuizAnswers[key].join(", ") : priceQuizAnswers[key]}`)
  .join("\n");

const renderPriceQuiz = () => {
  if (!priceQuizDialog) return;
  const finished = priceQuizStep >= priceQuizSteps.length;
  priceQuizSteps.forEach((step, index) => { step.hidden = finished || index !== priceQuizStep; });
  if (priceQuizResult) priceQuizResult.hidden = !finished;
  if (priceQuizControls) priceQuizControls.hidden = finished;
  if (priceQuizProgress) priceQuizProgress.textContent = finished ? "Готово" : `Шаг ${priceQuizStep + 1} из ${priceQuizSteps.length}`;
  if (priceQuizProgressBar) priceQuizProgressBar.style.width = `${finished ? 100 : ((priceQuizStep + 1) / priceQuizSteps.length) * 100}%`;
  if (priceQuizBack) priceQuizBack.hidden = priceQuizStep === 0 || finished;
  if (priceQuizNext) {
    priceQuizNext.disabled = !quizHasAnswer(priceQuizFields[priceQuizStep]?.[0]);
    priceQuizNext.textContent = priceQuizStep === priceQuizSteps.length - 1 ? "Показать сводку →" : "Далее →";
  }
  $$('[data-price-quiz-option]', priceQuizDialog).forEach((option) => {
    const answer = priceQuizAnswers[option.dataset.quizKey];
    const selected = Array.isArray(answer) ? answer.includes(option.dataset.quizValue) : answer === option.dataset.quizValue;
    option.setAttribute("aria-pressed", String(selected));
  });
};

const resetPriceQuiz = () => {
  priceQuizStep = 0;
  priceQuizAnswers = {};
  if (priceQuizTelegramNote) priceQuizTelegramNote.textContent = "Перед переходом в Telegram сводка скопируется — останется только вставить её в чат.";
  renderPriceQuiz();
};

const showPriceQuizResult = () => {
  priceQuizStep = priceQuizSteps.length;
  const summary = quizSummaryText();
  if (priceQuizSummary) {
    priceQuizSummary.innerHTML = priceQuizFields.map(([key, label]) => `<div><dt>${label}</dt><dd>${Array.isArray(priceQuizAnswers[key]) ? priceQuizAnswers[key].join(", ") : priceQuizAnswers[key]}</dd></div>`).join("");
  }
  if (priceQuizWhatsapp) {
    const url = new URL(priceQuizWhatsapp.href);
    url.searchParams.set("text", `Здравствуйте, Максим Юрьевич. Хочу уточнить ориентир стоимости.\n\n${summary}\n\nКратко опишу ситуацию:`);
    priceQuizWhatsapp.href = url.toString();
  }
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
    if (option.hasAttribute("data-quiz-multiple")) {
      const selected = new Set(priceQuizAnswers[key] || []);
      if (value === "Пока ничего") selected.clear();
      else selected.delete("Пока ничего");
      selected.has(value) ? selected.delete(value) : selected.add(value);
      priceQuizAnswers[key] = [...selected];
    } else {
      priceQuizAnswers[key] = value;
    }
    renderPriceQuiz();
  });
});

priceQuizNext?.addEventListener("click", () => {
  if (!quizHasAnswer(priceQuizFields[priceQuizStep]?.[0])) return;
  if (priceQuizStep === priceQuizSteps.length - 1) showPriceQuizResult();
  else {
    priceQuizStep += 1;
    renderPriceQuiz();
  }
});

priceQuizBack?.addEventListener("click", () => {
  priceQuizStep = Math.max(0, priceQuizStep - 1);
  renderPriceQuiz();
});

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  }
};

priceQuizTelegram?.addEventListener("click", (event) => {
  event.preventDefault();
  window.open(priceQuizTelegram.href, "_blank", "noopener");
  void copyText(`Здравствуйте, Максим Юрьевич. Хочу уточнить ориентир стоимости.\n\n${quizSummaryText()}\n\nКратко опишу ситуацию:`)
    .then((copied) => {
      if (priceQuizTelegramNote) priceQuizTelegramNote.textContent = copied
        ? "Сводка скопирована. Вставьте её в чат с Максимом Юрьевичем."
        : "Сводку можно скопировать из этого окна и вставить в чат с Максимом Юрьевичем.";
    });
});

$$('[data-price-quiz-close]').forEach((control) => control.addEventListener("click", () => priceQuizDialog?.close()));
priceQuizDialog?.addEventListener("click", (event) => {
  if (event.target === priceQuizDialog) priceQuizDialog.close();
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
