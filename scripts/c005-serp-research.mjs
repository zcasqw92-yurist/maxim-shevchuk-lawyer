import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "reports", "c005-serp-research");
const query = "работал без трудового договора не выплатили зарплату";
const checkedAt = new Date().toISOString();

const clean = (value = "") => String(value)
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/\s+/g, " ")
  .trim();

const hostname = (value) => {
  try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
};

const uniqueOrganic = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${hostname(item.link)}|${clean(item.title).toLowerCase()}`;
    if (!item.link || !item.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const fetchJson = async (url, options, label) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(45000) });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error(`${label}: получен не JSON-ответ (${response.status})`); }
  if (!response.ok || payload?.error) {
    const message = payload?.error || payload?.message || payload?.code || response.statusText;
    throw new Error(`${label}: ${response.status} ${clean(message)}`);
  }
  return payload;
};

const searchYandex = async () => {
  const apiKey = String(process.env.YANDEX_SEARCH_API_KEY || "").trim();
  const folderId = String(process.env.YANDEX_CLOUD_FOLDER_ID || "").trim();
  if (!apiKey) throw new Error("Yandex: отсутствует YANDEX_SEARCH_API_KEY");
  console.log(`::add-mask::${apiKey}`);
  if (folderId) console.log(`::add-mask::${folderId}`);

  const body = {
    query: {
      searchType: "SEARCH_TYPE_RU",
      queryText: query,
      familyMode: "FAMILY_MODE_MODERATE",
      page: "0",
      fixTypoMode: "FIX_TYPO_MODE_ON",
    },
    sortSpec: {
      sortMode: "SORT_MODE_BY_RELEVANCE",
      sortOrder: "SORT_ORDER_DESC",
    },
    groupSpec: {
      groupMode: "GROUP_MODE_FLAT",
      groupsOnPage: "20",
      docsInGroup: "1",
    },
    maxPassages: "2",
    region: "213",
    l10N: "LOCALIZATION_RU",
    responseFormat: "FORMAT_XML",
    userAgent: "Mozilla/5.0 (compatible; C005Research/1.0)",
  };
  if (folderId) body.folderId = folderId;

  const payload = await fetchJson(
    "https://searchapi.api.cloud.yandex.net/v2/web/search",
    {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    },
    "Yandex Search API",
  );

  if (!payload.rawData) throw new Error("Yandex: ответ не содержит rawData");
  const xml = Buffer.from(payload.rawData, "base64").toString("utf8");
  const docs = [...xml.matchAll(/<doc\b[^>]*>([\s\S]*?)<\/doc>/gi)].map((match, index) => {
    const block = match[1];
    const pick = (tag) => clean(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "");
    return {
      position: index + 1,
      title: pick("title"),
      link: pick("url"),
      snippet: pick("passage") || pick("headline"),
    };
  });

  return {
    engine: "Yandex",
    provider: "Yandex Search API XML",
    organic: uniqueOrganic(docs).slice(0, 20),
    sponsored: [],
  };
};

const normalizeGoogle = (payload, provider) => ({
  engine: "Google",
  provider,
  organic: uniqueOrganic((payload.organic_results || payload.organic || []).map((item) => ({
    position: Number(item.position || 0),
    title: clean(item.title),
    link: String(item.link || ""),
    snippet: clean(item.snippet),
  }))).slice(0, 20),
  sponsored: (payload.ads || []).map((item) => ({
    position: Number(item.position || 0),
    title: clean(item.title),
    link: String(item.link || ""),
    label: provider.includes("Serper") ? "Sponsored" : "Ad",
  })),
});

const searchGoogle = async () => {
  const serpApiKey = String(process.env.SERPAPI_API_KEY || "").trim();
  const compatibleKey = String(process.env.SERPER_API_KEY || "").trim();

  for (const [key, label] of [[serpApiKey, "SerpApi"], [compatibleKey, "SerpApi compatibility"]]) {
    if (!key) continue;
    console.log(`::add-mask::${key}`);
    try {
      const params = new URLSearchParams({
        engine: "google",
        q: query,
        hl: "ru",
        gl: "ru",
        location: "Moscow, Russia",
        num: "20",
        api_key: key,
        output: "json",
      });
      const payload = await fetchJson(`https://serpapi.com/search.json?${params}`, {}, label);
      const normalized = normalizeGoogle(payload, label);
      if (normalized.organic.length >= 5) return normalized;
    } catch (error) {
      console.warn(clean(error?.message || error));
    }
  }

  if (compatibleKey) {
    const payload = await fetchJson(
      "https://google.serper.dev/search",
      {
        method: "POST",
        headers: { "X-API-KEY": compatibleKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, gl: "ru", hl: "ru", location: "Moscow, Russia", num: 20 }),
      },
      "Serper Google",
    );
    const normalized = normalizeGoogle(payload, "Serper");
    if (normalized.organic.length >= 5) return normalized;
  }

  throw new Error("Google: не удалось получить минимум пять органических результатов");
};

const toMarkdown = (report) => {
  const lines = [
    "# C-005 — слепок органической выдачи",
    "",
    `Дата проверки: ${report.checkedAt}`,
    "Регион: Москва",
    `Запрос: \`${report.query}\``,
    "",
  ];
  for (const engine of report.engines) {
    lines.push(`## ${engine.engine}`, "");
    lines.push(`Провайдер: ${engine.provider}`);
    lines.push(`Органических результатов: ${engine.organic.length}`);
    lines.push(`Рекламных результатов: ${engine.sponsored.length}`, "");
    engine.organic.forEach((item, index) => {
      lines.push(`${index + 1}. [${item.title}](${item.link})${item.snippet ? ` — ${item.snippet}` : ""}`);
    });
    lines.push("");
  }
  lines.push("## Контроль", "");
  lines.push(`- Яндекс: ${report.engines.find((item) => item.engine === "Yandex")?.organic.length || 0} органических результатов.`);
  lines.push(`- Google: ${report.engines.find((item) => item.engine === "Google")?.organic.length || 0} органических результатов.`);
  lines.push("- Реклама учитывается отдельно и не входит в обязательный минимум.");
  lines.push("- Сырые ответы API и секреты не сохраняются.");
  return `${lines.join("\n")}\n`;
};

await mkdir(outputDir, { recursive: true });
const engines = [];
const errors = [];
for (const task of [searchYandex, searchGoogle]) {
  try { engines.push(await task()); }
  catch (error) { errors.push(clean(error?.message || error)); }
}

const report = {
  schemaVersion: 1,
  contentId: "C-005",
  checkedAt,
  region: "Москва",
  query,
  engines,
  errors,
  safety: { rawResponsesSaved: false, secretsSaved: false },
};
await writeFile(join(outputDir, "results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(join(outputDir, "results.md"), toMarkdown(report), "utf8");

const yandexCount = engines.find((item) => item.engine === "Yandex")?.organic.length || 0;
const googleCount = engines.find((item) => item.engine === "Google")?.organic.length || 0;
console.log(`C-005 SERP: Yandex=${yandexCount}, Google=${googleCount}, errors=${errors.length}`);
if (errors.length || yandexCount < 5 || googleCount < 5) {
  throw new Error(`SERP-шлюз не пройден: Yandex=${yandexCount}, Google=${googleCount}; ${errors.join("; ")}`);
}
