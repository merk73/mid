(() => {
  "use strict";

  const STORAGE_KEY = "midgas_account_session_v1";
  const ENDPOINT = "https://skvwaovkkoxqfwkcpuvh.supabase.co/functions/v1/account-login";
  const PUBLISHABLE_KEY = "sb_publishable_VzgpYoXN_0lM414FnMWp2A_ZU8ucWDv";
  const originalTitle = document.title;
  let accountSession = null;

  document.documentElement.classList.add("site-access-locked");
  document.title = "Вход — THE MIDGAS";

  const style = document.createElement("style");
  style.textContent = `
    html.site-access-locked, html.site-access-locked body { min-height: 100%; margin: 0; overflow: hidden !important; background: #050505 !important; }
    html.site-access-locked body > *:not(.site-access-gate) { visibility: hidden !important; }
    .site-access-gate { position: fixed; z-index: 2147483647; inset: 0; display: grid; place-items: center; padding: 18px; color: #efeee8; background: #050505; font-family: "PT Mono", ui-monospace, monospace; visibility: visible !important; }
    .site-access-panel { width: min(430px, 100%); background: #0b0b0b; border: 1px solid #4a4a46; }
    .site-access-heading { padding: 28px 24px; border-bottom: 1px solid #4a4a46; }
    .site-access-heading span { color: #777771; font-size: 8px; letter-spacing: .1em; }
    .site-access-heading h1 { margin: 22px 0 10px; font: 400 clamp(25px, 6vw, 42px)/.9 inherit; letter-spacing: -.06em; }
    .site-access-heading p { max-width: 34ch; margin: 0; color: #999993; font-size: 9px; line-height: 1.6; }
    .site-access-panel form { display: grid; }
    .site-access-panel label { display: grid; gap: 8px; padding: 16px 20px; border-bottom: 1px solid #383834; }
    .site-access-panel label span { color: #85857f; font-size: 8px; letter-spacing: .08em; }
    .site-access-panel input { width: 100%; min-height: 48px; box-sizing: border-box; padding: 0 12px; color: #efeee8; background: #151515; border: 1px solid #4a4a46; border-radius: 0; outline: none; font: inherit; font-size: 16px; }
    .site-access-panel input:focus { border-color: #efeee8; }
    .site-access-panel button { min-height: 58px; color: #050505; background: #efeee8; border: 0; cursor: pointer; font: inherit; font-size: 9px; font-weight: 700; letter-spacing: .08em; }
    .site-access-panel button:hover, .site-access-panel button:focus-visible { color: #efeee8; background: #b42319; outline: 0; }
    .site-access-panel button:disabled { cursor: wait; opacity: .55; }
    .site-access-message { min-height: 40px; margin: 0; padding: 12px 20px; color: #ce4a3e; font-size: 8px; line-height: 1.4; text-align: center; border-top: 1px solid #383834; }
  `;
  document.head.append(style);

  function storedSession() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return value?.access_token && value?.refresh_token ? value : null;
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    accountSession = session?.access_token && session?.refresh_token ? session : null;
    if (accountSession) localStorage.setItem(STORAGE_KEY, JSON.stringify(accountSession));
    else localStorage.removeItem(STORAGE_KEY);
  }

  async function request(payload) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: PUBLISHABLE_KEY },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, ...result };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function grant(account, session) {
    saveSession(session);
    document.documentElement.classList.remove("site-access-locked");
    document.documentElement.classList.add("site-access-granted");
    document.documentElement.dataset.accountRole = account?.role || "viewer";
    document.querySelector(".site-access-gate")?.remove();
    document.title = originalTitle;
    window.dispatchEvent(new CustomEvent("midgas:account-access-granted", { detail: { account, session } }));
  }

  function renderGate(messageText = "") {
    document.querySelector(".site-access-gate")?.remove();
    const gate = document.createElement("div");
    gate.className = "site-access-gate";
    gate.innerHTML = `<section class="site-access-panel" aria-labelledby="site-access-title"><div class="site-access-heading"><span>MIDGAS / ACCOUNT ACCESS</span><h1 id="site-access-title">ВХОД В АРХИВ</h1><p>Авторизуйтесь, чтобы открыть исследовательскую систему.</p></div><form data-site-access-form><label><span>ЛОГИН</span><input name="login" type="text" required pattern="[A-Za-z0-9_-]{3,40}" autocomplete="username" autocapitalize="none"></label><label><span>ПАРОЛЬ</span><input name="password" type="password" required autocomplete="current-password"></label><button type="submit">ВОЙТИ</button><p class="site-access-message" data-site-access-message aria-live="polite"></p></form></section>`;
    document.body.append(gate);
    const form = gate.querySelector("[data-site-access-form]");
    const message = gate.querySelector("[data-site-access-message]");
    const button = form.querySelector("button");
    message.textContent = messageText;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      button.disabled = true;
      message.textContent = "ПРОВЕРЯЕМ АККАУНТ…";
      try {
        const result = await request({
          action: "login",
          login: form.elements.login.value.trim(),
          password: form.elements.password.value,
        });
        form.elements.password.value = "";
        if (!result.ok || !result.session || !result.account) {
          message.textContent = result.status === 429
            ? "СЛИШКОМ МНОГО ПОПЫТОК. ПОВТОРИТЕ ПОЗЖЕ."
            : result.status >= 500 ? "СЕРВИС ВХОДА ВРЕМЕННО НЕДОСТУПЕН." : (result.error || "НЕВЕРНЫЙ ЛОГИН ИЛИ ПАРОЛЬ.");
          form.elements.password.focus();
          return;
        }
        grant(result.account, result.session);
      } catch {
        message.textContent = "НЕ УДАЛОСЬ СВЯЗАТЬСЯ С СЕРВЕРОМ ВХОДА.";
      } finally {
        button.disabled = false;
      }
    });
    form.elements.login.focus();
  }

  async function start() {
    const session = storedSession();
    if (session) {
      try {
        const result = await request({
          action: "validate",
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (result.ok && result.session && result.account) {
          grant(result.account, result.session);
          return;
        }
      } catch {
        renderGate("СЕАНС НЕ УДАЛОСЬ ПРОВЕРИТЬ. ВОЙДИТЕ ЕЩЁ РАЗ.");
        return;
      }
      saveSession(null);
    }
    renderGate();
  }

  window.MIDGAS_SITE_ACCESS = Object.freeze({
    getSession: () => accountSession || storedSession(),
    setSession: saveSession,
    clear: () => saveSession(null),
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
