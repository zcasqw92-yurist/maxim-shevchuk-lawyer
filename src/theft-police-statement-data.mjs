import {
  theftPoliceStatementArticles as sourceArticles,
  validateTheftPoliceStatementData,
} from "./theft-police-statement-source.mjs";

export const theftPoliceStatementArticles = sourceArticles.map((article) => ({
  ...article,
  status: "published",
  relatedCaseIds: [],
}));

export { validateTheftPoliceStatementData };
