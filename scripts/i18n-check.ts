// Fails if a Spanish string passed to t() (or used as a menu/tool label) has no English entry.
// Run: bun run check:i18n
import { readFileSync, readdirSync } from "node:fs";
import { en } from "../src/i18n";

const files = ["src", "src/components"].flatMap((d) => readdirSync(d).filter((f) => /\.(vue|ts)$/.test(f) && !f.startsWith("i18n")).map((f) => `${d}/${f}`));
const missing = new Set<string>();
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/\bt\(\s*(["'])(.+?)\1|\b(?:label|title): "([^"]+)"/g)) {
    const k = m[2] ?? (f.endsWith(".vue") ? m[3] : undefined); // label/title arrays live in components
    if (k && !(k in en)) missing.add(`${f}: ${k}`);
  }
}
if (missing.size) {
  console.error([...missing].join("\n"));
  process.exit(1);
}
console.log(`i18n ok: ${Object.keys(en).length} strings`);
