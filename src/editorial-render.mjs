import {
  renderArticlePage as renderBaseArticlePage,
} from "./editorial-render-base.mjs";

export {
  renderArticlesIndex,
  renderPracticeCasePage,
  renderPracticeIndex,
} from "./editorial-render-base.mjs";

export const renderArticlePage = (articleOrSlug) => {
  const page = renderBaseArticlePage(articleOrSlug);
  const content = page.content.replace(
    /(<section class="article-section" id="[^"]+"[^>]*>\s*)<h2>/g,
    '$1<h2 style="overflow-wrap:anywhere">',
  );
  return { ...page, content };
};
