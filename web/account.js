(() => {
  "use strict";
  const api = window.MIDGAS_ACCOUNT_SESSION;
  const roleNames = { viewer: "ПОЛЬЗОВАТЕЛЬ", editor: "РЕДАКТОР", admin: "АДМИНИСТРАТОР" };
  const elements = {
    avatar: document.querySelector("[data-account-avatar]"), role: document.querySelector("[data-account-role]"),
    name: document.querySelector("[data-account-name]"), login: document.querySelector("[data-account-login]"),
    tools: document.querySelector("[data-account-tools]"), logout: document.querySelector("[data-account-logout]"),
    status: document.querySelector("[data-account-status]"),
  };
  function render(account) {
    if (!account) return;
    const displayName = String(account.displayName || account.login || "Аккаунт");
    elements.avatar.textContent = displayName.charAt(0).toUpperCase();
    elements.role.textContent = roleNames[account.role] || roleNames.viewer;
    elements.name.textContent = displayName;
    elements.login.textContent = `Логин: ${account.login}`;
    elements.tools.hidden = account.role === "viewer";
    document.body.dataset.role = account.role;
    elements.status.textContent = "";
  }
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
  window.addEventListener(api?.eventName || "midgas:account-session", (event) => render(event.detail?.account));
})();
