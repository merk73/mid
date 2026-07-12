import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "dist/client/index.html",
  "dist/client/historical-archive.html",
  "dist/client/registry.html",
  "dist/client/record.html",
  "dist/server/index.js",
  "dist/.openai/hosting.json",
];

await Promise.all(required.map((path) => access(resolve(root, path))));

const hosting = JSON.parse(
  await readFile(resolve(root, "dist/.openai/hosting.json"), "utf8"),
);
assert.equal(typeof hosting.project_id, "string");
assert.ok(hosting.project_id.length > 0);

const workerUrl = new URL(`data:text/javascript;base64,${Buffer.from(
  await readFile(resolve(root, "dist/server/index.js"), "utf8"),
).toString("base64")}`);
const worker = await import(workerUrl);
assert.equal(typeof worker.default?.fetch, "function");

console.log("Sites package validated");
