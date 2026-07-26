import { site } from "../site.config.mjs";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const formatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export const normalizeContentPath = (pathname = "/") => {
  const value = String(pathname || "/").trim();
  if (value === "/") return "/";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
};

export const contentDateForPath = (pathname) => {
  const normalized = normalizeContentPath(pathname);
  const value = site.contentLastModifiedByPath?.[normalized];
  if (!datePattern.test(value || "")) {
    throw new Error(`Для страницы ${normalized} не задана достоверная дата содержательного обновления`);
  }
  return value;
};

export const formatContentDate = (value) => {
  if (!datePattern.test(value || "")) throw new Error(`Некорректная дата материала: ${value}`);
  return formatter.format(new Date(`${value}T12:00:00Z`)).replace(/\.$/, "");
};
