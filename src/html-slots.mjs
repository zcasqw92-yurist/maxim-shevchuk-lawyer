import { contentDateForPath, formatContentDate } from "./content-dates.mjs";
import { applyServiceGeography } from "./geography.mjs";
import { automatedReviewDate, formatReviewDate } from "./review-dates.mjs";

const slotNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const unresolvedSlotPattern = /<!-- build-slot:([a-z0-9-]+) -->/g;

const assertSlotName = (name) => {
  if (!slotNamePattern.test(name)) throw new Error(`Некорректное имя сборочного слота: ${name}`);
};

export const buildSlot = (name) => {
  assertSlotName(name);
  return `<!-- build-slot:${name} -->`;
};

const locateUniqueSlot = (html, name) => {
  const marker = buildSlot(name);
  const count = html.split(marker).length - 1;
  if (count !== 1) {
    throw new Error(`Сборочный слот ${name} должен встречаться ровно один раз, найдено: ${count}`);
  }
  return marker;
};

export const fillBuildSlot = (html, name, content = "") => {
  const marker = locateUniqueSlot(html, name);
  return html.replace(marker, String(content));
};

export const appendToBuildSlot = (html, name, content = "") => {
  const marker = locateUniqueSlot(html, name);
  return html.replace(marker, `${String(content)}${marker}`);
};

const injectAutomatedReviewStatus = (html, pathname) => {
  if (!html.includes("Страница проверена <time")) return html;

  const contentDate = contentDateForPath(pathname);
  const contentLabel = formatContentDate(contentDate);
  const reviewDate = automatedReviewDate();
  const reviewLabel = formatReviewDate(reviewDate);
  const oldFooter = `Страница проверена <time datetime="${contentDate}">${contentLabel}</time>. Информация не является гарантией результата по конкретному делу.`;
  const newFooter = `Материал проверен <time datetime="${reviewDate}">${reviewLabel}</time> и обновлён <time datetime="${contentDate}">${contentLabel}</time>. Информация не является гарантией результата по конкретному делу.`;
  const oldAuthorDate = `<span>Проверено <time datetime="${contentDate}">${contentLabel}</time></span>`;
  const newAuthorDate = `<span>Проверено: <time datetime="${reviewDate}">${reviewLabel}</time></span><span>Обновлено: <time datetime="${contentDate}">${contentLabel}</time></span>`;

  let result = html.replace(oldFooter, newFooter).replaceAll(oldAuthorDate, newAuthorDate);
  const reviewMeta = `  <meta name="site-automated-review-date" content="${reviewDate}">\n`;
  result = result.replace("</head>", `${reviewMeta}</head>`);
  return result;
};

export const finalizeBuildSlots = (html, pathname) => {
  const unresolved = [...html.matchAll(unresolvedSlotPattern)].map((match) => match[1]);
  const unexpected = unresolved.filter((name) => name !== "head-assets");
  if (unexpected.length) {
    throw new Error(`Не заполнены сборочные слоты ${pathname}: ${[...new Set(unexpected)].join(", ")}`);
  }
  const finalized = fillBuildSlot(injectAutomatedReviewStatus(html, pathname), "head-assets", "");
  return applyServiceGeography(finalized);
};
