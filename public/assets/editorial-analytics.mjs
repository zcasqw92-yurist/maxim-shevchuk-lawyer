const publication = document.querySelector("[data-publication-kind]");

if (publication) {
  const body = document.body;
  const publicationKind = publication.dataset.publicationKind || "publication";
  const publicationId = publication.dataset.articleId || publication.dataset.caseId || "unknown";
  const yandexMetricaId = body.dataset.yandexMetricaId || "";
  const requiresConsent = body.dataset.analyticsRequiresConsent === "true";
  const analyticsEnabled = body.dataset.analyticsEnabled === "true";
  const sent = new Set();

  const consentGranted = () => {
    if (!analyticsEnabled) return false;
    if (!requiresConsent) return true;
    try {
      return localStorage.getItem("analytics_consent") === "granted";
    } catch {
      return false;
    }
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
    if (/^\d+$/.test(yandexMetricaId) && typeof window.ym === "function") {
      window.ym(Number(yandexMetricaId), "reachGoal", event, payload);
    }
    return true;
  };

  const trackOnce = (key, event, params = {}) => {
    if (sent.has(key)) return;
    if (track(event, params)) sent.add(key);
  };

  const trackView = () => trackOnce("view", "publication_view");
  trackView();
  document.querySelector("[data-consent-accept]")?.addEventListener("click", () => setTimeout(trackView, 0));

  const measureScroll = () => {
    const max = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    const percent = Math.min(100, Math.round((scrollY / max) * 100));
    for (const threshold of [25, 50, 75, 90, 100]) {
      if (percent >= threshold) {
        trackOnce(`scroll-${threshold}`, `publication_scroll_${threshold}`, { scroll_percent: threshold });
      }
    }
  };
  addEventListener("scroll", measureScroll, { passive: true });
  addEventListener("resize", measureScroll, { passive: true });
  measureScroll();

  let activeSeconds = 0;
  let recentActivity = true;
  const markActivity = () => { recentActivity = true; };
  for (const eventName of ["scroll", "pointerdown", "keydown", "touchstart"]) {
    addEventListener(eventName, markActivity, { passive: true });
  }
  setInterval(() => {
    if (document.visibilityState !== "visible" || !recentActivity) return;
    activeSeconds += 1;
    recentActivity = activeSeconds < 5;
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
    link.addEventListener("click", () => track("publication_related_click", { target_path: new URL(link.href, location.href).pathname }));
  });
  document.querySelectorAll(".editorial-cta [data-dialog-open], .editorial-intake [data-dialog-open]").forEach((button) => {
    button.addEventListener("click", () => track("publication_messenger_intent", { topic: button.dataset.topic || "general" }));
  });

  const helpfulness = document.querySelector("[data-editorial-helpfulness]");
  if (helpfulness) {
    const status = helpfulness.querySelector("[data-helpfulness-status]");
    helpfulness.querySelectorAll("[data-helpfulness-value]").forEach((button) => {
      button.addEventListener("click", () => {
        helpfulness.querySelectorAll("[data-helpfulness-value]").forEach((item) => {
          item.setAttribute("aria-pressed", String(item === button));
        });
        trackOnce("helpfulness", "publication_helpfulness", { value: button.dataset.helpfulnessValue || "unknown" });
        if (status) status.textContent = "Спасибо. Ответ учтён в обезличенной аналитике материала.";
      });
    });
  }
}
