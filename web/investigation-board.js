(async () => {
  const viewport = document.querySelector("#company-board-canvas");
  const world = document.querySelector("#company-board-world");
  const svg = world?.querySelector(".company-board-lines");
  if (!viewport || !world || !svg) return;

  const remoteData = window.MIDGAS_SUPABASE_DATA;
  if (remoteData?.ready) {
    try {
      await remoteData.ready;
    } catch {
      // Встроенный реестр остаётся рабочим резервом при недоступности сети.
    }
  }

  const registry = window.MIDGAS_RECORDS || { client: {}, anomaly: {}, incident: {} };
  const width = 3600;
  const height = 2400;
  const typeOrder = ["client", "anomaly", "incident"];
  const typeLabels = { client: "КЛИЕНТ", anomaly: "АНОМАЛИЯ", incident: "ИНЦИДЕНТ", place: "МЕСТО" };
  const recordKey = (type, id) => `${type}:${id}`;
  const keyFromId = (id) => recordKey(id.includes("-C-") ? "client" : id.includes("-A-") ? "anomaly" : "incident", id);
  const clientId = (number) => `MID-C-${String(number).padStart(4, "0")}`;

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  const recordNodes = typeOrder.flatMap((type) => Object.values(registry[type] || {})
    .sort((left, right) => String(left.id).localeCompare(String(right.id), "ru"))
    .map((record) => ({
      key: recordKey(type, record.id),
      id: record.id,
      kind: type,
      title: record.name || record.alias || record.id,
      summary: record.summary || "Карточка включена в связный контур архива.",
      stage: record.stage || "В РАБОТЕ",
      image: record.cardImage || record.image || "",
      record,
      fixed: false,
    })));

  const placeDefinitions = [
    ["ХАБАРОВСК", [1, 4, 11, 20, 21, 23].map(clientId)],
    ["АНДРЕЕВКА", [clientId(3), clientId(10), clientId(18), clientId(20), clientId(24), "MID-A-0001", "MID-I-0001", "MID-I-0002"]],
    ["ПОЛУОСТРОВ ВИТЯЗЬ", [clientId(18), "MID-A-0001"]],
    ["ГАРАЖИ НА ИСТОМИНА", [clientId(11)]],
    ["ПЯТАЯ ПЛОЩАДКА", [clientId(21)]],
    ["ХЕХЦИРСКИЙ БУНКЕР", [clientId(21)]],
    ["ХОЛДОМИ", [clientId(23)]],
    ["ВОРОНЕЖ", [clientId(2)]],
    ["ПЛАНЕТА ЭКЛЕР", [clientId(2)]],
    ["АФРИКА", [clientId(4)]],
    ["МОСКВА", [clientId(5)]],
    ["МИАСС", [clientId(8)]],
    ["КИТАЙ", [clientId(12)]],
    ["ПЛАНЕТА ЭСЛЕР", [clientId(13)]],
    ["СИРИУС B", [clientId(14)]],
    ["СЕКТОР 37–44 А.Е.", [clientId(14)]],
    ["ТЕЛЬ-АВИВ", [clientId(15)]],
    ["ЧЕГДОМЫН", [clientId(16)]],
    ["ВЛАДИВОСТОК", [clientId(17)]],
    ["КИРГИЗИЯ", [clientId(22)]],
    ["ПОСОЛЬСТВО США", [clientId(26)]],
    ["МЕЖДУНАРОДНЫЕ МАРШРУТЫ", [clientId(9)]],
    ["ШКОЛА / ПОДВАЛ", [clientId(10)]],
  ];

  const placeNodes = placeDefinitions.map(([title], index) => {
    const angle = (Math.PI * 2 * index) / placeDefinitions.length - Math.PI / 2;
    return {
      key: `place:${String(index + 1).padStart(2, "0")}`,
      id: `LOC-${String(index + 1).padStart(2, "0")}`,
      kind: "place",
      title,
      summary: "Географический или маршрутный узел, встречающийся в материалах связанных досье.",
      stage: "КАРТА",
      image: "",
      fixed: true,
      x: width / 2 + Math.cos(angle) * 1620,
      y: height / 2 + Math.sin(angle) * 1150,
    };
  });

  const nodes = [...placeNodes, ...recordNodes];
  const nodeMap = new Map(nodes.map((node) => [node.key, node]));
  const edgeMap = new Map();

  function addEdge(source, target, kind = "record") {
    if (!nodeMap.has(source) || !nodeMap.has(target) || source === target) return;
    const id = [source, target].sort().join("|");
    if (!edgeMap.has(id)) edgeMap.set(id, { id, source, target, kind });
  }

  placeDefinitions.forEach(([, ids], index) => {
    const placeKey = placeNodes[index].key;
    ids.forEach((id) => addEdge(placeKey, keyFromId(id), "place"));
  });

  const relationPairs = window.MIDGAS_RELATIONS?.pairs || [];
  const explicitRelationNodes = new Set(recordNodes
    .filter((node) => Array.isArray(node.record.editorRelations)
      && (node.record.editorRelations.length || node.record.editorRelationsVersion === 1))
    .map((node) => node.key));
  relationPairs.forEach(([source, target]) => {
    const sourceKey = keyFromId(source);
    const targetKey = keyFromId(target);
    if (explicitRelationNodes.has(sourceKey) || explicitRelationNodes.has(targetKey)) return;
    addEdge(sourceKey, targetKey, "record");
  });

  recordNodes.forEach((node) => {
    const sectionRelations = Array.isArray(node.record.sections)
      ? node.record.sections.flatMap((section) => Array.isArray(section.relatedRecords) ? section.relatedRecords : [])
      : [];
    const hasExplicitRelations = Array.isArray(node.record.editorRelations)
      && (node.record.editorRelations.length || node.record.editorRelationsVersion === 1);
    const storedRelations = hasExplicitRelations ? node.record.editorRelations : sectionRelations;
    const seen = new Set();
    storedRelations.forEach((relation) => {
      const id = String(relation?.id || "");
      const type = typeOrder.includes(relation?.type)
        ? relation.type
        : id.includes("-C-") ? "client" : id.includes("-A-") ? "anomaly" : id.includes("-I-") ? "incident" : "";
      const target = type ? recordKey(type, id) : "";
      if (!target || seen.has(target)) return;
      seen.add(target);
      addEdge(node.key, target, "record");
    });
  });
  const edges = [...edgeMap.values()];

  const recordColumns = 6;
  const recordSpacingX = 250;
  const recordSpacingY = 240;
  const recordRows = Math.ceil(recordNodes.length / recordColumns);
  const recordStartX = (width - (recordColumns - 1) * recordSpacingX) / 2;
  const recordStartY = (height - (recordRows - 1) * recordSpacingY) / 2;

  recordNodes.forEach((node, index) => {
    const seed = hash(node.key);
    const row = Math.floor(index / recordColumns);
    const column = index % recordColumns;
    const rowOffset = row % 2 ? recordSpacingX * 0.18 : 0;
    node.x = recordStartX + column * recordSpacingX + rowOffset + ((seed % 31) - 15);
    node.y = recordStartY + row * recordSpacingY + (((seed >>> 8) % 25) - 12);
  });

  function makeThread(edge) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy) || 1;
    const seed = hash(edge.id);
    const perpendicularX = -dy / distance;
    const perpendicularY = dx / distance;
    const sideways = ((seed % 71) - 35) * 0.75;
    const gravity = Math.min(116, 28 + distance * 0.1);
    const controlX = (source.x + target.x) / 2 + perpendicularX * sideways;
    const controlY = (source.y + target.y) / 2 + perpendicularY * sideways + gravity;
    const pathData = `M ${source.x.toFixed(1)} ${source.y.toFixed(1)} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${target.x.toFixed(1)} ${target.y.toFixed(1)}`;
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("company-board-thread");
    group.dataset.source = edge.source;
    group.dataset.target = edge.target;
    ["shadow", "base"].forEach((layer) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      path.setAttribute("pathLength", "100");
      path.classList.add(`company-board-thread-${layer}`);
      group.append(path);
    });
    return group;
  }

  const threadGroups = edges.map((edge) => {
    const group = makeThread(edge);
    svg.append(group);
    return group;
  });

  const nodeElements = new Map();
  nodes.forEach((node) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `company-board-node company-board-node--${node.kind}`;
    button.dataset.boardNode = node.key;
    button.dataset.boardKind = node.kind;
    button.style.left = `${node.x.toFixed(1)}px`;
    button.style.top = `${node.y.toFixed(1)}px`;
    button.style.setProperty("--node-tilt", `${((hash(node.key) % 51) - 25) / 20}deg`);
    if (node.image) {
      const image = document.createElement("img");
      image.src = node.image;
      image.alt = "";
      image.loading = "lazy";
      button.append(image);
    }
    const code = document.createElement("span");
    const title = document.createElement("strong");
    code.textContent = node.id;
    title.textContent = node.title;
    button.append(code, title);
    world.append(button);
    nodeElements.set(node.key, button);
  });

  const inspector = {
    image: document.querySelector("[data-board-image]"),
    kind: document.querySelector("[data-board-kind-label]"),
    title: document.querySelector("[data-board-title]"),
    summary: document.querySelector("[data-board-summary]"),
    id: document.querySelector("[data-board-id]"),
    link: document.querySelector("[data-board-link]"),
  };
  const newestEditorNode = recordNodes
    .filter((node) => node.record.editorCreatedAt)
    .sort((left, right) => String(right.record.editorCreatedAt).localeCompare(String(left.record.editorCreatedAt)))[0];
  let activeKey = newestEditorNode?.key || (nodeMap.has("anomaly:MID-A-0001") ? "anomaly:MID-A-0001" : nodes[0]?.key);

  function connectedKeys(key) {
    const result = new Set();
    edges.forEach((edge) => {
      if (edge.source === key) result.add(edge.target);
      if (edge.target === key) result.add(edge.source);
    });
    return result;
  }

  function selectNode(key, focus = false) {
    const node = nodeMap.get(key);
    const element = nodeElements.get(key);
    if (!node || !element || element.hidden) return;
    activeKey = key;
    const related = connectedKeys(key);
    nodeElements.forEach((item, itemKey) => {
      item.classList.toggle("is-active", itemKey === key);
      item.classList.toggle("is-related", related.has(itemKey));
      item.classList.toggle("is-dimmed", itemKey !== key && !related.has(itemKey));
    });
    threadGroups.forEach((group) => {
      const active = group.dataset.source === key || group.dataset.target === key;
      group.classList.toggle("is-active", active);
      group.classList.toggle("is-dimmed", !active);
    });

    if (inspector.image) {
      inspector.image.hidden = !node.image;
      if (node.image) { inspector.image.src = node.image; inspector.image.alt = node.title; }
    }
    if (inspector.kind) inspector.kind.textContent = typeLabels[node.kind];
    if (inspector.title) inspector.title.textContent = node.title;
    if (inspector.summary) {
      inspector.summary.textContent = node.kind === "place"
        ? `${node.summary} Прямых связей на доске: ${related.size}.`
        : node.summary;
    }
    if (inspector.id) inspector.id.textContent = node.id;
    if (inspector.link) {
      inspector.link.hidden = node.kind === "place";
      if (node.kind !== "place") inspector.link.href = `record.html?type=${node.kind}&id=${encodeURIComponent(node.id)}`;
    }
    if (focus) element.focus({ preventScroll: true });
  }

  const MIN_SCALE = 0.45;
  const MAX_SCALE = 1.35;
  const mobileQuery = window.matchMedia("(max-width: 760px)");
  const pointers = new Map();
  let scale = mobileQuery.matches ? 0.58 : 1;
  let panX = 0;
  let panY = 0;
  let gesture = null;
  let ignoreClickUntil = 0;
  let panFrame = 0;

  function clampScale(value) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  }

  function constrainPan() {
    const margin = mobileQuery.matches ? 24 : 90;
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    panX = scaledWidth <= viewport.clientWidth
      ? (viewport.clientWidth - scaledWidth) / 2
      : Math.min(margin, Math.max(viewport.clientWidth - scaledWidth - margin, panX));
    panY = scaledHeight <= viewport.clientHeight
      ? (viewport.clientHeight - scaledHeight) / 2
      : Math.min(margin, Math.max(viewport.clientHeight - scaledHeight - margin, panY));
  }

  function applyPan() {
    if (panFrame) return;
    panFrame = requestAnimationFrame(() => {
      panFrame = 0;
      constrainPan();
      world.style.transform = `translate3d(${panX.toFixed(1)}px, ${panY.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
    });
  }

  function centerOn(key = activeKey, resetScale = false) {
    if (resetScale) scale = mobileQuery.matches ? 0.58 : 1;
    const node = nodeMap.get(key) || { x: width / 2, y: height / 2 };
    panX = viewport.clientWidth / 2 - node.x * scale;
    panY = viewport.clientHeight / 2 - node.y * scale;
    applyPan();
  }

  function localPoint(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function pointerPair() {
    return [...pointers.values()].slice(0, 2);
  }

  function startPinch() {
    const [first, second] = pointerPair();
    if (!first || !second) return;
    const midpoint = localPoint((first.x + second.x) / 2, (first.y + second.y) / 2);
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    gesture = {
      mode: "pinch",
      startDistance: distance,
      startScale: scale,
      anchorX: (midpoint.x - panX) / scale,
      anchorY: (midpoint.y - panY) / scale,
      moved: true,
    };
    viewport.classList.add("is-dragging");
  }

  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const targetNode = event.target.closest("[data-board-node]");
    pointers.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      targetKey: targetNode?.dataset.boardNode || "",
    });
    try { viewport.setPointerCapture(event.pointerId); } catch { /* Pointer capture is best effort. */ }
    if (pointers.size === 1) {
      gesture = {
        mode: "pending",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPanX: panX,
        startPanY: panY,
        moved: false,
      };
    } else if (pointers.size === 2) {
      startPinch();
    }
  });

  viewport.addEventListener("pointermove", (event) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (gesture?.mode === "pinch" && pointers.size >= 2) {
      const [first, second] = pointerPair();
      const midpoint = localPoint((first.x + second.x) / 2, (first.y + second.y) / 2);
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      scale = clampScale(gesture.startScale * distance / gesture.startDistance);
      panX = midpoint.x - gesture.anchorX * scale;
      panY = midpoint.y - gesture.anchorY * scale;
      applyPan();
      event.preventDefault();
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) > 8) {
      gesture.moved = true;
      gesture.mode = "pan";
      viewport.classList.add("is-dragging");
    }
    if (gesture.mode === "pan") {
      panX = gesture.startPanX + dx;
      panY = gesture.startPanY + dy;
      applyPan();
      event.preventDefault();
    }
  });

  function finishPointer(event) {
    const pointer = pointers.get(event.pointerId);
    const wasMoving = Boolean(gesture?.moved || gesture?.mode === "pinch");
    const tappedKey = !wasMoving && pointers.size === 1 ? pointer?.targetKey || "" : "";
    pointers.delete(event.pointerId);
    try {
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    } catch { /* Pointer capture is best effort. */ }
    if (wasMoving || tappedKey) ignoreClickUntil = performance.now() + 260;
    if (tappedKey) selectNode(tappedKey);
    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      gesture = {
        mode: "pan",
        pointerId: remaining.id,
        startX: remaining.x,
        startY: remaining.y,
        startPanX: panX,
        startPanY: panY,
        moved: wasMoving,
      };
    } else if (pointers.size === 0) {
      gesture = null;
      viewport.classList.remove("is-dragging");
    } else {
      startPinch();
    }
  }

  viewport.addEventListener("pointerup", finishPointer);
  viewport.addEventListener("pointercancel", finishPointer);
  viewport.addEventListener("lostpointercapture", (event) => {
    if (pointers.has(event.pointerId)) finishPointer(event);
  });

  viewport.addEventListener("click", (event) => {
    if (performance.now() < ignoreClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const nodeElement = event.target.closest("[data-board-node]");
    if (nodeElement) selectNode(nodeElement.dataset.boardNode);
  });

  viewport.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const point = localPoint(event.clientX, event.clientY);
    const anchorX = (point.x - panX) / scale;
    const anchorY = (point.y - panY) / scale;
    scale = clampScale(scale * Math.exp(-event.deltaY * 0.002));
    panX = point.x - anchorX * scale;
    panY = point.y - anchorY * scale;
    applyPan();
  }, { passive: false });

  viewport.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 140 : 60;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") panX += step;
    if (event.key === "ArrowRight") panX -= step;
    if (event.key === "ArrowUp") panY += step;
    if (event.key === "ArrowDown") panY -= step;
    applyPan();
  });

  document.querySelector("[data-board-reset]")?.addEventListener("click", () => centerOn(activeKey, true));
  const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(() => applyPan()) : null;
  resizeObserver?.observe(viewport);
  window.addEventListener("resize", () => applyPan(), { passive: true });

  const counter = document.querySelector("[data-board-count]");
  if (counter) counter.textContent = `${nodes.length} УЗЛА / ${edges.length} СВЯЗЕЙ`;
  requestAnimationFrame(() => {
    centerOn(activeKey);
    selectNode(activeKey);
  });
})();
