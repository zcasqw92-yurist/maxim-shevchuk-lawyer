import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];

const home = await readFile(join(dist, "index.html"), "utf8");
const config = JSON.parse(await readFile(join(dist, "video-config.json"), "utf8"));
const script = await readFile(join(dist, "assets", "visual-trust.js"), "utf8");
const styles = await readFile(join(dist, "assets", "styles.css"), "utf8");

if (config.enabled !== false) errors.push("video-config.json: video must remain disabled without explicit variable");
if ("sources" in config || "poster" in config || "captions" in config) errors.push("video-config.json: disabled config must not expose media URLs");
if (!home.includes("data-video-launch")) errors.push("home: video launcher is missing");
if (!home.includes("data-video-config-url=")) errors.push("home: video config URL is missing");
if (!home.includes("data-video-dialog")) errors.push("home: video dialog is missing");
if (!home.includes("data-video-stage")) errors.push("home: dynamic video stage is missing");
if (/<video\b/i.test(home)) errors.push("home: video element must not exist before user action");
if (/\.(?:mp4|webm)(?:[?\"'])/i.test(home)) errors.push("home: media URL must not exist before user action");

for (const marker of [
  "document.createElement(\"video\")",
  "video.preload = \"none\"",
  "video.playsInline = true",
  "document.createElement(\"source\")",
  "document.createElement(\"track\")",
  "video_progress",
  "video_complete",
  "video_load_error",
]) {
  if (!script.includes(marker)) errors.push(`visual-trust.js: missing ${marker}`);
}
for (const marker of [
  ".video-ready-dialog__media",
  ".video-ready-dialog__player",
  "aspect-ratio: 16 / 9",
]) {
  if (!styles.includes(marker)) errors.push(`styles.css: missing ${marker}`);
}

const failedBuild = spawnSync(process.execPath, [join(root, "scripts", "build.mjs")], {
  cwd: root,
  env: {
    ...process.env,
    SITE_PRODUCTION: "true",
    SITE_URL: "https://example.test",
    SITE_BASE_PATH: "/test",
    SITE_VIDEO_ENABLED: "true",
    INDEXNOW_KEY: "test-indexnow-key",
  },
  encoding: "utf8",
});
const failureOutput = `${failedBuild.stdout || ""}\n${failedBuild.stderr || ""}`;
if (failedBuild.status === 0) errors.push("production build must fail when video is enabled without media files");
if (!failureOutput.includes("Видео включено, но отсутствуют файлы")) errors.push("missing-media production error is not explicit");
for (const path of ["/assets/video/intro.webm", "/assets/video/intro.mp4", "/assets/video/intro-captions.vtt"]) {
  if (!failureOutput.includes(path)) errors.push(`missing-media error does not name ${path}`);
}

if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log("On-demand video checks passed: disabled fallback, no eager media, accessible player factory and production asset guard");