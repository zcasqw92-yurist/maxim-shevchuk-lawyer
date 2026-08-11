import {
  renderArticlePage as renderBaseArticlePage,
  renderArticlesIndex as renderBaseArticlesIndex,
  renderPracticeCasePage as renderBasePracticeCasePage,
  renderPracticeIndex as renderBasePracticeIndex,
} from "./editorial-render-base.mjs";
import { findArticleBySlug } from "./editorial-data.mjs";

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizePublicLanguage = (content = "") => String(content)
  .replaceAll("<strong>Короткий ответ</strong>", "<strong>Что делать</strong>")
  .replaceAll("Кратко укажите, что произошло, какие документы есть и что вы уже сделали.", "Укажите, что произошло, какие документы есть и что вы уже сделали.");

const normalizePage = (page) => ({ ...page, content: normalizePublicLanguage(page.content) });

const renderRisk = (text) => text
  ? `<aside class="editorial-note editorial-risk"><p>${esc(text)}</p></aside>`
  : "";

const renderRelatedLinks = (links = []) => links
  .map((link) => `<p class="editorial-related-link"><a href="${esc(link.href)}">${esc(link.text)}</a></p>`)
  .join("");

const renderSoftCta = (cta) => cta?.href && cta?.label
  ? `<p class="editorial-soft-cta"><a href="${esc(cta.href)}">${esc(cta.label)}</a></p>`
  : "";

const insertBeforeSection = (content, sectionId, html) => {
  if (!html) return content;
  const pattern = new RegExp(`(<section class="article-section" id="${escapeRegExp(sectionId)}"[^>]*>)`);
  return content.replace(pattern, `${html}\n$1`);
};

const insertBeforeSectionClose = (content, sectionId, html) => {
  if (!html) return content;
  const pattern = new RegExp(`(<section class="article-section" id="${escapeRegExp(sectionId)}"[^>]*>[\\s\\S]*?)(</section>)`);
  return content.replace(pattern, `$1${html}$2`);
};

const finalListClass = (kind) => {
  if (kind === "check") return "editorial-checklist";
  if (["cross", "dot", "dash"].includes(kind)) return `editorial-list editorial-list--${kind}`;
  return "editorial-list editorial-list--dot";
};

const renderFinalSection = (section) => {
  if (!section?.id || !section?.title) return "";
  const [primaryGroup, ...sideGroups] = section.groups || [];
  const paragraphs = (section.paragraphs || []).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("");
  const primary = primaryGroup
    ? `<h3>${esc(primaryGroup.title)}</h3><ul class="${finalListClass(primaryGroup.kind)}">${(primaryGroup.items || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
    : "";
  const benefit = section.benefit ? `<p>${esc(section.benefit)}</p>` : "";
  const side = sideGroups.map((group) => `
      <strong>${esc(group.title)}</strong>
      <ul class="${finalListClass(group.kind)}">${(group.items || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`).join("");
  const button = section.buttonLabel && section.topic
    ? `<button class="button button--gold" type="button" data-dialog-open data-topic="${esc(section.topic)}">${esc(section.buttonLabel)}</button>`
    : "";
  return `
  <section class="article-section editorial-intake editorial-final-conversion" id="${esc(section.id)}" data-article-section="${esc(section.id)}">
    <div class="editorial-intake__grid">
      <div>
        <h2 style="overflow-wrap:anywhere">${esc(section.title)}</h2>
        ${paragraphs}
        ${primary}
        ${benefit}
      </div>
      <aside class="editorial-intake__questions">
        ${side}
        ${button}
      </aside>
    </div>
  </section>`;
};

const applyExtendedArticleBlocks = (page, article) => {
  if (!article) return page;
  let content = page.content;

  const firstSection = article.sections?.[0];
  if (firstSection?.introRisk) content = insertBeforeSection(content, firstSection.id, renderRisk(firstSection.introRisk));

  for (const section of article.sections || []) {
    const afterChecklist = (section.afterChecklistParagraphs || []).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("");
    const afterRisk = renderRisk(section.afterParagraphRisk);
    const related = renderRelatedLinks(section.relatedLinks);
    const softCta = renderSoftCta(section.softCta);
    content = insertBeforeSectionClose(content, section.id, `${afterChecklist}${afterRisk}${related}${softCta}`);
  }

  if (article.finalSection) {
    const finalHtml = renderFinalSection(article.finalSection);
    content = content.replace(
      /(<section class="article-section" id="faq">[\s\S]*?<\/section>)/,
      `$1${finalHtml}`,
    );
    content = content.replace(
      /(<aside class="editorial-toc"[^>]*><strong>Содержание<\/strong><ol>[\s\S]*?)(<\/ol><\/aside>)/,
      `$1<li><a href="#${esc(article.finalSection.id)}">${esc(article.finalSection.title)}</a></li>$2`,
    );
  }

  if (article.inlineFinalCta && !article.finalSection) {
    content = content.replace(
      /\s*<div class="wrap">\s*<section class="editorial-cta"[\s\S]*?<\/section>\s*<\/div>\s*$/,
      "\n",
    );
  }

  return { ...page, content };
};

export const renderArticlesIndex = () => normalizePage(renderBaseArticlesIndex());
export const renderPracticeIndex = () => normalizePage(renderBasePracticeIndex());
export const renderPracticeCasePage = (caseOrSlug) => normalizePage(renderBasePracticeCasePage(caseOrSlug));

export const renderArticlePage = (articleOrSlug) => {
  const article = typeof articleOrSlug === "string" ? findArticleBySlug(articleOrSlug) : articleOrSlug;
  let page = renderBaseArticlePage(articleOrSlug);
  page = applyExtendedArticleBlocks(page, article);
  const content = normalizePublicLanguage(page.content).replace(
    /(<section class="article-section" id="[^"]+"[^>]*>\s*)<h2>/g,
    '$1<h2 style="overflow-wrap:anywhere">',
  );
  return { ...page, content };
};