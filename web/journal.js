(() => {
  "use strict";
  const session = window.MIDGAS_ACCOUNT_SESSION;
  const list = document.querySelector("[data-journal-list]");
  const status = document.querySelector("[data-journal-status]");
  const labels = { record_created: "СОЗДАНО", record_updated: "ИЗМЕНЕНО", record_soft_deleted: "УДАЛЕНО", record_restored: "ВОССТАНОВЛЕНО", relationship_created: "СВЯЗЬ ДОБАВЛЕНА", relationship_deleted: "СВЯЗЬ УДАЛЕНА" };
  const actions = { record_created: "create", record_updated: "update", record_soft_deleted: "delete", record_restored: "restore", relationship_created: "link", relationship_deleted: "unlink" };
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  let rows = [];

  async function load() {
    rows = await window.MIDGAS_SUPABASE_DATA.loadChangeFeed(160);
    list.innerHTML = rows.length ? rows.map((row) => `<article class="workspace-journal-row" data-journal-id="${escape(row.id)}"><time datetime="${escape(row.occurred_at)}">${new Date(row.occurred_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time><div><span>${labels[row.action] || escape(row.action)}</span><strong>${escape(row.record_name || row.record_code || "Связь карточек")}</strong><small>${escape(row.record_code || "")}</small></div><button type="button" data-journal-rollback>Откатить</button></article>`).join("") : "<p>Изменений пока нет.</p>";
  }

  list?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-journal-rollback]");
    const row = rows.find((item) => String(item.id) === event.target.closest("[data-journal-id]")?.dataset.journalId);
    if (!button || !row) return;
    const change = { action: actions[row.action], type: row.record_type, id: row.record_code, version: Number(row.details?.version) || null, source: row.details?.source, target: row.details?.target };
    button.disabled = true;
    status.textContent = "Выполняем откат…";
    try { await window.MIDGAS_SUPABASE_DATA.rollbackChange(change); await load(); status.textContent = "Изменение откачено."; }
    catch (error) { status.textContent = error?.message || "Откат не выполнен."; button.disabled = false; }
  });

  session.ready.then(async (account) => {
    if (!account || !session.hasAccess("editor")) { window.location.replace("account.html"); return; }
    try { await window.MIDGAS_SUPABASE_DATA.ready; await load(); }
    catch (error) { status.textContent = error?.message || "Не удалось загрузить журнал."; }
  });
})();
