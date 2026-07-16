import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

export const servicePageContent = {
  "dosudebnoe-uregulirovanie": {
    eyebrow: "Претензия и решение до суда",
    title: "Досудебная претензия и урегулирование спора",
    lead: "Проверю документы, рассчитаю требования и подготовлю позицию, которая устанавливает понятный срок и последствия отказа. Первично ознакомлюсь с материалами бесплатно.",
    topic: "досудебное урегулирование и подготовка претензии",
    button: "Передать материалы по спору",
    message: "Здравствуйте, Максим Юрьевич. Нужна помощь с досудебным урегулированием и подготовкой претензии. Кратко опишу, что произошло, что уже требовал(а) от второй стороны и какие документы сохранились:",
    cardTitle: "Что прислать для начала",
    cardText: "Достаточно основных материалов. После просмотра объясню, чего не хватает для сильной позиции.",
    cardItems: ["Договор или заказ", "Платежи и переписка", "Ответ, отказ или молчание"],
    situationsTitle: "Когда стоит начинать с претензии",
    resultTitle: "Требование, готовое к направлению",
    resultNote: "После подготовки объясню, как направить претензию, подтвердить вручение и действовать при отказе или молчании.",
    processTitle: "Как готовится досудебная позиция",
    process: [
      ["Материалы", "Проверяю договор, оплату, переписку и развитие спора."],
      ["Расчёт", "Определяю основную сумму и дополнительные требования при наличии оснований."],
      ["Претензия", "Фиксирую факты, правовое основание, срок и последствия неисполнения."],
      ["После ответа", "Остаюсь на связи и объясняю следующий шаг при отказе, отписке или молчании."],
    ],
    supportTitle: "После претензии я остаюсь на связи",
    supportLead: "Помогу оценить ответ второй стороны, понять, выполнены ли требования, и определить, нужен ли следующий документ или обращение в суд.",
    ctaTitle: "Передайте материалы по спору",
    ctaText: "Кратко опишите хронологию, сумму и реакцию второй стороны. Первично посмотрю документы бесплатно и объясню, с чего разумнее начать.",
  },
  "vozvrat-deneg": {
    eyebrow: "Возврат оплаты и долга",
    title: "Возврат денег за товар, услугу, работу или по договору",
    lead: "Определю законное основание возврата, проверю доказательства оплаты и рассчитаю требования. Первично ознакомлюсь с материалами бесплатно и объясню порядок действий.",
    topic: "возврат денежных средств",
    button: "Проверить возможность возврата",
    message: "Здравствуйте, Максим Юрьевич. Нужна помощь с возвратом денег. Кратко укажу, кому и за что платил(а), какую сумму хочу вернуть, что было исполнено и какие доказательства сохранились:",
    cardTitle: "Что прислать для начала",
    cardText: "Для первичной оценки достаточно документов, которые показывают оплату, договорённость и причину возврата.",
    cardItems: ["Договор, заказ или чек", "Подтверждение оплаты", "Переписка и отказ вернуть деньги"],
    situationsTitle: "В каких случаях можно требовать возврат",
    resultTitle: "Расчёт и документ под вашу ситуацию",
    resultNote: "Окончательный перечень требований определяется после проверки договора, статуса сторон и оснований возврата.",
    processTitle: "Как выстраивается возврат денег",
    process: [
      ["Основание", "Определяю, из какого договора или нарушения возникает обязанность вернуть деньги."],
      ["Доказательства", "Проверяю оплату, переписку, результат работы и полученные ответы."],
      ["Требования", "Рассчитываю сумму возврата и дополнительные требования при наличии оснований."],
      ["Следующий шаг", "Готовлю претензию или иск и объясняю порядок дальнейших действий."],
    ],
    supportTitle: "После документа помогу оценить реакцию второй стороны",
    supportLead: "Можно показать ответ, частичный возврат, отказ или новое предложение. Объясню, закрывает ли это требования и что делать дальше.",
    ctaTitle: "Проверим, на каком основании вернуть деньги",
    ctaText: "Сообщите сумму, дату оплаты, что обещала вторая сторона и что произошло фактически. Приложите договор, чек или переписку.",
  },
  "zhaloby-i-obrashcheniya": {
    eyebrow: "Обжалование и контроль",
    title: "Жалоба на бездействие, формальный отказ или нарушение прав",
    lead: "Определю компетентный орган, предмет проверки и конкретный результат, который нужно просить. Первично изучу ответ, отказ и имеющиеся материалы бесплатно.",
    topic: "жалоба на бездействие, отказ или нарушение прав",
    button: "Проверить основание жалобы",
    message: "Здравствуйте, Максим Юрьевич. Нужна помощь с жалобой на бездействие, отказ или нарушение прав. Кратко опишу, куда уже обращался(ась), что просил(а), какой ответ получил(а) и какие документы есть:",
    cardTitle: "Что прислать для начала",
    cardText: "Особенно важны исходное обращение, подтверждение его подачи и ответ либо сведения о нарушенном сроке.",
    cardItems: ["Первоначальное обращение", "Ответ, отказ или постановление", "Подтверждение подачи и сроков"],
    situationsTitle: "Когда жалоба может изменить ситуацию",
    resultTitle: "Жалоба с конкретным предметом проверки",
    resultNote: "В документе фиксируется, что именно нарушено, что орган должен проверить и какое решение требуется принять.",
    processTitle: "Как готовится сильная жалоба",
    process: [
      ["Хронология", "Сопоставляю обращения, ответы, сроки и фактически совершённые действия."],
      ["Компетенция", "Определяю, какой орган вправе отменить решение или обязать провести проверку."],
      ["Нарушения", "Показываю конкретные пробелы, противоречия и неисполненные обязанности."],
      ["Контроль", "Объясняю подачу, отслеживание срока и дальнейшее обжалование ответа."],
    ],
    supportTitle: "После подачи помогу разобраться с ответом",
    supportLead: "Если придёт отписка, отказ, уведомление о продлении или новый запрос, можно прислать его мне — объясню юридическое значение и дальнейшие действия.",
    ctaTitle: "Покажите обращение и полученный ответ",
    ctaText: "Сообщите, куда и когда обращались, что просили и какой результат получили. Если ответа нет, укажите дату и способ подачи.",
  },
  "iskovoe-zayavlenie": {
    eyebrow: "Подготовка к суду",
    title: "Исковое заявление по денежному или договорному спору",
    lead: "Проверю досудебный порядок, доказательства, расчёт и подсудность, затем соберу требования в цельную судебную позицию. Первичный просмотр материалов бесплатный.",
    topic: "подготовка искового заявления",
    button: "Проверить готовность к иску",
    message: "Здравствуйте, Максим Юрьевич. Нужна помощь с подготовкой искового заявления. Кратко опишу спор, требования, досудебные действия, сумму и документы, которыми подтверждаются обстоятельства:",
    cardTitle: "Что прислать для начала",
    cardText: "Для оценки готовности дела к суду важны не только основные документы, но и подтверждение соблюдения обязательного порядка.",
    cardItems: ["Договор и платежи", "Претензия и подтверждение отправки", "Ответ, расчёт и доказательства"],
    situationsTitle: "Когда спор готов к обращению в суд",
    resultTitle: "Иск, расчёт и порядок подачи",
    resultNote: "После подготовки вы получаете иск, перечень приложений и пояснение, куда и каким способом подать документы.",
    processTitle: "Как собирается судебная позиция",
    process: [
      ["Проверка", "Уточняю стороны, подсудность, сроки и соблюдение досудебного порядка."],
      ["Доказательства", "Связываю каждый значимый факт с конкретным документом или иным подтверждением."],
      ["Расчёт", "Формирую основные и дополнительные денежные требования при наличии оснований."],
      ["Подача", "Передаю готовый комплект и объясняю процессуальные действия после обращения в суд."],
    ],
    supportTitle: "После подготовки иска объясню дальнейший процесс",
    supportLead: "Остаюсь на связи по вопросам подачи, уведомления участников, определения суда и новых документов, которые поступят по делу.",
    ctaTitle: "Проверим, достаточно ли материалов для иска",
    ctaText: "Кратко укажите предмет спора, сумму, действия до суда и имеющиеся доказательства. После просмотра назову состав работы, стоимость и срок.",
  },
  "spory-biznesa": {
    eyebrow: "Договорные споры B2B",
    title: "Юрист по договорным и денежным спорам бизнеса",
    lead: "Проверю договор, исполнение, приёмку, расчёты и деловую переписку. Подготовлю досудебную позицию с учётом отношений между организациями и предпринимателями.",
    topic: "договорный или денежный спор бизнеса",
    button: "Разобрать договорный спор",
    message: "Здравствуйте, Максим Юрьевич. Нужна помощь по договорному или денежному спору бизнеса. Кратко укажу стороны, предмет договора, что исполнено, в чём нарушение, сумму и имеющиеся документы:",
    cardTitle: "Что прислать для начала",
    cardText: "Для коммерческого спора особенно важны документы об исполнении и согласованный сторонами порядок приёмки и оплаты.",
    cardItems: ["Договор и приложения", "Акты, УПД, накладные или отчёты", "Платежи и деловая переписка"],
    situationsTitle: "Типовые договорные споры бизнеса",
    resultTitle: "Коммерческая позиция с расчётом",
    resultNote: "Требования формируются по договору и гражданскому законодательству без применения потребительских норм к отношениям B2B.",
    processTitle: "Как разбирается коммерческий спор",
    process: [
      ["Договор", "Проверяю предмет, сроки, оплату, приёмку, ответственность и порядок претензий."],
      ["Исполнение", "Сопоставляю документы, платежи и фактическое поведение сторон."],
      ["Расчёт", "Определяю долг, неустойку, проценты и убытки при наличии оснований."],
      ["Стратегия", "Готовлю претензию и материалы для переговоров либо следующего судебного этапа."],
    ],
    supportTitle: "После претензии помогу оценить деловой ответ",
    supportLead: "Разберу возражения контрагента, предложение о зачёте, графике оплаты или частичном исполнении и объясню риски дальнейших действий.",
    ctaTitle: "Передайте договор и документы об исполнении",
    ctaText: "Укажите сумму спора, ключевые сроки и текущее положение сторон. Первично определю, какие документы и требования имеют решающее значение.",
  },
  marketpleysy: {
    eyebrow: "Защита продавца на площадке",
    title: "Споры продавцов с Ozon, Wildberries и Яндекс Маркетом",
    lead: "Разберу оферту, отчёты, удержания, штрафы, блокировку и переписку с поддержкой. Переведу технический спор с площадкой в юридически оформленную позицию.",
    topic: "спор продавца с маркетплейсом",
    button: "Разобрать удержание или блокировку",
    message: "Здравствуйте, Максим Юрьевич. Нужна помощь продавцу по спору с маркетплейсом. Укажу площадку, основание удержания, штрафа или блокировки, спорную сумму, даты и какие отчёты и ответы поддержки сохранились:",
    cardTitle: "Что прислать для начала",
    cardText: "Скриншотов кабинета обычно недостаточно: нужны документы, по которым можно восстановить расчёт и основание санкции.",
    cardItems: ["Оферта и уведомления площадки", "Отчёты, удержания и спорные начисления", "Обращения и ответы поддержки"],
    situationsTitle: "Какие действия площадки можно проверять",
    resultTitle: "Юридическая позиция по спорному начислению",
    resultNote: "Позиция строится на условиях оферты, отчётных документах, фактическом исполнении и применимых нормах гражданского права.",
    processTitle: "Как разбирается спор с маркетплейсом",
    process: [
      ["Основание", "Нахожу пункт оферты или правило, на которое ссылается площадка."],
      ["Расчёт", "Сопоставляю отчёты, движения денег, штрафы, удержания и компенсации."],
      ["Возражения", "Формулирую, в чём расчёт или применение правил противоречит договору и фактам."],
      ["Требование", "Готовлю обращение или претензию и объясняю следующий способ защиты."],
    ],
    supportTitle: "После обращения помогу оценить ответ площадки",
    supportLead: "Можно прислать новый отчёт, решение поддержки или изменение статуса кабинета. Объясню, устранено ли нарушение и какой шаг нужен дальше.",
    ctaTitle: "Передайте отчёты и уведомление площадки",
    ctaText: "Укажите маркетплейс, спорную сумму, дату удержания или блокировки и что ответила поддержка. Первично посмотрю материалы бесплатно.",
  },
};

const replaceRequired = (html, from, to, label) => {
  if (!html.includes(from)) throw new Error(`Не найден обязательный фрагмент страницы услуги: ${label}`);
  return html.replace(from, to);
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
  const replacement = `<aside class="service-hero__card">${icon}<strong>${escapeHtml(content.cardTitle)}</strong><p>${escapeHtml(content.cardText)}</p>${price}<ul>${items}</ul></aside>`;
  return html.replace(original, replacement);
};

const processSection = (content) => `
      <section class="section section--process"><div class="wrap"><div class="section-head reveal"><span class="eyebrow">Последовательность</span><h2>${escapeHtml(content.processTitle)}</h2></div><ol class="process-line">${content.process.map(([title, text], index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></li>`).join("")}</ol></div></section>`;

const typographyCss = `

/* Readable editorial type scale: restrained on desktop and compact on mobile. */
@layer base {
  h1 { font-size: clamp(2.75rem, 5vw, 4.75rem); }
  h2 { font-size: clamp(2rem, 3.6vw, 3.5rem); }
  h3 { font-size: clamp(1.2rem, 1.7vw, 1.45rem); }
}

@layer components {
  .lead { font-size: clamp(1.0625rem, 1.5vw, 1.25rem); line-height: 1.65; }
  .section-head--split p { font-size: clamp(1rem, 1.35vw, 1.0625rem); line-height: 1.65; }
  .messenger-dialog__content h2 { font-size: clamp(2rem, 4.2vw, 2.75rem); }
  .price-quiz__step h2, .price-quiz__result h2, .callback-form > h2 { font-size: clamp(1.95rem, 4vw, 2.7rem); }
}

@layer sections {
  .hero h1 { font-size: clamp(2.9rem, 5.2vw, 4.9rem); }
  .hero__lead { font-size: clamp(1.0625rem, 1.55vw, 1.1875rem); line-height: 1.65; }
  .inner-hero h1 { font-size: clamp(2.75rem, 4.8vw, 4.75rem); }
  .inner-hero h1 + p { font-size: 1.125rem; line-height: 1.65; }
  .service-hero h1 { max-width: 860px; font-size: clamp(2.75rem, 4.6vw, 4.6rem); }
  .service-hero h1 + p { font-size: 1.125rem; line-height: 1.65; }
  .service-hero__card strong { font-size: clamp(1.45rem, 2vw, 1.7rem); }
  .service-hero__card > p { font-size: .875rem; line-height: 1.65; }
  .two-lists h2 { font-size: clamp(2rem, 3.2vw, 3rem); }
  .number-list p, .plain-checks li { font-size: 1rem; line-height: 1.6; }
  .process-line strong { font-size: clamp(1.25rem, 1.8vw, 1.45rem); }
  .process-line p { font-size: .9375rem; line-height: 1.6; }
}

@layer utilities {
  @media (max-width: 680px) {
    h1 { font-size: clamp(2.25rem, 10vw, 3rem); }
    h2 { font-size: clamp(1.875rem, 8vw, 2.5rem); }
    h3 { font-size: 1.25rem; }
    .hero h1 { font-size: clamp(2.35rem, 10.5vw, 3.15rem); }
    .hero__lead, .service-hero h1 + p, .inner-hero h1 + p, .lead { font-size: 1.0625rem; line-height: 1.65; }
    .inner-hero h1, .service-hero h1, .about-hero h1, .contact-page__intro h1 { font-size: clamp(2.25rem, 10vw, 3rem); }
    .two-lists h2 { font-size: clamp(1.875rem, 8vw, 2.4rem); }
    .messenger-dialog__content h2, .price-quiz__step h2, .price-quiz__result h2, .callback-form > h2 { font-size: clamp(1.9rem, 8.5vw, 2.4rem); }
    .button { font-size: .9375rem; }
    .service-hero__card strong { font-size: 1.5rem; }
    .service-hero__card > p, .process-line p, .paper-panel__note { font-size: .9375rem; }
    .number-list p, .plain-checks li { font-size: 1rem; }
  }
}
`;

const updateServicePage = async (file, service, content) => {
  let html = await readFile(file, "utf8");
  html = replaceRequired(
    html,
    `<span class="eyebrow">${escapeHtml(service.eyebrow)}</span><h1>${escapeHtml(service.title)}</h1><p>${escapeHtml(service.lead)}</p>`,
    `<span class="eyebrow">${escapeHtml(content.eyebrow)}</span><h1>${escapeHtml(content.title)}</h1><p>${escapeHtml(content.lead)}</p>`,
    `${service.slug}: первый экран`,
  );
  html = replaceRequired(
    html,
    `data-dialog-open data-topic="${escapeHtml(service.name)}">Обсудить ситуацию`,
    `data-dialog-open data-topic="${escapeHtml(content.topic)}" data-message="${escapeHtml(content.message)}">${escapeHtml(content.button)}`,
    `${service.slug}: основная кнопка`,
  );
  html = replaceServiceCard(html, content, service.slug);
  html = replaceRequired(html, "<span class=\"eyebrow\">Когда это направление подходит</span><h2>Типовые исходные ситуации</h2>", `<span class="eyebrow">Когда подходит услуга</span><h2>${escapeHtml(content.situationsTitle)}</h2>`, `${service.slug}: ситуации`);
  html = replaceRequired(html, "<span class=\"eyebrow\">Что входит в результат</span><h2>Позиция, которой можно пользоваться</h2>", `<span class="eyebrow">Что получите</span><h2>${escapeHtml(content.resultTitle)}</h2>`, `${service.slug}: результат`);
  html = replaceRequired(html, "<p class=\"paper-panel__note\">Точный состав документа и требований зависит от правовой квалификации конкретных обстоятельств.</p>", `<p class="paper-panel__note">${escapeHtml(content.resultNote)}</p>`, `${service.slug}: пояснение результата`);
  const processPattern = /\n\s*<section class="section section--process">[\s\S]*?<\/section>/;
  if (!processPattern.test(html)) throw new Error(`Не найден процесс работы: ${service.slug}`);
  html = html.replace(processPattern, processSection(content));
  html = replaceRequired(html, "<h2>Документ готовит Максим Юрьевич</h2><p class=\"lead\">Формулировки связываются с вашими фактами и приложениями. После подготовки вы понимаете не только что направить, но и как реагировать на дальнейшее развитие спора.</p>", `<h2>${escapeHtml(content.supportTitle)}</h2><p class="lead">${escapeHtml(content.supportLead)}</p>`, `${service.slug}: поддержка после документа`);
  html = replaceRequired(html, `<h2>Обсудить: ${escapeHtml(service.name.toLowerCase())}</h2><p>Опишите обстоятельства и перечислите документы. Вопрос можно сформулировать обычными словами.</p>`, `<h2>${escapeHtml(content.ctaTitle)}</h2><p>${escapeHtml(content.ctaText)}</p>`, `${service.slug}: финальный призыв`);
  html = replaceRequired(html, '<button class="button button--gold" type="button" data-dialog-open>', `<button class="button button--gold" type="button" data-dialog-open data-topic="${escapeHtml(content.topic)}" data-message="${escapeHtml(content.message)}">`, `${service.slug}: финальная кнопка`);
  await writeFile(file, html, "utf8");
};

export const applyServicePageOverrides = async ({ dist, services }) => {
  for (const service of services) {
    const content = servicePageContent[service.slug];
    if (!content) throw new Error(`Не настроена индивидуальная страница услуги: ${service.slug}`);
    await updateServicePage(join(dist, "uslugi", service.slug, "index.html"), service, content);
  }
  const stylesFile = join(dist, "assets", "styles.css");
  const styles = await readFile(stylesFile, "utf8");
  if (styles.includes("Readable editorial type scale")) throw new Error("Типографическая шкала уже добавлена");
  await writeFile(stylesFile, `${styles}${typographyCss}`, "utf8");
};
