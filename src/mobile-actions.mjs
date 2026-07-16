const icon = (name) => {
  const paths = {
    dialog: '<path d="M5 6h14v9H9l-4 4V6Z"/><path d="M8 10h8M8 13h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
};

const mobileActionsMarkup = `
  <div class="mobile-contact mobile-contact--dual" aria-label="Быстрые действия" data-mobile-contact>
    <button class="mobile-contact__action mobile-contact__action--now" type="button" data-dialog-open data-mobile-contact-now>
      ${icon("dialog")}<span>Написать сейчас</span>
    </button>
    <button class="mobile-contact__action mobile-contact__action--later" type="button" data-callback-open data-mobile-contact-later>
      ${icon("clock")}<span>Связаться позже</span>
    </button>
  </div>`;

export const injectMobileActions = (html, pathname) => {
  const pattern = /\n\s*<div class="mobile-contact" aria-label="Быстрые действия" data-mobile-contact>[\s\S]*?<\/div>/;
  if (!pattern.test(html)) throw new Error(`Не найдена мобильная панель действий: ${pathname}`);
  if ((html.match(/data-mobile-contact/g) || []).length !== 1) throw new Error(`Нарушена уникальность мобильной панели: ${pathname}`);
  return html.replace(pattern, mobileActionsMarkup);
};
