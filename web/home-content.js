(() => {
  "use strict";
  const main = document.querySelector(".home-page main");
  if (!main) return;
  const byId = (id) => document.getElementById(id);
  const support = document.querySelector(".support-section");
  const topics = byId("current-topics");
  const ordered = [byId("client-preview"), byId("company-board"), byId("anomaly-preview"), byId("historical-archive"), byId("incident-preview"), byId("locations"), byId("company-hub"), byId("glossary"), byId("company-quotes")].filter(Boolean);
  support?.after(...ordered);
  if (support && topics) support.after(topics);
  byId("registry")?.remove();
  byId("company-account")?.remove();
  byId("company-hub")?.classList.add("company-hub--materials-only");

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  function updateGlossary(entries) {
    const remoteIds = new Set(entries.map((entry) => String(entry.id || "")).filter(Boolean));
    document.querySelectorAll('[data-glossary-entry][data-editorial-source="supabase"]').forEach((entry) => {
      if (!remoteIds.has(entry.dataset.editorialId || "")) entry.remove();
    });
    entries.forEach((entry) => {
      const domId = String(entry.metadata?.domId || "");
      const target = document.querySelector(`[data-glossary-entry][data-editorial-id="${CSS.escape(String(entry.id || ""))}"]`) || (domId ? document.getElementById(domId) : null);
      const groupName = ["registry", "field", "cosmos"].includes(entry.metadata?.group) ? entry.metadata.group : "registry";
      if (target) {
        const title = target.querySelector("h4"); const body = target.querySelector("p");
        if (title) title.textContent = entry.title;
        if (body) body.textContent = entry.body;
        target.dataset.editorialId = entry.id || "";
        target.dataset.group = groupName;
        target.hidden = !entry.is_published;
        const grid = document.querySelector(`[data-glossary-group="${groupName}"] .glossary-grid`);
        if (grid && target.parentElement !== grid) grid.append(target);
        return;
      }
      const grid = document.querySelector(`[data-glossary-group="${groupName}"] .glossary-grid`);
      if (!grid || !entry.is_published) return;
      grid.insertAdjacentHTML("beforeend", `<article class="glossary-entry" data-glossary-entry data-editorial-source="supabase" data-editorial-id="${escape(entry.id)}" data-group="${groupName}"><div><span>NEW / TXT</span><h4>${escape(entry.title)}</h4><em>ГЛОССАРИЙ</em></div><p>${escape(entry.body)}</p></article>`);
    });
    const visible = document.querySelectorAll("[data-glossary-entry]:not([hidden])").length;
    const index = document.querySelector("#glossary .section-index");
    if (index) index.textContent = `07 / ГЛОССАРИЙ / ${visible} ТЕРМИНОВ`;
    window.MIDGAS_REFRESH_GLOSSARY?.();
  }

  async function synchronizeEditorialContent() {
    const api = window.MIDGAS_ACCOUNT_SESSION;
    await api?.ready;
    const client = window.MIDGAS_SUPABASE_CLIENT;
    if (!client) return;
    const response = await client.from("editorial_entries").select("id,entry_type,title,body,metadata,is_published,created_at,updated_at").eq("is_published", true).is("deleted_at", null).order("created_at");
    if (response.error) return;
    const entries = response.data || [];
    window.MIDGAS_EDITORIAL_ENTRIES = entries;
    updateGlossary(entries.filter((entry) => entry.entry_type === "glossary"));
    const quotes = entries.filter((entry) => entry.entry_type === "quote");
    window.MIDGAS_SET_QUOTES?.(quotes);
    window.dispatchEvent(new CustomEvent("midgas:editorial-content", { detail: { entries } }));
    return entries;
  }
  window.MIDGAS_RELOAD_EDITORIAL_CONTENT = synchronizeEditorialContent;
  void synchronizeEditorialContent();
})();
