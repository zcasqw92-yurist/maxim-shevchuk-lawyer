import fs from 'node:fs';

const editorialPath = 'src/editorial-data.mjs';
let editorial = fs.readFileSync(editorialPath, 'utf8');
const importLine = 'import { automotiveWarrantyArticles } from "./automotive-warranty-data.mjs";';
if (!editorial.includes(importLine)) {
  const marker = 'import { policeInactivityClusterArticles } from "./police-inactivity-cluster-data.mjs";';
  if (!editorial.includes(marker)) throw new Error('Editorial import marker not found');
  editorial = editorial.replace(marker, `${marker}\n${importLine}`);
}
if (!editorial.includes('...automotiveWarrantyArticles,')) {
  const marker = '  ...policeInactivityClusterArticles,';
  if (!editorial.includes(marker)) throw new Error('Editorial articles marker not found');
  editorial = editorial.replace(marker, `${marker}\n  ...automotiveWarrantyArticles,`);
}
fs.writeFileSync(editorialPath, editorial);

const governancePath = 'config/content-governance.json';
const governance = JSON.parse(fs.readFileSync(governancePath, 'utf8'));
const governedPath = 'src/automotive-warranty-data.mjs';
if (!governance.governedContentPaths.includes(governedPath)) {
  const index = governance.governedContentPaths.indexOf('src/police-inactivity-cluster-data.mjs');
  governance.governedContentPaths.splice(index >= 0 ? index + 1 : governance.governedContentPaths.length, 0, governedPath);
}
fs.writeFileSync(governancePath, `${JSON.stringify(governance, null, 2)}\n`);

const manifestPath = 'reports/content-sessions/latest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const intent = 'выбрать и предъявить дилеру требование после нарушения срока гарантийного ремонта автомобиля';
const targetUrl = 'https://yuristshevchuk.com/razbory/garantiynyy-remont-avtomobilya-bolshe-45-dney/';
manifest.schemaVersion = 3;
manifest.sessionId = '20260801-warranty-repair-over-45-days';
manifest.reviewedAt = '2026-08-01T21:35:00.000Z';
manifest.spreadsheet.modifiedTime = '2026-08-01T21:01:26.189Z';
manifest.spreadsheet.metadataTabCount = manifest.spreadsheet.discoveredTabs.length;
manifest.sourceTrace = {
  dialogIds: ['69d936fe-9314-832b-93e3-39b1273a3c32'],
  situationIds: ['SIT-20260410-001'],
  workIds: [],
  contentIds: ['C-021'],
  caseIds: [],
  notes: 'БПЮ, карточка C-021 и реплики R-0085/R-0086 подтверждают самостоятельную потребность и язык клиента. Оплаченная работа и подтверждённый результат по этой ситуации в Юр. доки и кейсах не обнаружены, поэтому статья не содержит утверждений о выполненной работе или результате дела.'
};
manifest.seoReview = {
  status: 'completed',
  checkedAt: '2026-08-01T21:30:00.000Z',
  region: 'Москва',
  primaryIntent: intent,
  verifiedCluster: [
    'гарантийный ремонт автомобиля более 45 дней что делать',
    'дилер не возвращает автомобиль после гарантийного ремонта',
    'претензия дилеру за нарушение срока ремонта',
    'вернуть деньги за автомобиль после 45 дней ремонта'
  ],
  intentMap: [
    { intent: 'широкая помощь с возвратом денег и претензией', target: 'existing service owner /uslugi/vozvrat-deneg/' },
    { intent, target: 'new article owner /razbory/garantiynyy-remont-avtomobilya-bolshe-45-dney/' },
    { intent: 'недостаток автомобиля в первые пятнадцать дней', target: 'excluded from this article; future separate research only' },
    { intent: 'ремонт автомобиля по ОСАГО или каско', target: 'excluded insurance route' }
  ],
  intentOwnership: [
    {
      intent,
      ownerUrl: targetUrl,
      ownerType: 'article',
      supportingUrls: [
        'https://yuristshevchuk.com/uslugi/vozvrat-deneg/',
        'https://yuristshevchuk.com/razbory/vernut-dengi-za-neokazannuyu-uslugu/'
      ],
      supportingCaseIds: [],
      excludedQueries: [
        'вернуть автомобиль в первые 15 дней',
        'существенный недостаток автомобиля без нарушения срока ремонта',
        'автомобиль в ремонте более 30 дней за год',
        'отказ дилера принять автомобиль по гарантии',
        'некачественный платный ремонт автомобиля',
        'ремонт автомобиля по ОСАГО или каско',
        'добровольный отказ от услуги автосервиса'
      ],
      existingCompetingUrlsReviewed: [
        'https://yuristshevchuk.com/uslugi/vozvrat-deneg/',
        'https://yuristshevchuk.com/razbory/vernut-dengi-za-neokazannuyu-uslugu/',
        'https://yuristshevchuk.com/razbory/otkaz-ot-dogovora-okazaniya-uslug/',
        'https://yuristshevchuk.com/razbory/vernut-dengi-za-navyazannuyu-uslugu/',
        'https://yuristshevchuk.com/razbory/prodavets-propal-posle-perevoda/'
      ],
      decision: 'new-owner',
      reason: 'Сценарий относится к нарушению срока устранения недостатка технически сложного товара и завершается самостоятельной досудебной претензией продавцу или уполномоченной организации. Существующие статьи посвящены услугам, добровольному отказу, навязанным договорам и исчезновению получателя денег.'
    }
  ],
  serpSnapshots: [
    {
      intent,
      checkedAt: '2026-08-01T21:00:00.000Z',
      region: 'Москва',
      engines: [
        {
          engine: 'Yandex',
          query: 'гарантийный ремонт автомобиля более 45 дней что делать',
          organicResultsReviewed: 20,
          sponsoredResultsObserved: 0,
          sponsoredResultLabels: [],
          sponsoredAdvertiserTypes: [],
          sponsoredOfferPatterns: [],
          dominantIntent: 'информационный порядок действий после нарушения срока гарантийного ремонта автомобиля',
          resultTypes: ['правовые справочные материалы', 'юридические статьи', 'официальные разъяснения', 'вопросы и ответы'],
          localPack: false,
          snippetPatterns: ['срок ремонта 45 дней', 'возврат денег или замена', 'неустойка', 'ожидание запчастей', 'претензия дилеру'],
          competitorCoverageGaps: ['часто смешиваются первые 15 дней, нарушение срока ремонта и совокупные 30 дней невозможности использования; редко дана схема выбора одного требования и проверки надлежащего адресата'],
          staleOrWeakResults: ['часть материалов не учитывает действующее с 2026 года ограничение неустойки по статье 23']
        },
        {
          engine: 'Google',
          query: 'гарантийный ремонт автомобиля более 45 дней что делать',
          organicResultsReviewed: 12,
          sponsoredResultsObserved: 0,
          sponsoredResultLabels: [],
          sponsoredAdvertiserTypes: [],
          sponsoredOfferPatterns: [],
          dominantIntent: 'практическая инструкция по требованиям к дилеру после затянувшегося гарантийного ремонта',
          resultTypes: ['юридические статьи', 'правовые справочные системы', 'вопросы и ответы', 'обсуждения владельцев автомобилей'],
          localPack: false,
          snippetPatterns: ['45 дней гарантийного ремонта', 'расторжение договора', 'замена автомобиля', 'неустойка', 'что делать владельцу'],
          competitorCoverageGaps: ['многие результаты называют доступные требования, но не связывают акт приёма, письменный срок, соглашение о продлении, адресата претензии и отдельные сроки исполнения'],
          staleOrWeakResults: ['в выдаче присутствуют старые обсуждения и короткие ответы без проверки действующей редакции закона']
        }
      ],
      pageTypeDecision: 'article',
      decisionReason: 'Обе органические выдачи показывают самостоятельную проблемную потребность владельца автомобиля, уже передавшего машину на гарантийный ремонт. Коммерческая страница услуги не может полноценно раскрыть расчёт срока и выбор требования.',
      canProvideBetterAnswer: true
    }
  ],
  practicalElements: [
    {
      contentId: 'warranty-repair-over-45-days',
      targetUrl,
      type: 'legal-route-table',
      title: 'Матрица выбора требования после нарушения срока гарантийного ремонта',
      userValue: 'Помогает выбрать один основной результат: завершение ремонта, возврат цены или замена автомобиля, а не смешивать несовместимые требования.',
      competitorGap: 'В верхней выдаче требования обычно перечисляются без связи с целью владельца, надлежащим адресатом, документами и сроком исполнения.',
      sourceBasis: 'Карточка C-021, диалог БПЮ, реплики клиента и подтверждённые паттерны о длительном ожидании и необходимости измеримого результата.',
      sourceIds: ['C-021', '69d936fe-9314-832b-93e3-39b1273a3c32', 'R-0085', 'R-0086', 'P-004', 'P-007', 'S-013'],
      placement: 'Раздел «Какое требование выбрать после нарушения срока» внутри статьи.',
      verifiedAgainstSerp: true
    }
  ],
  cannibalizationChecked: true,
  wordstat: {
    used: false,
    reason: 'Самостоятельность интента и тип страницы подтверждены внутренним обращением и двумя органическими выдачами; частотность не изменила бы архитектурное решение.'
  }
};
manifest.editorialChecks = {
  factsSeparatedFromHypotheses: true,
  paidWorkSeparatedFromPaymentDetails: true,
  workProcedureAndCaseResultsSeparated: true,
  legalSourcesVerified: true,
  anonymizationVerified: true,
  criticalSourceErrorsResolved: true
};
manifest.contentChanges = [
  {
    path: 'src/automotive-warranty-data.mjs',
    kind: 'article',
    contentId: 'warranty-repair-over-45-days',
    action: 'created',
    expectedUrl: targetUrl
  },
  {
    path: 'src/editorial-data.mjs',
    kind: 'article-registration',
    contentId: 'warranty-repair-over-45-days',
    action: 'updated',
    expectedUrl: targetUrl
  }
];
manifest.publication = {
  ...(manifest.publication || {}),
  expectedUrls: [targetUrl],
  status: 'ready-for-review',
  notes: 'Публикация допускается только после полного CI, live-проверки нового URL и регрессии публичного текста всех ранее опубликованных статей.'
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
