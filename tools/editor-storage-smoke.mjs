import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../web/editor-storage.js", import.meta.url), "utf8");

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function baseRecords() {
  return {
    client: {
      "MID-C-0026": {
        id: "MID-C-0026",
        kind: "CLIENT",
        stage: "НАБЛЮДЕНИЕ",
        name: "БАЗОВАЯ ЗАПИСЬ",
        alias: "БАЗОВАЯ",
        cardType: "Клиент",
        image: "base.webp",
        summary: "Базовое описание",
        fields: [["Статус", "НАБЛЮДЕНИЕ"]],
        sections: [{ title: "РЕГИСТРАЦИЯ", paragraphs: ["Текст"] }],
      },
    },
    anomaly: {},
    incident: {},
  };
}

function load(storage, editor = true) {
  const listeners = new Map();
  const context = {
    console,
    structuredClone,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    },
    setTimeout,
    MIDGAS_RECORDS: baseRecords(),
    MIDGAS_EDITOR_SESSION: {
      isEditor: () => editor,
      read: () => editor ? { email: "editor@example.com", role: "editor" } : null,
    },
    localStorage: storage,
    addEventListener(type, handler) { listeners.set(type, handler); },
    dispatchEvent() {},
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "editor-storage.js" });
  return context;
}

function payload(name) {
  return {
    type: "client",
    name,
    alias: name,
    cardType: "Клиент",
    status: "НАБЛЮДЕНИЕ",
    threat: "T1 / низкий",
    access: "D1 / открытый",
    location: "Тестовый сектор",
    summary: "Краткое описание",
    description: "Подробное описание",
    image: "data:image/webp;base64,AAAA",
    relations: [],
  };
}

const storage = makeStorage();
const blocked = load(storage, false);
await assert.rejects(() => blocked.MIDGAS_EDITOR_STORE.create(payload("НЕТ ДОСТУПА")), /только после входа/i);
assert.throws(() => blocked.MIDGAS_EDITOR_STORE.resetToPublished("client", "MID-C-0026"), /только после входа/i);

const first = load(storage, true);
assert.equal(first.MIDGAS_EDITOR_STORE.nextId("client"), "MID-C-0027");

await first.MIDGAS_EDITOR_STORE.update("client", "MID-C-0026", { name: "ИЗМЕНЁННАЯ БАЗОВАЯ" });
assert.equal(first.MIDGAS_EDITOR_STORE.isModified("client", "MID-C-0026"), true);
assert.equal(first.MIDGAS_EDITOR_STORE.listModified()[0].id, "MID-C-0026");
const resetBase = first.MIDGAS_EDITOR_STORE.resetToPublished("client", "MID-C-0026");
assert.equal(resetBase.record.name, "БАЗОВАЯ ЗАПИСЬ");
assert.equal(resetBase.record.id, "MID-C-0026");
assert.equal(first.MIDGAS_EDITOR_STORE.isModified("client", "MID-C-0026"), false);

const created27 = await first.MIDGAS_EDITOR_STORE.create(payload("ЗАПИСЬ 27"));
assert.equal(created27.record.id, "MID-C-0027");
assert.equal(first.MIDGAS_EDITOR_STORE.isModified("client", "MID-C-0027"), false);

const updated27 = await first.MIDGAS_EDITOR_STORE.update("client", "MID-C-0027", {
  id: "MID-C-9999",
  type: "anomaly",
  kind: "ANOMALY",
  name: "ОБНОВЛЁННАЯ 27",
  editorRelations: [],
});
assert.equal(updated27.record.id, "MID-C-0027");
assert.equal(updated27.record.kind, "CLIENT");
assert.equal(updated27.record.name, "ОБНОВЛЁННАЯ 27");
assert.equal(first.MIDGAS_EDITOR_STORE.isModified("client", "MID-C-0027"), true);
const reset27 = first.MIDGAS_EDITOR_STORE.resetToPublished("client", "MID-C-0027");
assert.equal(reset27.record.name, "ЗАПИСЬ 27");
assert.equal(reset27.record.id, "MID-C-0027");
assert.equal(first.MIDGAS_EDITOR_STORE.nextId("client"), "MID-C-0028");
assert.equal(first.MIDGAS_EDITOR_STORE.isModified("client", "MID-C-0027"), false);
await first.MIDGAS_EDITOR_STORE.update("client", "MID-C-0027", { name: "ОБНОВЛЁННАЯ 27" });

first.MIDGAS_EDITOR_STORE.softDelete("client", "MID-C-0027");
assert.equal(first.MIDGAS_RECORDS.client["MID-C-0027"], undefined);
assert.equal(first.MIDGAS_EDITOR_STORE.nextId("client"), "MID-C-0028");

const created28 = await first.MIDGAS_EDITOR_STORE.create(payload("ЗАПИСЬ 28"));
assert.equal(created28.record.id, "MID-C-0028");
first.MIDGAS_EDITOR_STORE.restore("client", "MID-C-0027");
assert.equal(first.MIDGAS_RECORDS.client["MID-C-0027"].name, "ОБНОВЛЁННАЯ 27");
assert.equal(first.MIDGAS_EDITOR_STORE.isModified("client", "MID-C-0027"), true);
first.MIDGAS_EDITOR_STORE.resetToPublished("client", "MID-C-0027");
assert.equal(first.MIDGAS_RECORDS.client["MID-C-0027"].name, "ЗАПИСЬ 27");

first.MIDGAS_EDITOR_STORE.softDelete("client", "MID-C-0026");
first.MIDGAS_EDITOR_STORE.restore("client", "MID-C-0026");
assert.equal(first.MIDGAS_EDITOR_STORE.isModified("client", "MID-C-0026"), false);

first.MIDGAS_EDITOR_STORE.softDelete("client", "MID-C-0028");
const created29 = await first.MIDGAS_EDITOR_STORE.create(payload("ЗАПИСЬ 29"));
assert.equal(created29.record.id, "MID-C-0029");

const reloaded = load(storage, true);
assert.equal(reloaded.MIDGAS_RECORDS.client["MID-C-0027"].id, "MID-C-0027");
assert.equal(reloaded.MIDGAS_RECORDS.client["MID-C-0028"], undefined);
assert.equal(reloaded.MIDGAS_RECORDS.client["MID-C-0029"].id, "MID-C-0029");
assert.equal(reloaded.MIDGAS_EDITOR_STORE.nextId("client"), "MID-C-0030");
assert.equal(reloaded.MIDGAS_EDITOR_STORE.listDeleted()[0].id, "MID-C-0028");
assert.equal(reloaded.MIDGAS_EDITOR_STORE.audit().some((event) => event.action === "reset"), true);

const legacyStorage = makeStorage({
  "midgas-editor-records-v1": JSON.stringify([{ type: "client", record: { ...payload("СТАРАЯ 30"), id: "MID-C-0030", kind: "CLIENT", fields: [], sections: [] } }]),
});
const migrated = load(legacyStorage, true);
assert.equal(migrated.MIDGAS_RECORDS.client["MID-C-0030"].name, "СТАРАЯ 30");
assert.equal(migrated.MIDGAS_EDITOR_STORE.nextId("client"), "MID-C-0031");

console.log("editor-storage smoke: ok");
