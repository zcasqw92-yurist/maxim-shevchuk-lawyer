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
  contentLastModified: "2026-07-17",
  name: "Максим Юрьевич Шевчук",
  shortName: "Максим Шевчук",
  businessName: "Юридическая консультация Шевчука М. Ю.",
  role: "Юрист",
  city: "Москва",
  region: "Москва и Московская область",
  phoneDisplay: "+7 (906) 529-79-70",
  phoneHref: "+79065297970",
  email: "",
  telegram: "https://t.me/lawrazbor",
  whatsapp: "https://api.whatsapp.com/send?phone=79065297970",
  personSameAs: [],
  organizationSameAs: [
    "https://yandex.ru/maps/org/yuridicheskaya_konsultatsiya_shevchuka_m_yu_/118077889231/",
  ],
  webmasterVerification: {
    google: env("GOOGLE_SITE_VERIFICATION"),
    yandex: env("YANDEX_SITE_VERIFICATION"),
  },
  analytics: {
    enabled: env("SITE_ANALYTICS_ENABLED") === "true",
    requireConsent: true,
    googleMeasurementId: env("GOOGLE_ANALYTICS_ID"),
    yandexMetricaId: env("YANDEX_METRICA_ID"),
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
  defaultTitle: "Юрист по гражданским делам в Москве | Максим Шевчук",
  defaultDescription:
    "Юрист по гражданским делам в Москве и Химках: досудебные претензии, возврат денег, жалобы, исковые заявления и договорные споры. Дистанционно по России.",
};