(() => {
  "use strict";
  const api = window.MIDGAS_ACCOUNT_SESSION;
  const roleNames = { viewer: "ПОЛЬЗОВАТЕЛЬ", editor: "РЕДАКТОР", admin: "АДМИНИСТРАТОР" };
  const elements = {
    avatar: document.querySelector("[data-account-avatar]"), avatarImage: document.querySelector("[data-account-avatar-image]"),
    avatarFallback: document.querySelector("[data-account-avatar-fallback]"), avatarInput: document.querySelector("[data-account-avatar-input]"), role: document.querySelector("[data-account-role]"),
    name: document.querySelector("[data-account-name]"), login: document.querySelector("[data-account-login]"),
    tools: document.querySelector("[data-account-tools]"), logout: document.querySelector("[data-account-logout]"),
    status: document.querySelector("[data-account-status]"),
  };
  function render(account) {
    if (!account) {
      elements.avatarFallback.textContent = "•";
      elements.avatarImage.hidden = true;
      elements.avatarImage.removeAttribute("src");
      elements.role.textContent = "СЕАНС НЕ НАЙДЕН";
      elements.name.textContent = "Войдите снова";
      elements.login.textContent = "";
      elements.tools.hidden = true;
      delete document.body.dataset.role;
      return;
    }
    const displayName = String(account.displayName || account.login || "Аккаунт");
    elements.avatarFallback.textContent = displayName.charAt(0).toUpperCase();
    elements.avatarImage.hidden = !account.avatarUrl;
    if (account.avatarUrl) elements.avatarImage.src = account.avatarUrl;
    else elements.avatarImage.removeAttribute("src");
    elements.role.textContent = roleNames[account.role] || roleNames.viewer;
    elements.name.textContent = displayName;
    elements.login.textContent = `Логин: ${account.login}`;
    elements.tools.hidden = account.role === "viewer";
    document.body.dataset.role = account.role;
    elements.status.textContent = "";
  }
  elements.avatarInput?.addEventListener("change", async () => {
    const file = elements.avatarInput.files?.[0];
    const account = api.read();
    if (!file || !account) return;
    if (file.size > 5 * 1024 * 1024) { elements.status.textContent = "Файл должен быть не больше 5 МБ."; return; }
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${account.userId}/avatar-${Date.now()}.${extension}`;
    elements.avatarInput.disabled = true;
    elements.status.textContent = "Загружаем аватарку…";
    try {
      const client = window.MIDGAS_SUPABASE_CLIENT;
      const uploaded = await client.storage.from("account-avatars").upload(path, file, { cacheControl: "3600", upsert: false });
      if (uploaded.error) throw uploaded.error;
      const saved = await client.rpc("set_account_avatar", { p_path: path });
      if (saved.error) { await client.storage.from("account-avatars").remove([path]); throw saved.error; }
      if (account.avatarPath) await client.storage.from("account-avatars").remove([account.avatarPath]);
      await api.refresh();
      elements.status.textContent = "Аватарка обновлена.";
    } catch (error) { elements.status.textContent = error?.message || "Не удалось загрузить аватарку."; }
    finally { elements.avatarInput.disabled = false; elements.avatarInput.value = ""; }
  });
  elements.logout?.addEventListener("click", async () => {
    elements.logout.disabled = true;
    elements.status.textContent = "Завершаем сеанс…";
    try { await api.signOut(); }
    catch (error) {
      elements.status.textContent = error?.message || "Не удалось выйти из аккаунта.";
      elements.logout.disabled = false;
    }
  });
  api?.ready.then((account) => {
    if (account) render(account);
    else elements.status.textContent = "Сеанс не найден. Войдите снова.";
  });
  window.addEventListener(api?.eventName || "midgas:account-session", (event) => render(event.detail?.account || null));
})();
