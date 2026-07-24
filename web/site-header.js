(() => {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const path = window.location.pathname.split("/").filter(Boolean).pop() || "index.html";
  const homeHref = path === "index.html" ? "#top" : "index.html";
  const links = [
    ["Клиенты", "registry.html?type=client", "registry.html", "client"],
    ["Аномалии", "registry.html?type=anomaly", "registry.html", "anomaly"],
    ["Инциденты", "registry.html?type=incident", "registry.html", "incident"],
    ["Связи", "board.html?board=open", "board.html"],
    ["Локации", "index.html#locations"],
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
      <a class="wordmark" href="${homeHref}" aria-label="THE MIDGAS — главная"><span><strong>THE MIDGAS</strong></span></a>
      <div class="nav-group nav-group-primary">${links.map(renderLink).join("")}<button class="header-search-trigger" type="button" data-global-search-open aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg><span>Поиск</span><kbd>⌘ K</kbd></button></div>
      <a class="header-account-link" href="account.html" aria-label="Открыть профиль"><b data-header-account-name>Профиль</b><span data-header-account-initial>•</span></a>
    </nav>
    <section class="global-search" data-global-search hidden role="dialog" aria-modal="true" aria-labelledby="global-search-title">
      <div class="global-search-panel">
        <header><span>MIDGAS / GLOBAL INDEX</span><h2 id="global-search-title">Поиск по всему архиву</h2><button type="button" data-global-search-close aria-label="Закрыть поиск">×</button></header>
        <label class="global-search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg><input type="search" data-global-search-input autocomplete="off" spellcheck="false" placeholder="Имя, номер, место, событие или текст досье" /><kbd>ESC</kbd></label>
        <div class="global-search-meta"><span data-global-search-status>Введите запрос</span><span>↑↓ ВЫБОР&nbsp;&nbsp; ENTER ОТКРЫТЬ</span></div>
        <div class="global-search-results" data-global-search-results></div>
      </div>
    </section>`;

  const searchRoot = header.querySelector("[data-global-search]");
  const searchInput = header.querySelector("[data-global-search-input]");
  const searchResults = header.querySelector("[data-global-search-results]");
  const searchStatus = header.querySelector("[data-global-search-status]");
  let searchDocuments = [];
  let activeResult = -1;
  let lastFocus = null;

  const normalize = (value) => String(value || "").toLocaleLowerCase("ru").replaceAll("ё", "е").normalize("NFKD").replace(/[^a-zа-я0-9]+/gi, " ").trim();
  const keyboardSwap = (value) => {
    const source = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
    const target = "йцукенгшщзхъфывапролджэячсмитьбюё";
    return [...String(value || "").toLocaleLowerCase()].map((char) => {
      const i = source.indexOf(char);
      return i < 0 ? char : target[i];
    }).join("");
  };
  const distance = (a, b, limit = 2) => {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i]; let minimum = current[0];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        minimum = Math.min(minimum, current[j]);
      }
      if (minimum > limit) return limit + 1;
      previous = current;
    }
    return previous[b.length];
  };
  const loadScript = (src) => new Promise((resolve, reject) => {
    if ([...document.scripts].some((script) => script.src.endsWith(src))) { resolve(); return; }
    const script = document.createElement("script"); script.src = src; script.onload = resolve; script.onerror = reject; document.head.append(script);
  });
  const ensureSearchData = async () => {
    if (!window.MIDGAS_RECORDS?.client || Object.keys(window.MIDGAS_RECORDS.client).length <= 10) {
      for (const src of ["data.js", "featured-data.js?v=8", "client-updates.js?v=8", "incident-updates.js?v=1", "site-completion.js?v=1", "latest-covers.js?v=1"]) await loadScript(src);
    }
    if (!window.MIDGAS_SUPABASE_DATA && window.supabase && window.MIDGAS_SUPABASE_CONFIG) await loadScript("supabase-data.js?v=14");
    await window.MIDGAS_SUPABASE_DATA?.ready?.catch?.(() => null);
  };
  const collectText = (value) => {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map(collectText).join(" ");
    if (value && typeof value === "object") return Object.values(value).map(collectText).join(" ");
    return "";
  };
  const buildSearchIndex = () => {
    const labels = { client: "КЛИЕНТ", anomaly: "АНОМАЛИЯ", incident: "ИНЦИДЕНТ" };
    const records = Object.entries(window.MIDGAS_RECORDS || {}).flatMap(([type, group]) => Object.values(group || {}).map((record) => ({
      title: record.name || record.id,
      eyebrow: `${labels[type] || type.toUpperCase()} / ${record.id}`,
      href: window.MIDGAS_RECORD_URL?.(type, record.id) || `record.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(record.id)}`,
      description: record.summary || record.alias || "Карточка архива MIDGAS",
      image: record.image || "",
      text: collectText(record),
    })));
    const pages = [
      ["Исторический архив", "РАЗДЕЛ", "Хронология, государства, войны и материалы прошлого", "historical-archive.html"],
      ["Карта локаций", "ИНСТРУМЕНТ", "Все отмеченные места и география наблюдений", "index.html#locations"],
      ["Медиафонд", "МАТЕРИАЛЫ", "Фотографии, полевые материалы и реконструкции", "index.html#company-files"],
      ["Доска связей", "ИНСТРУМЕНТ", "Связи клиентов, аномалий, инцидентов и локаций", "board.html?board=open"],
      ["Глоссарий", "СПРАВОЧНИК", "Термины, классификации и обозначения института", "index.html#glossary"],
    ].map(([title, eyebrow, description, href]) => ({ title, eyebrow, description, href, image: "", text: `${title} ${description}` }));
    searchDocuments = [...records, ...pages].map((doc) => ({ ...doc, normalized: normalize(`${doc.title} ${doc.eyebrow} ${doc.text}`), titleNormalized: normalize(doc.title) }));
  };
  const scoreDocument = (doc, phrase, tokens) => {
    let score = 0;
    if (doc.titleNormalized === phrase) score += 150;
    if (doc.titleNormalized.startsWith(phrase)) score += 70;
    if (doc.normalized.includes(phrase)) score += 45;
    const words = doc.normalized.split(" ");
    for (const token of tokens) {
      if (doc.titleNormalized.split(" ").includes(token)) score += 35;
      else if (doc.titleNormalized.includes(token)) score += 22;
      else if (words.includes(token)) score += 14;
      else if (doc.normalized.includes(token)) score += 7;
      else if (token.length >= 4 && words.some((word) => Math.abs(word.length - token.length) <= 2 && distance(word, token) <= 2)) score += 3;
      else return 0;
    }
    return score;
  };
  const renderSearch = () => {
    const raw = searchInput.value.trim();
    const variants = [...new Set([normalize(raw), normalize(keyboardSwap(raw))].filter(Boolean))];
    searchResults.replaceChildren(); activeResult = -1;
    if (!variants.length) { searchStatus.textContent = `${searchDocuments.length} ОБЪЕКТОВ В ИНДЕКСЕ`; return; }
    const ranked = searchDocuments.map((doc) => ({ doc, score: Math.max(...variants.map((phrase) => scoreDocument(doc, phrase, phrase.split(" ").filter(Boolean)))) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title, "ru")).slice(0, 12);
    searchStatus.textContent = ranked.length ? `НАЙДЕНО: ${ranked.length}` : "СОВПАДЕНИЙ НЕТ — ПРОВЕРЬТЕ ФОРМУЛИРОВКУ";
    ranked.forEach(({ doc }, index) => {
      const link = document.createElement("a"); link.className = "global-search-result"; link.href = doc.href; link.dataset.resultIndex = index;
      const image = document.createElement("span"); image.className = "global-search-result-image";
      if (doc.image) { const img = document.createElement("img"); img.src = doc.image; img.alt = ""; img.loading = "lazy"; image.append(img); } else image.textContent = String(index + 1).padStart(2, "0");
      const copy = document.createElement("span"); copy.className = "global-search-result-copy";
      const eyebrow = document.createElement("small"); eyebrow.textContent = doc.eyebrow;
      const title = document.createElement("strong"); title.textContent = doc.title;
      const description = document.createElement("p"); description.textContent = doc.description;
      const arrow = document.createElement("b"); arrow.textContent = "↗";
      copy.append(eyebrow, title, description); link.append(image, copy, arrow); searchResults.append(link);
    });
  };
  const openSearch = async () => {
    lastFocus = document.activeElement; searchRoot.hidden = false; document.body.classList.add("is-global-search-open");
    searchStatus.textContent = "СОБИРАЕМ ИНДЕКС…"; searchInput.focus();
    try { await ensureSearchData(); buildSearchIndex(); renderSearch(); } catch { searchStatus.textContent = "ИНДЕКС ВРЕМЕННО НЕДОСТУПЕН"; }
  };
  const closeSearch = () => { searchRoot.hidden = true; document.body.classList.remove("is-global-search-open"); lastFocus?.focus?.(); };
  header.querySelector("[data-global-search-open]")?.addEventListener("click", openSearch);
  header.querySelector("[data-global-search-close]")?.addEventListener("click", closeSearch);
  searchRoot?.addEventListener("click", (event) => { if (event.target === searchRoot) closeSearch(); });
  let searchTimer;
  searchInput?.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderSearch, 90); });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); searchRoot.hidden ? openSearch() : closeSearch(); return; }
    if (event.key === "/" && searchRoot.hidden && !/input|textarea|select/i.test(document.activeElement?.tagName || "")) { event.preventDefault(); openSearch(); return; }
    if (searchRoot.hidden) return;
    if (event.key === "Escape") { closeSearch(); return; }
    const results = [...searchResults.querySelectorAll("a")];
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && results.length) { event.preventDefault(); activeResult = (activeResult + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length; results[activeResult].focus(); }
    if (event.key === "Enter" && document.activeElement === searchInput && results[0]) { event.preventDefault(); results[0].click(); }
  });

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
