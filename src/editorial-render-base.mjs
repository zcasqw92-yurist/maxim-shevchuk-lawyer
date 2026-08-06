import { site } from "../site.config.mjs";
import { formatContentDate } from "./content-dates.mjs";
import { services } from "./data.mjs";
import { renderShell } from "./render.mjs";
import {
  articles,
  findArticleBySlug,
  findPracticeCaseById,
  findPracticeCaseBySlug,
  practiceCases,
} from "./editorial-data.mjs";

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const rootUrl = site.siteUrl.replace(/\/$/, "");
const personId = `${rootUrl}/${site.personId}`;
const organizationId = `${rootUrl}/${site.organizationId}`;

const breadcrumbSchema = (items) => ({
  "@type": "BreadcrumbList",
  "@id": `${rootUrl}${items.at(-1).path}#breadcrumb`,
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: `${rootUrl}${item.path}`,
  })),
});

const personSchema = () => ({
  "@type": "Person",
  "@id": personId,
  name: site.name,
  jobTitle: "Юрист",
  url: `${rootUrl}/o-yuriste/`,
  image: `${rootUrl}/assets/images/maxim-portrait.webp`,
  alumniOf: {
    "@type": "CollegeOrUniversity",
    name: "Российский государственный университет правосудия",
  },
});

const practiceSchema = () => ({
  "@type": "LegalService",
  "@id": organizationId,
  name: site.businessName,
  url: `${rootUrl}/`,
  founder: { "@id": personId },
  areaServed: site.serviceGeography.schemaAreaServed,
});

const breadcrumbs = (items) => `
  <nav class="breadcrumbs wrap" aria-label="Хлебные крошки">
    <ol>${items.map((item, index) => `<li>${index === items.length - 1 ? `<span aria-current="page">${esc(item.name)}</span>` : `<a href="${item.path}">${esc(item.name)}</a>`}</li>`).join("")}</ol>
  </nav>`;

const metaLine = ({ category, publishedAt, legalReviewedAt, readingMinutes }) => `
  <div class="editorial-meta">
    <span>${esc(category)}</span>
    <span>Опубликовано <time datetime="${publishedAt}">${formatContentDate(publishedAt)}</time></span>
    ${legalReviewedAt ? `<span>Проверено юристом <time datetime="${legalReviewedAt}">${formatContentDate(legalReviewedAt)}</time></span>` : ""}
    ${readingMinutes ? `<span>${readingMinutes} мин чтения</span>` : ""}
  </div>`;

const authorCard = () => `
  <aside class="editorial-author" aria-label="Об авторе">
    <img src="/assets/images/maxim-portrait.webp" width="900" height="900" loading="lazy" decoding="async" alt="Максим Юрьевич Шевчук">
    <div>
      <span>Материал подготовил</span>
      <strong>Максим Юрьевич Шевчук</strong>
      <p>Юрист. Высшее юридическое образование. Практика по гражданским, договорным и потребительским спорам, жалобам и судебным документам.</p>
      <a href="/o-yuriste/">Подробнее о юристе</a>
    </div>
  </aside>`;

const messengerCta = (topic, title = "Хотите уточнить свою ситуацию?", options = {}) => {
  const eyebrow = options.eyebrow || "Можно спросить юриста";
  const description = options.description || "Кратко укажите, что произошло, какие документы есть и что вы уже сделали. В мессенджере откроется готовое сообщение, которое можно изменить перед отправкой.";
  const buttonLabel = options.buttonLabel || "Написать юристу";
  return `
  <section class="editorial-cta" aria-labelledby="editorial-cta-title">
    <div>
      <span class="eyebrow eyebrow--light">${esc(eyebrow)}</span>
      <h2 id="editorial-cta-title">${esc(title)}</h2>
      <p>${esc(description)}</p>
    </div>
    <button class="button button--gold" type="button" data-dialog-open data-topic="${esc(topic)}">${esc(buttonLabel)}</button>
  </section>`;
};

const articleCard = (article) => `
  <article class="editorial-card">
    <span class="editorial-card__category">${esc(article.category)}</span>
    <h2><a href="/razbory/${article.slug}/">${esc(article.title)}</a></h2>
    <p>${esc(article.lead)}</p>
    <div class="editorial-card__meta"><time datetime="${article.modifiedAt}">${formatContentDate(article.modifiedAt)}</time><span>${article.readingMinutes} мин</span></div>
    <a class="card-link" href="/razbory/${article.slug}/">Читать разбор</a>
  </article>`;

const caseCard = (item) => `
  <article class="editorial-card editorial-card--case">
    <span class="editorial-card__category">${esc(item.category)}</span>
    <h2><a href="/praktika/${item.slug}/">${esc(item.title)}</a></h2>
    <p>${esc(item.situation)}</p>
    <div class="editorial-card__status"><strong>Текущий статус</strong><span>${esc(item.next)}</span></div>
    <a class="card-link" href="/praktika/${item.slug}/">Открыть кейс</a>
  </article>`;

const semanticList = (items, kind) => items?.length
  ? `<ul class="editorial-list editorial-list--${kind}">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
  : "";

const articleSection = (section) => {
  const microCta = section.microCta
    ? `<aside class="editorial-micro-cta"><strong>${esc(section.microCta.title)}</strong><p>${esc(section.microCta.text)}</p><a href="${esc(section.microCta.href || "#self-check")}">${esc(section.microCta.label)}</a></aside>`
    : "";
  return `
  <section class="article-section" id="${esc(section.id)}" data-article-section="${esc(section.id)}">
    <h2>${esc(section.title)}</h2>
    ${(section.paragraphs || []).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}
    ${section.checklist?.length ? `<ul class="editorial-checklist">${section.checklist.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
    ${semanticList(section.avoid, "cross")}
    ${semanticList(section.bullets, "dot")}
    ${semanticList(section.dashes, "dash")}
    ${section.options?.length ? `<div class="editorial-options">${section.options.map((item) => `<article><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`).join("")}</div>` : ""}
    ${section.note ? `<aside class="editorial-note"><strong>Практический комментарий</strong><p>${esc(section.note)}</p></aside>` : ""}
    ${microCta}
  </section>`;
};

const articleSchema = (article) => {
  const url = `${rootUrl}/razbory/${article.slug}/`;
  return {
    "@type": "Article",
    "@id": `${url}#article`,
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.modifiedAt,
    inLanguage: "ru-RU",
    author: { "@id": personId },
    publisher: { "@id": organizationId },
    mainEntityOfPage: { "@id": `${url}#webpage` },
    image: `${rootUrl}/assets/images/maxim-documents.webp`,
    articleSection: article.category,
    about: article.topic,
    citation: article.sources.map((source) => source.url),
  };
};

const caseSchema = (item) => {
  const url = `${rootUrl}/praktika/${item.slug}/`;
  return {
    "@type": "Article",
    "@id": `${url}#case-study`,
    headline: item.title,
    description: item.description,
    datePublished: item.publishedAt,
    dateModified: item.modifiedAt,
    inLanguage: "ru-RU",
    author: { "@id": personId },
    publisher: { "@id": organizationId },
    mainEntityOfPage: { "@id": `${url}#webpage` },
    image: `${rootUrl}/assets/images/maxim-documents.webp`,
    articleSection: "Практика",
    about: item.category,
  };
};

export const renderArticlesIndex = () => {
  const crumbs = [{ name: "Главная", path: "/" }, { name: "Разборы", path: "/razbory/" }];
  return {
    title: "Юридические разборы простыми словами | Максим Шевчук",
    description: "Практические юридические разборы: что проверить, какие доказательства собрать, куда обращаться и каких ошибок избегать.",
    image: "/assets/images/maxim-documents.webp",
    imageAlt: "Юрист Максим Шевчук изучает документы",
    imageWidth: 971,
    imageHeight: 1600,
    pageType: "CollectionPage",
    schema: [personSchema(), practiceSchema(), breadcrumbSchema(crumbs)],
    bodyClass: "editorial-page editorial-index-page",
    content: `
      ${breadcrumbs(crumbs)}
      <section class="inner-hero editorial-index-hero"><div class="wrap inner-hero__grid"><div><span class="eyebrow">Юридические разборы</span><h1>Что делать в конкретной юридической ситуации</h1><p>В каждом материале объясняю, что проверить, какие доказательства сохранить и в каком порядке действовать.</p></div><aside class="inner-hero__aside"><span>Важно</span><p>Статьи содержат общие правила. Точный порядок действий зависит от документов, сроков и обстоятельств вашего дела.</p></aside></div></section>
      <section class="section"><div class="wrap editorial-grid">${articles.map(articleCard).join("")}</div></section>
      ${messengerCta("вопрос по юридическому разбору")}
    `,
  };
};

export const renderPracticeIndex = () => {
  const crumbs = [{ name: "Главная", path: "/" }, { name: "Практика", path: "/praktika/" }];
  return {
    title: "Юридическая практика и обезличенные кейсы | Максим Шевчук",
    description: "Обезличенные примеры юридической работы: обстоятельства, изученные материалы, подготовленные документы и текущий статус.",
    image: "/assets/images/maxim-documents.webp",
    imageAlt: "Юрист Максим Шевчук работает с материалами дела",
    imageWidth: 971,
    imageHeight: 1600,
    pageType: "CollectionPage",
    schema: [personSchema(), practiceSchema(), breadcrumbSchema(crumbs)],
    bodyClass: "editorial-page editorial-index-page",
    content: `
      ${breadcrumbs(crumbs)}
      <section class="inner-hero editorial-index-hero"><div class="wrap inner-hero__grid"><div><span class="eyebrow">Практика</span><h1>Реальные задачи без раскрытия данных клиентов</h1><p>В кейсах указаны подтверждённые обстоятельства, подготовленные документы и текущий статус. ФИО, адреса и номера материалов не публикуются.</p></div><aside class="inner-hero__aside"><span>Важно</span><p>Результат другого дела зависит от его документов, доказательств, позиции второй стороны и решений государственных органов или суда.</p></aside></div></section>
      <section class="section"><div class="wrap editorial-grid">${practiceCases.map(caseCard).join("")}</div></section>
      ${messengerCta("похожая юридическая ситуация")}
    `,
  };
};

export const renderArticlePage = (articleOrSlug) => {
  const article = typeof articleOrSlug === "string" ? findArticleBySlug(articleOrSlug) : articleOrSlug;
  if (!article) throw new Error("Не найден юридический разбор");
  const path = `/razbory/${article.slug}/`;
  const crumbs = [{ name: "Главная", path: "/" }, { name: "Разборы", path: "/razbory/" }, { name: article.title, path }];
  const linkedCases = article.relatedCaseIds.map(findPracticeCaseById).filter(Boolean);
  const linkedServices = article.relatedServices?.length
    ? article.relatedServices
    : [{ slug: article.serviceSlug, label: article.serviceLabel }];
  const schema = articleSchema(article);

  return {
    title: `${article.seoTitle} | Максим Шевчук`,
    description: article.description,
    image: "/assets/images/maxim-documents.webp",
    imageAlt: `Юридический разбор: ${article.title}`,
    imageWidth: 971,
    imageHeight: 1600,
    pageType: "WebPage",
    mainEntityId: schema["@id"],
    schema: [personSchema(), practiceSchema(), breadcrumbSchema(crumbs), schema],
    bodyClass: "editorial-page article-page",
    content: `
      ${breadcrumbs(crumbs)}
      <article class="editorial-article" data-article-id="${esc(article.id)}" data-category="${esc(article.category)}">
        <header class="editorial-article__header wrap">
          <span class="eyebrow">${esc(article.category)}</span>
          <h1>${esc(article.title)}</h1>
          <p class="editorial-lead">${esc(article.lead)}</p>
          ${metaLine(article)}
        </header>
        <div class="wrap editorial-layout">
          <aside class="editorial-toc" aria-label="Содержание статьи"><strong>Содержание</strong><ol>${article.sections.map((section) => `<li><a href="#${esc(section.id)}">${esc(section.title)}</a></li>`).join("")}</ol></aside>
          <div class="editorial-body">
            <section class="editorial-answer"><strong>Короткий ответ</strong><p>${esc(article.shortAnswer)}</p></section>
            ${article.sections.map(articleSection).join("")}
            <section class="article-section" id="sources"><h2>Официальные источники</h2><ol class="editorial-sources">${article.sources.map((source) => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a></li>`).join("")}</ol></section>
            <section class="article-section" id="faq"><h2>Частые вопросы</h2><div class="faq-list">${article.faq.map((item, index) => `<details class="faq-item"${index === 0 ? " open" : ""}><summary><span>${esc(item.question)}</span></summary><div class="faq-item__body"><p>${esc(item.answer)}</p></div></details>`).join("")}</div></section>
            ${linkedCases.length ? `<section class="article-section editorial-related"><h2>Похожая задача из практики</h2>${linkedCases.map(caseCard).join("")}</section>` : ""}
            <section class="article-section editorial-related"><h2>Связанные направления</h2><ul class="editorial-list editorial-list--dash">${linkedServices.map((item) => `<li><a href="/uslugi/${esc(item.slug)}/">${esc(item.label)}</a></li>`).join("")}</ul></section>
            ${authorCard()}
          </div>
        </div>
      </article>
      <div class="wrap">${messengerCta(article.topic, article.ctaTitle, {
        eyebrow: article.ctaEyebrow,
        description: article.ctaDescription,
        buttonLabel: article.ctaButtonLabel,
      })}</div>
    `,
  };
};

export const renderPracticeCasePage = (caseOrSlug) => {
  const item = typeof caseOrSlug === "string" ? findPracticeCaseBySlug(caseOrSlug) : caseOrSlug;
  if (!item) throw new Error("Не найден практический кейс");
  const service = services.find((entry) => entry.slug === item.serviceSlug);
  const path = `/praktika/${item.slug}/`;
  const crumbs = [{ name: "Главная", path: "/" }, { name: "Практика", path: "/praktika/" }, { name: item.title, path }];
  const linkedArticles = item.relatedArticleSlugs.map(findArticleBySlug).filter(Boolean);
  const schema = caseSchema(item);

  return {
    title: `${item.title} — юридическая практика | Максим Шевчук`,
    description: item.description,
    image: "/assets/images/maxim-documents.webp",
    imageAlt: `Обезличенный юридический кейс: ${item.title}`,
    imageWidth: 971,
    imageHeight: 1600,
    pageType: "WebPage",
    mainEntityId: schema["@id"],
    schema: [personSchema(), practiceSchema(), breadcrumbSchema(crumbs), schema],
    bodyClass: "editorial-page case-page",
    content: `
      ${breadcrumbs(crumbs)}
      <article class="editorial-article case-article" data-case-id="${esc(item.id)}">
        <header class="editorial-article__header wrap">
          <span class="eyebrow">${esc(item.category)}</span>
          <h1>${esc(item.title)}</h1>
          <p class="editorial-lead">Обезличенный пример работы. Здесь указаны подтверждённые обстоятельства, подготовленные документы и текущий статус дела.</p>
          ${metaLine({ category: "Практика", publishedAt: item.publishedAt })}
        </header>
        <div class="wrap editorial-case-grid">
          <div class="editorial-case-main">
            <section class="article-section"><h2>Ситуация</h2><p>${esc(item.situation)}</p></section>
            <section class="article-section"><h2>Какие материалы изучены</h2><p>${esc(item.materials)}</p></section>
            <section class="article-section"><h2>Что было подготовлено</h2><p>${esc(item.work)}</p></section>
            <section class="article-section editorial-status"><h2>Текущий статус</h2><p>${esc(item.next)}</p></section>
            <section class="article-section"><h2>Практические выводы</h2><ul class="editorial-list editorial-list--dot">${item.lessons.map((lesson) => `<li>${esc(lesson)}</li>`).join("")}</ul></section>
            ${linkedArticles.length ? `<section class="article-section editorial-related"><h2>Разбор по этой теме</h2>${linkedArticles.map(articleCard).join("")}</section>` : ""}
            ${authorCard()}
          </div>
          <aside class="editorial-case-aside"><strong>Ограничения публикации</strong><p>Не раскрываются ФИО, адреса, номера материалов и иные идентификаторы. Описание не является обещанием аналогичного результата.</p><a href="/uslugi/${item.serviceSlug}/">${esc(service?.name || "Услуга по теме")}</a></aside>
        </div>
      </article>
      <div class="wrap">${messengerCta("жалоба на отказ или неполную проверку", "Столкнулись с похожей проверкой?")}</div>
    `,
  };
};

export const editorialPages = {
  articleIndex: renderArticlesIndex,
  practiceIndex: renderPracticeIndex,
  article: renderArticlePage,
  practiceCase: renderPracticeCasePage,
};