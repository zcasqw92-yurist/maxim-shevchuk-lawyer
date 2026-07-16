/**
 * Единственная точка настройки перед публикацией.
 * Пока production=false, поисковики получают запрет на индексацию,
 * а формы работают в безопасном демонстрационном режиме.
 */
const normalizeSiteUrl = (value) => String(value || "https://example.ru").replace(/\/+$/, "");
const normalizeBasePath = (value) => {
  const path = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  return path ? `/${path}` : "";
};

export const site = {
  production: process.env.SITE_PRODUCTION === "true",
  districtPagesIndexable: false,
  indexableDistricts: [],
  siteUrl: normalizeSiteUrl(process.env.SITE_URL),
  basePath: normalizeBasePath(process.env.SITE_BASE_PATH),
  contentLastModified: "2026-07-15",
  name: "Максим Юрьевич Шевчук",
  shortName: "Максим Шевчук",
  role: "Юрист",
  city: "Москва",
  region: "Москва и Московская область",
  phoneDisplay: "+7 (906) 529-79-70",
  phoneHref: "+79065297970",
  email: "mail@example.ru",
  telegram: "https://t.me/lawrazbor",
  whatsapp: "https://api.whatsapp.com/send?phone=79065297970",
  sameAs: [],
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
  publicOffice: {
    enabled: false,
    streetAddress: "",
    postalCode: "",
    addressLocality: "Москва",
    addressRegion: "Москва",
    latitude: "",
    longitude: "",
    openingHours: [],
    priceRange: "",
  },
  organizationId: "#legal-practice",
  personId: "#maxim-shevchuk",
  defaultTitle: "Юрист в Москве — претензии, жалобы, иски | Максим Шевчук",
  defaultDescription:
    "Юридическая помощь в Москве: досудебные претензии, жалобы, исковые заявления, возврат денежных средств и споры бизнеса.",
};
