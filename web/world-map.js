(() => {
  "use strict";

  const canvas = document.querySelector("[data-world-map]");
  const countLabel = document.querySelector("[data-world-map-count]");
  const stateLabel = document.querySelector("[data-world-map-state]");
  const resetButton = document.querySelector("[data-world-map-reset]");
  if (!canvas) return;

  const TYPES = ["client", "anomaly"];
  const TYPE_LABELS = { client: "КЛИЕНТ", anomaly: "АНОМАЛИЯ" };
  let map = null;
  let markerLayer = null;
  let markerItems = [];
  let initialFitComplete = false;
  let supabaseReady = false;
  let tileLayer = null;
  let tileErrorCount = 0;
  let fallbackTiles = false;
  let renderFrame = 0;

  function visibleSize() {
    const rect = canvas.getBoundingClientRect();
    return rect.width > 8 && rect.height > 8 ? rect : null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function validPosition(value) {
    const lat = Number(value?.lat);
    const lng = Number(value?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }

  function locationValue(record) {
    const field = (record?.fields || []).find(([term]) => /местополож|локаци/i.test(String(term || "")));
    return String(field?.[1] || record?.geo?.label || "Координаты указаны редактором").trim();
  }

  function collectRecords() {
    const registry = window.MIDGAS_RECORDS || {};
    return TYPES.flatMap((type) => Object.values(registry[type] || {}).map((record) => ({
      type,
      record,
      geo: validPosition(record?.geo) ? record.geo : window.MIDGAS_GEO_SEEDS?.[record?.id],
    })))
      .filter(({ geo }) => validPosition(geo))
      .map(({ type, record, geo }) => ({
        type,
        id: String(record.id || ""),
        name: String(record.name || record.alias || record.id || "БЕЗ НАЗВАНИЯ"),
        location: locationValue(record),
        image: String(record.cardImage || record.image || ""),
        lat: Number(geo.lat),
        lng: Number(geo.lng),
      }));
  }

  function spreadCoincident(items) {
    const groups = new Map();
    items.forEach((item) => {
      const key = `${item.lat.toFixed(4)}:${item.lng.toFixed(4)}`;
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    });
    groups.forEach((group) => {
      if (group.length < 2) return;
      group.forEach((item, index) => {
        const angle = (Math.PI * 2 * index) / group.length - Math.PI / 2;
        const radius = 0.012 + Math.min(0.018, group.length * 0.0015);
        item.displayLat = item.lat + Math.sin(angle) * radius;
        item.displayLng = item.lng + Math.cos(angle) * radius;
      });
    });
    items.forEach((item) => {
      item.displayLat ??= item.lat;
      item.displayLng ??= item.lng;
    });
    return items;
  }

  function iconFor(item, detailed) {
    const typeClass = `is-${item.type}`;
    if (!detailed) {
      return window.L.divIcon({
        className: `world-map-marker is-compact ${typeClass}`,
        html: `<span aria-hidden="true"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
    }
    const media = item.image
      ? `<img src="${escapeHtml(item.image)}" alt="" />`
      : `<i aria-hidden="true">${escapeHtml(item.name.slice(0, 1))}</i>`;
    return window.L.divIcon({
      className: `world-map-marker is-detailed ${typeClass}`,
      html: `<span class="world-map-marker-card">${media}<b><small>${TYPE_LABELS[item.type]}</small><strong>${escapeHtml(item.name)}</strong></b></span>`,
      iconSize: [190, 58],
      iconAnchor: [14, 29],
    });
  }

  function popupFor(item) {
    const media = item.image ? `<img src="${escapeHtml(item.image)}" alt="" />` : "";
    const href = `record.html?type=${encodeURIComponent(item.type)}&id=${encodeURIComponent(item.id)}`;
    return `<article class="world-map-popup">${media}<div><small>${TYPE_LABELS[item.type]} / ${escapeHtml(item.id)}</small><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.location)}</p><a href="${href}">ОТКРЫТЬ ДОСЬЕ →</a></div></article>`;
  }

  function updateMarkerIcons() {
    if (!map) return;
    const detailed = map.getZoom() >= 7;
    markerItems.forEach(({ marker, item }) => marker.setIcon(iconFor(item, detailed)));
    canvas.classList.toggle("is-detailed", detailed);
  }

  function fitAll(animate = false) {
    if (!map || !markerItems.length || !visibleSize()) return;
    const bounds = window.L.latLngBounds(markerItems.map(({ item }) => [item.displayLat, item.displayLng]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [54, 54], maxZoom: 6, animate });
  }

  function addTiles(useFallback = false) {
    if (!map || !window.L) return;
    tileLayer?.remove?.();
    tileErrorCount = 0;
    fallbackTiles = useFallback;
    const url = useFallback
      ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
    const tileOptions = {
      maxZoom: 19,
      updateWhenIdle: true,
      keepBuffer: 2,
      detectRetina: false,
      crossOrigin: true,
      attribution: useFallback
        ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    };
    if (!useFallback) tileOptions.subdomains = "abcd";
    tileLayer = window.L.tileLayer(url, tileOptions);
    tileLayer.on("load", () => canvas.classList.add("is-map-ready"));
    tileLayer.on("tileerror", () => {
      tileErrorCount += 1;
      if (tileErrorCount < 4) return;
      if (!fallbackTiles) {
        addTiles(true);
        return;
      }
      canvas.classList.add("is-map-background-failed");
      if (stateLabel) stateLabel.textContent = "МЕТКИ ДОСТУПНЫ · ФОН КАРТЫ НЕ ЗАГРУЖЕН";
    });
    tileLayer.addTo(map);
  }

  function ensureMap() {
    if (map || !window.L) return map;
    if (!visibleSize()) return null;
    map = window.L.map(canvas, {
      center: [32, 60],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: true,
      scrollWheelZoom: false,
      worldCopyJump: true,
      preferCanvas: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    });
    map.attributionControl?.setPrefix(false);
    addTiles(false);
    markerLayer = window.L.featureGroup().addTo(map);
    map.on("zoomend", updateMarkerIcons);
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());
    window.setTimeout(() => map?.invalidateSize?.({ pan: false, animate: false }), 0);
    return map;
  }

  function render() {
    if (!visibleSize()) {
      if (stateLabel) stateLabel.textContent = "КАРТА ЗАГРУЗИТСЯ ПОСЛЕ ОТКРЫТИЯ САЙТА";
      return;
    }
    const instance = ensureMap();
    if (!instance || !markerLayer) {
      if (stateLabel) stateLabel.textContent = "КАРТА ВРЕМЕННО НЕДОСТУПНА";
      return;
    }
    markerLayer.clearLayers();
    markerItems = [];
    const items = spreadCoincident(collectRecords());
    items.forEach((item) => {
      const marker = window.L.marker([item.displayLat, item.displayLng], { icon: iconFor(item, instance.getZoom() >= 7), riseOnHover: true })
        .bindPopup(popupFor(item), { className: "world-map-leaflet-popup", maxWidth: 340 })
        .addTo(markerLayer);
      markerItems.push({ marker, item });
    });
    if (countLabel) countLabel.textContent = `${String(items.length).padStart(2, "0")} ЛОКАЦИЙ`;
    if (stateLabel) stateLabel.textContent = items.length
      ? (supabaseReady ? "ДАННЫЕ СИНХРОНИЗИРОВАНЫ С SUPABASE" : "БЫСТРЫЙ КЭШ · ОБНОВЛЯЮ SUPABASE")
      : "ЛОКАЦИИ ПОКА НЕ УКАЗАНЫ";
    if (!initialFitComplete && items.length) {
      fitAll(false);
      initialFitComplete = true;
    }
    updateMarkerIcons();
  }

  function restoreMap() {
    if (!visibleSize()) return;
    if (!map) {
      render();
      return;
    }
    map.invalidateSize({ pan: false, animate: false });
    if (!initialFitComplete && markerItems.length) {
      fitAll(false);
      initialFitComplete = true;
    }
  }

  function scheduleRestore() {
    if (renderFrame) window.cancelAnimationFrame(renderFrame);
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      window.requestAnimationFrame(restoreMap);
    });
  }

  resetButton?.addEventListener("click", () => fitAll(true));
  window.addEventListener("midgas:records-ready", () => { supabaseReady = true; render(); });
  window.addEventListener("midgas:record-mutated", render);
  window.addEventListener("midgas:site-access-granted", scheduleRestore);
  window.addEventListener("pageshow", scheduleRestore);
  window.addEventListener("resize", scheduleRestore, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleRestore();
  });
  if ("ResizeObserver" in window) new ResizeObserver(scheduleRestore).observe(canvas);
  Promise.resolve(window.MIDGAS_SUPABASE_DATA?.ready).finally(() => { supabaseReady = true; render(); });
  render();
})();
