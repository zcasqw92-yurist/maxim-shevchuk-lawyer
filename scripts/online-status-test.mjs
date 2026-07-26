import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isOnlineAt, moscowHour } from "../src/online-status.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const boundaries = [
  ["06:59", "2026-07-26T03:59:00.000Z", false],
  ["07:00", "2026-07-26T04:00:00.000Z", true],
  ["22:59", "2026-07-26T19:59:00.000Z", true],
  ["23:00", "2026-07-26T20:00:00.000Z", false],
];

for (const [label, iso, expected] of boundaries) {
  const date = new Date(iso);
  assert(isOnlineAt(date) === expected, `Неверный статус в ${label} МСК`);
}

assert(moscowHour(new Date("2026-01-15T04:00:00.000Z")) === 7, "Зимнее время должно вычисляться по Москве");
assert(moscowHour(new Date("2026-07-15T04:00:00.000Z")) === 7, "Летнее время должно вычисляться по Москве");

const app = await readFile(join(root, "src", "app.js"), "utf8");
const visualTrust = await readFile(join(root, "src", "visual-trust.js"), "utf8");
assert(app.includes("startOnlineStatus();"), "app.js должен запускать единый контроллер статуса");
assert(!visualTrust.includes("data-online-status"), "visual-trust.js не должен содержать дублирующий контроллер статуса");

console.log("Online status 07:00–23:00 MSK: OK");
