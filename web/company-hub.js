(() => {
  const hub = document.querySelector("#company-hub");
  if (!hub) return;

  const registry = window.MIDGAS_RECORDS || { client: {}, anomaly: {}, incident: {} };
  const types = ["client", "anomaly", "incident"];
  const typeNames = {
    client: ["КЛИЕНТ", "КЛИЕНТЫ"],
    anomaly: ["АНОМАЛИЯ", "АНОМАЛИИ"],
    incident: ["ИНЦИДЕНТ", "ИНЦИДЕНТЫ"],
  };

  const sessionApi = window.MIDGAS_EDITOR_SESSION;
  const accountForm = document.querySelector("#company-account-form");
  const loginDialog = document.querySelector("#editor-login-dialog");
  const loginOpen = document.querySelector("[data-editor-login-open]");
  const loginClose = document.querySelector("[data-editor-login-close]");
  const editorLocked = document.querySelector("[data-editor-locked]");
  const editorHome = document.querySelector("[data-editor-home]");
  const accountEmail = document.querySelector("[data-account-email]");
  const accountStatus = document.querySelector("[data-account-status]");
  const accountIndicator = document.querySelector("[data-account-indicator]");
  const accountLogout = document.querySelectorAll("[data-account-logout]");
  const accountSessionLabel = document.querySelector("[data-account-session-label]");
  const accountSessionCopy = document.querySelector("[data-account-session-copy]");
  const editorActions = document.querySelector("[data-editor-actions]");
  const authModeLabel = document.querySelector("[data-auth-mode-label]");
  const authTitle = document.querySelector("[data-auth-title]");
  const authCopy = document.querySelector("[data-auth-copy]");
  const authStatus = document.querySelector("[data-auth-status]");
  const authSubmit = document.querySelector("[data-auth-submit]");
  const authModeToggle = document.querySelector("[data-auth-mode-toggle]");
  const createOpen = document.querySelector("[data-editor-create-open]");
  const recoveryOpen = document.querySelector("[data-editor-recovery-open]");
  const createPanel = document.querySelector("[data-editor-create-panel]");
  const recoveryPanel = document.querySelector("[data-editor-recovery-panel]");
  const deletedList = document.querySelector("[data-restore-deleted-list]");
  const modifiedList = document.querySelector("[data-restore-modified-list]");
  const deletedEmpty = document.querySelector("[data-restore-deleted-empty]");
  const modifiedEmpty = document.querySelector("[data-restore-modified-empty]");
  let authMode = "sign-in";

  function setAuthMode(mode) {
    authMode = mode === "sign-up" ? "sign-up" : "sign-in";
    const registering = authMode === "sign-up";
    if (authModeLabel) authModeLabel.textContent = registering ? "РЕГИСТРАЦИЯ В SUPABASE" : "ЗАЩИЩЁННЫЙ ВХОД SUPABASE";
    if (authTitle) authTitle.textContent = registering ? "СОЗДАТЬ АККАУНТ" : "ВХОД В РЕДАКТОР";
    if (authCopy) {
      authCopy.textContent = registering
        ? "После регистрации подтвердите электронную почту. Новый аккаунт получит статус ожидания, а редактор откроется после одобрения владельцем MIDGAS."
        : "Введите электронную почту и пароль Supabase. Доступ к редактору откроется только для аккаунта с одобренной ролью editor или admin.";
    }
    if (authSubmit) authSubmit.textContent = registering ? "ЗАРЕГИСТРИРОВАТЬСЯ" : "ВОЙТИ";
    if (authModeToggle) authModeToggle.textContent = registering ? "УЖЕ ЕСТЬ АККАУНТ? ВОЙТИ" : "НЕТ АККАУНТА? ЗАРЕГИСТРИРОВАТЬСЯ";
    const password = accountForm?.elements.namedItem("password");
    if (password) password.autocomplete = registering ? "new-password" : "current-password";
    if (authStatus) authStatus.textContent = "";
  }

  function setAuthBusy(busy) {
    if (authSubmit) authSubmit.disabled = busy;
    if (authModeToggle) authModeToggle.disabled = busy;
    accountForm?.querySelectorAll("input").forEach((input) => { input.disabled = busy; });
  }

  function closeLoginDialog() {
    if (!loginDialog) return;
    if (typeof loginDialog.close === "function") loginDialog.close();
    else loginDialog.removeAttribute("open");
  }

  function openLoginDialog() {
    if (!loginDialog) return;
    if (authStatus) authStatus.textContent = "";
    if (typeof loginDialog.showModal === "function") loginDialog.showModal();
    else loginDialog.setAttribute("open", "");
    window.setTimeout(() => accountForm?.elements.namedItem("email")?.focus({ preventScroll: true }), 40);
  }

  function showEditorPanel(panel) {
    if (!sessionApi?.isEditor?.()) {
      openLoginDialog();
      return;
    }
    [createPanel, recoveryPanel].forEach((candidate) => {
      if (candidate) candidate.hidden = candidate !== panel;
    });
    if (panel === recoveryPanel) renderRecoveryLists();
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function makeRecoveryEntry(entry, actionLabel, action) {
    const article = document.createElement("article");
    article.className = "company-restore-entry";
    const meta = document.createElement("div");
    const code = document.createElement("span");
    const name = document.createElement("strong");
    const date = document.createElement("time");
    const timestamp = entry.deletedAt || entry.updatedAt || entry.createdAt;
    code.textContent = `${typeNames[entry.type]?.[0] || entry.type} / ${entry.id}`;
    name.textContent = entry.record?.name || entry.id;
    date.dateTime = timestamp || "";
    date.textContent = timestamp
      ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp))
      : "ДАТА НЕ УКАЗАНА";
    meta.append(code, name, date);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = actionLabel;
    button.addEventListener("click", async () => {
      try {
        button.disabled = true;
        const result = await action();
        if (accountStatus) accountStatus.textContent = `${entry.id}: ${result?.syncMessage || "ОПЕРАЦИЯ ВЫПОЛНЕНА."} ОБНОВЛЯЮ РЕЕСТР…`;
        window.setTimeout(() => {
          window.location.hash = "company-restore";
          window.location.reload();
        }, 280);
      } catch (error) {
        button.disabled = false;
        if (accountStatus) accountStatus.textContent = error.message || "НЕ УДАЛОСЬ ВОССТАНОВИТЬ ВЕРСИЮ.";
      }
    });
    article.append(meta, button);
    return article;
  }

  function renderRecoveryLists() {
    const deleted = window.MIDGAS_EDITOR_STORE?.listDeleted?.() || [];
    const modified = window.MIDGAS_EDITOR_STORE?.listModified?.() || [];
    deletedList?.querySelectorAll(".company-restore-entry").forEach((entry) => entry.remove());
    modifiedList?.querySelectorAll(".company-restore-entry").forEach((entry) => entry.remove());
    if (deletedEmpty) deletedEmpty.hidden = deleted.length > 0;
    if (modifiedEmpty) modifiedEmpty.hidden = modified.length > 0;
    deleted.forEach((entry) => {
      deletedList?.append(makeRecoveryEntry(entry, "ВОССТАНОВИТЬ", () => (
        window.MIDGAS_EDITOR_STORE.restore(entry.type, entry.id)
      )));
    });
    modified.forEach((entry) => {
      modifiedList?.append(makeRecoveryEntry(entry, "ВЕРНУТЬ ИСХОДНУЮ", () => (
        window.MIDGAS_EDITOR_STORE.resetToPublished(entry.type, entry.id)
      )));
    });
  }

  function renderAccount(session, message = "") {
    const signedIn = Boolean(session?.authenticated && session?.email);
    const isEditor = Boolean(sessionApi?.isEditor?.());
    if (editorLocked) editorLocked.hidden = signedIn;
    if (editorHome) editorHome.hidden = !signedIn;
    if (editorActions) editorActions.hidden = !isEditor;
    if (!isEditor) [createPanel, recoveryPanel].forEach((panel) => { if (panel) panel.hidden = true; });
    if (accountEmail) accountEmail.textContent = session?.email || "";
    if (accountSessionLabel) accountSessionLabel.textContent = isEditor ? "ВХОД ВЫПОЛНЕН" : "ЗАЯВКА ОЖИДАЕТ ОДОБРЕНИЯ";
    if (accountSessionCopy) {
      accountSessionCopy.textContent = isEditor
        ? "Редакционные операции разрешены вашей ролью Supabase."
        : "Вы вошли в аккаунт, но редактор откроется только после назначения роли editor или admin.";
    }
    if (accountIndicator) {
      accountIndicator.textContent = isEditor
        ? "ДОСТУП ОТКРЫТ"
        : (signedIn ? "ОЖИДАЕТ ОДОБРЕНИЯ" : "ДОСТУП ЗАКРЫТ");
    }
    if (accountStatus) {
      accountStatus.textContent = message || (session?.membershipError
        ? `ВХОД ВЫПОЛНЕН, НО РОЛЬ НЕ ПРОВЕРЕНА: ${session.membershipError}`
        : (isEditor
          ? "ВХОД ВЫПОЛНЕН. ВЫБЕРИТЕ НУЖНОЕ ДЕЙСТВИЕ."
          : (signedIn
            ? "АККАУНТ ПОДТВЕРЖДЁН. ОЖИДАЙТЕ ОДОБРЕНИЯ РЕДАКЦИОННОГО ДОСТУПА."
            : "ВОЙДИТЕ ИЛИ СОЗДАЙТЕ АККАУНТ SUPABASE.")));
    }
    if (isEditor) renderRecoveryLists();
  }

  renderAccount(sessionApi?.read?.() || null, "ПРОВЕРЯЕМ СОХРАНЁННЫЙ СЕАНС SUPABASE…");
  sessionApi?.ready?.then((session) => renderAccount(session || null));
  setAuthMode("sign-in");

  accountForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!accountForm.reportValidity()) return;
    const values = new FormData(accountForm);
    setAuthBusy(true);
    if (authStatus) authStatus.textContent = authMode === "sign-up" ? "СОЗДАЁМ АККАУНТ…" : "ПРОВЕРЯЕМ ДАННЫЕ…";
    try {
      const credentials = { email: values.get("email"), password: values.get("password") };
      if (authMode === "sign-up") {
        const result = await sessionApi?.signUp?.(credentials);
        if (!result) throw new Error("Модуль регистрации Supabase недоступен.");
        if (result.confirmationRequired) {
          accountForm.elements.namedItem("password").value = "";
          setAuthMode("sign-in");
          if (authStatus) authStatus.textContent = "АККАУНТ СОЗДАН. ПОДТВЕРДИТЕ ПОЧТУ ПО ССЫЛКЕ ИЗ ПИСЬМА, ЗАТЕМ ВОЙДИТЕ.";
          if (accountStatus) accountStatus.textContent = "РЕГИСТРАЦИЯ ВЫПОЛНЕНА. ОТПРАВЛЕНО ПИСЬМО ДЛЯ ПОДТВЕРЖДЕНИЯ.";
          return;
        }
        accountForm.reset();
        closeLoginDialog();
        renderAccount(result.session, result.session?.membershipError
          ? ""
          : "АККАУНТ СОЗДАН. РЕДАКЦИОННЫЙ ДОСТУП ОЖИДАЕТ ОДОБРЕНИЯ.");
        return;
      }

      const session = await sessionApi?.signIn?.(credentials);
      if (!session) throw new Error("Модуль редакционного доступа недоступен.");
      accountForm.reset();
      closeLoginDialog();
      renderAccount(session, session.membershipError
        ? ""
        : (sessionApi.isEditor()
          ? "ВХОД ВЫПОЛНЕН. РЕЖИМ РЕДАКТОРА РАЗБЛОКИРОВАН."
          : "ВХОД ВЫПОЛНЕН. РЕДАКЦИОННЫЙ ДОСТУП ОЖИДАЕТ ОДОБРЕНИЯ."));
    } catch (error) {
      const message = error.message || "НЕ УДАЛОСЬ ОТКРЫТЬ РЕДАКЦИОННЫЙ СЕАНС.";
      if (authStatus) authStatus.textContent = message;
      if (accountStatus) accountStatus.textContent = message;
    } finally {
      setAuthBusy(false);
    }
  });

  loginOpen?.addEventListener("click", openLoginDialog);
  loginClose?.addEventListener("click", closeLoginDialog);
  authModeToggle?.addEventListener("click", () => setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in"));
  loginDialog?.addEventListener("click", (event) => { if (event.target === loginDialog) closeLoginDialog(); });
  createOpen?.addEventListener("click", () => {
    resetCreateWizard();
    showEditorPanel(createPanel);
  });
  recoveryOpen?.addEventListener("click", () => showEditorPanel(recoveryPanel));
  document.querySelectorAll("[data-editor-panel-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.closest("[data-editor-create-panel], [data-editor-recovery-panel]");
      if (panel) panel.hidden = true;
      document.querySelector("#company-account")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  accountLogout.forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await sessionApi?.signOut?.();
      renderAccount(null, "СЕАНС ЗАКРЫТ. РЕДАКЦИОННЫЕ ИНСТРУМЕНТЫ СКРЫТЫ.");
      document.querySelector("#company-account")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      if (accountStatus) accountStatus.textContent = error.message || "НЕ УДАЛОСЬ ЗАКРЫТЬ СЕАНС.";
    } finally {
      button.disabled = false;
    }
  }));

  window.addEventListener(sessionApi?.eventName || "midgas:editor-session", (event) => {
    renderAccount(event.detail?.session || null);
  });

  window.addEventListener("midgas:record-mutated", renderRecoveryLists);

  sessionApi?.ready?.then(() => {
    if (window.location.hash === "#company-editor" && !sessionApi?.isEditor?.()) {
      window.history.replaceState(null, "", "#company-account");
    }
  });

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }

  function fnv1a(input) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }

  function registrySnapshot() {
    const records = Object.fromEntries(types.map((type) => [type, Object.values(registry[type] || {})]));
    const counts = Object.fromEntries(types.map((type) => [type, records[type].length]));
    return {
      records,
      counts,
      total: types.reduce((sum, type) => sum + counts[type], 0),
      signature: `REV-${fnv1a(JSON.stringify(stableValue(registry)))}`,
    };
  }

  function updateRegistryMetadata() {
    const snapshot = registrySnapshot();
    document.querySelectorAll("[data-company-record-count]").forEach((element) => {
      element.textContent = String(snapshot.total).padStart(2, "0");
    });
    document.querySelectorAll("[data-company-revision], [data-footer-revision]").forEach((element) => {
      element.textContent = snapshot.signature;
    });
  }

  updateRegistryMetadata();

  const journalList = document.querySelector("#company-journal-list");
  const journalDateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Vladivostok",
  });
  const journalKeyFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Vladivostok",
  });

  function recordLink(type, record) {
    return `record.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(record.id)}`;
  }

  function journalDateKey(value) {
    const [day, month, year] = journalKeyFormatter.format(new Date(value)).split("/");
    return `${year}-${month}-${day}`;
  }

  function plural(value, forms) {
    const number = Math.abs(value) % 100;
    const last = number % 10;
    if (number > 10 && number < 20) return forms[2];
    if (last === 1) return forms[0];
    if (last > 1 && last < 5) return forms[1];
    return forms[2];
  }

  function journalTimeline() {
    const { records } = registrySnapshot();
    const builtIn = Object.fromEntries(types.map((type) => [
      type,
      records[type]
        .filter((record) => !record.editorCreatedAt)
        .sort((left, right) => String(left.id).localeCompare(String(right.id), "ru")),
    ]));
    const days = new Map();

    function addDay(date, entries) {
      if (!days.has(date)) days.set(date, { date, records: { client: [], anomaly: [], incident: [] }, events: [] });
      types.forEach((type) => days.get(date).records[type].push(...(entries[type] || [])));
    }

    function addEvent(event) {
      const date = journalDateKey(event.at);
      if (!days.has(date)) days.set(date, { date, records: { client: [], anomaly: [], incident: [] }, events: [] });
      days.get(date).events.push(event);
    }

    addDay("2026-07-03", { client: builtIn.client.slice(0, 5) });
    addDay("2026-07-05", { client: builtIn.client.slice(5, 11), anomaly: builtIn.anomaly.slice(0, 1) });
    addDay("2026-07-08", { client: builtIn.client.slice(11, 16) });
    addDay("2026-07-10", { client: builtIn.client.slice(16, 21), incident: builtIn.incident.slice(0, 1) });
    addDay("2026-07-12", {
      client: builtIn.client.slice(21),
      anomaly: builtIn.anomaly.slice(1),
      incident: builtIn.incident.slice(1),
    });

    types.forEach((type) => {
      records[type].filter((record) => record.editorCreatedAt).forEach((record) => {
        addDay(journalDateKey(record.editorCreatedAt), { [type]: [record] });
      });
    });

    (window.MIDGAS_EDITOR_STORE?.audit?.() || [])
      .filter((event) => ["update", "delete", "restore"].includes(event.action) && event.at)
      .forEach(addEvent);

    return [...days.values()]
      .filter((day) => day.events.length || types.some((type) => day.records[type].length))
      .sort((left, right) => right.date.localeCompare(left.date));
  }

  function createJournalDay(day, revisionNumber) {
    const counts = Object.fromEntries(types.map((type) => [type, day.records[type].length]));
    const details = document.createElement("details");
    details.className = "company-journal-day";

    const summary = document.createElement("summary");
    const date = document.createElement("span");
    date.className = "company-journal-date";
    const dateValue = new Date(`${day.date}T12:00:00+10:00`);
    date.innerHTML = `<strong>РЕВИЗИЯ ${String(revisionNumber).padStart(2, "0")}</strong><time datetime="${day.date}">${journalDateFormatter.format(dateValue)}</time>`;
    const title = document.createElement("h4");
    const changes = [
      counts.client ? `${counts.client} ${plural(counts.client, ["клиент", "клиента", "клиентов"])}` : "",
      counts.incident ? `${counts.incident} ${plural(counts.incident, ["инцидент", "инцидента", "инцидентов"])}` : "",
      counts.anomaly ? `${counts.anomaly} ${plural(counts.anomaly, ["аномалия", "аномалии", "аномалий"])}` : "",
    ].filter(Boolean);
    const eventCounts = (day.events || []).reduce((result, event) => {
      result[event.action] = (result[event.action] || 0) + 1;
      return result;
    }, {});
    const statements = [];
    if (changes.length) statements.push(`Добавлено ${changes.join(", ")}`);
    if (eventCounts.update) statements.push(`обновлено ${eventCounts.update}`);
    if (eventCounts.delete) statements.push(`скрыто ${eventCounts.delete}`);
    if (eventCounts.restore) statements.push(`восстановлено ${eventCounts.restore}`);
    if (eventCounts.reset) statements.push(`возвращено к исходной версии ${eventCounts.reset}`);
    const todayPrefix = day.date === journalDateKey(new Date()) ? "Сегодня: " : "";
    title.textContent = `${todayPrefix}${statements.join("; ")}.`;
    const action = document.createElement("span");
    action.className = "company-journal-action";
    action.innerHTML = `<span>ПОДРОБНЕЕ</span><i aria-hidden="true"></i>`;
    summary.append(date, title, action);

    const content = document.createElement("div");
    content.className = "company-journal-details";
    types.forEach((type) => {
      if (!day.records[type].length) return;
      const group = document.createElement("section");
      const heading = document.createElement("h5");
      heading.textContent = `${typeNames[type][1]} / ${String(day.records[type].length).padStart(2, "0")}`;
      const list = document.createElement("ul");
      day.records[type]
        .slice()
        .sort((left, right) => String(left.id).localeCompare(String(right.id), "ru"))
        .forEach((record) => {
          const item = document.createElement("li");
          const link = document.createElement("a");
          const code = document.createElement("span");
          const name = document.createElement("strong");
          link.href = recordLink(type, record);
          code.textContent = record.id;
          name.textContent = record.name || record.alias || "БЕЗ НАЗВАНИЯ";
          link.append(code, name);
          item.append(link);
          list.append(item);
        });
      group.append(heading, list);
      content.append(group);
    });

    if (day.events?.length) {
      const eventLabels = { update: "ОБНОВЛЕНО", delete: "СКРЫТО", restore: "ВОССТАНОВЛЕНО", reset: "ИСХОДНАЯ ВЕРСИЯ" };
      const group = document.createElement("section");
      group.className = "company-journal-events";
      const heading = document.createElement("h5");
      heading.textContent = `РЕДАКЦИОННЫЕ ОПЕРАЦИИ / ${String(day.events.length).padStart(2, "0")}`;
      const list = document.createElement("ul");
      day.events.slice().sort((left, right) => String(right.at).localeCompare(String(left.at))).forEach((event) => {
        const item = document.createElement("li");
        const targetExists = Boolean(registry[event.type]?.[event.id]);
        const wrapper = targetExists ? document.createElement("a") : document.createElement("div");
        if (targetExists) wrapper.href = recordLink(event.type, { id: event.id });
        const code = document.createElement("span");
        const name = document.createElement("strong");
        code.textContent = `${eventLabels[event.action] || event.action.toUpperCase()} / ${event.id}`;
        name.textContent = event.name || event.id;
        wrapper.append(code, name);
        item.append(wrapper);
        list.append(item);
      });
      group.append(heading, list);
      content.append(group);
    }

    details.addEventListener("toggle", () => {
      action.querySelector("span").textContent = details.open ? "СКРЫТЬ" : "ПОДРОБНЕЕ";
    });
    details.append(summary, content);
    return details;
  }

  function renderJournal() {
    if (!journalList) return;
    const timeline = journalTimeline();
    journalList.replaceChildren(...timeline.map((day, index) => createJournalDay(day, timeline.length - index)));
  }

  renderJournal();

  const quotes = [
    ["Архив начинается в тот момент, когда свидетельство перестаёт быть одиночным.", "РЕДАКЦИОННЫЙ ПРОТОКОЛ / ЗАПИСЬ 01"],
    ["Если два источника спорят, мы сохраняем оба. Иногда противоречие точнее любого вывода.", "ЖУРНАЛ СВЕРКИ / ЗАПИСЬ 07"],
    ["На местности важен не самый громкий сигнал, а тот, который возвращается в той же точке.", "ПОЛЕВОЙ БЛОКНОТ / СЕКТОР ВИТЯЗЬ"],
    ["Закрыть досье можно только тогда, когда исчезли не вопросы, а сам наблюдаемый процесс.", "ПРОТОКОЛ НАБЛЮДЕНИЯ / ПУНКТ 12"],
  ];
  let quoteIndex = 0;
  const quoteText = document.querySelector("[data-quote-text]");
  const quoteSource = document.querySelector("[data-quote-source]");
  const quoteCounter = document.querySelector("[data-quote-index]");
  const quoteFrame = quoteText?.closest("blockquote");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let quoteAnimation = null;

  function renderQuote(index) {
    if (quoteText) quoteText.textContent = quotes[index][0];
    if (quoteSource) quoteSource.textContent = quotes[index][1];
    if (quoteCounter) quoteCounter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(quotes.length).padStart(2, "0")}`;
  }

  async function showQuote(nextIndex) {
    const targetIndex = (nextIndex + quotes.length) % quotes.length;
    quoteIndex = targetIndex;
    quoteAnimation?.cancel();

    if (reducedMotion || !quoteFrame?.animate) {
      renderQuote(targetIndex);
      quoteAnimation = null;
      return;
    }

    const outgoing = quoteFrame.animate(
      [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-12px)" }],
      { duration: 140, easing: "ease-in", fill: "forwards" },
    );
    quoteAnimation = outgoing;

    try {
      await outgoing.finished;
    } catch {
      return;
    }
    if (quoteAnimation !== outgoing) return;

    renderQuote(targetIndex);
    const incoming = quoteFrame.animate(
      [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" },
    );
    quoteAnimation = incoming;
    outgoing.cancel();

    try {
      await incoming.finished;
    } catch {
      return;
    }
    if (quoteAnimation === incoming) {
      incoming.cancel();
      quoteAnimation = null;
    }
  }

  document.querySelector("[data-quote-prev]")?.addEventListener("click", () => showQuote(quoteIndex - 1));
  document.querySelector("[data-quote-next]")?.addEventListener("click", () => showQuote(quoteIndex + 1));

  // The full pannable investigation map is initialized by investigation-board.js.

  const editorForm = document.querySelector("#company-editor-form");
  const editorFile = editorForm?.elements.namedItem("image");
  const editorPreview = document.querySelector("[data-editor-preview]");
  const editorUploadCopy = document.querySelector("[data-editor-upload-copy]");
  const editorClientAccessField = document.querySelector("[data-client-access-field]");
  const editorSubmit = document.querySelector("[data-editor-submit]");
  const editorResult = document.querySelector("[data-editor-result]");
  const editorError = document.querySelector("[data-editor-error]");
  const editorRelationsToggle = document.querySelector("[data-editor-relations-toggle]");
  const editorRelationsPanel = document.querySelector("[data-editor-relations-panel]");
  const editorRelationsList = document.querySelector("[data-editor-relations-list]");
  const editorRelationsSearch = document.querySelector("[data-editor-relations-search]");
  const editorRelationsCount = document.querySelector("[data-editor-relations-count]");
  const editorRelationsClear = document.querySelector("[data-editor-relations-clear]");
  const editorFieldsSteps = [...document.querySelectorAll('[data-create-step="fields"]')];
  const editorRelationsSteps = [...document.querySelectorAll('[data-create-step="relations"]')];
  const editorCreateNext = document.querySelector("[data-create-next]");
  let preparedImage = "";
  let preparedFile = "";
  let imagePreparing = false;

  function setCreateStage(stage) {
    editorFieldsSteps.forEach((element) => { element.hidden = stage === "type"; });
    editorRelationsSteps.forEach((element) => { element.hidden = stage !== "relations"; });
  }

  function resetCreateWizard() {
    if (!editorForm) return;
    editorForm.reset();
    preparedImage = "";
    preparedFile = "";
    imagePreparing = false;
    if (editorClientAccessField) editorClientAccessField.hidden = true;
    const accessSelect = editorClientAccessField?.querySelector("select");
    if (accessSelect) accessSelect.disabled = true;
    if (editorPreview) {
      editorPreview.src = "";
      editorPreview.hidden = true;
    }
    if (editorUploadCopy) editorUploadCopy.hidden = false;
    if (editorRelationsPanel) editorRelationsPanel.hidden = true;
    editorRelationsToggle?.setAttribute("aria-expanded", "false");
    editorRelationsList?.querySelectorAll('input[type="checkbox"]:checked').forEach((input) => { input.checked = false; });
    if (editorRelationsSearch) editorRelationsSearch.value = "";
    editorRelationsList?.querySelectorAll(".company-editor-relation-option").forEach((option) => { option.hidden = false; });
    if (editorResult) editorResult.hidden = true;
    if (editorSubmit) {
      editorSubmit.disabled = false;
      editorSubmit.textContent = "ОПУБЛИКОВАТЬ";
    }
    clearEditorError();
    updateRelationsCount();
    setCreateStage("type");
  }

  function updateRelationsCount() {
    if (!editorRelationsCount || !editorRelationsList) return;
    const selected = editorRelationsList.querySelectorAll('input[type="checkbox"]:checked').length;
    editorRelationsCount.textContent = `ВЫБРАНО: ${selected}`;
    editorRelationsToggle?.classList.toggle("has-selection", selected > 0);
    if (selected > 0 && editorRelationsToggle) editorRelationsToggle.textContent = `СВЯЗИ: ${selected}`;
    if (selected === 0 && editorRelationsToggle) editorRelationsToggle.textContent = "+ ДОБАВИТЬ СВЯЗИ";
  }

  function buildRelationsList() {
    if (!editorRelationsList) return;
    const relationRecords = registrySnapshot().records;
    types.forEach((type) => {
      relationRecords[type]
        .slice()
        .sort((left, right) => String(left.id).localeCompare(String(right.id), "ru"))
        .forEach((record) => {
          const label = document.createElement("label");
          label.className = "company-editor-relation-option";
          label.dataset.search = `${record.id} ${record.name || ""} ${record.alias || ""} ${typeNames[type][0]}`.toLocaleLowerCase("ru");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.dataset.relationType = type;
          input.dataset.relationId = record.id;
          input.dataset.relationLabel = record.name || record.alias || record.id;
          const copy = document.createElement("span");
          const meta = document.createElement("small");
          const name = document.createElement("strong");
          meta.textContent = `${typeNames[type][0]} / ${record.id}`;
          name.textContent = record.name || record.alias || "БЕЗ НАЗВАНИЯ";
          copy.append(meta, name);
          label.append(input, copy);
          editorRelationsList.append(label);
        });
    });
    editorRelationsList.addEventListener("change", updateRelationsCount);
    updateRelationsCount();
  }

  buildRelationsList();

  editorRelationsToggle?.addEventListener("click", () => {
    if (!editorRelationsPanel) return;
    const opening = editorRelationsPanel.hidden;
    editorRelationsPanel.hidden = !opening;
    editorRelationsToggle.setAttribute("aria-expanded", String(opening));
    if (opening) editorRelationsSearch?.focus({ preventScroll: true });
  });

  editorRelationsSearch?.addEventListener("input", () => {
    const query = editorRelationsSearch.value.trim().toLocaleLowerCase("ru");
    editorRelationsList?.querySelectorAll(".company-editor-relation-option").forEach((option) => {
      option.hidden = Boolean(query) && !option.dataset.search.includes(query);
    });
  });

  editorRelationsClear?.addEventListener("click", () => {
    editorRelationsList?.querySelectorAll('input[type="checkbox"]:checked').forEach((input) => { input.checked = false; });
    updateRelationsCount();
  });

  function canvasBlob(canvas, mimeType, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
  }

  function blobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать подготовленное изображение."));
      reader.readAsDataURL(blob);
    });
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Файл не удалось распознать как изображение."));
      image.src = url;
    });
  }

  async function prepareEditorImage(file) {
    if (!file?.type?.startsWith("image/")) throw new Error("Выберите изображение JPG, PNG или WEBP.");
    if (file.size > 15 * 1024 * 1024) throw new Error("Файл больше 15 МБ. Выберите изображение меньшего размера.");

    const sourceUrl = URL.createObjectURL(file);
    try {
      const source = await loadImage(sourceUrl);
      const maximumSide = 1200;
      const scale = Math.min(1, maximumSide / Math.max(source.naturalWidth, source.naturalHeight));
      let width = Math.max(1, Math.round(source.naturalWidth * scale));
      let height = Math.max(1, Math.round(source.naturalHeight * scale));
      let canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d", { alpha: false }).drawImage(source, 0, 0, width, height);

      let quality = 0.82;
      let blob = await canvasBlob(canvas, "image/webp", quality);
      for (let attempt = 0; blob && blob.size > 560 * 1024 && attempt < 6; attempt += 1) {
        quality = Math.max(0.52, quality - 0.09);
        width = Math.max(420, Math.round(width * 0.86));
        height = Math.max(280, Math.round(height * 0.86));
        const resized = document.createElement("canvas");
        resized.width = width;
        resized.height = height;
        resized.getContext("2d", { alpha: false }).drawImage(canvas, 0, 0, width, height);
        canvas = resized;
        blob = await canvasBlob(canvas, "image/webp", quality);
      }
      if (!blob) blob = await canvasBlob(canvas, "image/jpeg", 0.76);
      if (!blob) throw new Error("Браузер не смог подготовить изображение.");
      return blobDataUrl(blob);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  function showEditorError(message) {
    if (!editorError) return;
    editorError.textContent = message;
    editorError.hidden = false;
  }

  function clearEditorError() {
    if (!editorError) return;
    editorError.textContent = "";
    editorError.hidden = true;
  }

  editorForm?.querySelectorAll('input[name="type"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      const isClient = input.value === "client";
      if (editorClientAccessField) editorClientAccessField.hidden = !isClient;
      const accessSelect = editorClientAccessField?.querySelector("select");
      if (accessSelect) accessSelect.disabled = !isClient;
      setCreateStage("fields");
    });
  });

  editorCreateNext?.addEventListener("click", () => {
    clearEditorError();
    const required = editorFieldsSteps.flatMap((element) => [...element.querySelectorAll("input[required], select[required], textarea[required]")]);
    const invalid = required.find((control) => !control.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    if (imagePreparing) {
      showEditorError("Дождитесь завершения оптимизации изображения.");
      return;
    }
    if (!preparedImage) {
      showEditorError("Загрузите обложку карточки.");
      return;
    }
    setCreateStage("relations");
  });

  editorFile?.addEventListener("change", async () => {
    preparedImage = "";
    preparedFile = "";
    clearEditorError();
    const file = editorFile.files?.[0];
    if (!file) {
      if (editorPreview) editorPreview.hidden = true;
      if (editorUploadCopy) editorUploadCopy.hidden = false;
      return;
    }
    imagePreparing = true;
    if (editorSubmit) editorSubmit.disabled = true;
    try {
      preparedImage = await prepareEditorImage(file);
      preparedFile = file.name;
      if (editorPreview) {
        editorPreview.src = preparedImage;
        editorPreview.hidden = false;
      }
      if (editorUploadCopy) editorUploadCopy.hidden = true;
      if (accountStatus) accountStatus.textContent = `ОБЛОЖКА ОПТИМИЗИРОВАНА ДО ~${Math.round(preparedImage.length * 0.75 / 1024)} КБ.`;
    } catch (error) {
      editorFile.value = "";
      showEditorError(error.message || "Не удалось подготовить изображение.");
    } finally {
      imagePreparing = false;
      if (editorSubmit) editorSubmit.disabled = false;
    }
  });

  editorForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearEditorError();
    if (!editorForm.reportValidity()) return;
    const file = editorFile?.files?.[0];
    if (!file) {
      showEditorError("Загрузите обложку карточки.");
      return;
    }
    if (editorSubmit) {
      editorSubmit.disabled = true;
      editorSubmit.textContent = "ПОДГОТОВКА…";
    }

    try {
      if (!preparedImage || preparedFile !== file.name) preparedImage = await prepareEditorImage(file);
      const formData = new FormData(editorForm);
      const relations = [...(editorRelationsList?.querySelectorAll('input[type="checkbox"]:checked') || [])].map((input) => ({
        type: input.dataset.relationType,
        id: input.dataset.relationId,
        label: input.dataset.relationLabel,
      }));
      const created = await window.MIDGAS_EDITOR_STORE?.create({
        type: formData.get("type"),
        name: formData.get("name"),
        alias: formData.get("alias"),
        threat: formData.get("threat"),
        access: formData.get("access"),
        location: formData.get("location"),
        summary: formData.get("summary"),
        description: formData.get("description"),
        image: preparedImage,
        relations,
      });
      if (!created) throw new Error("Модуль локального сохранения недоступен.");

      const recordUrl = `record.html?type=${encodeURIComponent(created.type)}&id=${encodeURIComponent(created.record.id)}`;
      const registryUrl = `registry.html?type=${encodeURIComponent(created.type)}`;
      const createdId = document.querySelector("[data-editor-created-id]");
      const status = document.querySelector("[data-editor-status]");
      const openLink = document.querySelector("[data-editor-open]");
      const registryLink = document.querySelector("[data-editor-registry]");
      if (createdId) createdId.textContent = created.record.id;
      if (status) status.textContent = `«${created.record.name}» опубликована. Связей: ${relations.length}. ${created.syncMessage || ""}`.trim();
      if (openLink) openLink.href = recordUrl;
      if (registryLink) registryLink.href = registryUrl;
      if (editorResult) {
        editorResult.hidden = false;
        editorResult.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
      }
      if (editorSubmit) editorSubmit.textContent = "ОПУБЛИКОВАНО";
    } catch (error) {
      showEditorError(error.message || "Не удалось создать карточку.");
      if (editorSubmit) editorSubmit.textContent = "ОПУБЛИКОВАТЬ";
    } finally {
      if (editorSubmit) editorSubmit.disabled = false;
    }
  });

  window.addEventListener("midgas:record-created", () => {
    updateRegistryMetadata();
    renderJournal();
  });

  const revealElements = [...document.querySelectorAll(".company-reveal")];
  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealElements.forEach((element) => element.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
    revealElements.forEach((element) => revealObserver.observe(element));
  }

  const parallaxElements = [...document.querySelectorAll("[data-company-parallax]")];
  const saveData = Boolean(navigator.connection?.saveData);
  let parallaxFrame = 0;

  function updateParallax() {
    parallaxFrame = 0;
    const viewportHeight = window.innerHeight;
    const mobileFactor = window.innerWidth <= 760 ? 0.45 : 1;
    parallaxElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.bottom < -100 || rect.top > viewportHeight + 100) return;
      const centerOffset = rect.top + rect.height / 2 - viewportHeight / 2;
      const speed = Number(element.dataset.companyParallax || 0);
      const value = Math.max(-90, Math.min(90, centerOffset * speed * mobileFactor));
      element.style.setProperty("--company-parallax-y", `${value.toFixed(2)}px`);
    });
  }

  function requestParallax() {
    if (!parallaxFrame) parallaxFrame = window.requestAnimationFrame(updateParallax);
  }

  if (!reducedMotion && !saveData && parallaxElements.length) {
    updateParallax();
    window.addEventListener("scroll", requestParallax, { passive: true });
    window.addEventListener("resize", requestParallax);
  }
})();
