import {
  trademarkClaimMarketplaceArticles as sourceArticles,
  validateTrademarkClaimMarketplaceData,
} from "./trademark-claim-marketplace-source.mjs";

export const trademarkClaimMarketplaceArticles = sourceArticles.map((article) => ({
  ...article,
  status: "published",
}));

export { validateTrademarkClaimMarketplaceData };
