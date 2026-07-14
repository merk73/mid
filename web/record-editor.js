(() => {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") || "client";
  const id = params.get("id") || "";
  const typeLabels = { client: "КЛИЕНТ", anomaly: "АНОМАЛИЯ", incident: "ИНЦИДЕНТ" };
  const store = window.MIDGAS_EDITOR_STORE;
  const session = window.MIDGAS_EDITOR_SESSION;
  const actions = document.querySelector("[data-record-editor-actions]");
  const editButton = document.querySelector("[data-record-edit]");
  const deleteButton = document.querySelector("[data-record-delete]");
  const editorDialog = document.querySelector("#record-editor-dialog");
  const editorForm = document.querySelector("#record-editor-form");
  const deleteDialog = document.querySelector("#record-delete-dialog");
  const deleteForm = document.querySelector("#record-delete-form");
  const fieldsList = document.querySelector("[data-record-editor-fields]");
  const sectionsList = document.querySelector("[data-record-editor-sections]");
  const relationsList = document.querySelector("[data-record-editor-relations]");
  const relationsSearch = document.querySelector("[data-record-editor-relations-search]");
  const relationsCount = document.querySelector("[data-record-editor-relations-count]");
  const preview = document.querySelector("[data-record-editor-preview]");
  const imageStatus = document.querySelector("[data-record-editor-image-status]");
  const status = document.querySelector("[data-record-editor-status]");
  const saveButton = document.querySelector("[data-record-editor-save]");
  const deleteStatus = document.querySelector("[data-record-delete-status]");
  let hiddenRelations = [];
  let preparedImage = "";
  let preparedFileSignature = "";
  let relationScrollTop = 0;
  let pendingSectionImages = 0;

  if (!store || !editorForm || !typeLabels[type] || !id) return;

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function isEditor() {
    return Boolean(session?.isEditor?.());
  }

  function currentRecord() {
    return store.get(type, id) || window.MIDGAS_RECORDS?.[type]?.[id] || null;
  }

  function renderAccess() {
    if (!actions) return;
    actions.hidden = !isEditor() || !currentRecord();
    if (!isEditor()) {
      if (editorDialog?.open) editorDialog.close();
      if (deleteDialog?.open) deleteDialog.close();
    }
  }

  renderAccess();
  window.addEventListener(session?.eventName || "midgas:editor-session", renderAccess);
  window.addEventListener("midgas:records-ready", renderAccess);

  function makeButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function addField(term = "", value = "") {
    const row = document.createElement("div");
    row.className = "record-editor-field-row";
    const termInput = document.createElement("input");
    termInput.type = "text";
    termInput.value = String(term || "");
    termInput.maxLength = 100;
    termInput.placeholder = "Название поля";
    termInput.setAttribute("aria-label", "Название поля");
    const valueInput = document.createElement("textarea");
    valueInput.value = String(value || "");
    valueInput.maxLength = 1000;
    valueInput.rows = 2;
    valueInput.placeholder = "Значение";
    valueInput.setAttribute("aria-label", "Значение поля");
    const remove = makeButton("×", "record-editor-remove", () => row.remove());
    remove.setAttribute("aria-label", "Удалить поле");
    row.append(termInput, valueInput, remove);
    fieldsList?.append(row);
  }

  function setSectionImageBusy(delta, message = "") {
    pendingSectionImages = Math.max(0, pendingSectionImages + delta);
    if (saveButton) saveButton.disabled = pendingSectionImages > 0;
    if (message && status) status.textContent = message;
  }

  function addSection(section = {}) {
    const source = clone(section || {});
    const row = document.createElement("article");
    row.className = "record-editor-section-row";
    row._originalSection = source;
    row._sectionImage = typeof source.image === "string"
      ? { src: source.image, alt: source.title || "Фотография раздела", caption: "ФОТОМАТЕРИАЛ MIDGAS", aspect: "wide" }
      : source.image ? clone(source.image) : null;
    const marker = document.createElement("span");
    marker.textContent = String((sectionsList?.children.length || 0) + 1).padStart(2, "0");
    const inputs = document.createElement("div");
    inputs.className = "record-editor-section-content";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.required = true;
    titleInput.maxLength = 180;
    titleInput.value = String(source.title || "НОВЫЙ РАЗДЕЛ");
    titleInput.placeholder = "Заголовок раздела";
    titleInput.dataset.recordEditorSectionTitle = "";
    titleInput.setAttribute("aria-label", "Заголовок раздела");
    const paragraphsInput = document.createElement("textarea");
    paragraphsInput.required = true;
    paragraphsInput.rows = 10;
    paragraphsInput.value = Array.isArray(source.paragraphs) ? source.paragraphs.join("\n\n") : "";
    paragraphsInput.placeholder = "Абзац 1\n\nАбзац 2";
    paragraphsInput.dataset.recordEditorSectionParagraphs = "";
    paragraphsInput.setAttribute("aria-label", "Абзацы раздела");

    const imagePanel = document.createElement("div");
    imagePanel.className = "record-editor-section-image";
    const imageCopy = document.createElement("div");
    const imageLabel = document.createElement("span");
    imageLabel.textContent = "ФОТОГРАФИЯ РАЗДЕЛА";
    const imageNote = document.createElement("strong");
    const imageCaption = document.createElement("input");
    imageCaption.type = "text";
    imageCaption.maxLength = 180;
    imageCaption.placeholder = "Подпись к фотографии";
    imageCaption.setAttribute("aria-label", "Подпись к фотографии раздела");
    const imagePreview = document.createElement("img");
    imagePreview.alt = row._sectionImage?.alt || source.title || "Фотография раздела";
    const imageActions = document.createElement("div");
    const addImage = makeButton("ДОБАВИТЬ ФОТО", "record-editor-section-image-add", () => imageInput.click());
    const removeImage = makeButton("УДАЛИТЬ", "record-editor-section-image-remove", () => {
      row._sectionImage = null;
      imagePreview.removeAttribute("src");
      imagePreview.hidden = true;
      imageCaption.value = "";
      imageCaption.hidden = true;
      removeImage.hidden = true;
      addImage.textContent = "ДОБАВИТЬ ФОТО";
      imageNote.textContent = "ФОТО НЕ ПРИКРЕПЛЕНО";
    });
    const imageInput = document.createElement("input");
    imageInput.type = "file";
    imageInput.accept = "image/png,image/jpeg,image/webp";
    imageInput.className = "record-editor-section-image-file";
    imageInput.setAttribute("aria-label", "Добавить или заменить фотографию раздела");

    function renderSectionImage() {
      const current = row._sectionImage;
      const hasImage = Boolean(current?.src);
      imageNote.textContent = hasImage ? "ФОТО ПРИКРЕПЛЕНО К РАЗДЕЛУ" : "ФОТО НЕ ПРИКРЕПЛЕНО";
      imagePreview.hidden = !hasImage;
      imageCaption.hidden = !hasImage;
      removeImage.hidden = !hasImage;
      addImage.textContent = hasImage ? "ЗАМЕНИТЬ ФОТО" : "ДОБАВИТЬ ФОТО";
      if (hasImage) {
        imagePreview.src = current.src;
        imagePreview.alt = current.alt || source.title || "Фотография раздела";
        imageCaption.value = current.caption || "ФОТОМАТЕРИАЛ MIDGAS";
      }
    }

    imageInput.addEventListener("change", async () => {
      const file = imageInput.files?.[0];
      if (!file) return;
      addImage.disabled = true;
      setSectionImageBusy(1, "ПОДГОТАВЛИВАЮ ФОТОГРАФИЮ РАЗДЕЛА…");
      try {
        const src = await prepareImage(file, { maximumSide: 1100, targetBytes: 260 * 1024 });
        row._sectionImage = {
          src,
          alt: source.title || "Фотография раздела",
          caption: imageCaption.value.trim() || "ФОТОМАТЕРИАЛ MIDGAS",
          aspect: "wide",
        };
        renderSectionImage();
        const size = Math.round(src.length * 0.75 / 1024);
        if (status) status.textContent = `ФОТОГРАФИЯ РАЗДЕЛА УМЕНЬШЕНА ДО ~${size} КБ.`;
      } catch (error) {
        if (status) status.textContent = error.message || "НЕ УДАЛОСЬ ПОДГОТОВИТЬ ФОТОГРАФИЮ РАЗДЕЛА.";
      } finally {
        imageInput.value = "";
        addImage.disabled = false;
        setSectionImageBusy(-1);
      }
    });

    imageCopy.append(imageLabel, imageNote);
    imageActions.append(addImage, removeImage, imageInput);
    imagePanel.append(imageCopy, imagePreview, imageCaption, imageActions);
    inputs.append(titleInput, paragraphsInput, imagePanel);
    const remove = makeButton("УДАЛИТЬ РАЗДЕЛ", "record-editor-remove-section", () => {
      row.remove();
      [...(sectionsList?.children || [])].forEach((item, index) => {
        item.querySelector(":scope > span").textContent = String(index + 1).padStart(2, "0");
      });
    });
    row.append(marker, inputs, remove);
    sectionsList?.append(row);
    renderSectionImage();
  }

  function canonicalRelations(record) {
    if (Array.isArray(record.editorRelations) && (record.editorRelations.length || record.editorRelationsVersion === 1)) {
      return clone(record.editorRelations);
    }
    const sectionRelations = Array.isArray(record.sections)
      ? record.sections.flatMap((section) => Array.isArray(section.relatedRecords) ? section.relatedRecords : [])
      : [];
    const boardRelations = window.MIDGAS_RELATIONS?.forRecord?.(type, id) || [];
    const relations = [...sectionRelations, ...boardRelations];
    const seen = new Set();
    return relations.filter((relation) => {
      const key = `${relation?.type}:${relation?.id}`;
      if (!relation?.type || !relation?.id || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function updateRelationCount() {
    const selected = relationsList?.querySelectorAll('input[type="checkbox"]:checked').length || 0;
    if (relationsCount) relationsCount.textContent = `ВЫБРАНО: ${selected}`;
  }

  function buildRelations(record) {
    if (!relationsList) return;
    relationsList.replaceChildren();
    const current = canonicalRelations(record);
    const currentKeys = new Set(current.map((relation) => `${relation.type}:${relation.id}`));
    const activeKeys = new Set();

    ["client", "anomaly", "incident"].forEach((relationType) => {
      Object.values(window.MIDGAS_RECORDS?.[relationType] || {})
        .filter((candidate) => !(relationType === type && candidate.id === id))
        .sort((left, right) => String(left.id).localeCompare(String(right.id), "ru"))
        .forEach((candidate) => {
          const key = `${relationType}:${candidate.id}`;
          activeKeys.add(key);
          const label = document.createElement("label");
          label.className = "record-editor-relation-option";
          label.dataset.search = `${candidate.id} ${candidate.name || ""} ${candidate.alias || ""} ${typeLabels[relationType]}`.toLocaleLowerCase("ru");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = currentKeys.has(key);
          input.dataset.type = relationType;
          input.dataset.id = candidate.id;
          input.dataset.label = candidate.name || candidate.alias || candidate.id;
          const copy = document.createElement("span");
          const meta = document.createElement("small");
          const name = document.createElement("strong");
          meta.textContent = `${typeLabels[relationType]} / ${candidate.id}`;
          name.textContent = candidate.name || candidate.alias || candidate.id;
          copy.append(meta, name);
          label.append(input, copy);
          relationsList.append(label);
        });
    });

    hiddenRelations = current.filter((relation) => !activeKeys.has(`${relation.type}:${relation.id}`));
    updateRelationCount();
  }

  function populateEditor() {
    const record = currentRecord();
    if (!record) return false;
    editorForm.elements.namedItem("recordId").value = record.id;
    editorForm.elements.namedItem("recordKind").value = `${typeLabels[type]} / ${record.kind || ""}`;
    editorForm.elements.namedItem("name").value = record.name || "";
    editorForm.elements.namedItem("alias").value = record.alias || "";
    editorForm.elements.namedItem("cardType").value = record.cardType || "";
    editorForm.elements.namedItem("summary").value = record.summary || "";
    if (preview) {
      preview.src = record.image || "";
      preview.alt = record.name || "Обложка карточки";
    }
    preparedImage = "";
    preparedFileSignature = "";
    const imageInput = editorForm.elements.namedItem("image");
    if (imageInput) imageInput.value = "";
    if (imageStatus) imageStatus.textContent = "Файл будет автоматически уменьшен и преобразован в WEBP. Если файл не выбран, текущая фотография останется без изменений.";
    fieldsList?.replaceChildren();
    (record.fields || []).forEach(([term, value]) => addField(term, value));
    if (!record.fields?.length) addField("Тип", record.cardType || "");
    sectionsList?.replaceChildren();
    (record.sections || []).forEach((section) => addSection(section));
    if (!record.sections?.length) addSection({ title: "ПЕРВИЧНАЯ РЕГИСТРАЦИЯ", paragraphs: [record.summary || ""] });
    buildRelations(record);
    if (relationsSearch) relationsSearch.value = "";
    if (status) status.textContent = "Номер карточки останется неизменным.";
    return true;
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    document.body.classList.add("record-editor-open");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    if (!editorDialog?.open && !deleteDialog?.open) document.body.classList.remove("record-editor-open");
  }

  editButton?.addEventListener("click", () => {
    if (!isEditor()) {
      window.location.href = "index.html#company-account";
      return;
    }
    if (populateEditor()) openDialog(editorDialog);
  });

  document.querySelector("[data-record-editor-close]")?.addEventListener("click", () => closeDialog(editorDialog));
  editorDialog?.addEventListener("cancel", () => document.body.classList.remove("record-editor-open"));
  editorDialog?.addEventListener("click", (event) => {
    if (event.target === editorDialog) closeDialog(editorDialog);
  });

  document.querySelector("[data-record-editor-add-field]")?.addEventListener("click", () => addField());
  document.querySelector("[data-record-editor-add-section]")?.addEventListener("click", () => addSection({ title: "НОВЫЙ РАЗДЕЛ", paragraphs: [""] }));

  relationsList?.addEventListener("pointerdown", () => {
    relationScrollTop = editorForm.scrollTop;
  }, true);
  relationsList?.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") relationScrollTop = editorForm.scrollTop;
  }, true);
  relationsList?.addEventListener("change", () => {
    updateRelationCount();
    editorForm.scrollTop = relationScrollTop;
    window.requestAnimationFrame(() => { editorForm.scrollTop = relationScrollTop; });
  });
  relationsSearch?.addEventListener("input", () => {
    const query = relationsSearch.value.trim().toLocaleLowerCase("ru");
    relationsList.querySelectorAll(".record-editor-relation-option").forEach((option) => {
      option.hidden = Boolean(query) && !option.dataset.search.includes(query);
    });
  });

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
      image.onerror = () => reject(new Error("Файл не распознан как изображение."));
      image.src = url;
    });
  }

  async function prepareImage(file, options = {}) {
    if (!file?.type?.startsWith("image/")) throw new Error("Выберите изображение JPG, PNG или WEBP.");
    if (file.size > 15 * 1024 * 1024) throw new Error("Файл больше 15 МБ.");
    const sourceUrl = URL.createObjectURL(file);
    try {
      const source = await loadImage(sourceUrl);
      const maximumSide = Number(options.maximumSide) || 1200;
      const scale = Math.min(1, maximumSide / Math.max(source.naturalWidth, source.naturalHeight));
      let width = Math.max(1, Math.round(source.naturalWidth * scale));
      let height = Math.max(1, Math.round(source.naturalHeight * scale));
      let canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d", { alpha: false }).drawImage(source, 0, 0, width, height);
      let quality = 0.82;
      let blob = await canvasBlob(canvas, "image/webp", quality);
      const targetBytes = Number(options.targetBytes) || 480 * 1024;
      for (let attempt = 0; blob && blob.size > targetBytes && attempt < 6; attempt += 1) {
        quality = Math.max(0.5, quality - 0.08);
        width = Math.max(1, Math.round(width * 0.86));
        height = Math.max(1, Math.round(height * 0.86));
        const resized = document.createElement("canvas");
        resized.width = width;
        resized.height = height;
        resized.getContext("2d", { alpha: false }).drawImage(canvas, 0, 0, width, height);
        canvas = resized;
        blob = await canvasBlob(canvas, "image/webp", quality);
      }
      if (!blob) throw new Error("Браузер не смог подготовить изображение.");
      return blobDataUrl(blob);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  const imageInput = editorForm.elements.namedItem("image");
  imageInput?.addEventListener("change", async () => {
    const file = imageInput.files?.[0];
    preparedImage = "";
    preparedFileSignature = "";
    if (!file) return;
    if (saveButton) saveButton.disabled = true;
    if (imageStatus) imageStatus.textContent = "Подготавливаю и уменьшаю новое изображение…";
    if (status) status.textContent = "ПОДГОТАВЛИВАЮ НОВУЮ ОБЛОЖКУ…";
    try {
      preparedImage = await prepareImage(file);
      preparedFileSignature = `${file.name}:${file.size}:${file.lastModified}`;
      if (preview) preview.src = preparedImage;
      const preparedKilobytes = Math.round(preparedImage.length * 0.75 / 1024);
      if (imageStatus) imageStatus.textContent = `Готово: файл автоматически уменьшен до ~${preparedKilobytes} КБ и будет сохранён после подтверждения.`;
      if (status) status.textContent = `ОБЛОЖКА АВТОМАТИЧЕСКИ УМЕНЬШЕНА ДО ~${preparedKilobytes} КБ.`;
    } catch (error) {
      imageInput.value = "";
      if (imageStatus) imageStatus.textContent = error.message || "Не удалось подготовить изображение.";
      if (status) status.textContent = error.message || "НЕ УДАЛОСЬ ПОДГОТОВИТЬ ИЗОБРАЖЕНИЕ.";
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  });

  function collectFields(relations) {
    const fields = [...(fieldsList?.children || [])].map((row) => {
      const term = row.querySelector("input")?.value.trim() || "";
      const value = row.querySelector("textarea")?.value.trim() || "";
      return [term, value];
    }).filter(([term, value]) => term && value && term.toLocaleLowerCase("ru") !== "связанные записи");

    function upsert(term, value) {
      const existing = fields.find((field) => field[0].toLocaleLowerCase("ru") === term.toLocaleLowerCase("ru"));
      if (existing) existing[1] = value;
      else fields.push([term, value]);
    }

    upsert("Тип", editorForm.elements.namedItem("cardType").value.trim());
    if (relations.length) fields.push(["Связанные записи", relations.map((relation) => relation.id).join(", ")]);
    return fields;
  }

  function collectRelations() {
    const active = [...(relationsList?.querySelectorAll('input[type="checkbox"]:checked') || [])].map((input) => ({
      type: input.dataset.type,
      id: input.dataset.id,
      label: input.dataset.label,
    }));
    const seen = new Set();
    return [...active, ...hiddenRelations].filter((relation) => {
      const key = `${relation.type}:${relation.id}`;
      if (!relation.type || !relation.id || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function collectSections(relations) {
    return [...(sectionsList?.children || [])].map((row, index) => {
      const titleInput = row.querySelector("[data-record-editor-section-title]");
      const paragraphsInput = row.querySelector("[data-record-editor-section-paragraphs]");
      const paragraphs = paragraphsInput.value.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
      const section = {
        ...(row._originalSection || {}),
        title: titleInput.value.trim(),
        paragraphs,
      };
      if (row._sectionImage?.src) {
        const caption = row.querySelector(".record-editor-section-image > input[type=\"text\"]")?.value.trim() || "ФОТОМАТЕРИАЛ MIDGAS";
        section.image = { ...clone(row._sectionImage), caption, alt: caption };
      } else {
        delete section.image;
      }
      if (index === 0) section.relatedRecords = relations;
      else if (Object.prototype.hasOwnProperty.call(section, "relatedRecords")) section.relatedRecords = [];
      return section;
    });
  }

  editorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editorForm.reportValidity()) return;
    if (!isEditor()) {
      if (status) status.textContent = "СЕАНС РЕДАКТОРА ЗАКРЫТ. ВОЙДИТЕ СНОВА.";
      return;
    }
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "СОХРАНЕНИЕ…";
    }
    try {
      const file = imageInput?.files?.[0];
      const signature = file ? `${file.name}:${file.size}:${file.lastModified}` : "";
      if (file && (!preparedImage || preparedFileSignature !== signature)) preparedImage = await prepareImage(file);
      const record = currentRecord();
      const relations = collectRelations();
      const patch = {
        name: editorForm.elements.namedItem("name").value.trim(),
        alias: editorForm.elements.namedItem("alias").value.trim(),
        cardType: editorForm.elements.namedItem("cardType").value.trim(),
        summary: editorForm.elements.namedItem("summary").value.trim(),
        fields: collectFields(relations),
        sections: collectSections(relations),
        editorRelations: relations,
        editorRelationsVersion: 1,
      };
      if (preparedImage) {
        patch.image = preparedImage;
        patch.cardImage = preparedImage;
      } else {
        patch.image = record.image;
      }
      const saved = await store.update(type, id, patch);
      if (status) status.textContent = `${saved?.syncMessage || "ИЗМЕНЕНИЯ СОХРАНЕНЫ."} ОБНОВЛЯЮ ДОСЬЕ…`;
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      if (status) status.textContent = error.message || "НЕ УДАЛОСЬ СОХРАНИТЬ ИЗМЕНЕНИЯ.";
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = "СОХРАНИТЬ ИЗМЕНЕНИЯ";
      }
    }
  });

  deleteButton?.addEventListener("click", () => {
    if (!isEditor()) {
      window.location.href = "index.html#company-account";
      return;
    }
    const deleteId = document.querySelector("[data-record-delete-id]");
    if (deleteId) deleteId.textContent = id;
    if (deleteStatus) deleteStatus.textContent = "";
    openDialog(deleteDialog);
  });

  document.querySelector("[data-record-delete-cancel]")?.addEventListener("click", () => closeDialog(deleteDialog));
  deleteDialog?.addEventListener("cancel", () => document.body.classList.remove("record-editor-open"));
  editorDialog?.addEventListener("close", () => document.body.classList.remove("record-editor-open"));
  deleteDialog?.addEventListener("close", () => document.body.classList.remove("record-editor-open"));
  deleteDialog?.addEventListener("click", (event) => {
    if (event.target === deleteDialog) closeDialog(deleteDialog);
  });

  deleteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const deleted = await store.softDelete(type, id);
      if (deleteStatus) deleteStatus.textContent = `${deleted?.syncMessage || "КАРТОЧКА СКРЫТА."} ПЕРЕХОЖУ В РЕЕСТР…`;
      window.setTimeout(() => {
        window.location.href = `registry.html?type=${encodeURIComponent(type)}`;
      }, 420);
    } catch (error) {
      if (deleteStatus) deleteStatus.textContent = error.message || "НЕ УДАЛОСЬ СКРЫТЬ КАРТОЧКУ.";
    }
  });
})();
