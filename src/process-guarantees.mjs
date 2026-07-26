import { fillBuildSlot } from "./html-slots.mjs";

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

export const injectProcessGuarantees = (html, pathname) => {
  // На главной эти условия уже кратко представлены в полосе доверия.
  if (pathname === "/") return html;

  if (html.includes('class="section section--process-guarantees"')) {
    throw new Error(`Блок гарантий уже присутствует: ${pathname}`);
  }

  const block = processGuaranteesBlock();
  if (pathname === "/uslugi") {
    return fillBuildSlot(html, "services-guarantees", block);
  }
  if (/^\/uslugi\/[^/]+$/.test(pathname)) {
    return fillBuildSlot(html, "service-guarantees", block);
  }
  return html;
};
