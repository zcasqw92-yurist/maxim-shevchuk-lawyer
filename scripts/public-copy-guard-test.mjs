import { articles } from "../src/editorial-data.mjs";

const collectStrings = (value) => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
};

const forbidden = [
  { label: "SEO-терминология", pattern: /\bSEO\b|\bSERP\b|каннибализац|владелец\s+интента|контентн\w*\s+карточк|поисков\w*\s+(?:интент|маршрут)|(?:^|\s)кластер(?:а|ом|у|ы)?(?:\s|$)/iu },
  { label: "внутреннее происхождение материала", pattern: /практическ\w*\s+элемент|оплаченн\w*\s+(?:юридическ\w*\s+)?(?:практик\w*|работ\w*)|подтвержда\w*\s+выполненн\w*\s+юридическ\w*\s+работ\w*|основан\w*\s+на\s+(?:обращени\w*|повторяющ\w*\s+проблем\w*)/iu },
];

const errors = [];
for (const article of articles.filter((item) => item.status === "published")) {
  for (const value of collectStrings(article)) {
    for (const rule of forbidden) {
      if (rule.pattern.test(value)) errors.push(article.slug + ": " + rule.label + ": " + value);
    }
  }
}

if (errors.length) {
  console.error("Публичные разборы содержат внутреннюю редакционную терминологию:\n" + errors.map((item) => "- " + item).join("\n"));
  process.exit(1);
}

console.log("Public copy guard passed: " + articles.filter((item) => item.status === "published").length + " published analyses checked");
