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

  function registrySnapshot() {
    const records = Object.fromEntries(types.map((type) => [type, Object.values(registry[type] || {})]));
    const counts = Object.fromEntries(types.map((type) => [type, records[type].length]));
    return {
      records,
      counts,
      total: types.reduce((sum, type) => sum + counts[type], 0),
      signature: `REV-${fnv1a(JSON.stringify(stableValue(registry)))}`,
    };
  }

  function updateRegistryMetadata() {
    const snapshot = registrySnapshot();
    document.querySelectorAll("[data-company-record-count]").forEach((element) => {
      element.textContent = String(snapshot.total).padStart(2, "0");
    });
    document.querySelectorAll("[data-company-revision], [data-footer-revision]").forEach((element) => {
      element.textContent = snapshot.signature;
    });
  }

  updateRegistryMetadata();

  const journalList = document.querySelector("#company-journal-list");
  const journalDateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Vladivostok",
  });
  const journalKeyFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Vladivostok",
  });

  function recordLink(type, record) {
    return `record.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(record.id)}`;
  }

  function journalDateKey(value) {
    const [day, month, year] = journalKeyFormatter.format(new Date(value)).split("/");
    return `${year}-${month}-${day}`;
  }

  function plural(value, forms) {
    const number = Math.abs(value) % 100;
    const last = number % 10;
    if (number > 10 && number < 20) return forms[2];
    if (last === 1) return forms[0];
    if (last > 1 && last < 5) return forms[1];
    return forms[2];
  }

  function journalTimeline() {
    const { records } = registrySnapshot();
    const builtIn = Object.fromEntries(types.map((type) => [
      type,
      records[type]
        .filter((record) => !record.editorCreatedAt)
        .sort((left, right) => String(left.id).localeCompare(String(right.id), "ru")),
    ]));
    const days = new Map();

    function addDay(date, entries) {
      if (!days.has(date)) days.set(date, { date, records: { client: [], anomaly: [], incident: [] } });
      types.forEach((type) => days.get(date).records[type].push(...(entries[type] || [])));
    }

    addDay("2026-07-03", { client: builtIn.client.slice(0, 5) });
    addDay("2026-07-05", { client: builtIn.client.slice(5, 11), anomaly: builtIn.anomaly.slice(0, 1) });
    addDay("2026-07-08", { client: builtIn.client.slice(11, 16) });
    addDay("2026-07-10", { client: builtIn.client.slice(16, 21), incident: builtIn.incident.slice(0, 1) });
    addDay("2026-07-12", {
      client: builtIn.client.slice(21),
      anomaly: builtIn.anomaly.slice(1),
      incident: builtIn.incident.slice(1),
    });

    types.forEach((type) => {
      records[type].filter((record) => record.editorCreatedAt).forEach((record) => {
        addDay(journalDateKey(record.editorCreatedAt), { [type]: [record] });
      });
    });

    return [...days.values()]
      .filter((day) => types.some((type) => day.records[type].length))
      .sort((left, right) => right.date.localeCompare(left.date));
  }

  function createJournalDay(day, revisionNumber) {
    const counts = Object.fromEntries(types.map((type) => [type, day.records[type].length]));
    const details = document.createElement("details");
    details.className = "company-journal-day";

    const summary = document.createElement("summary");
    const date = document.createElement("span");
    date.className = "company-journal-date";
    const dateValue = new Date(`${day.date}T12:00:00+10:00`);
    date.innerHTML = `<strong>РЕВИЗИЯ ${String(revisionNumber).padStart(2, "0")}</strong><time datetime="${day.date}">${journalDateFormatter.format(dateValue)}</time>`;
    const title = document.createElement("h4");
    const changes = [
      counts.client ? `${counts.client} ${plural(counts.client, ["клиент", "клиента", "клиентов"])}` : "",
      counts.incident ? `${counts.incident} ${plural(counts.incident, ["инцидент", "инцидента", "инцидентов"])}` : "",
      counts.anomaly ? `${counts.anomaly} ${plural(counts.anomaly, ["аномалия", "аномалии", "аномалий"])}` : "",
    ].filter(Boolean);
    const todayPrefix = day.date === journalDateKey(new Date()) ? "Сегодня: " : "";
    title.textContent = `${todayPrefix}Добавлено ${changes.join(", ")}.`;
    const action = document.createElement("span");
    action.className = "company-journal-action";
    action.innerHTML = `<span>ПОДРОБНЕЕ</span><i aria-hidden="true"></i>`;
    summary.append(date, title, action);

    const content = document.createElement("div");
    content.className = "company-journal-details";
    types.forEach((type) => {
      if (!day.records[type].length) return;
      const group = document.createElement("section");
      const heading = document.createElement("h5");
      heading.textContent = `${typeNames[type][1]} / ${String(day.records[type].length).padStart(2, "0")}`;
      const list = document.createElement("ul");
      day.records[type]
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

  function renderJournal() {
    if (!journalList) return;
    const timeline = journalTimeline();
    journalList.replaceChildren(...timeline.map((day, index) => createJournalDay(day, timeline.length - index)));
  }

  renderJournal();

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
  const quoteFrame = quoteText?.closest("blockquote");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let quoteAnimation = null;

  function renderQuote(index) {
    if (quoteText) quoteText.textContent = quotes[index][0];
    if (quoteSource) quoteSource.textContent = quotes[index][1];
    if (quoteCounter) quoteCounter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(quotes.length).padStart(2, "0")}`;
  }

  async function showQuote(nextIndex) {
    const targetIndex = (nextIndex + quotes.length) % quotes.length;
    quoteIndex = targetIndex;
    quoteAnimation?.cancel();

    if (reducedMotion || !quoteFrame?.animate) {
      renderQuote(targetIndex);
      quoteAnimation = null;
      return;
    }

    const outgoing = quoteFrame.animate(
      [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-12px)" }],
      { duration: 140, easing: "ease-in", fill: "forwards" },
    );
    quoteAnimation = outgoing;

    try {
      await outgoing.finished;
    } catch {
      return;
    }
    if (quoteAnimation !== outgoing) return;

    renderQuote(targetIndex);
    const incoming = quoteFrame.animate(
      [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" },
    );
    quoteAnimation = incoming;
    outgoing.cancel();

    try {
      await incoming.finished;
    } catch {
      return;
    }
    if (quoteAnimation === incoming) {
      incoming.cancel();
      quoteAnimation = null;
    }
  }

  document.querySelector("[data-quote-prev]")?.addEventListener("click", () => showQuote(quoteIndex - 1));
  document.querySelector("[data-quote-next]")?.addEventListener("click", () => showQuote(quoteIndex + 1));

  // The full pannable investigation map is initialized by investigation-board.js.

  const editorForm = document.querySelector("#company-editor-form");
  const editorFile = editorForm?.elements.namedItem("image");
  const editorPreview = document.querySelector("[data-editor-preview]");
  const editorUploadCopy = document.querySelector("[data-editor-upload-copy]");
  const editorCardType = document.querySelector("[data-editor-card-type]");
  const editorSubmit = document.querySelector("[data-editor-submit]");
  const editorResult = document.querySelector("[data-editor-result]");
  const editorError = document.querySelector("[data-editor-error]");
  let preparedImage = "";
  let preparedFile = "";
  let activeCardTypeDefault = "Клиент / наблюдаемый субъект";

  const cardTypeDefaults = {
    client: "Клиент / наблюдаемый субъект",
    incident: "Инцидент / активный процесс",
    anomaly: "Аномалия / зона наблюдения",
  };

  function canvasBlob(canvas, mimeType, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
  }

  function blobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать подготовленное изображение."));
      reader.readAsDataURL(blob);
    });
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Файл не удалось распознать как изображение."));
      image.src = url;
    });
  }

  async function prepareEditorImage(file) {
    if (!file?.type?.startsWith("image/")) throw new Error("Выберите изображение JPG, PNG или WEBP.");
    if (file.size > 15 * 1024 * 1024) throw new Error("Файл больше 15 МБ. Выберите изображение меньшего размера.");

    const sourceUrl = URL.createObjectURL(file);
    try {
      const source = await loadImage(sourceUrl);
      const maximumSide = 1200;
      const scale = Math.min(1, maximumSide / Math.max(source.naturalWidth, source.naturalHeight));
      let width = Math.max(1, Math.round(source.naturalWidth * scale));
      let height = Math.max(1, Math.round(source.naturalHeight * scale));
      let canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d", { alpha: false }).drawImage(source, 0, 0, width, height);

      let quality = 0.82;
      let blob = await canvasBlob(canvas, "image/webp", quality);
      for (let attempt = 0; blob && blob.size > 620 * 1024 && attempt < 4; attempt += 1) {
        quality = Math.max(0.52, quality - 0.09);
        width = Math.max(480, Math.round(width * 0.86));
        height = Math.max(320, Math.round(height * 0.86));
        const resized = document.createElement("canvas");
        resized.width = width;
        resized.height = height;
        resized.getContext("2d", { alpha: false }).drawImage(canvas, 0, 0, width, height);
        canvas = resized;
        blob = await canvasBlob(canvas, "image/webp", quality);
      }
      if (!blob) blob = await canvasBlob(canvas, "image/jpeg", 0.76);
      if (!blob) throw new Error("Браузер не смог подготовить изображение.");
      return blobDataUrl(blob);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  function showEditorError(message) {
    if (!editorError) return;
    editorError.textContent = message;
    editorError.hidden = false;
  }

  function clearEditorError() {
    if (!editorError) return;
    editorError.textContent = "";
    editorError.hidden = true;
  }

  editorForm?.querySelectorAll('input[name="type"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked || !editorCardType) return;
      const nextDefault = cardTypeDefaults[input.value] || cardTypeDefaults.client;
      if (!editorCardType.value.trim() || editorCardType.value === activeCardTypeDefault) editorCardType.value = nextDefault;
      activeCardTypeDefault = nextDefault;
    });
  });

  editorFile?.addEventListener("change", async () => {
    preparedImage = "";
    preparedFile = "";
    clearEditorError();
    const file = editorFile.files?.[0];
    if (!file) {
      if (editorPreview) editorPreview.hidden = true;
      if (editorUploadCopy) editorUploadCopy.hidden = false;
      return;
    }
    if (editorSubmit) editorSubmit.disabled = true;
    try {
      preparedImage = await prepareEditorImage(file);
      preparedFile = file.name;
      if (editorPreview) {
        editorPreview.src = preparedImage;
        editorPreview.hidden = false;
      }
      if (editorUploadCopy) editorUploadCopy.hidden = true;
    } catch (error) {
      editorFile.value = "";
      showEditorError(error.message || "Не удалось подготовить изображение.");
    } finally {
      if (editorSubmit) editorSubmit.disabled = false;
    }
  });

  editorForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearEditorError();
    if (!editorForm.reportValidity()) return;
    const file = editorFile?.files?.[0];
    if (!file) {
      showEditorError("Загрузите обложку карточки.");
      return;
    }
    if (editorSubmit) {
      editorSubmit.disabled = true;
      editorSubmit.textContent = "ПОДГОТОВКА…";
    }

    try {
      if (!preparedImage || preparedFile !== file.name) preparedImage = await prepareEditorImage(file);
      const formData = new FormData(editorForm);
      const created = window.MIDGAS_EDITOR_STORE?.create({
        type: formData.get("type"),
        name: formData.get("name"),
        alias: formData.get("alias"),
        cardType: formData.get("cardType"),
        status: formData.get("status"),
        threat: formData.get("threat"),
        access: formData.get("access"),
        location: formData.get("location"),
        summary: formData.get("summary"),
        description: formData.get("description"),
        image: preparedImage,
      });
      if (!created) throw new Error("Модуль локального сохранения недоступен.");

      const recordUrl = `record.html?type=${encodeURIComponent(created.type)}&id=${encodeURIComponent(created.record.id)}`;
      const registryUrl = `registry.html?type=${encodeURIComponent(created.type)}`;
      const createdId = document.querySelector("[data-editor-created-id]");
      const status = document.querySelector("[data-editor-status]");
      const openLink = document.querySelector("[data-editor-open]");
      const registryLink = document.querySelector("[data-editor-registry]");
      if (createdId) createdId.textContent = created.record.id;
      if (status) status.textContent = `«${created.record.name}» сохранена в этом браузере и добавлена в журнал текущей ревизии.`;
      if (openLink) openLink.href = recordUrl;
      if (registryLink) registryLink.href = registryUrl;
      if (editorResult) {
        editorResult.hidden = false;
        editorResult.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
      }
      if (editorSubmit) editorSubmit.textContent = "КАРТОЧКА СОЗДАНА";
    } catch (error) {
      showEditorError(error.message || "Не удалось создать карточку.");
      if (editorSubmit) editorSubmit.textContent = "СОЗДАТЬ КАРТОЧКУ";
    } finally {
      if (editorSubmit) editorSubmit.disabled = false;
    }
  });

  window.addEventListener("midgas:record-created", () => {
    updateRegistryMetadata();
    renderJournal();
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
