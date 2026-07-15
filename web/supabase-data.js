(() => {
  "use strict";

  const RECORD_TYPES = ["client", "anomaly", "incident"];
  const RECORDS_TABLE = "records";
  const RELATIONSHIPS_TABLE = "relationships";
  const MEMBERS_TABLE = "editor_members";
  const STORAGE_BUCKET = "record-covers";
  const SYNC_EVENT = "midgas:sync-status";
  const READY_EVENT = "midgas:records-ready";
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const MIME_EXTENSIONS = Object.freeze({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  });
  const RECORD_SELECT = "id,record_type,record_no,record_code,content,cover_path,publication_snapshot,published_at,version,deleted_at,created_at,updated_at";

  const registry = window.MIDGAS_RECORDS || (window.MIDGAS_RECORDS = {});
  RECORD_TYPES.forEach((type) => {
    if (!registry[type] || typeof registry[type] !== "object") registry[type] = {};
  });

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  const originalRegistry = Object.fromEntries(RECORD_TYPES.map((type) => [type, clone(registry[type])]));
  const expectedSeedCodes = Object.fromEntries(RECORD_TYPES.map((type) => [type, Object.keys(registry[type])]));
  const rowsByCode = new Map();
  const codeByUuid = new Map();
  const uuidByCode = new Map();
  const overlaidCodes = new Set();
  let remoteRelationshipPairs = [];
  let generatedClient = null;
  let status = Object.freeze({
    state: "initializing",
    remote: false,
    message: "Проверка подключения к Supabase…",
    at: new Date().toISOString(),
  });

  class MidgasSupabaseError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = "MidgasSupabaseError";
      this.code = options.code || "SUPABASE_ERROR";
      this.status = Number(options.status) || 0;
      this.network = Boolean(options.network);
      this.remoteCommitted = Boolean(options.remoteCommitted);
      if (options.cause) this.cause = options.cause;
    }
  }

  function dispatch(name, detail) {
    if (typeof window.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function setStatus(stateName, message, extra = {}) {
    status = Object.freeze({
      state: stateName,
      remote: stateName === "synced" || stateName === "syncing" || stateName === "loading",
      message: String(message || ""),
      at: new Date().toISOString(),
      ...extra,
    });
    dispatch(SYNC_EVENT, status);
    return status;
  }

  function readConfig() {
    const source = window.MIDGAS_SUPABASE_CONFIG;
    if (!source || typeof source !== "object") return null;
    const url = String(
      source.url || source.supabaseUrl || source.projectUrl || source.projectURL || source.SUPABASE_URL || "",
    ).trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
    const publishableKey = String(
      source.publishableKey || source.publicKey || source.anonKey || source.key || source.SUPABASE_PUBLISHABLE_KEY || "",
    ).trim();
    return url && publishableKey ? { url, publishableKey } : null;
  }

  function getClient() {
    if (window.MIDGAS_SUPABASE_CLIENT) return window.MIDGAS_SUPABASE_CLIENT;
    const config = readConfig();
    const factory = window.supabase?.createClient;
    if (!config || typeof factory !== "function") return null;
    if (!generatedClient) {
      generatedClient = factory(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      window.MIDGAS_SUPABASE_CLIENT = generatedClient;
    }
    return generatedClient;
  }

  function isConfigured() {
    return Boolean(window.MIDGAS_SUPABASE_CLIENT || readConfig());
  }

  function statusNumber(error) {
    return Number(error?.status || error?.statusCode || error?.context?.status || 0) || 0;
  }

  function isNetworkError(error) {
    if (!error) return false;
    if (error.network === true) return true;
    const numericStatus = statusNumber(error);
    if (numericStatus === 408 || numericStatus === 502 || numericStatus === 503 || numericStatus === 504) return true;
    if (error instanceof TypeError && /fetch|network|load/i.test(String(error.message || ""))) return true;
    return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed?\s*out|connection (?:reset|refused)|ERR_(?:NETWORK|INTERNET|CONNECTION)/i
      .test(String(error.message || error.details || ""));
  }

  function readableError(error, context) {
    if (error instanceof MidgasSupabaseError) return error;
    const code = String(error?.code || "SUPABASE_ERROR");
    const statusCode = statusNumber(error);
    const raw = String(error?.message || error?.details || error?.hint || "Неизвестная ошибка Supabase.");
    if (code === "42P01" || code === "PGRST205" || /relation .* does not exist|schema cache/i.test(raw)) {
      return new MidgasSupabaseError(
        "Таблицы MIDGAS не найдены в Supabase. Сначала выполните schema- и seed-миграции из папки supabase/migrations.",
        { code: "SCHEMA_REQUIRED", status: statusCode, cause: error },
      );
    }
    if (isNetworkError(error)) {
      return new MidgasSupabaseError(
        `Нет связи с Supabase${context ? ` (${context})` : ""}. Изменение можно сохранить в локальный резерв и синхронизировать позже.`,
        { code: "NETWORK_UNAVAILABLE", status: statusCode, network: true, cause: error },
      );
    }
    return new MidgasSupabaseError(
      `${context ? `${context}: ` : ""}${raw}`,
      { code, status: statusCode, cause: error },
    );
  }

  function requireClient() {
    const client = getClient();
    if (client) return client;
    throw new MidgasSupabaseError(
      "Supabase настроен не полностью: загрузите supabase-js и создайте window.MIDGAS_SUPABASE_CLIENT до supabase-data.js.",
      { code: "CLIENT_NOT_READY" },
    );
  }

  function checked(response, context) {
    if (response?.error) throw readableError(response.error, context);
    return response?.data;
  }

  async function ensureApprovedEditor() {
    const client = requireClient();
    let authResult;
    try {
      authResult = await client.auth.getUser();
    } catch (error) {
      throw readableError(error, "проверка сеанса");
    }
    const user = checked(authResult, "проверка сеанса")?.user;
    if (!user?.id) {
      throw new MidgasSupabaseError("Сеанс Supabase не найден. Войдите в аккаунт редактора.", { code: "AUTH_REQUIRED", status: 401 });
    }

    let query = client.from(MEMBERS_TABLE).select("role,approved_at").eq("user_id", user.id);
    const membershipResult = typeof query.maybeSingle === "function" ? await query.maybeSingle() : await query.single();
    const member = checked(membershipResult, "проверка прав редактора");
    if (!member || !["editor", "admin"].includes(member.role) || !member.approved_at) {
      throw new MidgasSupabaseError(
        "Аккаунт ещё не одобрен как редактор MIDGAS. Локальное сохранение не используется при отказе в доступе.",
        { code: "EDITOR_NOT_APPROVED", status: 403 },
      );
    }
    return { client, user, member };
  }

  function typeFromCode(code) {
    const value = String(code || "").toUpperCase();
    if (/^MID-C-\d{4,}$/.test(value)) return "client";
    if (/^MID-A-\d{4,}$/.test(value)) return "anomaly";
    if (/^MID-I-\d{4,}$/.test(value)) return "incident";
    return "";
  }

  function publicUrlForPath(path) {
    const value = String(path || "").trim();
    if (!value || /^(?:https?:|data:|blob:|midgas-image:)/i.test(value)) return value;
    const client = getClient();
    if (client?.storage?.from) {
      const result = client.storage.from(STORAGE_BUCKET).getPublicUrl(value);
      return result?.data?.publicUrl || result?.publicURL || value;
    }
    const config = readConfig();
    if (!config) return value;
    const encoded = value.split("/").map(encodeURIComponent).join("/");
    return `${config.url}/storage/v1/object/public/${encodeURIComponent(STORAGE_BUCKET)}/${encoded}`;
  }

  function rowToRecord(row) {
    const type = RECORD_TYPES.includes(row?.record_type) ? row.record_type : typeFromCode(row?.record_code);
    const record = row?.content && typeof row.content === "object" && !Array.isArray(row.content)
      ? clone(row.content)
      : {};
    const code = String(row?.record_code || record.id || "").trim();
    const coverUrl = publicUrlForPath(row?.cover_path);
    record.id = code;
    if (!record.kind && type) record.kind = type.toUpperCase();
    if (coverUrl && (!record.image || /^(?:data:|blob:|midgas-image:)/i.test(record.image))) record.image = coverUrl;
    if (coverUrl && (!record.cardImage || /^(?:data:|blob:|midgas-image:)/i.test(record.cardImage))) record.cardImage = coverUrl;
    return record;
  }

  function rememberRow(row) {
    const code = String(row?.record_code || "");
    const uuid = String(row?.id || "");
    if (!code || !uuid) return;
    rowsByCode.set(code, clone(row));
    uuidByCode.set(code, uuid);
    codeByUuid.set(uuid, code);
  }

  function restoreOriginalOverlay() {
    overlaidCodes.forEach((code) => {
      const type = typeFromCode(code);
      if (!type) return;
      if (originalRegistry[type]?.[code]) registry[type][code] = clone(originalRegistry[type][code]);
      else delete registry[type][code];
    });
    overlaidCodes.clear();
  }

  function relationObject(code) {
    const type = typeFromCode(code);
    const target = registry[type]?.[code];
    return { type, id: code, label: target?.name || target?.alias || code };
  }

  function mergedPairs(staticPairs = []) {
    const seen = new Set();
    return [...staticPairs, ...remoteRelationshipPairs].reduce((result, pair) => {
      const left = String(pair?.[0] || "");
      const right = String(pair?.[1] || "");
      if (!left || !right || left === right) return result;
      const key = [left, right].sort().join("|");
      if (seen.has(key)) return result;
      seen.add(key);
      result.push([left, right]);
      return result;
    }, []);
  }

  function installRelationshipFacade() {
    const existing = window.MIDGAS_RELATIONS;
    const pairs = mergedPairs(Array.isArray(existing?.pairs) ? existing.pairs : []);
    const api = {
      pairs: pairs.map((pair) => [...pair]),
      typeFromId: typeFromCode,
      forRecord(type, id) {
        const recordCode = String(id || "");
        const seen = new Set();
        return pairs.reduce((result, pair) => {
          const targetCode = pair[0] === recordCode ? pair[1] : pair[1] === recordCode ? pair[0] : "";
          const targetType = typeFromCode(targetCode);
          const key = `${targetType}:${targetCode}`;
          if (!targetType || !targetCode || seen.has(key)) return result;
          seen.add(key);
          result.push(relationObject(targetCode));
          return result;
        }, []);
      },
    };
    window.MIDGAS_RELATIONS = Object.freeze(api);
    window.MIDGAS_REMOTE_RELATIONSHIPS = Object.freeze(remoteRelationshipPairs.map((pair) => Object.freeze([...pair])));
  }

  function applyRelationships(rows) {
    const byCode = new Map();
    remoteRelationshipPairs = [];
    (rows || []).forEach((relationship) => {
      const sourceCode = codeByUuid.get(String(relationship?.source_id || ""));
      const targetCode = codeByUuid.get(String(relationship?.target_id || ""));
      if (!sourceCode || !targetCode || sourceCode === targetCode) return;
      remoteRelationshipPairs.push([sourceCode, targetCode]);
      if (!byCode.has(sourceCode)) byCode.set(sourceCode, []);
      if (!byCode.has(targetCode)) byCode.set(targetCode, []);
      byCode.get(sourceCode).push(relationObject(targetCode));
      byCode.get(targetCode).push(relationObject(sourceCode));
    });
    rowsByCode.forEach((row, code) => {
      const type = row.record_type;
      const record = registry[type]?.[code];
      if (record) record.editorRelations = clone(byCode.get(code) || []);
    });
    installRelationshipFacade();
  }

  async function loadPublicRecords({ throwOnError = false } = {}) {
    if (!isConfigured()) {
      setStatus("disabled", "Supabase не настроен — сайт использует встроенные записи.", { remote: false });
      const result = { records: [], relationships: [], fallback: true, configured: false };
      dispatch(READY_EVENT, result);
      return result;
    }
    setStatus("loading", "Загрузка записей из Supabase…");
    try {
      const client = requireClient();
      const [recordResult, relationshipResult] = await Promise.all([
        client.from(RECORDS_TABLE).select(RECORD_SELECT).is("deleted_at", null).order("record_no", { ascending: true }),
        client.from(RELATIONSHIPS_TABLE).select("id,source_id,target_id"),
      ]);
      const rows = checked(recordResult, "загрузка записей") || [];
      const relationships = checked(relationshipResult, "загрузка связей") || [];

      restoreOriginalOverlay();
      rowsByCode.clear();
      codeByUuid.clear();
      uuidByCode.clear();
      rows.forEach((row) => {
        const type = RECORD_TYPES.includes(row?.record_type) ? row.record_type : "";
        const code = String(row?.record_code || "");
        if (!type || !code) return;
        rememberRow(row);
        registry[type][code] = rowToRecord(row);
        overlaidCodes.add(code);
      });
      applyRelationships(relationships);
      const result = { records: clone(rows), relationships: clone(relationships), fallback: false, configured: true };
      setStatus("synced", `Supabase: загружено записей — ${rows.length}, связей — ${relationships.length}.`, {
        recordCount: rows.length,
        relationshipCount: relationships.length,
      });
      dispatch(READY_EVENT, result);
      return result;
    } catch (cause) {
      const error = readableError(cause, "загрузка данных");
      setStatus(error.network ? "offline" : "error", error.message, { error, remote: false });
      const result = { records: [], relationships: [], fallback: true, configured: true, error };
      dispatch(READY_EVENT, result);
      if (throwOnError) throw error;
      return result;
    }
  }

  async function loadChangeFeed(limit = 300) {
    if (!isConfigured()) return [];
    const client = requireClient();
    const response = await client
      .from("change_feed")
      .select("id,action,record_type,record_code,record_name,details,occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(Math.min(500, Math.max(1, Number(limit) || 300)));
    return clone(checked(response, "загрузка журнала изменений") || []);
  }

  function seedRequired(code) {
    return new MidgasSupabaseError(
      `Запись ${code} отсутствует в Supabase. Сначала выполните seed-миграцию базовых записей MIDGAS (RUN SEED MIGRATION), затем повторите операцию.`,
      { code: "SEED_REQUIRED", status: 409 },
    );
  }

  async function findRowByCode(client, code) {
    let query = client.from(RECORDS_TABLE).select(RECORD_SELECT).eq("record_code", code);
    const response = typeof query.maybeSingle === "function" ? await query.maybeSingle() : await query.single();
    const row = checked(response, `поиск записи ${code}`);
    if (!row) throw seedRequired(code);
    rememberRow(row);
    return row;
  }

  async function ensureTypeSeeded(client, type) {
    const expected = expectedSeedCodes[type] || [];
    if (!expected.length) return;
    const response = await client.from(RECORDS_TABLE).select("record_code").in("record_code", expected);
    const rows = checked(response, "проверка seed-миграции") || [];
    const available = new Set(rows.map((row) => String(row.record_code || "")));
    const missing = expected.find((code) => !available.has(code));
    if (missing) throw seedRequired(missing);
  }

  function uuidV4() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    if (!window.crypto?.getRandomValues) {
      throw new MidgasSupabaseError("Браузер не поддерживает безопасную генерацию UUID для имени файла.", { code: "UUID_UNAVAILABLE" });
    }
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  function isUploadableImage(value) {
    return (typeof Blob !== "undefined" && value instanceof Blob)
      || (typeof value === "string" && /^(?:data:image\/|blob:|midgas-image:)/i.test(value));
  }

  async function imageBlob(value) {
    if (typeof Blob !== "undefined" && value instanceof Blob) return value;
    let source = String(value || "");
    if (source.startsWith("midgas-image:")) {
      source = await window.MIDGAS_EDITOR_STORE?.resolveImage?.(source) || source;
      if (source.startsWith("midgas-image:")) {
        throw new MidgasSupabaseError("Локальное изображение не найдено. Выберите файл заново.", { code: "LOCAL_IMAGE_MISSING" });
      }
    }
    let response;
    try {
      response = await window.fetch(source);
    } catch (error) {
      throw readableError(error, "чтение изображения");
    }
    if (!response.ok) {
      throw new MidgasSupabaseError(`Не удалось прочитать изображение (${response.status}).`, {
        code: "IMAGE_READ_FAILED",
        status: response.status,
      });
    }
    return response.blob();
  }

  async function uploadImage(client, value, folder, memo, uploadedPaths) {
    if (!isUploadableImage(value)) return { value, path: null };
    if (memo.has(value)) return memo.get(value);
    const blob = await imageBlob(value);
    const mimeType = String(blob.type || "").toLowerCase();
    const extension = MIME_EXTENSIONS[mimeType];
    if (!extension) {
      throw new MidgasSupabaseError("Допустимы изображения JPEG, PNG, WebP или AVIF.", { code: "IMAGE_TYPE_UNSUPPORTED" });
    }
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new MidgasSupabaseError("Изображение больше 8 МБ. Уменьшите файл перед загрузкой.", { code: "IMAGE_TOO_LARGE" });
    }
    const path = `${folder}/${uuidV4()}.${extension}`;
    const upload = await client.storage.from(STORAGE_BUCKET).upload(path, blob, {
      cacheControl: "31536000",
      contentType: mimeType,
      upsert: false,
    });
    checked(upload, "загрузка изображения");
    uploadedPaths.push(path);
    const result = { value: publicUrlForPath(path), path };
    memo.set(value, result);
    return result;
  }

  async function prepareImages(client, sourceRecord, type) {
    const record = clone(sourceRecord || {});
    const memo = new Map();
    const uploadedPaths = [];
    let coverPath = null;
    const cover = await uploadImage(client, record.image, `${type}/covers`, memo, uploadedPaths);
    record.image = cover.value;
    if (cover.path) coverPath = cover.path;
    if (record.cardImage !== undefined) {
      const cardCover = await uploadImage(client, record.cardImage, `${type}/covers`, memo, uploadedPaths);
      record.cardImage = cardCover.value;
      if (!coverPath && cardCover.path) coverPath = cardCover.path;
    }
    if (Array.isArray(record.sections)) {
      for (let index = 0; index < record.sections.length; index += 1) {
        const section = record.sections[index];
        if (!section || typeof section !== "object" || section.image === undefined) continue;
        if (typeof section.image === "string" || (typeof Blob !== "undefined" && section.image instanceof Blob)) {
          const uploaded = await uploadImage(client, section.image, `${type}/sections`, memo, uploadedPaths);
          section.image = uploaded.value;
        } else if (section.image && typeof section.image === "object" && section.image.src !== undefined) {
          const uploaded = await uploadImage(client, section.image.src, `${type}/sections`, memo, uploadedPaths);
          section.image.src = uploaded.value;
        }
      }
    }
    return { record, coverPath, uploadedPaths };
  }

  async function removeStoredPaths(client, paths, context = "удаление изображения") {
    const uniquePaths = [...new Set((paths || []).map((path) => String(path || "").trim()).filter(Boolean))];
    if (!uniquePaths.length) return [];
    const response = await client.storage.from(STORAGE_BUCKET).remove(uniquePaths);
    return checked(response, context) || [];
  }

  function storedPathFromPublicUrl(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    const marker = `/storage/v1/object/public/${encodeURIComponent(STORAGE_BUCKET)}/`;
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) return "";
    const encodedPath = source.slice(markerIndex + marker.length).split(/[?#]/, 1)[0];
    try {
      return encodedPath.split("/").map(decodeURIComponent).join("/");
    } catch {
      return "";
    }
  }

  function collectStoredPaths(value, result = new Set()) {
    if (typeof value === "string") {
      const path = storedPathFromPublicUrl(value);
      if (path) result.add(path);
      return result;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectStoredPaths(item, result));
      return result;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach((item) => collectStoredPaths(item, result));
    }
    return result;
  }

  async function cleanupUploads(client, paths) {
    if (!paths?.length) return;
    try {
      await removeStoredPaths(client, paths, "очистка незавершённой загрузки");
    } catch {
      // A failed cleanup must not hide the database error that caused it.
    }
  }

  function relationReference(item) {
    if (typeof item === "string") return item.trim();
    return String(item?.uuid || item?.recordUuid || item?.record_id || item?.id || "").trim();
  }

  async function resolveRelationshipTargets(client, relations, sourceUuid = "") {
    const references = [...new Set((Array.isArray(relations) ? relations : []).map(relationReference).filter(Boolean))];
    const codes = references.filter((value) => !UUID_PATTERN.test(value));
    const uuids = references.filter((value) => UUID_PATTERN.test(value));
    const rows = [];
    if (codes.length) {
      const response = await client.from(RECORDS_TABLE).select("id,record_code,record_type,deleted_at").in("record_code", codes);
      rows.push(...(checked(response, "проверка связанных записей") || []));
    }
    if (uuids.length) {
      const response = await client.from(RECORDS_TABLE).select("id,record_code,record_type,deleted_at").in("id", uuids);
      rows.push(...(checked(response, "проверка связанных записей") || []));
    }
    const byReference = new Map();
    rows.forEach((row) => {
      byReference.set(String(row.id), row);
      byReference.set(String(row.record_code), row);
      rememberRow(row);
    });
    const missing = references.find((reference) => !byReference.get(reference));
    if (missing) throw seedRequired(missing);
    const deleted = references.find((reference) => byReference.get(reference)?.deleted_at);
    if (deleted) {
      throw new MidgasSupabaseError(`Связанная запись ${deleted} удалена. Сначала восстановите её.`, {
        code: "RELATION_TARGET_DELETED",
        status: 409,
      });
    }
    return references
      .map((reference) => byReference.get(reference))
      .filter((row) => row && String(row.id) !== sourceUuid);
  }

  async function syncRelationships(client, sourceRow, relations, resolvedTargets = null) {
    if (!Array.isArray(relations)) return;
    const sourceUuid = String(sourceRow.id);
    const targets = resolvedTargets || await resolveRelationshipTargets(client, relations, sourceUuid);
    const desired = new Set(targets.map((row) => String(row.id)));
    const [asSource, asTarget] = await Promise.all([
      client.from(RELATIONSHIPS_TABLE).select("id,source_id,target_id").eq("source_id", sourceUuid),
      client.from(RELATIONSHIPS_TABLE).select("id,source_id,target_id").eq("target_id", sourceUuid),
    ]);
    const current = [...(checked(asSource, "чтение связей") || []), ...(checked(asTarget, "чтение связей") || [])];
    const currentTargets = new Set();
    const deleteIds = [];
    current.forEach((relationship) => {
      const other = String(relationship.source_id) === sourceUuid
        ? String(relationship.target_id)
        : String(relationship.source_id);
      if (desired.has(other)) currentTargets.add(other);
      else deleteIds.push(relationship.id);
    });
    if (deleteIds.length) {
      checked(await client.from(RELATIONSHIPS_TABLE).delete().in("id", deleteIds), "удаление старых связей");
    }
    const inserts = targets
      .filter((target) => !currentTargets.has(String(target.id)))
      .map((target) => ({ source_id: sourceUuid, target_id: target.id }));
    if (inserts.length) checked(await client.from(RELATIONSHIPS_TABLE).insert(inserts), "сохранение связей");
  }

  function contentForDatabase(record) {
    const content = clone(record || {});
    delete content.id;
    delete content.recordCode;
    delete content.recordUuid;
    delete content._supabase;
    return content;
  }

  function preserveCurrentCover(snapshotContent, currentContent) {
    const content = clone(snapshotContent || {});
    const current = currentContent && typeof currentContent === "object" ? currentContent : {};
    ["image", "cardImage", "imageFit"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(current, key)) content[key] = clone(current[key]);
      else delete content[key];
    });
    return content;
  }

  function preserveCurrentMedia(snapshotContent, currentContent) {
    const content = preserveCurrentCover(snapshotContent, currentContent);
    const current = currentContent && typeof currentContent === "object" ? currentContent : {};
    if (!Array.isArray(content.sections)) return content;
    const currentSections = Array.isArray(current.sections) ? current.sections : [];
    content.sections = content.sections.map((section, index) => {
      const next = clone(section || {});
      const currentSection = currentSections[index] && typeof currentSections[index] === "object"
        ? currentSections[index]
        : {};
      ["image", "media"].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(currentSection, key)) next[key] = clone(currentSection[key]);
        else delete next[key];
      });
      return next;
    });
    return content;
  }

  function publicationRecord(row) {
    const snapshot = row?.publication_snapshot;
    if (!snapshot || typeof snapshot !== "object") return null;
    return rowToRecord({
      ...row,
      content: preserveCurrentCover(snapshot.content, row?.content),
      cover_path: row?.cover_path ?? null,
    });
  }

  function applyRow(row, action = "update") {
    const type = row.record_type;
    const code = row.record_code;
    rememberRow(row);
    if (row.deleted_at || action === "delete") {
      delete registry[type]?.[code];
      return null;
    }
    const record = rowToRecord(row);
    registry[type][code] = record;
    overlaidCodes.add(code);
    return record;
  }

  async function remoteOperation(label, operation) {
    setStatus("syncing", `${label}…`);
    try {
      const result = await operation();
      setStatus("synced", `${label}: данные сохранены в Supabase.`, { operation: label });
      return { ...result, sync: "remote", syncMessage: "Сохранено в Supabase." };
    } catch (cause) {
      const error = readableError(cause, label);
      setStatus(error.network ? "offline" : "error", error.message, { error, operation: label, remote: false });
      throw error;
    }
  }

  async function createRecord({ type, record, relations } = {}) {
    if (!RECORD_TYPES.includes(type)) throw new MidgasSupabaseError("Неизвестный тип записи.", { code: "INVALID_RECORD_TYPE" });
    return remoteOperation("Создание записи", async () => {
      const { client } = await ensureApprovedEditor();
      await ensureTypeSeeded(client, type);
      const relationList = Array.isArray(relations) ? relations : record?.editorRelations;
      const targets = await resolveRelationshipTargets(client, relationList || []);
      const prepared = await prepareImages(client, record, type);
      let row = null;
      try {
        const insert = await client
          .from(RECORDS_TABLE)
          .insert({ record_type: type, content: contentForDatabase(prepared.record), cover_path: prepared.coverPath })
          .select(RECORD_SELECT)
          .single();
        row = checked(insert, "создание записи");
        try {
          await syncRelationships(client, row, relationList || [], targets);
        } catch (cause) {
          throw new MidgasSupabaseError(
            `Запись ${row.record_code} сохранена, но связи не синхронизированы. Повторите сохранение карточки.`,
            { code: "REMOTE_PARTIAL_WRITE", cause, remoteCommitted: true },
          );
        }
        const visibleRecord = applyRow(row, "create");
        return {
          type,
          row: clone(row),
          record: visibleRecord,
          publicationRecord: publicationRecord(row) || clone(visibleRecord),
          createdAt: row.created_at,
        };
      } catch (error) {
        if (!row) await cleanupUploads(client, prepared.uploadedPaths);
        throw error;
      }
    });
  }

  async function updateRecord(type, code, patch = {}) {
    if (!RECORD_TYPES.includes(type)) throw new MidgasSupabaseError("Неизвестный тип записи.", { code: "INVALID_RECORD_TYPE" });
    return remoteOperation(`Обновление ${code}`, async () => {
      const { client } = await ensureApprovedEditor();
      const existingRow = await findRowByCode(client, code);
      if (existingRow.record_type !== type) {
        throw new MidgasSupabaseError(`Тип записи ${code} не совпадает с данными Supabase.`, { code: "RECORD_TYPE_MISMATCH", status: 409 });
      }
      if (existingRow.deleted_at) {
        throw new MidgasSupabaseError(`Запись ${code} удалена. Сначала восстановите её.`, { code: "RECORD_DELETED", status: 409 });
      }
      const safePatch = clone(patch || {});
      delete safePatch.id;
      delete safePatch.type;
      delete safePatch.kind;
      const removeCover = safePatch.removeCover === true
        || (Object.prototype.hasOwnProperty.call(safePatch, "image") && !String(safePatch.image || "").trim());
      delete safePatch.removeCover;
      const merged = { ...rowToRecord(existingRow), ...safePatch, id: code };
      if (removeCover) {
        merged.image = "";
        merged.cardImage = "";
      }
      const relationList = Object.prototype.hasOwnProperty.call(safePatch, "editorRelations")
        ? safePatch.editorRelations
        : null;
      const targets = relationList ? await resolveRelationshipTargets(client, relationList, existingRow.id) : null;
      const prepared = await prepareImages(client, merged, type);
      let row = null;
      try {
        const update = await client
          .from(RECORDS_TABLE)
          .update({
            content: contentForDatabase(prepared.record),
            cover_path: removeCover ? null : (prepared.coverPath || existingRow.cover_path),
          })
          .eq("id", existingRow.id)
          .select(RECORD_SELECT)
          .single();
        row = checked(update, `обновление ${code}`);
        const previousPaths = collectStoredPaths(rowToRecord(existingRow));
        if (existingRow.cover_path) previousPaths.add(existingRow.cover_path);
        const currentPaths = collectStoredPaths(rowToRecord(row));
        if (row.cover_path) currentPaths.add(row.cover_path);
        const stalePaths = [...previousPaths].filter((path) => !currentPaths.has(path));
        if (stalePaths.length) {
          try {
            await removeStoredPaths(client, stalePaths, `удаление старых фотографий ${code}`);
          } catch (cause) {
            throw new MidgasSupabaseError(
              `Карточка ${code} сохранена, но Supabase не подтвердил удаление старых файлов. Повторите сохранение.`,
              { code: "REMOTE_PARTIAL_WRITE", cause, remoteCommitted: true },
            );
          }
        }
        if (relationList) {
          try {
            await syncRelationships(client, row, relationList, targets);
          } catch (cause) {
            throw new MidgasSupabaseError(
              `Запись ${code} сохранена, но связи не синхронизированы. Повторите сохранение карточки.`,
              { code: "REMOTE_PARTIAL_WRITE", cause, remoteCommitted: true },
            );
          }
        }
        const visibleRecord = applyRow(row, "update");
        return {
          type,
          row: clone(row),
          record: visibleRecord,
          publicationRecord: publicationRecord(row),
          updatedAt: row.updated_at,
        };
      } catch (error) {
        if (!row) await cleanupUploads(client, prepared.uploadedPaths);
        throw error;
      }
    });
  }

  async function softDeleteRecord(type, code) {
    return remoteOperation(`Удаление ${code}`, async () => {
      const { client } = await ensureApprovedEditor();
      const existingRow = await findRowByCode(client, code);
      if (existingRow.record_type !== type) throw seedRequired(code);
      const response = await client
        .from(RECORDS_TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", existingRow.id)
        .select(RECORD_SELECT)
        .single();
      const row = checked(response, `удаление ${code}`);
      const record = rowToRecord(row);
      applyRow(row, "delete");
      return { type, row: clone(row), record, publicationRecord: publicationRecord(row), deletedAt: row.deleted_at };
    });
  }

  async function restoreRecord(type, code) {
    return remoteOperation(`Восстановление ${code}`, async () => {
      const { client } = await ensureApprovedEditor();
      const existingRow = await findRowByCode(client, code);
      if (existingRow.record_type !== type) throw seedRequired(code);
      const response = await client
        .from(RECORDS_TABLE)
        .update({ deleted_at: null })
        .eq("id", existingRow.id)
        .select(RECORD_SELECT)
        .single();
      const row = checked(response, `восстановление ${code}`);
      const record = applyRow(row, "restore");
      return { type, row: clone(row), record, publicationRecord: publicationRecord(row), restoredAt: row.updated_at };
    });
  }

  async function resetRecord(type, code) {
    return remoteOperation(`Сброс ${code}`, async () => {
      const { client } = await ensureApprovedEditor();
      const existingRow = await findRowByCode(client, code);
      if (existingRow.record_type !== type) throw seedRequired(code);
      const snapshot = existingRow.publication_snapshot;
      if (!snapshot?.content || typeof snapshot.content !== "object") {
        throw new MidgasSupabaseError(`У ${code} нет публикационного снимка. Проверьте seed-миграцию.`, {
          code: "PUBLICATION_SNAPSHOT_MISSING",
          status: 409,
        });
      }
      const resetContent = preserveCurrentCover(snapshot.content, existingRow.content);
      const response = await client
        .from(RECORDS_TABLE)
        .update({ content: resetContent, cover_path: existingRow.cover_path ?? null, deleted_at: null })
        .eq("id", existingRow.id)
        .select(RECORD_SELECT)
        .single();
      const row = checked(response, `сброс ${code}`);
      if (Array.isArray(snapshot.content.editorRelations)) {
        await syncRelationships(client, row, snapshot.content.editorRelations);
      }
      const record = applyRow(row, "reset");
      return {
        type,
        row: clone(row),
        record,
        publicationRecord: publicationRecord(row) || clone(record),
        resetAt: row.updated_at,
      };
    });
  }

  async function rollbackRecordVersion(type, code, fromVersion) {
    if (!RECORD_TYPES.includes(type)) throw new MidgasSupabaseError("Неизвестный тип записи.", { code: "INVALID_RECORD_TYPE" });
    const version = Number(fromVersion);
    if (!Number.isInteger(version) || version <= 1) {
      throw new MidgasSupabaseError("Для этого изменения нет предыдущей версии.", { code: "VERSION_NOT_ROLLBACKABLE", status: 409 });
    }
    return remoteOperation(`Откат ${code} перед версией ${version}`, async () => {
      const { client } = await ensureApprovedEditor();
      const existingRow = await findRowByCode(client, code);
      if (existingRow.record_type !== type) {
        throw new MidgasSupabaseError(`Тип записи ${code} не совпадает с данными Supabase.`, { code: "RECORD_TYPE_MISMATCH", status: 409 });
      }
      const versionQuery = client
        .from("record_versions")
        .select("version,snapshot,change_kind,changed_at")
        .eq("record_id", existingRow.id)
        .lt("version", version)
        .order("version", { ascending: false })
        .limit(1);
      const response = typeof versionQuery.maybeSingle === "function" ? await versionQuery.maybeSingle() : await versionQuery.single();
      const archived = checked(response, `чтение версии ${code}`);
      if (!archived?.snapshot?.content) {
        throw new MidgasSupabaseError(`Предыдущая версия ${code} не найдена.`, { code: "VERSION_NOT_FOUND", status: 404 });
      }
      const content = preserveCurrentMedia(archived.snapshot.content, existingRow.content);
      const update = await client
        .from(RECORDS_TABLE)
        .update({
          content,
          cover_path: existingRow.cover_path || null,
          deleted_at: archived.snapshot.deleted_at || null,
        })
        .eq("id", existingRow.id)
        .select(RECORD_SELECT)
        .single();
      const row = checked(update, `откат ${code}`);
      const previousPaths = collectStoredPaths(rowToRecord(existingRow));
      const currentPaths = collectStoredPaths(rowToRecord(row));
      const stalePaths = [...previousPaths].filter((path) => !currentPaths.has(path));
      if (stalePaths.length) await removeStoredPaths(client, stalePaths, `удаление файлов после отката ${code}`);
      if (Array.isArray(content.editorRelations)) {
        await syncRelationships(client, row, content.editorRelations);
      }
      const record = rowToRecord(row);
      applyRow(row, row.deleted_at ? "delete" : "update");
      return {
        type,
        row: clone(row),
        record,
        publicationRecord: publicationRecord(row),
        rolledBackFrom: version,
        restoredVersion: archived.version,
      };
    });
  }

  async function rollbackRelationship(action, sourceCode, targetCode) {
    return remoteOperation("Откат связи карточек", async () => {
      const { client } = await ensureApprovedEditor();
      const source = await findRowByCode(client, sourceCode);
      const target = await findRowByCode(client, targetCode);
      const [forward, reverse] = await Promise.all([
        client.from(RELATIONSHIPS_TABLE).select("id").eq("source_id", source.id).eq("target_id", target.id),
        client.from(RELATIONSHIPS_TABLE).select("id").eq("source_id", target.id).eq("target_id", source.id),
      ]);
      const existing = [...(checked(forward, "чтение связи") || []), ...(checked(reverse, "чтение связи") || [])];
      if (action === "link" && existing.length) {
        checked(await client.from(RELATIONSHIPS_TABLE).delete().in("id", existing.map((item) => item.id)), "откат добавления связи");
      } else if (action === "unlink" && !existing.length) {
        checked(await client.from(RELATIONSHIPS_TABLE).insert({ source_id: source.id, target_id: target.id }), "откат удаления связи");
      }
      await loadPublicRecords({ throwOnError: true });
      return { source: sourceCode, target: targetCode, action };
    });
  }

  async function rollbackChange(change = {}) {
    const action = String(change.action || "");
    if (action === "create") return softDeleteRecord(change.type, change.id);
    if (["update", "delete", "restore", "reset"].includes(action)) {
      return rollbackRecordVersion(change.type, change.id, change.version);
    }
    if (["link", "unlink"].includes(action)) {
      return rollbackRelationship(action, change.source, change.target);
    }
    throw new MidgasSupabaseError("Это изменение нельзя откатить автоматически.", { code: "CHANGE_NOT_ROLLBACKABLE", status: 409 });
  }

  function markLocalFallback(operation, cause) {
    const error = readableError(cause, operation);
    setStatus(
      "offline-fallback",
      `${error.message} Изменение сохранено только в локальном резерве браузера.`,
      { operation, error, remote: false },
    );
    return status;
  }

  const ready = Promise.resolve().then(() => loadPublicRecords());

  window.MIDGAS_SUPABASE_DATA = Object.freeze({
    bucket: STORAGE_BUCKET,
    eventName: SYNC_EVENT,
    readyEventName: READY_EVENT,
    ready,
    isConfigured,
    getStatus: () => status,
    isNetworkError,
    loadPublicRecords,
    loadChangeFeed,
    rollbackChange,
    rollbackRecordVersion,
    createRecord,
    updateRecord,
    upsertOverride: updateRecord,
    softDeleteRecord,
    restoreRecord,
    resetRecord,
    syncRelationships: async (recordCode, relations) => remoteOperation(`Связи ${recordCode}`, async () => {
      const { client } = await ensureApprovedEditor();
      const row = await findRowByCode(client, recordCode);
      await syncRelationships(client, row, relations);
      return { type: row.record_type, row: clone(row), record: rowToRecord(row) };
    }),
    uploadRecordImages: async (type, record) => {
      const { client } = await ensureApprovedEditor();
      return prepareImages(client, record, type);
    },
    markLocalFallback,
    uuidForCode: (code) => uuidByCode.get(String(code || "")) || null,
    codeForUuid: (uuid) => codeByUuid.get(String(uuid || "")) || null,
    rowForCode: (code) => clone(rowsByCode.get(String(code || "")) || null),
  });
})();
