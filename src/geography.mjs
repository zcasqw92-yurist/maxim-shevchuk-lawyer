import { site } from "../site.config.mjs";

const escapeAttribute = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const legacyPersonArea = '"areaServed":["Москва","Московская область"]';
const legacyPracticeArea = '"areaServed":[{"@type":"City","name":"Москва"},{"@type":"AdministrativeArea","name":"Московская область"}]';
const schemaArea = `"areaServed":${JSON.stringify(site.serviceGeography.schemaAreaServed)}`;

const footerServiceArea = () => {
  const localAreas = escapeAttribute(site.serviceGeography.localServiceAreas.join(" и "));
  const remoteCountry = escapeAttribute(site.serviceGeography.remoteServiceCountry);
  const remoteLabel = remoteCountry === "Россия" ? "Онлайн по всей России" : `Онлайн: ${remoteCountry}`;
  return `<small>Услуги: ${localAreas}</small><small>${remoteLabel}</small>`;
};

export const applyServiceGeography = (html) => {
  let result = String(html);

  result = result.replace(
    /(<span class="header__city">[\s\S]*?<\/svg>)Москва(<\/span>)/,
    "$1Москва и область$2",
  );
  result = result.replaceAll("<small>юрист · Москва</small>", "<small>юрист · Москва и область</small>");
  result = result.replaceAll(
    "<small>Офис · по предварительной записи</small>",
    "<small>Офис в Химках · по предварительной записи</small>",
  );
  result = result.replaceAll(
    "<em>Открыть в Яндекс Картах</em>",
    `${footerServiceArea()}<em>Открыть в Яндекс Картах</em>`,
  );

  result = result.replaceAll("Утро, 07:00–12:00 МСК", "Утро, 08:00–12:00 МСК");
  result = result.replaceAll("Утро, 07:00–12:00", "Утро, 08:00–12:00");

  result = result.replaceAll(legacyPersonArea, schemaArea);
  result = result.replaceAll(legacyPracticeArea, schemaArea);

  if (!result.includes('meta name="service-area"')) {
    const label = escapeAttribute(site.serviceGeography.publicLabel);
    result = result.replace("</head>", `  <meta name="service-area" content="${label}">\n</head>`);
  }

  return result;
};
