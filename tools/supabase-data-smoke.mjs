import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const source = fs.readFileSync(new URL("../web/supabase-data.js", import.meta.url), "utf8");
const editorStorageSource = fs.readFileSync(new URL("../web/editor-storage.js", import.meta.url), "utf8");
const now = "2026-07-14T00:00:00.000Z";
const clientUuid = "00000000-0000-4000-8000-000000000001";
const anomalyUuid = "00000000-0000-4000-8000-000000000002";
const editorUuid = "00000000-0000-4000-8000-000000000003";

function row(id, type, number, code, content) {
  return {
    id,
    record_type: type,
    record_no: number,
    record_code: code,
    content: structuredClone(content),
    cover_path: null,
    publication_snapshot: {
      id,
      record_type: type,
      record_no: number,
      record_code: code,
      content: structuredClone(content),
      cover_path: null,
    },
    published_at: now,
    version: 1,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
}

const records = [
  row(clientUuid, "client", 1, "MID-C-0001", {
    kind: "CLIENT",
    name: "REMOTE CLIENT",
    alias: "REMOTE",
    cardType: "Клиент",
    image: "base.webp",
    summary: "Remote summary",
    fields: [],
    sections: [],
  }),
  row(anomalyUuid, "anomaly", 1, "MID-A-0001", {
    kind: "ANOMALY",
    name: "REMOTE ANOMALY",
    alias: "ANOMALY",
    cardType: "Аномалия",
    image: "anomaly.webp",
    summary: "Remote anomaly",
    fields: [],
    sections: [],
  }),
];
const relationships = [];
const uploadedPaths = [];
let relationshipId = 1;
let authNetworkFailure = false;

class Builder {
  constructor(table) {
    this.table = table;
    this.operation = "select";
    this.filters = [];
    this.values = null;
  }

  select() { return this; }
  order() { return this; }
  is(column, value) { this.filters.push(["is", column, value]); return this; }
  eq(column, value) { this.filters.push(["eq", column, value]); return this; }
  in(column, values) { this.filters.push(["in", column, values]); return this; }
  insert(values) { this.operation = "insert"; this.values = values; return this; }
  update(values) { this.operation = "update"; this.values = values; return this; }
  delete() { this.operation = "delete"; return this; }
  single() { return Promise.resolve(this.execute(true)); }
  maybeSingle() { return Promise.resolve(this.execute(true)); }
  then(resolve, reject) { return Promise.resolve(this.execute(false)).then(resolve, reject); }

  matches(value) {
    return this.filters.every(([operator, column, expected]) => {
      if (operator === "eq") return value[column] === expected;
      if (operator === "in") return expected.includes(value[column]);
      if (operator === "is") return value[column] === expected;
      return true;
    });
  }

  execute(single) {
    if (this.table === "account_members") {
      return { data: { role: "editor", approved_at: now }, error: null };
    }
    if (this.table === "records") return this.executeRecords(single);
    if (this.table === "relationships") return this.executeRelationships(single);
    return { data: null, error: { code: "42P01", message: `relation ${this.table} does not exist` } };
  }

  executeRecords(single) {
    if (this.operation === "insert") {
      const value = Array.isArray(this.values) ? this.values[0] : this.values;
      const number = Math.max(...records.filter((item) => item.record_type === value.record_type).map((item) => item.record_no), 0) + 1;
      const prefix = { client: "C", anomaly: "A", incident: "I" }[value.record_type];
      const code = `MID-${prefix}-${String(number).padStart(4, "0")}`;
      const id = `00000000-0000-4000-8000-${String(records.length + 10).padStart(12, "0")}`;
      const inserted = row(id, value.record_type, number, code, value.content);
      inserted.cover_path = value.cover_path;
      inserted.publication_snapshot.cover_path = value.cover_path;
      records.push(inserted);
      return { data: structuredClone(inserted), error: null };
    }
    const selected = records.filter((item) => this.matches(item));
    if (this.operation === "update") {
      selected.forEach((item) => {
        Object.assign(item, structuredClone(this.values));
        item.version += 1;
        item.updated_at = "2026-07-14T00:01:00.000Z";
      });
      const data = single ? selected[0] || null : selected;
      return { data: structuredClone(data), error: null };
    }
    const projection = selected.map((item) => structuredClone(item));
    return { data: single ? projection[0] || null : projection, error: null };
  }

  executeRelationships(single) {
    if (this.operation === "insert") {
      const values = Array.isArray(this.values) ? this.values : [this.values];
      values.forEach((value) => relationships.push({ id: relationshipId++, ...structuredClone(value) }));
      return { data: null, error: null };
    }
    const selected = relationships.filter((item) => this.matches(item));
    if (this.operation === "delete") {
      selected.forEach((item) => relationships.splice(relationships.findIndex((value) => value.id === item.id), 1));
      return { data: null, error: null };
    }
    const data = structuredClone(selected);
    return { data: single ? data[0] || null : data, error: null };
  }
}

const mockClient = {
  auth: {
    async getUser() {
      if (authNetworkFailure) {
        authNetworkFailure = false;
        throw new TypeError("Failed to fetch");
      }
      return { data: { user: { id: editorUuid, email: "editor@example.test" } }, error: null };
    },
  },
  from(table) { return new Builder(table); },
  storage: {
    from(bucket) {
      assert.equal(bucket, "record-covers");
      return {
        async upload(path, blob) {
          uploadedPaths.push(path);
          assert.ok(blob.size > 0);
          return { data: { path }, error: null };
        },
        getPublicUrl(path) {
          return { data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/record-covers/${path}` } };
        },
        async remove() { return { data: [], error: null }; },
      };
    },
  },
};

const events = [];
const listeners = new Map();
const storageValues = new Map();
const context = {
  console,
  Blob,
  CustomEvent: class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  },
  MIDGAS_RECORDS: {
    client: { "MID-C-0001": { id: "MID-C-0001", name: "LOCAL CLIENT", fields: [], sections: [] } },
    anomaly: { "MID-A-0001": { id: "MID-A-0001", name: "LOCAL ANOMALY", fields: [], sections: [] } },
    incident: {},
  },
  MIDGAS_SUPABASE_CONFIG: { url: "https://example.supabase.co", publishableKey: "sb_publishable_test" },
  MIDGAS_SUPABASE_CLIENT: mockClient,
  MIDGAS_EDITOR_SESSION: {
    isEditor: () => true,
    read: () => ({ email: "editor@example.test", role: "full" }),
  },
  localStorage: {
    getItem(key) { return storageValues.has(key) ? storageValues.get(key) : null; },
    setItem(key, value) { storageValues.set(key, String(value)); },
    removeItem(key) { storageValues.delete(key); },
  },
  crypto: webcrypto,
  fetch,
  atob,
  URL,
  structuredClone,
  setTimeout,
  clearTimeout,
  addEventListener(type, handler) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(handler);
  },
  dispatchEvent(event) {
    events.push(event);
    (listeners.get(event.type) || []).forEach((handler) => handler(event));
  },
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "supabase-data.js" });

const bridge = context.MIDGAS_SUPABASE_DATA;
const loaded = await bridge.ready;
assert.equal(loaded.fallback, false);
assert.equal(context.MIDGAS_RECORDS.client["MID-C-0001"].name, "REMOTE CLIENT");
assert.equal(bridge.uuidForCode("MID-C-0001"), clientUuid);

const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const updated = await bridge.updateRecord("client", "MID-C-0001", {
  name: "UPDATED REMOTE CLIENT",
  image: pixel,
  cardImage: pixel,
  sections: [{ title: "PHOTO", paragraphs: ["Text"], image: { src: pixel } }],
  editorRelations: [{ type: "anomaly", id: "MID-A-0001" }],
});
assert.equal(updated.sync, "remote");
assert.equal(updated.record.name, "UPDATED REMOTE CLIENT");
assert.equal(uploadedPaths.length, 1, "identical cover/section data URLs should upload once");
assert.match(uploadedPaths[0], /\/[0-9a-f-]{36}\.png$/i);
assert.equal(records.find((item) => item.record_code === "MID-C-0001").cover_path, uploadedPaths[0]);
assert.equal(relationships.length, 1);
assert.equal(relationships[0].source_id, clientUuid);
assert.equal(relationships[0].target_id, anomalyUuid);
await bridge.syncRelationships("MID-C-0001", [{ uuid: anomalyUuid }]);
assert.equal(relationships.length, 1, "UUID relationship references should not create duplicates");

await assert.rejects(
  () => bridge.updateRecord("client", "MID-C-0099", { name: "MISSING" }),
  (error) => error.code === "SEED_REQUIRED" && /seed-миграц/i.test(error.message),
);

const created = await bridge.createRecord({
  type: "client",
  record: {
    name: "CREATED REMOTE",
    alias: "CREATED",
    cardType: "Клиент",
    image: pixel,
    summary: "Created",
    fields: [],
    sections: [],
    editorRelations: [],
  },
  relations: [],
});
assert.equal(created.record.id, "MID-C-0002");
await bridge.softDeleteRecord("client", created.record.id);
assert.equal(context.MIDGAS_RECORDS.client[created.record.id], undefined);
await bridge.restoreRecord("client", created.record.id);
assert.equal(context.MIDGAS_RECORDS.client[created.record.id].name, "CREATED REMOTE");
await bridge.updateRecord("client", created.record.id, { name: "CHANGED" });
const reset = await bridge.resetRecord("client", created.record.id);
assert.equal(reset.record.name, "CREATED REMOTE");

assert.equal(bridge.isNetworkError(new TypeError("Failed to fetch")), true);
assert.ok(events.some((event) => event.type === "midgas:records-ready"));
assert.equal(bridge.getStatus().state, "synced");

vm.runInContext(editorStorageSource, context, { filename: "editor-storage.js" });
const store = context.MIDGAS_EDITOR_STORE;
const delegated = await store.update("client", "MID-C-0001", { name: "EDITOR STORE REMOTE" });
assert.equal(delegated.sync, "remote");
assert.equal(records.find((item) => item.record_code === "MID-C-0001").content.name, "EDITOR STORE REMOTE");
assert.ok(storageValues.get(store.storageKey), "remote results may be cached locally without inline image data");
assert.equal(storageValues.get(store.storageKey).includes("data:image/"), false);

authNetworkFailure = true;
const fallback = await store.update("client", "MID-C-0001", { summary: "LOCAL FALLBACK" });
assert.equal(fallback.sync, "local-fallback");
assert.equal(bridge.getStatus().state, "offline-fallback");
assert.equal(store.get("client", "MID-C-0001").summary, "LOCAL FALLBACK");

const cachedRemote = await store.update("anomaly", "MID-A-0001", { summary: "CACHED REMOTE" });
assert.equal(cachedRemote.sync, "remote");
records.find((item) => item.record_code === "MID-A-0001").content.summary = "UPDATED ELSEWHERE";
await bridge.loadPublicRecords({ throwOnError: true });
assert.equal(store.get("anomaly", "MID-A-0001").summary, "UPDATED ELSEWHERE");

console.log("supabase data smoke: ok");
