const imageFromEvent = (event) => event.composedPath().find((node) => node instanceof HTMLImageElement && node.matches("[data-protected-image]"));

const interactiveImageContainer = (event, image) => event.composedPath().find((node) => (
  node instanceof HTMLAnchorElement || node instanceof HTMLButtonElement
) && node.contains(image));

const markImages = (root = document) => {
  root.querySelectorAll?.("img").forEach((image) => {
    image.setAttribute("data-protected-image", "");
    image.draggable = false;
  });
};

markImages();

const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches("img")) {
        node.setAttribute("data-protected-image", "");
        node.draggable = false;
      }
      markImages(node);
    }
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });

for (const type of ["dragstart", "contextmenu", "selectstart"]) {
  document.addEventListener(type, (event) => {
    if (!imageFromEvent(event)) return;
    event.preventDefault();
  }, { capture: true });
}

for (const type of ["click", "auxclick"]) {
  document.addEventListener(type, (event) => {
    const image = imageFromEvent(event);
    if (!image || !interactiveImageContainer(event, image)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
}
