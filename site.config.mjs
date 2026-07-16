/**
 * Единственная точка настройки перед публикацией.
 * Пока production=false, поисковики получают запрет на индексацию,
 * а контактные каналы остаются в безопасном тестовом окружении.
 */
const normalizeSiteUrl = (value) => String(value || "https://example.ru").replace(/\/+$/, "");
const normalizeBasePath = (value) => {
  const path = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  return path ? `/${path}` : "";
};

export const site = {
  production: process.env.SITE_PRODUCTION === "true",
  siteUrl: normalizeSiteUrl(process.env.SITE_URL),
  basePath: normalizeBasePath(process.env.SITE_BASE_PATH),
  contentLastModified: "2026-07-16",
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
    google: "",
    yandex: "",
  },
  analytics: {
    enabled: false,
    requireConsent: true,
    googleMeasurementId: "",
    yandexMetricaId: "",
  },
  indexNowKey: "",
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
  defaultTitle: "Юрист в Москве — претензии, жалобы, иски | Максим Шевчук",
  defaultDescription:
    "Юридическая помощь в Москве: досудебные претензии, жалобы, исковые заявления, возврат денежных средств и споры бизнеса.",
};
