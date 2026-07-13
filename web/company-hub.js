(() => {
  const hub = document.querySelector("#company-hub");
  if (!hub) return;

  const registry = window.MIDGAS_RECORDS || { client: {}, anomaly: {}, incident: {} };
  const types = ["client", "anomaly", "incident"];
  const typeNames = {
    client: ["КЛИЕНТ", "КЛИЕНТЫ"],
    anomaly: ["АНОМАЛИЯ", "АНОМАЛИИ"],
    incident: ["ИНЦИДЕНТ", "ИНЦИДЕНТЫ"],
  };
  const records = Object.fromEntries(types.map((type) => [type, Object.values(registry[type] || {})]));
  const counts = Object.fromEntries(types.map((type) => [type, records[type].length]));
  const total = types.reduce((sum, type) => sum + counts[type], 0);

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }

  function fnv1a(input) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }

  const signature = `REV-${fnv1a(JSON.stringify(stableValue(registry)))}`;

  document.querySelectorAll("[data-company-record-count]").forEach((element) => {
    element.textContent = String(total).padStart(2, "0");
  });
  document.querySelectorAll("[data-company-revision], [data-footer-revision]").forEach((element) => {
    element.textContent = signature;
  });

  const journalList = document.querySelector("#company-journal-list");
  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Vladivostok",
  }).format(new Date());

  function recordLink(type, record) {
    return `record.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(record.id)}`;
  }

  function createJournalDay() {
    const details = document.createElement("details");
    details.className = "company-journal-day";

    const summary = document.createElement("summary");
    const date = document.createElement("span");
    date.className = "company-journal-date";
    date.innerHTML = `<strong>ОБНОВЛЕНИЕ РЕЕСТРА</strong><time datetime="${new Date().toISOString().slice(0, 10)}">${dateLabel}</time>`;
    const title = document.createElement("h4");
    title.textContent = `Сегодня: добавлено ${counts.client} клиентов, ${counts.incident} инцидента и ${counts.anomaly} аномалия.`;
    const action = document.createElement("span");
    action.className = "company-journal-action";
    action.innerHTML = `<span>ПОДРОБНЕЕ</span><i aria-hidden="true"></i>`;
    summary.append(date, title, action);

    const content = document.createElement("div");
    content.className = "company-journal-details";
    types.forEach((type) => {
      const group = document.createElement("section");
      const heading = document.createElement("h5");
      heading.textContent = `${typeNames[type][1]} / ${String(records[type].length).padStart(2, "0")}`;
      const list = document.createElement("ul");
      records[type]
        .slice()
        .sort((left, right) => String(left.id).localeCompare(String(right.id), "ru"))
        .forEach((record) => {
          const item = document.createElement("li");
          const link = document.createElement("a");
          const code = document.createElement("span");
          const name = document.createElement("strong");
          link.href = recordLink(type, record);
          code.textContent = record.id;
          name.textContent = record.name || record.alias || "БЕЗ НАЗВАНИЯ";
          link.append(code, name);
          item.append(link);
          list.append(item);
        });
      group.append(heading, list);
      content.append(group);
    });

    details.addEventListener("toggle", () => {
      action.querySelector("span").textContent = details.open ? "СКРЫТЬ" : "ПОДРОБНЕЕ";
    });
    details.append(summary, content);
    return details;
  }

  if (journalList) journalList.append(createJournalDay());

  const quotes = [
    ["Архив начинается в тот момент, когда свидетельство перестаёт быть одиночным.", "РЕДАКЦИОННЫЙ ПРОТОКОЛ / ЗАПИСЬ 01"],
    ["Если два источника спорят, мы сохраняем оба. Иногда противоречие точнее любого вывода.", "ЖУРНАЛ СВЕРКИ / ЗАПИСЬ 07"],
    ["На местности важен не самый громкий сигнал, а тот, который возвращается в той же точке.", "ПОЛЕВОЙ БЛОКНОТ / СЕКТОР ВИТЯЗЬ"],
    ["Закрыть досье можно только тогда, когда исчезли не вопросы, а сам наблюдаемый процесс.", "ПРОТОКОЛ НАБЛЮДЕНИЯ / ПУНКТ 12"],
  ];
  let quoteIndex = 0;
  const quoteText = document.querySelector("[data-quote-text]");
  const quoteSource = document.querySelector("[data-quote-source]");
  const quoteCounter = document.querySelector("[data-quote-index]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function showQuote(nextIndex) {
    quoteIndex = (nextIndex + quotes.length) % quotes.length;
    const update = () => {
      if (quoteText) quoteText.textContent = quotes[quoteIndex][0];
      if (quoteSource) quoteSource.textContent = quotes[quoteIndex][1];
      if (quoteCounter) quoteCounter.textContent = `${String(quoteIndex + 1).padStart(2, "0")} / ${String(quotes.length).padStart(2, "0")}`;
    };
    if (!reducedMotion && quoteText?.animate) {
      const animation = quoteText.animate(
        [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-12px)" }],
        { duration: 150, easing: "ease-in", fill: "forwards" },
      );
      animation.finished.then(() => {
        update();
        quoteText.animate(
          [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
      }).catch(update);
    } else {
      update();
    }
  }

  document.querySelector("[data-quote-prev]")?.addEventListener("click", () => showQuote(quoteIndex - 1));
  document.querySelector("[data-quote-next]")?.addEventListener("click", () => showQuote(quoteIndex + 1));

  const boardCanvas = document.querySelector("#company-board-canvas");
  const boardSvg = boardCanvas?.querySelector(".company-board-lines");
  const boardNodes = [...document.querySelectorAll("[data-board-node]")];
  const boardConnections = [
    ["anomaly:MID-A-0001", "incident:MID-I-0001"],
    ["anomaly:MID-A-0001", "incident:MID-I-0002"],
    ["anomaly:MID-A-0001", "client:MID-C-0012"],
    ["anomaly:MID-A-0001", "client:MID-C-0024"],
    ["incident:MID-I-0001", "client:MID-C-0025"],
    ["incident:MID-I-0002", "client:MID-C-0024"],
  ];
  let activeBoardKey = "anomaly:MID-A-0001";

  function getNode(key) {
    return boardNodes.find((node) => node.dataset.boardNode === key);
  }

  function drawBoardLines() {
    if (!boardCanvas || !boardSvg) return;
    boardSvg.replaceChildren();
    const canvasRect = boardCanvas.getBoundingClientRect();
    boardSvg.setAttribute("viewBox", `0 0 ${canvasRect.width} ${canvasRect.height}`);
    boardConnections.forEach(([fromKey, toKey]) => {
      const from = getNode(fromKey);
      const to = getNode(toKey);
      if (!from || !to || from.hidden || to.hidden) return;
      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(fromRect.left - canvasRect.left + fromRect.width / 2));
      line.setAttribute("y1", String(fromRect.top - canvasRect.top + fromRect.height / 2));
      line.setAttribute("x2", String(toRect.left - canvasRect.left + toRect.width / 2));
      line.setAttribute("y2", String(toRect.top - canvasRect.top + toRect.height / 2));
      line.dataset.from = fromKey;
      line.dataset.to = toKey;
      line.classList.toggle("is-active", fromKey === activeBoardKey || toKey === activeBoardKey);
      boardSvg.append(line);
    });
  }

  function recordForKey(key) {
    const separator = key.indexOf(":");
    const type = key.slice(0, separator);
    const id = key.slice(separator + 1);
    return { type, id, record: registry[type]?.[id] };
  }

  function selectBoardNode(key, focus = false) {
    const selectedNode = getNode(key);
    if (!selectedNode || selectedNode.hidden) return;
    activeBoardKey = key;
    boardNodes.forEach((node) => node.classList.toggle("is-active", node === selectedNode));
    const { type, id, record } = recordForKey(key);
    const image = document.querySelector("[data-board-image]");
    const title = document.querySelector("[data-board-title]");
    const summary = document.querySelector("[data-board-summary]");
    const idElement = document.querySelector("[data-board-id]");
    const stage = document.querySelector("[data-board-stage]");
    const kind = document.querySelector("[data-board-kind-label]");
    const link = document.querySelector("[data-board-link]");

    if (image) {
      image.src = record?.cardImage || record?.image || "assets/anomalies/mid-a-0001/andreevka-overview.webp";
      image.alt = record?.name || id;
    }
    if (title) title.textContent = record?.name || selectedNode.querySelector("strong")?.textContent || id;
    if (summary) summary.textContent = record?.summary || "Запись присутствует в связном контуре; открытая редакционная выдержка готовится.";
    if (idElement) idElement.textContent = id;
    if (stage) stage.textContent = record?.stage || "В РАБОТЕ";
    if (kind) kind.textContent = typeNames[type]?.[0] || type.toUpperCase();
    if (link) link.href = `record.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;

    selectedNode.querySelector("strong").textContent = record?.name || selectedNode.querySelector("strong").textContent;
    if (focus) selectedNode.focus({ preventScroll: true });
    drawBoardLines();
  }

  boardNodes.forEach((node) => node.addEventListener("click", () => selectBoardNode(node.dataset.boardNode)));
  document.querySelectorAll("[data-board-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.boardFilter;
      document.querySelectorAll("[data-board-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
      boardNodes.forEach((node) => {
        node.hidden = filter !== "all" && node.dataset.boardKind !== filter;
      });
      const visibleActive = getNode(activeBoardKey);
      if (!visibleActive || visibleActive.hidden) {
        const next = boardNodes.find((node) => !node.hidden);
        if (next) selectBoardNode(next.dataset.boardNode);
      } else {
        drawBoardLines();
      }
    });
  });

  if (boardCanvas && "ResizeObserver" in window) {
    new ResizeObserver(drawBoardLines).observe(boardCanvas);
  }
  window.addEventListener("load", () => {
    selectBoardNode(activeBoardKey);
    drawBoardLines();
  }, { once: true });

  const editorTabs = [...document.querySelectorAll("[data-editor-tab]")];
  const editorPanels = [...document.querySelectorAll("[data-editor-panel]")];
  editorTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.editorTab;
      editorTabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
      editorPanels.forEach((panel) => {
        const active = panel.dataset.editorPanel === target;
        panel.classList.toggle("is-active", active);
        panel.hidden = !active;
      });
    });
  });

  document.querySelector("[data-editor-action]")?.addEventListener("click", (event) => {
    const status = document.querySelector("[data-editor-status]");
    event.currentTarget.textContent = "РЕВИЗИЯ СОБРАНА";
    event.currentTarget.classList.add("is-complete");
    if (status) status.textContent = `${signature} подготовлена как редакционный черновик. Публикация заблокирована до полевой сверки.`;
  });

  const revealElements = [...document.querySelectorAll(".company-reveal")];
  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealElements.forEach((element) => element.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
    revealElements.forEach((element) => revealObserver.observe(element));
  }

  const parallaxElements = [...document.querySelectorAll("[data-company-parallax]")];
  const saveData = Boolean(navigator.connection?.saveData);
  let parallaxFrame = 0;

  function updateParallax() {
    parallaxFrame = 0;
    const viewportHeight = window.innerHeight;
    const mobileFactor = window.innerWidth <= 760 ? 0.45 : 1;
    parallaxElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.bottom < -100 || rect.top > viewportHeight + 100) return;
      const centerOffset = rect.top + rect.height / 2 - viewportHeight / 2;
      const speed = Number(element.dataset.companyParallax || 0);
      const value = Math.max(-90, Math.min(90, centerOffset * speed * mobileFactor));
      element.style.setProperty("--company-parallax-y", `${value.toFixed(2)}px`);
    });
  }

  function requestParallax() {
    if (!parallaxFrame) parallaxFrame = window.requestAnimationFrame(updateParallax);
  }

  if (!reducedMotion && !saveData && parallaxElements.length) {
    updateParallax();
    window.addEventListener("scroll", requestParallax, { passive: true });
    window.addEventListener("resize", requestParallax);
  }
})();
