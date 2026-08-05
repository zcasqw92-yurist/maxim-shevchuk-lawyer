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

const usedCarHiddenDefectPublicationArticles = usedCarHiddenDefectArticles.map((article) => ({
  ...article,
  seoTitle: "Скрытый дефект автомобиля после покупки",
}));

const yandexDeliveryLostParcelPublicationArticles = yandexDeliveryLostParcelArticles.map((article) => ({
  ...article,
  lead: "Отправление не найдено, а чеки на вещи не сохранились. Сохраните карточку заказа, статусы, переписку, полис и сведения об оценочной стоимости. Для каждой вещи соберите подтверждение покупки или принадлежности, фотографии, банковские операции и цены сопоставимых товаров. После этого подайте страховое заявление и отдельно проверьте, кому направлять досудебную претензию.",
}));

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
  ...yandexDeliveryLostParcelPublicationArticles,
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
