export const publicCopyRules = [
  {
    id: "seo-editorial-language",
    label: "внутренняя SEO- или редакционная терминология",
    pattern: /\bSEO\b|\bSERP\b|каннибализац|владелец\s+интента|поисков\w*\s+(?:интент|маршрут)|контентн\w*\s+(?:карточк|сесси|шлюз)|(?:^|\s)кластер(?:а|ом|у|ы)?(?:\s|$)/iu,
  },
  {
    id: "internal-source-provenance",
    label: "внутреннее происхождение материала",
    pattern: /практическ\w*\s+элемент|оплаченн\w*\s+(?:юридическ\w*\s+)?(?:практик\w*|работ\w*)|подтвержда\w*\s+выполненн\w*\s+юридическ\w*\s+работ\w*|основан\w*\s+на\s+(?:обращени\w*|повторяющ\w*\s+проблем\w*)|источник\w*\s+практическ\w*\s+элемент/iu,
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
