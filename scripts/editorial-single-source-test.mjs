import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = join(root, "src", "editorial-data.mjs");
const sourcePath = join(root, "src", "yandex-delivery-lost-parcel-data.mjs");
const registry = await readFile(registryPath, "utf8");
const source = await readFile(sourcePath, "utf8");

const forbiddenPublicCopyFields = [
  "title",
  "description",
  "lead",
  "shortAnswer",
  "sections",
  "faq",
  "ctaTitle",
  "serviceLabel",
  "relatedServices",
  "topic",
];

const registryViolations = forbiddenPublicCopyFields.filter((field) => (
  new RegExp(`(^|[,{;\\n]\\s*)${field}\\s*:`, "m").test(registry)
));

if (registryViolations.length) {
  throw new Error(
    `Public article copy must live in dedicated source modules. `
    + `editorial-data.mjs contains forbidden fields: ${registryViolations.join(", ")}`,
  );
}

const expectedLead = "Отправление не найдено, а чеки на вещи не сохранились. Сохраните карточку заказа, статусы, переписку, полис и сведения об оценочной стоимости. Для каждой вещи соберите подтверждение покупки или принадлежности, фотографии, банковские операции и цены сопоставимых товаров. После этого подайте страховое заявление и отдельно проверьте, кому направлять досудебную претензию.";

if (!source.includes(`lead: "${expectedLead}"`)) {
  throw new Error("C-122 lead must be stored in its dedicated source module");
}
if (source.includes("доказательственную цепочку")) {
  throw new Error("C-122 source still contains the rejected artificial phrase");
}
if (registry.includes("yandexDeliveryLostParcelPublicationArticles")) {
  throw new Error("C-122 must not use a publication-only wrapper in editorial-data.mjs");
}

const { articles } = await import("../src/editorial-data.mjs");
const article = articles.find((item) => item.id === "yandex-delivery-lost-parcel");
if (!article) throw new Error("C-122 is missing from the editorial registry");
if (article.lead !== expectedLead) {
  throw new Error("Published C-122 lead differs from its single source value");
}

console.log("Editorial single-source contract passed: article body copy exists only in dedicated source modules");
