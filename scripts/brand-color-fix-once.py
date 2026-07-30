from pathlib import Path
import json


def replace_all(path_name: str, mapping: dict[str, str]) -> None:
    path = Path(path_name)
    text = path.read_text(encoding="utf-8")
    for old, new in mapping.items():
        if old not in text:
            raise SystemExit(f"Не найден ожидаемый цвет в {path_name}: {old}")
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")


styles = Path("src/styles.css")
text = styles.read_text(encoding="utf-8")
anchor = "    --danger: #9c3737;\n"
if anchor not in text:
    raise SystemExit("Не найдено место для семантических цветовых токенов")
semantic_tokens = '''    --danger: #9c3737;

    /* Semantic color roles. Component CSS must use these roles instead of local colors. */
    --surface-page: var(--paper);
    --surface-subtle: var(--paper-2);
    --surface-card: var(--white);
    --surface-soft: color-mix(in srgb, var(--paper) 70%, var(--white));
    --surface-highlight: color-mix(in srgb, var(--gold-bright) 10%, var(--white));
    --surface-accent-soft: color-mix(in srgb, var(--gold-bright) 24%, var(--paper));
    --surface-disabled: rgba(16, 40, 61, .035);
    --link-text: var(--ink);
    --text-on-dark-strong: var(--white);
    --text-on-dark: rgba(255, 255, 255, .82);
    --text-on-dark-muted: rgba(255, 255, 255, .64);
    --border-subtle: rgba(16, 40, 61, .14);
    --border-control: rgba(16, 40, 61, .2);
    --border-accent: rgba(195, 154, 93, .55);
    --border-accent-soft: rgba(195, 154, 93, .42);

    /* Functional exceptions: state and third-party messenger recognition only. */
    --status-online: #41b86b;
    --status-online-text: #416550;
    --status-online-bg: #e5f5ea;
    --status-offline: #9da4aa;
    --status-offline-bg: #edf0f1;
    --messenger-whatsapp: #21aa5a;
    --messenger-telegram: #229ed9;

    /* Restrained attention effect derived from the approved gold palette. */
    --attention-glow-clear: rgba(195, 154, 93, 0);
    --attention-ring-strong: rgba(221, 185, 121, .72);
    --attention-glow-strong: rgba(195, 154, 93, .4);
    --attention-ring-clear: rgba(221, 185, 121, 0);
    --attention-glow-medium: rgba(195, 154, 93, .24);
    --attention-ring-soft: rgba(221, 185, 121, .16);
    --attention-glow-soft: rgba(195, 154, 93, .16);
'''
styles.write_text(text.replace(anchor, semantic_tokens, 1), encoding="utf-8")

replacements = {
    "src/styles.css": {
        "color: #416550;": "color: var(--status-online-text);",
        "background: #41b86b;": "background: var(--status-online);",
        "background: #9da4aa;": "background: var(--status-offline);",
        "background: #e5f5ea;": "background: var(--status-online-bg);",
        "background: #edf0f1;": "background: var(--status-offline-bg);",
        "color: #76552e !important;": "color: var(--gold-text) !important;",
        "background: #f4e5c7;": "background: var(--surface-accent-soft);",
        ".messenger-choice--whatsapp { background: #25d366; }": ".messenger-choice--whatsapp { background: var(--gold-bright); }",
        ".messenger-choice--telegram { background: #229ed9; }": ".messenger-choice--telegram { background: var(--gold-bright); }",
        "background: #e5dfd2;": "background: var(--surface-subtle);",
        "background: #faf8f3;": "background: var(--surface-soft);",
        "color: #9e7848;": "color: var(--gold-text);",
        "color: #4b5f6e;": "color: var(--ink-soft);",
        "color: #21aa5a;": "color: var(--messenger-whatsapp);",
        "color: #229ed9;": "color: var(--messenger-telegram);",
    },
    "src/editorial.css": {
        "background: #f6f3ec;": "background: var(--surface-page);",
        "background: #fffefa;": "background: var(--surface-card);",
        "background: #fffaf0;": "background: var(--surface-highlight);",
        "color: #f8f3e8;": "color: var(--text-on-dark-strong);",
        "color: #274f73;": "color: var(--link-text);",
        "color: #fff;": "color: var(--text-on-dark-strong);",
        "border: 1px solid rgba(16, 40, 61, .13);": "border: 1px solid var(--border-subtle);",
        "border: 1px solid rgba(195, 154, 93, .55);": "border: 1px solid var(--border-accent);",
    },
    "src/editorial-publication.css": {
        "background: #fffaf0;": "background: var(--surface-highlight);",
        "background: #fffefa;": "background: var(--surface-card);",
        "background: #fff7e7;": "background: var(--surface-highlight);",
        "color: #fff;": "color: var(--text-on-dark-strong);",
        "border: 1px solid rgba(195, 154, 93, .42);": "border: 1px solid var(--border-accent-soft);",
        "border: 1px solid rgba(16, 40, 61, .13);": "border: 1px solid var(--border-subtle);",
        "border: 1px solid rgba(16, 40, 61, .2);": "border: 1px solid var(--border-control);",
        "background: rgba(16, 40, 61, .035);": "background: var(--surface-disabled);",
    },
    "src/editorial-cards.css": {
        "border-color: rgba(16, 40, 61, .14);": "border-color: var(--border-subtle);",
    },
    "src/cta-system.css": {
        "background: #fff8e9;": "background: var(--surface-highlight);",
    },
    "src/layout-corrections.css": {
        "border: 2px solid #f4d89e;": "border: 2px solid var(--gold-bright);",
        "background: #e8c88d;": "background: var(--gold);",
    },
    "src/mobile-actions.css": {
        "background: #e7c785;": "background: var(--gold);",
        "rgba(255, 218, 137, 0)": "var(--attention-glow-clear)",
        "rgba(255, 239, 194, .92)": "var(--attention-ring-strong)",
        "rgba(255, 206, 96, .54)": "var(--attention-glow-strong)",
        "rgba(255, 224, 151, 0)": "var(--attention-ring-clear)",
        "rgba(255, 205, 91, .3)": "var(--attention-glow-medium)",
        "rgba(255, 235, 181, .2)": "var(--attention-ring-soft)",
        "rgba(255, 210, 105, .2)": "var(--attention-glow-soft)",
    },
}
for file_name, mapping in replacements.items():
    replace_all(file_name, mapping)

editorial = Path("src/editorial.css")
text = editorial.read_text(encoding="utf-8")
link_rule = '''  .editorial-sources a,
  .editorial-related a {
    color: var(--link-text);
  }
'''
if link_rule not in text:
    raise SystemExit("Не найдено правило ссылок редакционных материалов")
hover_rule = link_rule + '''
  .editorial-sources a:hover,
  .editorial-sources a:focus-visible,
  .editorial-related a:hover,
  .editorial-related a:focus-visible {
    color: var(--gold-text);
  }
'''
editorial.write_text(text.replace(link_rule, hover_rule, 1), encoding="utf-8")

test_script = r'''import { readFile, readdir } from "node:fs/promises";

const srcDir = new URL("../src/", import.meta.url);
const files = (await readdir(srcDir)).filter((name) => name.endsWith(".css")).sort();
const approvedHexTokens = new Map([
  ["--ink", "#10283d"], ["--ink-deep", "#091c2c"], ["--ink-soft", "#314b60"],
  ["--paper", "#f4f1ea"], ["--paper-2", "#ebe6dc"], ["--white", "#fffefb"],
  ["--gold", "#c39a5d"], ["--gold-bright", "#ddb979"], ["--gold-text", "#765429"],
  ["--muted", "#52636f"], ["--success", "#3f735f"], ["--danger", "#9c3737"],
  ["--status-online", "#41b86b"], ["--status-online-text", "#416550"],
  ["--status-online-bg", "#e5f5ea"], ["--status-offline", "#9da4aa"],
  ["--status-offline-bg", "#edf0f1"], ["--messenger-whatsapp", "#21aa5a"],
  ["--messenger-telegram", "#229ed9"],
]);
const rawHex = /#[0-9a-fA-F]{3,8}\b/g;
const violations = [];
for (const file of files) {
  const css = await readFile(new URL(file, srcDir), "utf8");
  const lines = css.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    for (const match of lines[index].matchAll(rawHex)) {
      const value = match[0].toLowerCase();
      const parsed = lines[index].match(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/);
      const allowed = file === "styles.css" && parsed && approvedHexTokens.get(parsed[1]) === value;
      if (!allowed) violations.push(`${file}:${index + 1}: ${value}`);
    }
  }
}
if (violations.length) throw new Error(`Локальные hex-цвета вне утверждённых токенов:\n${violations.join("\n")}`);

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
for (const [name, value] of approvedHexTokens) {
  if (!styles.includes(`${name}: ${value};`)) throw new Error(`Отсутствует токен ${name}: ${value}`);
}
for (const role of [
  "--surface-page", "--surface-card", "--surface-highlight", "--surface-accent-soft",
  "--link-text", "--text-on-dark", "--border-subtle", "--border-accent",
  "--attention-glow-strong", "--attention-glow-soft",
]) {
  if (!styles.includes(`${role}:`)) throw new Error(`Отсутствует семантический токен ${role}`);
}

const editorial = await readFile(new URL("../src/editorial.css", import.meta.url), "utf8");
if (!editorial.includes("color: var(--link-text);")) throw new Error("Редакционные ссылки не используют --link-text");
if (!editorial.includes("background: var(--surface-page);")) throw new Error("Редакция не использует --surface-page");
if (!editorial.includes("background: var(--surface-card);")) throw new Error("Карточки не используют --surface-card");
const mobile = await readFile(new URL("../src/mobile-actions.css", import.meta.url), "utf8");
for (const role of ["--attention-glow-clear", "--attention-ring-strong", "--attention-glow-strong", "--attention-glow-soft"]) {
  if (!mobile.includes(`var(${role})`)) throw new Error(`Мобильная CTA не использует ${role}`);
}
const consent = await readFile(new URL("../src/layout-corrections.css", import.meta.url), "utf8");
if (!consent.includes("border: 2px solid var(--gold-bright);")) throw new Error("Кнопка согласия: неверная рамка");
if (!consent.includes("background: var(--gold);")) throw new Error("Кнопка согласия: неверный hover");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (packageJson.scripts["test:brand-colors"] !== "node scripts/brand-colors-test.mjs") throw new Error("Нет test:brand-colors");
if (!packageJson.scripts.check.includes("npm run test:brand-colors")) throw new Error("test:brand-colors не включён в check");
console.log(`Brand color contract passed: ${files.length} CSS modules, no local hex colors.`);
'''
Path("scripts/brand-colors-test.mjs").write_text(test_script, encoding="utf-8")

package_path = Path("package.json")
package_data = json.loads(package_path.read_text(encoding="utf-8"))
package_data["scripts"]["test:brand-colors"] = "node scripts/brand-colors-test.mjs"
check = package_data["scripts"]["check"]
if "npm run test:brand-colors" not in check:
    check = check.replace("npm run test:css-architecture", "npm run test:css-architecture && npm run test:brand-colors", 1)
package_data["scripts"]["check"] = check
package_path.write_text(json.dumps(package_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

for temporary in [
    Path("brand-color-report.txt"),
    Path(".github/workflows/brand-color-audit-once.yml"),
    Path(".github/workflows/brand-color-fix-once.yml"),
    Path("scripts/brand-color-fix-once.py"),
]:
    temporary.unlink(missing_ok=True)
