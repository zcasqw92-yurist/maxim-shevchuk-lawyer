import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "dist", "index.html"), "utf8");
const blockMatch = html.match(/<div class="hero__quick-choices"[\s\S]*?<\/div>\s*<div class="hero__assurance"/);
if (!blockMatch) throw new Error("Блок быстрых ситуаций не найден");

const expected = [
  ["возврат денежных средств", "Не возвращают деньги"],
  ["неисполнение договора", "Не исполняют договор"],
  ["досудебная претензия", "Нужна претензия"],
  ["подготовка иска", "Нужно обратиться в суд"],
  ["бездействие полиции или государственного органа", "Полиция или орган бездействует"],
  ["другая ситуация", "Другая ситуация"],
];

const buttons = [...blockMatch[0].matchAll(/<button[^>]+data-topic="([^"]+)"[^>]*>([^<]+)<\/button>/g)]
  .map((match) => [match[1], match[2].trim()]);

if (buttons.length !== expected.length) {
  throw new Error(`Ожидалось ${expected.length} быстрых ситуаций, найдено ${buttons.length}`);
}

for (let index = 0; index < expected.length; index += 1) {
  const [expectedTopic, expectedLabel] = expected[index];
  const [actualTopic, actualLabel] = buttons[index] || [];
  if (actualTopic !== expectedTopic || actualLabel !== expectedLabel) {
    throw new Error(`Неверная быстрая ситуация №${index + 1}: ${actualLabel || "не найдена"}`);
  }
}

console.log("Quick situations test passed: 6 topics and labels");
