import {
  trademarkClaimMarketplaceArticles as sourceArticles,
  validateTrademarkClaimMarketplaceData,
} from "./trademark-claim-marketplace-source.mjs";

export const trademarkClaimMarketplaceArticles = sourceArticles.map((article) => ({
  ...article,
  status: "published",
  sections: article.sections.map((section) => section.title === "Матрица проверки претензии правообладателя"
    ? { ...section, title: "Что проверить в претензии до ответа" }
    : section),
}));

export { validateTrademarkClaimMarketplaceData };
