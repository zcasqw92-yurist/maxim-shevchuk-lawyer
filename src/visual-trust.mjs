import { site } from "../site.config.mjs";
import { caseStudies } from "./case-studies.mjs";

const base = site.basePath || "";
const asset = (name) => `${base}/assets/images/${name}`;

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const icon = (name, className = "icon") => {
  const paths = {
    play: '<path d="m9 7 8 5-8 5V7Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    file: '<path d="M6 3h9l3 3v15H6V3Z"/><path d="M9 10h6M9 14h6M9 18h4"/>',
    shield: '<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  };
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.file}</svg>`;
};

const replaceRequired = (html, pattern, replacement, label) => {
  if (!pattern.test(html)) throw new Error(`Не найден блок для визуальной архитектуры: ${label}`);
  return html.replace(pattern, replacement);
};

const insertAfterRequired = (html, pattern, insertion, label) => {
  const match = html.match(pattern);
  if (!match) throw new Error(`Не найдено место для визуальной архитектуры: ${label}`);
  return html.replace(match[0], `${match[0]}${insertion}`);
};

const videoHero = () => `
        <div class="hero__visual hero-video proof-reveal">
          <button class="hero-video__poster" type="button" data-video-placeholder aria-haspopup="dialog" aria-controls="video-placeholder-dialog">
            <picture>
              <source media="(max-width: 680px)" srcset="${asset("maxim-hero.webp")}">
              <img src="${asset("maxim-hero.webp")}" width="1536" height="1024" alt="Максим Юрьевич Шевчук в рабочем кабинете — постер будущего видео" fetchpriority="high" decoding="async">
            </picture>
            <span class="hero-video__shade" aria-hidden="true"></span>
            <span class="hero-video__play">${icon("play")}<span class="sr-only">Открыть информацию о будущем видео</span></span>
            <span class="hero-video__copy"><small>Личное обращение · 45 секунд</small><strong>Не знаете, с чего начать?<br>Объясню простыми словами</strong><em>Видео готовится</em></span>
          </button>
          <div class="identity-card identity-card--video">
            <span>Юрист</span>
            <strong>Максим Юрьевич<br>Шевчук</strong>
            <small>Отвечает лично · Москва и дистанционно</small>
          </div>
        </div>`;

const trustStrip = () => `
    <section class="trust-strip" aria-label="Условия начала работы">
      <div class="wrap trust-strip__grid">
        ${[
          ["01", "Первично бесплатно", "Знакомлюсь с ситуацией и основными материалами"],
          ["02", "Цена и срок заранее", "Условия фиксируются до начала подготовки"],
          ["03", "Работаю лично", "Без операторов и передачи обращения третьим лицам"],
          ["04", "После документа на связи", "Поясняю ответ, отказ или дальнейший шаг"],
        ].map(([number, title, text]) => `<article class="trust-strip__item proof-reveal"><span>${number}</span><div><strong>${title}</strong><small>${text}</small></div></article>`).join("")}
      </div>
    </section>`;

const documentSamples = [
  {
    id: "pretenziya",
    eyebrow: "Досудебная работа",
    title: "Досудебная претензия",
    text: "Хронология, расчёт требований, срок исполнения и последствия отказа.",
    image: "document-pretenziya-demo.svg",
    alt: "Демонстрационный макет досудебной претензии с отмеченными фактами, правовым основанием и требованиями",
    topic: "подготовка досудебной претензии",
    points: ["Факты и документы", "Правовое основание", "Требования и срок"],
  },
  {
    id: "police",
    eyebrow: "Обращение в орган",
    title: "Заявление в полицию",
    text: "Последовательная хронология, признаки нарушения, доказательства и просьбы к проверке.",
    image: "document-police-demo.svg",
    alt: "Демонстрационный макет заявления в полицию с хронологией, доказательствами и просьбами к проверке",
    topic: "подготовка заявления в полицию",
    points: ["Хронология события", "Перечень доказательств", "Конкретные просьбы"],
  },
  {
    id: "claim",
    eyebrow: "Судебная работа",
    title: "Исковое заявление",
    text: "Позиция, требования, расчёт, подсудность и полный перечень приложений.",
    image: "document-claim-demo.svg",
    alt: "Демонстрационный макет искового заявления с требованиями, расчётом и приложениями",
    topic: "составление искового заявления",
    points: ["Связь фактов и доказательств", "Расчёт требований", "Приложения и подача"],
  },
];

const documentSamplesBlock = () => `
    <section class="section section--document-samples" aria-labelledby="document-samples-title">
      <div class="wrap">
        <div class="document-samples__head proof-reveal">
          <div><span class="eyebrow">Примеры результата</span><h2 id="document-samples-title">Посмотрите, как выглядит подготовленная работа</h2></div>
          <p>Пока используются демонстрационные обезличенные макеты. Они показывают место и формат будущих реальных фрагментов документов.</p>
        </div>
        <div class="document-samples__rail" aria-label="Демонстрационные образцы документов">
          ${documentSamples.map((item) => `
          <article class="document-sample proof-reveal">
            <button class="document-sample__visual" type="button" data-proof-open="${item.id}" aria-haspopup="dialog" aria-controls="proof-${item.id}">
              <img src="${asset(item.image)}" width="900" height="1200" loading="lazy" decoding="async" alt="${escapeHtml(item.alt)}">
              <span>Демо-макет · заменить реальным фрагментом</span>
            </button>
            <div class="document-sample__copy">
              <small>${escapeHtml(item.eyebrow)}</small>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.text)}</p>
              <ul>${item.points.map((point) => `<li>${icon("check")}<span>${escapeHtml(point)}</span></li>`).join("")}</ul>
              <button class="text-link" type="button" data-proof-open="${item.id}">Посмотреть фрагмент ${icon("arrow")}</button>
            </div>
          </article>`).join("")}
        </div>
      </div>
    </section>`;

const proofDialogs = () => documentSamples.map((item) => `
  <dialog class="proof-dialog" id="proof-${item.id}" data-proof-dialog="${item.id}" aria-labelledby="proof-${item.id}-title">
    <button class="proof-dialog__close" type="button" data-proof-close aria-label="Закрыть">${icon("close")}</button>
    <div class="proof-dialog__grid">
      <figure><img src="${asset(item.image)}" width="900" height="1200" loading="lazy" decoding="async" alt="${escapeHtml(item.alt)}"><figcaption>Демонстрационный макет. Перед публикацией настоящего примера персональные данные необходимо скрыть.</figcaption></figure>
      <div class="proof-dialog__copy">
        <span class="eyebrow">Структура документа</span>
        <h2 id="proof-${item.id}-title">${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.text)}</p>
        <ul class="plain-checks">${item.points.map((point) => `<li>${icon("check")}<span>${escapeHtml(point)}</span></li>`).join("")}</ul>
        <button class="button button--primary" type="button" data-dialog-open data-topic="${escapeHtml(item.topic)}">Обсудить похожую задачу${icon("arrow", "button__icon")}</button>
      </div>
    </div>
  </dialog>`).join("");

const featuredCase = () => {
  const item = caseStudies.autoclub;
  return `
    <section class="section section--featured-case" aria-labelledby="featured-case-title">
      <div class="wrap featured-case">
        <figure class="featured-case__visual proof-reveal">
          <img src="${asset("case-autoclub-demo.svg")}" width="1200" height="900" loading="lazy" decoding="async" alt="Демонстрационный визуал кейса о навязанной услуге при автокредите: документы, требования и текущий статус">
          <figcaption>Демо-визуал · заменить обезличенным фрагментом материалов и подготовленного документа</figcaption>
        </figure>
        <div class="featured-case__copy proof-reveal">
          <span class="eyebrow">Как строится работа</span>
          <h2 id="featured-case-title">${escapeHtml(item.title)}</h2>
          <p class="featured-case__lead">${escapeHtml(item.situation)}</p>
          <dl>
            <div><dt>Изучено</dt><dd>${escapeHtml(item.materials)}</dd></div>
            <div><dt>Подготовлено</dt><dd>${escapeHtml(item.work)}</dd></div>
            <div><dt>Текущий статус</dt><dd>${escapeHtml(item.next)}</dd></div>
          </dl>
          <p class="featured-case__notice">Пример показывает объём выполненной работы и не является обещанием аналогичного результата.</p>
          <button class="button button--secondary" type="button" data-dialog-open data-topic="возврат денег по навязанной услуге">Обсудить похожую ситуацию</button>
        </div>
      </div>
    </section>`;
};

const secondaryCases = () => {
  const items = [
    { ...caseStudies.engine, image: "case-engine-demo.svg", alt: "Демонстрационная карта доказательств по заявлению о передаче денег за контрактный двигатель" },
    { ...caseStudies.land, image: "case-land-demo.svg", alt: "Демонстрационная схема земельного спора без точного замера участка" },
  ];
  return `
    <section class="section section--visual-cases" aria-labelledby="visual-cases-title">
      <div class="wrap">
        <div class="visual-cases__head proof-reveal"><div><span class="eyebrow">Другие примеры работы</span><h2 id="visual-cases-title">Доказательства и задача определяют структуру позиции</h2></div><p>Для каждого дела предусмотрен свой заменяемый визуал: документ, схема или карта доказательств.</p></div>
        <div class="visual-cases__grid">
          ${items.map((item) => `<article class="visual-case proof-reveal"><figure><img src="${asset(item.image)}" width="1200" height="900" loading="lazy" decoding="async" alt="${escapeHtml(item.alt)}"><figcaption>Демо-визуал · место для реального обезличенного подтверждения</figcaption></figure><div><span>${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.situation)}</p><details><summary>Что было изучено и подготовлено</summary><dl><div><dt>Изучено</dt><dd>${escapeHtml(item.materials)}</dd></div><div><dt>Подготовлено</dt><dd>${escapeHtml(item.work)}</dd></div><div><dt>Следующий шаг</dt><dd>${escapeHtml(item.next)}</dd></div></dl></details></div></article>`).join("")}
        </div>
      </div>
    </section>`;
};

const valueBlock = () => `
    <section class="section section--value section--value-editorial">
      <div class="wrap value-editorial">
        <div class="value-editorial__intro proof-reveal"><span class="eyebrow">Результат работы</span><h2>Не просто консультация, а понятная опора для действия</h2><p>До начала платной работы становится понятно, что именно нужно сделать, а после подготовки — как пользоваться результатом.</p></div>
        <ol class="value-editorial__list">
          ${[
            ["01", "Правовая позиция", "Какие факты имеют значение, чем они подтверждаются и на чём можно строить требования."],
            ["02", "Готовый результат", "Документ, расчёт или последовательность действий под конкретные обстоятельства."],
            ["03", "Инструкция", "Куда и как направить материалы, какие сроки контролировать и что сохранить."],
            ["04", "Поддержка после ответа", "Можно показать отказ, отписку или новое требование и уточнить дальнейший шаг."],
          ].map(([number, title, text]) => `<li class="proof-reveal"><span>${number}</span><div><h3>${title}</h3><p>${text}</p></div></li>`).join("")}
        </ol>
      </div>
    </section>`;

const diplomaProof = () => `
            <a class="about-proof" href="${base}/o-yuriste/#education" aria-label="Подробнее об образовании Максима Юрьевича Шевчука">
              <img src="${asset("diploma-demo.svg")}" width="640" height="420" loading="lazy" decoding="async" alt="Демонстрационная миниатюра блока диплома — заменить подготовленной веб-копией">
              <span><small>Подтверждение образования</small><strong>Российский государственный университет правосудия</strong><em>Диплом 2010 года · открыть сведения</em></span>
            </a>`;

const finalCta = () => `
    <section class="section section--cta section--cta-portrait">
      <div class="wrap cta-portrait proof-reveal">
        <img src="${asset("maxim-portrait.webp")}" width="900" height="900" loading="lazy" decoding="async" alt="Максим Юрьевич Шевчук">
        <div><span class="eyebrow eyebrow--light">Первичный шаг бесплатный</span><h2>Не нужно самостоятельно выбирать претензию, жалобу или иск</h2><p>Коротко опишите, что произошло, и перечислите документы. Первично ознакомлюсь с материалами, отвечу на основные вопросы и предложу понятный следующий шаг.</p></div>
        <button class="button button--gold" type="button" data-dialog-open>Передать ситуацию юристу${icon("arrow", "button__icon")}</button>
      </div>
    </section>`;

const videoDialog = () => `
  <dialog class="video-placeholder-dialog" id="video-placeholder-dialog" aria-labelledby="video-placeholder-title">
    <button class="proof-dialog__close" type="button" data-video-placeholder-close aria-label="Закрыть">${icon("close")}</button>
    <img src="${asset("maxim-hero.webp")}" width="1536" height="1024" loading="lazy" decoding="async" alt="Максим Юрьевич Шевчук в рабочем кабинете">
    <div><span class="eyebrow">Видео готовится</span><h2 id="video-placeholder-title">Здесь будет короткое личное объяснение</h2><p>В ролике Максим Юрьевич объяснит, что не нужно самостоятельно определять название документа: достаточно передать ситуацию и основные материалы.</p><button class="button button--primary" type="button" data-video-contact data-dialog-open data-topic="первичное знакомство с ситуацией">Пока описать ситуацию${icon("arrow", "button__icon")}</button></div>
  </dialog>`;

const staticOffice = () => `
    <section class="footer__map footer__map--static" aria-labelledby="office-map-title"><div class="wrap footer__map-static"><div><span class="footer__title">Офис в Химках</span><h2 id="office-map-title">Химки, улица Горшина, 2</h2><p>Личный приём — ${escapeHtml(site.publicOffice.openingHoursLabel)}, по предварительной записи. Дистанционная работа возможна по России.</p></div><a class="footer-map-card" href="${escapeHtml(site.publicOffice.mapUrl)}" target="_blank" rel="noopener" data-track="map">${icon("pin")}<span><small>Яндекс Карты</small><strong>Открыть адрес и построить маршрут</strong><em>Карта не загружается до перехода</em></span>${icon("arrow")}</a></div></section>`;

const interactiveOffice = () => `
    <section class="footer__map footer__map--interactive" aria-labelledby="office-map-title"><div class="wrap footer__map-grid"><div><span class="footer__title">Офис в Химках</span><h2 id="office-map-title">Химки, улица Горшина, 2</h2><p>Личный приём — ${escapeHtml(site.publicOffice.openingHoursLabel)}, по предварительной записи. Для согласования времени напишите Максиму Юрьевичу.</p><a class="text-link" href="${escapeHtml(site.publicOffice.mapUrl)}" target="_blank" rel="noopener" data-track="map">Построить маршрут ${icon("arrow")}</a></div><button class="map-poster" type="button" data-map-load aria-label="Загрузить интерактивную карту офиса">${icon("pin")}<span><small>Интерактивная карта не загружена</small><strong>Показать офис на карте</strong><em>Загрузится только после нажатия</em></span></button></div></section>`;

const injectGlobalAssets = (html) => html
  .replace('</head>', `  <script type="module" src="${base}/assets/visual-trust.js"></script>\n</head>`)
  .replace('</body>', `${videoDialog()}\n${proofDialogs()}\n</body>`);

const injectFooterMap = (html, pathname) => {
  if (!site.publicOffice?.enabled) return html;
  const pattern = /\s*<section class="footer__map"[\s\S]*?<\/section>/;
  if (!pattern.test(html)) return html;
  return html.replace(pattern, pathname === "/kontakty" ? interactiveOffice() : staticOffice());
};

const injectHomeArchitecture = (html) => {
  let result = html;
  result = replaceRequired(result, /\s*<div class="hero__visual">[\s\S]*?<div class="identity-card">[\s\S]*?<\/div>\s*<\/div>/, videoHero(), "видеопостер первого экрана");
  result = insertAfterRequired(result, /<section class="hero">[\s\S]*?<\/section>/, trustStrip(), "полоса доверия");

  const guarantees = result.match(/\s*<section class="section section--process-guarantees"[\s\S]*?<\/section>/)?.[0] || "";
  if (!guarantees) throw new Error("Не найден блок гарантий для переноса к стоимости");
  result = result.replace(guarantees, "");

  result = insertAfterRequired(result, /<section class="contact-path[^\"]*"[\s\S]*?<\/section>/, documentSamplesBlock(), "образцы документов");

  const oldCases = result.match(/\s*<section class="section section--case-studies"[\s\S]*?<\/section>/)?.[0] || "";
  if (!oldCases) throw new Error("Не найден исходный блок кейсов");
  result = result.replace(oldCases, "");
  result = insertAfterRequired(result, /<section class="section section--situations">[\s\S]*?<\/section>/, featuredCase(), "главный кейс");
  result = insertAfterRequired(result, /<section class="section section--services">[\s\S]*?<\/section>/, secondaryCases(), "дополнительные кейсы");

  result = replaceRequired(result, /\s*<section class="section section--value">[\s\S]*?<\/section>/, valueBlock(), "результат работы");
  result = insertAfterRequired(result, /<section class="section section--prices"[^>]*>[\s\S]*?<\/section>/, guarantees, "гарантии после стоимости");

  const aboutButton = `<a class="button button--secondary" href="${base}/o-yuriste/"`;
  if (result.includes(aboutButton)) result = result.replace(aboutButton, `${diplomaProof()}\n            ${aboutButton}`);
  else throw new Error("Не найдено место для подтверждения образования");

  result = replaceRequired(result, /\s*<section class="section section--cta">[\s\S]*?<\/section>/, finalCta(), "финальный призыв");
  return result;
};

export const injectVisualTrust = (html, pathname) => {
  let result = injectFooterMap(html, pathname);
  if (pathname === "/") result = injectHomeArchitecture(result);
  return injectGlobalAssets(result);
};
