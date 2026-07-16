import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { site } from "../site.config.mjs";

const escapeAttribute = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const insertBeforeRequired = (content, marker, insertion, label) => {
  if (!content.includes(marker)) throw new Error(`Не найден обязательный фрагмент для связи позже: ${label}`);
  return content.replace(marker, `${insertion}${marker}`);
};

const trigger = (className = "callback-open-link") =>
  `<button class="text-link ${className}" type="button" data-callback-open>Связаться позже</button>`;

const callbackDialog = () => {
  const privacyHref = `${site.basePath || ""}/politika-konfidencialnosti/`;
  return `
  <dialog class="price-quiz-dialog callback-dialog" id="callback-dialog" aria-labelledby="callback-title">
    <button class="dialog__close" type="button" data-callback-close aria-label="Закрыть">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
    </button>
    <form class="price-quiz callback-form" data-callback-form>
      <div class="price-quiz__head callback-form__head">
        <span class="eyebrow">Связаться позже</span>
      </div>
      <h2 id="callback-title">Оставьте контакт и удобное время</h2>
      <p class="callback-form__intro">Заполните короткую форму. После нажатия откроется выбранный мессенджер с готовым сообщением — останется проверить и отправить его.</p>
      <div class="callback-form__fields">
        <label class="callback-field">
          <span>Имя</span>
          <input type="text" name="name" autocomplete="name" maxlength="80" required placeholder="Как к вам обращаться">
        </label>
        <label class="callback-field">
          <span>Телефон или Telegram</span>
          <input type="text" name="contact" autocomplete="tel" maxlength="120" required placeholder="Например, +7 900 000-00-00 или @username">
        </label>
        <label class="callback-field">
          <span>Удобный день</span>
          <select name="day" required>
            <option value="">Выберите вариант</option>
            <option value="Сегодня">Сегодня</option>
            <option value="Завтра">Завтра</option>
            <option value="В ближайший будний день">В ближайший будний день</option>
            <option value="В выходной день">В выходной день</option>
            <option value="День неважен">День неважен</option>
          </select>
        </label>
        <label class="callback-field">
          <span>Удобное время по Москве</span>
          <select name="period" required>
            <option value="">Выберите вариант</option>
            <option value="Утро, 07:00–12:00 МСК">Утро, 07:00–12:00</option>
            <option value="День, 12:00–17:00 МСК">День, 12:00–17:00</option>
            <option value="Вечер, 17:00–22:00 МСК">Вечер, 17:00–22:00</option>
            <option value="Время неважно">Время неважно</option>
          </select>
        </label>
        <label class="callback-field">
          <span>Кратко о ситуации</span>
          <textarea name="summary" rows="4" maxlength="1200" required placeholder="Что произошло и какой вопрос нужно решить"></textarea>
        </label>
        <input type="hidden" name="source" value="">
        <label class="callback-consent">
          <input type="checkbox" name="consent" required>
          <span>Согласен на обработку переданных данных для ответа на обращение. <a href="${escapeAttribute(privacyHref)}">Политика конфиденциальности</a>.</span>
        </label>
      </div>
      <div class="callback-form__actions">
        <button class="button button--primary button--wide" type="submit" data-callback-whatsapp data-base-href="${escapeAttribute(site.whatsapp)}">Попросить связаться со мной</button>
        <button class="button button--secondary button--wide" type="button" data-callback-telegram data-telegram-href="${escapeAttribute(site.telegram)}">Передать через Telegram</button>
      </div>
      <p class="callback-form__note" data-callback-note>Первичное знакомство с ситуацией бесплатно. Данные не сохраняются на сайте и передаются только через выбранный вами мессенджер.</p>
      <textarea class="callback-copy" data-callback-copy readonly hidden aria-label="Текст обращения"></textarea>
    </form>
  </dialog>`;
};

const callbackCss = `

@layer components {
  .callback-open-link { justify-content: center; margin: 16px auto 0; }
  .footer__contact .callback-open-link { justify-content: flex-start; margin: 12px 0 0; }
  .callback-form__head { display: block; margin-bottom: 20px; }
  .callback-form__head .eyebrow { margin: 0; }
  .callback-form > h2 { margin-bottom: 13px; font-size: clamp(2.15rem, 5vw, 3.35rem); }
  .callback-form__intro { color: var(--ink-soft); font-size: 16px; line-height: 1.6; }
  .callback-form__fields { display: grid; gap: 17px; margin-top: 26px; }
  .callback-field { display: grid; gap: 7px; color: var(--ink); font-size: 13px; font-weight: 720; text-align: left; }
  .callback-field input, .callback-field select, .callback-field textarea {
    width: 100%;
    min-height: 52px;
    padding: 12px 14px;
    color: var(--ink);
    border: 1px solid var(--line);
    background: #faf8f3;
    border-radius: 7px;
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.45;
  }
  .callback-field textarea { min-height: 112px; resize: vertical; }
  .callback-field input:focus, .callback-field select:focus, .callback-field textarea:focus { border-color: var(--gold); outline: 2px solid rgba(195,154,93,.24); outline-offset: 0; }
  .callback-consent { display: grid; grid-template-columns: 20px 1fr; align-items: start; gap: 10px; color: var(--muted); font-size: 12px; font-weight: 500; line-height: 1.5; }
  .callback-consent input { width: 18px; height: 18px; margin-top: 1px; accent-color: var(--ink); }
  .callback-consent a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
  .callback-form__actions { display: grid; gap: 10px; margin-top: 24px; }
  .callback-form__note { margin-top: 18px; color: var(--muted); font-size: 12px; line-height: 1.55; text-align: center; }
  .callback-copy { width: 100%; min-height: 150px; margin-top: 14px; padding: 12px; border: 1px solid var(--line); background: var(--paper); border-radius: 7px; font: inherit; font-size: 12px; }
  .callback-copy[hidden] { display: none; }
}

@layer utilities {
  @media (max-width: 680px) {
    .callback-form > h2 { font-size: clamp(2rem, 10vw, 2.8rem); }
    .callback-form__intro { font-size: 15px; }
    .callback-form__fields { gap: 14px; margin-top: 22px; }
    .callback-open-link { min-height: 44px; }
  }
}
`;

const callbackJs = `

// Callback-later flow: no form data is persisted in browser storage or sent to a server.
;(() => {
  const callbackDialog = document.querySelector("#callback-dialog");
  const callbackForm = callbackDialog?.querySelector("[data-callback-form]");
  const callbackNote = callbackDialog?.querySelector("[data-callback-note]");
  const callbackCopy = callbackDialog?.querySelector("[data-callback-copy]");
  const callbackWhatsapp = callbackDialog?.querySelector("[data-callback-whatsapp]");
  const callbackTelegram = callbackDialog?.querySelector("[data-callback-telegram]");

  if (!callbackDialog || !callbackForm) return;

  const callbackMessage = () => {
    const data = new FormData(callbackForm);
    return [
      "Здравствуйте, Максим Юрьевич. Прошу связаться со мной позже.",
      "",
      \`Имя: \${String(data.get("name") || "").trim()}\`,
      \`Контакт: \${String(data.get("contact") || "").trim()}\`,
      \`Удобный день: \${String(data.get("day") || "").trim()}\`,
      \`Удобное время: \${String(data.get("period") || "").trim()}\`,
      \`Кратко о ситуации: \${String(data.get("summary") || "").trim()}\`,
      \`Страница сайта: \${String(data.get("source") || location.pathname).trim()}\`,
    ].join("\\n");
  };

  const validateCallbackForm = () => {
    const valid = callbackForm.reportValidity();
    if (!valid && callbackNote) callbackNote.textContent = "Заполните обязательные поля и подтвердите согласие на обработку данных.";
    return valid;
  };

  document.querySelectorAll("[data-callback-open]").forEach((control) => {
    control.addEventListener("click", (event) => {
      event.preventDefault();
      const parentDialog = control.closest("dialog");
      if (parentDialog?.open) parentDialog.close();
      const source = callbackForm.elements.namedItem("source");
      if (source) source.value = location.pathname;
      if (callbackNote) callbackNote.textContent = "Первичное знакомство с ситуацией бесплатно. Данные не сохраняются на сайте и передаются только через выбранный вами мессенджер.";
      if (callbackCopy) callbackCopy.hidden = true;
      callbackDialog.showModal();
      callbackForm.elements.namedItem("name")?.focus();
      if (typeof track === "function") track("callback_open", { page_path: location.pathname });
    });
  });

  callbackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validateCallbackForm() || !callbackWhatsapp) return;
    const url = new URL(callbackWhatsapp.dataset.baseHref || callbackWhatsapp.getAttribute("data-base-href"));
    url.searchParams.set("text", callbackMessage());
    window.open(url.toString(), "_blank", "noopener");
    if (callbackNote) callbackNote.textContent = "WhatsApp открыт с готовым сообщением. Проверьте текст и нажмите отправить.";
    if (typeof track === "function") track("callback_request_whatsapp", { page_path: location.pathname });
  });

  callbackTelegram?.addEventListener("click", (event) => {
    event.preventDefault();
    if (!validateCallbackForm()) return;
    const message = callbackMessage();
    window.open(callbackTelegram.dataset.telegramHref, "_blank", "noopener");
    void copyText(message).then((copied) => {
      if (copied) {
        if (callbackNote) callbackNote.textContent = "Telegram открыт, а текст обращения скопирован. Вставьте его в чат и отправьте Максиму Юрьевичу.";
      } else {
        if (callbackCopy) {
          callbackCopy.value = message;
          callbackCopy.hidden = false;
          callbackCopy.focus();
          callbackCopy.select();
        }
        if (callbackNote) callbackNote.textContent = "Telegram открыт. Скопируйте текст из поля ниже и отправьте его Максиму Юрьевичу.";
      }
    });
    if (typeof track === "function") track("callback_request_telegram", { page_path: location.pathname });
  });

  callbackDialog.querySelector("[data-callback-close]")?.addEventListener("click", () => callbackDialog.close());
  callbackDialog.addEventListener("click", (event) => {
    if (event.target === callbackDialog) callbackDialog.close();
  });
})();
`;

const updatePage = async (file) => {
  let html = await readFile(file, "utf8");
  if (html.includes('id="callback-dialog"')) throw new Error(`Диалог связи позже уже существует: ${file}`);
  html = insertBeforeRequired(
    html,
    '<p class="messenger-dialog__privacy">',
    `${trigger()}\n      `,
    "кнопка в окне мессенджеров",
  );
  html = insertBeforeRequired(
    html,
    '<p class="price-quiz__privacy">',
    `${trigger()}\n        `,
    "кнопка в результате квиза",
  );
  html = insertBeforeRequired(
    html,
    '<button class="text-link" type="button" data-dialog-open>Описать ситуацию ',
    `${trigger("callback-open-link callback-open-link--footer")}\n        `,
    "кнопка в подвале",
  );
  html = insertBeforeRequired(html, "</body>", `${callbackDialog()}\n`, "диалог перед закрытием body");
  await writeFile(file, html, "utf8");
};

export const applyCallbackOverrides = async ({ dist, services }) => {
  const pagePaths = [
    "index.html",
    join("uslugi", "index.html"),
    ...services.map((service) => join("uslugi", service.slug, "index.html")),
    join("o-yuriste", "index.html"),
    join("kontakty", "index.html"),
    join("politika-konfidencialnosti", "index.html"),
  ];

  for (const pagePath of pagePaths) await updatePage(join(dist, pagePath));

  const stylesFile = join(dist, "assets", "styles.css");
  const appFile = join(dist, "assets", "app.js");
  await writeFile(stylesFile, `${await readFile(stylesFile, "utf8")}${callbackCss}`, "utf8");
  await writeFile(appFile, `${await readFile(appFile, "utf8")}${callbackJs}`, "utf8");
};
