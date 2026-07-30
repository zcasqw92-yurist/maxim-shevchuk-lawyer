import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { site } from "../site.config.mjs";

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const href = (pathname) => `${site.basePath || ""}${pathname}`;
const articlePath = (item) => `/razbory/${item.slug}/`;
const casePath = (item) => `/praktika/${item.slug}/`;
const servicePath = (item) => `/uslugi/${item.slug}/`;
const byFreshness = (left, right) => (right.modifiedAt || right.publishedAt || "").localeCompare(left.modifiedAt || left.publishedAt || "") || left.slug.localeCompare(right.slug);
const uniqueBy = (items, key) => [...new Map(items.map((item) => [item[key], item])).values()];
const hasHref = (html, pathname) => html.includes(`href="${href(pathname)}"`) || html.includes(`href="${pathname}"`);

const articleCard = (item) => `
        <article class="editorial-card publication-linking__card">
          <span class="editorial-card__category">${esc(item.category)}</span>
          <h3><a href="${href(articlePath(item))}">${esc(item.title)}</a></h3>
          <p>${esc(item.lead)}</p>
          <a class="card-link" href="${href(articlePath(item))}">Читать разбор</a>
        </article>`;

const caseCard = (item) => `
        <article class="editorial-card editorial-card--case publication-linking__card">
          <span class="editorial-card__category">Практика</span>
          <h3><a href="${href(casePath(item))}">${esc(item.title)}</a></h3>
          <p>${esc(item.situation)}</p>
          <a class="card-link" href="${href(casePath(item))}">Открыть кейс</a>
        </article>`;

const insertBefore = (html, marker, content, label) => {
  if (!content) return html;
  if (!html.includes(marker)) throw new Error(`Перелинковка: не найдено место вставки ${label}`);
  return html.replace(marker, `${content}${marker}`);
};

const serviceMaterialsBlock = ({ service, articles, practiceCases, html }) => {
  const serviceArticles = articles.filter((item) => item.serviceSlug === service.slug).sort(byFreshness);
  const missingCases = practiceCases
    .filter((item) => item.serviceSlug === service.slug && !hasHref(html, casePath(item)))
    .sort(byFreshness);
  if (!serviceArticles.length && !missingCases.length) return "";

  return `
      <div class="section publication-linking publication-linking--service" aria-labelledby="publication-linking-${esc(service.slug)}">
        <div class="wrap">
          <div class="section-head section-head--split reveal">
            <div><span class="eyebrow">Материалы по направлению</span><div class="publication-linking__title" id="publication-linking-${esc(service.slug)}" role="heading" aria-level="2">Разборы и практика по этой теме</div></div>
            <p>Новые публикации этого направления добавляются сюда автоматически после прохождения редакционной и технической проверки.</p>
          </div>
          <div class="editorial-grid publication-linking__grid">${serviceArticles.map(articleCard).join("")}${missingCases.map(caseCard).join("")}</div>
        </div>
      </div>`;
};

const relatedMaterialsBlock = ({ current, articles, practiceCases, html, kind }) => {
  const sameServiceArticles = articles.filter((item) => item.serviceSlug === current.serviceSlug && item.slug !== current.slug).sort(byFreshness);
  const explicitArticles = kind === "case"
    ? (current.relatedArticleSlugs || []).map((slug) => articles.find((item) => item.slug === slug)).filter(Boolean)
    : [];
  const relatedArticles = uniqueBy([...explicitArticles, ...sameServiceArticles], "slug")
    .filter((item) => !hasHref(html, articlePath(item)))
    .slice(0, 4);
  const relatedCases = kind === "article"
    ? practiceCases.filter((item) => item.serviceSlug === current.serviceSlug && !hasHref(html, casePath(item))).sort(byFreshness).slice(0, 2)
    : [];
  if (!relatedArticles.length && !relatedCases.length) return "";

  return `
            <div class="article-section editorial-related publication-linking publication-linking--${kind}">
              <div class="publication-linking__title" role="heading" aria-level="2">Другие материалы по этому направлению</div>
              <div class="editorial-grid publication-linking__grid">${relatedArticles.map(articleCard).join("")}${relatedCases.map(caseCard).join("")}</div>
            </div>`;
};

const updateCaseCta = (html, practiceCase, services) => {
  const service = services.find((item) => item.slug === practiceCase.serviceSlug);
  if (!service) return html;
  const cta = html.match(/<section class="editorial-cta"[\s\S]*?<\/section>/)?.[0];
  if (!cta) throw new Error(`Перелинковка: не найден итоговый CTA кейса ${practiceCase.slug}`);
  const title = `Есть похожая задача по направлению «${service.name}»?`;
  const topic = `похожая ситуация: ${service.name.toLowerCase()}`;
  const updated = cta
    .replace(/<h2 id="editorial-cta-title">[\s\S]*?<\/h2>/, `<h2 id="editorial-cta-title">${esc(title)}</h2>`)
    .replace(/data-topic="[^"]*"/, `data-topic="${esc(topic)}"`);
  return html.replace(cta, updated);
};

export const validatePublicationLinking = ({ services, articles, practiceCases }) => {
  const errors = [];
  const serviceMap = new Map(services.map((item) => [item.slug, item]));
  const articleMap = new Map(articles.map((item) => [item.slug, item]));
  const caseMap = new Map(practiceCases.map((item) => [item.id, item]));

  for (const article of articles) {
    if (!serviceMap.has(article.serviceSlug)) errors.push(`Статья ${article.slug}: связанная услуга ${article.serviceSlug} не существует`);
    for (const caseId of article.relatedCaseIds || []) {
      const linkedCase = caseMap.get(caseId);
      if (!linkedCase) errors.push(`Статья ${article.slug}: кейс ${caseId} не существует`);
      else if (linkedCase.serviceSlug !== article.serviceSlug) errors.push(`Статья ${article.slug}: кейс ${caseId} относится к другому направлению`);
    }
  }

  for (const item of practiceCases) {
    if (!serviceMap.has(item.serviceSlug)) errors.push(`Кейс ${item.slug}: связанная услуга ${item.serviceSlug} не существует`);
    const serviceArticles = articles.filter((article) => article.serviceSlug === item.serviceSlug);
    if (serviceArticles.length && !(item.relatedArticleSlugs || []).length) errors.push(`Кейс ${item.slug}: не указан ни один связанный разбор`);
    for (const slug of item.relatedArticleSlugs || []) {
      const linkedArticle = articleMap.get(slug);
      if (!linkedArticle) errors.push(`Кейс ${item.slug}: статья ${slug} не существует`);
      else if (linkedArticle.serviceSlug !== item.serviceSlug) errors.push(`Кейс ${item.slug}: статья ${slug} относится к другому направлению`);
    }
  }

  if (errors.length) throw new Error(`Правило перелинковки не пройдено:\n- ${errors.join("\n- ")}`);
  return true;
};

export const applyPublicationLinkingToDist = async ({ root, services, articles, practiceCases }) => {
  validatePublicationLinking({ services, articles, practiceCases });
  const dist = join(root, "dist");
  const pageFile = (pathname) => join(dist, pathname.replace(/^\/+|\/+$/g, ""), "index.html");

  for (const service of services) {
    const file = pageFile(servicePath(service));
    let html = await readFile(file, "utf8");
    if (html.includes("publication-linking--service")) throw new Error(`Перелинковка уже применена: ${service.slug}`);
    const block = serviceMaterialsBlock({ service, articles, practiceCases, html });
    html = insertBefore(html, '<section class="section section--consultation">', block, `на странице услуги ${service.slug}`);
    await writeFile(file, html, "utf8");
  }

  for (const article of articles) {
    const file = pageFile(articlePath(article));
    let html = await readFile(file, "utf8");
    const block = relatedMaterialsBlock({ current: article, articles, practiceCases, html, kind: "article" });
    html = insertBefore(html, '<aside class="editorial-author"', block, `в статье ${article.slug}`);
    await writeFile(file, html, "utf8");
  }

  for (const practiceCase of practiceCases) {
    const file = pageFile(casePath(practiceCase));
    let html = await readFile(file, "utf8");
    const block = relatedMaterialsBlock({ current: practiceCase, articles, practiceCases, html, kind: "case" });
    html = insertBefore(html, '<aside class="editorial-author"', block, `в кейсе ${practiceCase.slug}`);
    html = updateCaseCta(html, practiceCase, services);
    await writeFile(file, html, "utf8");
  }
};
