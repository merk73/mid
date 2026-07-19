(() => {
  "use strict";
  const main = document.querySelector(".home-page main");
  if (!main) return;
  const byId = (id) => document.getElementById(id);
  const support = document.querySelector(".support-section");
  const ordered = [byId("client-preview"), byId("anomaly-preview"), byId("incident-preview"), byId("company-board"), byId("historical-archive"), byId("locations"), byId("company-hub"), byId("glossary"), byId("company-quotes")].filter(Boolean);
  support?.after(...ordered);
  byId("registry")?.remove();
  byId("current-topics")?.remove();
  byId("company-account")?.remove();
  byId("company-hub")?.classList.add("company-hub--materials-only");

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  function updateGlossary(entries) {
    entries.forEach((entry) => {
      const domId = String(entry.metadata?.domId || "");
      const target = domId ? document.getElementById(domId) : null;
      if (target) {
        const title = target.querySelector("h4"); const body = target.querySelector("p");
        if (title) title.textContent = entry.title;
        if (body) body.textContent = entry.body;
        target.hidden = !entry.is_published;
        return;
      }
      const groupName = ["registry", "field", "cosmos"].includes(entry.metadata?.group) ? entry.metadata.group : "registry";
      const grid = document.querySelector(`[data-glossary-group="${groupName}"] .glossary-grid`);
      if (!grid || !entry.is_published) return;
      grid.insertAdjacentHTML("beforeend", `<article class="glossary-entry" data-glossary-entry data-group="${groupName}"><div><span>NEW / TXT</span><h4>${escape(entry.title)}</h4><em>ГЛОССАРИЙ</em></div><p>${escape(entry.body)}</p></article>`);
    });
    const visible = document.querySelectorAll("[data-glossary-entry]:not([hidden])").length;
    const index = document.querySelector("#glossary .section-index");
    if (index) index.textContent = `07 / ГЛОССАРИЙ / ${visible} ТЕРМИНОВ`;
  }

  async function synchronizeEditorialContent() {
    const api = window.MIDGAS_ACCOUNT_SESSION;
    await api?.ready;
    const client = window.MIDGAS_SUPABASE_CLIENT;
    if (!client) return;
    const response = await client.from("editorial_entries").select("entry_type,title,body,metadata,is_published").eq("is_published", true).is("deleted_at", null).order("created_at");
    if (response.error) return;
    const entries = response.data || [];
    updateGlossary(entries.filter((entry) => entry.entry_type === "glossary"));
    const quotes = entries.filter((entry) => entry.entry_type === "quote").map((entry) => [entry.body, entry.metadata?.source || entry.title]);
    window.MIDGAS_SET_QUOTES?.(quotes);
  }
  void synchronizeEditorialContent();
})();
