(() => {
  "use strict";

  const ACCESS_KEY = "midgas_site_access_token_v2";
  const ENDPOINT = "https://skvwaovkkoxqfwkcpuvh.supabase.co/functions/v1/site-access";
  const PUBLISHABLE_KEY = "sb_publishable_VzgpYoXN_0lM414FnMWp2A_ZU8ucWDv";
  const originalTitle = document.title;
  document.documentElement.classList.add("site-access-locked");
  document.title = "Безопасный вход";

  const style = document.createElement("style");
  style.textContent = `
    html.site-access-locked, html.site-access-locked body { min-height: 100%; margin: 0; overflow: hidden !important; background: #050505 !important; }
    html.site-access-locked body > *:not(.site-access-gate) { display: none !important; }
    .site-access-gate { position: fixed; z-index: 2147483647; inset: 0; display: grid; place-items: center; padding: 18px; color: #efeee8; background: #050505; font-family: "PT Mono", ui-monospace, monospace; }
    .site-access-panel { width: min(440px, 100%); border: 1px solid #4a4a46; background: #0b0b0b; }
    .site-access-panel h1 { margin: 0; padding: 28px 24px; font: 400 clamp(18px, 4vw, 26px)/1.25 inherit; text-align: center; text-transform: uppercase; border-bottom: 1px solid #4a4a46; }
    .site-access-panel form { display: grid; }
    .site-access-panel label { display: grid; gap: 8px; padding: 18px 20px; border-bottom: 1px solid #383834; }
    .site-access-panel label span { color: #85857f; font-size: 9px; letter-spacing: .08em; }
    .site-access-panel input { width: 100%; min-height: 44px; box-sizing: border-box; padding: 0 12px; color: #efeee8; background: #151515; border: 1px solid #4a4a46; border-radius: 0; outline: none; font: inherit; }
    .site-access-panel input:focus { border-color: #efeee8; }
    .site-access-panel button { min-height: 58px; color: #050505; background: #efeee8; border: 0; cursor: pointer; font: inherit; font-size: 10px; letter-spacing: .08em; }
    .site-access-panel button:hover { color: #efeee8; background: #242424; }
    .site-access-panel button:disabled { cursor: wait; opacity: .55; }
    .site-access-message { min-height: 18px; margin: 0; padding: 12px 20px; color: #ce4a3e; font-size: 9px; line-height: 1.4; text-align: center; border-top: 1px solid #383834; }
  `;
  document.head.append(style);

  async function request(action, payload = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: PUBLISHABLE_KEY },
        body: JSON.stringify({ action, ...payload }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, ...result };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function grantAccess() {
    document.documentElement.classList.remove("site-access-locked");
    document.documentElement.classList.add("site-access-granted");
    document.querySelector(".site-access-gate")?.remove();
    document.title = originalTitle;
    window.dispatchEvent(new CustomEvent("midgas:site-access-granted"));
  }

  function renderGate(messageText = "") {
    if (document.querySelector(".site-access-gate")) return;
    const gate = document.createElement("div");
    gate.className = "site-access-gate";
    gate.innerHTML = `<section class="site-access-panel" aria-labelledby="site-access-title"><h1 id="site-access-title">Выполнить безопасный вход</h1><form data-site-access-form><label><span>ЛОГИН</span><input name="login" type="text" required autocomplete="username" autocapitalize="none"></label><label><span>ПАРОЛЬ</span><input name="password" type="password" required autocomplete="current-password"></label><button type="submit">ВОЙТИ</button><p class="site-access-message" data-site-access-message aria-live="polite"></p></form></section>`;
    document.body.append(gate);
    const form = gate.querySelector("[data-site-access-form]");
    const message = gate.querySelector("[data-site-access-message]");
    const button = form.querySelector("button");
    message.textContent = messageText;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      button.disabled = true;
      message.textContent = "ПРОВЕРКА ДОСТУПА…";
      try {
        const result = await request("login", {
          login: form.elements.login.value.trim(),
          password: form.elements.password.value,
        });
        form.elements.password.value = "";
        if (!result.ok || !result.token) {
          message.textContent = result.status === 429
            ? "СЛИШКОМ МНОГО ПОПЫТОК. ПОВТОРИТЕ ПОЗЖЕ."
            : result.status >= 500 ? "СЕРВИС ВХОДА ВРЕМЕННО НЕДОСТУПЕН." : "НЕВЕРНЫЙ ЛОГИН ИЛИ ПАРОЛЬ";
          form.elements.password.focus();
          return;
        }
        sessionStorage.setItem(ACCESS_KEY, result.token);
        grantAccess();
      } catch {
        message.textContent = "НЕ УДАЛОСЬ СВЯЗАТЬСЯ С СЕРВЕРОМ ВХОДА.";
      } finally {
        button.disabled = false;
      }
    });
    form.elements.login.focus();
  }

  async function start() {
    const token = sessionStorage.getItem(ACCESS_KEY) || "";
    if (token) {
      try {
        const result = await request("validate", { token });
        if (result.ok && result.valid) {
          grantAccess();
          return;
        }
      } catch {
        renderGate("НЕ УДАЛОСЬ ПРОВЕРИТЬ СЕАНС. ВЫПОЛНИТЕ ВХОД ЕЩЁ РАЗ.");
        return;
      }
      sessionStorage.removeItem(ACCESS_KEY);
    }
    renderGate();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
