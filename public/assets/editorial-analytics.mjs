const publication = document.querySelector("[data-publication-kind]");

if (publication) {
  const body = document.body;
  const publicationKind = publication.dataset.publicationKind || "publication";
  const publicationId = publication.dataset.articleId || publication.dataset.caseId || "unknown";
  const yandexMetricaId = body.dataset.yandexMetricaId || "";
  const requiresConsent = body.dataset.analyticsRequiresConsent === "true";
  const analyticsEnabled = body.dataset.analyticsEnabled === "true";
  const sent = new Set();
  const pendingYandexEvents = [];
  let flushTimer = 0;
  let flushAttempts = 0;

  const consentGranted = () => {
    if (!analyticsEnabled) return false;
    if (!requiresConsent) return true;
    try {
      return localStorage.getItem("analytics_consent") === "granted";
    } catch {
      return false;
    }
  };

  const canSendToYandex = () => /^\d+$/.test(yandexMetricaId) && typeof window.ym === "function";
  const flushPendingYandexEvents = () => {
    flushTimer = 0;
    if (!pendingYandexEvents.length) return;
    if (canSendToYandex()) {
      for (const item of pendingYandexEvents.splice(0)) {
        window.ym(Number(yandexMetricaId), "reachGoal", item.event, item.payload);
      }
      flushAttempts = 0;
      return;
    }
    flushAttempts += 1;
    if (flushAttempts < 40) flushTimer = window.setTimeout(flushPendingYandexEvents, 250);
  };
  const scheduleYandexFlush = () => {
    if (!flushTimer) flushTimer = window.setTimeout(flushPendingYandexEvents, 0);
  };

  const track = (event, params = {}) => {
    if (!consentGranted()) return false;
    const payload = {
      publication_id: publicationId,
      publication_kind: publicationKind,
      page_path: location.pathname,
      ...params,
    };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...payload });
    if (typeof window.gtag === "function") window.gtag("event", event, payload);
    if (canSendToYandex()) {
      window.ym(Number(yandexMetricaId), "reachGoal", event, payload);
    } else if (/^\d+$/.test(yandexMetricaId)) {
      pendingYandexEvents.push({ event, payload });
      scheduleYandexFlush();
    }
    return true;
  };

  const trackOnce = (key, event, params = {}) => {
    if (sent.has(key)) return false;
    const tracked = track(event, params);
    if (tracked) sent.add(key);
    return tracked;
  };

  const trackView = () => trackOnce("view", "publication_view");
  trackView();
  document.querySelector("[data-consent-accept]")?.addEventListener("click", () => {
    window.setTimeout(() => {
      trackView();
      scheduleYandexFlush();
    }, 0);
  });

  const measureScroll = () => {
    const rect = publication.getBoundingClientRect();
    const publicationTop = scrollY + rect.top;
    const publicationHeight = Math.max(publication.scrollHeight || rect.height, 1);
    const viewportBottom = scrollY + innerHeight;
    const percent = Math.min(100, Math.max(0, Math.round(((viewportBottom - publicationTop) / publicationHeight) * 100)));
    for (const threshold of [25, 50, 75, 90, 100]) {
      if (percent >= threshold) {
        trackOnce(`scroll-${threshold}`, `publication_scroll_${threshold}`, {
          scroll_percent: threshold,
          measurement_scope: "publication",
          measurement_version: 2,
        });
      }
    }
  };
  addEventListener("scroll", measureScroll, { passive: true });
  addEventListener("resize", measureScroll, { passive: true });
  measureScroll();

  let activeSeconds = 0;
  let lastActivityAt = Date.now();
  const activeGraceMs = 45_000;
  const markActivity = () => { lastActivityAt = Date.now(); };
  for (const eventName of ["scroll", "pointerdown", "keydown", "touchstart", "focus"]) {
    addEventListener(eventName, markActivity, { passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") markActivity();
  });
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastActivityAt > activeGraceMs) return;
    activeSeconds += 1;
    for (const threshold of [30, 60, 120]) {
      if (activeSeconds >= threshold) {
        trackOnce(`active-${threshold}`, `publication_active_${threshold}s`, { active_seconds: threshold });
      }
    }
  }, 1000);

  const sections = [...document.querySelectorAll("[data-article-section]")];
  if ("IntersectionObserver" in window && sections.length) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < .35) continue;
        const section = entry.target.dataset.articleSection || entry.target.id || "unknown";
        trackOnce(`section-${section}`, "publication_section_view", { section });
      }
    }, { threshold: [.35] });
    sections.forEach((section) => observer.observe(section));
  }

  document.querySelectorAll(".editorial-toc a").forEach((link) => {
    link.addEventListener("click", () => track("publication_toc_click", { target: link.getAttribute("href") || "" }));
  });
  document.querySelectorAll(".faq-item").forEach((item, index) => {
    item.addEventListener("toggle", () => {
      if (item.open) track("publication_faq_open", { item_index: index + 1 });
    });
  });
  document.querySelectorAll(".editorial-sources a").forEach((link) => {
    link.addEventListener("click", () => track("publication_source_click", { source_host: new URL(link.href).hostname }));
  });
  document.querySelectorAll(".editorial-related a, .editorial-card a").forEach((link) => {
    link.addEventListener("click", () => {
      const targetPath = new URL(link.href, location.href).pathname;
      track("publication_related_click", { target_path: targetPath });
      if (targetPath.startsWith("/praktika/")) track("publication_case_click", { target_path: targetPath });
      else if (targetPath.startsWith("/uslugi/")) track("publication_service_click", { target_path: targetPath });
      else if (targetPath.startsWith("/razbory/")) track("publication_article_click", { target_path: targetPath });
    });
  });
  document.querySelectorAll(".editorial-cta [data-dialog-open], .editorial-intake [data-dialog-open]").forEach((button) => {
    button.addEventListener("click", () => track("publication_messenger_intent", { topic: button.dataset.topic || "general" }));
  });

  const helpfulness = document.querySelector("[data-editorial-helpfulness]");
  if (helpfulness) {
    const status = helpfulness.querySelector("[data-helpfulness-status]");
    const buttons = [...helpfulness.querySelectorAll("[data-helpfulness-value]")];
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        if (helpfulness.dataset.submitted === "true") return;
        helpfulness.dataset.submitted = "true";
        buttons.forEach((item) => {
          item.setAttribute("aria-pressed", String(item === button));
          item.disabled = true;
        });
        const tracked = trackOnce("helpfulness", "publication_helpfulness", {
          value: button.dataset.helpfulnessValue || "unknown",
        });
        if (status) {
          status.textContent = tracked
            ? "Спасибо. Ответ учтён."
            : "Спасибо. Аналитика отключена.";
        }
      });
    });
  }
}
