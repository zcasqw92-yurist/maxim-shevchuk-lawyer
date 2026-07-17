import { access } from "node:fs/promises";
import { join } from "node:path";
import { site } from "../site.config.mjs";

const rootRelative = (value, label, extensionPattern) => {
  const path = String(value || "").trim();
  if (!path.startsWith("/assets/") || path.includes("..") || !extensionPattern.test(path)) {
    throw new Error(`${label} должен быть локальным путём /assets/... с корректным расширением`);
  }
  return path;
};

const publicUrl = (path) => `${site.basePath || ""}${path}`;
const sourcePath = (root, path) => path.startsWith("/assets/images/")
  ? join(root, "src", path.replace(/^\//, ""))
  : join(root, "public", path.replace(/^\//, ""));

export const createVideoConfig = () => {
  const enabled = Boolean(site.video?.enabled);
  const baseConfig = {
    enabled,
    title: String(site.video?.title || "Не знаете, с чего начать? Объясню за 45 секунд"),
    durationLabel: String(site.video?.durationLabel || "45 секунд"),
  };
  if (!enabled) return baseConfig;

  const poster = rootRelative(site.video.poster, "SITE_VIDEO_POSTER", /\.(?:avif|webp|png|jpe?g)$/i);
  const webm = rootRelative(site.video.webm, "SITE_VIDEO_WEBM", /\.webm$/i);
  const mp4 = rootRelative(site.video.mp4, "SITE_VIDEO_MP4", /\.mp4$/i);
  const captions = rootRelative(site.video.captions, "SITE_VIDEO_CAPTIONS", /\.vtt$/i);
  return {
    ...baseConfig,
    poster: publicUrl(poster),
    sources: [
      { src: publicUrl(webm), type: "video/webm" },
      { src: publicUrl(mp4), type: "video/mp4" },
    ],
    captions: publicUrl(captions),
  };
};

export const validateVideoAssets = async (root) => {
  if (!site.video?.enabled) return;
  const paths = [
    rootRelative(site.video.poster, "SITE_VIDEO_POSTER", /\.(?:avif|webp|png|jpe?g)$/i),
    rootRelative(site.video.webm, "SITE_VIDEO_WEBM", /\.webm$/i),
    rootRelative(site.video.mp4, "SITE_VIDEO_MP4", /\.mp4$/i),
    rootRelative(site.video.captions, "SITE_VIDEO_CAPTIONS", /\.vtt$/i),
  ];
  const missing = [];
  for (const path of paths) {
    try {
      await access(sourcePath(root, path));
    } catch {
      missing.push(path);
    }
  }
  if (missing.length) {
    throw new Error(`Видео включено, но отсутствуют файлы:\n- ${missing.join("\n- ")}`);
  }
};