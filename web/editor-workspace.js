(() => {
  "use strict";
  const session = window.MIDGAS_ACCOUNT_SESSION;
  const client = window.MIDGAS_SUPABASE_CLIENT;
  const dialog = document.querySelector("[data-workspace-dialog]");
  const form = document.querySelector("[data-workspace-form]");
  const fields = document.querySelector("[data-workspace-fields]");
  const list = document.querySelector("[data-entry-list]");
  const status = document.querySelector("[data-workspace-status]");
  let account = null;
  let entries = [];
  let filter = "all";

  const names = { client: "клиента", incident: "инцидент", anomaly: "аномалию", location: "локацию", glossary: "термин", quote: "цитату" };
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const field = (label, input) => `<label class="ui-field"><span>${label}</span>${input}</label>`;

  function recordFields(kind) {
    const access = kind === "client" ? field("Уровень доступа", `<select name="access">${[1,2,3,4,5].map((n) => `<option>D${n}</option>`).join("")}</select>`) : "";
    return [
      field("Имя", '<input name="title" required maxlength="180" autocomplete="off" />'),
      field("Подпись", '<input name="caption" required maxlength="180" autocomplete="off" />'),
      field("Основное фото", '<input name="image" type="file" accept="image/*" required />'),
      field("Краткое описание", '<textarea name="body" required maxlength="1400" rows="5"></textarea>'),
      `<div class="workspace-form-row">${field("Уровень угрозы", `<select name="threat">${[1,2,3,4,5].map((n) => `<option>T${n}</option>`).join("")}</select>`)}${access}</div>`,
      field("Локация", '<input name="location" maxlength="180" placeholder="Город, область или координаты" />'),
      '<label class="ui-check"><input type="checkbox" name="published" checked /><span>Опубликовать сразу</span></label>',
    ].join("");
  }

  function editorialFields(kind, entry = {}) {
    const meta = entry.metadata || {};
    if (kind === "location") return [
      field("Название", `<input name="title" required maxlength="180" value="${escape(entry.title)}" />`),
      field("Описание", `<textarea name="body" maxlength="1400" rows="4">${escape(entry.body)}</textarea>`),
      `<div class="workspace-form-row">${field("Широта", `<input name="latitude" type="number" step="any" required value="${escape(meta.latitude)}" />`)}${field("Долгота", `<input name="longitude" type="number" step="any" required value="${escape(meta.longitude)}" />`)}</div>`,
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
    dialog.showModal();
    fields.querySelector("input, textarea, select")?.focus();
  }

  async function loadEntries() {
    const response = await client.from("editorial_entries").select("id,entry_type,title,body,metadata,is_published,updated_at").is("deleted_at", null).order("updated_at", { ascending: false });
    if (response.error) throw response.error;
    entries = response.data || [];
    renderEntries();
  }

  function renderEntries() {
    const visible = entries.filter((entry) => filter === "all" || entry.entry_type === filter);
    list.innerHTML = visible.length ? visible.map((entry) => `<article class="workspace-entry" data-entry-id="${entry.id}"><span>${entry.entry_type.toUpperCase()}</span><div><strong>${escape(entry.title)}</strong><small>${entry.is_published ? "ОПУБЛИКОВАНО" : "ЧЕРНОВИК"}</small></div><button type="button" data-entry-edit>Изменить</button>${account?.role === "admin" ? '<button type="button" data-entry-delete aria-label="Удалить">×</button>' : ""}</article>`).join("") : "<p>Материалов этого типа пока нет.</p>";
  }

  async function saveEditorial(data, kind, id) {
    const payload = {
      entry_type: kind, title: String(data.get("title") || "").trim(), body: String(data.get("body") || "").trim(),
      metadata: kind === "location" ? { latitude: Number(data.get("latitude")), longitude: Number(data.get("longitude")) } : kind === "quote" ? { source: String(data.get("source") || "").trim() } : { group: String(data.get("group") || "").trim() },
      is_published: data.get("published") === "on", updated_by: account.userId,
    };
    const query = id ? client.from("editorial_entries").update(payload).eq("id", id) : client.from("editorial_entries").insert({ ...payload, created_by: account.userId }).select().single();
    const response = await query;
    if (response.error) throw response.error;
  }

  async function saveRecord(data, kind) {
    const image = data.get("image");
    const caption = String(data.get("caption") || "").trim();
    await window.MIDGAS_EDITOR_STORE.create({
      type: kind, name: String(data.get("title") || "").trim(), alias: caption, cardType: caption,
      image, summary: String(data.get("body") || "").trim(), description: String(data.get("body") || "").trim(),
      threat: data.get("threat"), access: data.get("access") || "D1", location: String(data.get("location") || "").trim(), sections: [], relations: [],
    });
  }

  document.querySelectorAll("[data-editor-kind]").forEach((button) => button.addEventListener("click", () => openForm(button.dataset.editorKind)));
  document.querySelector("[data-dialog-close]")?.addEventListener("click", () => dialog.close());
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

  session.ready.then(async (current) => {
    account = current;
    if (!account || !session.hasAccess("editor")) { window.location.replace("account.html"); return; }
    document.querySelector("[data-workspace-role]").textContent = account.role === "admin" ? "АДМИНИСТРАТОР" : "РЕДАКТОР";
    document.querySelector("[data-workspace-login]").textContent = account.login;
    try { await window.MIDGAS_SUPABASE_DATA?.ready; await loadEntries(); }
    catch (error) { status.textContent = error?.message || "Не удалось загрузить материалы."; }
  });
})();
