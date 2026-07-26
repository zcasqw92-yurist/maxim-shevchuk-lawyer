import { formatContentDate } from "./content-dates.mjs";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const moscowDateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Moscow",
});

const dateInMoscow = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Некорректное время автоматической проверки: ${value}`);
  const parts = Object.fromEntries(
    moscowDateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const automatedReviewDate = () => {
  const explicit = String(process.env.SITE_REVIEW_DATE || "").trim();
  if (explicit) {
    if (!datePattern.test(explicit)) throw new Error("SITE_REVIEW_DATE должен быть датой YYYY-MM-DD");
    return explicit;
  }

  const buildTime = String(process.env.SITE_BUILD_TIME || "").trim();
  return dateInMoscow(buildTime || new Date());
};

export const formatReviewDate = (value = automatedReviewDate()) => formatContentDate(value);
