import { appendToBuildSlot } from "./html-slots.mjs";
import { publicationSeoMetadata } from "./seo-metadata.mjs";

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const replaceMetaContent = (html, attribute, key, value, pathname) => {
  const pattern = new RegExp(`<meta\\s+[^>]*\\b${attribute}=["']${escapeRegExp(key)}["'][^>]*>`, "i");
  const match = html.match(pattern);
  if (!match) throw new Error(`Не найден meta ${attribute}=${key}: ${pathname}`);
  const tag = /\bcontent=["'][^"']*["']/i.test(match[0])
    ? match[0].replace(/\bcontent=["'][^"']*["']/i, `content="${esc(value)}"`)
    : match[0].replace(/>$/, ` content="${esc(value)}">`);
  return html.replace(match[0], tag);
};

const updateJsonLd = (html, metadata, pathname) => {
  const pattern = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i;
  const match = html.match(pattern);
  if (!match) throw new Error(`Не найден JSON-LD: ${pathname}`);

  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Не удалось разобрать JSON-LD ${pathname}: ${error.message}`);
  }

  const graph = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
  const webPage = graph.find((node) => ["WebPage", "ProfilePage", "ContactPage", "CollectionPage"].includes(node["@type"]));
  const articleNode = graph.find((node) => node["@type"] === "Article");
  if (!webPage || !articleNode) throw new Error(`В JSON-LD публикации отсутствует WebPage или Article: ${pathname}`);

  webPage.name = metadata.title;
  webPage.description = metadata.description;
  articleNode.description = metadata.description;
  articleNode.datePublished = metadata.publishedTime;
  articleNode.dateModified = metadata.modifiedTime;

  const json = JSON.stringify(parsed).replaceAll("<", "\\u003c");
  return html.replace(match[0], `<script type="application/ld+json">${json}</script>`);
};

const applyPublicationMetadata = (html, context, pathname) => {
  const metadata = publicationSeoMetadata(context);
  if (!metadata) return html;

  let result = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(metadata.title)}</title>`);
  result = replaceMetaContent(result, "name", "description", metadata.description, pathname);
  result = replaceMetaContent(result, "property", "og:type", metadata.openGraphType, pathname);
  result = replaceMetaContent(result, "property", "og:title", metadata.title, pathname);
  result = replaceMetaContent(result, "property", "og:description", metadata.description, pathname);
  result = replaceMetaContent(result, "name", "twitter:title", metadata.title, pathname);
  result = replaceMetaContent(result, "name", "twitter:description", metadata.description, pathname);

  if (/property=["']article:(?:published_time|modified_time|author|section)["']/i.test(result)) {
    throw new Error(`Article Open Graph уже присутствует до редакционного этапа: ${pathname}`);
  }

  const articleMetadata = `
  <meta property="article:published_time" content="${esc(metadata.publishedTime)}">
  <meta property="article:modified_time" content="${esc(metadata.modifiedTime)}">
  <meta property="article:author" content="${esc(metadata.authorUrl)}">
  <meta property="article:section" content="${esc(metadata.section)}">`;
  result = result.replace(
    /(<meta\s+property=["']og:type["'][^>]*>)/i,
    `$1${articleMetadata}`,
  );

  return updateJsonLd(result, metadata, pathname);
};

const articleIntake = (article) => {
  const items = [
    "что произошло и когда",
    "что вы уже сделали и какой получили ответ",
    "какого результата хотите добиться",
  ];
  const topic = article.topic || article.title;
  return `
    <section class="article-section editorial-intake" id="self-check" data-article-section="self-check">
      <div class="editorial-intake__grid">
        <div>
          <span class="editorial-intake__eyebrow">Перед сообщением юристу</span>
          <h2>Что кратко описать</h2>
          <p>Юридические термины не нужны. Напишите обычными словами:</p>
          <ul class="editorial-checklist">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </div>
        <aside class="editorial-intake__questions">
          <strong>Что можно спросить у юриста</strong>
          <ul>
            <li>достаточно ли имеющихся доказательств;</li>
            <li>что лучше сделать сначала;</li>
            <li>есть ли важные сроки;</li>
            <li>какой документ нужен первым.</li>
          </ul>
          <button class="button button--gold" type="button" data-dialog-open data-topic="${esc(topic)}">Проверить свою ситуацию</button>
        </aside>
      </div>
    </section>
    <section class="article-section editorial-message-guide" id="message-guide" data-article-section="message-guide">
      <h2>Что написать юристу</h2>
      <p>Укажите в нескольких предложениях: что произошло, даты, участников, какие документы сохранились, что уже предпринималось и какой результат нужен. Этого достаточно, чтобы понять, с чего начинать проверку.</p>
    </section>`;
};

const helpfulness = (id, kind) => `
    <section class="editorial-helpfulness" aria-labelledby="editorial-helpfulness-title" data-editorial-helpfulness data-publication-id="${esc(id)}" data-publication-kind="${esc(kind)}">
      <div class="editorial-helpfulness__copy">
        <h2 id="editorial-helpfulness-title">Статья была полезна?</h2>
      </div>
      <div class="editorial-helpfulness__actions" role="group" aria-label="Оценка полезности материала">
        <button type="button" aria-pressed="false" data-helpfulness-value="yes">Да</button>
        <button type="button" aria-pressed="false" data-helpfulness-value="no">Нет</button>
        <button type="button" aria-pressed="false" data-helpfulness-value="partly">Частично</button>
      </div>
      <p data-helpfulness-status aria-live="polite" aria-atomic="true"></p>
    </section>`;

const injectBefore = (html, marker, content, label) => {
  if (!html.includes(marker)) throw new Error(`Не найдено место для редакционного блока: ${label}`);
  return html.replace(marker, `${content}${marker}`);
};

const injectBeforePattern = (html, pattern, content, label) => {
  const match = html.match(pattern);
  if (!match) throw new Error(`Не найдено место для редакционного блока: ${label}`);
  return html.replace(match[0], `${content}${match[0]}`);
};

export const injectEditorialEnhancements = (html, pathname, context = {}) => {
  const article = context.article || null;
  const practiceCase = context.practiceCase || null;
  if (!article && !practiceCase) return html;

  let result = applyPublicationMetadata(html, { article, practiceCase }, pathname);
  result = appendToBuildSlot(
    result,
    "head-assets",
    '  <script type="module" src="/assets/editorial-analytics.mjs"></script>\n',
  );

  if (article) {
    if (result.includes("data-editorial-helpfulness")) throw new Error(`Редакционные блоки уже добавлены: ${pathname}`);
    result = injectBefore(
      result,
      '<section class="article-section" id="sources">',
      articleIntake(article),
      `${pathname}: перед источниками`,
    );
    result = injectBeforePattern(
      result,
      /<div class="wrap">\s*<section class="editorial-cta"/,
      `<div class="wrap">${helpfulness(article.id, "article")}</div>`,
      `${pathname}: перед итоговым CTA`,
    );
    return result.replace(
      '<article class="editorial-article"',
      '<article class="editorial-article" data-publication-kind="article"',
    );
  }

  if (practiceCase) {
    result = injectBeforePattern(
      result,
      /<div class="wrap">\s*<section class="editorial-cta"/,
      `<div class="wrap">${helpfulness(practiceCase.id, "case")}</div>`,
      `${pathname}: перед итоговым CTA кейса`,
    );
    return result.replace(
      '<article class="editorial-article case-article"',
      '<article class="editorial-article case-article" data-publication-kind="case"',
    );
  }

  return result;
};
