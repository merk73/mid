(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") || "client";
  const id = params.get("id") || "";
  const store = window.MIDGAS_EDITOR_STORE;
  const session = window.MIDGAS_EDITOR_SESSION;
  const actions = document.querySelector("[data-record-editor-actions]");
  const editButton = document.querySelector("[data-record-edit]");
  const saveButton = document.querySelector("[data-record-save]");
  const cancelButton = document.querySelector("[data-record-cancel]");
  const deleteButton = document.querySelector("[data-record-delete]");
  const addSectionButton = document.querySelector("[data-record-add-section]");
  const coverTools = document.querySelector("[data-record-cover-tools]");
  const coverFile = document.querySelector("[data-record-cover-file]");
  const status = document.querySelector("[data-record-inline-status]");
  const relationsRoot = document.querySelector("[data-record-relations]");
  const locationRoot = document.querySelector("[data-record-location]");
  const relatedList = document.querySelector("[data-record-related-list]");
  const relationsEditor = document.querySelector("[data-record-relations-editor]");
  const relationsOptions = document.querySelector("[data-record-relations-options]");
  const relationsSearch = document.querySelector("[data-record-relations-search]");
  const relationsCount = document.querySelector("[data-record-relations-count]");
  const deleteDialog = document.querySelector("#record-delete-dialog");
  const deleteForm = document.querySelector("#record-delete-form");
  const typeLabels = { client: "КЛИЕНТ", anomaly: "АНОМАЛИЯ", incident: "ИНЦИДЕНТ" };
  const levelLabels = {
    threat: ["", "T1 / низкий", "T2 / умеренный", "T3 / значительный", "T4 / высокий", "T5 / критический"],
    access: ["", "D1 / очень низкий", "D2 / низкий", "D3 / средний", "D4 / высокий", "D5 / полный доступ"],
  };
  let editing = false;
  let draft = null;
  let pendingImages = 0;
  let selectedThreat = 0;
  let selectedAccess = 0;

  if (!store || !id || !typeLabels[type]) return;

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function currentRecord() {
    return store.get(type, id) || window.MIDGAS_RECORDS?.[type]?.[id] || null;
  }

  function isEditor() {
    return Boolean(session?.isEditor?.());
  }

  function canDelete() {
    return Boolean(session?.hasAccess?.("full"));
  }

  function setStatus(message, state = "") {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }

  function text(element) {
    return String(element?.textContent || "").replace(/\u00a0/g, " ").trim();
  }

  function normalized(value) {
    return String(value || "").trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
  }

  function levelFromFields(record, kind) {
    const labels = kind === "threat"
      ? ["уровень угрозы"]
      : ["уровень доступа", "осведомленность клиента"];
    const value = (record?.fields || []).find(([term]) => labels.includes(normalized(term)))?.[1] || "";
    const prefix = kind === "threat" ? "T" : "D";
    const code = String(value).match(new RegExp(`\\b${prefix}([1-5])\\b`, "i"));
    if (code) return Number(code[1]);
    const source = normalized(value);
    if (kind === "threat") {
      if (source.includes("критич")) return 5;
      if (source.includes("высок")) return 4;
      if (source.includes("значитель")) return 3;
      if (source.includes("умерен")) return 2;
      if (source.includes("низк")) return 1;
    } else {
      if (source.includes("полн") || source.includes("макс")) return 5;
      if (source.includes("высок")) return 4;
      if (source.includes("средн")) return 3;
      if (source.includes("очень низк")) return 1;
      if (source.includes("низк")) return 2;
    }
    return 0;
  }

  function renderSelectedLevel(kind, level) {
    const root = document.querySelector(kind === "threat" ? "[data-record-threat]" : "[data-record-access]");
    if (!root) return;
    const value = levelLabels[kind][level] || "НЕ УКАЗАН";
    root.dataset.level = String(level);
    const code = root.querySelector("strong");
    const copy = root.querySelector("small");
    if (code) code.textContent = level ? `${kind === "threat" ? "T" : "D"}${level}` : "—";
    if (copy) copy.textContent = value;
    root.querySelectorAll(".record-level-scale button").forEach((button, index) => {
      button.classList.toggle("is-active", index < level);
      button.setAttribute("aria-pressed", String(index + 1 === level));
    });
  }

  function setupLevelInputs() {
    document.querySelectorAll("[data-record-threat] .record-level-scale button").forEach((button) => {
      button.addEventListener("click", () => {
        if (!editing) return;
        selectedThreat = Number(button.dataset.level) || 0;
        renderSelectedLevel("threat", selectedThreat);
        setStatus(`УРОВЕНЬ УГРОЗЫ: ${levelLabels.threat[selectedThreat].toUpperCase()}.`, "editing");
      });
    });
    document.querySelectorAll("[data-record-access] .record-level-scale button").forEach((button) => {
      button.addEventListener("click", () => {
        if (!editing) return;
        selectedAccess = Number(button.dataset.level) || 0;
        renderSelectedLevel("access", selectedAccess);
        setStatus(`УРОВЕНЬ ДОСТУПА: ${levelLabels.access[selectedAccess].toUpperCase()}.`, "editing");
      });
    });
  }

  function makeButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function setEditable(element, multiline = true) {
    if (!element) return;
    element.contentEditable = "true";
    element.spellcheck = true;
    element.dataset.inlineEditable = "";
    if (!multiline) {
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter") event.preventDefault();
      });
    }
  }

  function renderAccess() {
    if (!actions) return;
    actions.hidden = !isEditor() || !currentRecord();
    if (deleteButton) deleteButton.hidden = editing || !canDelete();
    if (!isEditor() && editing) window.location.reload();
  }

  function setButtons(nextEditing) {
    if (editButton) editButton.hidden = nextEditing;
    if (deleteButton) deleteButton.hidden = nextEditing || !canDelete();
    if (saveButton) saveButton.hidden = !nextEditing;
    if (cancelButton) cancelButton.hidden = !nextEditing;
    if (addSectionButton) addSectionButton.hidden = !nextEditing;
    if (coverTools) coverTools.hidden = !nextEditing;
    document.querySelectorAll(".record-clearance .record-level-scale button").forEach((button) => { button.disabled = !nextEditing; });
  }

  function fieldLocationValue() {
    const row = [...document.querySelectorAll("[data-record-field-row]")]
      .find((item) => /местополож|локаци/i.test(text(item.querySelector("dt"))));
    return text(row?.querySelector("dd"));
  }

  function wireLocationField(row) {
    const term = row.querySelector("dt");
    const value = row.querySelector("dd");
    const syncMapQuery = () => {
      if (!/местополож|локаци/i.test(text(term))) return;
      const input = document.querySelector("[data-record-map-query]");
      if (input) input.value = text(value);
    };
    term?.addEventListener("input", syncMapQuery);
    value?.addEventListener("input", syncMapQuery);
  }

  function setupFieldRow(row) {
    const term = row.querySelector("dt");
    const value = row.querySelector("dd");
    setEditable(term, false);
    setEditable(value, true);
    const remove = makeButton("×", "record-inline-remove", () => row.remove());
    remove.setAttribute("aria-label", "Удалить поле");
    row.append(remove);
    wireLocationField(row);
  }

  function addField(term = "НОВОЕ ПОЛЕ", value = "Значение") {
    const list = document.querySelector("#record-fields");
    if (!list) return;
    const row = document.createElement("div");
    row.dataset.recordFieldRow = "";
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    row.append(dt, dd);
    const addRow = list.querySelector(".record-inline-add-field");
    list.insertBefore(row, addRow || null);
    setupFieldRow(row);
    dt.focus();
  }

  function setupFields() {
    const list = document.querySelector("#record-fields");
    if (!list) return;
    [...list.querySelectorAll("[data-record-field-row]")].forEach((row) => {
      if (normalized(text(row.querySelector("dt"))) === "связанные записи") {
        row.remove();
        return;
      }
      setupFieldRow(row);
    });
    const add = document.createElement("div");
    add.className = "record-inline-add-field";
    add.append(makeButton("+ ДОБАВИТЬ ПОЛЕ", "record-inline-add", () => addField()));
    list.append(add);
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  }

  function blobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать фотографию."));
      reader.readAsDataURL(blob);
    });
  }

  async function prepareImage(file) {
    if (!file?.type?.startsWith("image/")) throw new Error("Выберите JPG, PNG или WEBP.");
    if (file.size > 15 * 1024 * 1024) throw new Error("Файл больше 15 МБ.");
    const sourceUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const next = new Image();
        next.onload = () => resolve(next);
        next.onerror = () => reject(new Error("Файл не распознан как изображение."));
        next.src = sourceUrl;
      });
      const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = .91;
      let blob = await canvasBlob(canvas, quality);
      while (blob && blob.size > 1800 * 1024 && quality > .8) {
        quality -= .035;
        blob = await canvasBlob(canvas, quality);
      }
      if (!blob) throw new Error("Браузер не смог подготовить фотографию.");
      return blobDataUrl(blob);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  async function withPreparedImage(file, callback) {
    pendingImages += 1;
    if (saveButton) saveButton.disabled = true;
    setStatus("ПОДГОТАВЛИВАЮ ФОТОГРАФИЮ…", "busy");
    try {
      const src = await prepareImage(file);
      callback(src);
      setStatus("ФОТОГРАФИЯ ГОТОВА. СОХРАНИТЕ КАРТОЧКУ.", "editing");
    } catch (error) {
      setStatus(error.message || "НЕ УДАЛОСЬ ПОДГОТОВИТЬ ФОТОГРАФИЮ.", "error");
    } finally {
      pendingImages = Math.max(0, pendingImages - 1);
      if (saveButton) saveButton.disabled = pendingImages > 0;
    }
  }

  function mediaValue(article, kind, mediaIndex) {
    const section = article?._sectionDraft;
    if (!section) return null;
    if (kind === "image") return section.image || null;
    return section.media?.[mediaIndex] || null;
  }

  function setMediaValue(article, kind, mediaIndex, value) {
    const section = article?._sectionDraft;
    if (!section) return;
    if (kind === "image") {
      if (value) section.image = value;
      else delete section.image;
      return;
    }
    if (!Array.isArray(section.media)) section.media = [];
    section.media[mediaIndex] = value;
  }

  function setupMediaFigure(figure, article, kind, mediaIndex) {
    if (!figure || figure.querySelector(":scope > .record-inline-media-tools")) return;
    const image = figure.querySelector("img");
    const caption = figure.querySelector("figcaption");
    if (caption) {
      setEditable(caption, false);
      caption.addEventListener("input", () => {
        const previous = mediaValue(article, kind, mediaIndex);
        const next = typeof previous === "object" && previous
          ? { ...previous, caption: text(caption) }
          : { src: previous || image?.src || "", caption: text(caption), alt: image?.alt || "Фотография раздела", aspect: "wide" };
        setMediaValue(article, kind, mediaIndex, next);
      });
    }
    const tools = document.createElement("div");
    tools.className = "record-inline-media-tools";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/png,image/jpeg,image/webp";
    file.hidden = true;
    const replace = makeButton("ЗАМЕНИТЬ", "record-inline-media-replace", () => file.click());
    const remove = makeButton("УДАЛИТЬ", "record-inline-media-remove", () => {
      setMediaValue(article, kind, mediaIndex, null);
      if (image) image.hidden = true;
      figure.classList.add("is-inline-image-removed");
      setStatus("ФОТОГРАФИЯ БУДЕТ УДАЛЕНА ПОСЛЕ СОХРАНЕНИЯ.", "editing");
    });
    file.addEventListener("change", () => {
      const selected = file.files?.[0];
      if (!selected) return;
      withPreparedImage(selected, (src) => {
        const previous = mediaValue(article, kind, mediaIndex);
        const next = typeof previous === "object" && previous
          ? { ...previous, src }
          : { src, caption: "ФОТОМАТЕРИАЛ MIDGAS", alt: "Фотография раздела", aspect: "wide" };
        setMediaValue(article, kind, mediaIndex, next);
        if (image) { image.src = src; image.hidden = false; }
        figure.classList.remove("is-inline-image-removed");
      });
      file.value = "";
    });
    tools.append(replace, remove, file);
    figure.append(tools);
  }

  function appendSectionMedia(article, src) {
    const section = article._sectionDraft;
    if (!Array.isArray(section.media)) section.media = [];
    const emptyIndex = section.media.findIndex((item) => !item);
    const mediaIndex = emptyIndex >= 0 ? emptyIndex : section.media.length;
    const item = { src, caption: "ФОТОМАТЕРИАЛ MIDGAS", alt: text(article.querySelector("h3")), aspect: "wide" };
    section.media[mediaIndex] = item;
    const body = article.querySelector(":scope > div");
    if (!body) return;
    let grid = body.querySelector("[data-record-added-media-grid]");
    if (!grid) {
      grid = document.createElement("div");
      grid.dataset.recordAddedMediaGrid = "";
      body.append(grid);
    }
    const figure = document.createElement("figure");
    figure.className = "lore-media lore-media-wide";
    figure.dataset.recordSectionMedia = "";
    figure.dataset.mediaKind = "media";
    figure.dataset.mediaIndex = String(mediaIndex);
    const image = document.createElement("img");
    image.src = src;
    image.alt = item.alt;
    const caption = document.createElement("figcaption");
    caption.textContent = item.caption;
    figure.append(image, caption);
    grid.append(figure);
    const count = grid.querySelectorAll(":scope > .lore-media").length;
    grid.className = `lore-media-grid lore-media-count-${count}`;
    setupMediaFigure(figure, article, "media", mediaIndex);
    caption.focus();
  }

  function addSectionPhoto(article) {
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/png,image/jpeg,image/webp";
    file.multiple = true;
    file.addEventListener("change", async () => {
      const section = article._sectionDraft;
      const currentCount = (section.image ? 1 : 0) + (Array.isArray(section.media) ? section.media.filter(Boolean).length : 0);
      const remaining = Math.max(0, 9 - currentCount);
      const selected = [...(file.files || [])].filter((item) => item.type.startsWith("image/")).slice(0, remaining);
      if (!remaining) {
        setStatus("В ОДНОМ РАЗДЕЛЕ МОЖНО СОХРАНИТЬ НЕ БОЛЬШЕ ДЕВЯТИ ФОТОГРАФИЙ.", "error");
        return;
      }
      for (const selectedFile of selected) {
        await withPreparedImage(selectedFile, (src) => appendSectionMedia(article, src));
      }
      if ((file.files?.length || 0) > remaining) setStatus("ДОБАВЛЕНЫ ПЕРВЫЕ ДЕВЯТЬ ФОТОГРАФИЙ РАЗДЕЛА.", "editing");
    });
    file.click();
  }

  function reindexSections() {
    [...document.querySelectorAll("[data-record-section]")].forEach((article, index) => {
      article.querySelector(":scope > .lore-number").textContent = String(index + 1).padStart(2, "0");
    });
  }

  function setupSection(article, source) {
    article._sectionDraft = clone(source || { title: "НОВЫЙ РАЗДЕЛ", paragraphs: [""] });
    const heading = article.querySelector("[data-record-section-title], h3");
    setEditable(heading, false);
    article.querySelectorAll("[data-record-section-paragraph]").forEach((paragraph) => setEditable(paragraph, true));
    article.querySelectorAll("[data-record-section-media]").forEach((figure) => {
      setupMediaFigure(figure, article, figure.dataset.mediaKind || "media", Number(figure.dataset.mediaIndex) || 0);
    });
    const tools = document.createElement("div");
    tools.className = "record-inline-section-tools";
    tools.append(
      makeButton("+ АБЗАЦ", "record-inline-section-action", () => {
        const paragraph = document.createElement("p");
        paragraph.dataset.recordSectionParagraph = "";
        paragraph.textContent = "Новый абзац";
        const body = article.querySelector(":scope > div");
        body?.append(paragraph);
        setEditable(paragraph, true);
        paragraph.focus();
      }),
      makeButton("+ ФОТО", "record-inline-section-action", () => addSectionPhoto(article)),
      makeButton("УДАЛИТЬ РАЗДЕЛ", "record-inline-section-delete", () => { article.remove(); reindexSections(); }),
    );
    article.append(tools);
  }

  function createSection() {
    const container = document.querySelector("#record-sections");
    if (!container) return;
    container.querySelector(".lore-pending")?.remove();
    const source = { title: "НОВЫЙ РАЗДЕЛ", paragraphs: ["Новый абзац"] };
    const article = document.createElement("article");
    article.className = "lore-section";
    article.dataset.recordSection = "new";
    const number = document.createElement("span");
    number.className = "lore-number";
    const body = document.createElement("div");
    const heading = document.createElement("h3");
    heading.dataset.recordSectionTitle = "";
    heading.textContent = source.title;
    const paragraph = document.createElement("p");
    paragraph.dataset.recordSectionParagraph = "";
    paragraph.textContent = source.paragraphs[0];
    body.append(heading, paragraph);
    article.append(number, body);
    container.append(article);
    setupSection(article, source);
    reindexSections();
    heading.focus();
  }

  function canonicalRelations(record) {
    if (Array.isArray(record?.editorRelations) && (record.editorRelations.length || record.editorRelationsVersion === 1)) return clone(record.editorRelations);
    return window.MIDGAS_RELATIONS?.forRecord?.(type, id) || [];
  }

  function updateRelationCount() {
    const count = relationsOptions?.querySelectorAll('input[type="checkbox"]:checked').length || 0;
    if (relationsCount) relationsCount.textContent = `ВЫБРАНО: ${count}`;
  }

  function buildRelations() {
    if (!relationsOptions) return;
    relationsOptions.replaceChildren();
    const selected = new Set(canonicalRelations(draft).map((item) => `${item.type}:${item.id}`));
    ["client", "anomaly", "incident"].forEach((relationType) => {
      Object.values(window.MIDGAS_RECORDS?.[relationType] || {})
        .filter((candidate) => !(relationType === type && candidate.id === id))
        .sort((left, right) => String(left.id).localeCompare(String(right.id), "ru"))
        .forEach((candidate) => {
          const key = `${relationType}:${candidate.id}`;
          const label = document.createElement("label");
          label.dataset.search = `${candidate.id} ${candidate.name || ""} ${candidate.alias || ""} ${typeLabels[relationType]}`.toLocaleLowerCase("ru");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = selected.has(key);
          input.disabled = input.checked && !canDelete();
          input.dataset.type = relationType;
          input.dataset.id = candidate.id;
          input.dataset.label = candidate.name || candidate.alias || candidate.id;
          const copy = document.createElement("span");
          copy.innerHTML = `<small>${typeLabels[relationType]} / ${candidate.id}</small><strong></strong>`;
          copy.querySelector("strong").textContent = candidate.name || candidate.alias || candidate.id;
          label.append(input, copy);
          relationsOptions.append(label);
        });
    });
    updateRelationCount();
  }

  function collectRelations() {
    return [...(relationsOptions?.querySelectorAll('input[type="checkbox"]:checked') || [])].map((input) => ({
      type: input.dataset.type,
      id: input.dataset.id,
      label: input.dataset.label,
    }));
  }

  function collectFields(relations) {
    const fields = [...document.querySelectorAll("[data-record-field-row]")].map((row) => [
      text(row.querySelector("dt")),
      text(row.querySelector("dd")),
    ]).filter(([term, value]) => {
      const label = normalized(term);
      if (!term || !value || label === "связанные записи") return false;
      if (label === "уровень угрозы") return false;
      if (type === "client" && ["уровень доступа", "осведомленность клиента"].includes(label)) return false;
      return true;
    });
    if (selectedThreat) fields.push(["Уровень угрозы", levelLabels.threat[selectedThreat]]);
    if (type === "client" && selectedAccess) fields.push(["Уровень доступа", levelLabels.access[selectedAccess]]);
    if (relations.length) fields.push(["Связанные записи", relations.map((item) => item.id).join(", ")]);
    return fields;
  }

  function collectSections(relations) {
    return [...document.querySelectorAll("[data-record-section]")].map((article, index) => {
      const section = clone(article._sectionDraft || {});
      section.title = text(article.querySelector("[data-record-section-title], h3")) || "БЕЗ НАЗВАНИЯ";
      section.paragraphs = [...article.querySelectorAll("[data-record-section-paragraph]")].map(text).filter(Boolean);
      if (!section.paragraphs.length) section.paragraphs = [""];
      if (Array.isArray(section.media)) section.media = section.media.filter(Boolean);
      if (index === 0) section.relatedRecords = relations;
      else delete section.relatedRecords;
      return section;
    });
  }

  function setupCover() {
    const image = document.querySelector("#record-image");
    document.querySelector("[data-record-cover-replace]")?.addEventListener("click", () => coverFile?.click());
    document.querySelector("[data-record-cover-remove]")?.addEventListener("click", () => {
      draft.image = "";
      draft.cardImage = "";
      if (image) image.hidden = true;
      document.querySelector("[data-record-cover-figure]")?.classList.add("is-inline-image-removed");
      setStatus("ОБЛОЖКА БУДЕТ УДАЛЕНА ПОСЛЕ СОХРАНЕНИЯ.", "editing");
    });
    coverFile?.addEventListener("change", () => {
      const file = coverFile.files?.[0];
      if (!file) return;
      withPreparedImage(file, (src) => {
        draft.image = src;
        draft.cardImage = src;
        if (image) { image.src = src; image.hidden = false; }
        document.querySelector("[data-record-cover-figure]")?.classList.remove("is-inline-image-removed");
      });
      coverFile.value = "";
    });
  }

  function startEditing() {
    if (!isEditor()) { window.location.href = "editor.html"; return; }
    const record = currentRecord();
    if (!record || editing) return;
    editing = true;
    draft = clone(record);
    selectedThreat = levelFromFields(draft, "threat") || Math.min(5, Math.max(1, Number(draft.threatLevel) || 1));
    selectedAccess = levelFromFields(draft, "access") || Math.min(5, Math.max(1, Number(draft.accessLevel) || 1));
    renderSelectedLevel("threat", selectedThreat);
    renderSelectedLevel("access", selectedAccess);
    document.body.classList.add("is-record-inline-editing");
    setButtons(true);
    setEditable(document.querySelector("#record-name"), false);
    setEditable(document.querySelector("#record-alias"), true);
    setEditable(document.querySelector("#record-summary"), true);
    setupFields();
    document.querySelectorAll("[data-record-section]").forEach((article, index) => setupSection(article, draft.sections?.[index] || {}));
    if (relationsRoot) relationsRoot.hidden = false;
    if (locationRoot) locationRoot.hidden = false;
    if (relatedList) relatedList.hidden = true;
    if (relationsEditor) relationsEditor.hidden = false;
    buildRelations();
    const mapQuery = document.querySelector("[data-record-map-query]");
    if (mapQuery) mapQuery.value = fieldLocationValue() || mapQuery.value;
    window.MIDGAS_RECORD_MAP?.initialize?.();
    window.MIDGAS_RECORD_MAP?.setEditing?.(true);
    setStatus("РЕЖИМ РЕДАКТИРОВАНИЯ: ИЗМЕНЯЙТЕ ПОЛЯ ПРЯМО НА СТРАНИЦЕ.", "editing");
    document.querySelector("#record-name")?.focus();
  }

  async function saveEditing() {
    if (!editing || pendingImages) return;
    if (!isEditor()) { setStatus("СЕАНС РЕДАКТОРА ЗАКРЫТ.", "error"); return; }
    const name = text(document.querySelector("#record-name"));
    const summary = text(document.querySelector("#record-summary"));
    if (!name || !summary) { setStatus("НАЗВАНИЕ И КРАТКОЕ ОПИСАНИЕ НЕ МОГУТ БЫТЬ ПУСТЫМИ.", "error"); return; }
    const relations = collectRelations();
    const fields = collectFields(relations);
    const cardType = fields.find(([term]) => normalized(term) === "тип")?.[1] || draft.cardType || typeLabels[type];
    const location = String(fields.find(([term]) => /местополож|локаци/i.test(String(term || "")))?.[1] || "").trim();
    const originalLocation = String((draft.fields || []).find(([term]) => /местополож|локаци/i.test(String(term || "")))?.[1] || "").trim();
    let geo = window.MIDGAS_RECORD_MAP?.getPosition?.() || draft.geo || null;
    const pointChanged = Boolean(geo && (
      Number(geo.lat) !== Number(draft.geo?.lat)
      || Number(geo.lng) !== Number(draft.geo?.lng)
      || String(geo.updatedAt || "") !== String(draft.geo?.updatedAt || "")
    ));
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = "СОХРАНЯЮ…"; }
    if (location && normalized(location) !== normalized(originalLocation) && !pointChanged) {
      setStatus("ОПРЕДЕЛЯЮ КООРДИНАТЫ НОВОЙ ЛОКАЦИИ…", "busy");
      try {
        geo = await window.MIDGAS_RECORD_MAP?.geocode?.(location);
      } catch (error) {
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = "СОХРАНИТЬ ИЗМЕНЕНИЯ"; }
        setStatus(error.message || "НЕ УДАЛОСЬ НАЙТИ ЛОКАЦИЮ. ПОСТАВЬТЕ ТОЧКУ НА КАРТЕ.", "error");
        return;
      }
    }
    const patch = {
      name,
      alias: text(document.querySelector("#record-alias")),
      cardType,
      summary,
      threatLevel: selectedThreat || 1,
      accessLevel: type === "client" ? (selectedAccess || 1) : (Number(draft.accessLevel) || 1),
      fields,
      sections: collectSections(relations),
      editorRelations: relations,
      editorRelationsVersion: 1,
      geo: geo ? { ...geo, label: geo.label || fieldLocationValue() } : null,
      image: draft.image || "",
      cardImage: draft.image || "",
      removeCover: !draft.image,
    };
    setStatus("СИНХРОНИЗИРУЮ КАРТОЧКУ, ФОТОГРАФИИ, КАРТУ И СВЯЗИ…", "busy");
    try {
      const result = await store.update(type, id, patch);
      setStatus(result?.syncMessage || "ИЗМЕНЕНИЯ СОХРАНЕНЫ В SUPABASE.", "saved");
      window.setTimeout(() => window.location.reload(), 380);
    } catch (error) {
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = "СОХРАНИТЬ ИЗМЕНЕНИЯ"; }
      setStatus(error.message || "НЕ УДАЛОСЬ СОХРАНИТЬ КАРТОЧКУ.", "error");
    }
  }

  function cancelEditing() {
    if (!editing) return;
    window.location.reload();
  }

  function openDeleteDialog() {
    if (!canDelete()) { setStatus("УДАЛЕНИЕ ДОСТУПНО ТОЛЬКО В РЕЖИМАХ ПОЛНОГО И АДМИНИСТРАТИВНОГО ДОСТУПА.", "error"); return; }
    const output = document.querySelector("[data-record-delete-id]");
    if (output) output.textContent = id;
    if (typeof deleteDialog?.showModal === "function") deleteDialog.showModal();
    else deleteDialog?.setAttribute("open", "");
  }

  editButton?.addEventListener("click", startEditing);
  saveButton?.addEventListener("click", saveEditing);
  cancelButton?.addEventListener("click", cancelEditing);
  deleteButton?.addEventListener("click", openDeleteDialog);
  addSectionButton?.addEventListener("click", createSection);
  relationsOptions?.addEventListener("change", updateRelationCount);
  relationsSearch?.addEventListener("input", () => {
    const query = relationsSearch.value.trim().toLocaleLowerCase("ru");
    relationsOptions.querySelectorAll(":scope > label").forEach((option) => {
      option.hidden = Boolean(query) && !option.dataset.search.includes(query);
    });
  });
  document.querySelector("[data-record-delete-cancel]")?.addEventListener("click", () => deleteDialog?.close?.());
  deleteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const deleteStatus = document.querySelector("[data-record-delete-status]");
    if (!canDelete()) {
      if (deleteStatus) deleteStatus.textContent = "НЕДОСТАТОЧНЫЙ УРОВЕНЬ ДОСТУПА.";
      return;
    }
    try {
      const result = await store.softDelete(type, id);
      if (deleteStatus) deleteStatus.textContent = result?.syncMessage || "КАРТОЧКА УДАЛЕНА.";
      window.setTimeout(() => { window.location.href = `registry.html?type=${encodeURIComponent(type)}`; }, 380);
    } catch (error) {
      if (deleteStatus) deleteStatus.textContent = error.message || "НЕ УДАЛОСЬ УДАЛИТЬ КАРТОЧКУ.";
    }
  });

  setupCover();
  setupLevelInputs();
  setButtons(false);
  renderAccess();
  window.addEventListener(session?.eventName || "midgas:editor-session", renderAccess);
  window.addEventListener("midgas:records-ready", renderAccess);
})();
