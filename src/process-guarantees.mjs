const guaranteeItems = [
  {
    title: "Первично — бесплатно",
    text: "Ознакомлюсь с ситуацией и основными материалами, отвечу на ключевые вопросы и объясню, с чего разумнее начать.",
  },
  {
    title: "Цена фиксируется заранее",
    text: "До начала работы согласуем состав услуги и точную стоимость. После согласования цена не увеличивается.",
  },
  {
    title: "Срок известен до оплаты",
    text: "До начала подготовки сообщу, когда будет готов документ или иной согласованный результат работы.",
  },
  {
    title: "После документа — на связи",
    text: "Поясню содержание, помогу оценить ответ, отказ или молчание и подскажу следующий практический шаг.",
  },
];

export const processGuaranteesBlock = () => `
  <section class="section section--process-guarantees" aria-labelledby="process-guarantees-title">
    <div class="wrap">
      <div class="process-guarantees__head reveal">
        <div>
          <span class="eyebrow">Гарантии процесса</span>
          <h2 id="process-guarantees-title">Условия понятны до начала подготовки</h2>
        </div>
        <p>Вы заранее понимаете порядок работы, стоимость и срок. После передачи документа общение не прекращается.</p>
      </div>
      <ol class="process-guarantees__grid">
        ${guaranteeItems.map((item, index) => `
          <li class="process-guarantee reveal" style="--delay:${index * 45}ms">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <h3>${item.title}</h3>
            <p>${item.text}</p>
          </li>`).join("")}
      </ol>
      <p class="process-guarantees__note">Это гарантии порядка работы, а не обещание конкретного решения суда, государственного органа или другой стороны.</p>
    </div>
  </section>`;

const insertAfterRequired = (html, pattern, insertion, label) => {
  const match = html.match(pattern);
  if (!match) throw new Error(`Не найдено место для блока гарантий: ${label}`);
  return html.replace(match[0], `${match[0]}${insertion}`);
};

const insertBeforeRequired = (html, marker, insertion, label) => {
  if (!html.includes(marker)) throw new Error(`Не найдено место для блока гарантий: ${label}`);
  return html.replace(marker, `${insertion}${marker}`);
};

export const injectProcessGuarantees = (html, pathname) => {
  if (html.includes('class="section section--process-guarantees"')) {
    throw new Error(`Блок гарантий уже присутствует: ${pathname}`);
  }

  const block = processGuaranteesBlock();
  if (pathname === "/") {
    return insertAfterRequired(html, /<section class="contact-path[^"]*"[\s\S]*?<\/section>/, block, "главная страница");
  }
  if (pathname === "/uslugi") {
    return insertBeforeRequired(html, '<section class="section section--services">', block, "страница услуг");
  }
  if (/^\/uslugi\/[^/]+$/.test(pathname)) {
    return insertAfterRequired(html, /<section class="contact-path[^"]*"[\s\S]*?<\/section>/, block, `страница услуги ${pathname}`);
  }
  return html;
};
