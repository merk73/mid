(() => {
  const STORAGE_KEY = "midgas-editor-records-v1";
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

  function readEntries() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed)
        ? parsed.filter((entry) => RECORD_TYPES.includes(entry?.type) && entry?.record?.id)
        : [];
    } catch {
      return [];
    }
  }

  function normalizeRecord(type, record) {
    const meta = TYPE_META[type];
    return {
      ...record,
      id: String(record.id || ""),
      kind: record.kind || meta.kind,
      stage: record.stage || "НАБЛЮДЕНИЕ",
      loreState: record.loreState || "unique",
      loreNote: record.loreNote || "Карточка создана в редакционном модуле MIDGAS.",
      duplicateOf: record.duplicateOf || null,
      name: String(record.name || "БЕЗ НАЗВАНИЯ"),
      alias: String(record.alias || record.name || "БЕЗ НАЗВАНИЯ"),
      cardType: String(record.cardType || meta.defaultCardType),
      image: String(record.image || ""),
      summary: String(record.summary || ""),
      fields: Array.isArray(record.fields) ? record.fields : [],
      sections: Array.isArray(record.sections) ? record.sections : [],
    };
  }

  const initialEntries = readEntries();
  initialEntries.forEach((entry) => {
    const record = normalizeRecord(entry.type, entry.record);
    registry[entry.type][record.id] = record;
  });

  function nextId(type) {
    if (!RECORD_TYPES.includes(type)) throw new Error("Неизвестный тип карточки.");
    const prefix = TYPE_META[type].prefix;
    const maximum = Object.keys(registry[type]).reduce((result, id) => {
      if (!id.startsWith(prefix)) return result;
      const numeric = Number(id.slice(prefix.length));
      return Number.isFinite(numeric) ? Math.max(result, numeric) : result;
    }, 0);
    return `${prefix}${String(maximum + 1).padStart(4, "0")}`;
  }

  function create(payload) {
    const type = RECORD_TYPES.includes(payload?.type) ? payload.type : "client";
    const id = nextId(type);
    const createdAt = new Date().toISOString();
    const cardType = String(payload.cardType || TYPE_META[type].defaultCardType).trim();
    const name = String(payload.name || "").trim();
    const alias = String(payload.alias || name).trim();
    const location = String(payload.location || "Не раскрывается").trim();
    const status = String(payload.status || "НАБЛЮДЕНИЕ").trim();
    const threat = String(payload.threat || "T1 / низкий").trim();
    const access = String(payload.access || "D1 / открытый").trim();
    const summary = String(payload.summary || "").trim();
    const description = String(payload.description || summary).trim();

    if (!name || !summary || !description || !payload.image) {
      throw new Error("Заполните обязательные поля и загрузите изображение.");
    }

    const record = normalizeRecord(type, {
      id,
      kind: TYPE_META[type].kind,
      stage: status,
      name,
      alias,
      cardType,
      image: payload.image,
      summary,
      editorCreatedAt: createdAt,
      fields: [
        ["Тип", cardType],
        ["Статус", status],
        ["Уровень угрозы", threat],
        ["Уровень доступа", access],
        ["Местоположение", location],
      ],
      sections: [
        {
          title: "ПЕРВИЧНАЯ РЕГИСТРАЦИЯ",
          paragraphs: [description],
        },
      ],
    });

    const entries = readEntries().filter((entry) => !(entry.type === type && entry.record.id === id));
    entries.push({ type, record, createdAt });
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      const quotaError = new Error("Недостаточно места в локальном архиве. Загрузите изображение меньшего размера.");
      quotaError.cause = error;
      throw quotaError;
    }
    registry[type][id] = record;
    window.dispatchEvent(new CustomEvent("midgas:record-created", { detail: { type, record } }));
    return { type, record, createdAt };
  }

  window.MIDGAS_EDITOR_STORE = Object.freeze({
    storageKey: STORAGE_KEY,
    list: () => readEntries().map((entry) => ({ ...entry })),
    nextId,
    create,
  });
})();
