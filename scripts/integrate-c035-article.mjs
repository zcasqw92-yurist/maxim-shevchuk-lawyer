import { readFile, writeFile, unlink } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, content) => writeFile(path, content, "utf8");

const insertOnce = (content, marker, addition, label) => {
  if (content.includes(addition.trim())) return content;
  if (!content.includes(marker)) throw new Error(`Не найден маркер: ${label}`);
  return content.replace(marker, `${marker}${addition}`);
};

const replaceRequired = (content, before, after, label) => {
  if (content.includes(after) && !content.includes(before)) return content;
  if (!content.includes(before)) throw new Error(`Не найдено значение для замены: ${label}`);
  return content.replace(before, after);
};

const articleUrl = "https://yuristshevchuk.com/razbory/plokho-pokrasili-mashinu-v-avtoservise/";

let editorial = await read("src/editorial-data.mjs");
editorial = insertOnce(
  editorial,
  'import { unpaidServicesWithoutContractArticles } from "./unpaid-services-without-contract-data.mjs";\n',
  'import { autoservicePaintDefectsArticles } from "./autoservice-paint-defects-data.mjs";\n',
  "импорт статьи C-035",
);
editorial = insertOnce(
  editorial,
  "  ...unpaidServicesWithoutContractArticles,\n",
  "  ...autoservicePaintDefectsArticles,\n",
  "регистрация статьи C-035",
);
await write("src/editorial-data.mjs", editorial);

const governancePath = "config/content-governance.json";
const governance = JSON.parse(await read(governancePath));
const governedPath = "src/autoservice-paint-defects-data.mjs";
if (!governance.governedContentPaths.includes(governedPath)) {
  const anchor = governance.governedContentPaths.indexOf("src/unpaid-services-without-contract-data.mjs");
  if (anchor < 0) throw new Error("Не найден соседний управляемый модуль");
  governance.governedContentPaths.splice(anchor + 1, 0, governedPath);
}
await write(governancePath, `${JSON.stringify(governance, null, 2)}\n`);

let siteConfig = await read("site.config.mjs");
siteConfig = replaceRequired(
  siteConfig,
  '  contentLastModified: "2026-08-02",',
  '  contentLastModified: "2026-08-03",',
  "общая дата содержательного обновления",
);
siteConfig = replaceRequired(
  siteConfig,
  '    "/razbory": "2026-08-02",',
  '    "/razbory": "2026-08-03",',
  "дата каталога разборов",
);
siteConfig = replaceRequired(
  siteConfig,
  '    "/razbory/zakazchik-ne-oplatil-rabotu-bez-dogovora": "2026-08-02",',
  '    "/razbory/zakazchik-ne-oplatil-rabotu-bez-dogovora": "2026-08-03",',
  "исправленная дата C-016",
);
siteConfig = insertOnce(
  siteConfig,
  '    "/razbory/zakazchik-ne-oplatil-rabotu-bez-dogovora": "2026-08-03",\n',
  '    "/razbory/plokho-pokrasili-mashinu-v-avtoservise": "2026-08-03",\n',
  "дата статьи C-035",
);
await write("site.config.mjs", siteConfig);

let productionState = await read("docs/current-production-state.md");
productionState = replaceRequired(
  productionState,
  "Актуально на 1 августа 2026 года.",
  "Актуально на 3 августа 2026 года.",
  "дата production-документации",
);
productionState = replaceRequired(
  productionState,
  "- 29 канонических содержательных URL: главная, каталог и семь страниц услуг, раздел и тринадцать юридических разборов, раздел и два полных кейса практики, страница о юристе, контакты и политика конфиденциальности;",
  "- 30 канонических содержательных URL: главная, каталог и семь страниц услуг, раздел и четырнадцать юридических разборов, раздел и два полных кейса практики, страница о юристе, контакты и политика конфиденциальности;",
  "число публичных URL",
);
await write("docs/current-production-state.md", productionState);

const manifestPath = "reports/content-sessions/latest.json";
const manifest = JSON.parse(await read(manifestPath));
manifest.schemaVersion = 3;
manifest.sessionId = "20260803-autoservice-paint-defects";
manifest.reviewedAt = new Date().toISOString();
manifest.spreadsheet.modifiedTime = "2026-08-03T06:17:01.733Z";
manifest.sourceTrace = {
  dialogIds: ["699813e5-fdcc-838f-b65b-28ac09a29840"],
  situationIds: ["SIT-20260220-001"],
  workIds: ["ЮД-ИМП-011"],
  contentIds: ["C-035"],
  caseIds: ["K-008"],
  notes: "Прямое обращение подтверждает проблему некачественной покраски, сорванных сроков, дополнительных доплат и повреждений автомобиля. Историческая запись ЮрДоки подтверждает оплаченную подготовку претензии по некачественному ремонту. Заказ работы и положительный итог по диалогу C-035 не подтверждены; K-008 не используется как успешный кейс.",
};
manifest.seoReview = {
  status: "completed",
  checkedAt: "2026-08-03T09:03:51.333Z",
  region: "Москва",
  primaryIntent: "зафиксировать недостатки некачественной покраски автомобиля до переделки, выбрать требование и подготовить претензию автосервису",
  verifiedCluster: [
    "некачественно покрасили машину в автосервисе что делать",
    "плохо покрасили машину что делать",
    "как вернуть деньги за некачественную покраску автомобиля",
    "претензия автосервису за плохую покраску",
  ],
  intentMap: [
    {
      intent: "действия после плохой покраски автомобиля в обычном платном автосервисе",
      target: "new article owner /razbory/plokho-pokrasili-mashinu-v-avtoservise/",
    },
    {
      intent: "заказать индивидуальную претензию к автосервису",
      target: "existing service owner /uslugi/dosudebnoe-uregulirovanie/",
    },
    {
      intent: "вернуть деньги и взыскать подтверждённые расходы",
      target: "existing service owner /uslugi/vozvrat-deneg/",
    },
    {
      intent: "гарантийный ремонт нового автомобиля длится больше 45 дней",
      target: "existing article owner /razbory/garantiynyy-remont-avtomobilya-bolshe-45-dney/",
    },
    {
      intent: "оплаченная услуга вообще не оказана",
      target: "existing article owner /razbory/vernut-dengi-za-neokazannuyu-uslugu/",
    },
  ],
  intentOwnership: [
    {
      intent: "зафиксировать плохую покраску автомобиля до переделки, выбрать требование и направить претензию обычному платному автосервису",
      ownerUrl: articleUrl,
      ownerType: "article",
      supportingUrls: [
        "https://yuristshevchuk.com/uslugi/dosudebnoe-uregulirovanie/",
        "https://yuristshevchuk.com/uslugi/vozvrat-deneg/",
        "https://yuristshevchuk.com/uslugi/iskovoe-zayavlenie/",
      ],
      supportingCaseIds: [],
      excludedQueries: [
        "гарантийный ремонт автомобиля больше 45 дней",
        "некачественный ремонт по ОСАГО или каско",
        "скрытый недостаток купленного подержанного автомобиля",
        "автомобиль повредили в сервисе без спора о покраске",
        "услуга автосервиса вообще не оказана",
        "бесплатный образец претензии автосервису",
        "мошенничество автосервиса без самостоятельных признаков первоначального обмана",
      ],
      existingCompetingUrlsReviewed: [
        "https://yuristshevchuk.com/razbory/garantiynyy-remont-avtomobilya-bolshe-45-dney/",
        "https://yuristshevchuk.com/razbory/vernut-dengi-za-neokazannuyu-uslugu/",
        "https://yuristshevchuk.com/uslugi/dosudebnoe-uregulirovanie/",
        "https://yuristshevchuk.com/uslugi/vozvrat-deneg/",
        "https://yuristshevchuk.com/uslugi/iskovoe-zayavlenie/",
      ],
      decision: "new-owner",
      reason: "Существующие страницы раскрывают длительный гарантийный ремонт и полное неоказание услуги, но не объясняют, как сохранить состояние автомобиля до повторной покраски, связать конкретные дефекты с заказом и рассчитать одно требование к автосервису.",
    },
  ],
  serpSnapshots: [
    {
      intent: "действия после некачественной покраски автомобиля в автосервисе",
      checkedAt: "2026-08-03T09:03:51.333Z",
      region: "Москва",
      engines: [
        {
          engine: "Yandex",
          query: "некачественно покрасили машину в автосервисе что делать",
          organicResultsReviewed: 20,
          sponsoredResultsObserved: 0,
          sponsoredResultLabels: [],
          sponsoredAdvertiserTypes: [],
          sponsoredOfferPatterns: [],
          dominantIntent: "практическая инструкция владельцу автомобиля после плохой покраски в сервисе",
          resultTypes: [
            "автомобильные издания",
            "юридические статьи",
            "вопросы и ответы",
            "официальные разъяснения",
            "автомобильные сообщества",
          ],
          localPack: false,
          snippetPatterns: [
            "плохо покрасили машину",
            "разнотон после покраски",
            "как доказать недостатки",
            "претензия автосервису",
            "вернуть деньги за ремонт",
          ],
          competitorCoverageGaps: [
            "редко объясняется, что нужно сделать до повторной покраски, чтобы не потерять доказательства",
            "почти не связываются обещанный результат, карта дефектов, способ фиксации и расчёт одного требования",
          ],
          staleOrWeakResults: [
            "часть результатов смешивает обычную платную покраску с ремонтом по ОСАГО, каско и гарантийным ремонтом",
            "несколько материалов ограничиваются общей рекомендацией сделать экспертизу и обратиться в суд",
          ],
        },
        {
          engine: "Google",
          query: "некачественно покрасили машину в автосервисе что делать",
          organicResultsReviewed: 9,
          sponsoredResultsObserved: 0,
          sponsoredResultLabels: [],
          sponsoredAdvertiserTypes: [],
          sponsoredOfferPatterns: [],
          dominantIntent: "разговорный поиск порядка действий после плохой покраски автомобиля",
          resultTypes: [
            "статьи мастерских",
            "автомобильные сообщества",
            "юридические консультации",
            "материалы о некачественном ремонте",
          ],
          localPack: false,
          snippetPatterns: [
            "что делать если плохо покрасили",
            "как вернуть деньги",
            "фотографии и документы",
            "независимая экспертиза",
            "претензия и суд",
          ],
          competitorCoverageGaps: [
            "не отделяется первичная фиксация от последующей переделки автомобиля",
            "мало материалов с проверкой исполнителя, дополнительных доплат и дублирования сумм в расчёте",
          ],
          staleOrWeakResults: [
            "часть результатов является обсуждениями без полного правового маршрута",
          ],
        },
      ],
      pageTypeDecision: "article",
      decisionReason: "Обе поисковые системы подтверждают самостоятельную проблемную потребность и разговорную формулировку. Коммерческая страница претензий не заменяет пошаговую инструкцию по сохранению доказательств и расчёту требования.",
      canProvideBetterAnswer: true,
    },
  ],
  practicalElements: [
    {
      contentId: "autoservice-poor-painting",
      targetUrl: articleUrl,
      type: "evidence-matrix",
      title: "Матрица: обещано, передано, зафиксировано, заявлено",
      userValue: "Помогает владельцу автомобиля сохранить первоначальное состояние до переделки, сопоставить заказ с конкретными дефектами и вывести из них одно требование и проверяемую сумму.",
      competitorGap: "Верхние результаты перечисляют права, фото и экспертизу, но редко показывают последовательность фиксации до повторной покраски и не предупреждают о дублировании цены работ, переделки и повреждённых деталей.",
      sourceBasis: "прямое обращение владельца автомобиля, подтверждённая подготовка претензии по некачественному ремонту, актуальная органическая выдача и действующие нормы защиты прав потребителей",
      sourceIds: [
        "C-035",
        "699813e5-fdcc-838f-b65b-28ac09a29840",
        "SIT-20260220-001",
        "R-0129",
        "R-0130",
        "P-016",
        "P-025",
        "ЮД-ИМП-011",
      ],
      placement: "разделы о фиксации до переделки, карте дефектов, доказательственной матрице, выборе требования и расчёте претензии",
      verifiedAgainstSerp: true,
    },
  ],
  cannibalizationChecked: true,
  overOptimizationRisk: "low",
  wordstat: {
    used: false,
    reason: "Проблема, целевой документ и тип страницы подтверждены прямым обращением, оплаченной подготовкой претензии и самостоятельной выдачей Яндекса и Google; частотность не изменила бы архитектурное решение.",
  },
};
manifest.editorialChecks = {
  factsSeparatedFromHypotheses: true,
  paidWorkSeparatedFromPaymentDetails: true,
  workProcedureAndCaseResultsSeparated: true,
  legalSourcesVerified: true,
  anonymizationVerified: true,
  criticalSourceErrorsResolved: true,
};
manifest.contentChanges = [
  {
    path: "src/autoservice-paint-defects-data.mjs",
    kind: "article",
    contentId: "autoservice-poor-painting",
    action: "created",
    expectedUrl: articleUrl,
  },
  {
    path: "src/editorial-data.mjs",
    kind: "article-registration",
    contentId: "autoservice-poor-painting",
    action: "updated",
    expectedUrl: articleUrl,
  },
  {
    path: "site.config.mjs",
    kind: "content-date",
    contentId: "autoservice-poor-painting",
    action: "updated",
    expectedUrl: articleUrl,
  },
];
manifest.publication = {
  expectedUrls: [articleUrl],
  notes: "Публикуется самостоятельный разбор, ведущий к индивидуальной претензии автосервису. Диалог C-035 и K-008 не используются как подтверждение заказанной работы или положительного результата. Завершение возможно только после полного CI, подтверждения production SHA и повторной проверки прежних статей.",
  status: "ready-for-review",
};
manifest.plannedChecks = [
  "npm run check",
  "npm run test:live",
  "node scripts/live-all-publications-smoke.mjs",
  "node scripts/live-public-copy-regression-test.mjs",
];
await write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

for (const temporaryPath of [
  "scripts/integrate-c035-article.mjs",
  ".github/workflows/integrate-c035-article.yml",
]) {
  await unlink(temporaryPath);
}

console.log("C-035 integrated into the editorial pipeline");
