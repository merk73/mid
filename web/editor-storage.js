(() => {
  const STORAGE_KEY = "midgas-editor-state-v2";
  const LEGACY_KEY = "midgas-editor-records-v1";
  const RECORD_TYPES = ["client", "anomaly", "incident"];
  const TYPE_META = {
    client: { prefix: "MID-C-", kind: "CLIENT", defaultCardType: "Клиент / наблюдаемый субъект" },
    anomaly: { prefix: "MID-A-", kind: "ANOMALY", defaultCardType: "Аномалия / зона наблюдения" },
    incident: { prefix: "MID-I-", kind: "INCIDENT", defaultCardType: "Инцидент / активный процесс" },
  };

  const registry = window.MIDGAS_RECORDS || (window.MIDGAS_RECORDS = {});
  RECORD_TYPES.forEach((type) => {
    if (!registry[type] || typeof registry[type] !== "object") registry[type] = {};
  });

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  const baseRegistry = Object.fromEntries(RECORD_TYPES.map((type) => [type, clone(registry[type])]));

  function emptyState() {
    return {
      version: 2,
      records: {},
      lastIssued: { client: 0, anomaly: 0, incident: 0 },
      audit: [],
    };
  }

  function entryKey(type, id) {
    return `${type}:${id}`;
  }

  function numericId(type, id) {
    const prefix = TYPE_META[type]?.prefix || "";
    if (!String(id || "").startsWith(prefix)) return 0;
    const value = Number(String(id).slice(prefix.length));
    return Number.isInteger(value) && value > 0 ? value : 0;
  }

  function normalizeRelations(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.reduce((result, item) => {
      const type = RECORD_TYPES.includes(item?.type) ? item.type : "";
      const id = String(item?.id || "").trim();
      const key = entryKey(type, id);
      if (!type || !id || seen.has(key)) return result;
      seen.add(key);
      result.push({ type, id, label: String(item?.label || id).trim() });
      return result;
    }, []);
  }

  function normalizeRecord(type, record) {
    const meta = TYPE_META[type];
    const next = {
      ...record,
      id: String(record?.id || ""),
      kind: record?.kind || meta.kind,
      stage: String(record?.stage || "НАБЛЮДЕНИЕ"),
      loreState: record?.loreState || "unique",
      loreNote: record?.loreNote || "Карточка подготовлена в редакционном модуле MIDGAS.",
      duplicateOf: record?.duplicateOf || null,
      name: String(record?.name || "БЕЗ НАЗВАНИЯ"),
      alias: String(record?.alias || record?.name || "БЕЗ НАЗВАНИЯ"),
      cardType: String(record?.cardType || meta.defaultCardType),
      image: String(record?.image || ""),
      summary: String(record?.summary || ""),
      fields: Array.isArray(record?.fields) ? record.fields : [],
      sections: Array.isArray(record?.sections) ? record.sections : [],
    };
    if (Array.isArray(record?.editorRelations)) next.editorRelations = normalizeRelations(record.editorRelations);
    return next;
  }

  function normalizeEntry(value) {
    const type = RECORD_TYPES.includes(value?.type) ? value.type : "";
    const id = String(value?.id || value?.record?.id || "").trim();
    if (!type || !id || !value?.record) return null;
    const record = normalizeRecord(type, { ...value.record, id });
    return {
      type,
      id,
      record,
      createdAt: value.createdAt ? String(value.createdAt) : record.editorCreatedAt || null,
      updatedAt: value.updatedAt ? String(value.updatedAt) : record.editorUpdatedAt || value.createdAt || null,
      deletedAt: value.deletedAt ? String(value.deletedAt) : null,
    };
  }

  function normalizeState(value) {
    const next = emptyState();
    if (!value || typeof value !== "object") return next;
    Object.values(value.records || {}).forEach((candidate) => {
      const entry = normalizeEntry(candidate);
      if (entry) next.records[entryKey(entry.type, entry.id)] = entry;
    });
    RECORD_TYPES.forEach((type) => {
      const issued = Number(value.lastIssued?.[type]);
      next.lastIssued[type] = Number.isInteger(issued) && issued > 0 ? issued : 0;
    });
    next.audit = Array.isArray(value.audit)
      ? value.audit.slice(-300).filter((event) => event && RECORD_TYPES.includes(event.type) && event.id)
      : [];
    return next;
  }

  function migrateLegacy() {
    const next = emptyState();
    try {
      const legacy = JSON.parse(window.localStorage.getItem(LEGACY_KEY) || "[]");
      if (!Array.isArray(legacy)) return next;
      legacy.forEach((value) => {
        const type = RECORD_TYPES.includes(value?.type) ? value.type : "";
        const id = String(value?.record?.id || "").trim();
        if (!type || !id) return;
        const entry = normalizeEntry({
          type,
          id,
          record: value.record,
          createdAt: value.createdAt || value.record.editorCreatedAt || new Date().toISOString(),
          updatedAt: value.createdAt || value.record.editorCreatedAt || new Date().toISOString(),
        });
        if (entry) next.records[entryKey(type, id)] = entry;
      });
    } catch {
      return next;
    }
    return next;
  }

  function hydrateIssued(next) {
    RECORD_TYPES.forEach((type) => {
      const baseMaximum = Object.keys(baseRegistry[type]).reduce((maximum, id) => Math.max(maximum, numericId(type, id)), 0);
      const stateMaximum = Object.values(next.records)
        .filter((entry) => entry.type === type)
        .reduce((maximum, entry) => Math.max(maximum, numericId(type, entry.id)), 0);
      next.lastIssued[type] = Math.max(next.lastIssued[type], baseMaximum, stateMaximum);
    });
    return next;
  }

  function loadState() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) return hydrateIssued(normalizeState(JSON.parse(stored)));
    } catch {
      // Fall through to the legacy migration.
    }
    return hydrateIssued(migrateLegacy());
  }

  function persist(next) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      const quotaError = new Error("Недостаточно места в локальном архиве. Уменьшите изображение или освободите место браузера.");
      quotaError.cause = error;
      throw quotaError;
    }
  }

  function requireEditor() {
    if (!window.MIDGAS_EDITOR_SESSION?.isEditor?.()) {
      throw new Error("Редакционная операция доступна только после входа в аккаунт редактора.");
    }
  }

  function actorEmail() {
    return window.MIDGAS_EDITOR_SESSION?.read?.()?.email || "prototype-editor";
  }

  function appendAudit(next, action, type, id, name, at) {
    next.audit.push({
      action,
      type,
      id,
      name: String(name || id),
      at,
      actor: actorEmail(),
    });
    next.audit = next.audit.slice(-300);
  }

  function dispatch(action, type, record) {
    window.dispatchEvent(new CustomEvent("midgas:record-mutated", { detail: { action, type, record } }));
    if (action === "create") {
      window.dispatchEvent(new CustomEvent("midgas:record-created", { detail: { type, record } }));
    }
  }

  function applyState(next) {
    Object.values(next.records).forEach((entry) => {
      if (entry.deletedAt) delete registry[entry.type][entry.id];
      else registry[entry.type][entry.id] = normalizeRecord(entry.type, entry.record);
    });
  }

  let state = loadState();
  applyState(state);
  if (!window.localStorage.getItem(STORAGE_KEY) && Object.keys(state.records).length) {
    try { persist(state); } catch { /* Existing legacy records remain readable for this session. */ }
  }

  function stateEntry(type, id, source = state) {
    return source.records[entryKey(type, id)] || null;
  }

  function currentRecord(type, id, source = state) {
    const entry = stateEntry(type, id, source);
    if (entry) return normalizeRecord(type, entry.record);
    const base = baseRegistry[type]?.[id] || registry[type]?.[id];
    return base ? normalizeRecord(type, base) : null;
  }

  function nextId(type, source = state) {
    if (!RECORD_TYPES.includes(type)) throw new Error("Неизвестный тип карточки.");
    const number = Math.max(0, Number(source.lastIssued[type]) || 0) + 1;
    return `${TYPE_META[type].prefix}${String(number).padStart(4, "0")}`;
  }

  function create(payload) {
    requireEditor();
    const type = RECORD_TYPES.includes(payload?.type) ? payload.type : "client";
    const next = loadState();
    const id = nextId(type, next);
    const now = new Date().toISOString();
    const cardType = String(payload.cardType || TYPE_META[type].defaultCardType).trim();
    const name = String(payload.name || "").trim();
    const alias = String(payload.alias || name).trim();
    const location = String(payload.location || "Не раскрывается").trim();
    const status = String(payload.status || "НАБЛЮДЕНИЕ").trim();
    const threat = String(payload.threat || "T1 / низкий").trim();
    const access = String(payload.access || "D1 / открытый").trim();
    const summary = String(payload.summary || "").trim();
    const description = String(payload.description || summary).trim();
    const relations = normalizeRelations(payload.relations);

    if (!name || !summary || !description || !payload.image) {
      throw new Error("Заполните обязательные поля и загрузите изображение.");
    }

    const fields = [
      ["Тип", cardType],
      ["Статус", status],
      ["Уровень угрозы", threat],
      ["Уровень доступа", access],
      ["Местоположение", location],
    ];
    if (relations.length) fields.push(["Связанные записи", relations.map((item) => item.id).join(", ")]);

    const record = normalizeRecord(type, {
      id,
      kind: TYPE_META[type].kind,
      stage: status,
      name,
      alias,
      cardType,
      image: String(payload.image),
      summary,
      editorCreatedAt: now,
      editorUpdatedAt: now,
      editorRelations: relations,
      fields,
      sections: [{
        title: "ПЕРВИЧНАЯ РЕГИСТРАЦИЯ",
        paragraphs: [description],
        relatedRecords: relations,
      }],
    });

    next.lastIssued[type] = numericId(type, id);
    next.records[entryKey(type, id)] = {
      type,
      id,
      record,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    appendAudit(next, "create", type, id, name, now);
    persist(next);
    state = next;
    registry[type][id] = record;
    dispatch("create", type, record);
    return { type, record, createdAt: now };
  }

  function update(type, id, patch = {}) {
    requireEditor();
    if (!RECORD_TYPES.includes(type)) throw new Error("Неизвестный тип карточки.");
    const next = loadState();
    const existingEntry = stateEntry(type, id, next);
    if (existingEntry?.deletedAt) throw new Error("Сначала восстановите удалённую карточку.");
    const existing = currentRecord(type, id, next);
    if (!existing) throw new Error("Карточка не найдена.");
    const now = new Date().toISOString();
    const safePatch = { ...patch };
    delete safePatch.id;
    delete safePatch.type;
    delete safePatch.kind;
    const record = normalizeRecord(type, {
      ...existing,
      ...safePatch,
      id: existing.id,
      kind: existing.kind || TYPE_META[type].kind,
      editorCreatedAt: existing.editorCreatedAt,
      editorUpdatedAt: now,
    });
    next.records[entryKey(type, id)] = {
      type,
      id,
      record,
      createdAt: existingEntry?.createdAt || existing.editorCreatedAt || null,
      updatedAt: now,
      deletedAt: null,
    };
    next.lastIssued[type] = Math.max(next.lastIssued[type], numericId(type, id));
    appendAudit(next, "update", type, id, record.name, now);
    persist(next);
    state = next;
    registry[type][id] = record;
    dispatch("update", type, record);
    return { type, record, updatedAt: now };
  }

  function softDelete(type, id) {
    requireEditor();
    if (!RECORD_TYPES.includes(type)) throw new Error("Неизвестный тип карточки.");
    const next = loadState();
    const existing = currentRecord(type, id, next);
    if (!existing) throw new Error("Карточка не найдена.");
    const previousEntry = stateEntry(type, id, next);
    const now = new Date().toISOString();
    next.records[entryKey(type, id)] = {
      type,
      id,
      record: existing,
      createdAt: previousEntry?.createdAt || existing.editorCreatedAt || null,
      updatedAt: previousEntry?.updatedAt || existing.editorUpdatedAt || now,
      deletedAt: now,
    };
    next.lastIssued[type] = Math.max(next.lastIssued[type], numericId(type, id));
    appendAudit(next, "delete", type, id, existing.name, now);
    persist(next);
    state = next;
    delete registry[type][id];
    dispatch("delete", type, existing);
    return { type, record: existing, deletedAt: now };
  }

  function restore(type, id) {
    requireEditor();
    if (!RECORD_TYPES.includes(type)) throw new Error("Неизвестный тип карточки.");
    const next = loadState();
    const entry = stateEntry(type, id, next);
    if (!entry?.deletedAt) throw new Error("Удалённая карточка не найдена.");
    const now = new Date().toISOString();
    entry.deletedAt = null;
    entry.updatedAt = now;
    entry.record = normalizeRecord(type, { ...entry.record, editorUpdatedAt: now });
    appendAudit(next, "restore", type, id, entry.record.name, now);
    persist(next);
    state = next;
    registry[type][id] = entry.record;
    dispatch("restore", type, entry.record);
    return { type, record: entry.record, restoredAt: now };
  }

  function get(type, id, { includeDeleted = false } = {}) {
    if (!RECORD_TYPES.includes(type)) return null;
    const entry = stateEntry(type, id);
    if (entry?.deletedAt && !includeDeleted) return null;
    const record = currentRecord(type, id);
    return record ? clone(record) : null;
  }

  function listDeleted() {
    return Object.values(state.records)
      .filter((entry) => entry.deletedAt)
      .sort((left, right) => String(right.deletedAt).localeCompare(String(left.deletedAt)))
      .map((entry) => clone(entry));
  }

  function isDeleted(type, id) {
    return Boolean(stateEntry(type, id)?.deletedAt);
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    window.setTimeout(() => window.location.reload(), 80);
  });

  window.MIDGAS_EDITOR_STORE = Object.freeze({
    storageKey: STORAGE_KEY,
    legacyKey: LEGACY_KEY,
    list: () => Object.values(state.records).filter((entry) => !entry.deletedAt).map((entry) => clone(entry)),
    listDeleted,
    audit: () => clone(state.audit),
    get,
    isDeleted,
    nextId: (type) => nextId(type),
    create,
    update,
    softDelete,
    restore,
  });
})();
