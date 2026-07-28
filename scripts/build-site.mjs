import { appendFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await import("./build.mjs");

const editorialCards = await readFile(join(root, "src", "editorial-cards.css"), "utf8");
await appendFile(
  join(root, "dist", "assets", "styles.css"),
  `\n/* Editorial index cards */\n${editorialCards}\n`,
  "utf8",
);
