import {
  fraudPoliceStatementArticles as sourceArticles,
  validateFraudPoliceStatementData,
} from "./fraud-police-statement-source.mjs";

export const fraudPoliceStatementArticles = sourceArticles.map((article) => ({
  ...article,
  status: "published",
  relatedCaseIds: [],
}));

export { validateFraudPoliceStatementData };
