(() => {
  "use strict";

  const OWNER_EMAIL = "habkraihistory@gmail.com";
  const config = window.MIDGAS_SUPABASE_CONFIG || {};
  const factory = window.supabase?.createClient;
  const client = window.MIDGAS_SUPABASE_CLIENT || (factory && config.url && config.publishableKey
    ? factory(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } })
    : null);
  if (client && !window.MIDGAS_SUPABASE_CLIENT) window.MIDGAS_SUPABASE_CLIENT = client;

  let state = { enabled: false, authenticated: false, approved: false, owner: false, email: "" };

  function dispatch() {
    window.dispatchEvent(new CustomEvent("midgas:maintenance-ready", { detail: { ...state } }));
  }

  async function approvedAccount() {
    if (!client) return { authenticated: false, approved: false, owner: false, email: "", userId: "" };
    const { data: userData } = await client.auth.getUser();
    const user = userData?.user;
    if (!user?.id) return { authenticated: false, approved: false, owner: false, email: "", userId: "" };
    const { data: member } = await client.from("editor_members").select("role,approved_at").eq("user_id", user.id).maybeSingle();
    const approved = Boolean(member?.approved_at && ["editor", "admin"].includes(member.role));
    const email = String(user.email || "").toLowerCase();
    return { authenticated: true, approved, owner: approved && email === OWNER_EMAIL, email, userId: user.id };
  }

  function removeGate() {
    document.querySelector(".site-maintenance-gate")?.remove();
    document.documentElement.classList.remove("site-maintenance-locked");
  }

  function renderGate(message = "") {
    removeGate();
    const gate = document.createElement("div");
    gate.className = "site-maintenance-gate";
    gate.innerHTML = `<div class="site-maintenance-panel"><span>MIDGAS / SERVICE MODE</span><h1>САЙТ ЗАКРЫТ<br>НА ТЕХНИЧЕСКОЕ ОБСЛУЖИВАНИЕ</h1><p>Редакция обновляет реестр и связанные материалы. Подтверждённые редакторы могут продолжить работу после входа.</p><button type="button" data-maintenance-login>ВХОД ДЛЯ РЕДАКТОРА</button><form data-maintenance-form hidden><label><span>ПОЧТА</span><input type="email" name="email" required autocomplete="username"></label><label><span>ПАРОЛЬ</span><input type="password" name="password" required autocomplete="current-password"></label><button type="submit">ВОЙТИ</button></form><em data-maintenance-message>${message}</em></div>`;
    document.body.append(gate);
    document.documentElement.classList.add("site-maintenance-locked");
    const form = gate.querySelector("[data-maintenance-form]");
    gate.querySelector("[data-maintenance-login]")?.addEventListener("click", (event) => {
      event.currentTarget.hidden = true;
      form.hidden = false;
      form.elements.email.focus();
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const output = gate.querySelector("[data-maintenance-message]");
      output.textContent = "ПРОВЕРЯЕМ ДОСТУП…";
      const { error } = await client.auth.signInWithPassword({
        email: form.elements.email.value.trim(),
        password: form.elements.password.value,
      });
      if (error) { output.textContent = "НЕВЕРНАЯ ПОЧТА ИЛИ ПАРОЛЬ."; return; }
      const account = await approvedAccount();
      if (!account.approved) {
        await client.auth.signOut({ scope: "local" });
        output.textContent = "АККАУНТ НЕ ПОДТВЕРЖДЁН РЕДАКЦИЕЙ.";
        return;
      }
      window.location.reload();
    });
  }

  async function refresh() {
    if (!client) { dispatch(); return state; }
    const [{ data: settings }, account] = await Promise.all([
      client.from("site_settings").select("maintenance_enabled,updated_at").eq("id", "global").maybeSingle(),
      approvedAccount(),
    ]);
    state = { ...account, enabled: Boolean(settings?.maintenance_enabled), updatedAt: settings?.updated_at || "" };
    if (state.enabled && !state.approved) renderGate();
    else removeGate();
    dispatch();
    return state;
  }

  async function setMaintenance(enabled) {
    const account = await approvedAccount();
    if (!account.owner) throw new Error("УПРАВЛЕНИЕ ДОСТУПНО ТОЛЬКО ВЛАДЕЛЬЦУ САЙТА.");
    const { error } = await client.from("site_settings").update({
      maintenance_enabled: Boolean(enabled),
      updated_at: new Date().toISOString(),
      updated_by: account.userId,
    }).eq("id", "global");
    if (error) throw error;
    state = { ...state, ...account, enabled: Boolean(enabled) };
    dispatch();
    return { ...state };
  }

  const ready = refresh().catch(() => { dispatch(); return state; });
  window.MIDGAS_SITE_GATE = Object.freeze({ ownerEmail: OWNER_EMAIL, ready, refresh, setMaintenance, getState: () => ({ ...state }) });
})();
