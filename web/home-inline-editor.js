(() => {
  "use strict";

  const session = window.MIDGAS_ACCOUNT_SESSION;
  const client = window.MIDGAS_SUPABASE_CLIENT;
  if (!session || !client) return;

  let account = null;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const entryById = (id) => (window.MIDGAS_EDITORIAL_ENTRIES || []).find((entry) => String(entry.id) === String(id));

  function makeButton(label, attribute, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute(attribute, "");
    if (className) button.className = className;
    return button;
  }

  function installTools() {
    if (!account || !session.hasAccess("editor")) return;
    document.documentElement.classList.add("has-inline-editor");

    const glossaryHeader = document.querySelector("#glossary .glossary-header");
    if (glossaryHeader && !glossaryHeader.querySelector("[data-inline-add-glossary]")) {
      const actions = document.createElement("div");
      actions.className = "home-editorial-section-actions";
      actions.append(makeButton("+ ДОБАВИТЬ ТЕРМИН", "data-inline-add-glossary"));
      glossaryHeader.append(actions);
    }

    document.querySelectorAll("[data-glossary-entry]").forEach((entry) => {
      const body = entry.querySelector(".glossary-entry-body-inner") || entry;
      if (!body.querySelector("[data-inline-edit-glossary]")) {
        body.append(makeButton("РЕДАКТИРОВАТЬ", "data-inline-edit-glossary", "home-editorial-entry-edit"));
      }
    });

    const quoteControls = document.querySelector("#company-quotes .company-quote-controls");
    if (quoteControls && !quoteControls.querySelector("[data-inline-edit-quote]")) {
      const edit = makeButton("РЕД.", "data-inline-edit-quote", "home-editorial-quote-action");
      edit.setAttribute("aria-label", "Редактировать текущую цитату");
      const add = makeButton("+", "data-inline-add-quote", "home-editorial-quote-action");
      add.setAttribute("aria-label", "Добавить цитату");
      quoteControls.append(edit, add);
    }
  }

  function closeForms() {
    document.querySelectorAll("[data-home-editorial-form]").forEach((form) => form.remove());
    window.MIDGAS_SET_QUOTE_EDITING?.(false);
  }

  function glossaryForm(entry = null) {
    closeForms();
    const currentId = entry?.dataset.editorialId || "";
    const current = entryById(currentId);
    const title = current?.title || entry?.querySelector("h4")?.textContent?.trim() || "";
    const body = current?.body || entry?.querySelector(".glossary-entry-body p, :scope > p")?.textContent?.trim() || "";
    const group = current?.metadata?.group || entry?.dataset.group || "registry";
    const form = document.createElement("form");
    form.className = "home-editorial-inline-form home-editorial-inline-form--glossary";
    form.dataset.homeEditorialForm = "glossary";
    form.dataset.entryId = currentId;
    form.dataset.domId = entry?.id || current?.metadata?.domId || "";
    form.innerHTML = `
      <label><span>ТЕРМИН</span><input name="title" required maxlength="180" value="${escape(title)}" /></label>
      <label><span>ОПРЕДЕЛЕНИЕ</span><textarea name="body" required maxlength="2400" rows="5">${escape(body)}</textarea></label>
      <label><span>РАЗДЕЛ</span><select name="group"><option value="registry"${group === "registry" ? " selected" : ""}>ПРОТОКОЛ</option><option value="field"${group === "field" ? " selected" : ""}>ЯВЛЕНИЯ</option><option value="cosmos"${group === "cosmos" ? " selected" : ""}>КОСМОЛОГИЯ</option></select></label>
      <div><p data-inline-editor-status role="status"></p><button type="button" data-inline-editor-cancel>ОТМЕНИТЬ</button><button type="submit">СОХРАНИТЬ</button></div>`;

    if (entry) {
      entry.classList.add("is-open");
      entry.querySelector(".glossary-entry-trigger")?.setAttribute("aria-expanded", "true");
      entry.querySelector(".glossary-entry-body")?.setAttribute("aria-hidden", "false");
      entry.append(form);
    } else {
      document.querySelector("#glossary .glossary-tools")?.after(form);
    }
    form.querySelector("input")?.focus();
  }

  function quoteForm(createNew = false) {
    closeForms();
    window.MIDGAS_SET_QUOTE_EDITING?.(true);
    const frame = document.querySelector("#company-quotes blockquote");
    const currentId = createNew ? "" : frame?.dataset.editorialId || "";
    const current = entryById(currentId);
    const title = createNew ? "" : current?.title || frame?.querySelector("footer")?.textContent?.trim() || "";
    const body = createNew ? "" : current?.body || frame?.querySelector("p")?.textContent?.trim() || "";
    const source = createNew ? "" : current?.metadata?.source || frame?.querySelector("footer")?.textContent?.trim() || "";
    const form = document.createElement("form");
    form.className = "home-editorial-inline-form home-editorial-inline-form--quote";
    form.dataset.homeEditorialForm = "quote";
    form.dataset.entryId = currentId;
    form.innerHTML = `
      <label><span>НАЗВАНИЕ В РЕДАКТОРЕ</span><input name="title" required maxlength="180" value="${escape(title)}" /></label>
      <label><span>ТЕКСТ ЦИТАТЫ</span><textarea name="body" required maxlength="2400" rows="5">${escape(body)}</textarea></label>
      <label><span>ПОДПИСЬ</span><input name="source" maxlength="180" value="${escape(source)}" /></label>
      <div><p data-inline-editor-status role="status"></p><button type="button" data-inline-editor-cancel>ОТМЕНИТЬ</button><button type="submit">СОХРАНИТЬ</button></div>`;
    document.querySelector("#company-quotes .company-quotes-body")?.append(form);
    form.querySelector("textarea")?.focus();
  }

  async function saveForm(form) {
    if (!account || !session.hasAccess("editor") || !form.reportValidity()) return;
    const kind = form.dataset.homeEditorialForm;
    const id = form.dataset.entryId || "";
    const data = new FormData(form);
    const existing = entryById(id);
    const metadata = kind === "quote"
      ? { ...(existing?.metadata || {}), source: String(data.get("source") || "").trim() }
      : { ...(existing?.metadata || {}), group: String(data.get("group") || "registry"), domId: form.dataset.domId || existing?.metadata?.domId || "" };
    const payload = {
      entry_type: kind,
      title: String(data.get("title") || "").trim(),
      body: String(data.get("body") || "").trim(),
      metadata,
      is_published: true,
      updated_by: account.userId,
    };
    const submit = form.querySelector('button[type="submit"]');
    const status = form.querySelector("[data-inline-editor-status]");
    submit.disabled = true;
    status.textContent = "СОХРАНЯЕМ В SUPABASE…";
    const query = id
      ? client.from("editorial_entries").update(payload).eq("id", id).select("id").single()
      : client.from("editorial_entries").insert({ ...payload, created_by: account.userId }).select("id").single();
    const response = await query;
    if (response.error) {
      status.textContent = response.error.message || "НЕ УДАЛОСЬ СОХРАНИТЬ";
      submit.disabled = false;
      return;
    }
    status.textContent = "СОХРАНЕНО";
    await window.MIDGAS_RELOAD_EDITORIAL_CONTENT?.();
    closeForms();
    installTools();
  }

  document.addEventListener("click", (event) => {
    if (!account || !session.hasAccess("editor")) return;
    if (event.target.closest("[data-inline-add-glossary]")) glossaryForm();
    const glossaryEdit = event.target.closest("[data-inline-edit-glossary]");
    if (glossaryEdit) glossaryForm(glossaryEdit.closest("[data-glossary-entry]"));
    if (event.target.closest("[data-inline-edit-quote]")) quoteForm(false);
    if (event.target.closest("[data-inline-add-quote]")) quoteForm(true);
    if (event.target.closest("[data-inline-editor-cancel]")) closeForms();
  });

  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-home-editorial-form]");
    if (!form) return;
    event.preventDefault();
    void saveForm(form);
  });

  window.addEventListener("midgas:editorial-content", installTools);
  session.ready.then((current) => {
    account = current;
    installTools();
  });
  window.addEventListener(session.eventName, (event) => {
    account = event.detail?.account || null;
    if (account && session.hasAccess("editor")) installTools();
    else closeForms();
  });
})();
