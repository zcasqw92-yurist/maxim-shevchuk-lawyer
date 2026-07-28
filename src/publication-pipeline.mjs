const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const allowedStatuses = new Set(["published"]);

const ensure = (condition, message, errors) => {
  if (!condition) errors.push(message);
};

const uniqueValues = (values) => new Set(values).size === values.length;

const validateDateOrder = (item, label, errors) => {
  ensure(datePattern.test(item.publishedAt || ""), `${label}: некорректная дата публикации`, errors);
  ensure(datePattern.test(item.modifiedAt || ""), `${label}: некорректная дата изменения`, errors);
  if (datePattern.test(item.publishedAt || "") && datePattern.test(item.modifiedAt || "")) {
    ensure(item.modifiedAt >= item.publishedAt, `${label}: modifiedAt раньше publishedAt`, errors);
  }
};

export const validatePublicationPipeline = ({ articles, practiceCases, services }) => {
  const errors = [];
  const serviceSlugs = new Set(services.map((item) => item.slug));
  const articleSlugs = new Set(articles.map((item) => item.slug));
  const caseIds = new Set(practiceCases.map((item) => item.id));

  ensure(uniqueValues(articles.map((item) => item.id)), "Повторяются ID статей", errors);
  ensure(uniqueValues(articles.map((item) => item.slug)), "Повторяются slug статей", errors);
  ensure(uniqueValues(practiceCases.map((item) => item.id)), "Повторяются ID кейсов", errors);
  ensure(uniqueValues(practiceCases.map((item) => item.slug)), "Повторяются slug кейсов", errors);

  for (const article of articles) {
    const label = `Статья ${article.slug || article.id || "без slug"}`;
    ensure(allowedStatuses.has(article.status), `${label}: в публикуемом массиве допускается только status=published`, errors);
    ensure(slugPattern.test(article.slug || ""), `${label}: некорректный slug`, errors);
    ensure(String(article.title || "").length >= 30, `${label}: слишком короткий заголовок`, errors);
    ensure(String(article.seoTitle || "").length >= 30 && String(article.seoTitle || "").length <= 80, `${label}: seoTitle должен содержать 30–80 символов`, errors);
    ensure(String(article.description || "").length >= 100 && String(article.description || "").length <= 220, `${label}: description должен содержать 100–220 символов`, errors);
    ensure(String(article.lead || "").length >= 100, `${label}: лид недостаточно раскрывает ситуацию`, errors);
    ensure(String(article.shortAnswer || "").length >= 140, `${label}: короткий ответ недостаточно содержателен`, errors);
    ensure(Number.isInteger(article.readingMinutes) && article.readingMinutes > 0, `${label}: readingMinutes должен быть положительным целым числом`, errors);
    ensure(Array.isArray(article.sections) && article.sections.length >= 4, `${label}: требуется не менее четырёх смысловых разделов`, errors);
    ensure(Array.isArray(article.faq) && article.faq.length >= 2, `${label}: требуется не менее двух FAQ`, errors);
    ensure(Array.isArray(article.sources) && article.sources.length >= 2, `${label}: требуется не менее двух официальных источников`, errors);
    ensure(serviceSlugs.has(article.serviceSlug), `${label}: связанная услуга не существует`, errors);
    ensure((article.relatedCaseIds || []).every((id) => caseIds.has(id)), `${label}: есть ссылка на несуществующий кейс`, errors);
    ensure(uniqueValues((article.sources || []).map((source) => source.url)), `${label}: источники повторяются`, errors);
    for (const source of article.sources || []) {
      ensure(/^https:\/\//.test(source.url || ""), `${label}: источник должен использовать HTTPS`, errors);
      ensure(String(source.title || "").length >= 12, `${label}: источник должен иметь понятное название`, errors);
    }
    validateDateOrder(article, label, errors);
    ensure(datePattern.test(article.legalReviewedAt || ""), `${label}: отсутствует дата юридической проверки`, errors);
    if (datePattern.test(article.legalReviewedAt || "") && datePattern.test(article.modifiedAt || "")) {
      ensure(article.legalReviewedAt >= article.publishedAt && article.legalReviewedAt <= article.modifiedAt, `${label}: дата юридической проверки выходит за диапазон публикации`, errors);
    }
  }

  for (const item of practiceCases) {
    const label = `Кейс ${item.slug || item.id || "без slug"}`;
    ensure(allowedStatuses.has(item.status), `${label}: в публикуемом массиве допускается только status=published`, errors);
    ensure(slugPattern.test(item.slug || ""), `${label}: некорректный slug`, errors);
    ensure(String(item.title || "").length >= 25, `${label}: слишком короткий заголовок`, errors);
    ensure(String(item.description || "").length >= 100, `${label}: описание недостаточно раскрывает кейс`, errors);
    ensure(String(item.situation || "").length >= 100, `${label}: ситуация описана слишком кратко`, errors);
    ensure(String(item.materials || "").length >= 60, `${label}: не раскрыты изученные материалы`, errors);
    ensure(String(item.work || "").length >= 60, `${label}: не раскрыта выполненная работа`, errors);
    ensure(String(item.next || "").length >= 60, `${label}: текущий статус описан слишком кратко`, errors);
    ensure(Array.isArray(item.lessons) && item.lessons.length >= 2, `${label}: требуется не менее двух практических выводов`, errors);
    ensure(serviceSlugs.has(item.serviceSlug), `${label}: связанная услуга не существует`, errors);
    ensure((item.relatedArticleSlugs || []).every((slug) => articleSlugs.has(slug)), `${label}: есть ссылка на несуществующую статью`, errors);
    validateDateOrder(item, label, errors);
  }

  if (errors.length) throw new Error(`Редакционный шлюз публикации не пройден:\n- ${errors.join("\n- ")}`);
  return true;
};

export const buildPublicationManifest = ({ articles, practiceCases, generatedAt, siteUrl }) => ({
  schemaVersion: 1,
  generatedAt,
  siteUrl,
  counts: {
    articles: articles.length,
    practiceCases: practiceCases.length,
  },
  articles: articles.map((article) => ({
    id: article.id,
    slug: article.slug,
    status: article.status,
    url: `${siteUrl}/razbory/${article.slug}/`,
    category: article.category,
    serviceSlug: article.serviceSlug,
    publishedAt: article.publishedAt,
    modifiedAt: article.modifiedAt,
    legalReviewedAt: article.legalReviewedAt,
    sourceCount: article.sources.length,
    sectionCount: article.sections.length,
    faqCount: article.faq.length,
  })),
  practiceCases: practiceCases.map((item) => ({
    id: item.id,
    slug: item.slug,
    status: item.status,
    url: `${siteUrl}/praktika/${item.slug}/`,
    category: item.category,
    serviceSlug: item.serviceSlug,
    publishedAt: item.publishedAt,
    modifiedAt: item.modifiedAt,
    lessonCount: item.lessons.length,
  })),
});

export const createUrlset = ({ entries, siteUrl, contentDateForPath, xml, includeImages = false }) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${includeImages ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ""}>\n${entries.map(({ path, images = [] }) => `  <url>\n    <loc>${xml(`${siteUrl}${path}`)}</loc>\n    <lastmod>${xml(contentDateForPath(path))}</lastmod>${includeImages ? images.map((image) => `\n    <image:image><image:loc>${xml(`${siteUrl}${image}`)}</image:loc></image:image>`).join("") : ""}\n  </url>`).join("\n")}\n</urlset>\n`;

export const createImageSitemap = ({ entries, siteUrl, xml }) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.filter(({ images = [] }) => images.length).map(({ path, images }) => `  <url>\n    <loc>${xml(`${siteUrl}${path}`)}</loc>${images.map((image) => `\n    <image:image><image:loc>${xml(`${siteUrl}${image}`)}</image:loc></image:image>`).join("")}\n  </url>`).join("\n")}\n</urlset>\n`;
