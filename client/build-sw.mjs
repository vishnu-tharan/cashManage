import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const html = readFileSync(
  new URL("./dist/index.html", import.meta.url),
  "utf8",
);
const version = createHash("sha256").update(html).digest("hex").slice(0, 12);
const sw = readFileSync(
  new URL("./public/sw.js", import.meta.url),
  "utf8",
).replace("cashmanage-shell-v1", `cashmanage-shell-${version}`);
writeFileSync(new URL("./dist/sw.js", import.meta.url), sw);
