import { appendToBuildSlot } from "./html-slots.mjs";

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const unique = (items) => [...new Set(items.filter(Boolean))];

const collectChecklist = (article) => unique(
  (article.sections || [])
    .flatMap((section) => section.checklist || [])
    .map((item) => String(item).replace(/[.;]+$/, ""))
    .slice(0, 5),
);

const articleIntake = (article) => {
  const checklist = collectChecklist(article);
  const items = checklist.length >= 3 ? checklist : [
    "краткая хронология с датами",
    "документы, переписка и подтверждения отправки",
    "последний ответ, отказ или сведения об отсутствии ответа",
  ];
  const topic = article.topic || article.title;
  return `
    <section class="article-section editorial-intake" id="self-check" data-article-section="self-check">
      <div class="editorial-intake__grid">
        <div>
          <span class="editorial-intake__eyebrow">Сверьте свою ситуацию</span>
          <h2>Что подготовить для предметного первого сообщения</h2>
          <p>Не нужно заранее составлять юридический документ. Достаточно кратко зафиксировать факты и перечислить то, что уже подтверждает ситуацию.</p>
          <ul class="editorial-checklist">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </div>
        <aside class="editorial-intake__questions">
          <strong>Что можно спросить у юриста</strong>
          <ul>
            <li>достаточно ли имеющихся доказательств;</li>
            <li>какой путь сильнее именно сейчас;</li>
            <li>какие сроки и риски нельзя упустить;</li>
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
        <span>Обратная связь без персональных данных</span>
        <h2 id="editorial-helpfulness-title">Материал помог понять следующий шаг?</h2>
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

  let result = appendToBuildSlot(
    html,
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
