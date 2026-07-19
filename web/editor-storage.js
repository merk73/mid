(() => {
  const STORAGE_KEY = "midgas-editor-state-v2";
  const LEGACY_KEY = "midgas-editor-records-v1";
  const IMAGE_DB_NAME = "midgas-editor-images-v1";
  const IMAGE_STORE_NAME = "images";
  const IMAGE_REF_PREFIX = "midgas-image:";
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
  const resolvedImageUrls = new Map();
  const pendingImageUrls = new Map();
  let imageDbPromise = null;

  function isStoredImageRef(value) {
    return typeof value === "string" && value.startsWith(IMAGE_REF_PREFIX);
  }

  function isInlineImage(value) {
    return typeof value === "string" && /^data:image\//i.test(value);
  }

  function openImageDb() {
    if (!("indexedDB" in window) || !window.indexedDB) return Promise.resolve(null);
    if (imageDbPromise) return imageDbPromise;
    imageDbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(IMAGE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) db.createObjectStore(IMAGE_STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB недоступна."));
      request.onblocked = () => reject(new Error("Хранилище изображений заблокировано другой вкладкой."));
    });
    return imageDbPromise;
  }

  function dataUrlBlob(value) {
    const separator = value.indexOf(",");
    if (separator < 0) throw new Error("Повреждённый формат изображения.");
    const metadata = value.slice(5, separator);
    const payload = value.slice(separator + 1);
    const mimeType = metadata.split(";")[0] || "application/octet-stream";
    const binary = /;base64/i.test(metadata)
      ? window.atob(payload)
      : decodeURIComponent(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeType });
  }

  function imageToken() {
    return window.crypto?.randomUUID?.()
      || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  async function writeImageBlob(key, blob) {
    const db = await openImageDb();
    if (!db) return false;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(IMAGE_STORE_NAME, "readwrite");
      transaction.objectStore(IMAGE_STORE_NAME).put(blob, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Не удалось записать изображение."));
      transaction.onabort = () => reject(transaction.error || new Error("Запись изображения отменена."));
    });
    return true;
  }

  async function readImageBlob(key) {
    const db = await openImageDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(IMAGE_STORE_NAME, "readonly");
      const request = transaction.objectStore(IMAGE_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error || new Error("Не удалось прочитать изображение."));
    });
  }

  async function externalizeInlineImage(value, memo) {
    if (!isInlineImage(value)) return value;
    if (memo.has(value)) return memo.get(value);
    const db = await openImageDb();
    if (!db) return value;
    try {
      const blob = dataUrlBlob(value);
      const key = imageToken();
      await writeImageBlob(key, blob);
      const reference = `${IMAGE_REF_PREFIX}${key}`;
      memo.set(value, reference);
      if (window.URL?.createObjectURL) resolvedImageUrls.set(reference, window.URL.createObjectURL(blob));
      return reference;
    } catch (cause) {
      const error = new Error("Не удалось сохранить изображение в локальном медиахранилище. Освободите место браузера и повторите попытку.");
      error.cause = cause;
      throw error;
    }
  }

  async function externalizeImages(value, memo = new Map()) {
    if (isInlineImage(value)) return externalizeInlineImage(value, memo);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) value[index] = await externalizeImages(value[index], memo);
      return value;
    }
    if (!value || typeof value !== "object" || (typeof Blob !== "undefined" && value instanceof Blob)) return value;
    for (const key of Object.keys(value)) value[key] = await externalizeImages(value[key], memo);
    return value;
  }

  async function resolveImageReference(reference) {
    if (!isStoredImageRef(reference)) return reference;
    if (resolvedImageUrls.has(reference)) return resolvedImageUrls.get(reference);
    if (pendingImageUrls.has(reference)) return pendingImageUrls.get(reference);
    const pending = (async () => {
      try {
        const blob = await readImageBlob(reference.slice(IMAGE_REF_PREFIX.length));
        if (!blob || !window.URL?.createObjectURL) return reference;
        const url = window.URL.createObjectURL(blob);
        resolvedImageUrls.set(reference, url);
        return url;
      } catch {
        return reference;
      }
    })();
    pendingImageUrls.set(reference, pending);
    try {
      return await pending;
    } finally {
      pendingImageUrls.delete(reference);
    }
  }

  function resolvedImages(value) {
    if (isStoredImageRef(value)) return resolvedImageUrls.get(value) || value;
    if (Array.isArray(value)) return value.map(resolvedImages);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).reduce((result, key) => {
      result[key] = resolvedImages(value[key]);
      return result;
    }, {});
  }

  function emptyState() {
    return {
      version: 3,
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

  function normalizeClientAccess(value) {
    const source = String(value || "").trim();
    const code = source.match(/\bD([0-5])\b/i)?.[1];
    const levels = {
      1: "D1 / очень низкий",
      2: "D2 / низкий",
      3: "D3 / средний",
      4: "D4 / высокий",
      5: "D5 / полный доступ",
    };
    if (code) return levels[code === "0" ? 1 : code];
    const normalized = source.toLocaleLowerCase("ru").replaceAll("ё", "е");
    if (!normalized || normalized === "нет") return levels[1];
    if (normalized.includes("очень низк")) return levels[1];
    if (normalized.includes("низк")) return levels[2];
    if (normalized.includes("средн")) return levels[3];
    if (normalized.includes("полн")) return levels[5];
    if (normalized.includes("высок")) return levels[4];
    if (normalized.includes("высш") || normalized.includes("макс") || normalized.includes("маким")) return levels[5];
    return source;
  }

  function normalizeFields(type, fields) {
    if (!Array.isArray(fields)) return [];
    return fields.map((field) => {
      if (!Array.isArray(field)) return field;
      const [term, value, ...rest] = field;
      const normalizedTerm = String(term || "").toLocaleLowerCase("ru").replaceAll("ё", "е").trim();
      if (type === "client" && (normalizedTerm === "уровень доступа" || normalizedTerm === "осведомленность клиента")) {
        return ["Уровень доступа", normalizeClientAccess(value), ...rest];
      }
      return field;
    });
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
      caption: String(record?.caption || record?.alias || record?.cardType || meta.defaultCardType),
      isPublished: record?.isPublished !== false,
      image: String(record?.image || ""),
      gallery: Array.isArray(record?.gallery) ? record.gallery.slice(0, 9) : [],
      summary: String(record?.summary || ""),
      fields: normalizeFields(type, record?.fields),
      sections: Array.isArray(record?.sections) ? record.sections : [],
    };
    delete next.alias;
    delete next.cardType;
    Object.defineProperties(next, {
      alias: { value: next.caption, enumerable: false, configurable: true },
      cardType: { value: next.caption, enumerable: false, configurable: true },
    });
    if (Array.isArray(record?.editorRelations)) next.editorRelations = normalizeRelations(record.editorRelations);
    return next;
  }

  RECORD_TYPES.forEach((type) => {
    Object.entries(registry[type]).forEach(([id, record]) => {
      registry[type][id] = normalizeRecord(type, record);
    });
  });

  function displayRecord(type, record) {
    return normalizeRecord(type, resolvedImages(record));
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce((result, key) => {
      if (key !== "editorUpdatedAt") result[key] = stableValue(value[key]);
      return result;
    }, {});
  }

  function recordsMatch(left, right) {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
  }

  function normalizeEntry(value) {
    const type = RECORD_TYPES.includes(value?.type) ? value.type : "";
    const id = String(value?.id || value?.record?.id || "").trim();
    if (!type || !id || !value?.record) return null;
    const record = normalizeRecord(type, { ...value.record, id });
    const origin = value.origin === "created" || value.origin === "base"
      ? value.origin
      : baseRegistry[type]?.[id] ? "base" : "created";
    const publicationRecord = value.publicationRecord
      ? normalizeRecord(type, value.publicationRecord)
      : origin === "created" ? normalizeRecord(type, record) : null;
    const published = publicationRecord || (origin === "base" ? baseRegistry[type]?.[id] : null);
    const storedRevision = Number(value.revisionCount);
    const revisionCount = Number.isInteger(storedRevision) && storedRevision >= 0
      ? storedRevision
      : published && !recordsMatch(record, published) ? 1 : 0;
    return {
      type,
      id,
      origin,
      syncSource: value.syncSource === "remote" ? "remote" : "local",
      record,
      publicationRecord,
      revisionCount,
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
    const visibleRecord = displayRecord(type, record);
    window.dispatchEvent(new CustomEvent("midgas:record-mutated", { detail: { action, type, record: visibleRecord } }));
    if (action === "create") {
      window.dispatchEvent(new CustomEvent("midgas:record-created", { detail: { type, record: visibleRecord } }));
    }
  }

  function applyState(next) {
    Object.values(next.records).forEach((entry) => {
      if (entry.deletedAt) delete registry[entry.type][entry.id];
      else registry[entry.type][entry.id] = displayRecord(entry.type, entry.record);
    });
  }

  let state = loadState();
  applyState(state);
  if (!window.localStorage.getItem(STORAGE_KEY) && Object.keys(state.records).length) {
    try { persist(state); } catch { /* Existing legacy records remain readable for this session. */ }
  }

  function collectStoredImageRefs(value, result = new Set()) {
    if (isStoredImageRef(value)) result.add(value);
    else if (Array.isArray(value)) value.forEach((item) => collectStoredImageRefs(item, result));
    else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStoredImageRefs(item, result));
    return result;
  }

  async function hydrateImageElement(image) {
    const reference = image?.getAttribute?.("src") || "";
    if (!isStoredImageRef(reference)) return;
    const resolved = await resolveImageReference(reference);
    if (resolved !== reference && image.getAttribute("src") === reference) image.src = resolved;
  }

  function hydrateImageTree(root) {
    if (!root) return;
    if (root.matches?.("img")) hydrateImageElement(root);
    root.querySelectorAll?.("img").forEach(hydrateImageElement);
  }

  if (typeof document !== "undefined" && window.MutationObserver) {
    const imageObserver = new window.MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes") hydrateImageElement(mutation.target);
        mutation.addedNodes?.forEach(hydrateImageTree);
      });
    });
    imageObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });
  }

  const imagesReady = (async () => {
    const references = [...collectStoredImageRefs(state)];
    await Promise.all(references.map(resolveImageReference));
    applyState(state);
    if (typeof document !== "undefined") hydrateImageTree(document);
    window.dispatchEvent(new CustomEvent("midgas:images-ready"));
  })();

  function stateEntry(type, id, source = state) {
    return source.records[entryKey(type, id)] || null;
  }

  function currentRecord(type, id, source = state) {
    const entry = stateEntry(type, id, source);
    if (entry?.syncSource === "remote" && registry[type]?.[id]) return normalizeRecord(type, registry[type][id]);
    if (entry) return normalizeRecord(type, entry.record);
    const base = baseRegistry[type]?.[id] || registry[type]?.[id];
    return base ? normalizeRecord(type, base) : null;
  }

  function publicationRecord(type, id, source = state) {
    const entry = stateEntry(type, id, source);
    if (entry?.publicationRecord) return normalizeRecord(type, entry.publicationRecord);
    const base = baseRegistry[type]?.[id];
    return base ? normalizeRecord(type, base) : null;
  }

  function entryIsModified(entry, source = state) {
    if (!entry || entry.deletedAt) return false;
    const published = publicationRecord(entry.type, entry.id, source);
    return Boolean(published && !recordsMatch(entry.record, published));
  }

  function nextId(type, source = state) {
    if (!RECORD_TYPES.includes(type)) throw new Error("Неизвестный тип карточки.");
    const number = Math.max(0, Number(source.lastIssued[type]) || 0) + 1;
    return `${TYPE_META[type].prefix}${String(number).padStart(4, "0")}`;
  }

  function supabaseBridge() {
    const bridge = window.MIDGAS_SUPABASE_DATA;
    return bridge?.isConfigured?.() ? bridge : null;
  }

  function buildCreatedSections(sections, description, relations) {
    const additional = (Array.isArray(sections) ? sections : []).map((section) => ({
      title: String(section?.title || "НОВЫЙ РАЗДЕЛ").trim() || "НОВЫЙ РАЗДЕЛ",
      paragraphs: (Array.isArray(section?.paragraphs) ? section.paragraphs : [])
        .map((paragraph) => String(paragraph || "").trim())
        .filter(Boolean),
    })).filter((section) => section.paragraphs.length);
    return [{
      title: "ПЕРВИЧНАЯ РЕГИСТРАЦИЯ",
      paragraphs: [description],
      relatedRecords: relations,
    }, ...additional];
  }

  function remoteCreateDraft(payload, type) {
    const now = new Date().toISOString();
    const caption = String(payload.caption || payload.alias || payload.cardType || TYPE_META[type].defaultCardType).trim();
    const name = String(payload.name || "").trim();
    const location = String(payload.location || "Не раскрывается").trim();
    const threat = String(payload.threat || "T1 / низкий").trim();
    const access = normalizeClientAccess(payload.access || "D1 / очень низкий");
    const summary = String(payload.summary || "").trim();
    const description = String(payload.description || summary).trim();
    const relations = normalizeRelations(payload.relations);
    if (!name || !summary || !description || !payload.image) {
      throw new Error("Заполните обязательные поля и загрузите изображение.");
    }
    const fields = [
      ["Уровень угрозы", threat],
      ["Местоположение", location],
    ];
    if (type === "client") fields.splice(2, 0, ["Уровень доступа", access]);
    if (relations.length) fields.push(["Связанные записи", relations.map((item) => item.id).join(", ")]);
    return {
      relations,
      record: normalizeRecord(type, {
        id: "",
        kind: TYPE_META[type].kind,
        stage: "НА САЙТЕ",
        name,
        caption,
        isPublished: payload.isPublished !== false,
        image: payload.image,
        gallery: Array.isArray(payload.gallery) ? payload.gallery.slice(0, 9) : [],
        summary,
        editorCreatedAt: now,
        editorUpdatedAt: now,
        editorRelations: relations,
        editorRelationsVersion: 1,
        geo: payload.geo || null,
        fields,
        sections: buildCreatedSections(payload.sections, description, relations),
      }),
    };
  }

  function cacheRemoteMutation(action, result) {
    const type = RECORD_TYPES.includes(result?.type) ? result.type : "";
    const id = String(result?.record?.id || result?.row?.record_code || "").trim();
    if (!type || !id || !result?.record) return result;
    const next = loadState();
    const previous = stateEntry(type, id, next);
    const now = String(
      result.updatedAt || result.createdAt || result.deletedAt || result.restoredAt || result.resetAt || new Date().toISOString(),
    );
    const record = normalizeRecord(type, { ...result.record, id });
    const published = result.publicationRecord
      ? normalizeRecord(type, { ...result.publicationRecord, id })
      : previous?.publicationRecord || (baseRegistry[type]?.[id] ? normalizeRecord(type, baseRegistry[type][id]) : clone(record));
    const origin = action === "create"
      ? "created"
      : previous?.origin || (baseRegistry[type]?.[id] ? "base" : "created");
    const deletedAt = action === "delete" ? String(result.deletedAt || now) : null;
    next.records[entryKey(type, id)] = {
      type,
      id,
      origin,
      syncSource: "remote",
      record,
      publicationRecord: published,
      revisionCount: action === "reset" || action === "create"
        ? 0
        : action === "update" ? (previous?.revisionCount || 0) + 1 : previous?.revisionCount || 0,
      createdAt: String(result.createdAt || previous?.createdAt || record.editorCreatedAt || now),
      updatedAt: now,
      deletedAt,
    };
    next.lastIssued[type] = Math.max(next.lastIssued[type], numericId(type, id));
    appendAudit(next, action, type, id, record.name, now);
    try { persist(next); } catch { /* Supabase remains authoritative if the local cache is full. */ }
    state = next;
    if (deletedAt) delete registry[type][id];
    else registry[type][id] = displayRecord(type, record);
    dispatch(action, type, record);
    return {
      ...result,
      type,
      record: displayRecord(type, record),
      sync: "remote",
      syncMessage: result.syncMessage || "Сохранено в Supabase.",
    };
  }

  async function createLocal(payload) {
    requireEditor();
    const type = RECORD_TYPES.includes(payload?.type) ? payload.type : "client";
    const next = loadState();
    const imageMemo = new Map();
    await externalizeImages(next, imageMemo);
    const id = nextId(type, next);
    const now = new Date().toISOString();
    const caption = String(payload.caption || payload.alias || payload.cardType || TYPE_META[type].defaultCardType).trim();
    const name = String(payload.name || "").trim();
    const location = String(payload.location || "Не раскрывается").trim();
    const threat = String(payload.threat || "T1 / низкий").trim();
    const access = normalizeClientAccess(payload.access || "D1 / очень низкий");
    const summary = String(payload.summary || "").trim();
    const description = String(payload.description || summary).trim();
    const relations = normalizeRelations(payload.relations);

    if (!name || !summary || !description || !payload.image) {
      throw new Error("Заполните обязательные поля и загрузите изображение.");
    }
    const image = await externalizeInlineImage(String(payload.image), imageMemo);

    const fields = [
      ["Уровень угрозы", threat],
      ["Местоположение", location],
    ];
    if (type === "client") fields.splice(2, 0, ["Уровень доступа", access]);
    if (relations.length) fields.push(["Связанные записи", relations.map((item) => item.id).join(", ")]);

    const record = normalizeRecord(type, {
      id,
      kind: TYPE_META[type].kind,
      stage: "НА САЙТЕ",
      name,
      caption,
      isPublished: payload.isPublished !== false,
      image,
      gallery: [],
      summary,
      editorCreatedAt: now,
      editorUpdatedAt: now,
      editorRelations: relations,
      editorRelationsVersion: 1,
      geo: payload.geo || null,
      fields,
      sections: buildCreatedSections(payload.sections, description, relations),
    });

    next.lastIssued[type] = numericId(type, id);
    next.records[entryKey(type, id)] = {
      type,
      id,
      origin: "created",
      record,
      publicationRecord: clone(record),
      revisionCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    appendAudit(next, "create", type, id, name, now);
    persist(next);
    state = next;
    registry[type][id] = displayRecord(type, record);
    dispatch("create", type, record);
    return { type, record: displayRecord(type, record), createdAt: now };
  }

  async function create(payload) {
    requireEditor();
    const bridge = supabaseBridge();
    if (!bridge) return createLocal(payload);
    const type = RECORD_TYPES.includes(payload?.type) ? payload.type : "client";
    const draft = remoteCreateDraft(payload, type);
    try {
      await bridge.ready;
      const result = await bridge.createRecord({ type, record: draft.record, relations: draft.relations });
      return cacheRemoteMutation("create", result);
    } catch (error) {
      if (!bridge.isNetworkError?.(error)) throw error;
      const local = await createLocal(payload);
      bridge.markLocalFallback?.("Создание записи", error);
      return { ...local, sync: "local-fallback", syncMessage: "Нет сети: сохранено только в локальном резерве." };
    }
  }

  async function updateLocal(type, id, patch = {}) {
    requireEditor();
    if (!RECORD_TYPES.includes(type)) throw new Error("Неизвестный тип карточки.");
    const next = loadState();
    const imageMemo = new Map();
    await externalizeImages(next, imageMemo);
    const existingEntry = stateEntry(type, id, next);
    if (existingEntry?.deletedAt) throw new Error("Сначала восстановите удалённую карточку.");
    const existing = currentRecord(type, id, next);
    if (!existing) throw new Error("Карточка не найдена.");
    const now = new Date().toISOString();
    const safePatch = await externalizeImages({ ...patch }, imageMemo);
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
      origin: existingEntry?.origin || (baseRegistry[type]?.[id] ? "base" : "created"),
      record,
      publicationRecord: existingEntry?.publicationRecord || (baseRegistry[type]?.[id] ? null : clone(existing)),
      revisionCount: (existingEntry?.revisionCount || 0) + 1,
      createdAt: existingEntry?.createdAt || existing.editorCreatedAt || null,
      updatedAt: now,
      deletedAt: null,
    };
    next.lastIssued[type] = Math.max(next.lastIssued[type], numericId(type, id));
    appendAudit(next, "update", type, id, record.name, now);
    persist(next);
    state = next;
    registry[type][id] = displayRecord(type, record);
    dispatch("update", type, record);
    return { type, record: displayRecord(type, record), updatedAt: now };
  }

  async function update(type, id, patch = {}) {
    requireEditor();
    if (!RECORD_TYPES.includes(type)) throw new Error("Неизвестный тип карточки.");
    const bridge = supabaseBridge();
    if (!bridge) return updateLocal(type, id, patch);
    try {
      await bridge.ready;
      const result = await bridge.updateRecord(type, id, { ...patch, editorUpdatedAt: new Date().toISOString() });
      return cacheRemoteMutation("update", result);
    } catch (error) {
      if (!bridge.isNetworkError?.(error)) throw error;
      const local = await updateLocal(type, id, patch);
      bridge.markLocalFallback?.(`Обновление ${id}`, error);
      return { ...local, sync: "local-fallback", syncMessage: "Нет сети: сохранено только в локальном резерве." };
    }
  }

  function softDeleteLocal(type, id) {
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
      origin: previousEntry?.origin || (baseRegistry[type]?.[id] ? "base" : "created"),
      record: existing,
      publicationRecord: previousEntry?.publicationRecord || (baseRegistry[type]?.[id] ? null : clone(existing)),
      revisionCount: previousEntry?.revisionCount || 0,
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

  function softDelete(type, id) {
    requireEditor();
    const bridge = supabaseBridge();
    if (!bridge) return softDeleteLocal(type, id);
    return (async () => {
      try {
        await bridge.ready;
        return cacheRemoteMutation("delete", await bridge.softDeleteRecord(type, id));
      } catch (error) {
        if (!bridge.isNetworkError?.(error)) throw error;
        const local = softDeleteLocal(type, id);
        bridge.markLocalFallback?.(`Удаление ${id}`, error);
        return { ...local, sync: "local-fallback", syncMessage: "Нет сети: удаление сохранено только локально." };
      }
    })();
  }

  function restoreLocal(type, id) {
    requireEditor();
    if (!RECORD_TYPES.includes(type)) throw new Error("Неизвестный тип карточки.");
    const next = loadState();
    const entry = stateEntry(type, id, next);
    if (!entry?.deletedAt) throw new Error("Удалённая карточка не найдена.");
    const now = new Date().toISOString();
    entry.deletedAt = null;
    entry.syncSource = "local";
    entry.updatedAt = now;
    entry.record = normalizeRecord(type, { ...entry.record, editorUpdatedAt: now });
    appendAudit(next, "restore", type, id, entry.record.name, now);
    persist(next);
    state = next;
    registry[type][id] = displayRecord(type, entry.record);
    dispatch("restore", type, entry.record);
    return { type, record: displayRecord(type, entry.record), restoredAt: now };
  }

  function restore(type, id) {
    requireEditor();
    const bridge = supabaseBridge();
    if (!bridge) return restoreLocal(type, id);
    return (async () => {
      try {
        await bridge.ready;
        return cacheRemoteMutation("restore", await bridge.restoreRecord(type, id));
      } catch (error) {
        if (!bridge.isNetworkError?.(error)) throw error;
        const local = restoreLocal(type, id);
        bridge.markLocalFallback?.(`Восстановление ${id}`, error);
        return { ...local, sync: "local-fallback", syncMessage: "Нет сети: восстановление сохранено только локально." };
      }
    })();
  }

  function resetToPublishedLocal(type, id) {
    requireEditor();
    if (!RECORD_TYPES.includes(type)) throw new Error("Неизвестный тип карточки.");
    const next = loadState();
    const entry = stateEntry(type, id, next);
    if (!entry || entry.deletedAt) throw new Error("Активная отредактированная карточка не найдена.");
    const published = publicationRecord(type, id, next);
    if (!published) throw new Error("Исходная опубликованная версия не найдена.");
    const now = new Date().toISOString();
    let record;
    if (entry.origin === "base") {
      record = normalizeRecord(type, published);
      delete next.records[entryKey(type, id)];
    } else {
      record = normalizeRecord(type, { ...published, editorUpdatedAt: now });
      entry.record = record;
      entry.syncSource = "local";
      entry.updatedAt = now;
      entry.deletedAt = null;
      entry.revisionCount = 0;
    }
    appendAudit(next, "reset", type, id, record.name, now);
    next.lastIssued[type] = Math.max(next.lastIssued[type], numericId(type, id));
    persist(next);
    state = next;
    registry[type][id] = displayRecord(type, record);
    dispatch("reset", type, record);
    return { type, record: displayRecord(type, record), resetAt: now };
  }

  function resetToPublished(type, id) {
    requireEditor();
    const bridge = supabaseBridge();
    if (!bridge) return resetToPublishedLocal(type, id);
    return (async () => {
      try {
        await bridge.ready;
        return cacheRemoteMutation("reset", await bridge.resetRecord(type, id));
      } catch (error) {
        if (!bridge.isNetworkError?.(error)) throw error;
        const local = resetToPublishedLocal(type, id);
        bridge.markLocalFallback?.(`Сброс ${id}`, error);
        return { ...local, sync: "local-fallback", syncMessage: "Нет сети: сброс сохранён только локально." };
      }
    })();
  }

  function get(type, id, { includeDeleted = false } = {}) {
    if (!RECORD_TYPES.includes(type)) return null;
    const entry = stateEntry(type, id);
    if (entry?.deletedAt && !includeDeleted) return null;
    const record = currentRecord(type, id);
    return record ? clone(displayRecord(type, record)) : null;
  }

  function listDeleted() {
    return Object.values(state.records)
      .filter((entry) => entry.deletedAt)
      .sort((left, right) => String(right.deletedAt).localeCompare(String(left.deletedAt)))
      .map((entry) => clone(entry));
  }

  function listModified() {
    return Object.values(state.records)
      .filter((entry) => entryIsModified(entry, state))
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
      .map((entry) => clone(entry));
  }

  function isDeleted(type, id) {
    return Boolean(stateEntry(type, id)?.deletedAt);
  }

  window.addEventListener("midgas:records-ready", (event) => {
    const rows = Array.isArray(event.detail?.records) ? event.detail.records : [];
    if (!rows.length) return;
    const activeCodes = new Set(rows.map((row) => String(row?.record_code || "")));
    const next = loadState();
    let changed = false;
    Object.values(next.records).forEach((entry) => {
      if (entry.syncSource !== "remote" || !activeCodes.has(entry.id) || !registry[entry.type]?.[entry.id]) return;
      entry.record = normalizeRecord(entry.type, registry[entry.type][entry.id]);
      const row = rows.find((candidate) => candidate?.record_code === entry.id);
      entry.updatedAt = String(row?.updated_at || entry.updatedAt || "");
      entry.deletedAt = null;
      changed = true;
    });
    if (!changed) return;
    try { persist(next); } catch { /* The remote registry is still available in memory. */ }
    state = next;
    applyState(state);
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    window.setTimeout(() => window.location.reload(), 80);
  });

  window.MIDGAS_EDITOR_STORE = Object.freeze({
    storageKey: STORAGE_KEY,
    legacyKey: LEGACY_KEY,
    imagesReady,
    imageReferencePrefix: IMAGE_REF_PREFIX,
    imagesReady,
    resolveImage: resolveImageReference,
    list: () => Object.values(state.records).filter((entry) => !entry.deletedAt).map((entry) => clone(entry)),
    listDeleted,
    listModified,
    audit: () => clone(state.audit),
    get,
    getPublication: (type, id) => {
      const record = publicationRecord(type, id);
      return record ? clone(displayRecord(type, record)) : null;
    },
    isModified: (type, id) => {
      const entry = stateEntry(type, id);
      return entryIsModified(entry, state);
    },
    isDeleted,
    nextId: (type) => nextId(type),
    create,
    update,
    softDelete,
    restore,
    resetToPublished,
  });
})();
