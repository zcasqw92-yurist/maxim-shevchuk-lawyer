const siteUrl = "https://yuristshevchuk.com";
const expectedSha = "c7c4980ee33cd937f8d27380653af332c1c19915";
const articlePath = "/razbory/spisali-dengi-po-sudebnomu-prikazu/";
const articleUrl = `${siteUrl}${articlePath}`;
const catalogUrl = `${siteUrl}/razbory/`;
const expectedH1 = "Списали деньги по судебному приказу, о котором вы не знали: как отменить приказ и вернуть взысканное";
const attempts = 50;
const delayMs = 10000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value = "") => String(value)
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, " ")
  .trim();

const fetchText = async (url) => {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}verify=${Date.now()}`, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  return { response, text };
};

let deployedSha = "";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const { response, text } = await fetchText(`${siteUrl}/build-info.json`);
    if (response.ok) {
      const payload = JSON.parse(text);
      deployedSha = String(payload.sha || payload.commit || payload.buildSha || "").trim();
      console.log(`Попытка ${attempt}: production SHA ${deployedSha || "не указан"}`);
      if (deployedSha === expectedSha) break;
    } else {
      console.log(`Попытка ${attempt}: build-info HTTP ${response.status}`);
    }
  } catch (error) {
    console.log(`Попытка ${attempt}: ${error.message}`);
  }
  if (attempt < attempts) await sleep(delayMs);
}

if (deployedSha !== expectedSha) {
  throw new Error(`Production SHA не совпал: ожидался ${expectedSha}, получен ${deployedSha || "пустой"}`);
}

const { response: articleResponse, text: articleHtml } = await fetchText(articleUrl);
if (articleResponse.status !== 200) throw new Error(`Статья вернула HTTP ${articleResponse.status}`);

const h1 = normalize(articleHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
if (h1 !== expectedH1) throw new Error(`Неверный H1: ${h1}`);

const canonical = articleHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
  || articleHtml.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
  || "";
if (canonical !== articleUrl) throw new Error(`Неверный canonical: ${canonical}`);

if (!articleHtml.includes("3 августа 2026")) throw new Error("На странице не найдена видимая дата 3 августа 2026");
if (!articleHtml.includes('"datePublished":"2026-08-03"')) throw new Error("JSON-LD datePublished не равен 2026-08-03");
if (!articleHtml.includes('"dateModified":"2026-08-03"')) throw new Error("JSON-LD dateModified не равен 2026-08-03");
if (!articleHtml.includes('/uslugi/zhaloby-i-obrashcheniya/')) throw new Error("Нет ссылки на связанную услугу");

const robotsTag = [...articleHtml.matchAll(/<meta\b[^>]*>/gi)]
  .map((match) => match[0])
  .find((tag) => /\bname=["']robots["']/i.test(tag)) || "";
const robotsContent = robotsTag.match(/\bcontent=["']([^"']+)["']/i)?.[1]
  ?.toLowerCase()
  .replace(/\s+/g, "") || "";
const robotsDirectives = robotsContent.split(",");
if (!robotsDirectives.includes("index") || !robotsDirectives.includes("follow")) {
  throw new Error(`Страница не открыта для индексации: ${robotsContent || "meta robots не найден"}`);
}

const metaSha = articleHtml.match(/<meta[^>]+name=["']site-build-sha["'][^>]+content=["']([^"']+)["']/i)?.[1]
  || articleHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']site-build-sha["']/i)?.[1]
  || "";
if (metaSha !== expectedSha) throw new Error(`SHA в HTML не совпал: ${metaSha}`);

const { response: catalogResponse, text: catalogHtml } = await fetchText(catalogUrl);
if (catalogResponse.status !== 200) throw new Error(`Каталог вернул HTTP ${catalogResponse.status}`);
if (!catalogHtml.includes(`href="${articlePath}"`)) throw new Error("Статья не найдена в каталоге Разборы");
if (!normalize(catalogHtml).includes(expectedH1)) throw new Error("Заголовок статьи не найден в каталоге Разборы");

console.log(JSON.stringify({
  status: "passed",
  checkedAt: new Date().toISOString(),
  productionSha: deployedSha,
  articleUrl,
  httpStatus: articleResponse.status,
  canonical,
  h1,
  robots: robotsContent,
  visibleDate: "3 августа 2026",
  datePublished: "2026-08-03",
  dateModified: "2026-08-03",
  listedInCatalog: true,
  linkedService: "/uslugi/zhaloby-i-obrashcheniya/",
}, null, 2));
