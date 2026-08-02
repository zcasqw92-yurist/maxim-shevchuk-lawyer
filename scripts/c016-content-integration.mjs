import { readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const replaceOnce = (text, from, to, label) => {
  const index = text.indexOf(from);
  if (index < 0) throw new Error(`Не найден фрагмент для ${label}`);
  if (text.indexOf(from, index + from.length) >= 0) throw new Error(`Фрагмент для ${label} встречается более одного раза`);
  return `${text.slice(0, index)}${to}${text.slice(index + from.length)}`;
};

const articlePath = "src/unpaid-services-without-contract-data.mjs";
const articleUrl = "https://yuristshevchuk.com/razbory/zakazchik-ne-oplatil-rabotu-bez-dogovora/";

const editorialPath = "src/editorial-data.mjs";
let editorial = await readFile(editorialPath, "utf8");
editorial = replaceOnce(
  editorial,
  'import { informalEmploymentWageArticles } from "./informal-employment-wage-data.mjs";\n',
  'import { informalEmploymentWageArticles } from "./informal-employment-wage-data.mjs";\nimport { unpaidServicesWithoutContractArticles } from "./unpaid-services-without-contract-data.mjs";\n',
  "импорта C-016",
);
editorial = replaceOnce(
  editorial,
  "  ...informalEmploymentWageArticles,\n  ...debtClusterArticles,",
  "  ...informalEmploymentWageArticles,\n  ...unpaidServicesWithoutContractArticles,\n  ...debtClusterArticles,",
  "регистрации C-016",
);
await writeFile(editorialPath, editorial, "utf8");

const governancePath = "config/content-governance.json";
const governance = JSON.parse(await readFile(governancePath, "utf8"));
if (!Array.isArray(governance.governedContentPaths)) throw new Error("В конфигурации отсутствует governedContentPaths");
if (!governance.governedContentPaths.includes(articlePath)) {
  const after = governance.governedContentPaths.indexOf("src/informal-employment-wage-data.mjs");
  governance.governedContentPaths.splice(after >= 0 ? after + 1 : governance.governedContentPaths.length, 0, articlePath);
}
await writeFile(governancePath, `${JSON.stringify(governance, null, 2)}\n`, "utf8");

const siteConfigPath = "site.config.mjs";
let siteConfig = await readFile(siteConfigPath, "utf8");
siteConfig = replaceOnce(
  siteConfig,
  '    "/razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu": "2026-08-02",\n',
  '    "/razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu": "2026-08-02",\n    "/razbory/zakazchik-ne-oplatil-rabotu-bez-dogovora": "2026-08-02",\n',
  "даты C-016",
);
await writeFile(siteConfigPath, siteConfig, "utf8");

const statePath = "docs/current-production-state.md";
let state = await readFile(statePath, "utf8");
state = replaceOnce(
  state,
  "- 28 канонических содержательных URL: главная, каталог и семь страниц услуг, раздел и двенадцать юридических разборов, раздел и два полных кейса практики, страница о юристе, контакты и политика конфиденциальности;",
  "- 29 канонических содержательных URL: главная, каталог и семь страниц услуг, раздел и тринадцать юридических разборов, раздел и два полных кейса практики, страница о юристе, контакты и политика конфиденциальности;",
  "состояния production",
);
await writeFile(statePath, state, "utf8");

const manifestPath = "reports/content-sessions/latest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.sessionId = "20260802-unpaid-services-without-contract";
manifest.reviewedAt = "2026-08-02T21:32:00.000Z";
manifest.spreadsheet.modifiedTime = "2026-08-02T21:25:56.239Z";
manifest.sourceTrace = {
  dialogIds: ["6996cc94-efec-8386-8cbc-99b2be595059"],
  situationIds: ["SIT-20260219-001"],
  workIds: ["ЮД-ИМП-094", "ЮД-ИМП-136", "ЮД-ИМП-171", "ЮД-ИМП-177"],
  contentIds: ["C-016"],
  caseIds: [],
  notes: "Прямое обращение БПЮ подтверждает потребность в досудебной претензии после выполнения услуги без письменного договора. Исторические записи ЮрДоки подтверждают оплаченную подготовку претензий и правовых позиций по взысканию оплаты за монтажные, малярные, интерьерные и иные работы. Итог взыскания отдельно не подтверждён, поэтому публичный кейс и обещание результата не создаются.",
};
manifest.seoReview = {
  status: "completed",
  checkedAt: "2026-08-02T21:29:13.039Z",
  region: "Москва",
  primaryIntent: "взыскать оплату за выполненную разовую работу или оказанную услугу без единого подписанного договора",
  verifiedCluster: [
    "как взыскать оплату за выполненную работу без договора",
    "заказчик не оплатил работу без договора",
    "взыскать оплату за услуги по переписке",
    "претензия заказчику за неоплаченную работу",
  ],
  intentMap: [
    {
      intent: "взыскать оплату за выполненную разовую работу или услугу без подписанного договора",
      target: "new article owner /razbory/zakazchik-ne-oplatil-rabotu-bez-dogovora/",
    },
    {
      intent: "заказать досудебную претензию с расчётом задолженности заказчика",
      target: "existing service owner /uslugi/dosudebnoe-uregulirovanie/",
    },
    {
      intent: "не выплатили зарплату при неофициальной работе",
      target: "existing article owner /razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu/",
    },
    {
      intent: "вернуть заем без расписки",
      target: "existing article owner /razbory/vernut-dolg-bez-raspiski/",
    },
    {
      intent: "заказчик требует возврат за неоказанную услугу",
      target: "existing refund cluster owner /razbory/vernut-dengi-za-neokazannuyu-uslugu/",
    },
  ],
  intentOwnership: [
    {
      intent: "взыскать оплату за выполненную разовую работу или оказанную услугу без единого подписанного договора",
      ownerUrl: articleUrl,
      ownerType: "article",
      supportingUrls: [
        "https://yuristshevchuk.com/uslugi/dosudebnoe-uregulirovanie/",
        "https://yuristshevchuk.com/uslugi/iskovoe-zayavlenie/",
        "https://yuristshevchuk.com/uslugi/spory-biznesa/",
      ],
      supportingCaseIds: [],
      excludedQueries: [
        "не выплатили зарплату без трудового договора",
        "вернуть долг без расписки",
        "возврат денег за неоказанную услугу",
        "бесплатный образец претензии",
        "некачественная работа требования заказчика",
        "спор по подписанному договору с согласованным актом",
      ],
      existingCompetingUrlsReviewed: [
        "https://yuristshevchuk.com/razbory/rabotal-bez-dogovora-ne-vyplatili-zarplatu/",
        "https://yuristshevchuk.com/razbory/vernut-dolg-bez-raspiski/",
        "https://yuristshevchuk.com/razbory/vernut-dengi-za-neokazannuyu-uslugu/",
        "https://yuristshevchuk.com/uslugi/dosudebnoe-uregulirovanie/",
        "https://yuristshevchuk.com/uslugi/spory-biznesa/",
        "https://yuristshevchuk.com/uslugi/iskovoe-zayavlenie/",
      ],
      decision: "new-owner",
      reason: "Существующие страницы раскрывают трудовую зарплату, заем и требования заказчика о возврате денег, но не показывают исполнителю, как доказать гражданский заказ, цену, передачу и принятие результата, рассчитать задолженность и подготовить претензию.",
    },
  ],
  serpSnapshots: [
    {
      intent: "взыскать оплату за выполненную разовую работу или оказанную услугу без единого подписанного договора",
      checkedAt: "2026-08-02T21:29:13.039Z",
      region: "Москва",
      engines: [
        {
          engine: "Yandex",
          query: "как взыскать оплату за выполненную работу без договора",
          organicResultsReviewed: 20,
          sponsoredResultsObserved: 0,
          sponsoredResultLabels: [],
          sponsoredAdvertiserTypes: [],
          sponsoredOfferPatterns: [],
          dominantIntent: "практическая инструкция исполнителю по взысканию стоимости работ или услуг без единого договора",
          resultTypes: [
            "юридические статьи",
            "судебные обзоры",
            "правовые справочные подборки",
            "вопросы и ответы",
          ],
          localPack: false,
          snippetPatterns: [
            "выполненные работы без договора",
            "переписка и счета",
            "принятие результата",
            "претензия",
            "взыскание в суде",
          ],
          competitorCoverageGaps: [
            "редко связываются заказ, объём, цена, исполнение, принятие и остаток долга в одну доказательственную матрицу",
            "слабо объясняется различие между договорным требованием и стоимостью фактически полученного результата",
          ],
          staleOrWeakResults: [
            "часть результатов ограничивается перечнем документов и общей рекомендацией обратиться в суд без расчёта и досудебного маршрута",
          ],
        },
        {
          engine: "Google",
          query: "как взыскать оплату за выполненную работу без договора",
          organicResultsReviewed: 9,
          sponsoredResultsObserved: 0,
          sponsoredResultLabels: [],
          sponsoredAdvertiserTypes: [],
          sponsoredOfferPatterns: [],
          dominantIntent: "взыскание оплаты исполнителем после выполнения работ без письменного договора",
          resultTypes: [
            "правовые подборки",
            "юридические статьи",
            "ответы бизнесу",
            "материалы о трудовых спорах",
          ],
          localPack: false,
          snippetPatterns: [
            "заказчик не заплатил",
            "работы без договора",
            "доказать выполнение",
            "подать претензию и иск",
            "принятие результата",
          ],
          competitorCoverageGaps: [
            "выдача смешивает разовый гражданский заказ с трудовой зарплатой",
            "мало материалов с отдельной проверкой цены, приёмки и авансов",
          ],
          staleOrWeakResults: [
            "несколько результатов посвящены работнику без трудового договора и не отвечают исполнителю по гражданскому заказу",
          ],
        },
      ],
      pageTypeDecision: "article",
      decisionReason: "Обе системы подтверждают отдельную проблемную потребность. Коммерческая страница досудебного урегулирования не должна заменять подробную доказательственную инструкцию для исполнителя, а статья о зарплате принадлежит другому правовому маршруту.",
      canProvideBetterAnswer: true,
    },
  ],
  practicalElements: [
    {
      contentId: "unpaid-services-without-contract",
      targetUrl: articleUrl,
      type: "evidence-matrix-and-route-tree",
      title: "Матрица из шести обстоятельств и развилка правового основания",
      userValue: "Помогает исполнителю проверить заказ, объём, цену, выполнение, передачу и принятие результата, рассчитать остаток после авансов и понять, какой документ нужен дальше.",
      competitorGap: "Верхние результаты обычно перечисляют переписку, счета и акты, но редко соединяют их с расчётом и выбором между договорным требованием и взысканием стоимости фактически полученного результата.",
      sourceBasis: "прямое обращение БПЮ, подтверждённые паттерны аудитории, оплаченная подготовка претензий и актуальные нормы гражданского права",
      sourceIds: [
        "C-016",
        "6996cc94-efec-8386-8cbc-99b2be595059",
        "SIT-20260219-001",
        "R-0033",
        "R-0034",
        "P-002",
        "P-004",
        "P-008",
        "P-015",
        "ЮД-ИМП-094",
        "ЮД-ИМП-136",
        "ЮД-ИМП-171",
        "ЮД-ИМП-177",
      ],
      placement: "разделы о шести обстоятельствах, расчёте долга, досудебной претензии и выборе правового основания",
      verifiedAgainstSerp: true,
    },
  ],
  cannibalizationChecked: true,
  overOptimizationRisk: "low",
  wordstat: {
    used: false,
    reason: "Самостоятельность потребности, коммерческий документ и тип страницы подтверждены внутренними источниками и двумя органическими выдачами; частотность не изменила бы решение.",
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
    path: articlePath,
    kind: "article",
    contentId: "unpaid-services-without-contract",
    action: "created",
    expectedUrl: articleUrl,
  },
  {
    path: editorialPath,
    kind: "article-registration",
    contentId: "unpaid-services-without-contract",
    action: "updated",
    expectedUrl: articleUrl,
  },
  {
    path: siteConfigPath,
    kind: "content-date",
    contentId: "unpaid-services-without-contract",
    action: "updated",
    expectedUrl: articleUrl,
  },
];
manifest.publication = {
  expectedUrls: [articleUrl],
  notes: "Публикуется статья, ведущая к подготовке досудебной претензии и при необходимости иска. Положительный результат по историческим работам не заявляется. Завершение возможно только после полного CI, подтверждения production SHA и повторной проверки прежних статей.",
  status: "ready-for-review",
};
manifest.plannedChecks = [
  "npm run check",
  "npm run test:live",
  "node scripts/live-all-publications-smoke.mjs",
  "node scripts/live-public-copy-regression-test.mjs",
];
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

await rm(".github/workflows/c016-content-integration.yml", { force: true });
await rm("scripts/c016-content-integration.mjs", { force: true });

execFileSync("git", ["config", "user.name", "github-actions[bot]"]);
execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
execFileSync("git", ["add", "-A"]);
const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
if (!status) {
  console.log("Интеграция C-016 уже применена");
  process.exit(0);
}
execFileSync("git", ["commit", "-m", "Интегрировать разбор C-016"]);
execFileSync("git", ["push", "origin", "HEAD"]);
console.log("Интеграция C-016 выполнена и служебные файлы удалены");
