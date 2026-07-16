import { site } from "../site.config.mjs";
import { genericContactMessage, servicePageContent } from "./service-content.mjs";

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const escapeAttribute = escapeHtml;

const replaceRequired = (content, from, to, label) => {
  if (!content.includes(from)) throw new Error(`Не найден обязательный фрагмент исходного шаблона: ${label}`);
  return content.replace(from, to);
};

const insertBeforeRequired = (content, marker, insertion, label) => {
  if (!content.includes(marker)) throw new Error(`Не найден обязательный фрагмент исходного шаблона: ${label}`);
  return content.replace(marker, `${insertion}${marker}`);
};

const commonReplacements = [
  [
    '<h1>Сильная правовая позиция начинается <em data-hero-rotator>с точных фактов</em></h1>',
    '<h1>Передайте ситуацию юристу — разберусь в материалах и объясню, что делать дальше</h1>',
  ],
  [
    '<p class="hero__lead">Разбираю документы, нахожу юридическое основание и выстраиваю последовательность действий — от досудебного требования до искового заявления.</p>',
    '<p class="hero__lead">Вам не нужно самостоятельно определять, нужна претензия, жалоба или иск. Коротко опишите, что произошло, и приложите документы. Первично ознакомлюсь с материалами бесплатно и предложу понятный следующий шаг.</p>',
  ],
  ['>Описать ситуацию<svg class="button__icon"', '>Описать ситуацию юристу<svg class="button__icon"'],
  ['>Узнать стоимость<svg class="button__icon"', '>Узнать ориентир стоимости<svg class="button__icon"'],
  [
    '<span class="hero__mobile-assurance"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Конфиденциально</span>',
    '<span class="hero__mobile-assurance"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Первичное знакомство бесплатно · конфиденциально</span>',
  ],
  ['Сначала документы</span>', 'Первично бесплатно</span>'],
  ['Конфиденциально</span>', 'Цена и срок заранее</span>'],
  ['Понятным языком</span>', 'Остаюсь на связи</span>'],
  [
    '<h2 id="contact-path-title">Вы понимаете следующий шаг — без обязательств</h2>',
    '<h2 id="contact-path-title">Сначала спокойно разберёмся, потом решим, нужна ли платная работа</h2>',
  ],
  [
    '<p>Не нужно заполнять анкету или заранее выбирать документ. Первое сообщение помогает определить, что важно уточнить.</p>',
    '<p>Первичное знакомство с ситуацией и материалами бесплатно. Вы можете описать проблему обычными словами — юридический путь определю после проверки фактов.</p>',
  ],
  [
    '<strong>Уточняю важное</strong><p>Максим Юрьевич лично задаёт вопросы по обстоятельствам, срокам и материалам.</p>',
    '<strong>Бесплатно знакомлюсь с материалами</strong><p>Лично уточняю обстоятельства, отвечаю на основные вопросы и объясняю возможный порядок действий.</p>',
  ],
  [
    '<strong>Согласуем действия</strong><p>Вы понимаете, какие материалы нужны и что можно делать дальше.</p>',
    '<strong>Согласуем работу до её начала</strong><p>Вы заранее понимаете состав услуги, точную стоимость и срок. Согласованная цена в процессе не меняется.</p>',
  ],
  ['<h2 id="dialog-title">Готов разобрать ситуацию</h2>', '<h2 id="dialog-title">Опишите ситуацию — первично посмотрю бесплатно</h2>'],
  [
    'Напишите в удобный мессенджер, что произошло. Максим Юрьевич лично уточнит важные детали и подскажет, с чего начать.',
    'Напишите, что произошло, и приложите имеющиеся материалы. Максим Юрьевич лично ознакомится с ними, ответит на основные вопросы и объяснит, с чего разумнее начать.',
  ],
  [
    '<p class="messenger-dialog__note">Первичное сообщение ни к чему вас не обязывает.</p>',
    '<p class="messenger-dialog__note">Первичное знакомство с ситуацией и материалами бесплатно и ни к чему вас не обязывает.</p>',
  ],
  [
    '<div><span class="eyebrow">Результат работы</span><h2>Что вы получите после разбора</h2></div>',
    '<div><span class="eyebrow">Результат работы</span><h2>Понятная позиция, стоимость и следующий шаг</h2></div>',
  ],
  [
    '<p>Не абстрактную консультацию, а понятную опору для следующего действия — в переписке, претензии, жалобе или суде.</p>',
    '<p>До начала платной работы вы понимаете, что именно нужно сделать, сколько это стоит и в какой срок будет готов результат.</p>',
  ],
  [
    '<div class="price-note reveal"><p>Если для защиты нужно несколько взаимосвязанных документов, состав работы и стоимость согласуются до начала подготовки.</p>',
    '<div class="price-note reveal"><p>Состав работы, точная стоимость и срок согласуются заранее. После согласования цена услуги не увеличивается.</p>',
  ],
  ['<span class="eyebrow">Без лишней неопределённости</span>', '<span class="eyebrow">После подготовки документа</span>'],
  ['<h2>Вы понимаете, что происходит на каждом этапе</h2>', '<h2>Вы не остаётесь один на один с готовым документом</h2>'],
  [
    '<p class="lead">Юридическая помощь не должна превращаться в ещё один источник тревоги. После анализа я объясняю, на чём строится позиция и какой шаг следует дальше.</p>',
    '<p class="lead">После передачи документа я остаюсь на связи: поясняю непонятное, помогаю оценить ответ второй стороны и подсказываю дальнейшие действия.</p>',
  ],
  [
    '<span>Как действовать при согласии, отказе, отписке или полном молчании.</span>',
    '<span>Можно показать ответ, отказ или новое требование и уточнить, как действовать дальше.</span>',
  ],
  ['<span class="eyebrow eyebrow--light">Начать с фактов</span>', '<span class="eyebrow eyebrow--light">Первичный шаг бесплатный</span>'],
  ['<h2>Разберём, на чём можно построить позицию</h2>', '<h2>Передайте ситуацию юристу — дальше не придётся разбираться одному</h2>'],
  [
    '<p>Опишите ситуацию и перечислите документы. Этого достаточно, чтобы определить первый предметный шаг.</p>',
    '<p>Опишите, что произошло, и перечислите документы. Первично ознакомлюсь бесплатно, отвечу на основные вопросы и предложу понятный следующий шаг.</p>',
  ],
];

const applyCommonContent = (html) => {
  let result = html;
  for (const [from, to] of commonReplacements) {
    if (result.includes(from)) result = result.replaceAll(from, to);
  }
  return result;
};

const simplifyPriceQuiz = (html) => {
  let result = html;
  result = replaceRequired(result, "Шаг 1 из 5", "Шаг 1 из 3", "счётчик шагов квиза");
  result = replaceRequired(result, '<h2 id="price-quiz-title">С чем связан вопрос?</h2>', '<h2 id="price-quiz-title">Что произошло?</h2>', "заголовок первого шага квиза");
  result = replaceRequired(result, '<p>Выберите наиболее близкую ситуацию — это поможет понять объём работы.</p>', '<p>Выберите наиболее близкую ситуацию. Подробности можно будет дописать в мессенджере.</p>', "пояснение первого шага квиза");
  result = replaceRequired(result, '<h2>Что уже есть?</h2>', '<h2>Какие материалы есть?</h2>', "заголовок материалов");
  result = replaceRequired(result, '<h2>Есть ли срок?</h2>', '<h2>Насколько срочно?</h2>', "заголовок срочности");
  result = replaceRequired(
    result,
    '<p>Ответы собраны в краткую сводку. Максим Юрьевич уточнит детали и назовёт стоимость до начала работы.</p>',
    '<p>Ответы собраны в краткую сводку. Максим Юрьевич первично ознакомится с ситуацией бесплатно, уточнит детали и назовёт стоимость до начала работы.</p>',
    "пояснение результата квиза",
  );
  for (const step of ["goal", "other-side"]) {
    const pattern = new RegExp(`\\n\\s*<section class="price-quiz__step" data-price-quiz-step="${step}" hidden>[\\s\\S]*?<\\/section>\\n`, "m");
    if (!pattern.test(result)) throw new Error(`Не найден удаляемый шаг квиза: ${step}`);
    result = result.replace(pattern, "\n");
  }
  return result;
};

const expandQuickChoices = (html) => {
  const pattern = /(<div class="hero__quick-choices"[\s\S]*?<span>С чего начнём\?<\/span>\s*)<div>[\s\S]*?<\/div>(\s*<\/div>)/;
  if (!pattern.test(html)) throw new Error("Не найден блок быстрых ситуаций на главной странице");
  const choices = `<div>
               <button type="button" data-dialog-open data-topic="возврат денежных средств">Не возвращают деньги</button>
               <button type="button" data-dialog-open data-topic="неисполнение договора">Не исполняют договор</button>
               <button type="button" data-dialog-open data-topic="досудебная претензия">Нужна претензия</button>
               <button type="button" data-dialog-open data-topic="подготовка иска">Нужно обратиться в суд</button>
               <button type="button" data-dialog-open data-topic="бездействие полиции или государственного органа">Полиция или орган бездействует</button>
               <button type="button" data-dialog-open data-topic="другая ситуация">Другая ситуация</button>
             </div>`;
  return html.replace(pattern, `$1${choices}$2`);
};

const replaceServiceCard = (html, content, slug) => {
  const pattern = /<aside class="service-hero__card">[\s\S]*?<\/aside>/;
  const match = html.match(pattern);
  if (!match) throw new Error(`Не найдена карточка материалов: ${slug}`);
  const original = match[0];
  const icon = original.match(/<span class="service-hero__icon">[\s\S]*?<\/span>/)?.[0] || "";
  const price = original.match(/<div class="service-hero__price">[\s\S]*?<\/div>/)?.[0] || "";
  const checkIcon = original.match(/<li>(<svg[\s\S]*?<\/svg>)Факты<\/li>/)?.[1] || "";
  const items = content.cardItems.map((item) => `<li>${checkIcon}${escapeHtml(item)}</li>`).join("");
  return html.replace(original, `<aside class="service-hero__card">${icon}<strong>${escapeHtml(content.cardTitle)}</strong><p>${escapeHtml(content.cardText)}</p>${price}<ul>${items}</ul></aside>`);
};

const replaceServiceProcess = (html, content, slug) => {
  const pattern = /\n\s*<section class="section section--process">[\s\S]*?<\/section>/;
  if (!pattern.test(html)) throw new Error(`Не найден процесс работы: ${slug}`);
  const section = `
       <section class="section section--process"><div class="wrap"><div class="section-head reveal"><span class="eyebrow">Последовательность</span><h2>${escapeHtml(content.processTitle)}</h2></div><ol class="process-line">${content.process.map(([title, text], index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></li>`).join("")}</ol></div></section>`;
  return html.replace(pattern, section);
};

const replaceServiceFinalCta = (html, content, slug) => {
  const pattern = /(<section class="section section--cta">[\s\S]*?<h2>)[\s\S]*?(<\/h2>\s*<p>)[\s\S]*?(<\/p>)/;
  if (!pattern.test(html)) throw new Error(`Не найден финальный CTA: ${slug}`);
  let result = html.replace(pattern, `$1${escapeHtml(content.ctaTitle)}$2${escapeHtml(content.ctaText)}$3`);
  result = replaceRequired(
    result,
    '<button class="button button--gold" type="button" data-dialog-open>',
    `<button class="button button--gold" type="button" data-dialog-open data-topic="${escapeAttribute(content.topic)}" data-message="${escapeAttribute(content.message)}">`,
    `${slug}: финальная кнопка`,
  );
  return result;
};

const applyServiceContent = (html, service) => {
  const content = servicePageContent[service.slug];
  if (!content) throw new Error(`Не настроена индивидуальная страница услуги: ${service.slug}`);
  let result = html;
  result = replaceRequired(
    result,
    `<span class="eyebrow">${escapeHtml(service.eyebrow)}</span><h1>${escapeHtml(service.title)}</h1><p>${escapeHtml(service.lead)}</p>`,
    `<span class="eyebrow">${escapeHtml(content.eyebrow)}</span><h1>${escapeHtml(content.title)}</h1><p>${escapeHtml(content.lead)}</p>`,
    `${service.slug}: первый экран`,
  );
  result = replaceRequired(
    result,
    `data-dialog-open data-topic="${escapeAttribute(service.name)}">Обсудить ситуацию`,
    `data-dialog-open data-topic="${escapeAttribute(content.topic)}" data-message="${escapeAttribute(content.message)}">${escapeHtml(content.button)}`,
    `${service.slug}: основная кнопка`,
  );
  result = replaceServiceCard(result, content, service.slug);
  result = replaceRequired(result, '<span class="eyebrow">Когда это направление подходит</span><h2>Типовые исходные ситуации</h2>', `<span class="eyebrow">Когда подходит услуга</span><h2>${escapeHtml(content.situationsTitle)}</h2>`, `${service.slug}: ситуации`);
  result = replaceRequired(result, '<span class="eyebrow">Что входит в результат</span><h2>Позиция, которой можно пользоваться</h2>', `<span class="eyebrow">Что получите</span><h2>${escapeHtml(content.resultTitle)}</h2>`, `${service.slug}: результат`);
  result = replaceRequired(result, '<p class="paper-panel__note">Точный состав документа и требований зависит от правовой квалификации конкретных обстоятельств.</p>', `<p class="paper-panel__note">${escapeHtml(content.resultNote)}</p>`, `${service.slug}: пояснение результата`);
  result = replaceServiceProcess(result, content, service.slug);
  result = replaceRequired(
    result,
    '<h2>Документ готовит Максим Юрьевич</h2><p class="lead">Формулировки связываются с вашими фактами и приложениями. После подготовки вы понимаете не только что направить, но и как реагировать на дальнейшее развитие спора.</p>',
    `<h2>${escapeHtml(content.supportTitle)}</h2><p class="lead">${escapeHtml(content.supportLead)}</p>`,
    `${service.slug}: поддержка после документа`,
  );
  return replaceServiceFinalCta(result, content, service.slug);
};

const callbackTrigger = (className = "callback-open-link") =>
  `<button class="text-link ${className}" type="button" data-callback-open>Связаться позже</button>`;

const callbackDialog = () => {
  const privacyHref = `${site.basePath || ""}/politika-konfidencialnosti/`;
  return `
  <dialog class="price-quiz-dialog callback-dialog" id="callback-dialog" aria-labelledby="callback-title">
    <button class="dialog__close" type="button" data-callback-close aria-label="Закрыть">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
    </button>
    <form class="price-quiz callback-form" data-callback-form>
      <div class="price-quiz__head callback-form__head"><span class="eyebrow">Связаться позже</span></div>
      <h2 id="callback-title">Оставьте контакт и удобное время</h2>
      <p class="callback-form__intro">Заполните короткую форму. После нажатия откроется выбранный мессенджер с готовым сообщением — останется проверить и отправить его.</p>
      <div class="callback-form__fields">
        <label class="callback-field"><span>Имя</span><input type="text" name="name" autocomplete="name" maxlength="80" required placeholder="Как к вам обращаться"></label>
        <label class="callback-field"><span>Телефон или Telegram</span><input type="text" name="contact" autocomplete="tel" maxlength="120" required placeholder="Например, +7 900 000-00-00 или @username"></label>
        <label class="callback-field"><span>Удобный день</span><select name="day" required><option value="">Выберите вариант</option><option value="Сегодня">Сегодня</option><option value="Завтра">Завтра</option><option value="В ближайший будний день">В ближайший будний день</option><option value="В выходной день">В выходной день</option><option value="День неважен">День неважен</option></select></label>
        <label class="callback-field"><span>Удобное время по Москве</span><select name="period" required><option value="">Выберите вариант</option><option value="Утро, 07:00–12:00 МСК">Утро, 07:00–12:00</option><option value="День, 12:00–17:00 МСК">День, 12:00–17:00</option><option value="Вечер, 17:00–22:00 МСК">Вечер, 17:00–22:00</option><option value="Время неважно">Время неважно</option></select></label>
        <label class="callback-field"><span>Кратко о ситуации</span><textarea name="summary" rows="4" maxlength="1200" required placeholder="Что произошло и какой вопрос нужно решить"></textarea></label>
        <input type="hidden" name="source" value="">
        <label class="callback-consent"><input type="checkbox" name="consent" required><span>Согласен на обработку переданных данных для ответа на обращение. <a href="${escapeAttribute(privacyHref)}">Политика конфиденциальности</a>.</span></label>
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

const injectCallback = (html) => {
  let result = html;
  result = insertBeforeRequired(result, '<p class="messenger-dialog__privacy">', `${callbackTrigger()}\n      `, "связаться позже в выборе мессенджера");
  result = insertBeforeRequired(result, '<p class="price-quiz__privacy">', `${callbackTrigger()}\n        `, "связаться позже в квизе");
  result = insertBeforeRequired(result, '<button class="text-link" type="button" data-dialog-open>Описать ситуацию ', `${callbackTrigger("callback-open-link callback-open-link--footer")}\n        `, "связаться позже в подвале");
  return insertBeforeRequired(result, "</body>", `${callbackDialog()}\n`, "диалог связи позже");
};

const draftUrl = (base, message) => {
  const url = new URL(base);
  url.searchParams.set("text", message);
  return url.toString();
};

const prefillMessengerLinks = (html) => {
  const telegram = escapeAttribute(draftUrl(site.telegram, genericContactMessage));
  const whatsapp = escapeAttribute(draftUrl(site.whatsapp, genericContactMessage));
  let result = html.replaceAll(`href="${site.telegram}"`, `href="${telegram}"`);
  const whatsappHref = new RegExp(`href="${site.whatsapp.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?:&amp;|&)text=[^"]*"`, "g");
  result = result.replace(whatsappHref, `href="${whatsapp}"`);
  result = result.replaceAll(`href="${site.whatsapp}"`, `href="${whatsapp}"`);
  return result.replaceAll(
    "Нажмите кнопку: Telegram откроется, а текст с ответами уже скопируется. Вставьте его в чат с Максимом Юрьевичем.",
    "Telegram откроется с заполненным черновиком. Проверьте ответы и отправьте сообщение Максиму Юрьевичу.",
  );
};

export const composeRenderedPage = (html, { pathname, service = null } = {}) => {
  let result = html;
  if (pathname !== "/politika-konfidencialnosti") result = applyCommonContent(result);
  result = simplifyPriceQuiz(result);
  if (pathname === "/") result = expandQuickChoices(result);
  if (service) result = applyServiceContent(result, service);
  result = injectCallback(result);
  return prefillMessengerLinks(result);
};
