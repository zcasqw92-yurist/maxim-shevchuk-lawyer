from pathlib import Path

root = Path(__file__).resolve().parents[1]

search_path = root / "src/search-visibility.mjs"
text = search_path.read_text(encoding="utf-8")
old_sources = '''    sources: [
      ["Статья 16 Закона о защите прав потребителей", "КонсультантПлюс", "https://www.consultant.ru/document/cons_doc_LAW_305/9eb0f127ead4dc57e7d0a9d4954cf264c4b3cea8/"],
      ["Статья 28 Закона о защите прав потребителей", "КонсультантПлюс", "https://www.consultant.ru/document/cons_doc_LAW_305/f190d8f6c0d4f03af399cc0efcc722d87a0f83a6/"],
      ["Статья 31 Закона о защите прав потребителей", "КонсультантПлюс", "https://www.consultant.ru/document/cons_doc_LAW_305/30aa7e1b7d9fe18928b8e9bce991ec6ba0d284e2/"],
      ["Статья 32 Закона о защите прав потребителей", "КонсультантПлюс", "https://www.consultant.ru/document/cons_doc_LAW_305/758e2cfdf136a621c8f66dcb3372b772c7b5e6e8/"],
      ["Банк России — дополнительные услуги при потребительском кредите", "Банк России", "https://www.cbr.ru/faq/bank_s/kredity/"]
    ],'''
new_sources = '''    sources: [
      ["Роспотребнадзор — недопустимость навязывания дополнительных товаров, работ и услуг", "Роспотребнадзор", "https://zpp.rospotrebnadzor.ru/news/federal/575369"],
      ["Роспотребнадзор — отказ от договора услуг и подтверждение фактических расходов", "Роспотребнадзор", "https://zpp.rospotrebnadzor.ru/news/federal/487957"],
      ["Роспотребнадзор — десятидневный срок требований при оказании услуг", "Роспотребнадзор", "https://zpp.rospotrebnadzor.ru/Forum/Appeals/Details/54518"],
      ["Банк России — дополнительные услуги при потребительском кредите", "Банк России", "https://cbr.ru/faq/bank_s/kredity/"]
    ],'''
if text.count(old_sources) != 1:
    raise RuntimeError("Expected refund source block not found exactly once")
search_path.write_text(text.replace(old_sources, new_sources, 1), encoding="utf-8")

test_path = root / "scripts/search-visibility-test.mjs"
test = test_path.read_text(encoding="utf-8")
old_title = '  "vozvrat-deneg": "Как юрист помогает вернуть оплату за товар, услугу или работу",'
new_title = '  "vozvrat-deneg": "Выберите ситуацию: основания возврата денег различаются",'
if test.count(old_title) != 1:
    raise RuntimeError("Expected refund title contract not found exactly once")
test = test.replace(old_title, new_title, 1)
old_host = '  "fas.gov.ru",\n  "www.vsrf.ru",'
new_host = '  "fas.gov.ru",\n  "cbr.ru",\n  "www.vsrf.ru",'
if test.count(old_host) != 1:
    raise RuntimeError("Official host insertion marker not found exactly once")
test_path.write_text(test.replace(old_host, new_host, 1), encoding="utf-8")

print("Refund service official sources and individual heading contract updated")
