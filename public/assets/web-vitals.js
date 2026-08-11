import { onCLS, onINP, onLCP } from "./vendor-web-vitals.js?v=6.0.0";

const sentMetricValues = new Set();
let observersStarted = false;

const analyticsReady = () => typeof window.gtag === "function" || typeof window.ym === "function";

export const reportWebVital = (metric) => {
  if (!metric || !Number.isFinite(metric.value) || metric.value < 0) return;
  const rounded = metric.name === "CLS"
    ? Math.round(metric.value * 1000) / 1000
    : Math.round(metric.value);
  const eventKey = `${metric.id || "unknown"}:${metric.name}:${rounded}`;
  if (sentMetricValues.has(eventKey)) return;

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

  let delivered = false;
  if (typeof window.gtag === "function") {
    window.gtag("event", "web_vital", params);
    delivered = true;
  }
  const metricaId = Number(document.body?.dataset.yandexMetricaId || 0);
  if (metricaId && typeof window.ym === "function") {
    window.ym(metricaId, "reachGoal", "web_vital", params);
    delivered = true;
  }
  if (delivered) sentMetricValues.add(eventKey);
};

export const startWebVitals = () => {
  if (observersStarted || typeof window === "undefined" || !("PerformanceObserver" in window) || !analyticsReady()) return false;
  observersStarted = true;
  try {
    onCLS(reportWebVital);
    onINP(reportWebVital);
    onLCP(reportWebVital);
    return true;
  } catch {
    observersStarted = false;
    return false;
  }
};

if (typeof window !== "undefined") {
  if (!startWebVitals() && typeof document?.addEventListener === "function") {
    document.addEventListener("analytics:ready", startWebVitals, { once: true });
  }
}
