from __future__ import annotations

import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "tests/golden-render-contract.json"
data = json.loads(path.read_text(encoding="utf-8"))
route = "/uslugi/vozvrat-deneg"
if route not in data:
    raise RuntimeError(f"Golden route not found: {route}")

data[route]["headings"] = [
    "h1:Возврат денег за услугу, аванс или навязанный договор",
    "h2:Сначала спокойно разберёмся, потом решим, нужна ли платная работа",
    "h2:Условия понятны до начала подготовки",
    "h2:По какой причине вы требуете вернуть деньги",
    "h2:Основание возврата, расчёт и подходящий документ",
    "h2:Как определяется правильный путь возврата",
    "h2:Выберите ситуацию: основания возврата денег различаются",
    "h2:После требования помогу оценить возврат, отказ или молчание",
    "h2:Другие этапы защиты позиции",
    "h2:Проверим, почему деньги должны быть возвращены",
    "h2:Направления",
    "h2:Информация",
    "h2:Связаться",
    "h2:Химки, улица Горшина, 2",
    "h2:Опишите ситуацию — первично посмотрю бесплатно",
]

path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Refund service golden headings updated intentionally")
