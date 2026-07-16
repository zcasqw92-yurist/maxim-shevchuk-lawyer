import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { site } from "../site.config.mjs";

const genericMessage = "Здравствуйте, Максим Юрьевич. Хочу получить первичную оценку ситуации. Кратко опишу, что произошло, и приложу имеющиеся документы:";

const telegramDraftUrl = (message) => {
  const url = new URL(site.telegram);
  url.searchParams.set("text", message);
  return url.toString();
};

const messengerIntentJs = `

// Every messenger control carries the intent that the visitor selected.
// Telegram receives a pre-filled draft through its official ?text= deep-link parameter;
// clipboard access is not required for the primary flow.
;(() => {
  const genericMessage = "Здравствуйте, Максим Юрьевич. Хочу получить первичную оценку ситуации. Кратко опишу, что произошло, и приложу имеющиеся документы:";
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
    ? "Здравствуйте, Максим Юрьевич. Обращаюсь по вопросу: " + topic + ". Кратко опишу ситуацию и приложу имеющиеся материалы:"
    : genericMessage;

  const messageForControl = (control) => {
    const explicit = String(control?.dataset?.message || "").trim();
    if (explicit) return explicit;
    const topic = String(control?.dataset?.topic || "").trim();
    return topicMessage(topic);
  };

  const rememberTelegramBase = (link) => {
    if (!link) return "https://t.me/lawrazbor";
    if (!link.dataset.telegramBase) link.dataset.telegramBase = cleanTelegramBase(link.href);
    return link.dataset.telegramBase;
  };

  const rememberWhatsappBase = (link) => {
    if (!link) return "https://api.whatsapp.com/send?phone=79065297970";
    if (!link.dataset.whatsappBase) link.dataset.whatsappBase = cleanWhatsappBase(link.href);
    return link.dataset.whatsappBase;
  };

  const updateContactLinks = (control = null) => {
    const dialog = document.querySelector("#contact-dialog");
    const telegram = dialog?.querySelector("a[data-track='telegram']");
    const whatsapp = dialog?.querySelector("[data-whatsapp-link]");
    if (!dialog || !telegram || !whatsapp) return;

    let message = control ? messageForControl(control) : String(dialog.dataset.intentMessage || "").trim();
    if (!message) {
      const topic = dialog.dataset.topic && dialog.dataset.topic !== "general" ? dialog.dataset.topic : "";
      message = topicMessage(topic);
    }
    dialog.dataset.intentMessage = message;
    telegram.href = telegramDraftUrl(rememberTelegramBase(telegram), message);
    whatsapp.href = whatsappDraftUrl(rememberWhatsappBase(whatsapp), message);
  };

  const quizSummary = () => [
    ["issue", "Ситуация"],
    ["materials", "Материалы"],
    ["timing", "Срок"],
  ].map(([key, label]) => {
    const selected = document.querySelector("#price-quiz-dialog [data-quiz-key='" + key + "'][aria-pressed='true']");
    return label + ": " + (selected?.dataset.quizValue || "Не указано");
  }).join("\\n");

  const quizMessage = () => "Здравствуйте, Максим Юрьевич. Я прошёл(а) короткий опрос на сайте и хочу уточнить ориентир стоимости.\\n\\n" + quizSummary() + "\\n\\nКратко дополню обстоятельства:";

  const updateQuizTelegram = () => {
    const link = document.querySelector("#price-quiz-dialog [data-price-quiz-telegram]");
    if (!link) return;
    link.href = telegramDraftUrl(rememberTelegramBase(link), quizMessage());
    const note = document.querySelector("#price-quiz-dialog [data-price-quiz-telegram-note]");
    if (note) note.textContent = quizNoteText;
  };

  const callbackMessage = (form) => {
    const data = new FormData(form);
    return [
      "Здравствуйте, Максим Юрьевич. Прошу связаться со мной позже.",
      "",
      "Имя: " + String(data.get("name") || "").trim(),
      "Контакт: " + String(data.get("contact") || "").trim(),
      "Удобный день: " + String(data.get("day") || "").trim(),
      "Удобное время: " + String(data.get("period") || "").trim(),
      "Кратко о ситуации: " + String(data.get("summary") || "").trim(),
      "Страница сайта: " + String(data.get("source") || location.pathname).trim(),
    ].join("\\n");
  };

  document.querySelectorAll("[data-dialog-open]").forEach((control) => {
    control.addEventListener("click", () => updateContactLinks(control));
  });

  document.querySelectorAll("[data-price-quiz-open]").forEach((control) => {
    control.addEventListener("click", () => {
      const note = document.querySelector("#price-quiz-dialog [data-price-quiz-telegram-note]");
      if (note) note.textContent = quizNoteText;
    });
  });

  document.querySelectorAll("#price-quiz-dialog [data-price-quiz-option]").forEach((control) => {
    control.addEventListener("click", updateQuizTelegram);
  });

  document.addEventListener("click", (event) => {
    const quizTelegram = event.target.closest?.("[data-price-quiz-telegram]");
    if (quizTelegram) {
      event.preventDefault();
      event.stopImmediatePropagation();
      updateQuizTelegram();
      window.open(quizTelegram.href, "_blank", "noopener");
      if (typeof track === "function") track("contact_click", { channel: "telegram", source: "price_quiz", page_path: location.pathname });
      return;
    }

    const callbackTelegram = event.target.closest?.("[data-callback-telegram]");
    if (callbackTelegram) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const dialog = callbackTelegram.closest("#callback-dialog");
      const form = dialog?.querySelector("[data-callback-form]");
      const note = dialog?.querySelector("[data-callback-note]");
      const copyField = dialog?.querySelector("[data-callback-copy]");
      if (!form || !form.reportValidity()) {
        if (note) note.textContent = "Заполните обязательные поля и подтвердите согласие на обработку данных.";
        return;
      }
      const url = telegramDraftUrl(callbackTelegram.dataset.telegramHref, callbackMessage(form));
      if (copyField) copyField.hidden = true;
      if (note) note.textContent = "Telegram открыт с заполненным обращением. Проверьте текст и нажмите отправить.";
      window.open(url, "_blank", "noopener");
      if (typeof track === "function") track("callback_request_telegram", { page_path: location.pathname });
      return;
    }

    const telegramLink = event.target.closest?.("a[data-track='telegram']");
    if (telegramLink && telegramLink.closest("#contact-dialog")) updateContactLinks();
  }, true);

  updateContactLinks();
})();
`;

const updatePage = async (file) => {
  let html = await readFile(file, "utf8");
  html = html.replaceAll(`href="${site.telegram}"`, `href="${telegramDraftUrl(genericMessage)}"`);
  html = html.replaceAll(
    "Нажмите кнопку: Telegram откроется, а текст с ответами уже скопируется. Вставьте его в чат с Максимом Юрьевичем.",
    "Telegram откроется с заполненным черновиком. Проверьте ответы и отправьте сообщение Максиму Юрьевичу.",
  );
  await writeFile(file, html, "utf8");
};

export const applyMessengerIntentOverrides = async ({ dist, services }) => {
  const pagePaths = [
    "index.html",
    join("uslugi", "index.html"),
    ...services.map((service) => join("uslugi", service.slug, "index.html")),
    join("o-yuriste", "index.html"),
    join("kontakty", "index.html"),
    join("politika-konfidencialnosti", "index.html"),
  ];

  for (const pagePath of pagePaths) await updatePage(join(dist, pagePath));

  const appFile = join(dist, "assets", "app.js");
  const app = await readFile(appFile, "utf8");
  if (app.includes("Every messenger control carries the intent")) throw new Error("Логика намерений мессенджеров уже добавлена");
  await writeFile(appFile, `${app}${messengerIntentJs}`, "utf8");
};
