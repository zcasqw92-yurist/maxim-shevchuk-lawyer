const publicUrl = String(process.env.SITE_PUBLIC_URL || "").trim();
const expectedSha = String(process.env.EXPECTED_BUILD_SHA || "").trim();
const attempts = Math.max(1, Number(process.env.LIVE_SMOKE_ATTEMPTS || 18));
const delayMs = Math.max(1000, Number(process.env.LIVE_SMOKE_DELAY_MS || 5000));

if (!publicUrl) throw new Error("SITE_PUBLIC_URL is required");
if (!/^[A-Fa-f0-9]{40}$/.test(expectedSha)) throw new Error("EXPECTED_BUILD_SHA must be a full Git commit SHA");

const base = new URL(publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const noCacheUrl = (pathname) => {
  const url = new URL(pathname, base);
  url.searchParams.set("deployment_check", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return url;
};

let lastError = "published build has not become available";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const infoResponse = await fetch(noCacheUrl("build-info.json"), {
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      cache: "no-store",
      redirect: "follow",
    });
    if (!infoResponse.ok) throw new Error(`build-info.json returned ${infoResponse.status}`);
    const info = await infoResponse.json();
    if (info.sha !== expectedSha) throw new Error(`published SHA ${info.sha || "missing"}, expected ${expectedSha}`);

    const pageResponse = await fetch(noCacheUrl(""), {
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      cache: "no-store",
      redirect: "follow",
    });
    if (!pageResponse.ok) throw new Error(`home page returned ${pageResponse.status}`);
    const html = await pageResponse.text();
    const requiredMarkers = [
      `<meta name="site-build-sha" content="${expectedSha}">`,
      "trust-strip__grid",
      "section--value-editorial",
      "section--cta-portrait",
      "data-price-quiz-step",
      "section--case-studies",
      'id="case-autoclub"',
      'id="case-police-review"',
      'id="case-land"',
      "Кейсы обезличены",
    ];
    for (const marker of requiredMarkers) {
      if (!html.includes(marker)) throw new Error(`home page is missing marker: ${marker}`);
    }
    const forbiddenMarkers = [
      "section--document-samples",
      "section--featured-case",
      "section--visual-cases",
      "data-video-launch",
      "data-video-dialog",
      "data-proof-dialog",
      "Видео готовится",
      "Демо-макет",
      "Демо-визуал",
      "-demo.svg",
      "Топникова",
      "Алиакбарова",
      "Шибаева",
      "КУСП №",
      "УИД",
      "дело выиграно",
      "деньги возвращены полностью",
    ];
    for (const marker of forbiddenMarkers) {
      if (html.includes(marker)) throw new Error(`home page exposes unconfirmed or private material: ${marker}`);
    }

    const videoResponse = await fetch(noCacheUrl("video-config.json"), { cache: "no-store", redirect: "follow" });
    if (!videoResponse.ok) throw new Error(`video-config.json returned ${videoResponse.status}`);
    const videoConfig = await videoResponse.json();
    if (typeof videoConfig.enabled !== "boolean") throw new Error("video-config.json has no enabled boolean");

    console.log(`Published GitHub Pages build verified: ${expectedSha.slice(0, 12)} · ${base}`);
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.log(`Live smoke attempt ${attempt}/${attempts}: ${lastError}`);
    if (attempt < attempts) await sleep(delayMs);
  }
}

throw new Error(`GitHub Pages deployment verification failed: ${lastError}`);
