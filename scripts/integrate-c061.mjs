import { readFile, writeFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, value) => writeFile(path, value, "utf8");
const replaceOnce = (text, before, after, path) => {
  if (!text.includes(before)) throw new Error(`${path}: marker not found: ${before}`);
  return text.replace(before, after);
};

const articlePath = "/razbory/tovar-ne-postavlen-posle-oplaty-scheta";
const articleUrl = `https://yuristshevchuk.com${articlePath}/`;

// Register article source.
{
  const path = "src/editorial-data.mjs";
  let text = await read(path);
  text = replaceOnce(
    text,
    'import { judicialOrderAfterWriteoffArticles } from "./judicial-order-after-writeoff-data.mjs";\n',
    'import { judicialOrderAfterWriteoffArticles } from "./judicial-order-after-writeoff-data.mjs";\nimport { unshippedGoodsAfterInvoiceArticles } from "./unshipped-goods-after-invoice-data.mjs";\n',
    path,
  );
  text = replaceOnce(
    text,
    "  ...judicialOrderAfterWriteoffArticles,\n  ...debtClusterArticles,",
    "  ...judicialOrderAfterWriteoffArticles,\n  ...unshippedGoodsAfterInvoiceArticles,\n  ...debtClusterArticles,",
    path,
  );
  await write(path, text);
}

// Register content date.
{
  const path = "site.config.mjs";
  let text = await read(path);
  text = replaceOnce(
    text,
    '    "/razbory/spisali-dengi-po-sudebnomu-prikazu": "2026-08-03",\n',
    '    "/razbory/spisali-dengi-po-sudebnomu-prikazu": "2026-08-03",\n    "/razbory/tovar-ne-postavlen-posle-oplaty-scheta": "2026-08-03",\n',
    path,
  );
  await write(path, text);
}

// Add governed source path.
{
  const path = "config/content-governance.json";
  const data = JSON.parse(await read(path));
  const sourcePath = "src/unshipped-goods-after-invoice-data.mjs";
  if (!data.governedContentPaths.includes(sourcePath)) {
    const anchor = data.governedContentPaths.indexOf("src/judicial-order-after-writeoff-data.mjs");
    data.governedContentPaths.splice(anchor >= 0 ? anchor + 1 : data.governedContentPaths.length, 0, sourcePath);
  }
  await write(path, `${JSON.stringify(data, null, 2)}\n`);
}

// Update current production documentation.
{
  const path = "docs/current-production-state.md";
  let text = await read(path);
  text = replaceOnce(
    text,
    "31 канонических содержательных URL: главная, каталог и семь страниц услуг, раздел и пятнадцать юридических разборов, раздел и два полных кейса практики, страница о юристе, контакты и политика конфиденциальности;",
    "32 канонических содержательных URL: главная, каталог и семь страниц услуг, раздел и шестнадцать юридических разборов, раздел и два полных кейса практики, страница о юристе, контакты и политика конфиденциальности;",
    path,
  );
  await write(path, text);
}

// Replace the current content session while preserving the full reviewed-tab inventory.
{
  const path = "reports/content-sessions/latest.json";
  const session = JSON.parse(await read(path));
  const reviewedAt = new Date().toISOString();
  session.sessionId = "20260803-unshipped-goods-after-invoice";
  session.reviewedAt = reviewedAt;
  session.spreadsheet.modifiedTime = "2026-08-03T14:56:16.296Z";
  const versionsTab = session.reviewedTabs.find((tab) => tab.name === "_Версии_контента");
  if (versionsTab) versionsTab.range = "A1:L27";
  session.sourceTrace = {
    dialogIds: [
      "69df4307-d254-8325-8a2b-6ff8740adefb",
      "69df898e-8cec-8332-b589-22ba5b78b608"
    ],
    situationIds: [
      "SIT-20260415-001",
      "SIT-YD-20260415-179"
    ],
    workIds: ["ЮД-ИМП-179"],
    contentIds: ["C-061"],
    caseIds: [],
    notes: "Прямое обращение подтверждает оплату счёта предпринимателем, отсутствие отдельного подписанного договора, просрочку изготовления и потребность вернуть деньги. ЮД-ИМП-179 подтверждает оплаченную подготовку досудебной претензии по неизготовленным коробкам между ИП. Заказ по первичному диалогу, направление претензии, ответ, иск и окончательный результат отдельно не подтверждены и публично не заявляются."
  };
  session.seoReview = {
    status: "completed",
    checkedAt: "2026-08-03T15:12:43.327Z",
    region: "Москва",
    primaryIntent: "покупатель-ИП оплатил счёт, товар в согласованный срок не поставлен, отдельный договор не подписан; нужно доказать сделку, выбрать возврат и подготовить претензию",
    verifiedCluster: [
      "оплатили счет товар не поставили между ИП что делать",
      "как вернуть оплату по счету если товар не поставили",
      "товар не поставлен договор не подписан между ИП",
      "претензия поставщику о возврате предоплаты"
    ],
    intentMap: [
      {
        intent: "покупатель-предприниматель оплатил счёт, срок прошёл, товар не передан и требуется возврат предоплаты",
        target: "new article owner /razbory/tovar-ne-postavlen-posle-oplaty-scheta/"
      },
      {
        intent: "исполнитель выполнил работу без договора, а заказчик не заплатил",
        target: "existing article owner /razbory/zakazchik-ne-oplatil-rabotu-bez-dogovora/"
      },
      {
        intent: "заказать индивидуальную претензию контрагенту",
        target: "existing service owner /uslugi/dosudebnoe-uregulirovanie/"
      },
      {
        intent: "подготовить иск по экономическому спору",
        target: "supporting service owner /uslugi/spory-biznesa/"
      }
    ],
    intentOwnership: [
      {
        intent: "доказать сделку по оплаченному счёту без отдельного договора, выбрать возврат оплаты за непоставленный товар и пройти претензионный порядок между предпринимателями",
        ownerUrl: articleUrl,
        ownerType: "article",
        supportingUrls: [
          "https://yuristshevchuk.com/uslugi/dosudebnoe-uregulirovanie/",
          "https://yuristshevchuk.com/uslugi/spory-biznesa/",
          "https://yuristshevchuk.com/uslugi/iskovoe-zayavlenie/"
        ],
        supportingCaseIds: [],
        excludedQueries: [
          "потребитель купил товар для личных нужд",
          "товар поставлен с недостатками",
          "товар поставлен, но покупатель не оплатил",
          "покупатель передумал до истечения срока поставки",
          "ошибочный перевод без заказа товара",
          "мошенничество поставщика при наличии самостоятельных признаков первоначального умысла",
          "бесплатный образец претензии без анализа счёта и срока"
        ],
        existingCompetingUrlsReviewed: [
          "https://yuristshevchuk.com/razbory/zakazchik-ne-oplatil-rabotu-bez-dogovora/",
          "https://yuristshevchuk.com/razbory/vernut-dengi-za-neokazannuyu-uslugu/",
          "https://yuristshevchuk.com/uslugi/dosudebnoe-uregulirovanie/",
          "https://yuristshevchuk.com/uslugi/spory-biznesa/",
          "https://yuristshevchuk.com/uslugi/vozvrat-deneg/"
        ],
        decision: "new-owner",
        reason: "Существующие страницы раскрывают неоплату уже выполненной работы и потребительский возврат за услуги. Они не объясняют обратный B2B-сценарий: покупатель оплатил счёт, отдельный договор не подписан, товар не передан, а основание требования зависит от доказанности сделки."
      }
    ],
    serpSnapshots: [
      {
        intent: "вернуть предпринимателю оплату за товар, не поставленный после оплаты счёта без отдельного договора",
        checkedAt: "2026-08-03T15:12:43.327Z",
        region: "Москва",
        engines: [
          {
            engine: "Yandex",
            query: "оплатили счет товар не поставили между ИП что делать",
            organicResultsReviewed: 20,
            sponsoredResultsObserved: 0,
            sponsoredResultLabels: [],
            sponsoredAdvertiserTypes: [],
            sponsoredOfferPatterns: [],
            dominantIntent: "возврат предоплаты и претензия поставщику после непоставки товара между предпринимателями",
            resultTypes: [
              "юридические инструкции для бизнеса",
              "ответы предпринимателям",
              "судебные обзоры",
              "материалы о претензиях и арбитраже"
            ],
            localPack: false,
            snippetPatterns: [
              "ИП оплатил счёт, а товар не поставлен",
              "договор отдельно не заключался",
              "возврат предоплаты",
              "претензия поставщику",
              "обращение в арбитражный суд"
            ],
            competitorCoverageGaps: [
              "редко разделяется договорное требование по статье 487 ГК РФ и возврат неосновательного обогащения",
              "почти не показывается единая доказательственная цепочка от заказа и оплаты до выбранного требования"
            ],
            staleOrWeakResults: [
              "часть результатов смешивает спор между предпринимателями с защитой прав потребителей",
              "часть материалов не проверяет готовность товара, самовывоз и частичную поставку"
            ]
          },
          {
            engine: "Google",
            query: "оплатили счет товар не поставили между ИП что делать",
            organicResultsReviewed: 10,
            sponsoredResultsObserved: 0,
            sponsoredResultLabels: [],
            sponsoredAdvertiserTypes: [],
            sponsoredOfferPatterns: [],
            dominantIntent: "возврат оплаты по счёту, претензия и судебное взыскание при непоставке",
            resultTypes: [
              "юридические статьи",
              "разборы оплаченного счёта без договора",
              "официальные правовые консультации",
              "ответы предпринимателям"
            ],
            localPack: false,
            snippetPatterns: [
              "поставщик не поставил товар и не вернул предоплату",
              "покупатель оплатил товар по счёту без договора",
              "товар оплачен, но не поставлен",
              "составление претензии",
              "взыскание денежных средств"
            ],
            competitorCoverageGaps: [
              "не объясняется, когда оплаченный счёт подтверждает сделку, а когда требуется внедоговорное основание",
              "мало материалов с проверкой уведомления о готовности, места передачи и полномочий получателя"
            ],
            staleOrWeakResults: [
              "один из результатов раскрывает противоположный сценарий неоплаты поставленного товара",
              "часть материалов относится к иному государству или ограничивается универсальным образцом"
            ],
            sourceNote: "Резервный снимок выполнен через Google Programmable Search Engine, настроенный на поиск по всему вебу. Он использует поисковую технологию Google, но может возвращать подмножество индекса и иной порядок по сравнению с Google.com; обычный Google.com был закрыт robot challenge, а Serper вернул ошибку авторизации."
          }
        ],
        pageTypeDecision: "article",
        decisionReason: "Обе выдачи подтверждают самостоятельный жизненный сценарий, отличный от общей услуги и от статьи для исполнителя, которому не оплатили уже выполненную работу.",
        canProvideBetterAnswer: true
      }
    ],
    practicalElements: [
      {
        contentId: "unshipped-goods-after-invoice",
        targetUrl: articleUrl,
        type: "evidence-matrix",
        title: "Матрица сделки, срока и непоставки с правовой развилкой",
        userValue: "Помогает связать заказ, счёт, оплату, срок и отсутствие передачи, выбрать одно требование и определить, строится ли возврат на договоре или неосновательном обогащении.",
        competitorGap: "Верхние результаты перечисляют нормы и дают образцы, но редко соединяют шесть доказательственных звеньев, проверку готовности товара и развилку правового основания.",
        sourceBasis: "прямое обращение покупателя-ИП, оплаченная подготовка претензии, свежие снимки Яндекса и Google Programmable Search, действующие нормы ГК РФ и АПК РФ",
        sourceIds: [
          "C-061",
          "69df4307-d254-8325-8a2b-6ff8740adefb",
          "69df898e-8cec-8332-b589-22ba5b78b608",
          "SIT-20260415-001",
          "SIT-YD-20260415-179",
          "R-0245",
          "R-0246",
          "ЮД-ИМП-179"
        ],
        placement: "разделы о заключении сделки по счёту, доказательственной матрице, сроке, выборе требования, возражениях поставщика, правовом основании и расчёте претензии",
        verifiedAgainstSerp: true
      }
    ],
    cannibalizationChecked: true,
    overOptimizationRisk: "low",
    wordstat: {
      used: false,
      reason: "Жизненный сценарий, целевой документ и самостоятельность страницы подтверждены прямым обращением, оплаченной работой и двумя поисковыми снимками; частотность не меняет архитектурное решение."
    }
  };
  session.editorialChecks = {
    factsSeparatedFromHypotheses: true,
    paidWorkSeparatedFromPaymentDetails: true,
    workProcedureAndCaseResultsSeparated: true,
    legalSourcesVerified: true,
    anonymizationVerified: true,
    criticalSourceErrorsResolved: true
  };
  session.contentChanges = [
    {
      path: "src/unshipped-goods-after-invoice-data.mjs",
      kind: "article",
      contentId: "unshipped-goods-after-invoice",
      action: "created",
      expectedUrl: articleUrl
    },
    {
      path: "src/editorial-data.mjs",
      kind: "article-registration",
      contentId: "unshipped-goods-after-invoice",
      action: "updated",
      expectedUrl: articleUrl
    },
    {
      path: "site.config.mjs",
      kind: "content-date",
      contentId: "unshipped-goods-after-invoice",
      action: "updated",
      expectedUrl: articleUrl
    }
  ];
  session.publication = {
    expectedUrls: [articleUrl],
    notes: "Публикуется самостоятельный разбор для покупателя-предпринимателя, оплатившего счёт за непоставленный товар. Первичный диалог не используется как подтверждение заказа или результата. ЮД-ИМП-179 подтверждает только факт оплаченной подготовки претензии; направление документа, ответ и итог спора не подтверждены.",
    status: "ready-for-review"
  };
  session.plannedChecks = [
    "npm run check",
    "npm run test:live",
    "node scripts/live-all-publications-smoke.mjs",
    "node scripts/live-public-copy-regression-test.mjs"
  ];
  await write(path, `${JSON.stringify(session, null, 2)}\n`);
}

console.log("C-061 integrated into governed content files");
