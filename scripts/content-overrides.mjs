import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const replacements = [
  [
    '<h1>Сильная правовая позиция начинается <em data-hero-rotator>с точных фактов</em></h1>',
    '<h1>Передайте ситуацию юристу — разберусь в материалах и объясню, что делать дальше</h1>',
  ],
  [
    '<p class="hero__lead">Разбираю документы, нахожу юридическое основание и выстраиваю последовательность действий — от досудебного требования до искового заявления.</p>',
    '<p class="hero__lead">Вам не нужно самостоятельно определять, нужна претензия, жалоба или иск. Коротко опишите, что произошло, и приложите документы. Первично ознакомлюсь с материалами бесплатно и предложу понятный следующий шаг.</p>',
  ],
  [
    '>Описать ситуацию<svg class="button__icon"',
    '>Описать ситуацию юристу<svg class="button__icon"',
  ],
  [
    '>Узнать стоимость<svg class="button__icon"',
    '>Узнать ориентир стоимости<svg class="button__icon"',
  ],
  [
    '<span class="hero__mobile-assurance"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Конфиденциально</span>',
    '<span class="hero__mobile-assurance"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Первичное знакомство бесплатно · конфиденциально</span>',
  ],
  [
    'Сначала документы</span>',
    'Первично бесплатно</span>',
  ],
  [
    'Конфиденциально</span>',
    'Цена и срок заранее</span>',
  ],
  [
    'Понятным языком</span>',
    'Остаюсь на связи</span>',
  ],
  [
    '<h2 id="contact-path-title">Вы понимаете следующий шаг — без обязательств</h2>',
    '<h2 id="contact-path-title">Сначала спокойно разберёмся, потом решим, нужна ли платная работа</h2>',
  ],
  [
    '<p>Не нужно заполнять анкету или заранее выбирать документ. Первое сообщение помогает определить, что важно уточнить.</p>',
    '<p>Первичное знакомство с ситуацией и материалами бесплатно. Вы можете описать проблему обычными словами — юридический путь определю после проверки фактов.</p>',
  ],
  [
    '<strong>Уточняю важное</strong><p>Максим Юрьевич лично задаёт вопросы по обстоятельствам, срокам и материалам.</p>',
    '<strong>Бесплатно знакомлюсь с материалами</strong><p>Лично уточняю обстоятельства, отвечаю на основные вопросы и объясняю возможный порядок действий.</p>',
  ],
  [
    '<strong>Согласуем действия</strong><p>Вы понимаете, какие материалы нужны и что можно делать дальше.</p>',
    '<strong>Согласуем работу до её начала</strong><p>Вы заранее понимаете состав услуги, точную стоимость и срок. Согласованная цена в процессе не меняется.</p>',
  ],
  [
    '<h2 id="dialog-title">Готов разобрать ситуацию</h2>',
    '<h2 id="dialog-title">Опишите ситуацию — первично посмотрю бесплатно</h2>',
  ],
  [
    'Напишите в удобный мессенджер, что произошло. Максим Юрьевич лично уточнит важные детали и подскажет, с чего начать.',
    'Напишите, что произошло, и приложите имеющиеся материалы. Максим Юрьевич лично ознакомится с ними, ответит на основные вопросы и объяснит, с чего разумнее начать.',
  ],
  [
    '<p class="messenger-dialog__note">Первичное сообщение ни к чему вас не обязывает.</p>',
    '<p class="messenger-dialog__note">Первичное знакомство с ситуацией и материалами бесплатно и ни к чему вас не обязывает.</p>',
  ],
  [
    '<div><span class="eyebrow">Результат работы</span><h2>Что вы получите после разбора</h2></div>',
    '<div><span class="eyebrow">Результат работы</span><h2>Понятная позиция, стоимость и следующий шаг</h2></div>',
  ],
  [
    '<p>Не абстрактную консультацию, а понятную опору для следующего действия — в переписке, претензии, жалобе или суде.</p>',
    '<p>До начала платной работы вы понимаете, что именно нужно сделать, сколько это стоит и в какой срок будет готов результат.</p>',
  ],
  [
    '<div class="price-note reveal"><p>Если для защиты нужно несколько взаимосвязанных документов, состав работы и стоимость согласуются до начала подготовки.</p>',
    '<div class="price-note reveal"><p>Состав работы, точная стоимость и срок согласуются заранее. После согласования цена услуги не увеличивается.</p>',
  ],
  [
    '<span class="eyebrow">Без лишней неопределённости</span>',
    '<span class="eyebrow">После подготовки документа</span>',
  ],
  [
    '<h2>Вы понимаете, что происходит на каждом этапе</h2>',
    '<h2>Вы не остаётесь один на один с готовым документом</h2>',
  ],
  [
    '<p class="lead">Юридическая помощь не должна превращаться в ещё один источник тревоги. После анализа я объясняю, на чём строится позиция и какой шаг следует дальше.</p>',
    '<p class="lead">После передачи документа я остаюсь на связи: поясняю непонятное, помогаю оценить ответ второй стороны и подсказываю дальнейшие действия.</p>',
  ],
  [
    '<span>Как действовать при согласии, отказе, отписке или полном молчании.</span>',
    '<span>Можно показать ответ, отказ или новое требование и уточнить, как действовать дальше.</span>',
  ],
  [
    '<span class="eyebrow eyebrow--light">Начать с фактов</span>',
    '<span class="eyebrow eyebrow--light">Первичный шаг бесплатный</span>',
  ],
  [
    '<h2>Разберём, на чём можно построить позицию</h2>',
    '<h2>Передайте ситуацию юристу — дальше не придётся разбираться одному</h2>',
  ],
  [
    '<p>Опишите ситуацию и перечислите документы. Этого достаточно, чтобы определить первый предметный шаг.</p>',
    '<p>Опишите, что произошло, и перечислите документы. Первично ознакомлюсь бесплатно, отвечу на основные вопросы и предложу понятный следующий шаг.</p>',
  ],
];

const replaceAllChecked = (html, from, to) => {
  if (!html.includes(from)) return html;
  return html.replaceAll(from, to);
};

const replaceRequired = (content, from, to, label) => {
  if (!content.includes(from)) throw new Error(`Не найден обязательный фрагмент: ${label}`);
  return content.replace(from, to);
};

const simplifyPriceQuiz = (html) => {
  let result = html;
  result = replaceRequired(result, "Шаг 1 из 5", "Шаг 1 из 3", "счётчик шагов квиза");
  result = replaceRequired(result, '<h2 id="price-quiz-title">С чем связан вопрос?</h2>', '<h2 id="price-quiz-title">Что произошло?</h2>', "заголовок первого шага квиза");
  result = replaceRequired(result, '<p>Выберите наиболее близкую ситуацию — это поможет понять объём работы.</p>', '<p>Выберите наиболее близкую ситуацию. Подробности можно будет дописать в мессенджере.</p>', "пояснение первого шага квиза");
  result = replaceRequired(result, '<h2>Что уже есть?</h2>', '<h2>Какие материалы есть?</h2>', "заголовок шага материалов");
  result = replaceRequired(result, '<h2>Есть ли срок?</h2>', '<h2>Насколько срочно?</h2>', "заголовок шага срочности");
  result = replaceRequired(result, '<p>Ответы собраны в краткую сводку. Максим Юрьевич уточнит детали и назовёт стоимость до начала работы.</p>', '<p>Ответы собраны в краткую сводку. Максим Юрьевич первично ознакомится с ситуацией бесплатно, уточнит детали и назовёт стоимость до начала работы.</p>', "пояснение результата квиза");

  const removableSteps = ["goal", "other-side"];
  for (const step of removableSteps) {
    const pattern = new RegExp(`\\n\\s*<section class="price-quiz__step" data-price-quiz-step="${step}" hidden>[\\s\\S]*?<\\/section>\\n`, "m");
    if (!pattern.test(result)) throw new Error(`Не найден удаляемый шаг квиза: ${step}`);
    result = result.replace(pattern, "\n");
  }
  return result;
};

const updateQuizScript = async (dist) => {
  const file = join(dist, "assets", "app.js");
  let script = await readFile(file, "utf8");
  const oldFields = `const priceQuizFields = [
  ["issue", "Вопрос"],
  ["goal", "Задача"],
  ["other-side", "Вторая сторона"],
  ["materials", "Материалы"],
  ["timing", "Срок"],
];`;
  const newFields = `const priceQuizFields = [
  ["issue", "Ситуация"],
  ["materials", "Материалы"],
  ["timing", "Срок"],
];`;
  script = replaceRequired(script, oldFields, newFields, "поля итоговой сводки квиза");
  await writeFile(file, script, "utf8");
};

const walkPages = async (dist, paths) => {
  for (const path of paths) {
    const file = join(dist, path, "index.html");
    let html;
    try {
      html = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const [from, to] of replacements) html = replaceAllChecked(html, from, to);
    html = simplifyPriceQuiz(html);
    await writeFile(file, html, "utf8");
  }
};

export const applyContentOverrides = async ({ dist, services }) => {
  const paths = [
    "",
    "uslugi",
    ...services.map((service) => `uslugi/${service.slug}`),
    "o-yuriste",
    "kontakty",
  ];
  await walkPages(dist, paths);
  await updateQuizScript(dist);
};
