from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE_URL = "https://yuristshevchuk.com/uslugi/vozvrat-deneg/"
SHEET_ID = "1W4014FzdUJWYDja7VUh5XXUsSuxtQIrcS5fWRX1rm24"
SHEET_MODIFIED = "2026-08-01T09:54:13.798Z"
REVIEWED_AT = "2026-08-01T10:00:00.000Z"

TABS = [
    "00_Старт", "01_БПЮ", "02_ЮрДоки", "03_Оплаты", "04_Дашборд",
    "05_Контроль", "06_Импорт", "_Справочники", "_Журнал",
    "07_Диалоги_исследование", "08_Банк_реплик", "09_Паттерны_аудитории",
    "10_Контентные_возможности", "11_Кейсы_для_публикации",
    "12_Эффективные_ответы", "13_Статистика_контента", "14_Контент_дашборд",
    "15_Обращения_с_контента", "_Реестр_диалогов", "_Ситуации_и_связи",
    "_События_воронки", "_Версии_контента", "16_Контроль_данных",
    "_Импорт_ЮД_151_200", "Статьи_HARANT",
]

TAB_RANGES = {
    "00_Старт": ("A1:H45", ["project rules", "publication rules"]),
    "01_БПЮ": ("A1:AC1004", ["demand", "client language"]),
    "02_ЮрДоки": ("A1:AA1004", ["paid work", "practice evidence"]),
    "03_Оплаты": ("A1:M13", ["confirmed payment details"]),
    "04_Дашборд": ("A1:Y87", ["operational context"]),
    "05_Контроль": ("A1:K18", ["data gaps", "control indicators"]),
    "06_Импорт": ("A1:U100", ["source coverage"]),
    "_Справочники": ("A1:I24", ["classification"]),
    "_Журнал": ("A1:K35", ["current demand evidence"]),
    "07_Диалоги_исследование": ("A1:AK357", ["audience research"]),
    "08_Банк_реплик": ("A1:V711", ["client language", "questions"]),
    "09_Паттерны_аудитории": ("A1:X81", ["audience patterns"]),
    "10_Контентные_возможности": ("A1:AP170", ["content brief", "intent ownership"]),
    "11_Кейсы_для_публикации": ("A1:AF105", ["case evidence", "publication limits"]),
    "12_Эффективные_ответы": ("A1:V147", ["communication patterns"]),
    "13_Статистика_контента": ("A1:AB12", ["performance data"]),
    "14_Контент_дашборд": ("A1:N179", ["content priorities"]),
    "15_Обращения_с_контента": ("A1:AG4", ["content attribution"]),
    "_Реестр_диалогов": ("A1:Q357", ["source registry"]),
    "_Ситуации_и_связи": ("A1:T359", ["cross-source links", "result levels"]),
    "_События_воронки": ("A1:J738", ["confirmed funnel events"]),
    "_Версии_контента": ("A1:L18", ["content versions"]),
    "16_Контроль_данных": ("A1:J17", ["critical data errors"]),
    "_Импорт_ЮД_151_200": ("A1:T51", ["historical paid-work verification"]),
    "Статьи_HARANT": ("A1:P2", ["external publication overlap check"]),
}


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one replacement, got {count}")
    file_path.write_text(updated, encoding="utf-8")


service_block = '''  "vozvrat-deneg": {
    eyebrow: "Возврат оплаты за услуги",
    title: "Возврат денег за услугу, аванс или навязанный договор",
    lead: "Сначала определю причину возврата: исполнитель нарушил срок или объём, услуга больше не нужна, дополнительный договор оформлен без свободного согласия либо получатель денег перестал отвечать. От этого зависят адресат, срок, расчёт и содержание требования.",
    topic: "возврат денег за услугу, аванс или дополнительный договор",
    button: "Определить основание возврата",
    message: "Здравствуйте, Максим Юрьевич. Нужна помощь с возвратом денег. Укажу, кому и за что платил(а), сумму и дату оплаты, что было обещано и исполнено, почему требую возврат и что ответила вторая сторона:",
    cardTitle: "Что прислать для определения основания",
    cardText: "Нужны документы, по которым можно отделить нарушение исполнителя, добровольный отказ, навязанную услугу и спор о получателе денег.",
    cardItems: ["Договор, заказ, сертификат или оферта", "Чек, перевод и получатель платежа", "Переписка, сроки и фактически выполненный объём", "Претензия, отказ или сведения об отсутствии ответа"],
    situationsTitle: "По какой причине вы требуете вернуть деньги",
    resultTitle: "Основание возврата, расчёт и подходящий документ",
    resultNote: "Одинаковая сумма оплаты может возвращаться по разным правилам. Перед подготовкой документа проверяются договор, статус сторон, выполненный объём, специальные сроки и надлежащий адресат.",
    processTitle: "Как определяется правильный путь возврата",
    process: [
      ["Ситуация", "Отделяю нарушение исполнителя от добровольного отказа, навязанной услуги и возможного обмана."],
      ["Доказательства", "Сопоставляю договор, оплату, согласие, сроки, переписку и фактически переданный результат."],
      ["Расчёт", "Определяю основную сумму и дополнительные требования, которые применимы именно к этой ситуации."],
      ["Требование", "Готовлю отказ, претензию или иск и объясняю адресата, срок контроля и следующий шаг."],
    ],
    supportTitle: "После требования помогу оценить возврат, отказ или молчание",
    supportLead: "Можно прислать частичный платёж, расчёт исполнителя, отказ банка или сервисной компании и новое предложение. Объясню, закрывает ли это требования и требуется ли следующий документ.",
    ctaTitle: "Проверим, почему деньги должны быть возвращены",
    ctaText: "Сообщите сумму, дату оплаты, предмет договора, что было выполнено и почему требуете возврат. Приложите договор, чек, переписку и полученный ответ.",
  },'''

replace_regex(
    "src/service-content.mjs",
    r'  "vozvrat-deneg": \{.*?\n  \},\n  "zhaloby-i-obrashcheniya": \{',
    service_block + '\n  "zhaloby-i-obrashcheniya": {',
)

search_block = '''  "vozvrat-deneg": {
    title: "Выберите ситуацию: основания возврата денег различаются",
    lead: "Возврат оплаты за услугу нельзя свести к одному универсальному требованию. Сначала нужно понять, нарушил ли исполнитель договор, заказчик сам решил отказаться, дополнительную услугу подключили без свободного согласия либо получатель денег перестал отвечать.",
    paragraphs: [
      "Если услуга не начата, срок сорван или выполнена только часть, проверяются обещанный объём, принятый результат и последствия нарушения. Если исполнитель ничего не нарушил, действует добровольный отказ с отдельной оценкой подтверждённых расходов. Для дополнительной услуги при кредите или покупке автомобиля проверяются письменное согласие, фактическое оказание, получатель платежа и специальный порядок обращения.",
      "Возврат предоплаты не требует отдельной страницы: значение имеют основание платежа, условия отмены и фактически выполненный объём. После претензии нужно считать срок по применимой норме, подтвердить вручение и проверить, не подменяет ли ответ реальный возврат внутренним расчётом или обещанием без даты.",
    ],
    checklist: ["кто указан исполнителем и кто получил деньги", "что было обещано, в каком объёме и к какому сроку", "было ли отдельное согласие на дополнительную услугу", "что фактически выполнено и принято", "когда и кому направлено требование о возврате"],
    links: [
      ["Услуга не оказана или оказана частично", "/razbory/vernut-dengi-za-neokazannuyu-uslugu/"],
      ["Добровольный отказ от договора услуг", "/razbory/otkaz-ot-dogovora-okazaniya-uslug/"],
      ["Навязанная дополнительная услуга", "/razbory/vernut-dengi-za-navyazannuyu-uslugu/"],
      ["Получатель денег перестал отвечать", "/razbory/prodavets-propal-posle-perevoda/"]
    ],
    sources: [
      ["Статья 16 Закона о защите прав потребителей", "КонсультантПлюс", "https://www.consultant.ru/document/cons_doc_LAW_305/9eb0f127ead4dc57e7d0a9d4954cf264c4b3cea8/"],
      ["Статья 28 Закона о защите прав потребителей", "КонсультантПлюс", "https://www.consultant.ru/document/cons_doc_LAW_305/f190d8f6c0d4f03af399cc0efcc722d87a0f83a6/"],
      ["Статья 31 Закона о защите прав потребителей", "КонсультантПлюс", "https://www.consultant.ru/document/cons_doc_LAW_305/30aa7e1b7d9fe18928b8e9bce991ec6ba0d284e2/"],
      ["Статья 32 Закона о защите прав потребителей", "КонсультантПлюс", "https://www.consultant.ru/document/cons_doc_LAW_305/758e2cfdf136a621c8f66dcb3372b772c7b5e6e8/"],
      ["Банк России — дополнительные услуги при потребительском кредите", "Банк России", "https://www.cbr.ru/faq/bank_s/kredity/"]
    ],
  },'''

replace_regex(
    "src/search-visibility.mjs",
    r'  "vozvrat-deneg": \{.*?\n  \},\n  "zhaloby-i-obrashcheniya": \{',
    search_block + '\n  "zhaloby-i-obrashcheniya": {',
)

site_path = ROOT / "site.config.mjs"
site_text = site_path.read_text(encoding="utf-8")
old_date = '    "/uslugi/vozvrat-deneg": "2026-07-29",'
new_date = '    "/uslugi/vozvrat-deneg": "2026-08-01",'
if old_date not in site_text:
    raise RuntimeError("site.config.mjs: old refund service date not found")
site_path.write_text(site_text.replace(old_date, new_date, 1), encoding="utf-8")

config_path = ROOT / "config/content-governance.json"
config = json.loads(config_path.read_text(encoding="utf-8"))
config["spreadsheet"]["baselineSnapshot"]["modifiedTime"] = SHEET_MODIFIED
config["spreadsheet"]["baselineSnapshot"]["tabCount"] = len(TABS)
config["spreadsheet"]["baselineSnapshot"]["tabs"] = TABS
config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

template_path = ROOT / "reports/content-sessions/template.json"
template = json.loads(template_path.read_text(encoding="utf-8"))
template["spreadsheet"]["metadataTabCount"] = len(TABS)
template["spreadsheet"]["discoveredTabs"] = TABS
reviewed_template = {item["name"]: item for item in template["reviewedTabs"]}
reviewed_template["Статьи_HARANT"] = {
    "name": "Статьи_HARANT",
    "range": "A1:P1000",
    "reviewedNonEmptyCells": True,
    "notesReviewed": True,
    "usedFor": ["external publication overlap check"],
}
template["reviewedTabs"] = [reviewed_template[name] for name in TABS]
template_path.write_text(json.dumps(template, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

reviewed_tabs = [
    {
        "name": name,
        "range": TAB_RANGES[name][0],
        "reviewedNonEmptyCells": True,
        "notesReviewed": True,
        "usedFor": TAB_RANGES[name][1],
    }
    for name in TABS
]

supporting_urls = [
    "https://yuristshevchuk.com/razbory/vernut-dengi-za-neokazannuyu-uslugu/",
    "https://yuristshevchuk.com/razbory/otkaz-ot-dogovora-okazaniya-uslug/",
    "https://yuristshevchuk.com/razbory/vernut-dengi-za-navyazannuyu-uslugu/",
    "https://yuristshevchuk.com/razbory/prodavets-propal-posle-perevoda/",
]

manifest = {
    "schemaVersion": 3,
    "sessionId": "20260801-refund-service-hub",
    "reviewedAt": REVIEWED_AT,
    "spreadsheet": {
        "id": SHEET_ID,
        "modifiedTime": SHEET_MODIFIED,
        "metadataTabCount": len(TABS),
        "discoveredTabs": TABS,
    },
    "reviewedTabs": reviewed_tabs,
    "sourceTrace": {
        "dialogIds": [
            "688cf01a-5a58-8328-b6fe-c4d2b0796668",
            "6a2fa7a8-2598-83eb-ac54-dcd47ad89786",
            "68aecbcb-5084-832f-b721-ed443704fab0",
        ],
        "situationIds": [],
        "workIds": ["ЮД-ИМП-003", "ЮД-ИМП-039", "ЮД-ИМП-061"],
        "contentIds": ["C-012", "C-071", "C-166"],
        "caseIds": ["K-022", "K-050"],
        "notes": "Only internal non-personal IDs. Paid work confirms the legal service, not a successful case result. Case candidates remain unpublished.",
    },
    "seoReview": {
        "status": "completed",
        "checkedAt": "2026-07-31T12:00:00.000Z",
        "region": "Москва",
        "primaryIntent": "получить юридическую помощь по возврату оплаты за услугу, аванс или дополнительный договор",
        "verifiedCluster": [
            "юрист по возврату денег за услуги",
            "вернуть деньги за неоказанную услугу",
            "отказ от договора оказания услуг",
            "вернуть деньги за навязанную услугу",
        ],
        "intentMap": [
            {"intent": "широкая юридическая помощь по возврату оплаты", "target": "H1, lead and service guide"},
            {"intent": "услуга не оказана или оказана частично", "target": "linked article owner"},
            {"intent": "добровольный отказ без нарушения исполнителя", "target": "linked article owner"},
            {"intent": "навязанная дополнительная услуга", "target": "linked article owner"},
            {"intent": "возврат предоплаты и контроль срока после требования", "target": "service guide paragraphs"},
        ],
        "intentOwnership": [
            {
                "intent": "получить юридическую помощь по возврату оплаты за услугу, аванс или дополнительный договор",
                "ownerUrl": SERVICE_URL,
                "ownerType": "service",
                "supportingUrls": supporting_urls,
                "supportingCaseIds": [],
                "excludedQueries": [
                    "как вернуть деньги за неоказанную услугу",
                    "как отказаться от договора оказания услуг",
                    "как вернуть деньги за навязанную услугу",
                    "что делать если продавец получил деньги и пропал",
                ],
                "existingCompetingUrlsReviewed": [SERVICE_URL, *supporting_urls],
                "decision": "update-owner",
                "reason": "The existing service page owns the broad commercial need; narrow factual questions remain with their separate explanatory pages.",
            }
        ],
        "serpSnapshots": [
            {
                "intent": "получить юридическую помощь по возврату оплаты за услугу, аванс или дополнительный договор",
                "checkedAt": "2026-07-31T12:00:00.000Z",
                "region": "Москва",
                "engines": [
                    {
                        "engine": "Yandex",
                        "query": "юрист по возврату денег за услуги",
                        "organicResultsReviewed": 20,
                        "sponsoredResultsObserved": 0,
                        "sponsoredResultLabels": [],
                        "sponsoredAdvertiserTypes": [],
                        "sponsoredOfferPatterns": [],
                        "dominantIntent": "commercial legal assistance with mixed explanatory results",
                        "resultTypes": ["law firm service pages", "legal articles", "consumer explanations"],
                        "localPack": False,
                        "snippetPatterns": ["refund of payment", "claim preparation", "consumer dispute", "document review"],
                        "competitorCoverageGaps": ["few pages separate breach, voluntary cancellation and imposed add-on service before offering help"],
                        "staleOrWeakResults": [],
                    },
                    {
                        "engine": "Google",
                        "query": "юрист по возврату денег за услуги",
                        "organicResultsReviewed": 9,
                        "sponsoredResultsObserved": 0,
                        "sponsoredResultLabels": [],
                        "sponsoredAdvertiserTypes": [],
                        "sponsoredOfferPatterns": [],
                        "dominantIntent": "commercial legal assistance supported by informational guidance",
                        "resultTypes": ["law firm service pages", "legal articles", "official consumer sources"],
                        "localPack": False,
                        "snippetPatterns": ["return money", "consumer rights", "claim", "court recovery"],
                        "competitorCoverageGaps": ["results often mix all refund grounds and do not help the reader identify the correct first document"],
                        "staleOrWeakResults": [],
                    },
                ],
                "pageTypeDecision": "service",
                "decisionReason": "The broad query expects a commercial legal-help page, while each narrow situation is already assigned to a separate explanatory owner.",
                "canProvideBetterAnswer": True,
            }
        ],
        "practicalElements": [
            {
                "contentId": "refund-service-hub",
                "targetUrl": SERVICE_URL,
                "type": "decision-tree",
                "title": "Выберите ситуацию: основания возврата различаются",
                "userValue": "Helps the reader distinguish breach, voluntary cancellation, imposed service and disappearance after payment before choosing the next document.",
                "competitorGap": "Most reviewed pages combine different refund grounds and do not route the reader to a focused explanation.",
                "sourceBasis": "mixed demand and paid legal work",
                "sourceIds": ["C-012", "C-071", "C-166", "ЮД-ИМП-003", "ЮД-ИМП-039", "ЮД-ИМП-061"],
                "placement": "service guide with four linked scenarios and explanations for prepayment and post-claim control",
                "verifiedAgainstSerp": True,
            }
        ],
        "cannibalizationChecked": True,
        "overOptimizationRisk": "low",
    },
    "editorialChecks": {
        "factsSeparatedFromHypotheses": True,
        "paidWorkSeparatedFromPaymentDetails": True,
        "workProcedureAndCaseResultsSeparated": True,
        "legalSourcesVerified": True,
        "anonymizationVerified": True,
        "criticalSourceErrorsResolved": True,
    },
    "contentChanges": [
        {"path": "src/service-content.mjs", "kind": "service", "contentId": "refund-service-hub", "action": "updated", "expectedUrl": SERVICE_URL},
        {"path": "src/search-visibility.mjs", "kind": "service", "contentId": "refund-service-hub", "action": "updated", "expectedUrl": SERVICE_URL},
        {"path": "site.config.mjs", "kind": "service-date", "contentId": "refund-service-hub", "action": "updated", "expectedUrl": SERVICE_URL},
    ],
    "plannedChecks": [
        "npm run test:public-copy",
        "npm run check",
        "npm run test:live",
        "node scripts/live-all-publications-smoke.mjs",
        "node scripts/live-public-copy-regression-test.mjs",
    ],
    "publication": {
        "expectedUrls": [SERVICE_URL],
        "notes": "The service page is updated first. A paid-work case remains unpublished until the procedure and case result are separately confirmed.",
    },
}

manifest_path = ROOT / "reports/content-sessions/latest.json"
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["scripts"]["test:refund-service-hub"] = "node scripts/refund-service-hub-test.mjs"
needle = "npm run test:service-pages &&"
if needle not in package["scripts"]["check"]:
    raise RuntimeError("package.json: service-pages check marker not found")
package["scripts"]["check"] = package["scripts"]["check"].replace(
    needle,
    "npm run test:service-pages && npm run test:refund-service-hub &&",
    1,
)
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

test_path = ROOT / "scripts/refund-service-hub-test.mjs"
test_path.write_text('''import { readFile } from "node:fs/promises";\nimport { join } from "node:path";\n\nconst root = join(import.meta.dirname, "..");\nconst html = await readFile(join(root, "dist/uslugi/vozvrat-deneg/index.html"), "utf8");\nconst required = [\n  "Возврат денег за услугу, аванс или навязанный договор",\n  "Выберите ситуацию: основания возврата денег различаются",\n  "/razbory/vernut-dengi-za-neokazannuyu-uslugu/",\n  "/razbory/otkaz-ot-dogovora-okazaniya-uslug/",\n  "/razbory/vernut-dengi-za-navyazannuyu-uslugu/",\n  "/razbory/prodavets-propal-posle-perevoda/",\n  "Возврат предоплаты не требует отдельной страницы",\n  "После претензии нужно считать срок по применимой норме",\n];\nconst missing = required.filter((marker) => !html.includes(marker));\nif (missing.length) {\n  console.error(`Refund service hub is incomplete: ${missing.join(", ")}`);\n  process.exit(1);\n}\nconst forbidden = ["C-166", "ЮД-ИМП", "владелец интента", "SERP", "оплаченная практика"];\nconst leaked = forbidden.filter((marker) => html.includes(marker));\nif (leaked.length) {\n  console.error(`Refund service hub leaks internal language: ${leaked.join(", ")}`);\n  process.exit(1);\n}\nconsole.log("Refund service hub contract passed: broad commercial owner routes four independent situations and keeps prepayment/deadline on the service page");\n''', encoding="utf-8")

print("Refund service hub patch applied")
