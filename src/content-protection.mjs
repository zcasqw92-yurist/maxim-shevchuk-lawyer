import { site } from "../site.config.mjs";
import { appendToBuildSlot } from "./html-slots.mjs";

const base = site.basePath || "";
const copyrightNotice = "Материалы и изображения сайта защищены авторским правом. Использование допускается только с письменного разрешения правообладателя.";

const protectImageTags = (html) => html.replace(/<img\b[^>]*>/gi, (tag) => {
  const withoutPreviousFlags = tag
    .replace(/\sdata-protected-image(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
    .replace(/\sdraggable=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return withoutPreviousFlags.replace(/^<img\b/i, '<img data-protected-image draggable="false"');
});

const injectCopyrightNotice = (html) => {
  if (!html.includes('class="site-footer"')) return html;
  if (html.includes(copyrightNotice)) return html;

  const pattern = /(<div class="wrap footer__bottom">\s*<p>©[^<]*<\/p>)/;
  if (!pattern.test(html)) throw new Error("Не найдено место для уведомления об авторских правах");
  return html.replace(pattern, `$1\n      <p class="footer__copyright-note">${copyrightNotice}</p>`);
};

const injectProtectionAssets = (html) => appendToBuildSlot(
  html,
  "head-assets",
  `  <script type="module" src="${base}/assets/content-protection.mjs"></script>\n`,
);

export const injectContentProtection = (html) => protectImageTags(
  injectCopyrightNotice(injectProtectionAssets(html)),
);
