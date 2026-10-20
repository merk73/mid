import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifact = path.join(root, "web/archive-data.js");
const original = fs.readFileSync(artifact);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "midgas-static-export-"));
const readArchive = () => { const window = {}; vm.runInNewContext(fs.readFileSync(artifact, "utf8"), { window }); return window.MIDGAS_ARCHIVE; };
const run = (...args) => spawnSync(process.execPath, [path.join(root, "scripts/build-static-archive.mjs"), ...args], { encoding: "utf8" });
try {
  const source = readArchive();
  const fixture = {
    project_ref: "skvwaovkkoxqfwkcpuvh", exported_at: "2026-10-20T00:00:00Z",
    records: [
      { id: "uuid-1", record_type: "client", record_code: "MID-C-0098", content: { ...source.records[0], tags: ["Сохранённый тег", { label: "Второй тег" }], customContent: { nested: "Полный текст", list: [1, 2, 3] } } },
      { id: "uuid-2", record_type: "anomaly", record_code: "MID-A-0057", content: source.records.find((r) => r.type === "anomaly") },
      { id: "uuid-3", record_type: "client", record_code: "MID-C-0099", content: { ...source.records[0], isPublished: false } },
      { id: "uuid-4", record_type: "client", record_code: "MID-C-0100", deleted_at: "2026-10-20", content: source.records[0] },
    ],
    relationships: [{ id: "edge-1", source_id: "uuid-1", target_id: "uuid-2" }, { id: "hidden-edge", source_id: "uuid-1", target_id: "uuid-3" }],
    editorial_entries: [{ id: "term-1", entry_type: "glossary", title: "Новый термин", body: "Полное определение", is_published: true, metadata: { group: "registry" } }],
    board_nodes: [{ id: "note-1", title: "Заметка доски", description: "Полное содержание", position_x: 222, position_y: 333 }],
    board_edges: [{ source_key: "client:MID-C-0098", target_key: "board:note-1" }],
    board_positions: [{ node_key: "client:MID-C-0098", position_x: 111, position_y: 444 }], site_settings: [],
  };
  const file = path.join(temp, "fixture.json"); fs.writeFileSync(file, JSON.stringify(fixture));
  let result = run("--export", file, "--require-live"); assert.equal(result.status, 0, result.stderr);
  let output = readArchive();
  assert.deepEqual(JSON.parse(JSON.stringify(output.records[0].tags)), fixture.records[0].content.tags);
  assert.deepEqual(JSON.parse(JSON.stringify(output.records[0].customContent)), fixture.records[0].content.customContent);
  assert.equal(output.records.length, 2); assert.equal(output.records[0].id, "MID-C-0098");
  assert.equal(output.relationships.length, 1); assert.equal(output.relationships[0].source, "MID-C-0098");
  assert.equal(output.relationships[0].target, "MID-A-0057");
  assert.equal(output.glossary.at(-1).body, "Полное определение");
  assert.equal(output.board.positions[0].position_y, 444); assert.equal(output.board.nodes[0].description, "Полное содержание");
  fixture.project_ref = "another-project"; fs.writeFileSync(file, JSON.stringify(fixture));
  result = run("--export", file); assert.notEqual(result.status, 0); assert.match(result.stderr, /not from the MIDGAS/);
  result = run("--require-live"); assert.notEqual(result.status, 0); assert.match(result.stderr, /Production export is missing/);
  console.log("Static data export smoke passed: IDs, nested content, tags, links, board positions and glossary preserved; deleted/draft records excluded; wrong or absent live export rejected.");
} finally { fs.writeFileSync(artifact, original); fs.rmSync(temp, { recursive: true }); }
