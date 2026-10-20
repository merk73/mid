import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "web");
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(web, "archive-data.js"), "utf8"), { window }, { timeout: 5000 });
const archive = window.MIDGAS_ARCHIVE;
const requireLive = process.argv.includes("--require-live");
const errors = [];
if (!archive?.records?.length) errors.push("Empty archive");
if (requireLive && (!archive.source?.complete || archive.source?.kind !== "supabase-export")) errors.push("Production publication is blocked: a verified live Supabase content export is required.");
const ids = new Set();
for (const record of archive.records) {
  if (!/^MID-[CAI]-\d{4}$/.test(record.id) || ids.has(record.id)) errors.push(`Invalid or duplicate ID ${record.id}`);
  ids.add(record.id);
  if (!record.name || !["client", "anomaly", "incident"].includes(record.type)) errors.push(`Invalid record ${record.id}`);
}
for (const edge of archive.relationships) if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push(`Dangling relationship ${edge.source} / ${edge.target}`);
let media = 0;
function inspect(value, key = "") {
  if (typeof value === "string") {
    if (value.startsWith("assets/")) {
      media++;
      const target = path.resolve(web, value.split(/[?#]/)[0]);
      if (!target.startsWith(web + path.sep) || !fs.existsSync(target)) errors.push(`Missing local asset ${value}`);
      if (requireLive && value === "assets/archive/image-unavailable.svg") errors.push("Missing source image must be resolved before publication.");
    }
    if (["src", "image", "cardImage", "cover_path"].includes(key) && /\.supabase\.co\//.test(value)) errors.push(`Unmigrated remote media ${value}`);
  } else if (Array.isArray(value)) value.forEach((item) => inspect(item, key));
  else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => inspect(v, k));
}
inspect(archive);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "design/archive-source/assets.json"), "utf8"));
for (const entry of Object.values(manifest)) {
  const bytes = fs.readFileSync(path.join(web, entry.path));
  if (bytes.length !== entry.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== entry.sha256) errors.push(`Changed original media ${entry.path}`);
}
for (const name of fs.readdirSync(web).filter((n) => n.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(web, name), "utf8");
  if (/<script[^>]+src=["'][^"']*(?:supabase|site-access|editor-session|site-gate)/i.test(html)) errors.push(`Database dependency in ${name}`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Static archive verified: ${ids.size} records, ${archive.relationships.length} relationships, ${archive.glossary.length} terms, ${media} local asset references, ${Object.keys(manifest).length} original file hashes.`);
if (!archive.source.complete) console.log("Preview snapshot only: live export and missing cover remain outstanding.");
