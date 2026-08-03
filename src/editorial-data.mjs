export * from "./editorial-data-base.mjs";

import {
  articles as baseArticles,
  validateEditorialData as validateBaseEditorialData,
} from "./editorial-data-base.mjs";
import {
  trademarkClaimMarketplaceArticles,
  validateTrademarkClaimMarketplaceData,
} from "./trademark-claim-marketplace-data.mjs";
import {
  fraudPoliceStatementArticles,
  validateFraudPoliceStatementData,
} from "./fraud-police-statement-data.mjs";

export const articles = [
  ...baseArticles,
  ...trademarkClaimMarketplaceArticles,
  ...fraudPoliceStatementArticles,
];

export const findArticleBySlug = (slug) => articles.find((item) => item.slug === slug);

export const validateEditorialData = () => {
  validateBaseEditorialData();
  validateTrademarkClaimMarketplaceData();
  validateFraudPoliceStatementData();

  const slugs = new Set();
  const ids = new Set();
  for (const article of articles) {
    if (slugs.has(article.slug)) throw new Error(`Повторный slug статьи: ${article.slug}`);
    if (ids.has(article.id)) throw new Error(`Повторный ID статьи: ${article.id}`);
    slugs.add(article.slug);
    ids.add(article.id);
  }
  return true;
};
