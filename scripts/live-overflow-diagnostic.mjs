import { webkit } from "playwright";

const url = "https://yuristshevchuk.com/razbory/plokho-pokrasili-mashinu-v-avtoservise/?overflow_debug=1";
const browser = await webkit.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.setItem("analytics_consent", "denied");
    sessionStorage.setItem("site_engagement_nudge_shown", "true");
  });
  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!response?.ok()) throw new Error(`Navigation failed: ${response?.status() || "no response"}`);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready);

  const report = await page.evaluate(() => {
    const selectorFor = (element) => {
      const parts = [];
      let node = element;
      while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
        let part = node.tagName.toLowerCase();
        if (node.id) {
          part += `#${node.id}`;
          parts.unshift(part);
          break;
        }
        const classes = [...node.classList].slice(0, 3);
        if (classes.length) part += `.${classes.join(".")}`;
        const parent = node.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((item) => item.tagName === node.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
        parts.unshift(part);
        node = parent;
      }
      return parts.join(" > ");
    };

    const viewportWidth = innerWidth;
    const offenders = [...document.querySelectorAll("*")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          selector: selectorFor(element),
          tag: element.tagName,
          left: Number(rect.left.toFixed(2)),
          right: Number(rect.right.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          display: style.display,
          position: style.position,
          overflowX: style.overflowX,
          whiteSpace: style.whiteSpace,
          minWidth: style.minWidth,
          maxWidth: style.maxWidth,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          marginLeft: style.marginLeft,
          marginRight: style.marginRight,
          text: String(element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
        };
      })
      .filter((item) => item.right > viewportWidth + 1 || item.left < -1 || item.scrollWidth > item.clientWidth + 1)
      .sort((a, b) => Math.max(b.right - viewportWidth, b.scrollWidth - b.clientWidth) - Math.max(a.right - viewportWidth, a.scrollWidth - a.clientWidth));

    return {
      innerWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyRect: document.body.getBoundingClientRect().toJSON(),
      offenders: offenders.slice(0, 40),
    };
  });

  console.log(JSON.stringify(report, null, 2));
  if (Math.max(report.rootScrollWidth, report.bodyScrollWidth) <= report.innerWidth + 1.5) {
    console.log("No reproducible horizontal overflow.");
  }
} finally {
  await browser.close();
}
