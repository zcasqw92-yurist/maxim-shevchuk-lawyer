const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

export const caseStudies = {
  autoclub: {
    id: "autoclub",
    category: "Возврат денег · иск",
    title: "Навязанная услуга при автокредите — 80 000 ₽",
    situation: "После покупки автомобиля клиент отказался от дополнительного сертификата, но деньги в установленный срок полностью не вернули.",
    materials: "Договор и сертификат, заявление об отказе, кредитные и платёжные документы, переписка и подтверждения направления требований.",
    work: "Подготовлены жалоба в Роспотребнадзор и иск с расчётом процентов, компенсации морального вреда и предусмотренного законом штрафа.",
    next: "После перечисления части суммы определён порядок уточнения оставшихся требований и дальнейшего рассмотрения дела судом.",
  },
  engine: {
    id: "engine",
    category: "Заявление в полицию",
    title: "Оплата контрактного двигателя — 650 000 ₽",
    situation: "Деньги были переданы наличными без расписки, обязательство не исполнено, а продавец уехал из России.",
    materials: "Переписка, сведения о продавце, видеозапись двигателя, свидетели передачи денег, платежи за доставку и данные объявления на Авито.",
    work: "Подготовлено заявление в полицию с последовательной хронологией, перечнем доказательств и конкретными просьбами к проверке.",
    next: "Клиент получил инструкцию по регистрации заявления, контролю КУСП и обжалованию волокиты либо формального отказа.",
  },
  land: {
    id: "land",
    category: "Судебный спор",
    title: "Требование освободить муниципальный участок без точного замера",
    situation: "Муниципалитет потребовал плату за использование земли и освобождение территории, указав площадь приблизительно — без точной схемы и измерений.",
    materials: "Иск, расчёт заявленной суммы, сведения о спорной территории и ранее фигурировавшие данные о её площади.",
    work: "Подготовлены возражения и ходатайство об истребовании схемы, замеров, методики расчёта и документов, подтверждающих границы участка.",
    next: "В суде поставлен вопрос о доказанности площади, размера требований и самого предмета обязанности освободить территорию.",
  },
};

const pageCaseIds = {
  "/": ["autoclub", "engine", "land"],
  "/uslugi/dosudebnoe-uregulirovanie": ["autoclub"],
  "/uslugi/vozvrat-deneg": ["autoclub"],
  "/uslugi/zhaloby-i-obrashcheniya": ["engine"],
  "/uslugi/iskovoe-zayavlenie": ["autoclub", "land"],
};

const pageTopics = {
  "/": "похожая юридическая ситуация",
  "/uslugi/dosudebnoe-uregulirovanie": "досудебное урегулирование похожего спора",
  "/uslugi/vozvrat-deneg": "возврат денег в похожей ситуации",
  "/uslugi/zhaloby-i-obrashcheniya": "заявление или жалоба по похожей ситуации",
  "/uslugi/iskovoe-zayavlenie": "подготовка позиции для суда в похожей ситуации",
};

const caseCard = (item) => `
        <article class="case-study reveal" data-case-study-id="${escapeHtml(item.id)}">
          <span class="case-study__category">${escapeHtml(item.category)}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <dl class="case-study__details">
            <div><dt>Ситуация</dt><dd>${escapeHtml(item.situation)}</dd></div>
            <div><dt>Изучено</dt><dd>${escapeHtml(item.materials)}</dd></div>
            <div><dt>Подготовлено</dt><dd>${escapeHtml(item.work)}</dd></div>
            <div><dt>Следующий шаг</dt><dd>${escapeHtml(item.next)}</dd></div>
          </dl>
        </article>`;

export const caseStudiesBlock = (ids, pathname) => {
  const items = ids.map((id) => caseStudies[id]).filter(Boolean);
  const countClass = items.length === 1 ? " case-studies__grid--single" : items.length === 2 ? " case-studies__grid--double" : "";
  const topic = pageTopics[pathname] || "похожая юридическая ситуация";
  return `
  <section class="section section--case-studies" aria-labelledby="case-studies-title">
    <div class="wrap">
      <div class="case-studies__head reveal">
        <div>
          <span class="eyebrow">Примеры работы</span>
          <h2 id="case-studies-title">От фактов и документов — к конкретному следующему шагу</h2>
        </div>
        <p>Обезличенные примеры показывают, какие материалы были изучены, что подготовлено и как выстроен дальнейший порядок действий.</p>
      </div>
      <div class="case-studies__grid${countClass}" data-case-study-count="${items.length}">
        ${items.map(caseCard).join("")}
      </div>
      <div class="case-studies__footer reveal">
        <p>Описание отражает выполненную работу по конкретным обстоятельствам и не означает гарантии аналогичного результата в другом деле.</p>
        <button class="button button--secondary" type="button" data-dialog-open data-topic="${escapeHtml(topic)}">Обсудить похожую ситуацию</button>
      </div>
    </div>
  </section>`;
};

const insertAfterRequired = (html, pattern, insertion, label) => {
  const match = html.match(pattern);
  if (!match) throw new Error(`Не найдено место для примеров работы: ${label}`);
  return html.replace(match[0], `${match[0]}${insertion}`);
};

export const injectCaseStudies = (html, pathname) => {
  const ids = pageCaseIds[pathname];
  if (!ids?.length) return html;
  if (html.includes('class="section section--case-studies"')) {
    throw new Error(`Блок примеров работы уже присутствует: ${pathname}`);
  }

  const block = caseStudiesBlock(ids, pathname);
  if (pathname === "/") {
    return insertAfterRequired(html, /<section class="section section--services">[\s\S]*?<\/section>/, block, "главная страница");
  }
  return insertAfterRequired(html, /<section class="section section--process">[\s\S]*?<\/section>/, block, `страница услуги ${pathname}`);
};
