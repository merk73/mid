(() => {
  "use strict";

  const config = window.MIDGAS_SUPABASE_CONFIG || {};
  const factory = window.supabase?.createClient;
  const client = window.MIDGAS_SUPABASE_CLIENT || (factory && config.url && config.publishableKey
    ? factory(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } })
    : null);
  if (client && !window.MIDGAS_SUPABASE_CLIENT) window.MIDGAS_SUPABASE_CLIENT = client;

  let state = { enabled: false, authenticated: false, approved: false, owner: false, login: "", role: "" };

  function dispatch() {
    window.dispatchEvent(new CustomEvent("midgas:maintenance-ready", { detail: { ...state } }));
  }

  async function approvedAccount() {
    if (!client) return { authenticated: false, approved: false, owner: false, login: "", role: "", userId: "" };
    const { data: userData } = await client.auth.getUser();
    const user = userData?.user;
    if (!user?.id) return { authenticated: false, approved: false, owner: false, login: "", role: "", userId: "" };
    const { data: member } = await client.from("editor_members").select("role,approved_at").eq("user_id", user.id).maybeSingle();
    const approved = Boolean(member?.approved_at && ["limited", "full", "admin"].includes(member.role));
    const login = String(user.user_metadata?.login || "").toLowerCase();
    return { authenticated: true, approved, owner: approved && member?.role === "admin", login, role: member?.role || "", userId: user.id };
  }

  function removeGate() {
    document.querySelector(".site-maintenance-gate")?.remove();
    document.documentElement.classList.remove("site-maintenance-locked");
  }

  function renderGate(message = "") {
    removeGate();
    const gate = document.createElement("div");
    gate.className = "site-maintenance-gate";
    gate.innerHTML = `<div class="site-maintenance-panel"><span>MIDGAS / SERVICE MODE</span><h1>САЙТ ЗАКРЫТ<br>НА ТЕХНИЧЕСКОЕ ОБСЛУЖИВАНИЕ</h1><p>Редакция обновляет реестр и связанные материалы. Редакторы могут продолжить работу после входа.</p><button type="button" data-maintenance-login>ВХОД ДЛЯ РЕДАКТОРА</button><form data-maintenance-form hidden><label><span>ЛОГИН</span><input type="text" name="login" required pattern="[A-Za-z0-9_-]{3,40}" autocomplete="username"></label><label><span>ПАРОЛЬ</span><input type="password" name="password" required autocomplete="current-password"></label><button type="submit">ВОЙТИ</button></form><em data-maintenance-message>${message}</em></div>`;
    document.body.append(gate);
    document.documentElement.classList.add("site-maintenance-locked");
    const form = gate.querySelector("[data-maintenance-form]");
    gate.querySelector("[data-maintenance-login]")?.addEventListener("click", (event) => {
      event.currentTarget.hidden = true;
      form.hidden = false;
      form.elements.login.focus();
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const output = gate.querySelector("[data-maintenance-message]");
      output.textContent = "ПРОВЕРЯЕМ ДОСТУП…";
      try {
        await window.MIDGAS_EDITOR_SESSION?.signIn?.({
          login: form.elements.login.value.trim(),
          password: form.elements.password.value,
        });
      } catch {
        output.textContent = "НЕВЕРНЫЙ ЛОГИН ИЛИ ПАРОЛЬ.";
        return;
      }
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
    if (!account.owner) throw new Error("УПРАВЛЕНИЕ ДОСТУПНО ТОЛЬКО АДМИНИСТРАТОРУ.");
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
  window.MIDGAS_SITE_GATE = Object.freeze({ ready, refresh, setMaintenance, getState: () => ({ ...state }) });
})();
