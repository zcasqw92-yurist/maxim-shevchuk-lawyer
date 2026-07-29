import { site } from "../site.config.mjs";

const MAX_TITLE_LENGTH = 65;

const publicationTitleOverrides = {
  article: {
    "police-refusal-next-steps": "Отказ полиции: как обжаловать постановление",
    "debt-receipt-order-or-claim": "Долг по расписке: приказ или иск",
    "debt-third-party-card": "Долг на чужой карте: с кого взыскивать",
    "debt-no-return-term": "Долг без срока возврата: что делать",
  },
  case: {
    "police-review": "Отмена отказа полиции: дополнительная проверка",
    "debt-demand": "Претензия и расчёт по долгу",
  },
};

const publicationDescriptionOverrides = {
  article: {},
  case: {
    "debt-demand": "Оплаченная юридическая работа по долгу: подготовлены досудебная претензия, расчёт процентов и комплект приложений без заявления неподтверждённого результата взыскания.",
  },
};

const brandedTitle = (base) => `${base} | ${site.shortName}`;

const assertMetadata = (metadata, id) => {
  if (!metadata.title || !metadata.description) {
    throw new Error(`Неполные SEO-метаданные публикации: ${id}`);
  }
  if (metadata.title.length > MAX_TITLE_LENGTH) {
    throw new Error(`SEO-title публикации длиннее ${MAX_TITLE_LENGTH} знаков (${metadata.title.length}): ${id}`);
  }
  if (metadata.description.length < 70 || metadata.description.length > 170) {
    throw new Error(`SEO-description публикации вне диапазона 70–170 знаков (${metadata.description.length}): ${id}`);
  }
  return metadata;
};

export const publicationSeoMetadata = ({ article = null, practiceCase = null } = {}) => {
  if (article) {
    const titleBase = publicationTitleOverrides.article[article.id] || article.seoTitle || article.title;
    return assertMetadata({
      title: brandedTitle(titleBase),
      description: publicationDescriptionOverrides.article[article.id] || article.description,
      openGraphType: "article",
      publishedTime: article.publishedAt,
      modifiedTime: article.modifiedAt,
      section: article.category,
      authorUrl: `${site.siteUrl}/o-yuriste/`,
    }, article.id);
  }

  if (practiceCase) {
    const titleBase = publicationTitleOverrides.case[practiceCase.id] || practiceCase.seoTitle || practiceCase.title;
    return assertMetadata({
      title: brandedTitle(titleBase),
      description: publicationDescriptionOverrides.case[practiceCase.id] || practiceCase.description,
      openGraphType: "article",
      publishedTime: practiceCase.publishedAt,
      modifiedTime: practiceCase.modifiedAt,
      section: "Юридическая практика",
      authorUrl: `${site.siteUrl}/o-yuriste/`,
    }, practiceCase.id);
  }

  return null;
};

export const seoMetadataContract = {
  title: { min: 30, max: MAX_TITLE_LENGTH },
  description: { min: 70, max: 170 },
};
