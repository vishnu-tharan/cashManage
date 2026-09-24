import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
const html = readFileSync(
  new URL("./dist/index.html", import.meta.url),
  "utf8",
);
const template = readFileSync(
  new URL("./public/sw.js", import.meta.url),
  "utf8",
);
const assets = readdirSync(new URL("./dist/assets/", import.meta.url)).map(
  (name) => "/assets/" + name,
);
const version = createHash("sha256")
  .update(html + template + assets.join(","))
  .digest("hex")
  .slice(0, 12);
const sw = template
  .replace("cashmanage-shell-v1", `cashmanage-shell-${version}`)
  .replace(
    "const BUILD_ASSETS = [];",
    `const BUILD_ASSETS = ${JSON.stringify(assets)};`,
  );
writeFileSync(new URL("./dist/sw.js", import.meta.url), sw);
