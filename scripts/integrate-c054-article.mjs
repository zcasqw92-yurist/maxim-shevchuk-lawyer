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

const articleUrl = "https://yuristshevchuk.com/razbory/spisali-dengi-po-sudebnomu-prikazu/";

let editorial = await read("src/editorial-data.mjs");
editorial = insertOnce(
  editorial,
  'import { autoservicePaintDefectsArticles } from "./autoservice-paint-defects-data.mjs";\n',
  'import { judicialOrderAfterWriteoffArticles } from "./judicial-order-after-writeoff-data.mjs";\n',
  "импорт статьи C-054",
);
editorial = insertOnce(
  editorial,
  "  ...autoservicePaintDefectsArticles,\n",
  "  ...judicialOrderAfterWriteoffArticles,\n",
  "регистрация статьи C-054",
);
await write("src/editorial-data.mjs", editorial);

const governancePath = "config/content-governance.json";
const governance = JSON.parse(await read(governancePath));
const governedPath = "src/judicial-order-after-writeoff-data.mjs";
if (!governance.governedContentPaths.includes(governedPath)) {
  const anchor = governance.governedContentPaths.indexOf("src/autoservice-paint-defects-data.mjs");
  if (anchor < 0) throw new Error("Не найден соседний управляемый модуль");
  governance.governedContentPaths.splice(anchor + 1, 0, governedPath);
}
await write(governancePath, `${JSON.stringify(governance, null, 2)}\n`);

let siteConfig = await read("site.config.mjs");
siteConfig = insertOnce(
  siteConfig,
  '    "/razbory/plokho-pokrasili-mashinu-v-avtoservise": "2026-08-03",\n',
  '    "/razbory/spisali-dengi-po-sudebnomu-prikazu": "2026-08-03",\n',
  "дата статьи C-054",
);
await write("site.config.mjs", siteConfig);

let productionState = await read("docs/current-production-state.md");
productionState = replaceRequired(
  productionState,
  "- 30 канонических содержательных URL: главная, каталог и семь страниц услуг, раздел и четырнадцать юридических разборов, раздел и два полных кейса практики, страница о юристе, контакты и политика конфиденциальности;",
  "- 31 канонический содержательный URL: главная, каталог и семь страниц услуг, раздел и пятнадцать юридических разборов, раздел и два полных кейса практики, страница о юристе, контакты и политика конфиденциальности;",
  "число публичных URL",
);
await write("docs/current-production-state.md", productionState);

const manifestPath = "reports/content-sessions/latest.json";
const manifest = JSON.parse(await read(manifestPath));
manifest.schemaVersion = 3;
manifest.sessionId = "20260803-judicial-order-after-writeoff";
manifest.reviewedAt = new Date().toISOString();
manifest.spreadsheet.modifiedTime = "2026-08-03T13:16:51.011Z";
manifest.sourceTrace = {
  dialogIds: ["692bd795-87a0-832b-8275-cbda50945f35"],
  situationIds: ["SIT-20251130-001"],
  workIds: ["ЮД-ИМП-077"],
  contentIds: ["C-054"],
  caseIds: [],
  notes: "Прямое обращение подтверждает срочную потребность отменить судебный приказ и проверить срок. ЮД-ИМП-077 подтверждает оплаченную подготовку возражений и процессуальной позиции. Заказ по диалогу, факт подачи, отмена приказа и окончательный результат отдельно не подтверждены и публично не заявляются.",
};
manifest.seoReview = {
  status: "completed",
  checkedAt: "2026-08-03T13:33:43.758Z",
  region: "Москва",
  primaryIntent: "должник узнал о судебном приказе после списания денег, должен доказать дату узнавания, подать возражения и определить порядок возврата взысканного",
  verifiedCluster: [
    "узнал о судебном приказе после списания денег что делать",
    "списали деньги по судебному приказу о котором не знал",
    "как отменить судебный приказ после списания денег",
    "как вернуть деньги после отмены судебного приказа",
  ],
  intentMap: [
    {
      intent: "должник впервые узнал о приказе из списания, ареста или постановления пристава",
      target: "new article owner /razbory/spisali-dengi-po-sudebnomu-prikazu/",
    },
    {
      intent: "кредитор выбирает между приказом и иском по расписке",
      target: "existing article owner /razbory/dolg-po-raspiske-prikaz-ili-isk/",
    },
    {
      intent: "заказать подготовку процессуального обращения или жалобы",
      target: "existing service owner /uslugi/zhaloby-i-obrashcheniya/",
    },
    {
      intent: "оспаривание действий пристава после отмены приказа",
      target: "supporting service owner /uslugi/zhaloby-i-obrashcheniya/",
    },
  ],
  intentOwnership: [
    {
      intent: "доказать позднее узнавание о судебном приказе после списания, подать возражения и определить способ возврата уже взысканных денег",
      ownerUrl: articleUrl,
      ownerType: "article",
      supportingUrls: [
        "https://yuristshevchuk.com/uslugi/zhaloby-i-obrashcheniya/",
        "https://yuristshevchuk.com/uslugi/vzyskanie-dolga/",
        "https://yuristshevchuk.com/razbory/dolg-po-raspiske-prikaz-ili-isk/",
      ],
      supportingCaseIds: [],
      excludedQueries: [
        "кредитор выбирает судебный приказ или иск",
        "приказ получен и десятидневный срок ещё не истёк без исполнения",
        "списание по исполнительному листу или нотариальной надписи",
        "пристав списал защищённые социальные выплаты",
        "приказ отменён до списания, но пристав продолжил исполнение",
        "кассационное обжалование вступившего в силу судебного приказа",
        "бесплатный образец заявления об отмене судебного приказа",
      ],
      existingCompetingUrlsReviewed: [
        "https://yuristshevchuk.com/razbory/dolg-po-raspiske-prikaz-ili-isk/",
        "https://yuristshevchuk.com/razbory/vernut-dolg-bez-raspiski/",
        "https://yuristshevchuk.com/uslugi/vzyskanie-dolga/",
        "https://yuristshevchuk.com/uslugi/zhaloby-i-obrashcheniya/",
      ],
      decision: "new-owner",
      reason: "Существующая долговая статья объясняет выбор процедуры кредитором. Она не раскрывает действия должника после неожиданного списания, доказательства позднего узнавания, прекращение исполнения и отдельный возврат уже перечисленных денег.",
    },
  ],
  serpSnapshots: [
    {
      intent: "доказать позднее узнавание о судебном приказе после списания, подать возражения и определить способ возврата уже взысканных денег",
      checkedAt: "2026-08-03T13:33:43.758Z",
      region: "Москва",
      engines: [
        {
          engine: "Yandex",
          query: "узнал о судебном приказе после списания денег что делать",
          organicResultsReviewed: 20,
          sponsoredResultsObserved: 0,
          sponsoredResultLabels: [],
          sponsoredAdvertiserTypes: [],
          sponsoredOfferPatterns: [],
          dominantIntent: "пошаговые действия после неожиданного списания по судебному приказу",
          resultTypes: [
            "юридические статьи",
            "банковские инструкции",
            "вопросы пользователей",
            "официальные разъяснения",
            "материалы о повороте исполнения",
          ],
          localPack: false,
          snippetPatterns: [
            "списали деньги по судебному приказу",
            "не знал о приказе",
            "узнал от приставов или банка",
            "отмена судебного приказа",
            "как вернуть списанные деньги",
          ],
          competitorCoverageGaps: [
            "часто не разделяется отмена приказа, прекращение исполнения и поворот исполнения",
            "редко показывается доказательственная связь между отправкой письма, причиной неполучения, датой узнавания и скоростью подачи возражений",
          ],
          staleOrWeakResults: [
            "часть материалов обещает возврат денег без проверки, где они находятся и подал ли взыскатель иск",
            "часть результатов смешивает действующий приказ и списание после уже состоявшейся отмены",
          ],
        },
        {
          engine: "Google",
          query: "узнал о судебном приказе после списания денег что делать",
          organicResultsReviewed: 9,
          sponsoredResultsObserved: 0,
          sponsoredResultLabels: [],
          sponsoredAdvertiserTypes: [],
          sponsoredOfferPatterns: [],
          dominantIntent: "отмена приказа после ареста или списания и возврат удержанных средств",
          resultTypes: [
            "юридические инструкции",
            "вопросы и ответы",
            "официальный материал ФССП",
            "статьи о возврате после отмены",
          ],
          localPack: false,
          snippetPatterns: [
            "не получал судебный приказ",
            "восстановление возможности подать возражения",
            "деньги уже списаны",
            "поворот исполнения",
            "взыскатель может подать иск",
          ],
          competitorCoverageGaps: [
            "мало материалов с отдельной картой состояния денег: блокировка, депозит ФССП, перечисление взыскателю, прямое исполнение банком",
            "не всегда объясняется, что подача возражений сама по себе не прекращает исполнение",
          ],
          staleOrWeakResults: [
            "часть выдачи представлена общими шаблонными инструкциями без проверки почтовых материалов и последующего иска",
          ],
        },
      ],
      pageTypeDecision: "article",
      decisionReason: "Обе поисковые системы подтверждают самостоятельный срочный жизненный сценарий, который не совпадает с коммерческой страницей жалоб и статьёй для кредитора о выборе приказа или иска.",
      canProvideBetterAnswer: true,
    },
  ],
  practicalElements: [
    {
      contentId: "judicial-order-after-writeoff",
      targetUrl: articleUrl,
      type: "deadline-and-money-state-matrix",
      title: "Матрица срока и карта движения списанных денег",
      userValue: "Помогает доказать позднее узнавание без противоречий и выбрать следующий документ в зависимости от того, заблокированы деньги, находятся у пристава или уже перечислены взыскателю.",
      competitorGap: "Верхние результаты обычно дают общий порядок отмены и возврата, но редко разделяют доказательства срока и четыре состояния взысканной суммы.",
      sourceBasis: "прямое обращение должника, оплаченная подготовка возражений, свежая выдача Яндекса и Google, действующие нормы ГПК РФ и Закона об исполнительном производстве",
      sourceIds: [
        "C-054",
        "692bd795-87a0-832b-8275-cbda50945f35",
        "SIT-20251130-001",
        "R-0231",
        "R-0232",
        "ЮД-ИМП-077",
      ],
      placement: "разделы о первом уведомлении, материалах суда, матрице срока, прекращении исполнения, карте движения денег и повороте исполнения",
      verifiedAgainstSerp: true,
    },
  ],
  cannibalizationChecked: true,
  overOptimizationRisk: "low",
  wordstat: {
    used: false,
    reason: "Жизненный сценарий, целевой процессуальный комплект и самостоятельность страницы подтверждены прямым обращением, оплаченной работой и двумя поисковыми системами; частотность не меняет архитектурное решение.",
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
    path: "src/judicial-order-after-writeoff-data.mjs",
    kind: "article",
    contentId: "judicial-order-after-writeoff",
    action: "created",
    expectedUrl: articleUrl,
  },
  {
    path: "src/editorial-data.mjs",
    kind: "article-registration",
    contentId: "judicial-order-after-writeoff",
    action: "updated",
    expectedUrl: articleUrl,
  },
  {
    path: "site.config.mjs",
    kind: "content-date",
    contentId: "judicial-order-after-writeoff",
    action: "updated",
    expectedUrl: articleUrl,
  },
];
manifest.publication = {
  expectedUrls: [articleUrl],
  notes: "Публикуется самостоятельный разбор для должника, который узнал о приказе после списания. Диалог C-054 не используется как подтверждение заказа или результата. ЮД-ИМП-077 подтверждает только факт оплаченной подготовки процессуального документа.",
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
  "scripts/integrate-c054-article.mjs",
  ".github/workflows/integrate-c054-article.yml",
]) {
  await unlink(temporaryPath);
}

console.log("C-054 integrated into the editorial pipeline");
