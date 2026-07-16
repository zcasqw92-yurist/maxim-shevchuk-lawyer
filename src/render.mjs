import { site } from "../site.config.mjs";
import { districts, faqs, services } from "./data.mjs";

const esc = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const canonicalPath = (pathname) => (pathname === "/" ? "/" : `${pathname}/`);
const withBasePath = (html) => site.basePath
  ? html.replace(/(\b(?:href|src|action)=["'])\/(?!\/)/g, `$1${site.basePath}/`)
  : html;

const siteRoot = `${site.siteUrl.replace(/\/$/, "")}/`;
const entityUrl = (fragment) => `${siteRoot}${fragment}`;
const hasPublicEmail = () => Boolean(site.email && !site.email.endsWith("@example.ru"));
const hasPublicOffice = () => Boolean(site.publicOffice?.enabled && site.publicOffice.streetAddress);
const lastModifiedLabel = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${site.contentLastModified}T12:00:00Z`));

const icon = (name, className = "icon") => {
  const paths = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    dialog: '<path d="M5 6h14v9H9l-4 4V6Z"/><path d="M8 10h8M8 13h5"/>',
    return: '<path d="M9 7H5v-4"/><path d="M5 7a8 8 0 1 1-1 9"/><path d="M9 12h6"/>',
    document: '<path d="M7 3h7l4 4v14H7V3Z"/><path d="M14 3v5h5M10 12h5M10 16h5"/>',
    file: '<path d="M6 3h9l3 3v15H6V3Z"/><path d="M9 10h6M9 14h6M9 18h4"/>',
    briefcase: '<path d="M4 8h16v11H4V8Z"/><path d="M9 8V5h6v3M4 13h16M10 13v2h4v-2"/>',
    grid: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
    shield: '<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/>',
    eye: '<path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    phone: '<path d="M7 3 4 5c-1 8 7 16 15 15l2-3-5-3-2 2c-3-1-5-3-6-6l2-2-3-5Z"/>',
    whatsapp: '<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"/><path d="M9 8.5c.2 2 2 4.2 4.2 4.5l1.1-1.1 1.7.8c-.6 1.3-1.8 1.8-3 1.4-2.8-.9-4.9-3.1-5.6-5.8-.3-1.2.3-2.4 1.5-2.9l.8 1.8Z"/>',
    telegram: '<path d="m21 4-7.1 16-3.6-6-6.3-2.7L21 4Z"/><path d="m10.3 14 2.2-2.1"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    education: '<path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M7 12v5c3 2 7 2 10 0v-5M21 9v7"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  };
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.file}</svg>`;
};

const button = (label, href = "#contact-dialog", variant = "primary", attrs = "") =>
  `<a class="button button--${variant}" href="${href}" ${attrs}>${esc(label)}${variant !== "quiet" ? icon("arrow", "button__icon") : ""}</a>`;

const breadcrumbSchema = (items) => ({
  "@type": "BreadcrumbList",
  "@id": `${site.siteUrl}${items.at(-1).path}#breadcrumb`,
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: `${site.siteUrl}${item.path}`,
  })),
});

const breadcrumbs = (items) => `
  <nav class="breadcrumbs wrap" aria-label="Хлебные крошки">
    <ol>
      ${items
        .map((item, index) => `<li>${index === items.length - 1 ? `<span aria-current="page">${esc(item.name)}</span>` : `<a href="${item.path}">${esc(item.name)}</a>`}</li>`)
        .join("")}
    </ol>
  </nav>`;

const navItems = [
  ["Услуги", "/uslugi/"],
  ["О юристе", "/o-yuriste/"],
  ["Районы Москвы", "/rayony-moskvy/"],
  ["Контакты", "/kontakty/"],
];

const header = (pathname) => `
  <a class="skip-link" href="#main">Перейти к содержанию</a>
  <header class="site-header" data-header>
    <div class="wrap header__inner">
      <a class="brand" href="/" aria-label="Максим Шевчук — главная">
        <span class="brand__mark" aria-hidden="true">МШ</span>
        <span class="brand__text"><strong>Максим Шевчук</strong><small>юридическая практика</small></span>
      </a>
      <nav class="desktop-nav" aria-label="Основная навигация">
        ${navItems.map(([label, href]) => `<a href="${href}"${pathname.startsWith(href.slice(0, -1)) ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
      </nav>
      <div class="header__actions">
        <span class="header__city">${icon("pin")}Москва</span>
        <button class="button button--compact" type="button" data-dialog-open>Обсудить ситуацию</button>
      </div>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-toggle>
        <span class="sr-only">Открыть меню</span>${icon("menu")}
      </button>
    </div>
    <nav class="mobile-nav" id="mobile-menu" aria-label="Мобильная навигация" data-mobile-menu hidden>
      <div class="wrap">
        ${navItems.map(([label, href]) => `<a href="${href}">${label}${icon("arrow")}</a>`).join("")}
        <button class="button button--primary" type="button" data-dialog-open>Описать ситуацию</button>
      </div>
    </nav>
  </header>`;

const footer = () => `
  <footer class="site-footer">
    <div class="wrap footer__grid">
      <div class="footer__identity">
        <a class="brand brand--footer" href="/">
          <span class="brand__mark" aria-hidden="true">МШ</span>
          <span class="brand__text"><strong>Максим Юрьевич Шевчук</strong><small>юрист · Москва</small></span>
        </a>
        <p>Персональная юридическая практика. Досудебные претензии, жалобы, исковые заявления и защита денежных интересов.</p>
      </div>
      <div>
        <h2 class="footer__title">Направления</h2>
        <ul class="footer__links">
          ${services.slice(0, 5).map((service) => `<li><a href="/uslugi/${service.slug}/">${esc(service.name)}</a></li>`).join("")}
        </ul>
      </div>
      <div>
        <h2 class="footer__title">Информация</h2>
        <ul class="footer__links">
          <li><a href="/o-yuriste/">О юристе</a></li>
          <li><a href="/rayony-moskvy/">Районы Москвы</a></li>
          <li><a href="/kontakty/">Контакты</a></li>
          <li><a href="/politika-konfidencialnosti/">Конфиденциальность</a></li>
        </ul>
      </div>
      <div class="footer__contact">
        <h2 class="footer__title">Связаться</h2>
        <p>${site.phoneHref ? `<a href="tel:${site.phoneHref}" data-track="phone">${esc(site.phoneDisplay)}</a>` : `<span>${esc(site.phoneDisplay)}</span>`}</p>
        <p>${hasPublicEmail() ? `<a href="mailto:${esc(site.email)}" data-track="email">${esc(site.email)}</a>` : `<span>${esc(site.email)}</span>`}</p>
        ${site.telegram ? `<p><a href="${esc(site.telegram)}" rel="me noopener" data-track="telegram">Telegram</a></p>` : ""}
        ${site.whatsapp ? `<p><a href="${esc(site.whatsapp)}" rel="noopener" data-track="whatsapp">WhatsApp</a></p>` : ""}
        <button class="text-link" type="button" data-dialog-open>Описать ситуацию ${icon("arrow")}</button>
      </div>
    </div>
    <div class="wrap footer__bottom">
      <p>© ${new Date().getFullYear()} Максим Юрьевич Шевчук</p>
      <p>Материалы обновлены ${lastModifiedLabel}. Информация не является гарантией результата по конкретному делу.</p>
      ${site.analytics?.enabled ? '<button class="footer__settings" type="button" data-consent-settings>Настройки аналитики</button>' : ""}
    </div>
  </footer>`;

const whatsappMessage = (topic = "") => `Здравствуйте, Максим Юрьевич. Нужна юридическая консультация${topic ? ` по вопросу: ${topic}` : ""}. Кратко опишу ситуацию:`;
const whatsappLink = (topic = "") => `${site.whatsapp}?text=${encodeURIComponent(whatsappMessage(topic))}`;

const messengerChoices = (className = "") => `
  <div class="messenger-choices ${className}">
    <a class="messenger-choice messenger-choice--whatsapp" href="${esc(whatsappLink())}" target="_blank" rel="noopener" data-whatsapp-link data-track="whatsapp">${icon("whatsapp")}<span>Написать в WhatsApp</span></a>
    <a class="messenger-choice messenger-choice--telegram" href="${esc(site.telegram)}" target="_blank" rel="noopener" data-track="telegram">${icon("telegram")}<span>Написать в Telegram</span></a>
  </div>`;

const dialog = () => `
  <dialog class="contact-dialog" id="contact-dialog" aria-labelledby="dialog-title">
    <button class="dialog__close" type="button" data-dialog-close aria-label="Закрыть">${icon("close")}</button>
    <div class="messenger-dialog__content">
      <span class="messenger-dialog__status"><i></i>На связи в мессенджерах</span>
      <img class="messenger-dialog__portrait" src="/assets/images/maxim-portrait.webp" width="900" height="900" alt="Максим Юрьевич Шевчук">
      <h2 id="dialog-title">Готов разобрать ситуацию</h2>
      <p>Напишите в удобный мессенджер, что произошло. Максим Юрьевич лично уточнит важные детали и подскажет, с чего начать.</p>
      ${messengerChoices("messenger-choices--dialog")}
      <p class="messenger-dialog__note">Первичное сообщение ни к чему вас не обязывает.</p>
      <p class="messenger-dialog__privacy">${icon("lock")}Конфиденциально. Общение напрямую с юристом — без операторов и ботов.</p>
    </div>
  </dialog>`;

const stickyContact = () => `
  <div class="mobile-contact" aria-label="Быстрые действия" data-mobile-contact>
    <button type="button" data-dialog-open>${icon("dialog")}Описать ситуацию</button>
  </div>`;

const consentBanner = () => site.analytics?.enabled && site.analytics?.requireConsent ? `
  <aside class="consent-banner" data-consent-banner hidden aria-labelledby="consent-title">
    <div>
      <strong id="consent-title">Аналитика посещений</strong>
      <p>С вашего согласия сайт загрузит системы аналитики, чтобы измерять полезность страниц и обращения. Без согласия они не запускаются.</p>
      <a href="/politika-konfidencialnosti/">Подробнее об обработке данных</a>
    </div>
    <div class="consent-banner__actions">
      <button class="button button--primary" type="button" data-consent-accept>Разрешить</button>
      <button class="button button--secondary" type="button" data-consent-reject>Не разрешать</button>
    </div>
  </aside>` : "";

const personSchema = () => ({
  "@type": "Person",
  "@id": entityUrl(site.personId),
  name: site.name,
  jobTitle: "Юрист",
  url: `${site.siteUrl}/o-yuriste/`,
  image: `${site.siteUrl}/assets/images/maxim-portrait.webp`,
  worksFor: { "@id": entityUrl(site.organizationId) },
  alumniOf: {
    "@type": "CollegeOrUniversity",
    name: "Российский государственный университет правосудия",
  },
  hasCredential: {
    "@type": "EducationalOccupationalCredential",
    name: "Диплом бакалавра по направлению 40.03.01 «Юриспруденция»",
    credentialCategory: "Высшее юридическое образование, бакалавриат",
    dateCreated: "2010-06-11",
    recognizedBy: {
      "@type": "CollegeOrUniversity",
      name: "Российский государственный университет правосудия",
    },
  },
  knowsAbout: [
    "Досудебное урегулирование споров",
    "Возврат денежных средств",
    "Жалобы и обращения",
    "Исковые заявления",
    "Коммерческие споры",
    "Споры продавцов с маркетплейсами",
  ],
  areaServed: ["Москва", "Московская область"],
  ...(site.sameAs?.length ? { sameAs: site.sameAs } : {}),
});

const practiceSchema = () => {
  const office = hasPublicOffice();
  return {
    "@type": office ? "LegalService" : "Organization",
    "@id": entityUrl(site.organizationId),
    name: "Юридическая практика Максима Юрьевича Шевчука",
    url: siteRoot,
    logo: `${site.siteUrl}/favicon.svg`,
    image: `${site.siteUrl}/assets/images/maxim-hero.webp`,
    founder: { "@id": entityUrl(site.personId) },
    areaServed: [
      { "@type": "City", name: "Москва" },
      { "@type": "AdministrativeArea", name: "Московская область" },
    ],
    ...(site.phoneHref ? { telephone: site.phoneHref } : {}),
    ...(hasPublicEmail() ? { email: site.email } : {}),
    ...(site.sameAs?.length ? { sameAs: site.sameAs } : {}),
    ...(office ? {
      address: {
        "@type": "PostalAddress",
        streetAddress: site.publicOffice.streetAddress,
        addressLocality: site.publicOffice.addressLocality,
        addressRegion: site.publicOffice.addressRegion,
        addressCountry: "RU",
        ...(site.publicOffice.postalCode ? { postalCode: site.publicOffice.postalCode } : {}),
      },
      ...(site.publicOffice.latitude && site.publicOffice.longitude ? {
        geo: {
          "@type": "GeoCoordinates",
          latitude: site.publicOffice.latitude,
          longitude: site.publicOffice.longitude,
        },
      } : {}),
      ...(site.publicOffice.openingHours?.length ? { openingHours: site.publicOffice.openingHours } : {}),
      ...(site.publicOffice.priceRange ? { priceRange: site.publicOffice.priceRange } : {}),
    } : {}),
  };
};

export const renderShell = ({
  pathname,
  title = site.defaultTitle,
  description = site.defaultDescription,
  content,
  image = "/assets/images/maxim-hero.webp",
  imageAlt = "Юрист Максим Юрьевич Шевчук",
  imageWidth = 1536,
  imageHeight = 1024,
  indexable = true,
  schema = [],
  pageType = "WebPage",
  mainEntityId = "",
  preloadImage = "",
  bodyClass = "",
}) => {
  const canonical = `${site.siteUrl}${canonicalPath(pathname)}`;
  const robots = site.production && indexable ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" : "noindex,follow";
  const breadcrumb = schema.find((item) => item["@type"] === "BreadcrumbList");
  const primaryImageId = `${canonical}#primaryimage`;
  const pageId = `${canonical}#webpage`;
  const primaryImage = {
    "@type": "ImageObject",
    "@id": primaryImageId,
    url: `${site.siteUrl}${image}`,
    contentUrl: `${site.siteUrl}${image}`,
    width: imageWidth,
    height: imageHeight,
    caption: imageAlt,
  };
  const webPage = {
    "@type": pageType,
    "@id": pageId,
    url: canonical,
    name: title,
    description,
    inLanguage: "ru-RU",
    dateModified: site.contentLastModified,
    isPartOf: { "@id": `${site.siteUrl}/#website` },
    primaryImageOfPage: { "@id": primaryImageId },
    ...(breadcrumb ? { breadcrumb: { "@id": breadcrumb["@id"] } } : {}),
    ...(mainEntityId ? { mainEntity: { "@id": mainEntityId } } : {}),
  };
  const graph = [
    {
      "@type": "WebSite",
      "@id": `${site.siteUrl}/#website`,
      url: siteRoot,
      name: site.shortName,
      inLanguage: "ru-RU",
      publisher: { "@id": entityUrl(site.organizationId) },
    },
    primaryImage,
    webPage,
    ...schema,
  ];
  return withBasePath(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="${robots}">
  <meta name="author" content="${esc(site.name)}">
  ${site.webmasterVerification?.google ? `<meta name="google-site-verification" content="${esc(site.webmasterVerification.google)}">` : ""}
  ${site.webmasterVerification?.yandex ? `<meta name="yandex-verification" content="${esc(site.webmasterVerification.yandex)}">` : ""}
  <link rel="canonical" href="${canonical}">
  <link rel="author" href="${site.siteUrl}/o-yuriste/">
  <meta name="theme-color" content="#10283d">
  <meta name="color-scheme" content="light">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="${esc(site.shortName)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${site.siteUrl}${image}">
  <meta property="og:image:secure_url" content="${site.siteUrl}${image}">
  <meta property="og:image:type" content="image/webp">
  <meta property="og:image:width" content="${imageWidth}">
  <meta property="og:image:height" content="${imageHeight}">
  <meta property="og:image:alt" content="${esc(imageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${site.siteUrl}${image}">
  <meta name="twitter:image:alt" content="${esc(imageAlt)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="/site.webmanifest">
  ${preloadImage ? `<link rel="preload" as="image" href="${preloadImage}" type="image/webp" fetchpriority="high">` : ""}
  <link rel="stylesheet" href="/assets/styles.css">
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll("<", "\\u003c")}</script>
  <script type="module" src="/assets/app.js"></script>
</head>
<body class="${bodyClass}" data-preview="${site.production ? "false" : "true"}" data-analytics-enabled="${site.analytics?.enabled ? "true" : "false"}" data-analytics-requires-consent="${site.analytics?.requireConsent ? "true" : "false"}" data-google-analytics-id="${esc(site.analytics?.googleMeasurementId || "")}" data-yandex-metrica-id="${esc(site.analytics?.yandexMetricaId || "")}">
  <div class="scroll-progress" aria-hidden="true" data-scroll-progress></div>
  ${header(pathname)}
  <main id="main">${content}</main>
  ${footer()}
  ${dialog()}
  ${stickyContact()}
  ${consentBanner()}
</body>
</html>`);
};

const serviceCards = (limit = services.length) => `
  <div class="service-grid">
    ${services.slice(0, limit).map((service, index) => `
      <article class="service-card reveal" style="--delay:${index * 45}ms">
        <div class="service-card__top"><span class="service-card__icon">${icon(service.icon)}</span><span class="service-card__number">0${index + 1}</span></div>
        <h3><a href="/uslugi/${service.slug}/">${esc(service.name)}</a></h3>
        <p>${esc(service.short)}</p>
        <a class="card-link" href="/uslugi/${service.slug}/">Подробнее ${icon("arrow")}</a>
      </article>`).join("")}
  </div>`;

const relatedServiceCards = (slugs = []) => {
  const related = slugs.map((slug) => services.find((item) => item.slug === slug)).filter(Boolean);
  return `<div class="service-grid">
    ${related.map((item, index) => `
      <article class="service-card reveal" style="--delay:${index * 45}ms">
        <div class="service-card__top"><span class="service-card__icon">${icon(item.icon)}</span><span class="service-card__number">0${index + 1}</span></div>
        <h3><a href="/uslugi/${item.slug}/">${esc(item.name)}</a></h3>
        <p>${esc(item.short)}</p>
        <a class="card-link" href="/uslugi/${item.slug}/">Перейти к направлению ${icon("arrow")}</a>
      </article>`).join("")}
  </div>`;
};

const faqBlock = (items = faqs) => `
  <div class="faq-list">
    ${items.map((item, index) => `
      <details class="faq-item reveal"${index === 0 ? " open" : ""}>
        <summary><span>${esc(item.q)}</span><span class="faq-item__toggle">${icon("chevron")}</span></summary>
        <div class="faq-item__body"><p>${esc(item.a)}</p></div>
      </details>`).join("")}
  </div>`;

const cta = (title = "Разберём, на чём можно построить позицию", text = "Опишите ситуацию и перечислите документы. Этого достаточно, чтобы определить первый предметный шаг.") => `
  <section class="section section--cta">
    <div class="wrap cta-panel reveal">
      <div>
        <span class="eyebrow eyebrow--light">Начать с фактов</span>
        <h2>${esc(title)}</h2>
        <p>${esc(text)}</p>
      </div>
      <button class="button button--gold" type="button" data-dialog-open>Описать ситуацию${icon("arrow", "button__icon")}</button>
    </div>
  </section>`;

export const renderHome = () => ({
  title: site.defaultTitle,
  description: site.defaultDescription,
  image: "/assets/images/maxim-hero.webp",
  imageAlt: "Юрист Максим Юрьевич Шевчук в рабочем кабинете",
  preloadImage: "/assets/images/maxim-hero.webp",
  schema: [personSchema(), practiceSchema()],
  mainEntityId: entityUrl(site.personId),
  bodyClass: "home",
  content: `
    <section class="hero">
      <div class="wrap hero__grid">
        <div class="hero__content">
          <div class="hero__kicker"><span class="status-dot"></span>Юридическая помощь в Москве</div>
          <h1>Сильная правовая позиция начинается <em>с точных фактов</em></h1>
          <p class="hero__lead">Разбираю документы, нахожу юридическое основание и выстраиваю последовательность действий — от досудебного требования до искового заявления.</p>
          <div class="hero__actions">
            <button class="button button--primary" type="button" data-dialog-open>Описать ситуацию${icon("arrow", "button__icon")}</button>
            ${button("Посмотреть услуги", "/uslugi/", "secondary")}
          </div>
          <div class="hero__assurance" aria-label="Принципы работы">
            <span>${icon("eye")}Сначала документы</span>
            <span>${icon("lock")}Конфиденциально</span>
            <span>${icon("dialog")}Понятным языком</span>
          </div>
        </div>
        <div class="hero__visual">
          <div class="hero__image-wrap">
            <img src="/assets/images/maxim-hero.webp" width="1536" height="1024" alt="Юрист Максим Юрьевич Шевчук в рабочем кабинете" fetchpriority="high" decoding="async">
          </div>
          <div class="identity-card">
            <span>Юрист</span>
            <strong>Максим Юрьевич<br>Шевчук</strong>
            <small>Москва и Московская область</small>
          </div>
        </div>
      </div>
      <div class="wrap trust-rail">
        <div><strong>01</strong><span>Изучаю факты<br>до формулировки требований</span></div>
        <div><strong>02</strong><span>Документ строится<br>под конкретную ситуацию</span></div>
        <div><strong>03</strong><span>Объясняю дальнейшие<br>действия после подготовки</span></div>
      </div>
    </section>

    <section class="section section--situations">
      <div class="wrap">
        <div class="section-head section-head--split reveal">
          <div><span class="eyebrow">С чем обращаются</span><h2>Когда обычная переписка уже не работает</h2></div>
          <p>Выберите ситуацию, которая ближе к вашей. Правовая конструкция определяется после проверки документов.</p>
        </div>
        <div class="situation-grid">
          ${[
            ["Не возвращают деньги", "Оплата, аванс, долг или удержание без понятного основания", "возврат"],
            ["Не исполнили договор", "Работы, услуги, поставка или иное обязательство сорваны", "договор"],
            ["Игнорируют претензию", "Требование получено, но ответа или исполнения нет", "тишина"],
            ["Орган бездействует", "Проверку затягивают либо отвечают формально", "жалоба"],
            ["Нужно обратиться в суд", "Важно определить требования, расчёт и доказательства", "иск"],
            ["Спор с маркетплейсом", "Блокировка, штраф, удержание или спорное начисление", "бизнес"],
          ].map(([title, text, tag], index) => `
            <button class="situation-card reveal" type="button" data-dialog-open data-topic="${tag}" style="--delay:${index * 45}ms">
              <span class="situation-card__index">${String(index + 1).padStart(2, "0")}</span>
              <strong>${title}</strong><small>${text}</small>${icon("arrow")}
            </button>`).join("")}
        </div>
      </div>
    </section>

    <section class="section section--dark">
      <div class="wrap position-grid">
        <div class="position-intro reveal">
          <span class="eyebrow eyebrow--light">Подход</span>
          <h2>Не пересказать конфликт, а собрать позицию</h2>
          <p>Убедительный документ показывает проверяющему, оппоненту или суду логическую связь между событием, доказательством, нормой и требованием.</p>
          ${button("Как проходит работа", "/o-yuriste/#process", "gold")}
        </div>
        <ol class="position-steps">
          <li class="reveal"><span>01</span><div><strong>Факты</strong><p>Восстанавливаю хронологию и отделяю юридически значимое от эмоций и предположений.</p></div></li>
          <li class="reveal"><span>02</span><div><strong>Доказательства</strong><p>Проверяю, чем подтверждаются оплата, договорённости, нарушения и реакция второй стороны.</p></div></li>
          <li class="reveal"><span>03</span><div><strong>Требования</strong><p>Формулирую конкретный результат, сроки и последствия неисполнения.</p></div></li>
        </ol>
      </div>
    </section>

    <section class="section section--services">
      <div class="wrap">
        <div class="section-head section-head--split reveal">
          <div><span class="eyebrow">Направления практики</span><h2>Юридическая помощь под задачу</h2></div>
          <div><p>Каждое направление — отдельная логика работы, доказательств и требований.</p><a class="text-link" href="/uslugi/">Все услуги ${icon("arrow")}</a></div>
        </div>
        ${serviceCards()}
      </div>
    </section>

    <section class="section section--consultation">
      <div class="wrap consultation-grid">
        <div class="consultation-photo reveal"><img src="/assets/images/maxim-consultation.webp" width="1536" height="1024" loading="lazy" decoding="async" alt="Максим Шевчук объясняет клиенту юридическую позицию"></div>
        <div class="consultation-copy reveal">
          <span class="eyebrow">Без лишней неопределённости</span>
          <h2>Вы понимаете, что происходит на каждом этапе</h2>
          <p class="lead">Юридическая помощь не должна превращаться в ещё один источник тревоги. После анализа я объясняю, на чём строится позиция и какой шаг следует дальше.</p>
          <ul class="feature-list">
            <li>${icon("check")}<div><strong>Что имеет значение</strong><span>Какие факты и документы действительно усиливают позицию.</span></div></li>
            <li>${icon("check")}<div><strong>Чего можно требовать</strong><span>Основное требование и дополнительные последствия при наличии оснований.</span></div></li>
            <li>${icon("check")}<div><strong>Что делать после ответа</strong><span>Как действовать при согласии, отказе, отписке или полном молчании.</span></div></li>
          </ul>
          <button class="text-link" type="button" data-dialog-open>Задать вопрос по ситуации ${icon("arrow")}</button>
        </div>
      </div>
    </section>

    <section class="section section--about-preview">
      <div class="wrap about-preview">
        <div class="about-preview__copy reveal">
          <span class="eyebrow">О юристе</span>
          <h2>Максим Юрьевич Шевчук</h2>
          <p class="about-preview__lead">Персональная юридическая практика с фокусом на досудебном урегулировании, денежных и договорных спорах.</p>
          <blockquote>«Задача юриста — не усложнить ситуацию терминами, а найти точку, в которой право начинает работать в пользу клиента».</blockquote>
          <div class="education-note">${icon("education")}<div><strong>Высшее юридическое образование</strong><span>Российский государственный университет правосудия · диплом 2010 года</span></div></div>
          ${button("Подробнее о юристе", "/o-yuriste/", "secondary")}
        </div>
        <div class="about-preview__visual reveal">
          <img src="/assets/images/maxim-documents.webp" width="971" height="1600" loading="lazy" decoding="async" alt="Максим Юрьевич Шевчук изучает документы">
          <div class="about-preview__seal"><span>40.03.01</span><small>Юриспруденция</small></div>
        </div>
      </div>
    </section>

    <section class="section section--districts">
      <div class="wrap district-preview reveal">
        <div><span class="eyebrow eyebrow--light">Москва</span><h2>Юридическая помощь по районам города</h2><p>Структура сайта учитывает территориальные запросы, но каждая районная страница будет наполнена самостоятельной полезной информацией, а не копией общего текста.</p>${button("Выбрать округ", "/rayony-moskvy/", "gold")}</div>
        <div class="district-preview__map" aria-hidden="true">
          <span class="map-ring map-ring--1"></span><span class="map-ring map-ring--2"></span><span class="map-ring map-ring--3"></span>
          <span class="map-label map-label--1">ЦАО</span><span class="map-label map-label--2">САО</span><span class="map-label map-label--3">ЗАО</span><span class="map-label map-label--4">ЮАО</span><span class="map-dot"></span>
        </div>
      </div>
    </section>

    <section class="section section--faq">
      <div class="wrap faq-grid">
        <div class="faq-intro reveal"><span class="eyebrow">Коротко о главном</span><h2>Частые вопросы перед обращением</h2><p>Если вашего вопроса нет в списке, опишите ситуацию в свободной форме.</p><button class="text-link" type="button" data-dialog-open>Спросить напрямую ${icon("arrow")}</button></div>
        ${faqBlock()}
      </div>
    </section>
    ${cta()}
  `,
});

export const renderServices = () => {
  const crumbs = [{ name: "Главная", path: "/" }, { name: "Услуги", path: "/uslugi/" }];
  return {
    title: "Юридические услуги в Москве | Максим Шевчук",
    description: "Досудебные претензии, возврат денег, жалобы, исковые заявления, коммерческие споры и защита продавцов маркетплейсов.",
    schema: [personSchema(), practiceSchema(), breadcrumbSchema(crumbs)],
    pageType: "CollectionPage",
    mainEntityId: entityUrl(site.organizationId),
    content: `
      ${breadcrumbs(crumbs)}
      <section class="inner-hero"><div class="wrap inner-hero__grid"><div><span class="eyebrow">Направления практики</span><h1>Юридическая помощь, собранная под вашу ситуацию</h1><p>Выберите направление, чтобы увидеть логику работы, необходимые материалы и возможный результат подготовки.</p></div><div class="inner-hero__aside"><span>Важно</span><p>Окончательная услуга и состав требований определяются после проверки документов, а не по одному названию проблемы.</p></div></div></section>
      <section class="section section--services"><div class="wrap">${serviceCards()}</div></section>
      <section class="section section--dark compact-dark"><div class="wrap compact-dark__grid"><div><span class="eyebrow eyebrow--light">Не нашли точного совпадения?</span><h2>Описать факты полезнее, чем самостоятельно выбирать документ</h2></div><div><p>Иногда вместо претензии нужна жалоба, вместо заявления в полицию — гражданский иск, а до документа необходим анализ доказательств.</p><button class="button button--gold" type="button" data-dialog-open>Описать ситуацию${icon("arrow", "button__icon")}</button></div></div></section>
      ${cta("Начнём с правильной квалификации", "Коротко изложите хронологию и сообщите, что подтверждается документами, платежами или перепиской.")}
    `,
  };
};

export const renderService = (service) => {
  const crumbs = [
    { name: "Главная", path: "/" },
    { name: "Услуги", path: "/uslugi/" },
    { name: service.name, path: `/uslugi/${service.slug}/` },
  ];
  const serviceSchema = {
    "@type": "Service",
    "@id": `${site.siteUrl}/uslugi/${service.slug}/#service`,
    name: service.name,
    serviceType: service.name,
    description: service.description,
    provider: { "@id": entityUrl(site.personId) },
    areaServed: ["Москва", "Московская область"],
    url: `${site.siteUrl}/uslugi/${service.slug}/`,
  };
  return {
    title: `${service.title} | Максим Шевчук`,
    description: service.description,
    image: "/assets/images/maxim-documents.webp",
    imageAlt: `Юрист Максим Шевчук готовит документы по направлению «${service.name}»`,
    imageWidth: 971,
    imageHeight: 1600,
    schema: [personSchema(), practiceSchema(), breadcrumbSchema(crumbs), serviceSchema],
    mainEntityId: serviceSchema["@id"],
    content: `
      ${breadcrumbs(crumbs)}
      <section class="service-hero">
        <div class="wrap service-hero__grid">
          <div><span class="eyebrow">${esc(service.eyebrow)}</span><h1>${esc(service.title)}</h1><p>${esc(service.lead)}</p><div class="hero__actions"><button class="button button--primary" type="button" data-dialog-open data-topic="${esc(service.name)}">Обсудить ситуацию${icon("arrow", "button__icon")}</button>${button("Все услуги", "/uslugi/", "secondary")}</div></div>
          <aside class="service-hero__card"><span class="service-hero__icon">${icon(service.icon)}</span><strong>С чего начинается работа</strong><p>С проверки документов, хронологии, платежей, переписки и уже полученных ответов.</p><ul><li>${icon("check")}Факты</li><li>${icon("check")}Доказательства</li><li>${icon("check")}Правовое основание</li></ul></aside>
        </div>
      </section>
      <section class="section"><div class="wrap two-lists">
        <div class="reveal"><span class="eyebrow">Когда это направление подходит</span><h2>Типовые исходные ситуации</h2><ul class="number-list">${service.problems.map((item, i) => `<li><span>0${i + 1}</span><p>${esc(item)}</p></li>`).join("")}</ul></div>
        <div class="paper-panel reveal"><span class="eyebrow">Что входит в результат</span><h2>Позиция, которой можно пользоваться</h2><ul class="plain-checks">${service.result.map((item) => `<li>${icon("check")}<span>${esc(item)}</span></li>`).join("")}</ul><p class="paper-panel__note">Точный состав документа и требований зависит от правовой квалификации конкретных обстоятельств.</p></div>
      </div></section>
      <section class="section section--process"><div class="wrap"><div class="section-head reveal"><span class="eyebrow">Последовательность</span><h2>Как строится работа</h2></div><ol class="process-line"><li><span>01</span><strong>Материалы</strong><p>Вы передаёте краткую хронологию и имеющиеся документы.</p></li><li><span>02</span><strong>Анализ</strong><p>Определяю факты, доказательства и применимые основания.</p></li><li><span>03</span><strong>Позиция</strong><p>Согласовываем требования и ожидаемый результат.</p></li><li><span>04</span><strong>Документ</strong><p>Получаете готовый текст и пояснение дальнейших шагов.</p></li></ol></div></section>
      <section class="section section--consultation"><div class="wrap consultation-grid consultation-grid--reverse"><div class="consultation-copy reveal"><span class="eyebrow">Персональная работа</span><h2>Документ готовит Максим Юрьевич</h2><p class="lead">Формулировки связываются с вашими фактами и приложениями. После подготовки вы понимаете не только что направить, но и как реагировать на дальнейшее развитие спора.</p><div class="education-note">${icon("education")}<div><strong>Профильное образование</strong><span>Российский государственный университет правосудия</span></div></div>${button("О юристе", "/o-yuriste/", "secondary")}</div><div class="consultation-photo reveal"><img src="/assets/images/maxim-documents.webp" width="971" height="1600" loading="lazy" decoding="async" alt="Юрист Максим Шевчук работает с документами"></div></div></section>
      <section class="section section--services"><div class="wrap"><div class="section-head section-head--split reveal"><div><span class="eyebrow">Связанные вопросы</span><h2>Другие этапы защиты позиции</h2></div><p>Один спор может последовательно потребовать претензию, обращение в орган и иск. Перейдите к смежному направлению, чтобы увидеть его задачу.</p></div>${relatedServiceCards(service.related)}</div></section>
      ${cta(`Обсудить: ${service.name.toLowerCase()}`, "Опишите обстоятельства и перечислите документы. Вопрос можно сформулировать обычными словами.")}
    `,
  };
};

export const renderAbout = () => {
  const crumbs = [{ name: "Главная", path: "/" }, { name: "О юристе", path: "/o-yuriste/" }];
  return {
    title: "Юрист Максим Юрьевич Шевчук — образование и подход",
    description: "Максим Юрьевич Шевчук — юрист в Москве. Высшее юридическое образование, персональная работа с документами и правовой позицией.",
    image: "/assets/images/maxim-documents.webp",
    imageAlt: "Максим Юрьевич Шевчук — юрист в Москве",
    imageWidth: 971,
    imageHeight: 1600,
    schema: [personSchema(), practiceSchema(), breadcrumbSchema(crumbs)],
    pageType: "ProfilePage",
    mainEntityId: entityUrl(site.personId),
    content: `
      ${breadcrumbs(crumbs)}
      <section class="about-hero"><div class="wrap about-hero__grid"><div class="about-hero__photo"><img src="/assets/images/maxim-documents.webp" width="971" height="1600" alt="Максим Юрьевич Шевчук — юрист" fetchpriority="high" decoding="async"></div><div class="about-hero__copy"><span class="eyebrow">Персональная практика</span><h1>Максим Юрьевич Шевчук</h1><p class="about-hero__role">Юрист · Москва и Московская область</p><p class="lead">Работаю с досудебными, денежными и договорными спорами: изучаю документы, определяю правовое основание и собираю позицию под конкретную цель клиента.</p><div class="about-hero__facts"><div><strong>2010</strong><span>год получения юридического образования</span></div><div><strong>РГУП</strong><span>Российский государственный университет правосудия</span></div></div><button class="button button--primary" type="button" data-dialog-open>Обсудить ситуацию${icon("arrow", "button__icon")}</button></div></div></section>
      <section class="section about-story"><div class="wrap story-grid"><div class="story-heading reveal"><span class="eyebrow">Рабочий принцип</span><h2>Сначала понять, что можно доказать</h2></div><div class="story-copy reveal"><p class="lead">В споре легко сосредоточиться на несправедливости произошедшего. Но юридический результат зависит от другого: какие обстоятельства имеют значение, чем они подтверждаются и какое требование следует из закона или договора.</p><p>Поэтому работа начинается не с шаблона документа. Сначала восстанавливается хронология, проверяются платежи, договорённости, переписка и ответы второй стороны. Только после этого формируется позиция.</p><blockquote>Хороший юридический документ позволяет постороннему человеку быстро увидеть логику дела — без догадок и эмоционального шума.</blockquote></div></div></section>
      <section class="section section--education"><div class="wrap education-grid"><div class="education-copy reveal"><span class="eyebrow">Образование</span><h2>Высшее юридическое образование</h2><dl><div><dt>Учебное заведение</dt><dd>Российский государственный университет правосудия, Москва</dd></div><div><dt>Направление</dt><dd>40.03.01 «Юриспруденция»</dd></div><div><dt>Квалификация</dt><dd>Бакалавр</dd></div><div><dt>Год выдачи диплома</dt><dd>2010</dd></div></dl><p class="muted">На сайте используется изображение диплома с закрытыми регистрационными данными.</p></div><figure class="diploma-card reveal"><img src="/assets/images/maxim-diploma.webp" width="1170" height="765" loading="lazy" decoding="async" alt="Диплом Максима Юрьевича Шевчука по направлению Юриспруденция"><figcaption>${icon("education")}Документ об образовании и квалификации</figcaption></figure></div></section>
      <section class="section section--dark" id="process"><div class="wrap"><div class="section-head reveal"><span class="eyebrow eyebrow--light">Работа с обращением</span><h2>Четыре понятных этапа</h2></div><ol class="process-cards"><li><span>01</span><h3>Вы описываете ситуацию</h3><p>Свободным текстом, без необходимости подбирать юридические термины.</p></li><li><span>02</span><h3>Я изучаю материалы</h3><p>Проверяю документы, хронологию, платежи и уже полученные ответы.</p></li><li><span>03</span><h3>Определяю позицию</h3><p>Объясняю возможные требования, ограничения и последовательность действий.</p></li><li><span>04</span><h3>Готовлю результат</h3><p>Документ и пояснение, как им пользоваться при дальнейшем развитии ситуации.</p></li></ol></div></section>
      ${cta("Передайте ситуацию на первичный разбор", "Краткой хронологии и перечня документов достаточно, чтобы начать предметный разговор.")}
    `,
  };
};

export const renderDistricts = () => {
  const crumbs = [{ name: "Главная", path: "/" }, { name: "Районы Москвы", path: "/rayony-moskvy/" }];
  return {
    title: "Юридическая помощь по районам Москвы | Максим Шевчук",
    description: "Юридическая помощь жителям и бизнесу в административных округах и районах Москвы.",
    schema: [personSchema(), practiceSchema(), breadcrumbSchema(crumbs)],
    pageType: "CollectionPage",
    mainEntityId: entityUrl(site.personId),
    content: `
      ${breadcrumbs(crumbs)}
      <section class="inner-hero district-hero"><div class="wrap inner-hero__grid"><div><span class="eyebrow">География работы</span><h1>Юридическая помощь по районам Москвы</h1><p>Выберите административный округ. Районные страницы будут содержать самостоятельную информацию об услугах и порядке обращения, а не механически размноженный SEO-текст.</p></div><div class="inner-hero__aside district-search"><label for="district-search">Найти округ или район</label><div class="search-field">${icon("search")}<input id="district-search" type="search" placeholder="Например, Хамовники" autocomplete="off" data-district-search></div><small data-search-count>Показаны все округа</small></div></div></section>
      <section class="section"><div class="wrap"><div class="district-grid" data-district-grid>${districts.map((district) => `<article class="district-card reveal" data-search="${esc(`${district.short} ${district.name} ${district.areas}`.toLowerCase())}"><div class="district-card__top"><strong>${esc(district.short)}</strong><span>${icon("pin")}</span></div><h2><a href="/rayony-moskvy/${district.slug}/">${esc(district.name)}</a></h2><p>${esc(district.areas)}</p><a class="card-link" href="/rayony-moskvy/${district.slug}/">Открыть страницу ${icon("arrow")}</a></article>`).join("")}</div><p class="empty-state" data-empty-state hidden>Ничего не найдено. Напишите название района иначе или опишите ситуацию через форму.</p></div></section>
      <section class="section section--paper"><div class="wrap local-seo-note"><div><span class="eyebrow">Почему без копий</span><h2>Локальная страница должна помогать человеку</h2></div><div><p>Высокие позиции нельзя получить простым повторением названия района. Для публикации каждая страница дополняется уникальными сценариями, актуальной подсудностью, маршрутами обращения и ответами на реальные местные запросы.</p><ul class="plain-checks"><li>${icon("check")}Самостоятельное содержание</li><li>${icon("check")}Понятная перелинковка</li><li>${icon("check")}Корректные заголовки и метаданные</li></ul></div></div></section>
      ${cta("Нужна помощь независимо от района?", "Большинство материалов можно изучить дистанционно. Укажите район и коротко опишите ситуацию.")}
    `,
  };
};

export const renderDistrict = (district) => {
  const crumbs = [
    { name: "Главная", path: "/" },
    { name: "Районы Москвы", path: "/rayony-moskvy/" },
    { name: district.short, path: `/rayony-moskvy/${district.slug}/` },
  ];
  return {
    title: `Юрист в ${district.short} Москвы — претензии, жалобы, иски | Максим Шевчук`,
    description: `Юридическая помощь в ${district.name}: досудебные претензии, жалобы, возврат денег и исковые заявления.`,
    indexable: site.districtPagesIndexable || site.indexableDistricts?.includes(district.slug),
    schema: [personSchema(), practiceSchema(), breadcrumbSchema(crumbs)],
    mainEntityId: entityUrl(site.personId),
    content: `
      ${breadcrumbs(crumbs)}
      <section class="district-detail-hero"><div class="wrap district-detail-hero__grid"><div><span class="draft-label">SEO-страница подготовлена к наполнению</span><span class="eyebrow">${esc(district.short)} · Москва</span><h1>Юридическая помощь в ${esc(district.name)}</h1><p>Досудебные претензии, жалобы, исковые заявления и помощь в денежных спорах для жителей и бизнеса округа.</p><div class="hero__actions"><button class="button button--primary" type="button" data-dialog-open data-topic="${esc(district.short)}">Описать ситуацию${icon("arrow", "button__icon")}</button>${button("Все районы", "/rayony-moskvy/", "secondary")}</div></div><div class="district-monogram"><span>${esc(district.short)}</span><small>${esc(district.areas)}</small></div></div></section>
      <section class="section"><div class="wrap"><div class="section-head section-head--split"><div><span class="eyebrow">Направления помощи</span><h2>С какими вопросами можно обратиться</h2></div><p>Ниже — общая структура. Перед открытием страницы для индексации блок дополняется уникальной информацией по округу.</p></div>${serviceCards(4)}</div></section>
      <section class="section section--paper"><div class="wrap district-context"><div><span class="eyebrow">Территория</span><h2>${esc(district.areas)}</h2><p>Для выбора способа обращения важно учитывать не только место проживания клиента, но и характер спора, статус сторон, условия договора и применимые правила подсудности.</p></div><div class="paper-panel"><h3>Что подготовить</h3><ul class="plain-checks"><li>${icon("check")}Краткую хронологию</li><li>${icon("check")}Договоры и переписку</li><li>${icon("check")}Подтверждения оплаты</li><li>${icon("check")}Полученные ответы и отказы</li></ul></div></div></section>
      ${cta(`Обсудить ситуацию в ${district.short}`, "Укажите район, суть вопроса и имеющиеся документы. Формат дальнейшей работы определяется после первичного анализа.")}
    `,
  };
};

export const renderContacts = () => {
  const crumbs = [{ name: "Главная", path: "/" }, { name: "Контакты", path: "/kontakty/" }];
  const office = hasPublicOffice();
  const locationValue = office
    ? `${site.publicOffice.streetAddress}, ${site.publicOffice.addressLocality}`
    : site.region;
  return {
    title: "Контакты юриста Максима Шевчука | Москва",
    description: "Связаться с юристом Максимом Юрьевичем Шевчуком и передать ситуацию на первичный разбор.",
    image: "/assets/images/maxim-consultation.webp",
    imageAlt: "Юрист Максим Шевчук проводит консультацию",
    schema: [personSchema(), practiceSchema(), breadcrumbSchema(crumbs)],
    pageType: "ContactPage",
    mainEntityId: entityUrl(site.personId),
    content: `
      ${breadcrumbs(crumbs)}
      <section class="contact-page"><div class="wrap contact-page__grid"><div class="contact-page__intro"><span class="eyebrow">Связаться</span><h1>Опишите ситуацию — без юридических формулировок</h1><p class="lead">Напишите в WhatsApp или Telegram, что произошло и какие документы сохранились. Этого достаточно для первого предметного ответа.</p><div class="contact-list"><div>${icon("whatsapp")}<span>WhatsApp</span><strong><a href="${esc(whatsappLink())}" target="_blank" rel="noopener" data-track="whatsapp">${esc(site.phoneDisplay)}</a></strong></div><div>${icon("telegram")}<span>Telegram</span><strong><a href="${esc(site.telegram)}" target="_blank" rel="noopener" data-track="telegram">@lawrazbor</a></strong></div><div>${icon("pin")}<span>${office ? "Адрес приёма" : "География"}</span><strong>${esc(locationValue)}</strong></div></div><div class="contact-page__photo"><img src="/assets/images/maxim-consultation.webp" width="1536" height="1024" loading="lazy" decoding="async" alt="Консультация юриста Максима Шевчука"></div></div><div class="contact-page__form contact-page__messengers"><span class="eyebrow">Первый шаг</span><h2>Выберите удобный мессенджер</h2><p>Сообщение уже подготовлено — останется добавить несколько строк о вашей ситуации.</p>${messengerChoices()}</div></div></section>
      <section class="section section--faq"><div class="wrap faq-grid"><div class="faq-intro"><span class="eyebrow">Перед обращением</span><h2>Что можно приложить</h2><p>На первом этапе не обязательно отправлять всё. Сообщите, что у вас есть, и получите перечень действительно нужных материалов.</p></div>${faqBlock(faqs.slice(0, 2))}</div></section>
    `,
  };
};

export const renderPrivacy = () => {
  const crumbs = [{ name: "Главная", path: "/" }, { name: "Политика конфиденциальности", path: "/politika-konfidencialnosti/" }];
  return {
    title: "Политика конфиденциальности | Максим Шевчук",
    description: "Порядок обработки персональных данных посетителей сайта юридической практики Максима Шевчука.",
    schema: [practiceSchema(), breadcrumbSchema(crumbs)],
    mainEntityId: entityUrl(site.organizationId),
    content: `
      ${breadcrumbs(crumbs)}
      <section class="legal-page"><div class="wrap legal-page__grid"><aside><span class="eyebrow">Документ</span><h1>Политика конфиденциальности</h1><p>Редакция для технического прототипа сайта.</p></aside><article class="legal-copy"><div class="draft-notice"><strong>Перед публикацией</strong><p>Необходимо указать реквизиты оператора персональных данных, фактические каналы сбора и используемые сервисы аналитики.</p></div><h2>1. Общие положения</h2><p>Настоящий текст является структурной заглушкой. Финальная редакция формируется после определения владельца домена, оператора персональных данных, хостинга, форм обратной связи и подключённых аналитических систем.</p><h2>2. Какие данные обрабатываются</h2><p>Имя, контактные данные, текст обращения, технические сведения о посещении сайта и иная информация, добровольно переданная пользователем.</p><h2>3. Цели обработки</h2><p>Ответ на обращение, организация обратной связи, обеспечение работы сайта и анализ его технической эффективности.</p><h2>4. Сроки и порядок хранения</h2><p>Сроки хранения и основания обработки необходимо уточнить в финальной редакции с учётом используемой инфраструктуры.</p><h2>5. Контакты оператора</h2><p>[Указать сведения перед публикацией]</p></article></div></section>
    `,
  };
};
