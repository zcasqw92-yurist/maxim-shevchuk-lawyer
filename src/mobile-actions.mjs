import { site } from "../site.config.mjs";
import { appendToBuildSlot, fillBuildSlot } from "./html-slots.mjs";

const icon = (name) => {
  const paths = {
    dialog: '<path d="M5 6h14v9H9l-4 4V6Z"/><path d="M8 10h8M8 13h5"/>',
    close: '<path d="m7 7 10 10M17 7 7 17"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
};

const base = site.basePath || "";
const engagementScript = `${base}/assets/engagement-nudge.mjs`;
const conversionAnalyticsScript = `${base}/assets/conversion-analytics.mjs`;
const channelAnalyticsScript = `${base}/assets/channel-analytics.mjs`;
const buttonAnalyticsScript = `${base}/assets/button-analytics.mjs`;

const narrowLayoutStyles = `
  <style>
    @media (max-width: 350px) {
      .about-preview__visual { display: grid; min-width: 0; }
      .about-preview__seal {
        position: static;
        right: auto;
        bottom: auto;
        width: 100%;
        min-width: 0;
        min-height: 68px;
        aspect-ratio: auto;
        justify-self: stretch;
        margin-top: 12px;
        padding: 12px 16px;
        border-radius: 0;
        box-shadow: none;
      }
      .about-preview__seal span,
      .about-preview__seal small {
        min-width: 0;
        max-width: 100%;
        overflow-wrap: anywhere;
      }
      .cta-portrait {
        grid-template-columns: minmax(0, 1fr);
        gap: 18px;
        padding: 24px 18px;
      }
      .cta-portrait > img {
        width: 64px;
        height: 64px;
        justify-self: start;
      }
      .cta-portrait > div { min-width: 0; }
      .cta-portrait h2,
      .cta-portrait p {
        max-width: 100%;
        overflow-wrap: anywhere;
      }
      .cta-portrait .button {
        grid-column: auto;
        min-width: 0;
        white-space: normal;
      }
    }
  </style>\n`;

const mobileActionsMarkup = `
  <aside class="engagement-nudge" id="engagement-nudge" aria-labelledby="engagement-nudge-title" aria-live="polite" hidden>
    <button class="engagement-nudge__close" type="button" aria-label="Закрыть подсказку">
      ${icon("close")}
    </button>
    <span class="engagement-nudge__eyebrow">Можно написать без звонка</span>
    <strong id="engagement-nudge-title">Нужен ориентир по вашей ситуации?</strong>
    <p>Откройте удобный мессенджер. Там будет готовый черновик — измените его при необходимости и отправьте напрямую юристу.</p>
    <div class="engagement-nudge__actions">
      <button class="engagement-nudge__dismiss" type="button">Не сейчас</button>
      <button class="engagement-nudge__write" id="engagement-nudge-write" type="button" data-dialog-open data-analytics-topic="первичный ориентир по ситуации">Выбрать мессенджер</button>
    </div>
  </aside>
  <div class="mobile-contact mobile-contact--single" aria-label="Быстрое действие" data-mobile-contact>
    <button class="mobile-contact__action mobile-contact__action--now" type="button" data-dialog-open data-mobile-contact-now data-analytics-topic="первичный разбор юридической ситуации">
      ${icon("dialog")}<span>Написать сейчас</span>
    </button>
  </div>
  <script type="module" src="${engagementScript}"></script>`;

export const injectMobileActions = (html, pathname) => {
  if (html.includes("data-mobile-contact")) throw new Error(`Мобильная панель добавлена до сборочного этапа: ${pathname}`);
  const withAnalytics = appendToBuildSlot(html, "head-assets", `  <script type="module" src="${conversionAnalyticsScript}"></script>\n`);
  const withChannelAnalytics = appendToBuildSlot(withAnalytics, "head-assets", `  <script type="module" src="${channelAnalyticsScript}"></script>\n`);
  const withButtonAnalytics = appendToBuildSlot(withChannelAnalytics, "head-assets", `  <script type="module" src="${buttonAnalyticsScript}"></script>\n`);
  const withNarrowLayout = appendToBuildSlot(withButtonAnalytics, "head-assets", narrowLayoutStyles);
  return fillBuildSlot(withNarrowLayout, "mobile-actions", mobileActionsMarkup);
};
