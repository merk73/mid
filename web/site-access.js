(() => {
  "use strict";

  const ACCESS_KEY = "midgas_site_access_v1";
  if (sessionStorage.getItem(ACCESS_KEY) === "granted") {
    document.documentElement.classList.add("site-access-granted");
    return;
  }

  document.documentElement.classList.add("site-access-locked");
  document.title = "Безопасный вход";

  const style = document.createElement("style");
  style.textContent = `
    html.site-access-locked, html.site-access-locked body { min-height: 100%; margin: 0; overflow: hidden !important; background: #050505 !important; }
    html.site-access-locked body > *:not(.site-access-gate) { display: none !important; }
    .site-access-gate { position: fixed; z-index: 2147483647; inset: 0; display: grid; place-items: center; padding: 18px; color: #efeee8; background: #050505; font-family: "PT Mono", ui-monospace, monospace; }
    .site-access-panel { width: min(440px, 100%); border: 1px solid #4a4a46; background: #0b0b0b; }
    .site-access-panel h1 { margin: 0; padding: 28px 24px; font-family: inherit; font-size: clamp(18px, 4vw, 26px); font-weight: 400; line-height: 1.25; text-align: center; text-transform: uppercase; border-bottom: 1px solid #4a4a46; }
    .site-access-panel form { display: grid; }
    .site-access-panel label { display: grid; gap: 8px; padding: 18px 20px; border-bottom: 1px solid #383834; }
    .site-access-panel label span { color: #85857f; font-size: 9px; letter-spacing: .08em; }
    .site-access-panel input { width: 100%; min-height: 44px; box-sizing: border-box; padding: 0 12px; color: #efeee8; background: #151515; border: 1px solid #4a4a46; border-radius: 0; outline: none; font: inherit; }
    .site-access-panel input:focus { border-color: #efeee8; }
    .site-access-panel button { min-height: 58px; color: #050505; background: #efeee8; border: 0; cursor: pointer; font: inherit; font-size: 10px; letter-spacing: .08em; }
    .site-access-panel button:hover { color: #efeee8; background: #242424; }
    .site-access-message { min-height: 18px; margin: 0; padding: 12px 20px; color: #ce4a3e; font-size: 9px; line-height: 1.4; text-align: center; border-top: 1px solid #383834; }
  `;
  document.head.append(style);

  function renderGate() {
    const gate = document.createElement("div");
    gate.className = "site-access-gate";
    gate.innerHTML = `<section class="site-access-panel" aria-labelledby="site-access-title"><h1 id="site-access-title">Выполнить безопасный вход</h1><form data-site-access-form><label><span>ЛОГИН</span><input name="login" type="text" required autocomplete="username" autocapitalize="none"></label><label><span>ПАРОЛЬ</span><input name="password" type="password" required autocomplete="current-password"></label><button type="submit">ВОЙТИ</button><p class="site-access-message" data-site-access-message aria-live="polite"></p></form></section>`;
    document.body.append(gate);

    const form = gate.querySelector("[data-site-access-form]");
    const message = gate.querySelector("[data-site-access-message]");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const login = form.elements.login.value.trim().toLowerCase();
      const password = form.elements.password.value;
      if (login !== "midgas" || password !== "54321") {
        message.textContent = "НЕВЕРНЫЙ ЛОГИН ИЛИ ПАРОЛЬ";
        form.elements.password.value = "";
        form.elements.password.focus();
        return;
      }
      sessionStorage.setItem(ACCESS_KEY, "granted");
      window.location.reload();
    });
    form.elements.login.focus();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderGate, { once: true });
  else renderGate();
})();
