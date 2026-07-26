import { onCLS, onINP, onLCP } from "./vendor-web-vitals.js?v=6.0.0";

const sentMetricValues = new Set();

export const reportWebVital = (metric) => {
  if (!metric || !Number.isFinite(metric.value) || metric.value < 0) return;
  const rounded = metric.name === "CLS"
    ? Math.round(metric.value * 1000) / 1000
    : Math.round(metric.value);
  const eventKey = `${metric.id || "unknown"}:${metric.name}:${rounded}`;
  if (sentMetricValues.has(eventKey)) return;
  sentMetricValues.add(eventKey);

  const params = {
    metric_id: metric.id,
    metric_name: metric.name,
    metric_value: rounded,
    metric_delta: metric.name === "CLS"
      ? Math.round((metric.delta || 0) * 1000) / 1000
      : Math.round(metric.delta || 0),
    metric_rating: metric.rating,
    page_path: location.pathname,
    navigation_type: metric.navigationType || "navigate",
  };

  if (typeof window.gtag === "function") {
    window.gtag("event", "web_vital", params);
  }
  const metricaId = Number(document.body?.dataset.yandexMetricaId || 0);
  if (metricaId && typeof window.ym === "function") {
    window.ym(metricaId, "reachGoal", "web_vital", params);
  }
};

if (typeof window !== "undefined" && "PerformanceObserver" in window) {
  try {
    onCLS(reportWebVital);
    onINP(reportWebVital);
    onLCP(reportWebVital);
  } catch {
    // Metrics must never affect site interactions in unsupported browsers.
  }
}
