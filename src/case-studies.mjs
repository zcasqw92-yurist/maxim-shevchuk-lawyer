const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

export const caseStudies = {
  autoclub: {
    id: "autoclub",
    category: "Возврат денег · потребительский спор",
    title: "Отказ от дополнительной услуги стоимостью 80 000 ₽",
    situation: "При покупке автомобиля в кредит была оформлена дополнительная программа стоимостью 80 000 ₽. После отказа исполнитель не вернул всю сумму добровольно.",
    materials: "Договор и сертификат, заявление об отказе, кредитные и платёжные документы, переписка, почтовые подтверждения и сведения о частичном возврате.",
    work: "Подготовлены досудебные требования, обращение в Роспотребнадзор и иск с расчётом остатка, процентов и иных применимых требований.",
    next: "После частичной выплаты требования уточнены по фактически невозвращённой сумме. Судебное рассмотрение продолжается.",
  },
  debtDemand: {
    id: "debt-demand",
    category: "Взыскание долга · досудебная работа",
    title: "Претензия и расчёт по долгу, оформленному договором или распиской",
    situation: "Клиент поручил подготовить досудебное требование о возврате долга, подтверждённого договором или распиской.",
    materials: "Договор или расписка, сведения для расчёта процентов и документы, подтверждающие сумму долга.",
    work: "Подготовлены досудебная претензия, расчёт процентов и комплект приложений для направления должнику.",
    next: "Претензия и расчёт подготовлены. Сведений об отправке документа должнику и возврате денег пока нет.",
    detailPath: "/praktika/pretenziya-i-raschet-po-dolgu-po-raspiske/",
  },
  policeReview: {
    id: "police-review",
    category: "Жалоба на отказ полиции",
    title: "Отмена отказов и дополнительная проверка по факту причинения вреда",
    situation: "После заявления о причинении травмы полиция завершала проверки отказами, несмотря на медицинские документы и доводы заявителя.",
    materials: "Постановления об отказе, ответы прокуратуры, медицинские документы, результаты экспертизы, обращения и подтверждения их направления.",
    work: "Подготовлены жалобы в прокуратуру с указанием неполноты проверки, доказательств, которым не дали оценки, и необходимых проверочных действий.",
    next: "Прокуратура отменяла постановления об отказе и возвращала материал на дополнительную проверку. Окончательное процессуальное решение ещё не принято.",
    detailPath: "/praktika/otmena-otkazov-policii-i-dopolnitelnaya-proverka/",
  },
  land: {
    id: "land",
    category: "Защита по иску",
    title: "Требование освободить участок без точного определения границ",
    situation: "Муниципальный орган потребовал плату и освобождение территории, указав площадь приблизительно и не представив точную схему участка.",
    materials: "Иск, расчёт, сведения о спорной территории, разные данные о её площади и документы, приложенные истцом.",
    work: "Подготовлены возражения и ходатайство об истребовании схемы, замеров, методики расчёта и доказательств границ.",
    next: "Суду предложено проверить, подтверждены ли площадь, расчёт и границы спорной территории. Рассмотрение дела продолжается.",
  },
};

export const pageCaseIds = {
  "/": ["autoclub", "debtDemand", "policeReview"],
  "/uslugi/dosudebnoe-uregulirovanie": ["autoclub", "debtDemand"],
  "/uslugi/vzyskanie-dolga": ["debtDemand"],
  "/uslugi/vozvrat-deneg": ["autoclub"],
  "/uslugi/zhaloby-i-obrashcheniya": ["policeReview"],
  "/uslugi/iskovoe-zayavlenie": ["debtDemand", "autoclub", "land"],
};

const pageTopics = {
  "/": "похожая юридическая ситуация",
  "/uslugi/dosudebnoe-uregulirovanie": "досудебное урегулирование похожего спора",
  "/uslugi/vzyskanie-dolga": "взыскание долга по расписке, договору или переписке",
  "/uslugi/vozvrat-deneg": "возврат денег в похожей ситуации",
  "/uslugi/zhaloby-i-obrashcheniya": "жалоба на отказ или бездействие государственного органа",
  "/uslugi/iskovoe-zayavlenie": "подготовка позиции для суда в похожей ситуации",
};

const caseCard = (item) => `
        <article class="case-study reveal" id="case-${escapeHtml(item.id)}">
          <span class="case-study__category">${escapeHtml(item.category)}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <dl class="case-study__details">
            <div><dt>Ситуация</dt><dd>${escapeHtml(item.situation)}</dd></div>
            <div><dt>Изучено</dt><dd>${escapeHtml(item.materials)}</dd></div>
            <div><dt>Подготовлено</dt><dd>${escapeHtml(item.work)}</dd></div>
            <div><dt>Текущий статус</dt><dd>${escapeHtml(item.next)}</dd></div>
          </dl>
          ${item.detailPath ? `<a class="card-link case-study__link" href="${escapeHtml(item.detailPath)}">Открыть полный кейс</a>` : ""}
        </article>`;

export const caseStudiesBlock = (ids, pathname) => {
  const items = ids.map((id) => caseStudies[id]).filter(Boolean);
  const countClass = items.length === 1 ? " case-studies__grid--single" : items.length === 2 ? " case-studies__grid--double" : "";
  const topic = pageTopics[pathname] || "похожая юридическая ситуация";
  return `
  <div class="section section--case-studies" role="region" aria-labelledby="case-studies-title">
    <div class="wrap">
      <div class="case-studies__head reveal">
        <div>
          <span class="eyebrow">Реальные примеры работы</span>
          <div class="case-studies__title" id="case-studies-title" role="heading" aria-level="2">Что было сделано и чем всё подтверждается</div>
        </div>
        <p>Кейсы обезличены. В них указаны подтверждённые обстоятельства, подготовленные документы и текущий статус.</p>
      </div>
      <div class="case-studies__grid${countClass}">
        ${items.map(caseCard).join("")}
      </div>
      <div class="case-studies__footer reveal">
        <p>Описание отражает работу по конкретным обстоятельствам и не означает гарантии аналогичного результата в другом деле.</p>
        <button class="button button--secondary" type="button" data-dialog-open data-topic="${escapeHtml(topic)}">Обсудить похожую ситуацию</button>
      </div>
    </div>
  </div>`;
};

const insertAfterRequired = (html, pattern, insertion, label) => {
  const match = html.match(pattern);
  if (!match) throw new Error(`Не найдено место для примеров работы: ${label}`);
  return html.replace(match[0], `${match[0]}${insertion}`);
};

const insertBeforeRequired = (html, marker, insertion, label) => {
  if (!html.includes(marker)) throw new Error(`Не найдено место для примеров работы: ${label}`);
  return html.replace(marker, `${insertion}${marker}`);
};

export const injectCaseStudies = (html, pathname) => {
  const ids = pageCaseIds[pathname];
  if (!ids?.length) return html;
  if (html.includes('class="section section--case-studies"')) {
    throw new Error(`Блок примеров работы уже присутствует: ${pathname}`);
  }

  const block = caseStudiesBlock(ids, pathname);
  if (pathname === "/") {
    return insertAfterRequired(
      html,
      /<section class="section section--prices"[\s\S]*?<\/section>/,
      block,
      "после блока стоимости на главной",
    );
  }
  return insertBeforeRequired(
    html,
    '<section class="section section--consultation">',
    block,
    `перед блоком о персональной работе: ${pathname}`,
  );
};
