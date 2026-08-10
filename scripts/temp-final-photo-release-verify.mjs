import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const expectedSha = "6616b4194f32ceafd5a998ce0063da0ae50d5730";
const expectedImageSha256 = "b19f96b81b2483b9155b27412b69f6bb2d9fce7112a9a8ad56f51a5bd607c5ba";
const origin = "https://yuristshevchuk.com";
const nonce = Date.now();

const get = async (path, accept = "*/*") => {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${origin}${path}${separator}final_photo_verify=${nonce}`;
  const response = await fetch(url, {
    headers: {
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
      accept,
      "user-agent": "final-photo-release-verifier/1.0",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
};

const marker = await (await get(`/deployments/${expectedSha}.json`, "application/json")).text();
if (!marker.includes(expectedSha)) throw new Error(`Deployment marker does not contain ${expectedSha}`);

const buildInfo = await (await get("/build-info.json", "application/json")).text();
if (!buildInfo.includes(expectedSha)) throw new Error(`build-info.json does not contain ${expectedSha}`);

const home = await (await get("/", "text/html")).text();
const metaMatch = home.match(/<meta\s+name=["']site-build-sha["']\s+content=["']([^"']+)["']/i)
  || home.match(/<meta\s+content=["']([^"']+)["']\s+name=["']site-build-sha["']/i);
if (metaMatch?.[1] !== expectedSha) throw new Error(`Homepage site-build-sha ${metaMatch?.[1] || "missing"}, expected ${expectedSha}`);
if (!home.includes("/assets/images/maxim-hero.webp")) throw new Error("Homepage does not reference maxim-hero.webp");

const imageResponse = await get("/assets/images/maxim-hero.webp", "image/webp,*/*");
const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
const imageSha256 = createHash("sha256").update(imageBytes).digest("hex");
if (imageSha256 !== expectedImageSha256) {
  throw new Error(`Live hero sha256 ${imageSha256} != expected ${expectedImageSha256}; bytes=${imageBytes.length}`);
}

const run = (command, args, env = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) return reject(new Error(`${command} ${args.join(" ")} terminated by ${signal}`));
    if (code !== 0) return reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    resolve();
  });
});

await run("node", ["scripts/live-public-copy-regression-test.mjs"], {
  SITE_PUBLIC_URL: origin,
  EXPECTED_BUILD_SHA: expectedSha,
});

await run("node", ["scripts/submit-indexnow.mjs"], {
  INDEXNOW_URLS: `${origin}/`,
  INDEXNOW_SITEMAP_URL: `${origin}/sitemap.xml`,
});

console.log(`FINAL_LIVE_RELEASE_OK sha=${expectedSha} hero_sha256=${imageSha256} bytes=${imageBytes.length}`);
