(() => {
  "use strict";
  const A = window.MIDGAS_ARCHIVE;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const norm = (s) => String(s ?? "").toLocaleLowerCase("ru").replaceAll("ё", "е").trim();
  const labels = { client: "Клиенты", anomaly: "Аномалии", incident: "Инциденты", note: "Заметка" };
  const singular = { client: "Клиент", anomaly: "Аномалия", incident: "Инцидент", note: "Заметка" };
  const el = (tag, className = "", text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const svg = (tag, attrs = {}, text) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const safeUrl = (value) => {
    if (!value || typeof value !== "string") return "";
    try { const u = new URL(value, document.baseURI); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? value : ""; } catch { return ""; }
  };
  const link = (text, href, className = "") => {
    const node = el("a", className, text); node.href = safeUrl(href) || "#"; return node;
  };
  const recordHref = (r) => `record.html?type=${encodeURIComponent(r.type)}&id=${encodeURIComponent(r.id)}`;
  const fields = (r) => Array.isArray(r.fields) ? r.fields.filter((f) => Array.isArray(f) && f.length >= 2) : [];
  const field = (r, pattern) => String(fields(r).find(([key]) => pattern.test(norm(key)))?.[1] || "");
  const caption = (r) => r.caption || r.cardType || r.alias || field(r, /^(тип|классификация)$/);
  const tags = (r) => (Array.isArray(r.tags) ? r.tags : typeof r.tags === "string" ? r.tags.split(/[,;]/) : []).map((t) => typeof t === "string" ? t : t?.label || t?.name || "").filter(Boolean);
  const sequence = (r) => Number(String(r.id).match(/\d+$/)?.[0]) || 0;
  function level(r, kind) {
    const raw = field(r, kind === "threat" ? /уровень угрозы/ : /уровень доступа|осведомленность/);
    const match = raw.match(kind === "threat" ? /\bT([1-5])\b/i : /\bD([1-5])\b/i);
    if (match) return Number(match[1]);
    const value = norm(raw);
    const patterns = kind === "threat" ? [/низк/, /умерен|скрыт/, /значитель/, /высок/, /критич|сверхопас/] : [/очень низк/, /низк/, /средн/, /высок/, /максим|полн|высш/];
    if (kind === "access" && /очень низк/.test(value)) return 1;
    for (let i = patterns.length - 1; i >= 0; i--) if (patterns[i].test(value)) return i + 1;
    const n = Number(r[kind === "threat" ? "threatLevel" : "accessLevel"]);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
  }
  function image(src, alt, lazy = true) {
    const img = el("img"); img.src = safeUrl(src) || "assets/favicon.svg"; img.alt = alt || "";
    img.loading = lazy ? "lazy" : "eager"; img.decoding = "async";
    img.addEventListener("error", () => { img.hidden = true; if (img.parentElement?.classList.contains("card-image")) img.parentElement.prepend(el("span", "image-placeholder", "—")); }, { once: true });
    return img;
  }
  if (!A) { document.querySelector("main")?.append(el("p", "empty-note", "Данные архива не загрузились. Обновите страницу.")); return; }
  const records = A.records.filter((r) => r.isPublished !== false && !r.deleted_at);
  const byId = new Map(records.map((r) => [r.id, r]));
  const connected = new Map(records.map((r) => [r.id, new Set()]));
  const edges = [];
  const edgeKeys = new Set();
  function addEdge(source, target, extra = {}) {
    if (!source || !target || source === target) return;
    const key = [source, target].sort().join("|");
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key); edges.push({ ...extra, source, target });
    connected.get(source)?.add(target); connected.get(target)?.add(source);
  }
  A.relationships.forEach((r) => addEdge(r.source, r.target, r));
  for (const r of records) {
    for (const related of [...(r.editorRelations || []), ...(r.relations || []), ...(r.sections || []).flatMap((s) => s.relatedRecords || [])]) {
      const id = typeof related === "string" ? related : related.id;
      if (byId.has(id)) addEdge(r.id, id);
    }
  }
  // The database also stores board-only links and notes. Keep them in the graph.
  const boardNodes = (A.board?.nodes || []).map((n) => ({ ...n, id: `note:${n.id}`, type: "note", name: n.title || n.name || "Заметка", summary: n.description || n.body || "" }));
  const nodeIdFromKey = (key) => String(key || "").match(/MID-[CAI]-\d{4}/)?.[0] || `note:${String(key || "").replace(/^(?:note|board):/, "")}`;
  const graphRecords = [...records, ...boardNodes];
  const graphById = new Map(graphRecords.map((r) => [r.id, r]));
  (A.board?.edges || []).forEach((e) => { const s = nodeIdFromKey(e.source_key), t = nodeIdFromKey(e.target_key); if (graphById.has(s) && graphById.has(t)) addEdge(s, t, e); });
  const knownEdges = edges.filter((e) => graphById.has(e.source) && graphById.has(e.target));

  function openMedia(src, captionText, alt = "") {
    const d = $("#media-dialog"); if (!d || !safeUrl(src)) return;
    $("img", d).src = safeUrl(src); $("img", d).alt = alt || captionText || "Архивное изображение";
    $("figcaption", d).textContent = captionText || ""; d.showModal();
  }
  const dialog = $("#media-dialog");
  $(".media-close", dialog || document)?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  function cardMetric(r, kind) {
    const value = level(r, kind);
    const prefix = kind === "threat" ? "T" : "D";
    const name = kind === "threat" ? "Угроза" : "Доступ клиента";
    const descriptions = kind === "threat"
      ? ["Нет данных", "Низкая", "Умеренная", "Значительная", "Высокая", "Критическая"]
      : ["Нет данных", "Очень низкий", "Низкий", "Средний", "Высокий", "Полный"];
    const metric = el("div", "card-metric");
    metric.dataset.kind = kind; metric.dataset.level = value;
    const heading = el("div", "card-metric-heading");
    heading.append(el("span", "", name), el("strong", "", value ? `${prefix}${value} / 5` : "—"));
    const scale = el("div", "card-metric-scale");
    scale.setAttribute("role", "img");
    scale.setAttribute("aria-label", value ? `${name}: ${value} из 5, ${descriptions[value]}` : `${name}: нет данных`);
    for (let i = 1; i <= 5; i++) { const segment = el("i", i <= value ? "is-filled" : ""); segment.setAttribute("aria-hidden", "true"); scale.append(segment); }
    metric.append(heading, scale, el("small", "card-metric-description", descriptions[value]));
    return metric;
  }

  function card(r, index = 10) {
    const a = link("", recordHref(r), "record-card"); a.dataset.id = r.id;
    const wrap = el("div", "card-image"); wrap.append(image(r.cardImage || r.image, r.name, index >= 12), el("span", "card-open", "↗"));
    const levels = el("div", "card-levels");
    levels.append(cardMetric(r, "threat"));
    if (r.type === "client") levels.append(cardMetric(r, "access"));
    a.append(wrap, el("span", "card-id", r.id), el("h3", "", r.name || r.id), el("p", "card-caption", caption(r)), levels);
    if (tags(r).length) { const t = el("div", "card-tags"); tags(r).forEach((v) => t.append(el("span", "tag", v))); a.append(t); }
    return a;
  }

  function initCatalog() {
    if (!$("#record-grid")) return;
    const query = new URLSearchParams(location.search);
    const state = { type: labels[query.get("type")] ? query.get("type") : "client", q: query.get("q") || "", category: query.get("category") || "", sort: query.get("sort") || "number", threat: query.get("threat") || "", access: query.get("access") || "", tag: query.get("tag") || "", linked: query.get("linked") === "1" };
    const controls = { q: $("#catalog-search"), category: $("#catalog-category"), sort: $("#catalog-sort"), threat: $("#filter-threat"), access: $("#filter-access"), tag: $("#filter-tag"), linked: $("#filter-linked") };
    const search = new Map(records.map((r) => [r.id, norm(JSON.stringify([r.id, r.name, caption(r), fields(r), tags(r), r.summary, r.sections]))]));
    const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    function options(node, values, first) { node.replaceChildren(new Option(first, ""), ...values.map((s) => new Option(s, s))); }
    function populate() {
      const items = records.filter((r) => r.type === state.type);
      options(controls.category, unique(items.map((r) => field(r, /^(тип|классификация)$/) || caption(r))), "Все категории");
      options(controls.tag, unique(items.flatMap(tags)), "Любой тег");
      controls.tag.disabled = controls.tag.options.length === 1;
      if (controls.tag.disabled) controls.tag.options[0].textContent = "Теги не назначены";
      for (const [k, node] of Object.entries(controls)) { if (k === "linked") node.checked = state[k]; else node.value = state[k]; }
      if (!controls.sort.value) controls.sort.value = state.sort = "number";
      if (!controls.category.value) state.category = "";
      if (!controls.tag.value) state.tag = "";
    }
    function updateUrl() {
      const u = new URL(location.href); u.search = "";
      for (const [k, v] of Object.entries(state)) if (v && !(k === "type" && v === "client") && !(k === "sort" && v === "number")) u.searchParams.set(k, v === true ? "1" : v);
      history.replaceState(null, "", u);
    }
    const compare = {
      number: (a, b) => sequence(a) - sequence(b), "number-desc": (a, b) => sequence(b) - sequence(a),
      name: (a, b) => String(a.name).localeCompare(String(b.name), "ru"), threat: (a, b) => level(b, "threat") - level(a, "threat"), access: (a, b) => level(b, "access") - level(a, "access"),
      updated: (a, b) => (Date.parse(b.updatedAt || b.updated_at) || 0) - (Date.parse(a.updatedAt || a.updated_at) || 0),
    };
    function render() {
      const queryWords = norm(state.q).split(/\s+/).filter(Boolean);
      const base = records.filter((r) => r.type === state.type);
      const matches = base.filter((r) => queryWords.every((s) => search.get(r.id).includes(s))
        && (!state.category || (field(r, /^(тип|классификация)$/) || caption(r)) === state.category)
        && (!state.threat || (state.threat === "unknown" ? !level(r, "threat") : level(r, "threat") === Number(state.threat)))
        && (!state.access || (state.access === "unknown" ? !level(r, "access") : level(r, "access") === Number(state.access)))
        && (!state.tag || tags(r).includes(state.tag)) && (!state.linked || connected.get(r.id)?.size));
      matches.sort((a, b) => (compare[state.sort] || compare.number)(a, b) || sequence(a) - sequence(b));
      $("#record-grid").replaceChildren(...matches.map(card));
      $("#catalog-empty").hidden = matches.length > 0;
      $("#results-count").textContent = `Показано ${matches.length} из ${base.length} записей`;
      $$("[data-type]").forEach((button) => { const active = button.dataset.type === state.type; button.setAttribute("aria-selected", active); button.tabIndex = active ? 0 : -1; });
      $("#catalog-panel").setAttribute("aria-labelledby", `tab-${state.type}`);
      const count = [state.category, state.threat, state.access, state.tag, state.linked].filter(Boolean).length;
      $("#active-filters").hidden = !count; $("#active-filters").textContent = count;
      updateUrl();
    }
    $$("[data-count]").forEach((n) => n.textContent = String(records.filter((r) => r.type === n.dataset.count).length).padStart(2, "0"));
    $("[data-total]").textContent = `${records.length} ЗАПИСЕЙ В АРХИВЕ`;
    for (const [k, node] of Object.entries(controls)) node.addEventListener(k === "q" ? "input" : "change", () => { state[k] = k === "linked" ? node.checked : node.value; render(); });
    function chooseType(type) { state.type = type; state.category = ""; state.tag = ""; populate(); render(); }
    $$("[data-type]").forEach((b) => b.addEventListener("click", () => chooseType(b.dataset.type)));
    $(".catalog-tabs").addEventListener("keydown", (e) => {
      const tabs = $$("[data-type]"); const i = tabs.indexOf(document.activeElement);
      if (i < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? 2 : (i + (e.key === "ArrowRight" ? 1 : -1) + 3) % 3;
      tabs[next].focus(); chooseType(tabs[next].dataset.type);
    });
    const toggle = $("#filter-toggle"); toggle.addEventListener("click", () => { const panel = $("#advanced-filters"); panel.hidden = !panel.hidden; toggle.setAttribute("aria-expanded", !panel.hidden); });
    function reset() { Object.assign(state, { q: "", category: "", sort: "number", threat: "", access: "", tag: "", linked: false }); populate(); render(); }
    $("#reset-filters").addEventListener("click", reset); $("#empty-reset").addEventListener("click", reset);
    document.addEventListener("keydown", (e) => { if (e.key === "/" && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); controls.q.focus(); } });
    populate(); render();
    if (state.threat || state.access || state.tag || state.linked) { $("#advanced-filters").hidden = false; toggle.setAttribute("aria-expanded", "true"); }
  }

  function initGraph() {
    const root = $("#connection-graph"); if (!root) return;
    const width = 1560, height = 1000, nodeW = 124, nodeH = 118;
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const plane = svg("g"), lines = svg("g"), nodes = svg("g"); plane.append(lines, nodes); root.append(plane);
    const positions = new Map();
    graphRecords.forEach((r, i) => positions.set(r.id, { x: 160 + (i % 7) * 200, y: 120 + Math.floor(i / 7) * 185, vx: 0, vy: 0 }));
    // Deterministic force layout, run once; no continuous animation or server needed.
    for (let iter = 0; iter < 260; iter++) {
      const cooling = 1 - iter / 300;
      for (let i = 0; i < graphRecords.length; i++) for (let j = i + 1; j < graphRecords.length; j++) {
        const a = positions.get(graphRecords[i].id), b = positions.get(graphRecords[j].id);
        const dx = a.x - b.x || .01, dy = a.y - b.y || .01, dist = Math.max(25, Math.hypot(dx, dy));
        const force = Math.min(18, 30000 / (dist * dist));
        a.vx += dx / dist * force; a.vy += dy / dist * force; b.vx -= dx / dist * force; b.vy -= dy / dist * force;
      }
      knownEdges.forEach((edge) => {
        const a = positions.get(edge.source), b = positions.get(edge.target), dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
        const f = (dist - 235) * .009;
        a.vx += dx / dist * f; a.vy += dy / dist * f; b.vx -= dx / dist * f; b.vy -= dy / dist * f;
      });
      positions.forEach((p) => { p.vx = (p.vx + (width / 2 - p.x) * .0009) * .72; p.vy = (p.vy + (height / 2 - p.y) * .0009) * .72; p.x = Math.max(75, Math.min(width - 75, p.x + p.vx * cooling)); p.y = Math.max(85, Math.min(height - 85, p.y + p.vy * cooling)); });
    }
    // Preserve explicitly saved database board positions, when present.
    const saved = [...(A.board?.positions || []), ...(A.board?.nodes || []).map((n) => ({ ...n, node_key: `note:${n.id}` }))];
    saved.forEach((p) => { const id = nodeIdFromKey(p.node_key); if (positions.has(id) && Number.isFinite(Number(p.position_x)) && Number.isFinite(Number(p.position_y))) positions.set(id, { x: Number(p.position_x), y: Number(p.position_y) }); });
    const edgeElements = knownEdges.map((edge) => { const line = svg("line", { class: "graph-edge" }); lines.append(line); return { edge, line }; });
    const nodeElements = new Map();
    graphRecords.forEach((r) => {
      const g = svg("g", { class: `graph-node is-${r.type}`, tabindex: "0", role: "button", "aria-label": `${r.name || r.id}: показать связи`, "data-node": r.id });
      g.append(svg("title", {}, r.name || r.id), svg("rect", { x: -nodeW / 2, y: -nodeH / 2, width: nodeW, height: nodeH }), svg("rect", { x: -nodeW / 2, y: -nodeH / 2, width: 3, height: nodeH, class: "node-band" }));
      if (r.image || r.cardImage) g.append(svg("image", { href: safeUrl(r.cardImage || r.image), x: -nodeW / 2 + 8, y: -nodeH / 2 + 7, width: 108, height: 62, preserveAspectRatio: "xMidYMid slice", "pointer-events": "none" }));
      g.append(svg("text", { x: -nodeW / 2 + 9, y: 20, class: "node-id" }, r.type === "note" ? "ЗАМЕТКА" : r.id));
      const words = String(r.name || r.id).split(/\s+/); let row = "", rows = [];
      words.forEach((word) => { if ((row + word).length > 17 && row) { rows.push(row.trim()); row = ""; } row += `${word} `; }); rows.push(row.trim());
      rows.slice(0, 2).forEach((text, i) => g.append(svg("text", { x: -nodeW / 2 + 9, y: 35 + i * 12, class: "node-name" }, text)));
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focus(r.id); } });
      nodes.append(g); nodeElements.set(r.id, g);
    });
    function draw() {
      positions.forEach((p, id) => nodeElements.get(id)?.setAttribute("transform", `translate(${p.x},${p.y})`));
      edgeElements.forEach(({ edge, line }) => { const a = positions.get(edge.source), b = positions.get(edge.target); line.setAttribute("x1", a.x); line.setAttribute("y1", a.y); line.setAttribute("x2", b.x); line.setAttribute("y2", b.y); });
    }
    let view = { x: 0, y: 0, w: width, h: height };
    function applyView() { root.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`); }
    function fit() {
      const p = [...positions.values()]; if (!p.length) return;
      const minX = Math.min(...p.map((v) => v.x)) - 100, minY = Math.min(...p.map((v) => v.y)) - 100;
      view = { x: minX, y: minY, w: Math.max(...p.map((v) => v.x)) - minX + 100, h: Math.max(...p.map((v) => v.y)) - minY + 100 }; applyView();
    }
    const inspector = $("#graph-inspector"); const focusSelect = $("#graph-focus");
    graphRecords.forEach((r) => focusSelect.append(new Option(`${r.type === "note" ? "Заметка" : r.id} · ${r.name}`, r.id)));
    function focus(id) {
      const neighbors = new Set([id]); knownEdges.forEach((e) => { if (e.source === id) neighbors.add(e.target); if (e.target === id) neighbors.add(e.source); });
      nodeElements.forEach((g, key) => { g.classList.toggle("is-muted", !!id && !neighbors.has(key)); g.classList.toggle("is-active", key === id); g.setAttribute("aria-pressed", key === id); });
      edgeElements.forEach(({ edge, line }) => { const active = edge.source === id || edge.target === id; line.classList.toggle("is-active", !!id && active); line.classList.toggle("is-muted", !!id && !active); });
      focusSelect.value = id; inspector.hidden = !id;
      if (!id) return;
      const r = graphById.get(id); const close = el("button", "inspector-close", "×"); close.type = "button"; close.setAttribute("aria-label", "Снять выделение"); close.addEventListener("click", () => focus(""));
      inspector.replaceChildren(close, el("small", "", `${singular[r.type]} / ${r.type === "note" ? "ЗАМЕТКА" : r.id}`), el("h3", "", r.name), el("p", "", `${neighbors.size - 1} связей · ${caption(r) || r.summary || ""}`));
      if (r.type !== "note") inspector.append(link("Открыть досье ↗", recordHref(r)));
    }
    focusSelect.addEventListener("change", () => focus(focusSelect.value));
    function zoom(factor) { const nw = Math.max(240, Math.min(6000, view.w * factor)); const ratio = nw / view.w; const nh = view.h * ratio; view.x += (view.w - nw) / 2; view.y += (view.h - nh) / 2; view.w = nw; view.h = nh; applyView(); }
    $("#graph-in").addEventListener("click", () => zoom(.8)); $("#graph-out").addEventListener("click", () => zoom(1.25)); $("#graph-reset").addEventListener("click", () => { fit(); focus(""); });
    root.addEventListener("keydown", (e) => { if (e.target !== root) return; if (e.key === "+" || e.key === "=") zoom(.8); else if (e.key === "-") zoom(1.25); else if (e.key === "Escape") focus(""); else if (e.key === "0") fit(); else return; e.preventDefault(); });
    const point = (e) => { const p = root.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(root.getScreenCTM().inverse()); };
    let drag = null;
    root.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; const g = e.target.closest("[data-node]"); const start = point(e); const id = g?.dataset.node; drag = { pointer: e.pointerId, id, start, original: id ? { ...positions.get(id) } : { ...view }, moved: false }; root.setPointerCapture(e.pointerId); });
    root.addEventListener("pointermove", (e) => { if (!drag || drag.pointer !== e.pointerId) return; const p = point(e), dx = p.x - drag.start.x, dy = p.y - drag.start.y; drag.moved ||= Math.abs(dx) + Math.abs(dy) > 4; if (drag.id) { positions.set(drag.id, { x: drag.original.x + dx, y: drag.original.y + dy }); draw(); } else { view.x -= dx; view.y -= dy; applyView(); } });
    const finish = (e, cancelled = false) => { if (!drag || drag.pointer !== e.pointerId) return; const d = drag; drag = null; if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId); if (!cancelled && !d.moved && d.id) focus(d.id); };
    root.addEventListener("pointerup", (e) => finish(e)); root.addEventListener("pointercancel", (e) => finish(e, true));
    $("#graph-count").textContent = `${graphRecords.length} узлов / ${knownEdges.length} связей`;
    const list = $("#graph-list");
    knownEdges.forEach((e) => { const row = el("div", "edge-pair"); for (const id of [e.source, e.target]) { const r = graphById.get(id); if (row.childNodes.length) row.append(el("span", "", "↔")); row.append(r.type === "note" ? el("span", "", r.name) : link(`${r.id} · ${r.name}`, recordHref(r))); } list.append(row); });
    $("#graph-list-toggle").addEventListener("click", (e) => { list.hidden = !list.hidden; e.currentTarget.setAttribute("aria-expanded", !list.hidden); });
    draw(); fit();
  }

  function initLocations() {
    const target = $("#location-map"); if (!target) return;
    const groups = new Map();
    function position(geo) { return geo && geo.lat !== null && geo.lng !== null && Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lng)) && Math.abs(Number(geo.lat)) <= 90 && Math.abs(Number(geo.lng)) <= 180; }
    records.filter((r) => position(r.geo)).forEach((r) => {
      const key = `${Number(r.geo.lat).toFixed(4)},${Number(r.geo.lng).toFixed(4)}`;
      if (!groups.has(key)) groups.set(key, { key, lat: Number(r.geo.lat), lng: Number(r.geo.lng), label: r.geo.label || field(r, /местополож|локаци/) || "Локация", records: [] });
      groups.get(key).records.push(r);
    });
    const locations = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "ru"));
    let map = null, layer = null; const markers = new Map(); const buttons = new Map();
    const status = $("#map-status");
    function showStatus(text) { status.textContent = text; status.hidden = false; }
    function popup(item) {
      const div = el("div", "map-popup"); div.append(el("strong", "", item.label));
      item.records.forEach((r) => div.append(link(`${r.id} · ${r.name} ↗`, recordHref(r)))); return div;
    }
    function select(item) { buttons.forEach((b, key) => b.classList.toggle("is-active", key === item.key)); if (map) { map.setView([item.lat, item.lng], 9); markers.get(item.key)?.openPopup(); } else { $("#location-list").append(popup(item)); } }
    function renderList() {
      const q = norm($("#location-search").value); const list = $("#location-list"); list.replaceChildren();
      const items = locations.filter((item) => norm(`${item.label} ${item.records.map((r) => `${r.id} ${r.name}`).join(" ")}`).includes(q));
      items.forEach((item, i) => {
        const button = el("button", "location-item"); button.type = "button";
        const meta = el("span"); meta.append(el("span", "", String(i + 1).padStart(2, "0")), el("span", "", `${item.records.length} зап.`));
        button.append(meta, el("strong", "", item.label), el("small", "", `${item.lat.toFixed(4)}° / ${item.lng.toFixed(4)}°`));
        button.addEventListener("click", () => { activate(); select(item); }); buttons.set(item.key, button); list.append(button);
      });
      if (!items.length) list.append(el("p", "empty-note", "Локации не найдены."));
    }
    let activated = false;
    function fit() { if (map && locations.length) map.fitBounds(locations.map((p) => [p.lat, p.lng]), { padding: [35, 35], maxZoom: 8 }); }
    function activate() {
      if (activated) return; activated = true;
      if (!window.L) { showStatus("Подложка карты недоступна. Координаты и досье доступны в списке локаций."); return; }
      map = window.L.map(target, { scrollWheelZoom: false, attributionControl: true }).setView([48, 100], 3);
      let loaded = 0, failures = 0;
      layer = window.L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' }).addTo(map);
      layer.on("tileload", () => { loaded++; if (loaded > failures) status.hidden = true; });
      layer.on("tileerror", () => { failures++; if (!loaded && failures >= 3) showStatus("Подложка карты не загрузилась. Используйте координаты и список локаций."); });
      locations.forEach((item) => { const marker = window.L.marker([item.lat, item.lng], { icon: window.L.divIcon({ className: "location-marker", html: String(item.records.length), iconSize: [25, 25], iconAnchor: [12, 12] }), title: item.label }).addTo(map).bindPopup(popup(item)); markers.set(item.key, marker); marker.on("click", () => select(item)); });
      fit(); new ResizeObserver(() => map.invalidateSize()).observe(target);
    }
    $("#location-count").textContent = `${locations.length} точек / ${locations.reduce((n, p) => n + p.records.length, 0)} записей`;
    $("#location-search").addEventListener("input", renderList); $("#map-reset").addEventListener("click", () => { activate(); fit(); });
    renderList();
    if ("IntersectionObserver" in window) { const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { activate(); observer.disconnect(); } }, { rootMargin: "200px" }); observer.observe(target); } else activate();
  }

  function initGlossary() {
    if (!$("#glossary-list")) return;
    const groupNames = { registry: "Протокол реестра", field: "Полевые явления", cosmos: "Космология" };
    function render() {
      const q = norm($("#glossary-search").value), category = $("#glossary-category").value;
      const items = A.glossary.filter((t) => (!category || t.group === category) && norm(`${t.title} ${t.body}`).includes(q));
      $("#glossary-list").replaceChildren(...items.map((term, i) => {
        const d = el("details", "term"); if (term.id) d.id = term.id;
        const summary = el("summary"); summary.append(el("span", "term-index", String(i + 1).padStart(2, "0")), el("strong", "", term.title), el("span", "", "+"));
        const body = el("div", "term-body"); body.append(el("span", "term-category", term.label || groupNames[term.group] || "Термин"), document.createTextNode(term.body || "")); d.append(summary, body); return d;
      }));
      $("#glossary-count").textContent = `${items.length} / ${A.glossary.length} терминов`; $("#glossary-empty").hidden = items.length > 0;
    }
    $("#glossary-search").addEventListener("input", render); $("#glossary-category").addEventListener("change", render); render();
    if (location.hash.startsWith("#term-")) { const target = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (target instanceof HTMLDetailsElement) { target.open = true; target.scrollIntoView(); } }
  }

function createSymbolSvg(symbol) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 160 160");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("symbol-atlas-glyph");
  const group = document.createElementNS(namespace, "g");
  group.setAttribute("fill", "none");
  group.setAttribute("stroke", "currentColor");
  group.setAttribute("stroke-width", "5");
  group.setAttribute("stroke-linecap", "square");
  group.setAttribute("stroke-linejoin", "miter");
  const shape = (tag, attributes) => {
    const node = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
    group.append(node);
    return node;
  };

  if (symbol.key === "her-ksi") {
    shape("path", { d: "M22 42 L64 118 M64 42 L22 118" });
    shape("path", { d: "M92 38 C119 38 127 50 127 62 C127 73 117 80 92 80 C117 80 127 88 127 100 C127 112 118 122 92 122" });
    shape("path", { d: "M86 80 H132" });
  } else if (symbol.key === "kolovrat-right" || symbol.key === "kolovrat-left") {
    const direction = symbol.key === "kolovrat-right" ? 1 : -1;
    for (let index = 0; index < 8; index += 1) {
      shape("path", {
        d: `M80 80 L80 30 L${80 + (25 * direction)} 30`,
        transform: `rotate(${index * 45} 80 80)`,
      });
    }
    shape("circle", { cx: "80", cy: "80", r: "6", fill: "currentColor", stroke: "none" });
  } else if (symbol.key === "fita") {
    shape("ellipse", { cx: "80", cy: "80", rx: "42", ry: "54" });
    shape("path", { d: "M26 80 H134" });
  } else if (symbol.key === "ksi") {
    const ksi = shape("path", { d: "M122 29 C75 21 36 31 32 58 C29 80 52 91 79 82 C98 76 109 84 102 95 C95 105 86 94 71 94 C47 94 36 111 43 130 C52 154 88 162 113 145 C96 165 59 173 29 153" });
    ksi.setAttribute("stroke-width", "13");
    ksi.setAttribute("stroke-linecap", "round");
    ksi.setAttribute("stroke-linejoin", "round");
  } else if (symbol.key === "othala-inverted") {
    const othala = shape("path", { d: "M80 18 L130 68 L80 118 L30 68 Z M80 118 L26 146 M80 118 L134 146" });
    othala.setAttribute("stroke-width", "10");
    othala.setAttribute("transform", "rotate(180 80 80)");
  } else {
    shape("circle", { cx: "80", cy: "80", r: "45" });
  }
  svg.append(group);
  return svg;
}


  function mediaFigure(item) {
    const value = typeof item === "string" ? { src: item } : item;
    if (!value || !safeUrl(value.src || value.url)) return null;
    const f = el("figure"), b = el("button", "media-button"); b.type = "button"; b.setAttribute("aria-label", `Увеличить: ${value.alt || value.caption || "изображение"}`);
    b.append(image(value.src || value.url, value.alt || value.caption)); b.addEventListener("click", () => openMedia(value.src || value.url, value.caption, value.alt));
    f.append(b); if (value.caption) f.append(el("figcaption", "", value.caption)); return f;
  }
  function table(headers, rows) {
    const wrap = el("div", "research-table-viewport"), t = el("table"), head = el("thead"), tr = el("tr"), body = el("tbody");
    headers.forEach((v) => { const th = el("th", "", v); th.scope = "col"; tr.append(th); }); head.append(tr);
    rows.forEach((row) => { const tr = el("tr"); row.forEach((v) => tr.append(el("td", "", v))); body.append(tr); }); t.append(head, body); wrap.append(t); return wrap;
  }
  function renderResearch(research, target) {
    if (!research) return;
    const section = sectionShell("research", "Исследовательские материалы", "R");
    section.append(el("p", "eyebrow", [research.code, research.period].filter(Boolean).join(" / ")), el("h3", "", research.title || ""), el("p", "", research.intro || ""));
    if (research.methodology?.length) section.append(table(["Методика", "Описание"], research.methodology));
    const tones = ["#244e63", "#627b84", "#908169", "#6a7c65", "#919ba5"];
    for (const chart of research.charts || []) {
      const article = el("article", "archive-chart"); article.append(el("h3", "", `${chart.number || ""} / ${chart.title || ""}`), el("p", "", chart.note || ""));
      const metrics = el("dl", "chart-metrics"); (chart.metrics || []).forEach(([k, v]) => { const d = el("div"); d.append(el("dt", "", k), el("dd", "", v)); metrics.append(d); }); article.append(metrics);
      const values = (chart.series || []).flatMap((s) => s.values || []).map(Number).filter(Number.isFinite);
      if (values.length && chart.labels?.length) {
        const W = 700, H = 300, left = 60, top = 15, bottom = 53, right = 18;
        const plotW = W - left - right, plotH = H - top - bottom;
        const log = chart.scale === "log" && values.every((v) => v > 0);
        const min = log ? 10 ** Math.floor(Math.log10(Math.min(...values, chart.threshold || Infinity))) : Math.min(0, ...values);
        const max = log ? 10 ** Math.ceil(Math.log10(Math.max(...values, chart.threshold || 0) * 1.05)) : Math.max(...values, chart.threshold || 0, 1) * 1.12;
        const y = (v) => top + plotH - (log ? (Math.log10(Math.max(min, v)) - Math.log10(min)) / (Math.log10(max) - Math.log10(min) || 1) : (v - min) / (max - min || 1)) * plotH;
        const x = (i) => left + (i + .5) * plotW / chart.labels.length;
        const plot = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${chart.title}. ${chart.unit || ""}. ${log ? "Логарифмическая" : "Линейная"} шкала. Исходные значения приведены в таблице ниже.` });
        for (let i = 0; i < 5; i++) { const v = log ? 10 ** (Math.log10(min) + (Math.log10(max) - Math.log10(min)) * i / 4) : min + (max - min) * i / 4; plot.append(svg("line", { x1: left, x2: W - right, y1: y(v), y2: y(v), stroke: "#e0e6e9" }), svg("text", { x: left - 8, y: y(v) + 3, "text-anchor": "end", fill: "#65767e", "font-size": 9 }, Number(v.toPrecision(3)).toLocaleString("ru"))); }
        chart.labels.forEach((label, i) => plot.append(svg("text", { x: x(i), y: H - 27, "text-anchor": "middle", fill: "#65767e", "font-size": 8 }, label)));
        const count = chart.series.length;
        chart.series.forEach((s, si) => {
          const tone = tones[si % tones.length];
          if (chart.type === "line") { const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" "); plot.append(svg("polyline", { points, fill: "none", stroke: tone, "stroke-width": 2 })); s.values.forEach((v, i) => { const dot = svg("circle", { cx: x(i), cy: y(v), r: 3, fill: tone }); dot.append(svg("title", {}, `${s.name}, ${chart.labels[i]}: ${v} ${chart.unit || ""}`)); plot.append(dot); }); }
          else { const barW = plotW / chart.labels.length * .7 / count; s.values.forEach((v, i) => { const bar = svg("rect", { x: x(i) - barW * count / 2 + si * barW, y: y(v), width: Math.max(1, barW - 2), height: Math.max(0, y(min) - y(v)), fill: tone }); bar.append(svg("title", {}, `${s.name}, ${chart.labels[i]}: ${v} ${chart.unit || ""}`)); plot.append(bar); }); }
        });
        if (Number.isFinite(chart.threshold)) plot.append(svg("line", { x1: left, x2: W - right, y1: y(chart.threshold), y2: y(chart.threshold), stroke: "#a17c62", "stroke-dasharray": "5 4" }));
        article.append(plot, el("p", "", `${chart.unit || ""}${log ? " · Логарифмическая шкала" : ""}${chart.threshold ? ` · Контрольный уровень: ${chart.threshold}` : ""}`));
      }
      const legend = el("div", "chart-legend"); (chart.series || []).forEach((s, i) => { const item = el("span"), swatch = el("i"); swatch.style.background = tones[i % tones.length]; item.append(swatch, document.createTextNode(s.name)); legend.append(item); }); article.append(legend);
      (chart.analysis || []).forEach((p) => article.append(el("p", "", p)));
      const data = el("details", "chart-data"); data.append(el("summary", "", "Исходные значения"), table([chart.unit || "Показатель", ...(chart.labels || [])], (chart.series || []).map((s) => [s.name, ...s.values]))); article.append(data); section.append(article);
    }
    if (research.sampleTable) section.append(el("h3", "", research.sampleTable.title), table(research.sampleTable.headers || [], research.sampleTable.rows || []));
    target.append(section);
  }
  function sectionShell(id, title, number) {
    const s = el("section", "dossier-section"); s.id = id; const header = el("header"); header.append(el("span", "", String(number).padStart(2, "0")), el("h2", "", title)); s.append(header); return s;
  }
  function initRecord() {
    const target = $("#dossier"); if (!target) return;
    const params = new URLSearchParams(location.search); const pathId = location.pathname.match(/mid-[cai]-\d{4}/i)?.[0];
    const id = String(params.get("id") || pathId || "").toUpperCase(); const r = byId.get(id);
    if (!r) { target.append(el("div", "empty-state")); const empty = $(".empty-state", target); empty.append(el("h1", "", "Запись не найдена"), el("p", "", "Проверьте номер досье или откройте реестр."), link("Вернуться к реестру →", "index.html", "plain-button")); document.title = "Запись не найдена — MIDGAS"; return; }
    document.title = `${r.name} / ${r.id} — MIDGAS`; document.body.dataset.recordId = r.id;
    const crumbs = el("nav", "breadcrumbs"); crumbs.setAttribute("aria-label", "Навигационная цепочка"); crumbs.append(link("← Реестр", `index.html?type=${r.type}`), el("span", "", "/"), link(labels[r.type], `index.html?type=${r.type}`), el("span", "", "/"), el("span", "", r.id));
    const hero = el("section", "dossier-hero"), cover = el("figure", "dossier-cover"), coverButton = el("button", "media-button"); coverButton.type = "button"; coverButton.setAttribute("aria-label", `Увеличить фотографию ${r.name}`); const coverImage = image(r.image || r.cardImage, r.name, false); coverImage.className = "dossier-image"; coverButton.append(coverImage); coverButton.addEventListener("click", () => openMedia(r.image || r.cardImage, `${r.id} / ${r.name}`)); cover.append(coverButton, el("figcaption", "", `${r.id} / АРХИВНОЕ ИЗОБРАЖЕНИЕ`));
    const intro = el("div", "dossier-intro"); intro.append(el("p", "eyebrow", `${singular[r.type]} / ${r.id}`), el("h1", "", r.name), el("p", "dossier-caption", caption(r)));
    const levels = el("div", "dossier-levels"); for (const [kind, prefix, label] of [["threat", "T", "Уровень угрозы"], ["access", "D", "Уровень доступа"]]) { if (kind === "access" && r.type !== "client") continue; const l = el("div", "dossier-level"); l.append(el("span", "", label), el("strong", "", `${prefix}${level(r, kind) || "—"}`)); levels.append(l); } intro.append(levels);
    if (tags(r).length) { const t = el("div", "dossier-tags"); tags(r).forEach((v) => t.append(link(v, `index.html?type=${r.type}&tag=${encodeURIComponent(v)}`, "tag"))); intro.append(t); }
    hero.append(cover, intro);
    const layout = el("div", "dossier-layout"), sidebar = el("aside", "dossier-sidebar"), body = el("div", "dossier-body");
    sidebar.append(el("h2", "", "ХАРАКТЕРИСТИКИ")); const dl = el("dl", "dossier-fields"); fields(r).forEach(([k, v]) => { const d = el("div"); d.append(el("dt", "", k), el("dd", "", typeof v === "object" ? JSON.stringify(v) : v)); dl.append(d); }); sidebar.append(dl);
    const toc = el("nav", "dossier-toc"); toc.setAttribute("aria-label", "Содержание досье"); toc.append(el("strong", "", "СОДЕРЖАНИЕ"));
    if (r.summary) body.append(el("p", "dossier-summary", r.summary));
    if (r.gallery?.length) { const s = sectionShell("gallery", "Фотографии", "G"), media = el("div", "dossier-media"); r.gallery.forEach((item) => { const f = mediaFigure(item); if (f) media.append(f); }); s.append(media); body.append(s); toc.append(link("Фотографии", "#gallery")); }
    (r.sections || []).forEach((section, i) => {
      const sid = `section-${i + 1}`, s = sectionShell(sid, section.title || `Раздел ${i + 1}`, i + 1);
      (section.paragraphs || []).forEach((p) => s.append(el("p", "", p)));
      const media = el("div", "dossier-media"); const mediaItems = [...(section.media || []), ...(section.image ? [section.image] : [])]; mediaItems.forEach((item) => { const f = mediaFigure(item); if (f) media.append(f); }); if (media.childElementCount) s.append(media);
      if (section.symbols?.length) { const symbols = el("div", "dossier-symbols"); section.symbols.forEach((symbol) => { const d = el("article", "dossier-symbol"); d.append(createSymbolSvg(symbol), el("small", "", `${symbol.code || ""} / ${symbol.family || "Знак"}`), el("h3", "", symbol.name || ""), el("p", "", symbol.meaning || "")); symbols.append(d); }); s.append(symbols); }
      body.append(s); toc.append(link(`${String(i + 1).padStart(2, "0")} / ${section.title || "Раздел"}`, `#${sid}`));
    });
    renderResearch(r.research, body);
    if (r.geo && Number.isFinite(Number(r.geo.lat)) && Number.isFinite(Number(r.geo.lng))) { const s = sectionShell("location", "Локация", "L"), info = el("div", "dossier-location"); info.append(el("p", "", r.geo.label || field(r, /местополож|локаци/)), el("small", "", `${Number(r.geo.lat).toFixed(5)}° / ${Number(r.geo.lng).toFixed(5)}°`)); const a = link("Открыть карту ↗", `https://www.openstreetmap.org/?mlat=${Number(r.geo.lat)}&mlon=${Number(r.geo.lng)}#map=11/${Number(r.geo.lat)}/${Number(r.geo.lng)}`); a.target = "_blank"; a.rel = "noopener"; info.append(a); s.append(info); body.append(s); }
    const related = [...(connected.get(r.id) || [])].map((id) => byId.get(id)).filter(Boolean);
    if (related.length) { const s = sectionShell("related", "Связанные записи", "↔"), list = el("div", "dossier-related"); related.forEach((r) => { const a = link("", recordHref(r), "related-record"), text = el("div"); text.append(el("small", "", r.id), el("strong", "", r.name)); a.append(image(r.cardImage || r.image, ""), text, el("span", "", "↗")); list.append(a); }); s.append(list); body.append(s); toc.append(link("Связанные записи", "#related")); }
    for (const [key, label] of [["description", "Описание"], ["notes", "Примечания"], ["sources", "Источники"], ["references", "Ссылки и материалы"]]) {
      if (!r[key]) continue;
      const s = sectionShell(`additional-${key}`, label, "+");
      const values = Array.isArray(r[key]) ? r[key] : [r[key]];
      values.forEach((value) => {
        if (typeof value === "string") s.append(el("p", "", value));
        else if (value && typeof value === "object") {
          if (value.title) s.append(el("h3", "", value.title));
          if (value.body || value.text || value.description) s.append(el("p", "", value.body || value.text || value.description));
          if (safeUrl(value.url || value.href)) s.append(link(value.label || value.url || value.href, value.url || value.href));
        }
      });
      body.append(s);
    }
    sidebar.append(toc); layout.append(sidebar, body); target.append(crumbs, hero, layout);
  }
  initCatalog(); initGraph(); initLocations(); initGlossary(); initRecord();
})();
