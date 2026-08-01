import { site } from "../site.config.mjs";
import { contentDateForPath, formatContentDate } from "./content-dates.mjs";
import { applyServiceGeography } from "./geography.mjs";
import { applyIntakePrivacyPolicy } from "./intake-assistant-policy.mjs";
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
  const newFooter = `Автоматическая проверка публикации: <time datetime="${reviewDate}">${reviewLabel}</time>. Правовая редакция материала: <time datetime="${contentDate}">${contentLabel}</time>. Информация не является гарантией результата по конкретному делу.`;
  const oldAuthorDate = `<span>Проверено <time datetime="${contentDate}">${contentLabel}</time></span>`;
  const newAuthorDate = `<span>Автоматическая проверка публикации: <time datetime="${reviewDate}">${reviewLabel}</time></span><span>Правовая редакция: <time datetime="${contentDate}">${contentLabel}</time></span>`;

  let result = html.replace(oldFooter, newFooter).replaceAll(oldAuthorDate, newAuthorDate);
  const reviewMeta = `  <meta name="site-automated-review-date" content="${reviewDate}">\n`;
  result = result.replace("</head>", `${reviewMeta}</head>`);
  return result;
};

const intakeAssets = () => {
  const base = site.basePath || "";
  const version = site.contentLastModified.replaceAll("-", "");
  return `  <link rel="stylesheet" href="${base}/assets/intake-assistant.css?v=${version}">\n  <style>
    #contact-dialog [data-dialog-close],#contact-dialog [data-intake-reset]{min-width:46px!important;min-height:46px!important;transform:none!important}
    #contact-dialog .messenger-choices--dialog{display:grid!important;visibility:visible!important;opacity:1!important;position:relative!important;width:auto!important;height:auto!important;overflow:visible!important;clip:auto!important;margin-top:18px!important}
    #contact-dialog .messenger-choices--dialog::before{content:"Или напишите сразу без заполнения";display:block;grid-column:1/-1;margin:0 0 8px;font-size:.82rem;font-weight:700;color:var(--navy-soft)}
  </style>\n  <script type="module" src="${base}/assets/intake-assistant.mjs?v=${version}"></script>
  <script type="module">
    const placeDirectChoices = () => {
      const dialog = document.querySelector("#contact-dialog");
      const assistant = dialog?.querySelector("[data-intake-assistant]");
      const choices = dialog?.querySelector(".messenger-choices--dialog");
      if (assistant && choices && assistant.nextElementSibling !== choices) assistant.insertAdjacentElement("afterend", choices);
    };
    const startPlacement = () => {
      placeDirectChoices();
      const dialog = document.querySelector("#contact-dialog");
      if (dialog) new MutationObserver(placeDirectChoices).observe(dialog, { childList: true, subtree: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startPlacement, { once: true });
    else startPlacement();
  </script>\n`;
};

export const finalizeBuildSlots = (html, pathname) => {
  const unresolved = [...html.matchAll(unresolvedSlotPattern)].map((match) => match[1]);
  const unexpected = unresolved.filter((name) => name !== "head-assets");
  if (unexpected.length) {
    throw new Error(`Не заполнены сборочные слоты ${pathname}: ${[...new Set(unexpected)].join(", ")}`);
  }
  const finalized = fillBuildSlot(injectAutomatedReviewStatus(html, pathname), "head-assets", intakeAssets());
  return applyIntakePrivacyPolicy(applyServiceGeography(finalized), pathname);
};
