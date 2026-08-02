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

const commonReplacements = [
  [
    '<h1>Сильная правовая позиция начинается <em data-hero-rotator>с точных фактов</em></h1>',
    '<h1>Досудебное урегулирование споров</h1>',
  ],
  [
    '<p class="hero__lead">Разбираю документы, нахожу юридическое основание и выстраиваю последовательность действий — от досудебного требования до искового заявления.</p>',
    '<p class="hero__lead">Проверяю документы, рассчитываю требования и готовлю претензию. Сначала выясняю, можно ли решить спор без суда. Если нет, сохраняю доказательства и готовлю материалы для жалобы или иска.</p>',
  ],
  [
    '<div><span class="eyebrow">Направления практики</span><h2>Юридическая помощь под задачу</h2></div>',
    '<div><span class="eyebrow">Основная специализация</span><h2>Помощь до суда и подготовка к дальнейшим действиям</h2></div>',
  ],
  [
    '<p>Каждое направление — отдельная логика работы, доказательств и требований.</p>',
    '<p>Сначала проверяю, можно ли решить вопрос без суда. Если требуются жалоба или иск, заранее собираю документы и доказательства, которые для этого понадобятся.</p>',
  ],
  [
    '<span class="eyebrow">Направления практики</span><h1>Юридическая помощь, собранная под вашу ситуацию</h1><p>Выберите направление, чтобы увидеть логику работы, необходимые материалы и возможный результат подготовки.</p>',
    '<span class="eyebrow">Юридические услуги</span><h1>Помощь по досудебным и денежным спорам</h1><p>Выберите ситуацию, чтобы узнать, какие документы потребуются, что можно сделать без суда и когда уже нужна жалоба или иск.</p>',
  ],
  ['>Описать ситуацию<svg class="button__icon"', '>Описать ситуацию юристу<svg class="button__icon"'],
  ['>Узнать стоимость<svg class="button__icon"', '>Узнать ориентир стоимости<svg class="button__icon"'],
  [
    '<span class="hero__mobile-assurance"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Конфиденциально</span>',
    '<span class="hero__mobile-assurance"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Первое сообщение бесплатно · конфиденциально</span>',
  ],
  ['Сначала документы</span>', 'Первое ознакомление бесплатно</span>'],
  ['Конфиденциально</span>', 'Цена и срок заранее</span>'],
  ['Понятным языком</span>', 'Остаюсь на связи</span>'],
  [
    '<h2 id="contact-path-title">Вы понимаете следующий шаг — без обязательств</h2>',
    '<h2 id="contact-path-title">Сначала разберёмся в ситуации, затем решим, нужна ли платная работа</h2>',
  ],
  [
    '<p>Не нужно заполнять анкету или заранее выбирать документ. Первое сообщение помогает определить, что важно уточнить.</p>',
    '<p>На сайте не нужно оставлять имя или телефон. Вы открываете мессенджер и сами решаете, отправлять ли готовое сообщение.</p>',
  ],
  [
    '<strong>Уточняю важное</strong><p>Максим Юрьевич лично задаёт вопросы по обстоятельствам, срокам и материалам.</p>',
    '<strong>Смотрю основные материалы</strong><p>Уточняю обстоятельства, отвечаю на первые вопросы и объясняю, что можно сделать.</p>',
  ],
  [
    '<strong>Согласуем действия</strong><p>Вы понимаете, какие материалы нужны и что можно делать дальше.</p>',
    '<strong>Заранее согласуем работу</strong><p>До оплаты вы будете знать, что именно я подготовлю, сколько это стоит и когда всё будет готово.</p>',
  ],
  ['<h2 id="dialog-title">Готов разобрать ситуацию</h2>', '<h2 id="dialog-title">Кратко опишите, что произошло</h2>'],
  [
    'Напишите в удобный мессенджер, что произошло. Максим Юрьевич лично уточнит важные детали и подскажет, с чего начать.',
    'Выберите мессенджер. Откроется готовое сообщение: его можно изменить перед отправкой. Сайт не получает его текст.',
  ],
  [
    '<p class="messenger-dialog__note">Первичное сообщение ни к чему вас не обязывает.</p>',
    '<p class="messenger-dialog__note">Сообщение будет передано юристу только после того, как вы самостоятельно нажмёте «Отправить» в мессенджере.</p>',
  ],
  [
    '<div><span class="eyebrow">Результат работы</span><h2>Что вы получите после разбора</h2></div>',
    '<div><span class="eyebrow">До начала работы</span><h2>Вы заранее понимаете, что нужно сделать</h2></div>',
  ],
  [
    '<p>Не абстрактную консультацию, а понятную опору для следующего действия — в переписке, претензии, жалобе или суде.</p>',
    '<p>Я объясняю, какой документ или действие действительно нужны, сколько будет стоить работа и когда она будет готова.</p>',
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
  ['<span class="eyebrow eyebrow--light">Начать с фактов</span>', '<span class="eyebrow eyebrow--light">Можно начать бесплатно</span>'],
  ['<h2>Разберём, на чём можно построить позицию</h2>', '<h2>Кратко опишите ситуацию</h2>'],
  [
    '<p>Опишите ситуацию и перечислите документы. Этого достаточно, чтобы определить первый предметный шаг.</p>',
    '<p>Откройте удобный мессенджер и напишите напрямую юристу. На сайте не нужно оставлять имя, телефон или документы.</p>',
  ],
];

const applyCommonContent = (html) => {
  let result = html;
  for (const [from, to] of commonReplacements) {
    if (result.includes(from)) result = result.replaceAll(from, to);
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

const removeContactQuestionnaires = (html) => {
  const quizPattern = /\n\s*<dialog class="price-quiz-dialog" id="price-quiz-dialog"[\s\S]*?<\/dialog>/;
  if (!quizPattern.test(html)) throw new Error("Не найден удаляемый квиз стоимости");
  let result = html.replace(quizPattern, "");
  result = result.replaceAll(
    'data-price-quiz-open',
    'data-dialog-open data-topic="ориентир стоимости юридической помощи" data-message="Здравствуйте, Максим Юрьевич. Хочу уточнить ориентир стоимости юридической помощи. Кратко опишу ситуацию и приложу имеющиеся материалы:"',
  );
  return result;
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
  const whatsappHref = new RegExp(`href="${site.whatsapp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:&amp;|&)text=[^"]*"`, "g");
  result = result.replace(whatsappHref, `href="${whatsapp}"`);
  return result.replaceAll(`href="${site.whatsapp}"`, `href="${whatsapp}"`);
};

const closingCtaArrow = '<svg class="button__icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const closingPageCta = ({ title, text, topic, message }) => `
  <section class="section section--cta section--closing-cta">
    <div class="wrap cta-panel reveal">
      <div>
        <span class="eyebrow eyebrow--light">Можно начать бесплатно</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(text)}</p>
      </div>
      <button class="button button--gold" type="button" data-dialog-open data-topic="${escapeAttribute(topic)}" data-message="${escapeAttribute(message)}">Описать ситуацию юристу${closingCtaArrow}</button>
    </div>
  </section>`;

const normalizePageEnding = (html, pathname) => {
  if (pathname === "/o-yuriste") {
    return replaceRequired(
      html,
      '<section class="section section--cta">',
      '<section class="section section--cta section--closing-cta">',
      "О юристе: финальный CTA",
    );
  }
  if (pathname === "/kontakty") {
    const finalCta = closingPageCta({
      title: "Напишите, что произошло",
      text: "Кратко изложите события и перечислите документы. В мессенджере откроется готовое сообщение, которое можно изменить перед отправкой.",
      topic: "первичный разбор юридической ситуации",
      message: "Здравствуйте, Максим Юрьевич. Хочу уточнить, что можно сделать в моей ситуации. Кратко опишу события и перечислю имеющиеся документы:",
    });
    return replaceRequired(html, "</main>", `${finalCta}
  </main>`, "Контакты: финальный CTA");
  }
  return html;
};

export const composeRenderedPage = (html, { pathname, service = null } = {}) => {
  let result = html;
  if (pathname !== "/politika-konfidencialnosti") result = applyCommonContent(result);
  result = removeContactQuestionnaires(result);
  if (pathname === "/") result = expandQuickChoices(result);
  if (service) result = applyServiceContent(result, service);
  result = normalizePageEnding(result, pathname);
  return prefillMessengerLinks(result);
};
