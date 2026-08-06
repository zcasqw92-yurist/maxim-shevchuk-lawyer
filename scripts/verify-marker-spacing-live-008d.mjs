const base = new URL("https://yuristshevchuk.com/");
const expectedSha = "008d4916399d7c4e94de0b0462e6ea65b84b6204";
const articlePath = "razbory/zakazchik-trebuet-vernut-dengi-za-remont/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestText = async (pathname, attempt = 1) => {
  const url = new URL(pathname, base);
  url.searchParams.set("marker_spacing_verify", `${expectedSha.slice(0, 12)}-${attempt}-${Date.now()}`);
  const response = await fetch(url, {
    headers: {
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  return { response, text: await response.text() };
};

let live = false;
let lastSha = "";
for (let attempt = 1; attempt <= 60; attempt += 1) {
  try {
    const { response, text } = await requestText("build-info.json", attempt);
    if (response.ok) {
      const info = JSON.parse(text);
      lastSha = info.sha || "";
      if (lastSha === expectedSha) {
        live = true;
        console.log(`Live SHA confirmed on attempt ${attempt}: ${expectedSha.slice(0, 12)}`);
        break;
      }
    }
  } catch (error) {
    console.log(`Live SHA attempt ${attempt}: ${error.message}`);
  }
  if (attempt < 60) await sleep(10_000);
}

if (!live) throw new Error(`Expected live SHA ${expectedSha}; last received ${lastSha || "none"}`);

const { response: articleResponse, text: articleHtml } = await requestText(articlePath, 61);
if (!articleResponse.ok) throw new Error(`Article returned ${articleResponse.status}`);
for (const className of ["editorial-checklist", "editorial-list--cross"]) {
  if (!articleHtml.includes(className)) throw new Error(`Article is missing ${className}`);
}

const { response: stylesResponse, text: styles } = await requestText("assets/styles.css", 62);
if (!stylesResponse.ok) throw new Error(`styles.css returned ${stylesResponse.status}`);

for (const token of [
  "--editorial-marker-indent: 26px",
  "--editorial-marker-width: 18px",
  "--editorial-marker-item-gap: 10px",
  "--editorial-marker-block-gap: 18px",
  ":is(.editorial-checklist, .editorial-list)",
  "gap: var(--editorial-marker-item-gap)",
  "margin: var(--editorial-marker-block-gap) 0 0",
  "padding: 0 0 0 var(--editorial-marker-indent)",
  "width: var(--editorial-marker-width)",
]) {
  if (!styles.includes(token)) throw new Error(`Live CSS is missing spacing token: ${token}`);
}

const semanticStart = styles.indexOf("/* source:editorial-semantic-lists */");
const rhythmStart = styles.indexOf("/* source:editorial-rhythm */");
if (semanticStart < 0 || rhythmStart < 0 || semanticStart >= rhythmStart) {
  throw new Error("Semantic list styles are not ordered before the final rhythm module");
}
const rhythmCss = styles.slice(rhythmStart);
if (rhythmCss.includes(".article-page .editorial-checklist") || rhythmCss.includes(".case-page .editorial-checklist")) {
  throw new Error("Live rhythm CSS still contains a separate checklist margin");
}

console.log(`Live marker spacing verified at ${expectedSha.slice(0, 12)}: shared indent, marker-to-text distance and compact item rhythm are active`);
