export const metricaActionGoals = Object.freeze([
  { event: "contact_conversion", name: "Переход в мессенджер", favorite: true, role: "primary_conversion" },
  { event: "contact_click", name: "Переход к способу связи", favorite: false, role: "compatibility" },
  { event: "messenger_dialog_open", name: "Открыл выбор мессенджера", favorite: false, role: "funnel" },
  { event: "cta_click", name: "Клик по CTA", favorite: false, role: "funnel" },
  { event: "cta_view", name: "Просмотр CTA", favorite: false, role: "diagnostic" },
  { event: "contact_action", name: "Вспомогательное действие", favorite: false, role: "diagnostic" },
  { event: "button_action", name: "Все кнопочные действия", favorite: false, role: "diagnostic" },

  { event: "contact_whatsapp", name: "Контакт: WhatsApp", favorite: false, role: "channel" },
  { event: "contact_telegram", name: "Контакт: Telegram", favorite: false, role: "channel" },
  { event: "contact_phone", name: "Контакт: телефон", favorite: false, role: "channel" },
  { event: "contact_email", name: "Контакт: email", favorite: false, role: "channel_optional" },
  { event: "contact_map", name: "Контакт: карта и маршрут", favorite: false, role: "channel" },

  { event: "publication_view", name: "Публикация: просмотр", favorite: false, role: "content" },
  { event: "publication_scroll_50", name: "Публикация: дочитал 50%", favorite: false, role: "content" },
  { event: "publication_scroll_90", name: "Публикация: дочитал 90%", favorite: false, role: "content" },
  { event: "publication_active_60s", name: "Публикация: активное чтение 60 секунд", favorite: false, role: "content" },
  { event: "publication_section_view", name: "Публикация: просмотр смыслового блока", favorite: false, role: "content_diagnostic" },
  { event: "publication_toc_click", name: "Публикация: клик по оглавлению", favorite: false, role: "content_diagnostic" },
  { event: "publication_faq_open", name: "Публикация: открыл FAQ", favorite: false, role: "content" },
  { event: "publication_source_click", name: "Публикация: открыл источник", favorite: false, role: "content_diagnostic" },
  { event: "publication_related_click", name: "Публикация: перешёл к связанному материалу", favorite: false, role: "content" },
  { event: "publication_messenger_intent", name: "Публикация: намерение написать юристу", favorite: false, role: "content_funnel" },
  { event: "publication_helpfulness", name: "Публикация: оценка полезности", favorite: false, role: "content" },
]);

export const metricaCompositeGoals = Object.freeze([
  {
    name: "Воронка обращения: CTA → выбор → контакт",
    favorite: false,
    steps: [
      { name: "Нажал CTA", event: "cta_click" },
      { name: "Открыл выбор мессенджера", event: "messenger_dialog_open" },
      { name: "Перешёл к контакту", event: "contact_conversion" },
    ],
  },
  {
    name: "Воронка публикации: просмотр → намерение → контакт",
    favorite: false,
    steps: [
      { name: "Открыл публикацию", event: "publication_view" },
      { name: "Решил написать юристу", event: "publication_messenger_intent" },
      { name: "Перешёл к контакту", event: "contact_conversion" },
    ],
  },
]);

export const metricaObsoleteGoals = Object.freeze([
  {
    id: 589225251,
    event: "price_quiz_complete",
    name: "Квиз пройден до конца",
    archiveName: "Архив — квиз пройден до конца",
    reason: "квиз удалён из действующей модели обращения",
  },
  {
    id: 589225287,
    event: "callback_request_whatsapp",
    name: "Запрос связаться позже — WhatsApp",
    archiveName: "Архив — связаться позже через WhatsApp",
    reason: "обратный звонок и сценарий «связаться позже» удалены",
  },
  {
    id: 589225338,
    event: "callback_request_telegram",
    name: "Запрос связаться позже — Telegram",
    archiveName: "Архив — связаться позже через Telegram",
    reason: "обратный звонок и сценарий «связаться позже» удалены",
  },
  {
    id: 589230193,
    event: "",
    name: "Автоцель: отправка формы",
    archiveName: "Архив — отправка формы",
    reason: "на сайте отсутствуют формы",
  },
]);

export const metricaProtectedGoals = Object.freeze([
  { id: 589224907, name: "Звонок — клик по телефону", reason: "нативная цель Метрики для tel-ссылок" },
  { id: 589230194, name: "Автоцель: переход в мессенджер", reason: "резервный автоматический контроль переходов" },
]);

export const metricaManagedEventIds = Object.freeze(metricaActionGoals.map((goal) => goal.event));
