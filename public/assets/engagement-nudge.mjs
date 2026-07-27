const SESSION_KEY = "site_engagement_nudge_shown";
const DEFAULT_DELAY_MS = 60_000;
const AUTO_HIDE_MS = 20_000;
const BLOCKED_RETRY_MS = 1_000;

const safeSessionGet = () => {
  try { return sessionStorage.getItem(SESSION_KEY) === "true"; } catch { return false; }
};

const safeSessionSet = () => {
  try { sessionStorage.setItem(SESSION_KEY, "true"); } catch { /* storage may be unavailable */ }
};

const visibleConsentBanner = () => {
  const banner = document.querySelector("[data-consent-banner]");
  return Boolean(banner && !banner.hidden);
};

const hasBlockingInterface = () => Boolean(
  document.visibilityState !== "visible"
  || document.documentElement.classList.contains("mobile-menu-open")
  || document.querySelector("dialog[open]")
  || visibleConsentBanner()
  || document.activeElement?.matches("input, textarea, select, [contenteditable='true']")
);

export const startEngagementNudge = () => {
  const nudge = document.querySelector("#engagement-nudge");
  const writeButton = document.querySelector("#engagement-nudge-write");
  if (!nudge || !writeButton || safeSessionGet()) return;

  const configuredDelay = Number(window.__SITE_TEST_ENGAGEMENT_DELAY_MS__);
  const delayMs = Number.isFinite(configuredDelay) && configuredDelay >= 0 ? configuredDelay : DEFAULT_DELAY_MS;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let elapsedVisibleMs = 0;
  let previousTick = performance.now();
  let shownInMemory = false;
  let intervalId = 0;
  let hideTimer = 0;

  const markShown = () => {
    shownInMemory = true;
    safeSessionSet();
  };

  const finalizeHide = () => {
    nudge.hidden = true;
    nudge.classList.remove("is-visible");
  };

  const hideNudge = ({ immediate = false } = {}) => {
    clearTimeout(hideTimer);
    nudge.classList.remove("is-visible");
    if (immediate || reducedMotion) finalizeHide();
    else setTimeout(finalizeHide, 220);
  };

  const scheduleAutoHide = () => {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (nudge.matches(":hover") || nudge.contains(document.activeElement)) {
        scheduleAutoHide();
        return;
      }
      hideNudge();
    }, AUTO_HIDE_MS);
  };

  const showNudge = () => {
    if (shownInMemory || safeSessionGet() || hasBlockingInterface()) return false;
    markShown();
    clearInterval(intervalId);
    nudge.hidden = false;
    requestAnimationFrame(() => nudge.classList.add("is-visible"));
    scheduleAutoHide();
    return true;
  };

  const tick = () => {
    const now = performance.now();
    if (document.visibilityState === "visible") elapsedVisibleMs += now - previousTick;
    previousTick = now;
    if (elapsedVisibleMs < delayMs) return;
    if (!showNudge()) window.setTimeout(showNudge, BLOCKED_RETRY_MS);
  };

  const tickInterval = Math.min(1_000, Math.max(50, Math.round(delayMs / 4) || 50));
  intervalId = window.setInterval(tick, tickInterval);

  document.addEventListener("visibilitychange", () => { previousTick = performance.now(); });

  const suppressForSession = ({ immediate = false } = {}) => {
    if (!shownInMemory) markShown();
    clearInterval(intervalId);
    if (!nudge.hidden) hideNudge({ immediate });
  };

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest("#engagement-nudge-write")) {
      suppressForSession({ immediate: true });
      requestAnimationFrame(() => document.querySelector("[data-mobile-contact-now]")?.click());
      return;
    }

    if (target.closest(".engagement-nudge__close, .engagement-nudge__dismiss")) {
      suppressForSession();
      return;
    }

    if (target.closest("[data-dialog-open], [data-callback-open], [data-price-quiz-open], [data-track='telegram'], [data-track='whatsapp']")) {
      suppressForSession({ immediate: true });
    }
  }, { capture: true });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !nudge.hidden) suppressForSession();
  });
};

startEngagementNudge();
