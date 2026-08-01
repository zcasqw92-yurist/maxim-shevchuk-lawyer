import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORY_DEFINITIONS,
  SKIPPED_VALUE,
  QUESTION_INDEX,
  answerDisplay,
  buildFullSummary,
  buildMessengerDraft,
  classifyDescription,
  createIntakeState,
  nextQuestion,
  progressForState,
  questionsForCategory,
  setAnswer,
  skipQuestion,
  validateConfiguration,
} from "../dist/assets/intake-assistant-engine.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const forbiddenSummary = /\b(?:undefined|null|NaN)\b|__unknown__|__skipped__|\b(?:question|category)_id\b/i;

const defaultValue = (question) => {
  if (question.type === "text") return question.id === "contact_name" ? "Ирина" : `Тестовый ответ для ${question.summaryLabel}`;
  if (question.type === "multi") return [question.options.find((item) => !item.exclusive && !item.needsDetail)?.value || question.options[0].value];
  return question.options.find((item) => !item.needsDetail)?.value || question.options[0].value;
};

const detailFor = (question, value) => {
  const values = Array.isArray(value) ? value : [value];
  return values.some((item) => question.options?.find((option) => option.value === item)?.needsDetail)
    ? `Уточнение для ${question.summaryLabel}`
    : "";
};

const complete = (categoryId, overrides = {}) => {
  let state = createIntakeState({ description: "Клиент кратко описал юридическую ситуацию, сроки и имеющиеся документы." });
  state = { ...state, categoryId };
  const sequence = questionsForCategory(categoryId);
  for (const question of sequence) {
    const value = Object.hasOwn(overrides, question.id) ? overrides[question.id] : defaultValue(question);
    if (value === SKIPPED_VALUE) state = skipQuestion(state, question.id);
    else state = setAnswer(state, question.id, value, detailFor(question, value));
  }
  return state;
};

for (const error of validateConfiguration()) failures.push(`config: ${error}`);
check(CATEGORY_DEFINITIONS.at(-1)?.id === "other", "fallback category must be last and named other");
check(Object.keys(QUESTION_INDEX).length >= 35, "question registry is unexpectedly small");

for (const category of CATEGORY_DEFINITIONS) {
  const sequence = questionsForCategory(category.id);
  const ids = sequence.map((question) => question.id);
  check(ids.length === new Set(ids).size, `${category.id}: duplicate question in sequence`);
  check(ids.at(-1) === "urgency", `${category.id}: universal urgency must finish the sequence`);

  let state = createIntakeState({ description: `Проверка полного маршрута ${category.label}` });
  state = { ...state, categoryId: category.id };
  for (let index = 0; index < sequence.length; index += 1) {
    const question = nextQuestion(state);
    check(question?.id === sequence[index].id, `${category.id}: wrong next question at ${index}`);
    const value = defaultValue(question);
    state = setAnswer(state, question.id, value, detailFor(question, value));
  }
  check(nextQuestion(state) === null, `${category.id}: completed route has a dead/nonterminal question`);
  const progress = progressForState(state);
  check(progress.answered === progress.total && progress.percent === 100, `${category.id}: completion progress invalid`);
  const summary = buildFullSummary(state);
  check(summary.includes("Ситуация:"), `${category.id}: summary misses source description`);
  check(summary.includes("Желаемый результат:"), `${category.id}: summary misses desired result`);
  check(!forbiddenSummary.test(summary), `${category.id}: summary leaks internal placeholder`);
  check(buildMessengerDraft(state).draft.length <= 1800, `${category.id}: messenger draft exceeds default limit`);

  for (const question of sequence) {
    const variants = question.type === "text"
      ? ["А", `Ответ со знаками: 90 000 ₽, 01.08.2026 — ${question.summaryLabel}`, "Строка 1\nСтрока 2 🙂"]
      : question.type === "single"
        ? question.options.map((item) => item.value)
        : [];

    if (question.type === "multi") {
      const regular = question.options.filter((item) => !item.exclusive).map((item) => item.value);
      const exclusive = question.options.filter((item) => item.exclusive).map((item) => item.value);
      for (let mask = 1; mask < (1 << regular.length); mask += 1) {
        variants.push(regular.filter((_, bit) => mask & (1 << bit)));
      }
      variants.push(...exclusive.map((value) => [value]));
    }

    for (const variant of variants) {
      const tested = complete(category.id, { [question.id]: variant });
      const shown = answerDisplay(tested, question.id);
      check(Boolean(shown), `${category.id}/${question.id}/${JSON.stringify(variant)}: answer not displayable`);
      check(nextQuestion(tested) === null, `${category.id}/${question.id}/${JSON.stringify(variant)}: option creates dead end`);
      check(!forbiddenSummary.test(buildFullSummary(tested)), `${category.id}/${question.id}/${JSON.stringify(variant)}: invalid summary`);
    }

    const skipped = complete(category.id, { [question.id]: SKIPPED_VALUE });
    check(answerDisplay(skipped, question.id) === "Не уточнено", `${category.id}/${question.id}: skip is not explicit`);
    check(nextQuestion(skipped) === null, `${category.id}/${question.id}: skip creates dead end`);
  }

  for (let left = 0; left < sequence.length; left += 1) {
    for (let right = left + 1; right < sequence.length; right += 1) {
      const a = sequence[left];
      const b = sequence[right];
      const aValues = a.type === "text" ? ["А", "Длинный уточняющий ответ"]
        : a.type === "multi" ? a.options.map((item) => [item.value]) : a.options.map((item) => item.value);
      const bValues = b.type === "text" ? ["Б", "Другой уточняющий ответ"]
        : b.type === "multi" ? b.options.map((item) => [item.value]) : b.options.map((item) => item.value);
      for (const aValue of aValues) for (const bValue of bValues) {
        const pair = complete(category.id, { [a.id]: aValue, [b.id]: bValue });
        check(nextQuestion(pair) === null, `${category.id}: pair ${a.id}/${b.id} creates dead end`);
        check(!forbiddenSummary.test(buildFullSummary(pair)), `${category.id}: pair ${a.id}/${b.id} creates invalid summary`);
      }
    }
  }
}

const classifierCases = [
  ["", "other"],
  ["помогите", "other"],
  ["Дал деньги в долг, есть расписка, срок прошёл", "debt"],
  ["Оплатил услугу, ничего не сделали, исполнитель пропал", "refund"],
  ["Подал заявление в полицию, КУСП есть, ответа нет", "police"],
  ["Назначено заседание по апелляции", "court"],
  ["ООО не оплатило счёт и подписанный акт", "contract"],
  ["Работал без договора, зарплату не выплатили", "labor"],
  ["Спор о месте жительства ребёнка и алиментах", "family"],
  ["Подтопило земельный участок, есть акт администрации", "housing"],
  ["Банк передал приказ приставу и арестовали счёт", "credit"],
  ["Нотариус отказал, срок принятия наследства пропущен", "inheritance"],
  ["Перевёл 90 000 ₽ 01.08.2026 🙂\nОн обещал вернуть, но пропал", "debt"],
];
for (const [description, expected] of classifierCases) {
  const actual = classifyDescription(description).categoryId;
  check(actual === expected, `classifier: expected ${expected}, got ${actual} for ${description}`);
}
const mixed = classifyDescription("Оплатил услугу, исполнитель пропал, подал заявление в полицию, получил отказ");
check(mixed.candidates.length >= 2, "classifier: mixed situation must expose several candidates");
check(classifyDescription("Ничего не понятно, совершенно нестандартная история").categoryId === "other", "classifier: unknown text must use universal fallback");
check(classifyDescription("долг", "возврат денежных средств").candidates.length >= 1, "classifier: topic hint must be accepted safely");

const longState = complete("other", {
  timeline: "Очень длинная хронология ".repeat(90),
  amount_or_subject: "Несколько требований и объектов спора ".repeat(30),
});
const longDraft = buildMessengerDraft(longState, 600);
check(longDraft.compact, "long summary must switch to compact messenger mode");
check(longDraft.draft.length <= 600, "compact draft exceeds explicit limit");
check(longDraft.full.length > longDraft.draft.length, "compact mode lost full summary distinction");

for (const file of ["dist/assets/intake-assistant-engine.mjs", "dist/assets/intake-assistant.mjs"]) {
  const source = await readFile(join(root, file), "utf8");
  for (const forbidden of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "localStorage.setItem", "sessionStorage.setItem"]) {
    check(!source.includes(forbidden), `${file}: forbidden persistence/network marker ${forbidden}`);
  }
}

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const pagesWorkflow = await readFile(join(root, ".github", "workflows", "pages.yml"), "utf8");
check(packageJson.scripts?.["test:intake-assistant"]?.includes("intake-assistant-graph-test.mjs"), "package: intake assistant test script is missing graph test");
check(packageJson.scripts?.["test:intake-assistant"]?.includes("intake-assistant-browser-test.mjs"), "package: intake assistant test script is missing browser test");
check(packageJson.scripts?.check?.includes("npm run test:intake-assistant"), "package: full check does not run intake assistant gate");
check(pagesWorkflow.includes("node --check scripts/intake-assistant-live-test.mjs"), "pages workflow: intake live script syntax gate is missing");
check(pagesWorkflow.includes("node scripts/intake-assistant-live-test.mjs"), "pages workflow: production intake live verification is missing");
check(pagesWorkflow.indexOf("node scripts/verify-custom-domain-sha.mjs") < pagesWorkflow.indexOf("node scripts/intake-assistant-live-test.mjs"), "pages workflow: intake live verification must run after exact custom-domain SHA");
check(pagesWorkflow.includes("reports/intake-assistant-live.json"), "pages workflow: intake live diagnostic report is not uploaded on failure");

const builtHome = await readFile(join(root, "dist", "index.html"), "utf8");
check(builtHome.includes("/assets/intake-assistant.css?v="), "built home is missing intake stylesheet");
check(builtHome.includes("/assets/intake-assistant.mjs?v="), "built home is missing intake runtime");
const builtPrivacy = await readFile(join(root, "dist", "politika-konfidencialnosti", "index.html"), "utf8");
for (const marker of [
  "Диалоговый помощник работает без формы и базы данных",
  "не записываются в localStorage или sessionStorage",
  "Он не является искусственным интеллектом",
  "ничего не отправляет автоматически",
  "оператор не получает его имя, контакт, текст черновика",
]) check(builtPrivacy.includes(marker), `privacy policy is missing: ${marker}`);

const uiSource = await readFile(join(root, "dist/assets/intake-assistant.mjs"), "utf8");
for (const forbidden of ["createElement(\"input\")", "createElement(\"textarea\")", "<form", "<input", "<textarea", "new FormData"]) {
  check(!uiSource.includes(forbidden), `UI must remain form-free: ${forbidden}`);
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}

console.log(`Intake graph passed: ${CATEGORY_DEFINITIONS.length} categories, ${Object.keys(QUESTION_INDEX).length} unique questions, every option/skip/detail transition, every multi-select subset and all pairwise state interactions; no dead ends or data persistence`);
