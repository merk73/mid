(() => {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const path = window.location.pathname.split("/").pop() || "index.html";
  const homeHref = path === "index.html" ? "#top" : "index.html";
  const links = [
    ["Клиенты", "registry.html?type=client", "registry.html", "client"],
    ["Аномалии", "registry.html?type=anomaly", "registry.html", "anomaly"],
    ["Инциденты", "registry.html?type=incident", "registry.html", "incident"],
    ["Архив", "historical-archive.html", "historical-archive.html"],
    ["Локации", "index.html#locations"],
    ["Материалы", "index.html#company-materials"],
    ["Связи", "board.html?board=open", "board.html"],
  ];
  const params = new URLSearchParams(window.location.search);
  const isHome = path === "index.html";
  const renderLink = ([label, href, activePath, activeType]) => {
    const active = activePath === path && (!activeType || params.get("type") === activeType);
    return `<a href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
  };

  header.className = `site-header unified-site-header${isHome ? "" : " has-back"}`;
  header.innerHTML = `
    ${isHome ? "" : '<button class="header-back-button" type="button" aria-label="Вернуться назад" data-fallback="index.html">←</button>'}
    <button class="menu-toggle" type="button" aria-label="Открыть меню" aria-expanded="false" aria-controls="main-navigation">
      <span class="menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>
    </button>
    <a class="mobile-wordmark" href="${homeHref}" aria-label="THE MIDGAS — главная">THE MIDGAS</a>
    <a class="header-account-avatar" href="account.html" aria-label="Открыть аккаунт"><span data-header-account-initial>•</span></a>
    <nav class="main-navigation" id="main-navigation" aria-label="Главная навигация">
      <a class="wordmark" href="${homeHref}" aria-label="THE MIDGAS — главная"><strong>THE MIDGAS</strong><small>RESEARCH ARCHIVE / 2026</small></a>
      <div class="nav-group nav-group-primary">${links.map(renderLink).join("")}</div>
      <a class="header-account-link" href="account.html" aria-label="Открыть профиль"><span data-header-account-initial>•</span><b><small>АККАУНТ</small><em data-header-account-name>Профиль</em></b></a>
    </nav>`;

  const initials = [...header.querySelectorAll("[data-header-account-initial]")];
  const profileName = header.querySelector("[data-header-account-name]");
  const updateAccount = (account) => {
    const login = String(account?.login || "").trim();
    const displayName = String(account?.displayName || login || "Профиль").trim();
    initials.forEach((initial) => { initial.textContent = login ? login.charAt(0).toUpperCase() : "•"; });
    if (profileName) profileName.textContent = displayName;
    const avatar = header.querySelector(".header-account-avatar");
    if (avatar && login) avatar.setAttribute("aria-label", `Аккаунт ${login}`);
    const profile = header.querySelector(".header-account-link");
    if (profile && login) profile.setAttribute("aria-label", `Профиль ${displayName}`);
  };
  window.addEventListener("midgas:account-access-granted", (event) => updateAccount(event.detail?.account));
  window.addEventListener("midgas:account-session", (event) => updateAccount(event.detail?.account));
  window.MIDGAS_ACCOUNT_SESSION?.ready?.then(updateAccount);
})();
