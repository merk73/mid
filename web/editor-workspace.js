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

  const names = { client: "клиента", incident: "инцидент", anomaly: "аномалию", location: "локацию", glossary: "термин", quote: "цитату" };
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const field = (label, input) => `<label class="ui-field"><span>${label}</span>${input}</label>`;

  function recordFields(kind) {
    return [
      `<section class="workspace-form-step" data-form-step="1">${field("Имя", '<input name="title" required maxlength="180" autocomplete="off" />')}${field("Подпись", '<input name="caption" required maxlength="180" autocomplete="off" />')}${field("Основное фото", '<input name="image" type="file" accept="image/*" required />')}${field("Дополнительные фото — до 9", '<input name="gallery" type="file" accept="image/*" multiple />')}</section>`,
      `<section class="workspace-form-step" data-form-step="2" hidden><div class="workspace-form-row">${field("Уровень угрозы", `<select name="threat">${[1,2,3,4,5].map((n) => `<option>T${n}</option>`).join("")}</select>`)}${field("Уровень доступа", `<select name="access">${[1,2,3,4,5].map((n) => `<option>D${n}</option>`).join("")}</select>`)}</div></section>`,
      `<section class="workspace-form-step" data-form-step="3" hidden>${field("Краткое описание", '<textarea name="body" required maxlength="1400" rows="6"></textarea>')}</section>`,
      `<section class="workspace-form-step" data-form-step="4" hidden><p>Дополнительный раздел можно пропустить.</p>${field("Название раздела", '<input name="sectionTitle" maxlength="180" />')}${field("Текст раздела", '<textarea name="sectionBody" maxlength="5000" rows="6"></textarea>')}</section>`,
      `<section class="workspace-form-step" data-form-step="5" hidden><p>Укажите номера досье через запятую. Связи сразу попадут на доску.</p>${field("Связанные досье", '<input name="relations" placeholder="MID-C-0001, MID-A-0001" />')}</section>`,
      `<section class="workspace-form-step" data-form-step="6" hidden>${field("Локация", '<input name="location" maxlength="180" placeholder="Город, область или координаты" />')}<label class="ui-check"><input type="checkbox" name="published" checked /><span>Опубликовать сразу</span></label></section>`,
    ].join("");
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
    form.reset();
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
    list.innerHTML = visible.length ? visible.map((entry) => `<article class="workspace-entry" data-entry-id="${entry.id}"><span>${entry.entry_type.toUpperCase()}</span><div><strong>${escape(entry.title)}</strong><small>${entry.is_published ? "ОПУБЛИКОВАНО" : "ЧЕРНОВИК"}</small></div><button type="button" data-entry-edit>Изменить</button>${account?.role === "admin" ? '<button type="button" data-entry-delete aria-label="Удалить">×</button>' : ""}</article>`).join("") : "<p>Материалов этого типа пока нет.</p>";
  }

  async function loadJournal() {
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
    const relationIds = String(data.get("relations") || "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
    const relations = relationIds.map((id) => ({ id, type: id.startsWith("MID-A-") ? "anomaly" : id.startsWith("MID-I-") ? "incident" : "client", label: id }));
    const sectionTitle = String(data.get("sectionTitle") || "").trim();
    const sectionBody = String(data.get("sectionBody") || "").trim();
    const sections = sectionTitle && sectionBody ? [{ title: sectionTitle, paragraphs: sectionBody.split(/\n\s*\n/).filter(Boolean) }] : [];
    await window.MIDGAS_EDITOR_STORE.create({
      type: kind, name: String(data.get("title") || "").trim(), caption,
      image, gallery, summary: String(data.get("body") || "").trim(), description: String(data.get("body") || "").trim(),
      threat: data.get("threat"), access: data.get("access") || "D1", location: String(data.get("location") || "").trim(), sections, relations, isPublished: data.get("published") === "on",
    });
  }

  document.querySelectorAll("[data-editor-kind]").forEach((button) => button.addEventListener("click", () => openForm(button.dataset.editorKind)));
  document.querySelector("[data-dialog-close]")?.addEventListener("click", () => dialog.close());
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
    if (event.target.closest("[data-entry-delete]") && account?.role === "admin" && window.confirm(`Удалить «${entry.title}»?`)) {
      const response = await client.from("editorial_entries").delete().eq("id", entry.id);
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
    try { await window.MIDGAS_SUPABASE_DATA?.ready; await bootstrapGlossaryEntries(); await Promise.all([loadEntries(), loadJournal()]); }
    catch (error) { status.textContent = error?.message || "Не удалось загрузить материалы."; }
  });
})();
