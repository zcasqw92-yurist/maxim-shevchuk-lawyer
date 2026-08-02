export const publicCopyRules = [
  {
    id: "seo-editorial-language",
    label: "внутренняя SEO- или редакционная терминология",
    pattern: /\bSEO\b|\bSERP\b|каннибализац[\p{L}\p{M}]*|владелец\s+интента|поисков[\p{L}\p{M}]*\s+(?:интент|маршрут)|контентн[\p{L}\p{M}]*\s+(?:карточк|сесси|шлюз)|(?:^|\s)кластер(?:а|ом|у|ы)?(?:\s|$)/iu,
  },
  {
    id: "internal-source-provenance",
    label: "внутреннее происхождение материала",
    pattern: /практическ[\p{L}\p{M}]*\s+элемент|оплаченн[\p{L}\p{M}]*\s+(?:юридическ[\p{L}\p{M}]*\s+)?(?:практик[\p{L}\p{M}]*|работ[\p{L}\p{M}]*)|подтвержда[\p{L}\p{M}]*\s+выполненн[\p{L}\p{M}]*\s+юридическ[\p{L}\p{M}]*\s+работ[\p{L}\p{M}]*|основан[\p{L}\p{M}]*\s+на\s+(?:обращени[\p{L}\p{M}]*|повторяющ[\p{L}\p{M}]*\s+проблем[\p{L}\p{M}]*)|источник[\p{L}\p{M}]*\s+практическ[\p{L}\p{M}]*\s+элемент/iu,
  },
  {
    id: "internal-identifiers",
    label: "внутренний идентификатор источника",
    pattern: /\b(?:ЮД-[А-ЯA-Z0-9-]+|R-\d{3,}|P-\d{3,}|C-\d{3,}|dlg-\d{8}[a-z0-9-]*)\b/iu,
  },
  {
    id: "draft-artifacts",
    label: "черновой или системный артефакт",
    pattern: /(?:^|\s)(?:TODO|FIXME|вставьте\s+сюда|служебная\s+инструкция|сгенерированный\s+ответ|как\s+ии)(?:\s|$)/iu,
  },
  {
    id: "machine-like-client-copy",
    label: "искусственная или служебная формулировка для клиента",
    pattern: /автоматическ[\p{L}\p{M}]*\s+проверк[\p{L}\p{M}]*\s+публикац|правов[\p{L}\p{M}]*\s+редакц[\p{L}\p{M}]*\s+материал|редактируем[\p{L}\p{M}]*\s+черновик|фактическ[\p{L}\p{M}]*\s+текущ[\p{L}\p{M}]*\s+статус|иерархи[\p{L}\p{M}]*\s+услуг|редакционн[\p{L}\p{M}]*\s+принцип|гаранти[\p{L}\p{M}]*\s+процесс|состав[\p{L}\p{M}]*\s+(?:задач|результат)|правов[\p{L}\p{M}]*\s+маршрут|матриц[\p{L}\p{M}]*\s+(?:проверк|удержан)|доказательственн[\p{L}\p{M}]*\s+цепочк|проверяем[\p{L}\p{M}]*\s+хронолог|оценк[\p{L}\p{M}]*\s+плат[её]жн[\p{L}\p{M}]*\s+цепочк|вс[ея]\s+конструкц[\p{L}\p{M}]*\s+сделк|первично\s+посмотр|обратн[\p{L}\p{M}]*\s+связь\s+без\s+персональн[\p{L}\p{M}]*\s+данн|связанн[\p{L}\p{M}]*\s+услуг/iu,
  },
];

export const collectTextValues = (value) => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectTextValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectTextValues);
  return [];
};

export const findPublicCopyFindings = (values) => {
  const findings = [];
  for (const value of values) {
    for (const rule of publicCopyRules) {
      const match = String(value).match(rule.pattern);
      if (match) findings.push({ ruleId: rule.id, label: rule.label, match: match[0], value: String(value) });
    }
  }
  return findings;
};

const decodeHtml = (value = "") => String(value)
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

export const visibleMainText = (html = "") => {
  const main = String(html).match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || String(html);
  return decodeHtml(main
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
};
