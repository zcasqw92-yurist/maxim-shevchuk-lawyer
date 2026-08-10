import { createHash } from "node:crypto";

const expectedSha = "6616b4194f32ceafd5a998ce0063da0ae50d5730";
const expectedImageSha256 = "b19f96b81b2483b9155b27412b69f6bb2d9fce7112a9a8ad56f51a5bd607c5ba";
const origin = "https://yuristshevchuk.com";
const nonce = Date.now();

const get = async (path) => {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${origin}${path}${separator}verify_photo=${nonce}`;
  const response = await fetch(url, {
    headers: {
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
      "user-agent": "production-photo-verifier/1.0",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
};

const marker = await (await get(`/deployments/${expectedSha}.json`)).text();
if (!marker.includes(expectedSha)) throw new Error(`Immutable deployment marker does not contain ${expectedSha}`);

const buildInfo = await (await get("/build-info.json")).text();
if (!buildInfo.includes(expectedSha)) throw new Error(`build-info.json does not contain ${expectedSha}`);

const home = await (await get("/")).text();
if (!home.includes(`site-build-sha\" content=\"${expectedSha}`) && !home.includes(`site-build-sha' content='${expectedSha}`)) {
  throw new Error(`Homepage meta site-build-sha does not match ${expectedSha}`);
}
if (!home.includes("/assets/images/maxim-hero.webp")) throw new Error("Homepage does not reference maxim-hero.webp");

const imageResponse = await get("/assets/images/maxim-hero.webp");
const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
const imageSha256 = createHash("sha256").update(imageBytes).digest("hex");
if (imageSha256 !== expectedImageSha256) {
  throw new Error(`Live hero sha256 ${imageSha256} != expected ${expectedImageSha256}; bytes=${imageBytes.length}`);
}

console.log(`LIVE_PRODUCTION_OK sha=${expectedSha} hero_sha256=${imageSha256} bytes=${imageBytes.length}`);
