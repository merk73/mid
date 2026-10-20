(() => {
  "use strict";
  const script = document.currentScript;
  const root = new URL(".", script.src);
  const KEY = "midgas_site_version_v1";
  const params = new URLSearchParams(location.search);
  const valid = (value) => value === "modern" || value === "legacy";
  const relativePath = location.pathname.startsWith(root.pathname) ? location.pathname.slice(root.pathname.length) : "";
  const isLegacy = relativePath.startsWith("legacy/");
  const currentVersion = isLegacy ? "legacy" : "modern";
  const pagePath = isLegacy ? relativePath.slice(7) : relativePath;
  const supported = (path) => !path || /^(?:index|record|registry|board|editor|account|journal|changelog|historical-archive)\.html$/.test(path) || /^mid-[cai]-\d{4}(?:\/(?:index\.html)?)?$/i.test(path);
  let preferred = null;
  function save(value) { try { localStorage.setItem(KEY, value); } catch { /* Direct version URLs remain usable. */ } }
  try { preferred = localStorage.getItem(KEY); } catch { /* Storage may be unavailable. */ }
  if (valid(params.get("version"))) { preferred = params.get("version"); save(preferred); }
  function destination(version, path = location.pathname.slice(root.pathname.length).replace(/^legacy\//, ""), search = location.search, hash = location.hash) {
    const url = new URL(`${version === "legacy" ? "legacy/" : ""}${path || "index.html"}`, root);
    url.search = search; url.hash = hash;
    if (version === "modern" && (!path || path === "index.html") && hash && !["#catalog", "#connections", "#locations", "#glossary"].includes(hash)) url.hash = "catalog";
    return url;
  }
  if (valid(preferred) && preferred !== currentVersion && supported(pagePath)) {
    location.replace(destination(preferred));
    return;
  }
  // Keep normal links in the selected version, including fragment links in
  // legacy pages whose base points to the shared asset directory.
  document.addEventListener("click", (event) => {
    if (!isLegacy || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const a = event.target.closest?.("a[href]");
    if (!a || a.download || (a.target && a.target !== "_self")) return;
    const url = new URL(a.href, document.baseURI);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
    const path = url.pathname.slice(root.pathname.length);
    if (path.startsWith("legacy/") || !supported(path) || url.searchParams.get("version") === "modern") return;
    a.href = destination("legacy", path, url.search, url.hash).href;
  }, true);

  function mount() {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.dataset.versionSettingsTrigger = "";
    trigger.textContent = "Настройки";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-controls", "site-version-settings");
    const dialog = document.createElement("dialog");
    dialog.id = "site-version-settings";
    dialog.dataset.versionSettingsDialog = "";
    dialog.setAttribute("aria-labelledby", "site-version-settings-title");
    dialog.innerHTML = `<form method="dialog"><header><span>THE MIDGAS / НАСТРОЙКИ</span><button class="version-settings-close" aria-label="Закрыть настройки" value="cancel">×</button></header><h2 id="site-version-settings-title">Версия сайта</h2><p>Выберите удобное оформление. Можно вернуться к другой версии в любой момент.</p><fieldset><legend class="version-sr-only">Оформление сайта</legend><label><input type="radio" name="site-version" value="modern"><span><strong>Научный архив</strong><small>Светлый каталог, фильтры и цветные шкалы.</small></span></label><label><input type="radio" name="site-version" value="legacy"><span><strong>Старая версия</strong><small>Прежнее оформление, разделы и навигация.</small></span></label></fieldset><p class="version-settings-note">Выбор запоминается на этом устройстве.</p><footer><button type="submit" value="cancel">Отмена</button><button type="button" data-version-apply>Применить</button></footer></form>`;
    document.body.append(dialog);
    const header = document.querySelector(".archive-header");
    if (header && !isLegacy) { trigger.className = "version-settings-inline"; header.append(trigger); }
    else { trigger.className = "version-settings-floating"; document.body.append(trigger); }
    trigger.addEventListener("click", () => {
      dialog.querySelector(`input[value="${currentVersion}"]`).checked = true;
      dialog.showModal();
    });
    dialog.querySelector("[data-version-apply]").addEventListener("click", () => {
      const version = dialog.querySelector('input[name="site-version"]:checked')?.value;
      if (!valid(version)) return;
      save(version);
      if (version === currentVersion) { dialog.close(); return; }
      const url = destination(version); url.searchParams.set("version", version);
      location.assign(url);
    });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    if (isLegacy) {
      // Keep settings reachable even when the original login gate is shown.
      new MutationObserver(() => {
        const gate = document.querySelector("body > .site-access-gate");
        if (gate && (trigger.compareDocumentPosition(gate) & Node.DOCUMENT_POSITION_FOLLOWING)) document.body.append(trigger);
      }).observe(document.body, { childList: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
})();
