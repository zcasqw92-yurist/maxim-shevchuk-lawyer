import { site } from "../site.config.mjs";

const base = site.basePath || "";
const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const closeIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const arrowIcon = '<svg class="button__icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const webVitalsVersion = site.contentLastModified.replaceAll("-", "");

const videoDialog = () => {
  const enabled = Boolean(site.video?.enabled);
  return `
  <dialog class="video-placeholder-dialog video-ready-dialog" id="video-placeholder-dialog" aria-labelledby="video-placeholder-title" data-video-dialog>
    <button class="proof-dialog__close" type="button" data-video-close aria-label="Закрыть">${closeIcon}</button>
    <div class="video-ready-dialog__media" data-video-stage>
      <img src="${base}${escapeHtml(site.video?.poster || "/assets/images/maxim-hero.webp")}" width="1536" height="1024" loading="lazy" decoding="async" alt="Максим Юрьевич Шевчук в рабочем кабинете">
      <span class="video-ready-dialog__loading" data-video-loading hidden>Подготавливаю видео…</span>
    </div>
    <div class="video-ready-dialog__copy" data-video-copy>
      <span class="eyebrow" data-video-eyebrow>${enabled ? "Личное обращение" : "Видео готовится"}</span>
      <h2 id="video-placeholder-title" data-video-title>${enabled ? escapeHtml(site.video.title) : "Здесь будет короткое личное объяснение"}</h2>
      <p data-video-description>${enabled
    ? "Видео загружается только после нажатия и не замедляет первый экран сайта."
    : "В ролике Максим Юрьевич объяснит, что не нужно самостоятельно определять название документа: достаточно передать ситуацию и основные материалы."}</p>
      <button class="button button--primary" type="button" data-video-contact data-dialog-open data-topic="первичное знакомство с ситуацией">${enabled ? "Описать ситуацию после просмотра" : "Пока описать ситуацию"}${arrowIcon}</button>
    </div>
  </dialog>`;
};

export const injectOnDemandVideo = (html, pathname) => {
  let result = html.replace(
    /\s*<dialog class="video-placeholder-dialog"[\s\S]*?<\/dialog>/,
    videoDialog(),
  );
  result = result.replace(
    "</head>",
    `  <script type="module" src="${base}/assets/web-vitals.js?v=${webVitalsVersion}"></script>\n</head>`,
  );

  if (pathname !== "/") return result;
  const configUrl = `${base}/video-config.json`;
  result = result.replace(
    "data-video-placeholder aria-haspopup=\"dialog\"",
    `data-video-launch data-video-config-url="${configUrl}" aria-haspopup="dialog"`,
  );
  result = result.replace(
    "<em>Видео готовится</em>",
    `<em data-video-status>${site.video?.enabled ? "Смотреть видео" : "Видео готовится"}</em>`,
  );
  if (site.video?.enabled) {
    result = result.replace("— постер будущего видео", "— постер личного видео");
  }
  return result;
};