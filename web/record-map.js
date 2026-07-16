(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") || "client";
  const id = params.get("id") || "";
  const root = document.querySelector("[data-record-location]");
  const canvas = document.querySelector("[data-record-map]");
  const stateLabel = document.querySelector("[data-record-map-state]");
  const coordinatesLabel = document.querySelector("[data-record-map-coordinates]");
  const openLink = document.querySelector("[data-record-map-open]");
  const editor = document.querySelector("[data-record-map-editor]");
  const queryInput = document.querySelector("[data-record-map-query]");
  const searchButton = document.querySelector("[data-record-map-search]");
  const CACHE_KEY = "midgas-record-geocodes-v1";
  let map = null;
  let marker = null;
  let position = null;
  let editing = false;
  let geocodeRequest = null;

  function clone(value) {
    if (!value) return null;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function currentRecord() {
    return window.MIDGAS_EDITOR_STORE?.get?.(type, id) || window.MIDGAS_RECORDS?.[type]?.[id] || null;
  }

  function readCache() {
    try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) || "{}"); }
    catch { return {}; }
  }

  function writeCache(next) {
    try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(next)); }
    catch { /* A map can still work without browser cache. */ }
  }

  function validPosition(value) {
    const lat = Number(value?.lat);
    const lng = Number(value?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }

  function locationQuery() {
    const fromField = (currentRecord()?.fields || []).find(([term]) => /местополож|локаци/i.test(String(term || "")))?.[1];
    const source = String(queryInput?.value || fromField || root?.dataset.recordLocationValue || "").trim();
    return source.split(/\s+\/\s+/)[0].replace(/\s+/g, " ").trim();
  }

  function canGeocode(query) {
    return Boolean(query && !/^(?:нет|не указано|не указан|не раскрывается|unknown|—)$/i.test(query));
  }

  function setState(message, state = "ready") {
    if (!stateLabel) return;
    stateLabel.textContent = message;
    stateLabel.dataset.state = state;
  }

  function ensureMap(lat, lng) {
    if (!canvas || !window.L) return null;
    if (!map) {
      map = window.L.map(canvas, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true,
        preferCanvas: true,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
      }).setView([lat, lng], 8);
      window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        updateWhenIdle: true,
        keepBuffer: 2,
        detectRetina: false,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.on("click", (event) => {
        if (!editing) return;
        setPosition({
          lat: event.latlng.lat,
          lng: event.latlng.lng,
          label: locationQuery() || "Точка указана редактором",
          source: "manual",
          updatedAt: new Date().toISOString(),
        }, { center: false });
        setState("ТОЧКА УСТАНОВЛЕНА. СОХРАНИТЕ КАРТОЧКУ.", "editing");
      });
    }
    window.setTimeout(() => map?.invalidateSize?.(), 0);
    return map;
  }

  function setPosition(next, options = {}) {
    if (!validPosition(next)) return false;
    position = {
      lat: Number(Number(next.lat).toFixed(6)),
      lng: Number(Number(next.lng).toFixed(6)),
      label: String(next.label || locationQuery() || "").trim(),
      source: String(next.source || "editor"),
      updatedAt: String(next.updatedAt || new Date().toISOString()),
    };
    const instance = ensureMap(position.lat, position.lng);
    if (instance) {
      const icon = window.L.divIcon({ className: "record-map-pin", html: "<span></span>", iconSize: [24, 24], iconAnchor: [12, 12] });
      if (!marker) marker = window.L.marker([position.lat, position.lng], { icon }).addTo(instance);
      else marker.setLatLng([position.lat, position.lng]);
      if (options.center !== false) instance.setView([position.lat, position.lng], Number(options.zoom) || 8);
    }
    if (coordinatesLabel) coordinatesLabel.textContent = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
    if (openLink) openLink.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(position.lat)}&mlon=${encodeURIComponent(position.lng)}#map=10/${encodeURIComponent(position.lat)}/${encodeURIComponent(position.lng)}`;
    root?.classList.add("has-map-position");
    return true;
  }

  async function geocode(query = locationQuery()) {
    const normalized = String(query || "").trim().toLocaleLowerCase("ru");
    if (!canGeocode(query)) throw new Error("Укажите локацию, которую можно найти на карте.");
    const cached = readCache()[normalized];
    if (validPosition(cached)) {
      setPosition(cached);
      setState("КООРДИНАТЫ ЗАГРУЖЕНЫ ИЗ КЭША.", "ready");
      return clone(position);
    }
    if (geocodeRequest) return geocodeRequest;
    setState("ИЩУ ЛОКАЦИЮ…", "loading");
    geocodeRequest = (async () => {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("accept-language", "ru");
      url.searchParams.set("q", query);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 6500);
      const response = await window.fetch(url.toString(), { headers: { Accept: "application/json" }, signal: controller.signal })
        .finally(() => window.clearTimeout(timeout));
      if (!response.ok) throw new Error(`Сервис геокодирования недоступен (${response.status}).`);
      const result = (await response.json())?.[0];
      if (!result || !validPosition({ lat: result.lat, lng: result.lon })) throw new Error("Локация не найдена. Поставьте точку на карте вручную.");
      const next = {
        lat: Number(result.lat),
        lng: Number(result.lon),
        label: String(result.display_name || query),
        source: "nominatim",
        updatedAt: new Date().toISOString(),
      };
      const cache = readCache();
      cache[normalized] = next;
      writeCache(cache);
      setPosition(next);
      setState("ЛОКАЦИЯ НАЙДЕНА.", "ready");
      return clone(position);
    })().catch((error) => {
      const nextError = error?.name === "AbortError" ? new Error("КАРТА НЕ ОТВЕТИЛА ВОВРЕМЯ. ПОСТАВЬТЕ ТОЧКУ ВРУЧНУЮ.") : error;
      setState(nextError.message || "НЕ УДАЛОСЬ ОПРЕДЕЛИТЬ ЛОКАЦИЮ.", "error");
      throw nextError;
    }).finally(() => { geocodeRequest = null; });
    return geocodeRequest;
  }

  function initialize() {
    if (!root || !canvas || root.hidden) return;
    const record = currentRecord();
    const seeded = window.MIDGAS_GEO_SEEDS?.[id];
    const initialPosition = validPosition(record?.geo) ? record.geo : seeded;
    if (validPosition(initialPosition)) {
      setPosition(initialPosition, { zoom: 9 });
      setState(record?.geo ? "КООРДИНАТЫ СИНХРОНИЗИРОВАНЫ С КАРТОЧКОЙ." : "КАРТА ЗАГРУЖЕНА ИЗ БЫСТРОГО КЭША.", record?.geo ? "synced" : "ready");
      return;
    }
    const query = locationQuery();
    if (!canGeocode(query)) {
      setState("КООРДИНАТЫ НЕ УКАЗАНЫ.", "empty");
      return;
    }
    geocode(query).catch(() => {});
  }

  function setEditing(next) {
    editing = Boolean(next);
    if (editor) editor.hidden = !editing;
    root?.classList.toggle("is-map-editing", editing);
    if (map) {
      if (editing) map.scrollWheelZoom.enable();
      else map.scrollWheelZoom.disable();
      window.setTimeout(() => map.invalidateSize(), 0);
    }
    if (editing) setState("НАЙДИТЕ АДРЕС ИЛИ ПОСТАВЬТЕ ТОЧКУ КЛИКОМ.", "editing");
  }

  searchButton?.addEventListener("click", () => geocode(locationQuery()).catch(() => {}));
  queryInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    geocode(locationQuery()).catch(() => {});
  });

  window.MIDGAS_RECORD_MAP = Object.freeze({
    initialize,
    geocode,
    setEditing,
    setPosition,
    getPosition: () => clone(position),
    getQuery: locationQuery,
  });

  window.addEventListener("midgas:record-rendered", initialize);
  window.addEventListener("midgas:records-ready", initialize);
  initialize();
})();
