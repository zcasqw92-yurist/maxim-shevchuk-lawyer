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

const videoDialog = document.querySelector("#video-placeholder-dialog");
document.querySelector("[data-video-placeholder]")?.addEventListener("click", () => {
  videoDialog?.showModal();
  proofTrack("video_placeholder_open", { page_path: location.pathname });
});
document.querySelector("[data-video-placeholder-close]")?.addEventListener("click", () => {
  videoDialog?.close();
  proofTrack("video_placeholder_close", { page_path: location.pathname, close_method: "button" });
});
videoDialog?.addEventListener("click", (event) => {
  if (event.target !== videoDialog) return;
  videoDialog.close();
  proofTrack("video_placeholder_close", { page_path: location.pathname, close_method: "backdrop" });
});
document.querySelector("[data-video-contact]")?.addEventListener("click", () => {
  proofTrack("video_placeholder_contact", { page_path: location.pathname });
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