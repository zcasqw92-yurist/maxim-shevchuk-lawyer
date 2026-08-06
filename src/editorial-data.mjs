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
import {
  hotelBookingRefundArticles,
  validateHotelBookingRefundData,
} from "./hotel-booking-refund-data.mjs";
import { contractEngineNoReceiptArticles } from "./contract-engine-no-receipt-data.mjs";
import { ozonLostGoodsLogisticsArticles } from "./ozon-lost-goods-logistics-data.mjs";
import { usedCarHiddenDefectArticles } from "./used-car-hidden-defect-data.mjs";
import { medicalErrorFirstStepsArticles } from "./medical-error-first-steps-data.mjs";
import { bailiffSmallPensionPaymentsArticles } from "./bailiff-small-pension-payments-data.mjs";
import { designerInfographicExclusiveRightsArticles } from "./designer-infographic-exclusive-rights-data.mjs";
import { yandexDeliveryLostParcelArticles } from "./yandex-delivery-lost-parcel-data.mjs";
import { houseConstructionContractorRefundArticles } from "./house-construction-contractor-refund-data.mjs";
import { contractorRepairQualityClaimResponseArticles } from "./contractor-repair-quality-claim-response-data.mjs";

const usedCarHiddenDefectPublicationArticles = usedCarHiddenDefectArticles.map((article) => ({
  ...article,
  seoTitle: "Скрытый дефект автомобиля после покупки",
}));

const contractorRepairQualityClaimResponsePublicationArticles = contractorRepairQualityClaimResponseArticles.map(
  ({ contentId: _internalContentId, ...article }) => ({ ...article }),
);

export const articles = [
  ...baseArticles,
  ...trademarkClaimMarketplaceArticles,
  ...fraudPoliceStatementArticles,
  ...hotelBookingRefundArticles,
  ...contractEngineNoReceiptArticles,
  ...ozonLostGoodsLogisticsArticles,
  ...usedCarHiddenDefectPublicationArticles,
  ...medicalErrorFirstStepsArticles,
  ...bailiffSmallPensionPaymentsArticles,
  ...designerInfographicExclusiveRightsArticles,
  ...yandexDeliveryLostParcelArticles,
  ...houseConstructionContractorRefundArticles,
  ...contractorRepairQualityClaimResponsePublicationArticles,
];

export const findArticleBySlug = (slug) => articles.find((item) => item.slug === slug);

export const validateEditorialData = () => {
  validateBaseEditorialData();
  validateTrademarkClaimMarketplaceData();
  validateFraudPoliceStatementData();
  validateHotelBookingRefundData();

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