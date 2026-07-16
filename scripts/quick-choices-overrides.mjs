import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const originalChoices = `            <div>
              <button type="button" data-dialog-open data-topic="возврат денежных средств">Не возвращают деньги</button>
              <button type="button" data-dialog-open data-topic="досудебная претензия">Нужна претензия</button>
              <button type="button" data-dialog-open data-topic="спор по договору">Спор по договору</button>
              <button type="button" data-dialog-open data-topic="подготовка иска">Нужно в суд</button>
            </div>`;

const expandedChoices = `            <div>
              <button type="button" data-dialog-open data-topic="возврат денежных средств">Не возвращают деньги</button>
              <button type="button" data-dialog-open data-topic="неисполнение договора">Не исполняют договор</button>
              <button type="button" data-dialog-open data-topic="досудебная претензия">Нужна претензия</button>
              <button type="button" data-dialog-open data-topic="подготовка иска">Нужно обратиться в суд</button>
              <button type="button" data-dialog-open data-topic="бездействие полиции или государственного органа">Полиция или орган бездействует</button>
              <button type="button" data-dialog-open data-topic="другая ситуация">Другая ситуация</button>
            </div>`;

export const applyQuickChoicesOverrides = async ({ dist }) => {
  const file = join(dist, "index.html");
  const html = await readFile(file, "utf8");
  if (!html.includes(originalChoices)) {
    throw new Error("Не найден исходный блок быстрых ситуаций на главной странице");
  }
  const updated = html.replace(originalChoices, expandedChoices);
  await writeFile(file, updated, "utf8");
};
