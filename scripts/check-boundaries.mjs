import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["apps/web-free", "packages/engine-core", "packages/insurance-lenses"];
const banned = ["@insurance/overlay-pro", "apps/web-pro", "packages/overlay-pro"];
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx|js|json)$/.test(entry)) files.push(path);
  }
};
roots.forEach(walk);
const violations = files.flatMap((file) => {
  const text = readFileSync(file, "utf8");
  return banned.filter((value) => text.includes(value)).map((value) => `${file}: ${value}`);
});
if (violations.length) {
  console.error("Open/closed boundary violations:\n" + violations.join("\n"));
  process.exit(1);
}
console.log(`Boundary clean across ${files.length} open-source files.`);
