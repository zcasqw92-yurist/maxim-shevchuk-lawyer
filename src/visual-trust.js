const proofTrack = (event, params = {}) => {
  if (document.body.dataset.analyticsEnabled !== "true") return;
  if (typeof window.gtag === "function") window.gtag("event", event, params);
  const metricaId = Number(document.body.dataset.yandexMetricaId || 0);
  if (metricaId && typeof window.ym === "function") window.ym(metricaId, "reachGoal", event, params);
};

const moscowHour = () => {
  try {
    const hour = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .find((part) => part.type === "hour")?.value;
    return Number(hour);
  } catch {
    return new Date().getHours();
  }
};

// Keeps the existing online-status design, but aligns every label to 08:00–22:00 MSK.
const syncOnlineStatus = () => {
  const online = moscowHour() >= 8 && moscowHour() < 22;
  document.querySelectorAll("[data-online-status]").forEach((status) => {
    status.classList.toggle("is-offline", !online);
    const label = status.querySelector("[data-online-label]");
    if (label) label.textContent = status.classList.contains("header__online")
      ? (online ? "Юрист онлайн" : "Юрист офлайн")
      : (online ? "На связи в мессенджерах" : "Сейчас офлайн · отвечу после 08:00 МСК");
    if (status.classList.contains("header__online")) {
      status.setAttribute("aria-label", `${online ? "Юрист онлайн" : "Юрист офлайн"} — задать вопрос`);
    }
  });
};

syncOnlineStatus();
setInterval(syncOnlineStatus, 10_000);

const motionAllowed = !matchMedia("(prefers-reduced-motion: reduce)").matches;
if (motionAllowed && "IntersectionObserver" in window) {
  document.documentElement.dataset.proofMotion = "ready";
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-proof-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: .08 });
  document.querySelectorAll(".proof-reveal").forEach((element) => revealObserver.observe(element));
}

const videoDialog = document.querySelector("[data-video-dialog]");
const videoLauncher = document.querySelector("[data-video-launch]");
const videoStage = videoDialog?.querySelector("[data-video-stage]");
const videoLoading = videoDialog?.querySelector("[data-video-loading]");
const videoEyebrow = videoDialog?.querySelector("[data-video-eyebrow]");
const videoTitle = videoDialog?.querySelector("[data-video-title]");
const videoDescription = videoDialog?.querySelector("[data-video-description]");
const videoContact = videoDialog?.querySelector("[data-video-contact]");
let activeVideo = null;
let videoConfigPromise = null;
let videoInitialized = false;

const safeLocalUrl = (value) => {
  const url = new URL(String(value || ""), location.href);
  if (url.origin !== location.origin) throw new Error("Video asset must use the site origin");
  return url.toString();
};

const loadVideoConfig = () => {
  if (videoConfigPromise) return videoConfigPromise;
  const configUrl = safeLocalUrl(videoLauncher?.dataset.videoConfigUrl || "/video-config.json");
  videoConfigPromise = fetch(configUrl, { cache: "no-store", credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error(`Video config returned ${response.status}`);
      return response.json();
    });
  return videoConfigPromise;
};

const bindVideoProgress = (video) => {
  const reached = new Set();
  const milestones = [25, 50, 75];
  video.addEventListener("play", () => proofTrack("video_play", { page_path: location.pathname }), { once: true });
  video.addEventListener("timeupdate", () => {
    if (!video.duration || !Number.isFinite(video.duration)) return;
    const progress = (video.currentTime / video.duration) * 100;
    milestones.forEach((milestone) => {
      if (progress < milestone || reached.has(milestone)) return;
      reached.add(milestone);
      proofTrack("video_progress", { milestone, page_path: location.pathname });
    });
  });
  video.addEventListener("ended", () => proofTrack("video_complete", { page_path: location.pathname }), { once: true });
};

const initializeRealVideo = (config) => {
  if (videoInitialized || !videoStage || !config?.enabled) return false;
  const sources = Array.isArray(config.sources) ? config.sources : [];
  if (!sources.length) throw new Error("Video config has no sources");

  const video = document.createElement("video");
  video.className = "video-ready-dialog__player";
  video.controls = true;
  video.playsInline = true;
  video.preload = "none";
  video.poster = safeLocalUrl(config.poster);
  video.setAttribute("aria-label", String(config.title || "Личное обращение Максима Юрьевича"));

  sources.forEach((item) => {
    const source = document.createElement("source");
    source.src = safeLocalUrl(item.src);
    source.type = String(item.type || "");
    video.append(source);
  });

  if (config.captions) {
    const track = document.createElement("track");
    track.kind = "captions";
    track.label = "Русские субтитры";
    track.srclang = "ru";
    track.src = safeLocalUrl(config.captions);
    track.default = true;
    video.append(track);
  }

  videoStage.replaceChildren(video);
  if (videoEyebrow) videoEyebrow.textContent = `Личное обращение · ${config.durationLabel || "короткое видео"}`;
  if (videoTitle) videoTitle.textContent = String(config.title || "Не знаете, с чего начать?");
  if (videoDescription) videoDescription.textContent = "После просмотра можно сразу описать ситуацию и приложить имеющиеся документы.";
  if (videoContact) videoContact.firstChild.textContent = "Описать ситуацию после просмотра";
  activeVideo = video;
  videoInitialized = true;
  bindVideoProgress(video);
  proofTrack("video_ready", { page_path: location.pathname });
  video.play().catch(() => { /* Controls remain available when autoplay after fetch is blocked. */ });
  return true;
};

videoLauncher?.addEventListener("click", async () => {
  videoDialog?.showModal();
  proofTrack("video_placeholder_open", { page_path: location.pathname });
  if (videoInitialized) {
    activeVideo?.play().catch(() => {});
    return;
  }
  if (videoLoading) videoLoading.hidden = false;
  try {
    const config = await loadVideoConfig();
    if (config?.enabled) initializeRealVideo(config);
    else proofTrack("video_placeholder_unavailable", { page_path: location.pathname });
  } catch (error) {
    videoConfigPromise = null;
    if (videoDescription) videoDescription.textContent = "Видео временно недоступно. Можно сразу описать ситуацию — Максим Юрьевич ознакомится с сообщением лично.";
    proofTrack("video_load_error", { page_path: location.pathname });
    console.warn("Video initialization failed", error);
  } finally {
    if (videoLoading) videoLoading.hidden = true;
  }
});

const closeVideoDialog = (method) => {
  activeVideo?.pause();
  videoDialog?.close();
  proofTrack("video_placeholder_close", { page_path: location.pathname, close_method: method });
};
videoDialog?.querySelector("[data-video-close]")?.addEventListener("click", () => closeVideoDialog("button"));
videoDialog?.addEventListener("click", (event) => {
  if (event.target === videoDialog) closeVideoDialog("backdrop");
});
videoContact?.addEventListener("click", () => {
  proofTrack("video_placeholder_contact", { page_path: location.pathname });
  activeVideo?.pause();
  videoDialog?.close();
}, true);

const closeProofDialog = (dialog, closeMethod = "button") => {
  if (!dialog?.open) return;
  const sample = dialog.dataset.proofDialog || "unknown";
  dialog.close();
  proofTrack("document_sample_close", { sample, page_path: location.pathname, close_method: closeMethod });
};

document.querySelectorAll("[data-proof-open]").forEach((control) => {
  control.addEventListener("click", () => {
    const id = control.dataset.proofOpen;
    const dialog = document.querySelector(`[data-proof-dialog="${CSS.escape(id)}"]`);
    dialog?.showModal();
    proofTrack("document_sample_open", { sample: id, page_path: location.pathname });
  });
});

document.querySelectorAll("[data-proof-dialog]").forEach((dialog) => {
  dialog.querySelector("[data-proof-close]")?.addEventListener("click", () => closeProofDialog(dialog));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeProofDialog(dialog, "backdrop");
  });
  dialog.querySelector("[data-dialog-open]")?.addEventListener("click", () => {
    proofTrack("document_sample_contact", { sample: dialog.dataset.proofDialog || "unknown", page_path: location.pathname });
    closeProofDialog(dialog, "contact");
  }, true);
});

document.querySelectorAll(".visual-case details").forEach((details) => {
  details.addEventListener("toggle", () => {
    if (!details.open) return;
    const title = details.closest(".visual-case")?.querySelector("h3")?.textContent?.trim() || "unknown";
    proofTrack("case_details_open", { case_title: title, page_path: location.pathname });
  });
});

document.querySelector(".about-proof")?.addEventListener("click", () => {
  proofTrack("education_proof_open", { page_path: location.pathname });
});

document.querySelector("[data-map-load]")?.addEventListener("click", (event) => {
  const button = event.currentTarget;
  const iframe = document.createElement("iframe");
  iframe.src = "https://yandex.ru/map-widget/v1/?z=12&ol=biz&oid=118077889231";
  iframe.width = "560";
  iframe.height = "400";
  iframe.loading = "lazy";
  iframe.title = "Офис юридической практики Максима Шевчука на Яндекс Картах";
  iframe.dataset.dynamicMap = "true";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  button.replaceWith(iframe);
  proofTrack("office_map_load", { page_path: location.pathname });
}, { once: true });