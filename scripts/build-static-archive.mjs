import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const args = process.argv.slice(2);
const exportIndex = args.indexOf("--export");
const exportFile = exportIndex >= 0 ? args[exportIndex + 1] : null;
const collect = args.includes("--collect-assets");
const requireLive = args.includes("--require-live");
const types = ["client", "anomaly", "incident"];
const host = "https://skvwaovkkoxqfwkcpuvh.supabase.co";
const window = {};
const context = vm.createContext({ window, structuredClone });
let repositoryCovers = {};
// Exactly the order used by the previous public pages; keep original sources intact.
for (const name of ["data", "featured-data", "client-updates", "incident-updates", "site-completion", "latest-covers", "krovolunanie-research", "relations-data", "geo-seeds"]) {
  if (name === "latest-covers") repositoryCovers = Object.fromEntries(types.flatMap((type) => Object.values(window.MIDGAS_RECORDS[type] || {})).map((r) => [r.id, r.cardImage || r.image]));
  vm.runInContext(read(`web/${name}.js`), context, { filename: `${name}.js`, timeout: 5000 });
}
let records = types.flatMap((type) => Object.values(window.MIDGAS_RECORDS[type] || {}).map((record) => ({ ...record, type })));
let relationships = window.MIDGAS_RELATIONS.pairs.map(([source, target]) => ({ source, target }));
let glossary = JSON.parse(read("design/archive-source/glossary.json"));
let board = { nodes: [], edges: [], positions: [] };
let editorial = [];
let settings = [];
let source = { kind: "repository-snapshot", complete: false, reason: "Live Supabase export is required before replacing production." };

if (exportFile) {
  const input = JSON.parse(fs.readFileSync(path.resolve(exportFile), "utf8"));
  const data = input.archive_export || input;
  for (const key of ["records", "relationships", "editorial_entries", "board_nodes", "board_edges", "board_positions", "site_settings"]) {
    if (!Array.isArray(data[key])) throw new Error(`Incomplete export: ${key} must be an array.`);
  }
  if (data.project_ref !== "skvwaovkkoxqfwkcpuvh") throw new Error("The export is not from the MIDGAS project.");
  if (!data.records.length) throw new Error("Refusing to replace the archive with an empty export.");
  const visible = data.records.filter((row) => !row.deleted_at && row.content?.isPublished !== false);
  const codes = new Map(visible.map((row) => [row.id, row.record_code]));
  records = visible.map((row) => {
    if (!types.includes(row.record_type) || !/^MID-[CAI]-\d{4}$/.test(row.record_code) || !row.content || typeof row.content !== "object") throw new Error(`Invalid record ${row.id}`);
    // Copy every content property, including tags, sections, media, research and coordinates.
    const record = { ...row.content, id: row.record_code, type: row.record_type, kind: row.record_type.toUpperCase(), createdAt: row.created_at, updatedAt: row.updated_at };
    if (row.cover_path) record.image = record.cardImage = `${host}/storage/v1/object/public/record-covers/${row.cover_path}`;
    return record;
  });
  relationships = data.relationships.filter((row) => codes.has(row.source_id) && codes.has(row.target_id)).map((row) => ({ ...row, source: codes.get(row.source_id), target: codes.get(row.target_id) }));
  board = { nodes: data.board_nodes, edges: data.board_edges, positions: data.board_positions };
  editorial = data.editorial_entries.filter((entry) => !entry.deleted_at && entry.is_published);
  settings = data.site_settings;
  for (const entry of data.editorial_entries.filter((entry) => entry.entry_type === "glossary")) {
    const index = glossary.findIndex((term) => term.id === entry.id || (entry.metadata?.domId && term.id === entry.metadata.domId));
    if (index >= 0) glossary.splice(index, 1);
    if (!entry.deleted_at && entry.is_published) glossary.push({ ...entry, group: entry.metadata?.group || "registry", label: "Глоссарий" });
  }
  source = { kind: "supabase-export", complete: true, exportedAt: data.exported_at, project: data.project_ref, count: records.length };
}
if (requireLive && !source.complete) throw new Error("Production export is missing. Use --export with the verified MIDGAS export.");

const seen = new Set();
for (const record of records) {
  if (seen.has(record.id)) throw new Error(`Duplicate record ID ${record.id}`);
  seen.add(record.id);
  record.geo ||= window.MIDGAS_GEO_SEEDS[record.id];
}
relationships = relationships.filter((edge) => seen.has(edge.source) && seen.has(edge.target));
const archive = { version: 1, source, records, relationships, glossary, board, editorial, settings };
const storageUrls = new Set();
function visit(value, replace) {
  if (typeof value === "string") return replace(value);
  if (Array.isArray(value)) return value.map((item) => visit(item, replace));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, replace)]));
  return value;
}
visit(archive, (value) => { if (value.startsWith(`${host}/storage/v1/object/`)) storageUrls.add(value); return value; });
if (collect) {
  fs.writeFileSync(path.join(root, "design/archive-source/asset-urls.json"), JSON.stringify([...storageUrls].sort(), null, 2) + "\n");
  console.log(`Collected ${storageUrls.size} storage URLs.`);
  process.exit(0);
}
const manifest = JSON.parse(read("design/archive-source/assets.json"));
const fallbacks = {};
if (!source.complete) {
  for (const record of records) {
    const url = record.cardImage || record.image;
    const fallback = repositoryCovers[record.id];
    if (storageUrls.has(url) && !manifest[url]?.path) fallbacks[url] = fallback && fs.existsSync(path.join(root, "web", fallback)) ? fallback : "assets/archive/image-unavailable.svg";
  }
  source.missingMedia = Object.keys(fallbacks).map((url) => ({ url, fallback: fallbacks[url], reason: "Storage object unavailable; repository fallback or explicit missing-image placeholder used for preview only." }));
}
const localized = visit({ ...archive, source: null }, (value) => {
  if (!storageUrls.has(value)) return value;
  const local = manifest[value]?.path || fallbacks[value];
  if (!local || !fs.existsSync(path.join(root, "web", local))) throw new Error(`Missing downloaded media: ${value}`);
  return local;
});
localized.source = source;
// Escape HTML delimiters so the generated data is safe if embedded later.
const json = JSON.stringify(localized).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
fs.writeFileSync(path.join(root, "web/archive-data.js"), `// Generated by scripts/build-static-archive.mjs.\nwindow.MIDGAS_ARCHIVE = ${json};\n`);
console.log(`Built ${records.length} records, ${relationships.length} relationships, ${glossary.length} glossary entries; ${source.kind}, complete=${source.complete}.`);
