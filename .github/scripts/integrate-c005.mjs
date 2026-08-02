import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, value) => fs.writeFileSync(path, value.endsWith("\n") ? value : `${value}\n`);
const replaceOnce = (value, needle, replacement, label) => {
  if (value.includes(replacement)) return value;
  if (!value.includes(needle)) throw new Error(`Не найден фрагмент для ${label}`);
  return value.replace(needle, replacement);
};

const modulePath = "src/informal-employment-wage-data.mjs";

let editorial = read("src/editorial-data.mjs");
editorial = replaceOnce(
  editorial,
  'import { automotiveWarrantyArticles } from "./automotive-warranty-data.mjs";',
  'import { automotiveWarrantyArticles } from "./automotive-warranty-data.mjs";\nimport { informalEmploymentWageArticles } from "./informal-employment-wage-data.mjs";',
  "импорта статьи",
);
editorial = replaceOnce(
  editorial,
  "  ...automotiveWarrantyArticles,\n  ...debtClusterArticles,",
  "  ...automotiveWarrantyArticles,\n  ...informalEmploymentWageArticles,\n  ...debtClusterArticles,",
  "регистрации статьи",
);
write("src/editorial-data.mjs", editorial);

const governancePath = "config/content-governance.json";
const governance = JSON.parse(read(governancePath));
if (!governance.governedContentPaths.includes(modulePath)) {
  const index = governance.governedContentPaths.indexOf("src/automotive-warranty-data.mjs");
  governance.governedContentPaths.splice(index + 1, 0, modulePath);
}
write(governancePath, `${JSON.stringify(governance, null, 2)}\n`);

let site = read("site.config.mjs");
site = replaceOnce(
  site,
  '    "/razbory/garantiynyy-remont-avtomobilya-bolshe-45-dney": "2026-08-02",',
  '    "/razbory/garantiynyy-remont-avtomobilya-bolshe-45-dney": "2026-08-02",\n    "/razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu": "2026-08-02",',
  "даты публикации",
);
write("site.config.mjs", site);

let productionState = read("docs/current-production-state.md");
productionState = productionState
  .replace(/27 канонических содержательных URL/g, "28 канонических содержательных URL")
  .replace(/одиннадцать юридических разборов/g, "двенадцать юридических разборов")
  .replace(/11 юридических разборов/g, "12 юридических разборов");
write("docs/current-production-state.md", productionState);

const sessionPath = "reports/content-sessions/latest.json";
const session = JSON.parse(read(sessionPath));
session.schemaVersion = 3;
session.sessionId = "20260802-unofficial-work-unpaid-wages";
session.reviewedAt = "2026-08-02T17:58:00.000Z";
session.spreadsheet.modifiedTime = "2026-08-02T17:55:00.000Z";
session.spreadsheet.metadataTabCount = 25;
session.sourceTrace = {
  dialogIds: [
    "6a65c73d-d584-83eb-91ee-47e246c23051",
    "6a23c9cb-0778-83eb-a2fc-2047b6843b65",
  ],
  situationIds: ["SIT-20260726-001", "SIT-20260606-002"],
  workIds: [],
  contentIds: ["C-005"],
  caseIds: [],
  notes: "Внутренние обращения подтверждают самостоятельную проблему: длительная работа без оформления, частичные авансы, табели, журналы, переписка и спор о размере оплаты. Оплаченная работа и подтверждённый итог по этим ситуациям не установлены, поэтому кейс и утверждение о положительном результате не создаются.",
};
session.seoReview = {
  status: "completed",
  checkedAt: "2026-08-02T17:57:27.063Z",
  region: "Москва",
  primaryIntent: "взыскать невыплаченную зарплату после фактической работы без оформленного трудового договора",
  verifiedCluster: [
    "работал без трудового договора не выплатили зарплату",
    "работал неофициально не отдали зарплату",
    "как доказать трудовые отношения без договора",
    "взыскать зарплату при неофициальном трудоустройстве",
  ],
  intentMap: [
    {
      intent: "взыскать зарплату после работы без оформленного трудового договора",
      target: "new article owner /razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu/",
    },
    {
      intent: "заказать подготовку иска об установлении трудовых отношений и взыскании зарплаты",
      target: "existing service owner /uslugi/iskovoe-zayavlenie/",
    },
    {
      intent: "официально оформленному работнику задержали зарплату без спора о трудовых отношениях",
      target: "excluded from this article; future research only",
    },
    {
      intent: "не оплатили разовую работу или гражданско-правовой договор",
      target: "excluded civil-law route",
    },
  ],
  intentOwnership: [
    {
      intent: "взыскать невыплаченную зарплату после фактической работы без оформленного трудового договора",
      ownerUrl: "https://yuristshevchuk.com/razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu/",
      ownerType: "article",
      supportingUrls: [
        "https://yuristshevchuk.com/uslugi/iskovoe-zayavlenie/",
        "https://yuristshevchuk.com/uslugi/zhaloby-i-obrashcheniya/",
      ],
      supportingCaseIds: [],
      excludedQueries: [
        "задержка зарплаты официальному работнику",
        "незаконное увольнение и восстановление на работе",
        "оплата по договору подряда",
        "оплата самозанятому",
        "производственная травма без оформления",
        "образец иска о зарплате бесплатно",
      ],
      existingCompetingUrlsReviewed: [
        "https://yuristshevchuk.com/uslugi/iskovoe-zayavlenie/",
        "https://yuristshevchuk.com/uslugi/zhaloby-i-obrashcheniya/",
        "https://yuristshevchuk.com/razbory/",
        "https://yuristshevchuk.com/uslugi/vzyskanie-dolga/",
      ],
      decision: "new-owner",
      reason: "Существующие страницы не раскрывают установление трудовых отношений, доказательство конкретного работодателя и расчёт зарплаты при частичных авансах. Органическая выдача подтверждает отдельную информационную потребность.",
    },
  ],
  serpSnapshots: [
    {
      intent: "взыскать невыплаченную зарплату после фактической работы без оформленного трудового договора",
      checkedAt: "2026-08-02T17:57:27.063Z",
      region: "Москва",
      engines: [
        {
          engine: "Yandex",
          query: "работал без трудового договора не выплатили зарплату",
          organicResultsReviewed: 20,
          sponsoredResultsObserved: 0,
          sponsoredResultLabels: [],
          sponsoredAdvertiserTypes: [],
          sponsoredOfferPatterns: [],
          dominantIntent: "информационная инструкция по доказыванию неофициальной работы и взысканию зарплаты",
          resultTypes: ["юридические статьи", "официальные разъяснения", "правовые справочные материалы", "вопросы и ответы"],
          localPack: false,
          snippetPatterns: ["работал неофициально", "доказать трудовые отношения", "трудовая инспекция", "иск в суд", "взыскать зарплату"],
          competitorCoverageGaps: ["редко разделяются доказательства факта работы, работодателя, периода, ставки и итогового долга с учётом авансов"],
          staleOrWeakResults: ["часть публикаций ограничивается общим перечислением инспекции, прокуратуры и суда без расчёта и проверки работодателя"],
        },
        {
          engine: "Google",
          query: "работал без трудового договора не выплатили зарплату",
          organicResultsReviewed: 9,
          sponsoredResultsObserved: 0,
          sponsoredResultLabels: [],
          sponsoredAdvertiserTypes: [],
          sponsoredOfferPatterns: [],
          dominantIntent: "практический порядок получения зарплаты при неофициальной работе",
          resultTypes: ["юридические статьи", "официальные ответы", "правовые инструкции", "образовательные материалы"],
          localPack: false,
          snippetPatterns: ["не выплатили зарплату", "работа без договора", "куда обращаться", "признать трудовые отношения", "подать иск"],
          competitorCoverageGaps: ["мало материалов, которые показывают единую матрицу доказательств и отдельно объясняют спор о размере обещанной оплаты"],
          staleOrWeakResults: ["встречаются короткие рекомендации без границы между трудовым спором и неоплаченным гражданским заказом"],
        },
      ],
      pageTypeDecision: "article",
      decisionReason: "Обе системы показывают самостоятельный проблемный запрос. Коммерческая страница иска не может полноценно раскрыть признаки трудовых отношений, доказательства ставки и расчёт долга.",
      canProvideBetterAnswer: true,
    },
  ],
  practicalElements: [
    {
      contentId: "unofficial-work-unpaid-wages",
      targetUrl: "https://yuristshevchuk.com/razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu/",
      type: "evidence-matrix",
      title: "Матрица доказательств и расчёта по пяти вопросам",
      userValue: "Помогает проверить не только факт работы, но и работодателя, период, согласованную ставку и остаток долга с учётом авансов.",
      competitorGap: "Большинство верхних результатов перечисляет способы обращения, но не связывает пять самостоятельных предметов доказывания в одну проверяемую схему.",
      sourceBasis: "реальные обращения БПЮ, дословные реплики, контентная карточка и актуальные нормы трудового права",
      sourceIds: [
        "C-005",
        "6a65c73d-d584-83eb-91ee-47e246c23051",
        "6a23c9cb-0778-83eb-a2fc-2047b6843b65",
        "R-0008",
        "R-0197",
        "R-0198",
        "SIT-20260726-001",
        "SIT-20260606-002",
      ],
      placement: "раздел «Сначала разделите доказательства на пять частей» и связанный расчёт задолженности",
      verifiedAgainstSerp: true,
    },
  ],
  cannibalizationChecked: true,
  overOptimizationRisk: "low",
  wordstat: {
    used: false,
    reason: "Самостоятельность интента и тип страницы подтверждены внутренними обращениями и двумя органическими выдачами; частотность не изменила бы архитектурное решение.",
  },
};
session.editorialChecks = {
  factsSeparatedFromHypotheses: true,
  paidWorkSeparatedFromPaymentDetails: true,
  workProcedureAndCaseResultsSeparated: true,
  legalSourcesVerified: true,
  anonymizationVerified: true,
  criticalSourceErrorsResolved: true,
};
session.contentChanges = [
  {
    path: modulePath,
    kind: "article",
    contentId: "unofficial-work-unpaid-wages",
    action: "created",
    expectedUrl: "https://yuristshevchuk.com/razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu/",
  },
  {
    path: "src/editorial-data.mjs",
    kind: "article-registration",
    contentId: "unofficial-work-unpaid-wages",
    action: "updated",
    expectedUrl: "https://yuristshevchuk.com/razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu/",
  },
  {
    path: "site.config.mjs",
    kind: "content-date",
    contentId: "unofficial-work-unpaid-wages",
    action: "updated",
    expectedUrl: "https://yuristshevchuk.com/razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu/",
  },
];
session.plannedChecks = [
  "npm run check",
  "npm run test:live",
  "node scripts/live-all-publications-smoke.mjs",
  "node scripts/live-public-copy-regression-test.mjs",
];
session.publication = {
  expectedUrls: ["https://yuristshevchuk.com/razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu/"],
  notes: "Публикуется статья без кейса и без заявления положительного результата. Завершение возможно только после полного CI, подтверждения production SHA и проверки всех прежних статей.",
  status: "ready-for-review",
};
write(sessionPath, `${JSON.stringify(session, null, 2)}\n`);

fs.rmSync(".github/scripts/integrate-c005.mjs", { force: true });
fs.rmSync(".github/workflows/integrate-c005.yml", { force: true });

console.log("C-005 integrated");
