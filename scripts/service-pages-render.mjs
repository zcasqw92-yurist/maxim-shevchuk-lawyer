import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { servicePageContent } from "./service-pages-overrides.mjs";

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const replaceRequired = (html, from, to, label) => {
  if (!html.includes(from)) throw new Error(`Не найден обязательный фрагмент страницы услуги: ${label}`);
  return html.replace(from, to);
};

const replaceServiceCard = (html, content, slug) => {
  const pattern = /<aside class="service-hero__card">[\s\S]*?<\/aside>/;
  const match = html.match(pattern);
  if (!match) throw new Error(`Не найдена карточка материалов: ${slug}`);
  const original = match[0];
  const icon = original.match(/<span class="service-hero__icon">[\s\S]*?<\/span>/)?.[0] || "";
  const price = original.match(/<div class="service-hero__price">[\s\S]*?<\/div>/)?.[0] || "";
  const checkIcon = original.match(/<li>(<svg[\s\S]*?<\/svg>)Факты<\/li>/)?.[1] || "";
  const items = content.cardItems.map((item) => `<li>${checkIcon}${escapeHtml(item)}</li>`).join("");
  return html.replace(original, `<aside class="service-hero__card">${icon}<strong>${escapeHtml(content.cardTitle)}</strong><p>${escapeHtml(content.cardText)}</p>${price}<ul>${items}</ul></aside>`);
};

const replaceProcess = (html, content, slug) => {
  const pattern = /\n\s*<section class="section section--process">[\s\S]*?<\/section>/;
  if (!pattern.test(html)) throw new Error(`Не найден процесс работы: ${slug}`);
  const section = `
      <section class="section section--process"><div class="wrap"><div class="section-head reveal"><span class="eyebrow">Последовательность</span><h2>${escapeHtml(content.processTitle)}</h2></div><ol class="process-line">${content.process.map(([title, text], index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></li>`).join("")}</ol></div></section>`;
  return html.replace(pattern, section);
};

const replaceFinalCta = (html, content, slug) => {
  const pattern = /(<section class="section section--cta">[\s\S]*?<h2>)[\s\S]*?(<\/h2>\s*<p>)[\s\S]*?(<\/p>)/;
  if (!pattern.test(html)) throw new Error(`Не найден финальный CTA: ${slug}`);
  let result = html.replace(pattern, `$1${escapeHtml(content.ctaTitle)}$2${escapeHtml(content.ctaText)}$3`);
  result = replaceRequired(
    result,
    '<button class="button button--gold" type="button" data-dialog-open>',
    `<button class="button button--gold" type="button" data-dialog-open data-topic="${escapeHtml(content.topic)}" data-message="${escapeHtml(content.message)}">`,
    `${slug}: финальная кнопка`,
  );
  return result;
};

const typographyCss = `

/* Readable editorial type scale: restrained on desktop and compact on mobile. */
@layer base {
  h1 { font-size: clamp(2.75rem, 5vw, 4.75rem); }
  h2 { font-size: clamp(2rem, 3.6vw, 3.5rem); }
  h3 { font-size: clamp(1.2rem, 1.7vw, 1.45rem); }
}

@layer components {
  .lead { font-size: clamp(1.0625rem, 1.5vw, 1.25rem); line-height: 1.65; }
  .section-head--split p { font-size: clamp(1rem, 1.35vw, 1.0625rem); line-height: 1.65; }
  .messenger-dialog__content h2 { font-size: clamp(2rem, 4.2vw, 2.75rem); }
  .price-quiz__step h2, .price-quiz__result h2, .callback-form > h2 { font-size: clamp(1.95rem, 4vw, 2.7rem); }
}

@layer sections {
  .hero h1 { font-size: clamp(2.9rem, 5.2vw, 4.9rem); }
  .hero__lead { font-size: clamp(1.0625rem, 1.55vw, 1.1875rem); line-height: 1.65; }
  .inner-hero h1 { font-size: clamp(2.75rem, 4.8vw, 4.75rem); }
  .inner-hero h1 + p { font-size: 1.125rem; line-height: 1.65; }
  .service-hero h1 { max-width: 860px; font-size: clamp(2.75rem, 4.6vw, 4.6rem); }
  .service-hero h1 + p { font-size: 1.125rem; line-height: 1.65; }
  .service-hero__card strong { font-size: clamp(1.45rem, 2vw, 1.7rem); }
  .service-hero__card > p { font-size: .875rem; line-height: 1.65; }
  .two-lists h2 { font-size: clamp(2rem, 3.2vw, 3rem); }
  .number-list p, .plain-checks li { font-size: 1rem; line-height: 1.6; }
  .process-line strong { font-size: clamp(1.25rem, 1.8vw, 1.45rem); }
  .process-line p { font-size: .9375rem; line-height: 1.6; }
}

@layer utilities {
  @media (max-width: 680px) {
    h1 { font-size: clamp(2.25rem, 10vw, 3rem); }
    h2 { font-size: clamp(1.875rem, 8vw, 2.5rem); }
    h3 { font-size: 1.25rem; }
    .hero h1 { font-size: clamp(2.35rem, 10.5vw, 3.15rem); }
    .hero__lead, .service-hero h1 + p, .inner-hero h1 + p, .lead { font-size: 1.0625rem; line-height: 1.65; }
    .inner-hero h1, .service-hero h1, .about-hero h1, .contact-page__intro h1 { font-size: clamp(2.25rem, 10vw, 3rem); }
    .two-lists h2 { font-size: clamp(1.875rem, 8vw, 2.4rem); }
    .messenger-dialog__content h2, .price-quiz__step h2, .price-quiz__result h2, .callback-form > h2 { font-size: clamp(1.9rem, 8.5vw, 2.4rem); }
    .button { font-size: .9375rem; }
    .service-hero__card strong { font-size: 1.5rem; }
    .service-hero__card > p, .process-line p, .paper-panel__note { font-size: .9375rem; }
    .number-list p, .plain-checks li { font-size: 1rem; }
  }
}
`;

const updateServicePage = async (file, service, content) => {
  let html = await readFile(file, "utf8");
  html = replaceRequired(
    html,
    `<span class="eyebrow">${escapeHtml(service.eyebrow)}</span><h1>${escapeHtml(service.title)}</h1><p>${escapeHtml(service.lead)}</p>`,
    `<span class="eyebrow">${escapeHtml(content.eyebrow)}</span><h1>${escapeHtml(content.title)}</h1><p>${escapeHtml(content.lead)}</p>`,
    `${service.slug}: первый экран`,
  );
  html = replaceRequired(
    html,
    `data-dialog-open data-topic="${escapeHtml(service.name)}">Обсудить ситуацию`,
    `data-dialog-open data-topic="${escapeHtml(content.topic)}" data-message="${escapeHtml(content.message)}">${escapeHtml(content.button)}`,
    `${service.slug}: основная кнопка`,
  );
  html = replaceServiceCard(html, content, service.slug);
  html = replaceRequired(html, '<span class="eyebrow">Когда это направление подходит</span><h2>Типовые исходные ситуации</h2>', `<span class="eyebrow">Когда подходит услуга</span><h2>${escapeHtml(content.situationsTitle)}</h2>`, `${service.slug}: ситуации`);
  html = replaceRequired(html, '<span class="eyebrow">Что входит в результат</span><h2>Позиция, которой можно пользоваться</h2>', `<span class="eyebrow">Что получите</span><h2>${escapeHtml(content.resultTitle)}</h2>`, `${service.slug}: результат`);
  html = replaceRequired(html, '<p class="paper-panel__note">Точный состав документа и требований зависит от правовой квалификации конкретных обстоятельств.</p>', `<p class="paper-panel__note">${escapeHtml(content.resultNote)}</p>`, `${service.slug}: пояснение результата`);
  html = replaceProcess(html, content, service.slug);
  html = replaceRequired(html, '<h2>Документ готовит Максим Юрьевич</h2><p class="lead">Формулировки связываются с вашими фактами и приложениями. После подготовки вы понимаете не только что направить, но и как реагировать на дальнейшее развитие спора.</p>', `<h2>${escapeHtml(content.supportTitle)}</h2><p class="lead">${escapeHtml(content.supportLead)}</p>`, `${service.slug}: поддержка после документа`);
  html = replaceFinalCta(html, content, service.slug);
  await writeFile(file, html, "utf8");
};

export const applyServicePageOverrides = async ({ dist, services }) => {
  for (const service of services) {
    const content = servicePageContent[service.slug];
    if (!content) throw new Error(`Не настроена индивидуальная страница услуги: ${service.slug}`);
    await updateServicePage(join(dist, "uslugi", service.slug, "index.html"), service, content);
  }
  const stylesFile = join(dist, "assets", "styles.css");
  const styles = await readFile(stylesFile, "utf8");
  if (styles.includes("Readable editorial type scale")) throw new Error("Типографическая шкала уже добавлена");
  await writeFile(stylesFile, `${styles}${typographyCss}`, "utf8");
};
