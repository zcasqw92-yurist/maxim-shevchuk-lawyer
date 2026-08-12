import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { articles, practiceCases } from "../src/editorial-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = "4198";
const origin = `http://127.0.0.1:${port}`;
const requireBrowsers = process.env.CROSS_BROWSER_REQUIRED === "true";
const errors = [];
const skipped = [];

// Every article is a publication-layout gate target. A future article enters this
// matrix automatically as soon as it is added to the editorial registry.
const routes = [
  ...articles.map((article) => ({
    kind: "article",
    id: article.id,
    path: `/razbory/${article.slug}/`,
    container: ".editorial-body",
  })),
  // Keep one case route as a regression sentinel for the shared editorial rhythm.
  ...(practiceCases[0] ? [{
    kind: "case",
    id: practiceCases[0].id,
    path: `/praktika/${practiceCases[0].slug}/`,
    container: ".editorial-case-main",
  }] : []),
];
const viewports = [
  { width: 320, height: 844 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];

if (!articles.length) errors.push("Editorial rhythm contract: в реестре нет статей для layout gate");

const rhythmCss = await readFile(join(root, "src", "editorial-rhythm.css"), "utf8");
for (const token of ["--editorial-flow-xs", "--editorial-flow-sm", "--editorial-flow-md", "--editorial-flow-lg", "--editorial-flow-xl"]) {
  if (!rhythmCss.includes(token)) errors.push(`CSS rhythm contract: отсутствует ${token}`);
}
for (const selector of [
  ".editorial-answer + .article-section",
  ".editorial-intake + .editorial-message-guide",
  ".editorial-related + .editorial-related",
  ".editorial-body > .editorial-author",
  ".editorial-case-main > .editorial-author",
]) {
  if (!rhythmCss.includes(selector)) errors.push(`CSS rhythm contract: отсутствует ${selector}`);
}

const server = spawn(process.execPath, [join(root, "scripts", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Editorial rhythm preview server timeout")), 8_000);
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("Preview:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => reject(new Error(`Editorial rhythm preview server exited: ${code}`)));
});

const waitForLayout = (page) => page.evaluate(async () => {
  await document.fonts?.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

const inspectRhythm = ({ containerSelector, kind }) => {
  const resolveCssLength = (element, name) => {
    if (!element) return Number.NaN;
    const raw = getComputedStyle(element).getPropertyValue(name).trim();
    const clamp = raw.match(/^clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)$/);
    if (clamp) {
      const minimum = Number(clamp[1]);
      const preferred = innerWidth * Number(clamp[2]) / 100;
      const maximum = Number(clamp[3]);
      return Math.min(maximum, Math.max(minimum, preferred));
    }
    const pixels = raw.match(/^([\d.]+)px$/);
    return pixels ? Number(pixels[1]) : Number.NaN;
  };

  const pageRoot = document.querySelector(kind === "article" ? ".article-page" : ".case-page") || document.body;
  const articleRoot = document.querySelector(".editorial-article");
  const flow = {
    xs: resolveCssLength(pageRoot, "--editorial-flow-xs"),
    sm: resolveCssLength(pageRoot, "--editorial-flow-sm"),
    md: resolveCssLength(pageRoot, "--editorial-flow-md"),
    lg: resolveCssLength(pageRoot, "--editorial-flow-lg"),
    xl: resolveCssLength(pageRoot, "--editorial-flow-xl"),
  };
  const compact = {
    space: resolveCssLength(articleRoot, "--editorial-c139-space"),
    section: resolveCssLength(articleRoot, "--editorial-c139-section-space"),
  };

  const container = document.querySelector(containerSelector);
  if (!container) return { missingContainer: true, flow, compact };

  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.height > 0 && rect.width > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const label = (element) => {
    if (element.classList.contains("editorial-answer")) return "answer";
    if (element.classList.contains("editorial-author")) return "author";
    if (element.classList.contains("editorial-intake")) return "intake";
    if (element.classList.contains("editorial-message-guide")) return "message-guide";
    if (element.classList.contains("editorial-related")) return `related:${element.id || "none"}`;
    if (element.classList.contains("article-section")) return `section:${element.id || element.querySelector("h2")?.textContent.trim() || "none"}`;
    return element.className || element.tagName.toLowerCase();
  };

  const children = [...container.children].filter(visible);
  const topLevel = children.map((element, index) => {
    const rect = element.getBoundingClientRect();
    const previous = children[index - 1];
    const previousRect = previous?.getBoundingClientRect();
    return {
      label: label(element),
      isSection: element.classList.contains("article-section"),
      className: element.className,
      top: rect.top,
      bottom: rect.bottom,
      gapBefore: previousRect ? rect.top - previousRect.bottom : null,
      previousLabel: previous ? label(previous) : null,
    };
  });

  const headings = [...container.querySelectorAll(".article-section > h2")].filter(visible).map((heading) => {
    const next = heading.nextElementSibling;
    const headingRect = heading.getBoundingClientRect();
    const nextRect = next?.getBoundingClientRect();
    return {
      text: heading.textContent.trim(),
      gapAfter: nextRect ? nextRect.top - headingRect.bottom : null,
    };
  });

  const paragraphs = [...container.querySelectorAll(".article-section > p + p")].filter(visible).map((paragraph) => {
    const previousRect = paragraph.previousElementSibling.getBoundingClientRect();
    const rect = paragraph.getBoundingClientRect();
    return { text: paragraph.textContent.trim().slice(0, 60), gapBefore: rect.top - previousRect.bottom };
  });

  const embeddedBlocks = [...container.querySelectorAll(
    ".article-section > .editorial-options, .article-section > .editorial-note, .article-section > .editorial-micro-cta",
  )].filter(visible).map((block) => {
    const rect = block.getBoundingClientRect();
    const previous = block.previousElementSibling;
    const previousRect = previous?.getBoundingClientRect();
    return {
      className: block.className,
      gapBefore: previousRect ? rect.top - previousRect.bottom : null,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      clientWidth: block.clientWidth,
      scrollWidth: block.scrollWidth,
    };
  });

  const faqItems = [...container.querySelectorAll(".faq-list .faq-item")].filter(visible).map((item) => {
    const rect = item.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      clientWidth: item.clientWidth,
      scrollWidth: item.scrollWidth,
    };
  });

  const relatedBlocks = [...container.querySelectorAll(".editorial-related")].filter(visible).map((item) => {
    const rect = item.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      clientWidth: item.clientWidth,
      scrollWidth: item.scrollWidth,
    };
  });

  const directChildOverlaps = [...container.querySelectorAll(".article-section")].filter(visible).flatMap((section) => {
    const blockChildren = [...section.children].filter(visible);
    return blockChildren.slice(1).map((current, index) => {
      const previous = blockChildren[index];
      const previousRect = previous.getBoundingClientRect();
      const currentRect = current.getBoundingClientRect();
      return {
        section: section.id || section.querySelector("h2")?.textContent.trim() || "none",
        previous: previous.className || previous.tagName.toLowerCase(),
        current: current.className || current.tagName.toLowerCase(),
        gap: currentRect.top - previousRect.bottom,
      };
    });
  });

  const tailCandidates = kind === "case"
    ? [container.lastElementChild, document.querySelector(".editorial-case-aside")]
    : [children.at(-1)];
  const visibleTailBottoms = tailCandidates
    .filter(Boolean)
    .filter(visible)
    .map((element) => element.getBoundingClientRect().bottom);
  const tailBottom = visibleTailBottoms.length ? Math.max(...visibleTailBottoms) : null;
  const helpfulness = document.querySelector("[data-editorial-helpfulness]");
  const cta = document.querySelector(".editorial-cta");
  const helpfulnessRect = helpfulness?.getBoundingClientRect();
  const ctaRect = cta?.getBoundingClientRect();

  return {
    missingContainer: false,
    flow,
    compact,
    topLevel,
    headings,
    paragraphs,
    embeddedBlocks,
    faqItems,
    relatedBlocks,
    directChildOverlaps,
    tailGap: tailBottom !== null && helpfulnessRect ? helpfulnessRect.top - tailBottom : null,
    ctaGap: helpfulnessRect && ctaRect ? ctaRect.top - helpfulnessRect.bottom : null,
    overflow: Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.body.scrollWidth - innerWidth,
    ),
    viewportWidth: innerWidth,
    containerBounds: (() => {
      const rect = container.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    })(),
  };
};

const closeTo = (actual, expected, tolerance = 3) => Number.isFinite(actual)
  && Number.isFinite(expected)
  && Math.abs(actual - expected) <= tolerance;
const finiteOr = (candidate, fallback) => Number.isFinite(candidate) ? candidate : fallback;

try {
  for (const [engineName, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
    const executablePath = engine.executablePath();
    const installed = await access(executablePath).then(() => true).catch(() => false);
    if (!installed) {
      const message = `${engineName}: browser binary is not installed at ${executablePath}`;
      if (requireBrowsers) errors.push(message);
      else skipped.push(message);
      continue;
    }

    const browser = await engine.launch({
      headless: true,
      ...(engineName === "Chromium" ? { args: ["--no-sandbox"] } : {}),
    });
    try {
      for (const viewport of viewports) {
        for (const route of routes) {
          const context = await browser.newContext({ viewport, locale: "ru-RU", reducedMotion: "reduce" });
          await context.addInitScript(() => {
            localStorage.setItem("analytics_consent", "denied");
            sessionStorage.setItem("site_engagement_nudge_shown", "true");
          });
          const page = await context.newPage();
          const response = await page.goto(`${origin}${route.path}`, { waitUntil: "networkidle" });
          if (!response?.ok()) errors.push(`${engineName} ${viewport.width}px ${route.path}: status ${response?.status()}`);
          await waitForLayout(page);

          const state = await page.evaluate(inspectRhythm, { containerSelector: route.container, kind: route.kind });
          const prefix = `${engineName} ${viewport.width}px ${route.path}`;
          if (state.missingContainer) {
            errors.push(`${prefix}: missing ${route.container}`);
            await context.close();
            continue;
          }
          if (state.overflow > 1) errors.push(`${prefix}: ${state.overflow}px horizontal overflow`);
          if (Object.values(state.flow).some((value) => !Number.isFinite(value) || value <= 0)) {
            errors.push(`${prefix}: rhythm tokens are invalid ${JSON.stringify(state.flow)}`);
          }

          const compactSection = finiteOr(state.compact.section, Number.NaN);
          const compactSpace = finiteOr(state.compact.space, Number.NaN);
          const sectionGap = finiteOr(compactSection, state.flow.lg);
          const headingGap = finiteOr(compactSpace, state.flow.sm);
          const paragraphGap = finiteOr(compactSpace, state.flow.xs);
          const embeddedGap = finiteOr(compactSpace, state.flow.sm);
          const authorGap = finiteOr(compactSection, state.flow.xl);
          const relatedPairGap = finiteOr(compactSection, state.flow.md);

          for (const item of state.topLevel.slice(1)) {
            let expected = state.flow.lg;
            if (item.isSection) expected = sectionGap;
            if (item.label === "author") expected = authorGap;
            else if (item.previousLabel === "intake" && item.label === "message-guide") expected = state.flow.md;
            else if (item.previousLabel?.startsWith("related:") && item.label.startsWith("related:")) expected = relatedPairGap;
            if (!closeTo(item.gapBefore, expected)) {
              errors.push(`${prefix}: wrong top-level gap ${JSON.stringify({ item, expected, flow: state.flow, compact: state.compact })}`);
            }
          }

          for (const heading of state.headings) {
            if (!closeTo(heading.gapAfter, headingGap)) {
              errors.push(`${prefix}: wrong heading gap ${JSON.stringify({ heading, expected: headingGap })}`);
            }
          }
          for (const paragraph of state.paragraphs) {
            if (!closeTo(paragraph.gapBefore, paragraphGap)) {
              errors.push(`${prefix}: wrong paragraph gap ${JSON.stringify({ paragraph, expected: paragraphGap })}`);
            }
          }

          for (const block of state.embeddedBlocks) {
            if (!Number.isFinite(block.gapBefore) || block.gapBefore < -1) {
              errors.push(`${prefix}: embedded block overlaps previous content ${JSON.stringify(block)}`);
            }
            if (!closeTo(block.gapBefore, embeddedGap, 4)) {
              errors.push(`${prefix}: wrong NOTE/options/micro-CTA gap ${JSON.stringify({ block, expected: embeddedGap })}`);
            }
            if (block.scrollWidth - block.clientWidth > 1) {
              errors.push(`${prefix}: embedded block has internal horizontal overflow ${JSON.stringify(block)}`);
            }
          }

          for (const overlap of state.directChildOverlaps) {
            if (overlap.gap < -1) errors.push(`${prefix}: article block overlap ${JSON.stringify(overlap)}`);
          }

          for (const [kind, blocks] of [["FAQ", state.faqItems], ["RELATED", state.relatedBlocks]]) {
            for (const block of blocks) {
              if (block.scrollWidth - block.clientWidth > 1) {
                errors.push(`${prefix}: ${kind} block has internal horizontal overflow ${JSON.stringify(block)}`);
              }
              if (block.left < state.containerBounds.left - 1 || block.right > state.containerBounds.right + 1) {
                errors.push(`${prefix}: ${kind} block escapes editorial column ${JSON.stringify({ block, bounds: state.containerBounds })}`);
              }
            }
          }

          if (!closeTo(state.tailGap, state.flow.xl, 4)) {
            errors.push(`${prefix}: content-to-feedback gap is inconsistent ${JSON.stringify({ actual: state.tailGap, expected: state.flow.xl })}`);
          }
          if (!closeTo(state.ctaGap, state.flow.md, 4)) {
            errors.push(`${prefix}: feedback-to-CTA gap is inconsistent ${JSON.stringify({ actual: state.ctaGap, expected: state.flow.md })}`);
          }

          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill("SIGTERM");
}

for (const message of skipped) console.warn(`Editorial rhythm local skip: ${message}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}

console.log(
  `Editorial publication layout gate passed: ${articles.length} articles checked for section/block rhythm, NOTE/options/micro-CTA, FAQ, RELATED, page ending and overflow across Chromium and WebKit at ${viewports.map(({ width }) => width).join("/")}px`,
);
