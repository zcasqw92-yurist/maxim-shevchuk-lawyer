/**
 * Единственная точка настройки перед публикацией.
 * Локальная сборка по умолчанию закрыта от индексации; публичный workflow
 * явно включает production-режим после успешных проверок.
 */
const normalizeSiteUrl = (value) => String(value || "https://example.ru").replace(/\/+$/, "");
const normalizeBasePath = (value) => {
  const path = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  return path ? `/${path}` : "";
};
const env = (name) => String(process.env[name] || "").trim();

export const site = {
  production: process.env.SITE_PRODUCTION === "true",
  siteUrl: normalizeSiteUrl(process.env.SITE_URL),
  basePath: normalizeBasePath(process.env.SITE_BASE_PATH),
  // Максимальная дата содержательного обновления. Даты отдельных страниц
  // задаются явно и не меняются от технической пересборки.
  contentLastModified: "2026-07-30",
  contentLastModifiedByPath: {
    "/": "2026-07-29",
    "/uslugi": "2026-07-29",
    "/uslugi/dosudebnoe-uregulirovanie": "2026-07-29",
    "/uslugi/vzyskanie-dolga": "2026-07-29",
    "/uslugi/vozvrat-deneg": "2026-07-29",
    "/uslugi/zhaloby-i-obrashcheniya": "2026-07-29",
    "/uslugi/iskovoe-zayavlenie": "2026-07-29",
    "/uslugi/spory-biznesa": "2026-07-29",
    "/uslugi/marketpleysy": "2026-07-29",
    "/razbory": "2026-07-29",
    "/razbory/chto-delat-posle-otkaza-policii": "2026-07-28",
    "/razbory/vernut-dolg-bez-raspiski": "2026-07-29",
    "/razbory/dolg-po-raspiske-prikaz-ili-isk": "2026-07-29",
    "/razbory/dengi-v-dolg-na-chuzhuyu-kartu": "2026-07-29",
    "/razbory/srok-vozvrata-dolga-ne-ukazan": "2026-07-29",
    "/razbory/prodavets-propal-posle-perevoda": "2026-07-30",
    "/praktika": "2026-07-29",
    "/praktika/otmena-otkazov-policii-i-dopolnitelnaya-proverka": "2026-07-28",
    "/praktika/pretenziya-i-raschet-po-dolgu-po-raspiske": "2026-07-29",
    "/o-yuriste": "2026-07-29",
    "/kontakty": "2026-07-29",
    "/politika-konfidencialnosti": "2026-07-30",
  },
  name: "Максим Юрьевич Шевчук",
  shortName: "Максим Шевчук",
  businessName: "Юридическая консультация Шевчука М. Ю.",
  role: "Юрист",
  city: "Химки",
  region: "Москва и Московская область",
  serviceGeography: {
    officeLabel: "Офис в Химках",
    localServiceAreas: ["Москва", "Московская область"],
    remoteServiceCountry: "Россия",
    publicLabel: "Офис в Химках · услуги по Москве и Московской области · онлайн по России",
    schemaAreaServed: [
      { "@type": "City", name: "Москва" },
      { "@type": "AdministrativeArea", name: "Московская область" },
      { "@type": "Country", name: "Россия", description: "Дистанционные юридические услуги" },
    ],
  },
  phoneDisplay: "+7 (980) 657-41-99",
  phoneHref: "+79806574199",
  email: "",
  telegram: "https://t.me/lawrazbor",
  whatsapp: "https://api.whatsapp.com/send?phone=79806574199",
  personSameAs: [],
  organizationSameAs: [
    "https://yandex.ru/maps/org/yuridicheskaya_konsultatsiya_shevchuka_m_yu_/118077889231/",
  ],
  webmasterVerification: {
    google: env("GOOGLE_SITE_VERIFICATION"),
    googleDomainVerified: true,
    yandex: env("YANDEX_SITE_VERIFICATION") || "e7084a7111f8d766",
  },
  analytics: {
    enabled: env("SITE_ANALYTICS_ENABLED") === "true",
    requireConsent: true,
    googleMeasurementId: env("GOOGLE_ANALYTICS_ID"),
    yandexMetricaId: env("YANDEX_METRICA_ID"),
  },
  video: {
    enabled: env("SITE_VIDEO_ENABLED") === "true",
    title: env("SITE_VIDEO_TITLE") || "Не знаете, с чего начать? Объясню за 45 секунд",
    durationLabel: env("SITE_VIDEO_DURATION") || "45 секунд",
    poster: env("SITE_VIDEO_POSTER") || "/assets/images/maxim-hero.webp",
    webm: env("SITE_VIDEO_WEBM") || "/assets/video/intro.webm",
    mp4: env("SITE_VIDEO_MP4") || "/assets/video/intro.mp4",
    captions: env("SITE_VIDEO_CAPTIONS") || "/assets/video/intro-captions.vtt",
  },
  // IndexNow проверяет ключ через опубликованный текстовый файл, поэтому ключ
  // не является секретом. Переменная окружения может заменить его при переносе домена.
  indexNowKey: env("INDEXNOW_KEY") || "f5b271bbe6a4c4f4f18fe9a6a3f67158",
  legacyRedirects: {
    "/dosudebnaya-pretenziya/": "/uslugi/dosudebnoe-uregulirovanie/",
    "/политика-конфиденциальности/": "/politika-konfidencialnosti/",
  },
  publicOffice: {
    enabled: true,
    streetAddress: "улица Горшина, 2",
    postalCode: "141407",
    addressLocality: "Химки",
    addressRegion: "Московская область",
    latitude: "55.886899",
    longitude: "37.429363",
    openingHours: ["Mo-Su 08:00-22:00"],
    openingHoursLabel: "ежедневно, 08:00–22:00",
    priceRange: "от 2 800 ₽",
    mapUrl: "https://yandex.ru/maps/org/yuridicheskaya_konsultatsiya_shevchuka_m_yu_/118077889231/",
  },
  organizationId: "#legal-practice",
  personId: "#maxim-shevchuk",
  defaultTitle: "Юрист по досудебному урегулированию | Максим Шевчук",
  defaultDescription:
    "Досудебное урегулирование споров: анализ документов, расчёт требований, претензии и подготовка к суду. Офис в Химках, работа по Москве и области, онлайн по России.",
};
