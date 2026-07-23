(() => {
  "use strict";
  const session = window.MIDGAS_ACCOUNT_SESSION;
  const client = window.MIDGAS_SUPABASE_CLIENT;
  const dialog = document.querySelector("[data-workspace-dialog]");
  const form = document.querySelector("[data-workspace-form]");
  const fields = document.querySelector("[data-workspace-fields]");
  const list = document.querySelector("[data-entry-list]");
  const status = document.querySelector("[data-workspace-status]");
  const journal = document.querySelector("[data-workspace-journal]");
  let account = null;
  let entries = [];
  let filter = "all";
  let formStep = 1;
  let sectionSequence = 0;

  const names = { client: "клиента", incident: "инцидент", anomaly: "аномалию", location: "локацию", glossary: "термин", quote: "цитату" };
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const field = (label, input) => `<label class="ui-field"><span>${label}</span>${input}</label>`;

  function relationPicker() {
    const typeLabels = { client: "КЛИЕНТ", anomaly: "АНОМАЛИЯ", incident: "ИНЦИДЕНТ" };
    const records = ["client", "anomaly", "incident"].flatMap((type) =>
      Object.values(window.MIDGAS_RECORDS?.[type] || {}).map((record) => ({ ...record, type })),
    ).sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id), "ru"));
    if (!records.length) return '<p class="workspace-relation-empty">Карточки ещё загружаются. Закройте форму и откройте её снова.</p>';
    return `<div class="workspace-relation-picker" data-workspace-relations>
      <label class="workspace-relation-search"><span>НАЙТИ</span><input type="search" data-relation-search placeholder="Имя или номер досье" autocomplete="off" /></label>
      <div class="workspace-relation-list">${records.map((record) => `<label class="workspace-relation-option" data-relation-option data-search="${escape(`${record.id} ${record.name}`.toLocaleLowerCase("ru"))}"><input type="checkbox" name="relations" value="${escape(record.id)}" /><span><small>${typeLabels[record.type]} / ${escape(record.id)}</small><strong>${escape(record.name)}</strong></span></label>`).join("")}</div>
      <p data-relation-count>ВЫБРАНО: 0</p>
    </div>`;
  }

  function recordFields(kind) {
    return [
      `<section class="workspace-form-step" data-form-step="1">${field("Имя", '<input name="title" required maxlength="180" autocomplete="off" />')}${field("Подпись", '<input name="caption" required maxlength="180" autocomplete="off" />')}${field("Основное фото", '<input name="image" type="file" accept="image/*" required />')}${field("Дополнительные фото — до 9", '<input name="gallery" type="file" accept="image/*" multiple />')}</section>`,
      `<section class="workspace-form-step" data-form-step="2" hidden><div class="workspace-form-row">${field("Уровень угрозы", `<select name="threat">${[1,2,3,4,5].map((n) => `<option>T${n}</option>`).join("")}</select>`)}${kind === "client" ? field("Уровень доступа", `<select name="access">${[1,2,3,4,5].map((n) => `<option>D${n}</option>`).join("")}</select>`) : ""}</div></section>`,
      `<section class="workspace-form-step" data-form-step="3" hidden>${field("Краткое описание", '<textarea name="body" required maxlength="1400" rows="6"></textarea>')}</section>`,
      `<section class="workspace-form-step" data-form-step="4" hidden><div class="workspace-section-builder" data-workspace-section-builder><header><div><strong>Разделы досье</strong><p>Создайте несколько разделов. К каждому можно прикрепить до девяти фотографий и подписать каждый снимок.</p></div><button class="ui-button ui-button--quiet" type="button" data-workspace-section-add>+ Раздел</button></header><div class="workspace-section-list" data-workspace-section-list></div></div></section>`,
      `<section class="workspace-form-step" data-form-step="5" hidden><p>Выберите существующие карточки. После публикации связи появятся на доске.</p>${relationPicker()}</section>`,
      `<section class="workspace-form-step" data-form-step="6" hidden>${field("Локация", '<input name="location" maxlength="180" placeholder="Город, область или координаты" />')}<label class="ui-check"><input type="checkbox" name="published" checked /><span>Опубликовать сразу</span></label></section>`,
    ].join("");
  }

  function renumberWorkspaceSections() {
    fields.querySelectorAll("[data-workspace-section]").forEach((section, index) => {
      const number = section.querySelector("[data-workspace-section-number]");
      if (number) number.textContent = String(index + 1).padStart(2, "0");
    });
  }

  function revokeSectionPreviews(root = fields) {
    root.querySelectorAll("[data-workspace-section]").forEach((section) => {
      (section._workspaceMedia || []).forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      section._workspaceMedia = [];
    });
  }

  function updateSectionMedia(section) {
    const media = section._workspaceMedia || [];
    const list = section.querySelector("[data-section-media-list]");
    const count = section.querySelector("[data-section-media-count]");
    const add = section.querySelector("[data-section-media-add]");
    if (count) count.textContent = `${media.length} / 9`;
    if (add) add.disabled = media.length >= 9;
    if (!list) return;
    list.replaceChildren(...media.map((item, index) => {
      const card = document.createElement("article");
      card.className = "workspace-section-media-card";
      card.dataset.sectionMediaIndex = String(index);
      const image = document.createElement("img");
      image.src = item.previewUrl;
      image.alt = "Предпросмотр фотографии раздела";
      const copy = document.createElement("div");
      const label = document.createElement("label");
      const labelText = document.createElement("span");
      const caption = document.createElement("input");
      labelText.textContent = `ПОДПИСЬ К ФОТО ${index + 1}`;
      caption.type = "text";
      caption.maxLength = 240;
      caption.placeholder = "Что изображено на снимке";
      caption.value = item.caption || "";
      caption.addEventListener("input", () => { item.caption = caption.value; });
      label.append(labelText, caption);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.sectionMediaRemove = String(index);
      remove.textContent = "УДАЛИТЬ ФОТО";
      copy.append(label, remove);
      card.append(image, copy);
      return card;
    }));
  }

  function addWorkspaceSection() {
    const list = fields.querySelector("[data-workspace-section-list]");
    if (!list) return;
    sectionSequence += 1;
    const section = document.createElement("article");
    section.className = "workspace-section-editor";
    section.dataset.workspaceSection = String(sectionSequence);
    section._workspaceMedia = [];
    section.innerHTML = `<header><span data-workspace-section-number></span><strong>РАЗДЕЛ ДОСЬЕ</strong><button type="button" data-workspace-section-remove aria-label="Удалить раздел">×</button></header><div class="workspace-section-copy">${field("Название раздела", '<input data-section-title required maxlength="180" placeholder="Например: Хронология наблюдения" />')}${field("Текст раздела", '<textarea data-section-body required maxlength="12000" rows="6" placeholder="Пустая строка создаёт новый абзац"></textarea>')}</div><div class="workspace-section-media"><header><div><strong>ФОТОМАТЕРИАЛЫ</strong><span data-section-media-count>0 / 9</span></div><button type="button" data-section-media-add>+ ДОБАВИТЬ ФОТО</button><input type="file" accept="image/png,image/jpeg,image/webp" multiple data-section-media-input hidden /></header><div data-section-media-list></div></div>`;
    list.append(section);
    renumberWorkspaceSections();
    section.querySelector("[data-section-title]")?.focus();
  }

  function collectWorkspaceSections() {
    return [...fields.querySelectorAll("[data-workspace-section]")].map((section) => {
      const title = String(section.querySelector("[data-section-title]")?.value || "").trim();
      const paragraphs = String(section.querySelector("[data-section-body]")?.value || "")
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
      const media = (section._workspaceMedia || []).slice(0, 9).map((item, index) => {
        const caption = String(item.caption || "").trim();
        return { src: item.file, caption, alt: caption || `${title} — фотография ${index + 1}`, aspect: "wide" };
      });
      return { title: title || "НОВЫЙ РАЗДЕЛ", paragraphs, media };
    }).filter((section) => section.paragraphs.length);
  }

  function updateFormStep() {
    const steps = [...fields.querySelectorAll("[data-form-step]")];
    steps.forEach((step) => { step.hidden = Number(step.dataset.formStep) !== formStep; });
    const nav = form.querySelector("[data-form-nav]");
    const back = form.querySelector("[data-form-back]");
    const next = form.querySelector("[data-form-next]");
    const submit = form.querySelector("[data-form-submit]");
    nav.hidden = !steps.length;
    back.disabled = formStep === 1;
    next.hidden = formStep === steps.length;
    submit.hidden = Boolean(steps.length) && formStep !== steps.length;
    form.querySelector("[data-form-step-label]").textContent = `${formStep} / ${steps.length || 1}`;
  }

  function editorialFields(kind, entry = {}) {
    const meta = entry.metadata || {};
    if (kind === "location") return [
      field("Название", `<input name="title" required maxlength="180" value="${escape(entry.title)}" />`),
      field("Описание", `<textarea name="body" maxlength="1400" rows="4">${escape(entry.body)}</textarea>`),
      `<p>Введите город — координаты определятся автоматически. Ручные координаты имеют приоритет.</p><div class="workspace-form-row">${field("Широта — необязательно", `<input name="latitude" type="number" step="any" min="-90" max="90" value="${escape(meta.latitude)}" />`)}${field("Долгота — необязательно", `<input name="longitude" type="number" step="any" min="-180" max="180" value="${escape(meta.longitude)}" />`)}</div>`,
      '<label class="ui-check"><input type="checkbox" name="published" checked /><span>Показывать на карте</span></label>',
    ].join("");
    return [
      field(kind === "quote" ? "Название для редактора" : "Термин", `<input name="title" required maxlength="180" value="${escape(entry.title)}" />`),
      field(kind === "quote" ? "Текст цитаты" : "Определение", `<textarea name="body" required maxlength="2400" rows="6">${escape(entry.body)}</textarea>`),
      kind === "quote" ? field("Источник / подпись", `<input name="source" maxlength="180" value="${escape(meta.source)}" />`) : field("Раздел", `<input name="group" maxlength="80" value="${escape(meta.group)}" placeholder="Картотека, поле, космос" />`),
      `<label class="ui-check"><input type="checkbox" name="published" ${entry.is_published === false ? "" : "checked"} /><span>Опубликовано</span></label>`,
    ].join("");
  }

  function openForm(kind, entry = null) {
    revokeSectionPreviews();
    form.reset();
    form.querySelector("[data-form-status]").textContent = "";
    form.elements.kind.value = kind;
    form.elements.entryId.value = entry?.id || "";
    document.querySelector("[data-dialog-code]").textContent = entry ? "EDIT ENTRY" : "NEW ENTRY";
    document.querySelector("[data-dialog-title]").textContent = `${entry ? "Изменить" : "Добавить"} ${names[kind]}`;
    fields.innerHTML = ["client", "incident", "anomaly"].includes(kind) ? recordFields(kind) : editorialFields(kind, entry || {});
    formStep = 1;
    updateFormStep();
    dialog.showModal();
    fields.querySelector("input, textarea, select")?.focus();
  }

  fields?.addEventListener("click", (event) => {
    if (event.target.closest("[data-workspace-section-add]")) {
      addWorkspaceSection();
      return;
    }
    const section = event.target.closest("[data-workspace-section]");
    if (!section) return;
    if (event.target.closest("[data-workspace-section-remove]")) {
      (section._workspaceMedia || []).forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      section.remove();
      renumberWorkspaceSections();
      return;
    }
    if (event.target.closest("[data-section-media-add]")) {
      section.querySelector("[data-section-media-input]")?.click();
      return;
    }
    const remove = event.target.closest("[data-section-media-remove]");
    if (remove) {
      const index = Number(remove.dataset.sectionMediaRemove);
      const [removed] = section._workspaceMedia.splice(index, 1);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      updateSectionMedia(section);
    }
  });

  fields?.addEventListener("change", (event) => {
    const input = event.target.closest("[data-section-media-input]");
    if (!input) return;
    const section = input.closest("[data-workspace-section]");
    const media = section._workspaceMedia || (section._workspaceMedia = []);
    const remaining = Math.max(0, 9 - media.length);
    const selected = [...(input.files || [])].filter((file) => file.type.startsWith("image/")).slice(0, remaining);
    selected.forEach((file) => media.push({ file, caption: "", previewUrl: URL.createObjectURL(file) }));
    if ((input.files?.length || 0) > remaining) form.querySelector("[data-form-status]").textContent = "В одном разделе можно сохранить не больше девяти фотографий.";
    else form.querySelector("[data-form-status]").textContent = "";
    input.value = "";
    updateSectionMedia(section);
  });

  fields?.addEventListener("input", (event) => {
    const picker = event.target.closest("[data-workspace-relations]");
    if (!picker) return;
    if (event.target.matches("[data-relation-search]")) {
      const query = String(event.target.value || "").trim().toLocaleLowerCase("ru");
      picker.querySelectorAll("[data-relation-option]").forEach((option) => { option.hidden = Boolean(query) && !option.dataset.search.includes(query); });
    }
    const count = picker.querySelectorAll('input[name="relations"]:checked').length;
    const output = picker.querySelector("[data-relation-count]");
    if (output) output.textContent = `ВЫБРАНО: ${count}`;
  });

  async function loadEntries() {
    const response = await client.from("editorial_entries").select("id,entry_type,title,body,metadata,is_published,updated_at").is("deleted_at", null).order("updated_at", { ascending: false });
    if (response.error) throw response.error;
    entries = response.data || [];
    renderEntries();
  }

  async function bootstrapGlossaryEntries() {
    const existing = await client.from("editorial_entries").select("id", { count: "exact", head: true }).eq("entry_type", "glossary");
    if (existing.error || Number(existing.count) > 0) return;
    const html = await fetch("index.html", { cache: "no-store" }).then((response) => response.text());
    const documentCopy = new DOMParser().parseFromString(html, "text/html");
    const rows = [...documentCopy.querySelectorAll("[data-glossary-entry]")].map((entry) => ({
      entry_type: "glossary", title: entry.querySelector("h4")?.textContent?.trim(), body: entry.querySelector("p")?.textContent?.trim() || "",
      metadata: { group: entry.dataset.group || "registry", domId: entry.id || "" }, is_published: true, created_by: account.userId, updated_by: account.userId,
    })).filter((entry) => entry.title && entry.body);
    if (!rows.length) return;
    const inserted = await client.from("editorial_entries").insert(rows);
    if (inserted.error) throw inserted.error;
  }

  function renderEntries() {
    const visible = entries.filter((entry) => filter === "all" || entry.entry_type === filter);
    list.innerHTML = visible.length ? visible.map((entry) => `<article class="workspace-entry" data-entry-id="${entry.id}"><span>${entry.entry_type.toUpperCase()}</span><div><strong>${escape(entry.title)}</strong><small>${entry.is_published ? "ОПУБЛИКОВАНО" : "ЧЕРНОВИК"}</small></div><button type="button" data-entry-edit>Изменить</button><button type="button" data-entry-delete aria-label="Удалить">×</button></article>`).join("") : "<p>Материалов этого типа пока нет.</p>";
  }

  async function loadJournal() {
    if (!journal) return;
    const rows = await window.MIDGAS_SUPABASE_DATA.loadChangeFeed(120);
    const labels = { record_created: "СОЗДАНО", record_updated: "ИЗМЕНЕНО", record_soft_deleted: "УДАЛЕНО", record_restored: "ВОССТАНОВЛЕНО", relationship_created: "СВЯЗЬ ДОБАВЛЕНА", relationship_deleted: "СВЯЗЬ УДАЛЕНА" };
    journal.innerHTML = rows.length ? rows.map((row) => `<article class="workspace-journal-row" data-journal-id="${escape(row.id)}"><time datetime="${escape(row.occurred_at)}">${new Date(row.occurred_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time><div><span>${labels[row.action] || escape(row.action)}</span><strong>${escape(row.record_name || row.record_code || "Связь карточек")}</strong></div><button type="button" data-journal-rollback>Откатить</button></article>`).join("") : "<p>Изменений пока нет.</p>";
    journal._rows = rows;
    const actions = { record_created: "create", record_updated: "update", record_soft_deleted: "delete", record_restored: "restore", relationship_created: "link", relationship_deleted: "unlink" };
    journal._changes = rows.map((row) => ({ action: actions[row.action], type: row.record_type, id: row.record_code, version: Number(row.details?.version) || null, source: row.details?.source, target: row.details?.target }));
  }

  async function geocodeLocation(query) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2"); url.searchParams.set("limit", "1"); url.searchParams.set("accept-language", "ru"); url.searchParams.set("q", query);
    const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 7000);
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal }).finally(() => window.clearTimeout(timeout));
    const result = response.ok ? (await response.json())?.[0] : null;
    const latitude = Number(result?.lat); const longitude = Number(result?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Локация не найдена. Уточните город или введите координаты вручную.");
    return { latitude, longitude, label: String(result.display_name || query), source: "nominatim" };
  }

  async function saveEditorial(data, kind, id) {
    let locationMeta = null;
    if (kind === "location") {
      const latitude = Number(data.get("latitude")); const longitude = Number(data.get("longitude"));
      locationMeta = data.get("latitude") !== "" && data.get("longitude") !== ""
        ? { latitude, longitude, label: String(data.get("title") || "").trim(), source: "manual" }
        : await geocodeLocation(String(data.get("title") || "").trim());
    }
    const payload = {
      entry_type: kind, title: String(data.get("title") || "").trim(), body: String(data.get("body") || "").trim(),
      metadata: kind === "location" ? locationMeta : kind === "quote" ? { source: String(data.get("source") || "").trim() } : { group: String(data.get("group") || "").trim() },
      is_published: data.get("published") === "on", updated_by: account.userId,
    };
    const query = id ? client.from("editorial_entries").update(payload).eq("id", id) : client.from("editorial_entries").insert({ ...payload, created_by: account.userId }).select().single();
    const response = await query;
    if (response.error) throw response.error;
  }

  async function saveRecord(data, kind) {
    const image = data.get("image");
    const gallery = data.getAll("gallery").filter((file) => file instanceof File && file.size > 0).slice(0, 9);
    const caption = String(data.get("caption") || "").trim();
    const relationIds = [...new Set(data.getAll("relations").map((value) => String(value).trim().toUpperCase()).filter(Boolean))];
    const relations = relationIds.map((id) => ({ id, type: id.startsWith("MID-A-") ? "anomaly" : id.startsWith("MID-I-") ? "incident" : "client", label: id }));
    const sections = collectWorkspaceSections();
    await window.MIDGAS_EDITOR_STORE.create({
      type: kind, name: String(data.get("title") || "").trim(), caption,
      image, gallery, summary: String(data.get("body") || "").trim(), description: String(data.get("body") || "").trim(),
      threat: data.get("threat"), access: data.get("access") || "D1", location: String(data.get("location") || "").trim(), sections, relations, isPublished: data.get("published") === "on",
    });
  }

  document.querySelectorAll("[data-editor-kind]").forEach((button) => button.addEventListener("click", () => openForm(button.dataset.editorKind)));
  document.querySelector("[data-dialog-close]")?.addEventListener("click", () => { revokeSectionPreviews(); dialog.close(); });
  dialog?.addEventListener("close", () => revokeSectionPreviews());
  form.querySelector("[data-form-back]")?.addEventListener("click", () => { formStep = Math.max(1, formStep - 1); updateFormStep(); });
  form.querySelector("[data-form-next]")?.addEventListener("click", () => {
    const current = fields.querySelector(`[data-form-step="${formStep}"]`);
    const invalid = [...current.querySelectorAll("input, textarea, select")].find((control) => !control.checkValidity());
    if (invalid) { invalid.reportValidity(); return; }
    formStep = Math.min(6, formStep + 1); updateFormStep();
  });
  document.querySelectorAll("[data-entry-filter]").forEach((button) => button.addEventListener("click", () => {
    filter = button.dataset.entryFilter;
    document.querySelectorAll("[data-entry-filter]").forEach((item) => item.setAttribute("aria-selected", String(item === button)));
    renderEntries();
  }));
  list?.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-entry-id]");
    const entry = entries.find((item) => item.id === row?.dataset.entryId);
    if (!entry) return;
    if (event.target.closest("[data-entry-edit]")) openForm(entry.entry_type, entry);
    if (event.target.closest("[data-entry-delete]") && session.hasAccess("editor") && window.confirm(`Удалить «${entry.title}»?`)) {
      const response = await client.from("editorial_entries").update({ deleted_at: new Date().toISOString(), is_published: false, updated_by: account.userId }).eq("id", entry.id);
      if (response.error) status.textContent = response.error.message;
      else await loadEntries();
    }
  });
  journal?.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-journal-id]");
    const rowIndex = journal._rows?.findIndex((item) => String(item.id) === row?.dataset.journalId);
    const change = rowIndex >= 0 ? journal._changes?.[rowIndex] : null;
    const button = event.target.closest("[data-journal-rollback]");
    if (!change || !button) return;
    button.disabled = true;
    try { await window.MIDGAS_SUPABASE_DATA.rollbackChange(change); await loadJournal(); status.textContent = "Изменение откачено."; }
    catch (error) { status.textContent = error?.message || "Откат не выполнен."; button.disabled = false; }
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form); const kind = String(data.get("kind")); const id = String(data.get("entryId") || "");
    const submit = form.querySelector("[data-form-submit]"); const formStatus = form.querySelector("[data-form-status]");
    submit.disabled = true; formStatus.textContent = "Сохраняем в Supabase…";
    try {
      if (["client", "incident", "anomaly"].includes(kind)) await saveRecord(data, kind); else await saveEditorial(data, kind, id);
      dialog.close(); status.textContent = "Изменения сохранены."; await loadEntries();
    } catch (error) { formStatus.textContent = error?.message || "Не удалось сохранить."; }
    finally { submit.disabled = false; }
  });

  async function waitForAccount() {
    const immediate = await session.ready;
    if (immediate) return immediate;
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(session.read()), 4000);
      window.addEventListener(session.eventName, function onSession(event) {
        if (!event.detail?.account) return;
        window.clearTimeout(timeout);
        window.removeEventListener(session.eventName, onSession);
        resolve(event.detail.account);
      });
    });
  }

  waitForAccount().then(async (current) => {
    account = current || session.read();
    if (!account || !session.hasAccess("editor")) { window.location.replace("account.html"); return; }
    document.querySelector("[data-workspace-role]").textContent = account.role === "admin" ? "АДМИНИСТРАТОР" : "РЕДАКТОР";
    document.querySelector("[data-workspace-login]").textContent = account.login;
    try { await window.MIDGAS_SUPABASE_DATA?.ready; await bootstrapGlossaryEntries(); await loadEntries(); }
    catch (error) { status.textContent = error?.message || "Не удалось загрузить материалы."; }
  });
})();
