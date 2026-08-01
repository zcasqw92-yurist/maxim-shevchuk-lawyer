from pathlib import Path

root = Path(__file__).resolve().parents[1]
replacements = {
    root / "src/search-visibility.mjs": (
        "Возврат предоплаты не требует отдельной страницы: значение имеют основание платежа, условия отмены и фактически выполненный объём.",
        "При возврате предоплаты значение имеют основание платежа, условия отмены и фактически выполненный объём.",
    ),
    root / "scripts/refund-service-hub-test.mjs": (
        "Возврат предоплаты не требует отдельной страницы",
        "При возврате предоплаты значение имеют",
    ),
}
for path, (old, new) in replacements.items():
    text = path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise RuntimeError(f"{path}: expected one occurrence of {old!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Public copy wording fixed")
