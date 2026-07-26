const slotNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const unresolvedSlotPattern = /<!-- build-slot:([a-z0-9-]+) -->/g;

const assertSlotName = (name) => {
  if (!slotNamePattern.test(name)) throw new Error(`Некорректное имя сборочного слота: ${name}`);
};

export const buildSlot = (name) => {
  assertSlotName(name);
  return `<!-- build-slot:${name} -->`;
};

const locateUniqueSlot = (html, name) => {
  const marker = buildSlot(name);
  const count = html.split(marker).length - 1;
  if (count !== 1) {
    throw new Error(`Сборочный слот ${name} должен встречаться ровно один раз, найдено: ${count}`);
  }
  return marker;
};

export const fillBuildSlot = (html, name, content = "") => {
  const marker = locateUniqueSlot(html, name);
  return html.replace(marker, String(content));
};

export const appendToBuildSlot = (html, name, content = "") => {
  const marker = locateUniqueSlot(html, name);
  return html.replace(marker, `${String(content)}${marker}`);
};

export const finalizeBuildSlots = (html, pathname) => {
  const unresolved = [...html.matchAll(unresolvedSlotPattern)].map((match) => match[1]);
  const unexpected = unresolved.filter((name) => name !== "head-assets");
  if (unexpected.length) {
    throw new Error(`Не заполнены сборочные слоты ${pathname}: ${[...new Set(unexpected)].join(", ")}`);
  }
  return fillBuildSlot(html, "head-assets", "");
};
