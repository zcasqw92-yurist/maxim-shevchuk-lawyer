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
const routes = [
  ...articles.map((item) => ({
    kind: "article",
    id: item.id,
    path: `/razbory/${item.slug}/`,
    container: ".editorial-body",
    expectedSections: item.sections.length,
    expectedFaq: item.faq?.length || 0,
  })),
  ...(practiceCases[0] ? [{
    kind: "case",
    id: practiceCases[0].id,
    path: `/praktika/${practiceCases[0].slug}/`,
    container: ".editorial-case-main",
    expectedSections: null,
    expectedFaq: 0,
  }] : []),
];
const viewports = [
  { width: 320, height: 844 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];

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
  const parseLength = (raw) => {
    const value = String(raw || "").trim();
    const clamp = value.match(/^clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)$/);
    if (clamp) {
      const minimum = Number(clamp[1]);
      const preferred = innerWidth * Number(clamp[2]) / 100;
      const maximum = Number(clamp[3]);
      return Math.min(maximum, Math.max(minimum, preferred));
    }
    const pixels = value.match(/^([\d.]+)px$/);
    return pixels ? Number(pixels[1]) : Number.NaN;
  };
  const root = kind === "article"
    ? document.querySelector(".editorial-article")
    : document.body;
  const rootStyle = getComputedStyle(root || document.body);
  const resolveToken = (name) => parseLength(rootStyle.getPropertyValue(name));
  const flow = {
    xs: resolveToken("--editorial-flow-xs"),
    sm: resolveToken("--editorial-flow-sm"),
    md: resolveToken("--editorial-flow-md"),
    lg: resolveToken("--editorial-flow-lg"),
    xl: resolveToken("--editorial-flow-xl"),
  };
  const compactSpace = parseLength(rootStyle.getPropertyValue("--editorial-c139-space"));
  const compactSectionSpace = parseLength(rootStyle.getPropertyValue("--editorial-c139-section-space"));
  const sectionGap = Number.isFinite(compactSectionSpace) ? compactSectionSpace : flow.lg;
  const headingGap = Number.isFinite(compactSpace) ? compactSpace : flow.sm;
  const paragraphGap = Number.isFinite(compactSpace) ? compactSpace : flow.xs;
  const insetBlockGap = Number.isFinite(compactSpace) ? compactSpace : flow.sm;

  const container = document.querySelector(containerSelector);
  const children = [...container.children].filter((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  });
  const label = (element) => {
    if (element.classList.contains("editorial-answer")) return "answer";
    if (element.classList.contains("editorial-author")) return "author";
    if (element.classList.contains("editorial-intake")) return "intake";
    if (element.classList.contains("editorial-message-guide")) return "message-guide";
    if (element.classList.contains("editorial-related")) return `related:${element.id || "none"}`;
    if (element.classList.contains("article-section")) return `section:${element.id || element.querySelector("h2")?.textContent.trim() || "none"}`;
    return element.className || element.tagName.toLowerCase();
  };
  const topLevel = children.map((element, index) => {
    const rect = element.getBoundingClientRect();
    const previous = children[index - 1];
    const previousRect = previous?.getBoundingClientRect();
    return {
      label: label(element),
      className: element.className,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      gapBefore: previousRect ? rect.top - previousRect.bottom : null,
      previousLabel: previous ? label(previous) : null,
    };
  });
  const headings = [...container.querySelectorAll(".article-section > h2")].map((heading) => {
    const next = heading.nextElementSibling;
    const headingRect = heading.getBoundingClientRect();
    const nextRect = next?.getBoundingClientRect();
    return {
      text: heading.textContent.trim(),
      gapAfter: nextRect ? nextRect.top - headingRect.bottom : null,
    };
  });
  const paragraphs = [...container.querySelectorAll(".article-section > p + p")].map((paragraph) => {
    const previousRect = paragraph.previousElementSibling.getBoundingClientRect();
    const rect = paragraph.getBoundingClientRect();
    return { text: paragraph.textContent.trim().slice(0, 60), gapBefore: rect.top - previousRect.bottom };
  });
  const insetBlocks = [...container.querySelectorAll(".article-section :is(.editorial-options, .editorial-note, .editorial-micro-cta)")]
    .filter((element) => {
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().height > 0 && style.display !== "none" && style.visibility !== "hidden";
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const previous = element.previousElementSibling;
      const previousRect = previous?.getBoundingClientRect();
      return {
        type: element.className,
        gapBefore: previousRect ? rect.top - previousRect.bottom : null,
        left: rect.left,
        right: rect.right,
      };
    });

  const required = {
    header: Boolean(document.querySelector(".editorial-article__header")),
    toc: kind !== "article" || Boolean(document.querySelector(".editorial-toc")),
    answer: kind !== "article" || Boolean(container.querySelector(".editorial-answer")),
    author: Boolean(container.querySelector(".editorial-author")),
    helpfulness: Boolean(document.querySelector("[data-editorial-helpfulness]")),
    cta: Boolean(document.querySelector(".editorial-cta")),
  };
  const structuralCounts = {
    sections: container.querySelectorAll("[data-article-section]").length,
    faq: document.querySelectorAll("#faq .faq-item").length,
    related: container.querySelectorAll(".editorial-related").length,
    notes: container.querySelectorAll(".editorial-note").length,
    options: container.querySelectorAll(".editorial-options").length,
    microCta: container.querySelectorAll(".editorial-micro-cta").length,
  };

  const visibleLayoutBlocks = [...document.querySelectorAll([
    ".editorial-article__header",
    containerSelector,
    ".editorial-answer",
    ".article-section",
    ".editorial-options",
    ".editorial-note",
    ".editorial-micro-cta",
    ".editorial-related",
    ".editorial-intake",
    ".editorial-message-guide",
    ".editorial-author",
    "#faq .faq-item",
    "[data-editorial-helpfulness]",
    ".editorial-cta",
  ].join(","))].filter((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }).map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      selector: element.id ? `${element.tagName.toLowerCase()}#${element.id}` : `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 3).join(".")}`,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    };
  });

  const tailCandidates = kind === "case"
    ? [container.lastElementChild, document.querySelector(".editorial-case-aside")]
    : [children.at(-1)];
  const visibleTailBottoms = tailCandidates
    .filter(Boolean)
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.height > 0)
    .map((rect) => rect.bottom);
  const tailBottom = visibleTailBottoms.length ? Math.max(...visibleTailBottoms) : null;
  const helpfulness = document.querySelector("[data-editorial-helpfulness]");
  const cta = document.querySelector(".editorial-cta");
  const footer = document.querySelector("footer");
  const helpfulnessRect = helpfulness?.getBoundingClientRect();
  const ctaRect = cta?.getBoundingClientRect();
  const footerRect = footer?.getBoundingClientRect();
  return {
    flow,
    compact: Number.isFinite(compactSpace),
    sectionGap,
    headingGap,
    paragraphGap,
    insetBlockGap,
    topLevel,
    headings,
    paragraphs,
    insetBlocks,
    required,
    structuralCounts,
    visibleLayoutBlocks,
    tailGap: tailBottom !== null && helpfulnessRect ? helpfulnessRect.top - tailBottom : null,
    ctaGap: helpfulnessRect && ctaRect ? ctaRect.top - helpfulnessRect.bottom : null,
    ctaFooterGap: ctaRect && footerRect ? footerRect.top - ctaRect.bottom : null,
    overflow: Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.body.scrollWidth - innerWidth,
    ),
  };
};

const closeTo = (actual, expected, tolerance = 3) => Number.isFinite(actual)
  && Number.isFinite(expected)
  && Math.abs(actual - expected) <= tolerance;

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
          if (state.overflow > 1) errors.push(`${engineName} ${viewport.width}px ${route.path}: ${state.overflow}px horizontal overflow`);
          if (Object.values(state.flow).some((value) => !Number.isFinite(value) || value <= 0)) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: rhythm tokens are invalid ${JSON.stringify(state.flow)}`);
          }

          for (const [name, present] of Object.entries(state.required)) {
            if (!present) errors.push(`${engineName} ${viewport.width}px ${route.path}: required layout block is missing: ${name}`);
          }
          if (route.kind === "article" && state.structuralCounts.sections !== route.expectedSections) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: rendered sections ${state.structuralCounts.sections}, expected ${route.expectedSections}`);
          }
          if (route.kind === "article" && state.structuralCounts.faq !== route.expectedFaq) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: rendered FAQ items ${state.structuralCounts.faq}, expected ${route.expectedFaq}`);
          }

          for (const item of state.topLevel.slice(1)) {
            let expected = state.sectionGap;
            if (item.label === "author") expected = state.compact ? state.sectionGap : state.flow.xl;
            else if (item.previousLabel === "intake" && item.label === "message-guide") expected = state.flow.md;
            else if (item.previousLabel?.startsWith("related:") && item.label.startsWith("related:")) expected = state.compact ? state.sectionGap : state.flow.md;
            if (!closeTo(item.gapBefore, expected)) {
              errors.push(`${engineName} ${viewport.width}px ${route.path}: wrong top-level gap ${JSON.stringify({ item, expected, flow: state.flow, compact: state.compact })}`);
            }
          }

          for (const heading of state.headings) {
            if (!closeTo(heading.gapAfter, state.headingGap)) {
              errors.push(`${engineName} ${viewport.width}px ${route.path}: wrong heading gap ${JSON.stringify({ heading, expected: state.headingGap })}`);
            }
          }
          for (const paragraph of state.paragraphs) {
            if (!closeTo(paragraph.gapBefore, state.paragraphGap)) {
              errors.push(`${engineName} ${viewport.width}px ${route.path}: wrong paragraph gap ${JSON.stringify({ paragraph, expected: state.paragraphGap })}`);
            }
          }
          for (const block of state.insetBlocks) {
            if (block.type.includes("editorial-options") || block.type.includes("editorial-note") || block.type.includes("editorial-micro-cta")) {
              if (!closeTo(block.gapBefore, state.insetBlockGap, 4)) {
                errors.push(`${engineName} ${viewport.width}px ${route.path}: wrong inset block gap ${JSON.stringify({ block, expected: state.insetBlockGap })}`);
              }
            }
          }

          if (!closeTo(state.tailGap, state.flow.xl, 4)) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: content-to-feedback gap is inconsistent ${JSON.stringify({ actual: state.tailGap, expected: state.flow.xl })}`);
          }
          if (!closeTo(state.ctaGap, state.flow.md, 4)) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: feedback-to-CTA gap is inconsistent ${JSON.stringify({ actual: state.ctaGap, expected: state.flow.md })}`);
          }
          if (Number.isFinite(state.ctaFooterGap) && state.ctaFooterGap < -1) {
            errors.push(`${engineName} ${viewport.width}px ${route.path}: CTA overlaps footer by ${Math.abs(state.ctaFooterGap)}px`);
          }

          for (const block of state.visibleLayoutBlocks) {
            if (block.left < -1 || block.right > viewport.width + 1) {
              errors.push(`${engineName} ${viewport.width}px ${route.path}: layout block escapes viewport ${JSON.stringify(block)}`);
            }
          }
          for (let index = 1; index < state.topLevel.length; index += 1) {
            const previous = state.topLevel[index - 1];
            const current = state.topLevel[index];
            if (current.top < previous.bottom - 1) {
              errors.push(`${engineName} ${viewport.width}px ${route.path}: top-level blocks overlap ${JSON.stringify({ previous, current })}`);
            }
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

console.log(`Editorial rhythm passed for every article: ${articles.length} articles across ${viewports.length} viewports in Chromium and WebKit, with section/block spacing, FAQ, CTA, related/note/micro-CTA containment and page-ending geometry checked`);
