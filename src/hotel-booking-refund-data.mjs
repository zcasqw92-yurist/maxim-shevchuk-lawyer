import {
  hotelBookingRefundArticles as sourceArticles,
  validateHotelBookingRefundData,
} from "./hotel-booking-refund-source.mjs";

const verifiedSourceUrls = new Map([
  ["Статья 12 Закона о защите прав потребителей — ответственность исполнителя и владельца агрегатора", "https://www.consultant.ru/document/cons_doc_LAW_305/b9c49e21678597215e7d4570e60e3b72d6ca7312/"],
  ["Статья 13 Закона о защите прав потребителей — ответственность за нарушение прав потребителя", "https://www.consultant.ru/document/cons_doc_LAW_305/5311cc4c47a088e5ebc6a23b15f59fa70221f8ce/"],
  ["Статья 15 Закона о защите прав потребителей — компенсация морального вреда", "https://www.consultant.ru/document/cons_doc_LAW_305/19c8339aa764510f25f4afcea83230cbf14cb9d3/"],
  ["Статья 16 Закона о защите прав потребителей — недопустимые условия договора", "https://www.consultant.ru/document/cons_doc_LAW_305/9eb0f127ead4dc57e7d0a9d4954cf264c4b3cea8/"],
  ["Статья 17 Закона о защите прав потребителей — судебная защита прав потребителей", "https://www.consultant.ru/document/cons_doc_LAW_305/e38dd0dc96d081c4325d34a3d2a1cd3d037e7fec/"],
  ["Статья 32 Закона о защите прав потребителей — отказ от договора оказания услуг", "https://www.consultant.ru/document/cons_doc_LAW_305/758e2cfdf136a621c8f66dcb3372b772c7b5e6e8/"],
  ["Статья 782 ГК РФ — односторонний отказ от договора возмездного оказания услуг", "https://www.consultant.ru/document/cons_doc_LAW_9027/e21d6a868cf614117afa2f93877215e487cd4aee/"],
]);

export const hotelBookingRefundArticles = sourceArticles.map((article) => ({
  ...article,
  status: "published",
  sources: article.sources.map((source) => ({
    ...source,
    url: verifiedSourceUrls.get(source.title) || source.url,
  })),
  relatedCaseIds: [],
}));

export { validateHotelBookingRefundData };
