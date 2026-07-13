(() => {
  const viewport = document.querySelector("#company-board-canvas");
  const world = document.querySelector("#company-board-world");
  const svg = world?.querySelector(".company-board-lines");
  if (!viewport || !world || !svg) return;

  const registry = window.MIDGAS_RECORDS || { client: {}, anomaly: {}, incident: {} };
  const width = 2600;
  const height = 1700;
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
    const ring = index % 2 === 0 ? 1 : 0.72;
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
      x: width / 2 + Math.cos(angle) * 1010 * ring,
      y: height / 2 + Math.sin(angle) * 640 * ring,
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

  const relationPairs = [
    ["MID-A-0001", clientId(3)], ["MID-A-0001", clientId(11)], ["MID-A-0001", clientId(20)],
    ["MID-A-0001", clientId(21)], ["MID-A-0001", clientId(24)], ["MID-A-0001", clientId(18)],
    ["MID-A-0001", clientId(2)], ["MID-A-0001", clientId(8)], ["MID-I-0001", "MID-A-0001"],
    ["MID-I-0001", clientId(24)], ["MID-I-0002", "MID-A-0001"], [clientId(7), clientId(5)],
    [clientId(7), clientId(6)], [clientId(7), clientId(16)], [clientId(6), clientId(5)],
    [clientId(12), clientId(17)], [clientId(12), clientId(9)], [clientId(12), clientId(16)],
    [clientId(13), clientId(2)], [clientId(17), clientId(9)], [clientId(17), clientId(16)],
    [clientId(19), clientId(14)], [clientId(19), clientId(9)], [clientId(19), clientId(1)],
    [clientId(19), clientId(8)], [clientId(19), clientId(2)], [clientId(22), clientId(1)],
    [clientId(25), clientId(9)], [clientId(25), clientId(6)], [clientId(26), clientId(25)],
    [clientId(26), clientId(9)],
  ];
  relationPairs.forEach(([source, target]) => addEdge(keyFromId(source), keyFromId(target), "record"));
  const edges = [...edgeMap.values()];

  const placeLinksByRecord = new Map();
  edges.filter((edge) => edge.kind === "place").forEach((edge) => {
    const place = nodeMap.get(edge.source)?.kind === "place" ? nodeMap.get(edge.source) : nodeMap.get(edge.target);
    const record = nodeMap.get(edge.source)?.kind === "place" ? nodeMap.get(edge.target) : nodeMap.get(edge.source);
    if (!place || !record) return;
    if (!placeLinksByRecord.has(record.key)) placeLinksByRecord.set(record.key, []);
    placeLinksByRecord.get(record.key).push(place);
  });

  recordNodes.forEach((node) => {
    const linkedPlaces = placeLinksByRecord.get(node.key) || [];
    const seed = hash(node.key);
    if (linkedPlaces.length) {
      node.x = linkedPlaces.reduce((sum, place) => sum + place.x, 0) / linkedPlaces.length + ((seed % 281) - 140);
      node.y = linkedPlaces.reduce((sum, place) => sum + place.y, 0) / linkedPlaces.length + (((seed >>> 8) % 221) - 110);
    } else {
      node.x = width / 2 + ((seed % 1201) - 600);
      node.y = height / 2 + (((seed >>> 9) % 801) - 400);
    }
  });

  for (let iteration = 0; iteration < 150; iteration += 1) {
    const forces = new Map(nodes.map((node) => [node.key, { x: 0, y: 0 }]));
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex];
        const right = nodes[rightIndex];
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        let distance = Math.hypot(dx, dy) || 1;
        const minimum = left.kind === "place" || right.kind === "place" ? 155 : 178;
        if (distance >= minimum) continue;
        const force = (minimum - distance) * 0.12;
        dx /= distance;
        dy /= distance;
        if (!left.fixed) { forces.get(left.key).x -= dx * force; forces.get(left.key).y -= dy * force; }
        if (!right.fixed) { forces.get(right.key).x += dx * force; forces.get(right.key).y += dy * force; }
      }
    }
    edges.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      let dx = target.x - source.x;
      let dy = target.y - source.y;
      const distance = Math.hypot(dx, dy) || 1;
      const ideal = edge.kind === "place" ? 210 : 265;
      const force = (distance - ideal) * (edge.kind === "place" ? 0.018 : 0.012);
      dx /= distance;
      dy /= distance;
      if (!source.fixed) { forces.get(source.key).x += dx * force; forces.get(source.key).y += dy * force; }
      if (!target.fixed) { forces.get(target.key).x -= dx * force; forces.get(target.key).y -= dy * force; }
    });
    recordNodes.forEach((node) => {
      const force = forces.get(node.key);
      force.x += (width / 2 - node.x) * 0.0008;
      force.y += (height / 2 - node.y) * 0.0008;
      node.x = Math.max(120, Math.min(width - 120, node.x + Math.max(-22, Math.min(22, force.x))));
      node.y = Math.max(100, Math.min(height - 100, node.y + Math.max(-22, Math.min(22, force.y))));
    });
  }

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
    ["shadow", "base", "fiber"].forEach((layer) => {
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
    stage: document.querySelector("[data-board-stage]"),
    link: document.querySelector("[data-board-link]"),
  };
  let activeKey = nodeMap.has("anomaly:MID-A-0001") ? "anomaly:MID-A-0001" : nodes[0]?.key;

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
    if (inspector.stage) inspector.stage.textContent = node.stage;
    if (inspector.link) {
      inspector.link.hidden = node.kind === "place";
      if (node.kind !== "place") inspector.link.href = `record.html?type=${node.kind}&id=${encodeURIComponent(node.id)}`;
    }
    if (focus) element.focus({ preventScroll: true });
  }

  let panX = 0;
  let panY = 0;
  let drag = null;
  let suppressClick = false;

  function applyPan() {
    world.style.transform = `translate3d(${panX.toFixed(1)}px, ${panY.toFixed(1)}px, 0)`;
  }

  function centerOn(key = activeKey) {
    const node = nodeMap.get(key) || { x: width / 2, y: height / 2 };
    panX = viewport.clientWidth / 2 - node.x;
    panY = viewport.clientHeight / 2 - node.y;
    applyPan();
  }

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY, moved: false };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-dragging");
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    panX = drag.panX + dx;
    panY = drag.panY + dy;
    applyPan();
  });

  function finishDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick = drag.moved;
    viewport.classList.remove("is-dragging");
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    drag = null;
  }
  viewport.addEventListener("pointerup", finishDrag);
  viewport.addEventListener("pointercancel", finishDrag);

  viewport.addEventListener("click", (event) => {
    const nodeElement = event.target.closest("[data-board-node]");
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    if (nodeElement) selectNode(nodeElement.dataset.boardNode);
  });

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

  document.querySelector("[data-board-reset]")?.addEventListener("click", () => centerOn());
  document.querySelectorAll("[data-board-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.boardFilter || "all";
      document.querySelectorAll("[data-board-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
      let visible = 0;
      nodeElements.forEach((element, key) => {
        const show = filter === "all" || nodeMap.get(key).kind === filter;
        element.hidden = !show;
        if (show) visible += 1;
      });
      threadGroups.forEach((group) => {
        group.hidden = nodeElements.get(group.dataset.source)?.hidden || nodeElements.get(group.dataset.target)?.hidden;
      });
      const activeElement = nodeElements.get(activeKey);
      if (!activeElement || activeElement.hidden) {
        const next = nodes.find((node) => !nodeElements.get(node.key).hidden);
        if (next) selectNode(next.key);
      } else {
        selectNode(activeKey);
      }
      const counter = document.querySelector("[data-board-count]");
      if (counter) counter.textContent = `${visible} ИЗ ${nodes.length} УЗЛОВ`;
    });
  });

  const counter = document.querySelector("[data-board-count]");
  if (counter) counter.textContent = `${nodes.length} УЗЛА / ${edges.length} СВЯЗЕЙ`;
  requestAnimationFrame(() => {
    centerOn(activeKey);
    selectNode(activeKey);
  });
})();
