(async () => {
  const stage = document.querySelector("[data-board-stage]");
  const viewport = document.querySelector("#company-board-canvas");
  const world = document.querySelector("#company-board-world");
  const svg = world?.querySelector(".company-board-lines");
  if (!stage || !viewport || !world || !svg) return;

  const supabase = window.MIDGAS_SUPABASE_CLIENT;
  const sessionApi = window.MIDGAS_EDITOR_SESSION;
  const remoteData = window.MIDGAS_SUPABASE_DATA;
  const remoteReady = Promise.resolve(remoteData?.ready).catch(() => null);
  if (document.body.classList.contains("board-page")) stage.classList.add("is-visible");

  const registry = window.MIDGAS_RECORDS || { client: {}, anomaly: {}, incident: {} };
  const width = 3600;
  const height = 2400;
  const typeOrder = ["client", "anomaly", "incident"];
  const typeLabels = { client: "КЛИЕНТ", anomaly: "АНОМАЛИЯ", incident: "ИНЦИДЕНТ", place: "LOC / ЛОКАЦИЯ", subject: "SUB / СУБЪЕКТ" };
  const recordKey = (type, id) => `${type}:${id}`;
  const keyFromId = (id) => recordKey(id.includes("-C-") ? "client" : id.includes("-A-") ? "anomaly" : "incident", id);
  const clientId = (number) => `MID-C-${String(number).padStart(4, "0")}`;
  const mobileQuery = window.matchMedia("(max-width: 760px)");

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function collectRecordNodes() {
    return typeOrder.flatMap((type) => Object.values(registry[type] || {})
      .sort((left, right) => String(left.id).localeCompare(String(right.id), "ru"))
      .map((record) => ({
        key: recordKey(type, record.id), id: record.id, kind: type,
        title: record.name || record.alias || record.id,
        summary: record.summary || "Карточка включена в связный контур архива.",
        image: record.cardImage || record.image || "", record, remote: false,
      })));
  }

  let recordNodes = collectRecordNodes();

  const placeDefinitions = [
    ["ХАБАРОВСК", [1, 4, 11, 20, 21, 23].map(clientId)],
    ["АНДРЕЕВКА", [clientId(3), clientId(10), clientId(18), clientId(20), clientId(24), "MID-A-0001", "MID-I-0001", "MID-I-0002"]],
    ["ПОЛУОСТРОВ ВИТЯЗЬ", [clientId(18), "MID-A-0001"]],
    ["ГАРАЖИ НА ИСТОМИНА", [clientId(11)]], ["ПЯТАЯ ПЛОЩАДКА", [clientId(21)]],
    ["ХЕХЦИРСКИЙ БУНКЕР", [clientId(21)]], ["ХОЛДОМИ", [clientId(23)]],
    ["ВОРОНЕЖ", [clientId(2)]], ["ПЛАНЕТА ЭКЛЕР", [clientId(2)]], ["АФРИКА", [clientId(4)]],
    ["МОСКВА", [clientId(5)]], ["МИАСС", [clientId(8)]], ["КИТАЙ", [clientId(12)]],
    ["ПЛАНЕТА ЭСЛЕР", [clientId(13)]], ["СИРИУС B", [clientId(14)]],
    ["СЕКТОР 37–44 А.Е.", [clientId(14)]], ["ТЕЛЬ-АВИВ", [clientId(15)]],
    ["ЧЕГДОМЫН", [clientId(16)]], ["ВЛАДИВОСТОК", [clientId(17)]],
    ["КИРГИЗИЯ", [clientId(22)]], ["ПОСОЛЬСТВО США", [clientId(26)]],
    ["МЕЖДУНАРОДНЫЕ МАРШРУТЫ", [clientId(9)]], ["ШКОЛА / ПОДВАЛ", [clientId(10)]],
  ];

  const placeNodes = placeDefinitions.map(([title], index) => {
    const angle = (Math.PI * 2 * index) / placeDefinitions.length - Math.PI / 2;
    return {
      key: `place:${String(index + 1).padStart(2, "0")}`, id: `LOC-${String(index + 1).padStart(2, "0")}`,
      kind: "place", title, summary: "Географический узел, встречающийся в материалах связанных досье.", image: "",
      x: width / 2 + Math.cos(angle) * 1620, y: height / 2 + Math.sin(angle) * 1120, remote: false,
    };
  });

  const recordColumns = 6;
  const recordSpacingX = 250;
  const recordSpacingY = 240;
  function layoutRecordNodes(items = recordNodes) {
    const recordRows = Math.ceil(items.length / recordColumns);
    const recordStartX = (width - (recordColumns - 1) * recordSpacingX) / 2;
    const recordStartY = (height - (recordRows - 1) * recordSpacingY) / 2;
    items.forEach((node, index) => {
      const seed = hash(node.key);
      const row = Math.floor(index / recordColumns);
      const column = index % recordColumns;
      node.x = recordStartX + column * recordSpacingX + (row % 2 ? recordSpacingX * 0.18 : 0) + ((seed % 31) - 15);
      node.y = recordStartY + row * recordSpacingY + (((seed >>> 8) % 25) - 12);
    });
  }
  layoutRecordNodes();

  let nodes = [...placeNodes, ...recordNodes];
  const nodeMap = new Map(nodes.map((node) => [node.key, node]));
  const nodeElements = new Map();
  const edgeMap = new Map();
  let threadGroups = [];
  let remoteNodeKeys = new Set();
  let remoteEdgeIds = new Set();
  let activeKey = nodeMap.has("anomaly:MID-A-0001") ? "anomaly:MID-A-0001" : nodes[0]?.key;

  function addEdge(source, target, kind = "record", remoteId = "") {
    if (!nodeMap.has(source) || !nodeMap.has(target) || source === target) return;
    const [first, second] = [source, target].sort();
    const id = `${first}|${second}`;
    if (!edgeMap.has(id)) edgeMap.set(id, { id, source: first, target: second, kind, remoteId });
    if (remoteId) remoteEdgeIds.add(id);
    return edgeMap.get(id);
  }

  function rebuildDataEdges() {
    [...edgeMap.entries()].forEach(([id, edge]) => {
      if (edge.kind !== "remote") edgeMap.delete(id);
      else if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
        edgeMap.delete(id);
        remoteEdgeIds.delete(id);
      }
    });
    placeDefinitions.forEach(([, ids], index) => ids.forEach((id) => addEdge(placeNodes[index].key, keyFromId(id), "place")));
    (window.MIDGAS_RELATIONS?.pairs || []).forEach(([source, target]) => addEdge(keyFromId(source), keyFromId(target)));
    recordNodes.forEach((node) => {
      const sectionRelations = Array.isArray(node.record.sections)
        ? node.record.sections.flatMap((section) => section.relatedRecords || []) : [];
      const explicit = Array.isArray(node.record.editorRelations) ? node.record.editorRelations : null;
      (explicit || sectionRelations).forEach((relation) => {
        const id = String(relation?.id || "");
        const type = typeOrder.includes(relation?.type) ? relation.type
          : id.includes("-C-") ? "client" : id.includes("-A-") ? "anomaly" : id.includes("-I-") ? "incident" : "";
        if (type) addEdge(node.key, recordKey(type, id));
      });
    });
  }
  rebuildDataEdges();

  function nodeFromRow(row) {
    return {
      key: `board:${row.id}`, id: row.node_code, kind: row.node_type === "SUB" ? "subject" : "place",
      title: row.title, summary: row.description || "Редакционный узел доски связей.", image: "",
      x: Number(row.position_x), y: Number(row.position_y), remote: true, row,
    };
  }

  function createNodeElement(node) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `company-board-node company-board-node--${node.kind}`;
    if (node.draft) button.classList.add("is-draft");
    button.dataset.boardNode = node.key;
    button.style.left = `${node.x.toFixed(1)}px`;
    button.style.top = `${node.y.toFixed(1)}px`;
    button.style.setProperty("--node-tilt", `${((hash(node.key) % 51) - 25) / 20}deg`);
    if (node.image) {
      const image = document.createElement("img");
      image.dataset.src = node.image;
      if (!mobileQuery.matches) image.src = node.image;
      image.alt = ""; image.loading = "lazy"; image.decoding = "async"; button.append(image);
    }
    const code = document.createElement("span");
    const title = document.createElement("strong");
    code.textContent = node.id; title.textContent = node.title;
    button.append(code, title); world.append(button); nodeElements.set(node.key, button);
  }

  nodes.forEach(createNodeElement);

  function ensureNodeImage(key) {
    const image = nodeElements.get(key)?.querySelector("img[data-src]");
    if (image && !image.getAttribute("src")) image.src = image.dataset.src;
  }

  function syncRecordNodesFromRegistry() {
    recordNodes.forEach((node) => {
      nodeElements.get(node.key)?.remove();
      nodeElements.delete(node.key);
      nodeMap.delete(node.key);
    });
    nodes = nodes.filter((node) => !typeOrder.includes(node.kind));
    recordNodes = collectRecordNodes();
    layoutRecordNodes();
    recordNodes.forEach((node) => {
      nodes.push(node);
      nodeMap.set(node.key, node);
      createNodeElement(node);
    });
    rebuildDataEdges();
    renderThreads();
    updateCounter();
    if (!nodeMap.has(activeKey)) activeKey = nodeMap.has("anomaly:MID-A-0001") ? "anomaly:MID-A-0001" : nodes[0]?.key;
    selectNode(activeKey);
  }

  function threadPathData(edge) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) return "";
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy) || 1;
    const perpendicularX = -dy / distance;
    const perpendicularY = dx / distance;
    const sideways = ((hash(edge.id) % 71) - 35) * 0.75;
    const gravity = Math.min(116, 28 + distance * 0.1);
    const controlX = (source.x + target.x) / 2 + perpendicularX * sideways;
    const controlY = (source.y + target.y) / 2 + perpendicularY * sideways + gravity;
    return `M ${source.x.toFixed(1)} ${source.y.toFixed(1)} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${target.x.toFixed(1)} ${target.y.toFixed(1)}`;
  }

  function makeThread(edge) {
    const pathData = threadPathData(edge);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("company-board-thread", `company-board-thread--${edge.kind}`);
    group.dataset.edgeId = edge.id; group.dataset.source = edge.source; group.dataset.target = edge.target;
    ["shadow", "base"].forEach((layer) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData); path.classList.add(`company-board-thread-${layer}`); group.append(path);
    });
    return group;
  }

  function renderThreads() {
    svg.querySelectorAll(".company-board-thread:not(.company-board-thread--draft)").forEach((item) => item.remove());
    threadGroups = [...edgeMap.values()].map((edge) => {
      const group = makeThread(edge); svg.prepend(group); return group;
    });
  }

  function updateThreadsForNode(key) {
    threadGroups.forEach((group) => {
      if (group.dataset.source !== key && group.dataset.target !== key) return;
      const edge = edgeMap.get(group.dataset.edgeId);
      const pathData = edge ? threadPathData(edge) : "";
      if (pathData) group.querySelectorAll("path").forEach((path) => path.setAttribute("d", pathData));
    });
  }

  const inspector = {
    root: document.querySelector("[data-board-inspector]"), image: document.querySelector("[data-board-image]"),
    kind: document.querySelector("[data-board-kind-label]"), title: document.querySelector("[data-board-title]"),
    summary: document.querySelector("[data-board-summary]"), id: document.querySelector("[data-board-id]"),
    link: document.querySelector("[data-board-link]"), actions: document.querySelector("[data-board-node-actions]"),
    mobileImage: document.querySelector("[data-board-mobile-image]"), mobileTitle: document.querySelector("[data-board-mobile-title]"),
    mobileId: document.querySelector("[data-board-mobile-id]"),
  };
  const inspectorDelete = document.querySelector("[data-board-node-delete]");

  function connectedKeys(key) {
    const result = new Set();
    edgeMap.forEach((edge) => {
      if (edge.source === key) result.add(edge.target);
      if (edge.target === key) result.add(edge.source);
    });
    return result;
  }

  function selectNode(key, focus = false) {
    const node = nodeMap.get(key);
    const element = nodeElements.get(key);
    if (!node || !element) return;
    activeKey = key;
    const related = connectedKeys(key);
    ensureNodeImage(key);
    related.forEach(ensureNodeImage);
    nodeElements.forEach((item, itemKey) => {
      item.classList.toggle("is-active", itemKey === key);
      item.classList.toggle("is-related", related.has(itemKey));
      item.classList.toggle("is-dimmed", itemKey !== key && !related.has(itemKey));
    });
    threadGroups.forEach((group) => {
      const active = group.dataset.source === key || group.dataset.target === key;
      group.classList.toggle("is-active", active); group.classList.toggle("is-dimmed", !active);
    });
    if (inspector.image) {
      inspector.image.hidden = !node.image;
      if (node.image) { inspector.image.src = node.image; inspector.image.alt = node.title; }
    }
    if (inspector.mobileImage) {
      inspector.mobileImage.hidden = !node.image;
      if (node.image) { inspector.mobileImage.src = node.image; inspector.mobileImage.alt = node.title; }
    }
    if (inspector.mobileTitle) inspector.mobileTitle.textContent = node.title;
    if (inspector.mobileId) inspector.mobileId.textContent = node.id;
    if (inspector.kind) inspector.kind.textContent = typeLabels[node.kind];
    if (inspector.title) inspector.title.textContent = node.title;
    if (inspector.summary) inspector.summary.textContent = node.summary;
    if (inspector.id) inspector.id.textContent = node.id;
    if (inspector.link) {
      inspector.link.hidden = !typeOrder.includes(node.kind);
      if (typeOrder.includes(node.kind)) inspector.link.href = `record.html?type=${node.kind}&id=${encodeURIComponent(node.id)}`;
    }
    if (inspector.actions) inspector.actions.hidden = !(editorMode && node.remote);
    if (inspectorDelete) inspectorDelete.hidden = !sessionApi?.hasAccess?.("full");
    if (focus) element.focus({ preventScroll: true });
  }

  async function fetchRemoteBoard() {
    if (!supabase) return { nodeRows: [], edgeRows: [] };
    const [nodesResponse, edgesResponse, positionsResponse] = await Promise.all([
      supabase.from("board_nodes").select("id,node_no,node_code,node_type,title,description,position_x,position_y,created_at").order("node_no"),
      supabase.from("board_edges").select("id,source_key,target_key,created_at").order("created_at"),
      supabase.from("board_positions").select("node_key,position_x,position_y,updated_at"),
    ]);
    if (nodesResponse.error) throw nodesResponse.error;
    if (edgesResponse.error) throw edgesResponse.error;
    if (positionsResponse.error) throw positionsResponse.error;
    return { nodeRows: nodesResponse.data || [], edgeRows: edgesResponse.data || [], positionRows: positionsResponse.data || [] };
  }

  function mergeRemoteBoard(nodeRows, edgeRows, positionRows = []) {
    remoteEdgeIds.forEach((id) => edgeMap.delete(id));
    remoteEdgeIds.clear();
    remoteNodeKeys.forEach((key) => { nodeElements.get(key)?.remove(); nodeElements.delete(key); nodeMap.delete(key); });
    nodes = nodes.filter((node) => !remoteNodeKeys.has(node.key));
    remoteNodeKeys.clear();
    nodeRows.map(nodeFromRow).forEach((node) => {
      nodes.push(node); nodeMap.set(node.key, node); remoteNodeKeys.add(node.key); createNodeElement(node);
    });
    positionRows.forEach((row) => {
      const node = nodeMap.get(row.node_key);
      const element = nodeElements.get(row.node_key);
      if (!node || !element) return;
      node.x = Number(row.position_x); node.y = Number(row.position_y);
      element.style.left = `${node.x.toFixed(1)}px`; element.style.top = `${node.y.toFixed(1)}px`;
    });
    edgeRows.forEach((row) => addEdge(row.source_key, row.target_key, "remote", row.id));
    renderThreads();
    updateCounter();
    if (!nodeMap.has(activeKey)) activeKey = nodes[0]?.key;
    selectNode(activeKey);
  }

  let boardReloadPromise = null;
  function reloadRemoteBoard() {
    if (editorMode && hasDraftChanges()) return Promise.resolve();
    if (boardReloadPromise) return boardReloadPromise;
    boardReloadPromise = (async () => {
      try { const data = await fetchRemoteBoard(); mergeRemoteBoard(data.nodeRows, data.edgeRows, data.positionRows); }
      catch (error) { console.warn("MIDGAS board sync:", error); }
    })().finally(() => { boardReloadPromise = null; });
    return boardReloadPromise;
  }

  let recordGraphReload = null;
  function reloadRecordGraph() {
    if (editorMode && hasDraftChanges()) return Promise.resolve();
    if (recordGraphReload) return recordGraphReload;
    recordGraphReload = (async () => {
      try {
        await remoteData?.loadPublicRecords?.();
        syncRecordNodesFromRegistry();
        await reloadRemoteBoard();
      } catch (error) {
        console.warn("MIDGAS record graph sync:", error);
      }
    })().finally(() => { recordGraphReload = null; });
    return recordGraphReload;
  }

  const MIN_SCALE = 0.34;
  const MAX_SCALE = 2.1;
  const pointers = new Map();
  let scale = mobileQuery.matches ? 0.58 : 0.86;
  let panX = 0;
  let panY = 0;
  let gesture = null;
  let panFrame = 0;
  let isFullscreen = false;
  let editorMode = false;
  let linkMode = "";
  let positionMode = false;
  let movingNode = null;
  let firstLinkKey = "";
  let draftGroup = null;
  let threadFrame = 0;
  let pendingThreadKey = "";
  const draftChanges = {
    addedEdges: new Map(),
    removedEdges: new Map(),
    positions: new Map(),
    newNodes: new Map(),
    updatedNodes: new Map(),
    deletedNodes: new Map(),
  };

  function clearDraftChanges() {
    Object.values(draftChanges).forEach((collection) => collection.clear());
  }

  function draftChangeCount() {
    return Object.values(draftChanges).reduce((total, collection) => total + collection.size, 0);
  }

  function hasDraftChanges() { return draftChangeCount() > 0; }

  function updateDraftStatus(message = "") {
    const count = draftChangeCount();
    setEditStatus(message || (count ? `ЧЕРНОВИК: ${count} ИЗМЕНЕНИЙ` : "РЕЖИМ РЕДАКТОРА / ИЗМЕНЕНИЙ НЕТ"));
    stage.classList.toggle("has-board-draft", count > 0);
  }

  function scheduleThreadUpdate(key) {
    pendingThreadKey = key;
    if (threadFrame) return;
    threadFrame = requestAnimationFrame(() => {
      threadFrame = 0;
      updateThreadsForNode(pendingThreadKey);
      pendingThreadKey = "";
    });
  }

  function clampScale(value) { return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)); }
  function constrainPan() {
    const margin = isFullscreen ? 110 : 24;
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    panX = scaledWidth <= viewport.clientWidth ? (viewport.clientWidth - scaledWidth) / 2
      : Math.min(margin, Math.max(viewport.clientWidth - scaledWidth - margin, panX));
    panY = scaledHeight <= viewport.clientHeight ? (viewport.clientHeight - scaledHeight) / 2
      : Math.min(margin, Math.max(viewport.clientHeight - scaledHeight - margin, panY));
  }
  function applyPan() {
    if (panFrame) return;
    panFrame = requestAnimationFrame(() => {
      panFrame = 0; constrainPan();
      world.style.transform = `translate3d(${panX.toFixed(1)}px, ${panY.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
    });
  }
  function centerOn(key = activeKey, resetScale = false) {
    if (resetScale) scale = mobileQuery.matches ? 0.58 : 0.86;
    const node = nodeMap.get(key) || { x: width / 2, y: height / 2 };
    panX = viewport.clientWidth / 2 - node.x * scale;
    panY = viewport.clientHeight / 2 - node.y * scale;
    applyPan();
  }
  function localPoint(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
  function worldPoint(clientX, clientY) {
    const point = localPoint(clientX, clientY);
    return { x: (point.x - panX) / scale, y: (point.y - panY) / scale };
  }

  function openBoard() {
    isFullscreen = true;
    stage.classList.add("is-fullscreen");
    document.documentElement.classList.add("board-fullscreen-open");
    requestAnimationFrame(() => centerOn(activeKey, true));
  }
  function closeBoard() {
    if (editorMode && hasDraftChanges()) {
      void discardBoardDraft().then(() => { leaveEditor(); closeBoard(); });
      return;
    }
    if (document.body.classList.contains("board-page")) {
      window.location.href = "index.html";
      return;
    }
    isFullscreen = false; editorMode = false; linkMode = ""; positionMode = false; movingNode = null; firstLinkKey = ""; removeDraft();
    stage.classList.remove("is-fullscreen", "is-editor-mode", "is-position-mode");
    document.documentElement.classList.remove("board-fullscreen-open");
    document.querySelector("[data-board-editor-tools]").hidden = true;
    document.querySelector("[data-board-edit]").hidden = !sessionApi?.isEditor?.();
    inspector.root?.classList.remove("is-expanded");
    stage.classList.remove("has-board-selection");
    requestAnimationFrame(() => centerOn(activeKey, true));
  }

  function updateEditorAccess() {
    const editButton = document.querySelector("[data-board-edit]");
    if (editButton) editButton.hidden = !sessionApi?.isEditor?.() || editorMode;
  }

  function setEditStatus(message = "") { const output = document.querySelector("[data-board-edit-status]"); if (output) output.textContent = message; }
  async function enterEditor() {
    try { await sessionApi?.ready; } catch { /* session state is checked below */ }
    if (!sessionApi?.isEditor?.()) {
      updateEditorAccess();
      setEditStatus("СЕССИЯ РЕДАКТОРА НЕ АКТИВНА");
      return;
    }
    editorMode = true; stage.classList.add("is-editor-mode");
    clearDraftChanges();
    document.querySelector("[data-board-edit]").hidden = true;
    document.querySelector("[data-board-editor-tools]").hidden = false;
    const removeEdgeButton = document.querySelector("[data-board-remove-edge]");
    if (removeEdgeButton) removeEdgeButton.hidden = !sessionApi?.hasAccess?.("full");
    document.querySelector("[data-board-edit]")?.setAttribute("aria-pressed", "true");
    if (mobileQuery.matches) inspector.root?.classList.remove("is-expanded");
    updateDraftStatus();
    selectNode(activeKey);
  }
  function leaveEditor() {
    editorMode = false; linkMode = ""; positionMode = false; movingNode = null; firstLinkKey = ""; removeDraft();
    stage.classList.remove("is-editor-mode", "is-position-mode", "has-board-draft");
    document.querySelector("[data-board-editor-tools]").hidden = true;
    document.querySelector("[data-board-edit]")?.setAttribute("aria-pressed", "false");
    updateEditorAccess(); setEditStatus(""); selectNode(activeKey);
  }

  function stageNodePosition(node) {
    if (!node || node.draft) {
      updateDraftStatus("НОВЫЙ УЗЕЛ ПЕРЕМЕЩЁН / СОХРАНИТЕ ЧЕРНОВИК");
      return;
    }
    draftChanges.positions.set(node.key, {
      node_key: node.key,
      position_x: Number(node.x.toFixed(2)),
      position_y: Number(node.y.toFixed(2)),
    });
    updateDraftStatus("ПОЛОЖЕНИЕ ИЗМЕНЕНО / СОХРАНИТЕ ИЛИ ОТМЕНИТЕ");
  }

  function ensureDraft() {
    if (draftGroup) return draftGroup;
    draftGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    draftGroup.classList.add("company-board-thread", "company-board-thread--draft");
    ["shadow", "base"].forEach((layer) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add(`company-board-thread-${layer}`); draftGroup.append(path);
    });
    svg.append(draftGroup); return draftGroup;
  }
  function removeDraft() { draftGroup?.remove(); draftGroup = null; }
  function updateDraft(clientX, clientY) {
    if (!linkMode || !firstLinkKey) return;
    const source = nodeMap.get(firstLinkKey);
    if (!source) return;
    const target = worldPoint(clientX, clientY);
    const distance = Math.hypot(target.x - source.x, target.y - source.y);
    const path = `M ${source.x} ${source.y} Q ${(source.x + target.x) / 2} ${(source.y + target.y) / 2 + Math.min(120, 25 + distance * 0.1)} ${target.x} ${target.y}`;
    ensureDraft().querySelectorAll("path").forEach((item) => item.setAttribute("d", path));
  }

  function stageEdgeAddition(source, target) {
    const [sourceKey, targetKey] = [source, target].sort();
    const id = `${sourceKey}|${targetKey}`;
    const removed = draftChanges.removedEdges.get(id);
    if (removed) {
      edgeMap.set(id, removed);
      draftChanges.removedEdges.delete(id);
      renderThreads(); selectNode(targetKey); updateDraftStatus("УДАЛЕНИЕ СВЯЗИ ОТМЕНЕНО");
      return;
    }
    if (edgeMap.has(id)) { setEditStatus("СВЯЗЬ УЖЕ СУЩЕСТВУЕТ"); return; }
    const edge = addEdge(sourceKey, targetKey, "pending");
    if (edge) draftChanges.addedEdges.set(id, edge);
    renderThreads(); updateCounter(); selectNode(targetKey);
    updateDraftStatus("СВЯЗЬ ДОБАВЛЕНА В ЧЕРНОВИК");
  }

  function stageEdgeRemoval(source, target) {
    if (!sessionApi?.hasAccess?.("full")) {
      setEditStatus("УДАЛЕНИЕ СВЯЗЕЙ ДОСТУПНО С ПОЛНЫМ ДОСТУПОМ");
      return;
    }
    const [sourceKey, targetKey] = [source, target].sort();
    const id = `${sourceKey}|${targetKey}`;
    const edge = edgeMap.get(id);
    if (!edge) { setEditStatus("МЕЖДУ ЭТИМИ УЗЛАМИ НЕТ СВЯЗИ"); return; }
    if (edge.kind === "place") { setEditStatus("СИСТЕМНУЮ СВЯЗЬ ЛОКАЦИИ УДАЛИТЬ НЕЛЬЗЯ"); return; }
    edgeMap.delete(id);
    if (edge.kind === "pending") draftChanges.addedEdges.delete(id);
    else draftChanges.removedEdges.set(id, edge);
    renderThreads(); updateCounter(); selectNode(targetKey);
    updateDraftStatus("СВЯЗЬ УБРАНА ИЗ ЧЕРНОВИКА");
  }

  function handleNodeTap(key) {
    stage.classList.add("has-board-selection");
    if (!linkMode) { selectNode(key); return; }
    if (!firstLinkKey) {
      firstLinkKey = key; selectNode(key); setEditStatus("ВЫБЕРИТЕ ВТОРОЙ УЗЕЛ"); return;
    }
    if (firstLinkKey === key) { setEditStatus("ВЫБЕРИТЕ ДРУГОЙ УЗЕЛ"); return; }
    const source = firstLinkKey; firstLinkKey = ""; removeDraft();
    if (linkMode === "remove") stageEdgeRemoval(source, key);
    else stageEdgeAddition(source, key);
  }

  async function discardBoardDraft() {
    const draftNodeKeys = [...draftChanges.newNodes.keys()];
    draftNodeKeys.forEach((key) => {
      nodeElements.get(key)?.remove();
      nodeElements.delete(key);
      nodeMap.delete(key);
    });
    nodes = nodes.filter((node) => !draftNodeKeys.includes(node.key));
    clearDraftChanges();
    linkMode = ""; positionMode = false; firstLinkKey = ""; removeDraft();
    stage.classList.remove("is-position-mode", "has-board-draft");
    try {
      await remoteData?.loadPublicRecords?.();
      syncRecordNodesFromRegistry();
      await reloadRemoteBoard();
    } catch (error) {
      console.warn("MIDGAS board draft reset:", error);
    }
    if (!nodeMap.has(activeKey)) activeKey = nodes[0]?.key;
    renderThreads(); updateCounter(); selectNode(activeKey);
  }

  async function saveBoardDraft() {
    if (!hasDraftChanges()) { updateDraftStatus("НЕТ ИЗМЕНЕНИЙ ДЛЯ СОХРАНЕНИЯ"); return; }
    if (!sessionApi?.isEditor?.() || !supabase) { setEditStatus("СЕССИЯ РЕДАКТОРА НЕ АКТИВНА"); return; }
    const saveButton = document.querySelector("[data-board-save]");
    if (saveButton) saveButton.disabled = true;
    setEditStatus("СОХРАНЯЕМ ЧЕРНОВИК В SUPABASE…");
    const keyMap = new Map();
    try {
      for (const [key, node] of draftChanges.newNodes) {
        const { data, error } = await supabase.from("board_nodes").insert({
          node_type: node.kind === "subject" ? "SUB" : "LOC",
          title: node.title,
          description: node.summary,
          position_x: Number(node.x.toFixed(2)),
          position_y: Number(node.y.toFixed(2)),
          updated_at: new Date().toISOString(),
        }).select("id,node_no,node_code,node_type,title,description,position_x,position_y,created_at").single();
        if (error) throw error;
        keyMap.set(key, `board:${data.id}`);
      }

      for (const [key, node] of draftChanges.updatedNodes) {
        if (draftChanges.deletedNodes.has(key) || node.draft) continue;
        const { error } = await supabase.from("board_nodes").update({
          node_type: node.kind === "subject" ? "SUB" : "LOC",
          title: node.title,
          description: node.summary,
          updated_at: new Date().toISOString(),
        }).eq("id", node.row.id);
        if (error) throw error;
      }

      for (const edge of draftChanges.removedEdges.values()) {
        const source = keyMap.get(edge.source) || edge.source;
        const target = keyMap.get(edge.target) || edge.target;
        const { error } = await supabase.rpc("delete_board_edge", { p_source_key: source, p_target_key: target });
        if (error) throw error;
      }

      for (const node of draftChanges.deletedNodes.values()) {
        const key = node.key;
        const edgeResult = await supabase.from("board_edges").delete().or(`source_key.eq.${key},target_key.eq.${key}`);
        if (edgeResult.error) throw edgeResult.error;
        const positionResult = await supabase.from("board_positions").delete().eq("node_key", key);
        if (positionResult.error) throw positionResult.error;
        const nodeResult = await supabase.from("board_nodes").delete().eq("id", node.row.id);
        if (nodeResult.error) throw nodeResult.error;
      }

      for (const edge of draftChanges.addedEdges.values()) {
        const source = keyMap.get(edge.source) || edge.source;
        const target = keyMap.get(edge.target) || edge.target;
        const { error } = await supabase.rpc("create_board_edge", { p_source_key: source, p_target_key: target });
        if (error) throw error;
      }

      const userId = sessionApi?.read?.()?.userId;
      const positions = [...draftChanges.positions.values()]
        .filter((position) => !draftChanges.deletedNodes.has(position.node_key) && !keyMap.has(position.node_key))
        .map((position) => ({ ...position, updated_by: userId, updated_at: new Date().toISOString() }));
      if (positions.length) {
        const { error } = await supabase.from("board_positions").upsert(positions, { onConflict: "node_key" });
        if (error) throw error;
      }

      if (keyMap.has(activeKey)) activeKey = keyMap.get(activeKey);
      clearDraftChanges();
      stage.classList.remove("has-board-draft");
      await remoteData?.loadPublicRecords?.({ throwOnError: true });
      syncRecordNodesFromRegistry();
      await reloadRemoteBoard();
      updateDraftStatus("ВСЕ ИЗМЕНЕНИЯ СОХРАНЕНЫ В SUPABASE");
    } catch (error) {
      if (keyMap.size) await discardBoardDraft();
      setEditStatus(error.message || "НЕ УДАЛОСЬ СОХРАНИТЬ ЧЕРНОВИК");
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  }

  viewport.addEventListener("pointerdown", (event) => {
    if (!isFullscreen || (event.pointerType === "mouse" && event.button !== 0)) return;
    const targetNode = event.target.closest("[data-board-node]");
    pointers.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY, targetKey: targetNode?.dataset.boardNode || "" });
    try { viewport.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    if (positionMode && targetNode) {
      movingNode = nodeMap.get(targetNode.dataset.boardNode) || null;
      if (movingNode) {
        gesture = { mode: "node", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startNodeX: movingNode.x, startNodeY: movingNode.y, moved: false };
        targetNode.classList.add("is-positioning");
        selectNode(movingNode.key);
        return;
      }
    }
    if (pointers.size === 1) gesture = { mode: "pending", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startPanX: panX, startPanY: panY, moved: false };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const midpoint = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture = { mode: "pinch", startDistance: Math.hypot(b.x - a.x, b.y - a.y), startScale: scale, anchorX: (midpoint.x - panX) / scale, anchorY: (midpoint.y - panY) / scale, moved: true };
    }
  });
  viewport.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse") updateDraft(event.clientX, event.clientY);
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX; pointer.y = event.clientY;
    if (gesture?.mode === "node" && gesture.pointerId === event.pointerId && movingNode) {
      const dx = (event.clientX - gesture.startX) / scale;
      const dy = (event.clientY - gesture.startY) / scale;
      if (Math.hypot(dx, dy) > 2) gesture.moved = true;
      movingNode.x = Math.max(100, Math.min(width - 100, gesture.startNodeX + dx));
      movingNode.y = Math.max(90, Math.min(height - 90, gesture.startNodeY + dy));
      const movingElement = nodeElements.get(movingNode.key);
      if (movingElement) { movingElement.style.left = `${movingNode.x.toFixed(1)}px`; movingElement.style.top = `${movingNode.y.toFixed(1)}px`; }
      scheduleThreadUpdate(movingNode.key); event.preventDefault(); return;
    }
    if (gesture?.mode === "pinch" && pointers.size >= 2) {
      const [a, b] = [...pointers.values()].slice(0, 2);
      const midpoint = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      scale = clampScale(gesture.startScale * distance / Math.max(1, gesture.startDistance));
      panX = midpoint.x - gesture.anchorX * scale; panY = midpoint.y - gesture.anchorY * scale;
      applyPan(); event.preventDefault(); return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX; const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) > 7) { gesture.moved = true; gesture.mode = "pan"; viewport.classList.add("is-dragging"); }
    if (gesture.mode === "pan") { panX = gesture.startPanX + dx; panY = gesture.startPanY + dy; applyPan(); event.preventDefault(); }
  });
  function finishPointer(event) {
    const pointer = pointers.get(event.pointerId);
    const tappedKey = !gesture?.moved && pointers.size === 1 ? pointer?.targetKey : "";
    const movedNode = gesture?.mode === "node" && gesture.moved ? movingNode : null;
    if (movingNode) nodeElements.get(movingNode.key)?.classList.remove("is-positioning");
    pointers.delete(event.pointerId);
    try { if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId); } catch { /* best effort */ }
    if (tappedKey) handleNodeTap(tappedKey);
    if (movedNode) {
      if (threadFrame) cancelAnimationFrame(threadFrame);
      threadFrame = 0; pendingThreadKey = ""; updateThreadsForNode(movedNode.key);
      stageNodePosition(movedNode);
    }
    if (pointers.size === 0) { gesture = null; movingNode = null; viewport.classList.remove("is-dragging"); }
  }
  viewport.addEventListener("pointerup", finishPointer);
  viewport.addEventListener("pointercancel", finishPointer);
  viewport.addEventListener("wheel", (event) => {
    if (!isFullscreen) return;
    event.preventDefault();
    const point = localPoint(event.clientX, event.clientY);
    const anchorX = (point.x - panX) / scale; const anchorY = (point.y - panY) / scale;
    scale = clampScale(scale * Math.exp(-event.deltaY * 0.0014));
    panX = point.x - anchorX * scale; panY = point.y - anchorY * scale; applyPan();
  }, { passive: false });

  const nodeDialog = document.querySelector("[data-board-node-dialog]");
  const nodeForm = document.querySelector("[data-board-node-form]");
  const nodeError = document.querySelector("[data-board-node-error]");
  const nodeDialogTitle = document.querySelector("[data-board-node-dialog-title]");
  const nodeSubmit = document.querySelector("[data-board-node-submit]");
  const nodeDetailFields = [...document.querySelectorAll("[data-board-node-details]")];
  function updateNodeDialogMode() {
    const selectedType = nodeForm?.querySelector('[name="nodeType"]:checked')?.value || "";
    const opensRecordCreator = typeOrder.includes(selectedType);
    nodeDetailFields.forEach((field) => {
      field.hidden = opensRecordCreator;
      field.querySelectorAll("input, textarea").forEach((control) => { control.required = !opensRecordCreator; });
    });
    const editingKey = nodeForm?.elements.nodeKey?.value || nodeForm?.elements.nodeId?.value;
    if (nodeSubmit && !editingKey) nodeSubmit.textContent = opensRecordCreator ? "ПЕРЕЙТИ К СОЗДАНИЮ КАРТОЧКИ" : "ДОБАВИТЬ УЗЕЛ";
  }
  function openNodeDialog(node = null) {
    nodeForm?.reset(); if (nodeError) nodeError.textContent = "";
    if (nodeForm) {
      nodeForm.querySelectorAll('[name="nodeType"]').forEach((input) => {
        input.disabled = Boolean(node) && typeOrder.includes(input.value);
        input.closest("label")?.toggleAttribute("hidden", input.disabled);
      });
      nodeForm.elements.nodeId.value = node?.key || "";
      if (nodeForm.elements.nodeKey) nodeForm.elements.nodeKey.value = node?.key || "";
      if (node?.remote) {
        const type = node.kind === "subject" ? "SUB" : "LOC";
        const typeInput = nodeForm.querySelector(`[name="nodeType"][value="${type}"]`);
        if (typeInput) typeInput.checked = true;
        nodeForm.elements.title.value = node.title;
        nodeForm.elements.description.value = node.summary;
      }
    }
    if (nodeDialogTitle) nodeDialogTitle.textContent = node ? "РЕДАКТИРОВАТЬ УЗЕЛ" : "ДОБАВИТЬ НА ДОСКУ";
    if (nodeSubmit) nodeSubmit.textContent = node ? "СОХРАНИТЬ ИЗМЕНЕНИЯ" : "ДОБАВИТЬ УЗЕЛ";
    updateNodeDialogMode();
    nodeDialog?.showModal?.();
  }
  function closeNodeDialog() { nodeDialog?.close?.(); }
  nodeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!nodeForm.reportValidity()) return;
    const submit = nodeForm.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      const values = new FormData(nodeForm);
      const editingKey = String(values.get("nodeKey") || values.get("nodeId") || "");
      const selectedType = String(values.get("nodeType") || "");
      if (!editingKey && typeOrder.includes(selectedType)) {
        closeNodeDialog();
        closeBoard();
        window.location.href = `editor.html?create=${encodeURIComponent(selectedType)}`;
        return;
      }
      const center = worldPoint(viewport.getBoundingClientRect().left + viewport.clientWidth / 2, viewport.getBoundingClientRect().top + viewport.clientHeight / 2);
      const title = String(values.get("title") || "").trim();
      const summary = String(values.get("description") || "").trim();
      let key = editingKey;
      if (editingKey) {
        const node = nodeMap.get(editingKey);
        if (!node) throw new Error("УЗЕЛ НЕ НАЙДЕН В ЧЕРНОВИКЕ");
        node.title = title;
        node.summary = summary;
        node.kind = selectedType === "SUB" ? "subject" : "place";
        const element = nodeElements.get(editingKey);
        if (element) {
          element.className = `company-board-node company-board-node--${node.kind}`;
          if (node.draft) element.classList.add("is-draft");
          const heading = element.querySelector("strong");
          if (heading) heading.textContent = node.title;
        }
        if (!node.draft) draftChanges.updatedNodes.set(editingKey, node);
      } else {
        key = `draft:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
        const node = {
          key,
          id: `NEW-${String(draftChanges.newNodes.size + 1).padStart(2, "0")}`,
          kind: selectedType === "SUB" ? "subject" : "place",
          title,
          summary,
          image: "",
          x: Math.max(180, Math.min(width - 180, center.x + 120)),
          y: Math.max(140, Math.min(height - 140, center.y + 90)),
          remote: true,
          draft: true,
          row: null,
        };
        nodes.push(node); nodeMap.set(key, node); draftChanges.newNodes.set(key, node); createNodeElement(node);
      }
      closeNodeDialog(); renderThreads(); updateCounter(); selectNode(key); centerOn(key);
      updateDraftStatus(editingKey ? "ИЗМЕНЕНИЯ УЗЛА ДОБАВЛЕНЫ В ЧЕРНОВИК" : "НОВЫЙ УЗЕЛ ДОБАВЛЕН В ЧЕРНОВИК");
    } catch (error) { if (nodeError) nodeError.textContent = error.message || "НЕ УДАЛОСЬ ДОБАВИТЬ УЗЕЛ"; }
    finally { submit.disabled = false; }
  });

  function updateCounter() {
    const counter = document.querySelector("[data-board-count]");
    if (counter) counter.textContent = `${nodes.length} УЗЛОВ / ${edgeMap.size} СВЯЗЕЙ`;
  }

  document.querySelector("[data-board-open]")?.addEventListener("click", openBoard);
  document.querySelector("[data-board-close]")?.addEventListener("click", closeBoard);
  document.querySelector("[data-board-edit]")?.addEventListener("click", () => { void enterEditor(); });
  document.querySelector("[data-board-save]")?.addEventListener("click", () => { void saveBoardDraft(); });
  document.querySelector("[data-board-edit-close]")?.addEventListener("click", () => {
    void discardBoardDraft().then(leaveEditor);
  });
  document.querySelector("[data-board-add-edge]")?.addEventListener("click", () => {
    linkMode = "add"; positionMode = false; movingNode = null; firstLinkKey = ""; removeDraft();
    stage.classList.remove("is-position-mode"); setEditStatus("ВЫБЕРИТЕ ПЕРВЫЙ УЗЕЛ");
  });
  document.querySelector("[data-board-remove-edge]")?.addEventListener("click", () => {
    if (!sessionApi?.hasAccess?.("full")) { setEditStatus("УДАЛЕНИЕ СВЯЗЕЙ ДОСТУПНО С ПОЛНЫМ ДОСТУПОМ"); return; }
    linkMode = "remove"; positionMode = false; movingNode = null; firstLinkKey = ""; removeDraft();
    stage.classList.remove("is-position-mode"); setEditStatus("УДАЛЕНИЕ СВЯЗИ: ВЫБЕРИТЕ ПЕРВЫЙ УЗЕЛ");
  });
  document.querySelector("[data-board-add-node]")?.addEventListener("click", () => openNodeDialog());
  document.querySelector("[data-board-move-nodes]")?.addEventListener("click", () => {
    positionMode = !positionMode; linkMode = ""; firstLinkKey = ""; removeDraft();
    stage.classList.toggle("is-position-mode", positionMode);
    setEditStatus(positionMode ? "ПЕРЕТАСКИВАЙТЕ КАРТОЧКИ / ЗАТЕМ НАЖМИТЕ СОХРАНИТЬ" : "РЕЖИМ РЕДАКТОРА");
  });
  document.querySelector("[data-board-node-edit]")?.addEventListener("click", () => {
    const node = nodeMap.get(activeKey); if (node?.remote) openNodeDialog(node);
  });
  document.querySelector("[data-board-node-delete]")?.addEventListener("click", () => {
    if (!sessionApi?.hasAccess?.("full")) { setEditStatus("УДАЛЕНИЕ НЕДОСТУПНО ДЛЯ ОГРАНИЧЕННОГО ДОСТУПА"); return; }
    const node = nodeMap.get(activeKey);
    if (!node?.remote) return;
    const key = node.key;
    if (node.draft) draftChanges.newNodes.delete(key);
    else draftChanges.deletedNodes.set(key, node);
    [...edgeMap.entries()].forEach(([id, edge]) => {
      if (edge.source !== key && edge.target !== key) return;
      edgeMap.delete(id);
      draftChanges.addedEdges.delete(id);
      draftChanges.removedEdges.delete(id);
    });
    draftChanges.positions.delete(key);
    draftChanges.updatedNodes.delete(key);
    nodeElements.get(key)?.remove(); nodeElements.delete(key); nodeMap.delete(key);
    nodes = nodes.filter((item) => item.key !== key);
    activeKey = nodes[0]?.key;
    renderThreads(); updateCounter(); selectNode(activeKey);
    updateDraftStatus("УЗЕЛ УБРАН ИЗ ЧЕРНОВИКА");
  });
  document.querySelector("[data-board-node-cancel]")?.addEventListener("click", closeNodeDialog);
  nodeForm?.querySelectorAll('[name="nodeType"]').forEach((input) => input.addEventListener("change", updateNodeDialogMode));
  document.querySelector("[data-board-inspector-toggle]")?.addEventListener("click", () => inspector.root?.classList.toggle("is-expanded"));
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isFullscreen || nodeDialog?.open) return;
    if (editorMode) void discardBoardDraft().then(leaveEditor);
    else closeBoard();
  });
  window.addEventListener(sessionApi?.eventName || "midgas:editor-session", updateEditorAccess);
  sessionApi?.ready?.then(updateEditorAccess);

  renderThreads(); updateCounter(); selectNode(activeKey);
  requestAnimationFrame(() => centerOn(activeKey, true));
  if (new URLSearchParams(window.location.search).get("board") === "open") openBoard();

  await remoteReady;
  syncRecordNodesFromRegistry();
  await reloadRemoteBoard();

  if (supabase) {
    supabase.channel("midgas-board-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "board_nodes" }, reloadRemoteBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_edges" }, reloadRemoteBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_positions" }, reloadRemoteBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "records" }, () => { void reloadRecordGraph(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "relationships" }, () => { void reloadRecordGraph(); })
      .subscribe();
  }

  const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(() => applyPan()) : null;
  resizeObserver?.observe(viewport);
})();
