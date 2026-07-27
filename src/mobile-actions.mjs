import { site } from "../site.config.mjs";
import { fillBuildSlot } from "./html-slots.mjs";

const icon = (name) => {
  const paths = {
    dialog: '<path d="M5 6h14v9H9l-4 4V6Z"/><path d="M8 10h8M8 13h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    close: '<path d="m7 7 10 10M17 7 7 17"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
};

const engagementScript = `${site.basePath || ""}/assets/engagement-nudge.mjs`;

const mobileActionsMarkup = `
  <aside class="engagement-nudge" id="engagement-nudge" aria-labelledby="engagement-nudge-title" aria-live="polite" hidden>
    <button class="engagement-nudge__close" type="button" aria-label="Закрыть подсказку">
      ${icon("close")}
    </button>
    <span class="engagement-nudge__eyebrow">Можно написать без звонка</span>
    <strong id="engagement-nudge-title">Нужен ориентир по вашей ситуации?</strong>
    <p>Кратко опишите, что произошло. Максим Юрьевич лично посмотрит сообщение и подскажет, с чего разумнее начать.</p>
    <div class="engagement-nudge__actions">
      <button class="engagement-nudge__dismiss" type="button">Не сейчас</button>
      <button class="engagement-nudge__write" id="engagement-nudge-write" type="button">Написать сейчас</button>
    </div>
  </aside>
  <div class="mobile-contact mobile-contact--dual" aria-label="Быстрые действия" data-mobile-contact>
    <button class="mobile-contact__action mobile-contact__action--later" type="button" data-callback-open data-mobile-contact-later>
      ${icon("clock")}<span>Связаться позже</span>
    </button>
    <button class="mobile-contact__action mobile-contact__action--now" type="button" data-dialog-open data-mobile-contact-now>
      ${icon("dialog")}<span>Написать сейчас</span>
    </button>
  </div>
  <script type="module" src="${engagementScript}"></script>`;

export const injectMobileActions = (html, pathname) => {
  if (html.includes("data-mobile-contact")) throw new Error(`Мобильная панель добавлена до сборочного этапа: ${pathname}`);
  return fillBuildSlot(html, "mobile-actions", mobileActionsMarkup);
};
