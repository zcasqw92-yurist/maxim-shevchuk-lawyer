(() => {
  if (!("PerformanceObserver" in window)) return;
  const supported = PerformanceObserver.supportedEntryTypes || [];
  const metrics = { lcp: 0, cls: 0, inp: 0 };
  const interactions = new Map();
  let reported = false;

  const rating = (name, value) => {
    if (name === "LCP") return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
    if (name === "CLS") return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
    return value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
  };

  const send = (name, value) => {
    if (!value || !Number.isFinite(value)) return;
    const rounded = name === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value);
    const params = {
      metric_name: name,
      metric_value: rounded,
      metric_rating: rating(name, value),
      page_path: location.pathname,
      navigation_type: performance.getEntriesByType("navigation")[0]?.type || "navigate",
    };
    if (typeof window.gtag === "function") window.gtag("event", "web_vital", params);
    const metricaId = Number(document.body.dataset.yandexMetricaId || 0);
    if (metricaId && typeof window.ym === "function") window.ym(metricaId, "reachGoal", "web_vital", params);
  };

  const report = () => {
    if (reported) return;
    reported = true;
    send("LCP", metrics.lcp);
    send("CLS", metrics.cls);
    send("INP", metrics.inp);
  };

  try {
    if (supported.includes("largest-contentful-paint")) {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) metrics.lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    }

    if (supported.includes("layout-shift")) {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) metrics.cls += entry.value;
        });
      }).observe({ type: "layout-shift", buffered: true });
    }

    if (supported.includes("event")) {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (!entry.interactionId) return;
          interactions.set(entry.interactionId, Math.max(interactions.get(entry.interactionId) || 0, entry.duration));
        });
        const latencies = [...interactions.values()].sort((a, b) => b - a);
        const index = Math.min(Math.floor(latencies.length / 50), Math.max(latencies.length - 1, 0));
        metrics.inp = latencies[index] || 0;
      }).observe({ type: "event", buffered: true, durationThreshold: 40 });
    }
  } catch {
    // Unsupported observer options must never affect site interactions.
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") report();
  });
  addEventListener("pagehide", report, { once: true });
})();