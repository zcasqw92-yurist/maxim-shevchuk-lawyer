import { buildSlot, fillBuildSlot } from "./html-slots.mjs";

const guaranteeItems = [
  {
    title: "Первое ознакомление бесплатно",
    text: "Посмотрю основные материалы, отвечу на первые вопросы и объясню, с чего лучше начать.",
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

const redundantCatalogCtaPattern = /\s*<section class="section section--cta">[\s\S]*?<h2>Начнём с правильной квалификации<\/h2>[\s\S]*?<\/section>/;

const removeRedundantCatalogCta = (html, pathname) => {
  if (!redundantCatalogCtaPattern.test(html)) {
    throw new Error(`Не найден дублирующий финальный CTA каталога услуг: ${pathname}`);
  }
  return html.replace(redundantCatalogCtaPattern, "");
};

export const processGuaranteesBlock = () => `
  <section class="section section--process-guarantees" aria-labelledby="process-guarantees-title">
    <div class="wrap">
      <div class="process-guarantees__head reveal">
        <div>
          <span class="eyebrow">Условия работы</span>
          <h2 id="process-guarantees-title">Стоимость и срок известны заранее</h2>
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
      <p class="process-guarantees__note">Это условия моей работы, а не обещание решения суда, государственного органа или другой стороны.</p>
    </div>
  </section>`;

const arrangeServicesPage = (html, block, pathname) => {
  const guaranteesSlot = buildSlot("services-guarantees");
  const guideSlot = buildSlot("services-guide");
  const temporaryGuideSlot = "<!-- build-slot:services-guide-reordered -->";

  if (!html.includes(guaranteesSlot) || !html.includes(guideSlot)) {
    throw new Error(`Не найдены слоты смысловой последовательности каталога услуг: ${pathname}`);
  }

  let result = html
    .replace(guaranteesSlot, temporaryGuideSlot)
    .replace(guideSlot, block)
    .replace(temporaryGuideSlot, guideSlot);

  const guideIndex = result.indexOf(guideSlot);
  const servicesIndex = result.indexOf('<section class="section section--services">');
  const guaranteesIndex = result.indexOf('class="section section--process-guarantees"');
  const pricesIndex = result.indexOf('class="section section--prices"');

  if (!(guideIndex >= 0 && guideIndex < servicesIndex && servicesIndex < guaranteesIndex && guaranteesIndex < pricesIndex)) {
    throw new Error(`Нарушена смысловая последовательность каталога услуг: ${pathname}`);
  }

  return result;
};

export const injectProcessGuarantees = (html, pathname) => {
  // На главной эти условия уже кратко представлены в полосе доверия.
  if (pathname === "/") return html;

  if (html.includes('class="section section--process-guarantees"')) {
    throw new Error(`Блок гарантий уже присутствует: ${pathname}`);
  }

  const block = processGuaranteesBlock();
  if (pathname === "/uslugi") {
    const arranged = arrangeServicesPage(html, block, pathname);
    return removeRedundantCatalogCta(arranged, pathname);
  }
  if (/^\/uslugi\/[^/]+$/.test(pathname)) {
    return fillBuildSlot(html, "service-guarantees", block);
  }
  return html;
};
