import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const html = await readFile(join(root, "dist/uslugi/vozvrat-deneg/index.html"), "utf8");
const required = [
  "Возврат денег за услугу, аванс или навязанный договор",
  "Выберите ситуацию: основания возврата денег различаются",
  "/razbory/vernut-dengi-za-neokazannuyu-uslugu/",
  "/razbory/otkaz-ot-dogovora-okazaniya-uslug/",
  "/razbory/vernut-dengi-za-navyazannuyu-uslugu/",
  "/razbory/prodavets-propal-posle-perevoda/",
  "При возврате предоплаты значение имеют",
  "После претензии нужно считать срок по применимой норме",
];
const missing = required.filter((marker) => !html.includes(marker));
if (missing.length) {
  console.error(`Refund service hub is incomplete: ${missing.join(", ")}`);
  process.exit(1);
}
const forbidden = ["C-166", "ЮД-ИМП", "владелец интента", "SERP", "оплаченная практика"];
const leaked = forbidden.filter((marker) => html.includes(marker));
if (leaked.length) {
  console.error(`Refund service hub leaks internal language: ${leaked.join(", ")}`);
  process.exit(1);
}
console.log("Refund service hub contract passed: broad commercial owner routes four independent situations and keeps prepayment/deadline on the service page");
