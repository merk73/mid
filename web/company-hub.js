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
  const siteGate = window.MIDGAS_SITE_GATE;
  const accountForm = document.querySelector("#company-account-form");
  const loginDialog = document.querySelector("#editor-login-dialog");
  const loginOpen = document.querySelector("[data-editor-login-open]");
  const loginClose = document.querySelector("[data-editor-login-close]");
  const passwordDialog = document.querySelector("#editor-password-dialog");
  const passwordForm = document.querySelector("#editor-password-form");
  const passwordOpen = document.querySelector("[data-editor-password-open]");
  const passwordClose = document.querySelector("[data-editor-password-close]");
  const passwordStatus = document.querySelector("[data-password-status]");
  const passwordSubmit = document.querySelector("[data-password-submit]");
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
  const createOpen = document.querySelector("[data-editor-create-open]");
  const recoveryOpen = document.querySelector("[data-editor-recovery-open]");
  const createPanel = document.querySelector("[data-editor-create-panel]");
  const recoveryPanel = document.querySelector("[data-editor-recovery-panel]");
  const deletedList = document.querySelector("[data-restore-deleted-list]");
  const modifiedList = document.querySelector("[data-restore-modified-list]");
  const deletedEmpty = document.querySelector("[data-restore-deleted-empty]");
  const modifiedEmpty = document.querySelector("[data-restore-modified-empty]");
  const maintenanceToggle = document.querySelector("[data-maintenance-toggle]");
  const maintenanceStatus = document.querySelector("[data-maintenance-status]");
  let maintenanceState = siteGate?.getState?.() || {};

  function renderMaintenanceControls(nextState = {}) {
    maintenanceState = { ...maintenanceState, ...nextState };
    const isOwner = Boolean(maintenanceState.owner);
    if (maintenanceToggle) {
      maintenanceToggle.hidden = !isOwner;
      const title = maintenanceToggle.querySelector("strong");
      const copy = maintenanceToggle.querySelector("small");
      if (title) title.textContent = maintenanceState.enabled ? "ОТКРЫТЬ САЙТ" : "ЗАКРЫТЬ САЙТ";
      if (copy) copy.textContent = maintenanceState.enabled
        ? "Вернуть публичный доступ для всех посетителей"
        : "Оставить доступ только подтверждённым редакторам";
    }
    if (maintenanceStatus) {
      maintenanceStatus.hidden = !isOwner;
      maintenanceStatus.textContent = maintenanceState.enabled
        ? "САЙТ ЗАКРЫТ. ПОДТВЕРЖДЁННЫЕ РЕДАКТОРЫ СОХРАНЯЮТ ДОСТУП."
        : "САЙТ ОТКРЫТ ДЛЯ ВСЕХ ПОСЕТИТЕЛЕЙ.";
    }
  }

  function setAuthBusy(busy) {
    if (authSubmit) authSubmit.disabled = busy;
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
    window.setTimeout(() => accountForm?.elements.namedItem("login")?.focus({ preventScroll: true }), 40);
  }

  function closePasswordDialog() {
    if (!passwordDialog) return;
    if (typeof passwordDialog.close === "function") passwordDialog.close();
    else passwordDialog.removeAttribute("open");
    passwordForm?.reset();
    if (passwordStatus) passwordStatus.textContent = "";
  }

  function openPasswordDialog() {
    if (!sessionApi?.isEditor?.()) {
      openLoginDialog();
      return;
    }
    passwordForm?.reset();
    if (passwordStatus) passwordStatus.textContent = "";
    if (typeof passwordDialog?.showModal === "function") passwordDialog.showModal();
    else passwordDialog?.setAttribute("open", "");
    window.setTimeout(() => passwordForm?.elements.namedItem("currentPassword")?.focus({ preventScroll: true }), 40);
  }

  function setPasswordBusy(busy) {
    if (passwordSubmit) passwordSubmit.disabled = busy;
    if (passwordClose) passwordClose.disabled = busy;
    passwordForm?.querySelectorAll("input").forEach((input) => { input.disabled = busy; });
  }

  function showEditorPanel(panel) {
    if (!sessionApi?.isEditor?.()) {
      openLoginDialog();
      return;
    }
    if (panel === recoveryPanel && !sessionApi?.hasAccess?.("full")) {
      if (accountStatus) accountStatus.textContent = "ВОССТАНОВЛЕНИЕ ДОСТУПНО ТОЛЬКО В РЕЖИМАХ ПОЛНОГО И АДМИНИСТРАТИВНОГО ДОСТУПА.";
      return;
    }
    [createPanel, recoveryPanel].forEach((candidate) => {
      if (candidate) candidate.hidden = candidate !== panel;
    });
    document.body.classList.toggle("editor-overlay-open", Boolean(panel));
    if (panel === recoveryPanel) renderRecoveryLists();
    panel?.querySelector(".editor-work-dialog")?.scrollTo?.({ top: 0 });
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
    const signedIn = Boolean(session?.authenticated && session?.login);
    const isEditor = Boolean(sessionApi?.isEditor?.());
    if (editorLocked) editorLocked.hidden = signedIn;
    if (editorHome) editorHome.hidden = !signedIn;
    if (editorActions) editorActions.hidden = !isEditor;
    if (recoveryOpen) recoveryOpen.hidden = !sessionApi?.hasAccess?.("full");
    if (passwordOpen) passwordOpen.hidden = !signedIn;
    if (!isEditor) [createPanel, recoveryPanel].forEach((panel) => { if (panel) panel.hidden = true; });
    if (!isEditor) document.body.classList.remove("editor-overlay-open");
    if (accountEmail) accountEmail.textContent = session?.login || "";
    if (accountSessionLabel) accountSessionLabel.textContent = session?.roleLabel || "ДОСТУП НЕ НАЗНАЧЕН";
    if (accountSessionCopy) {
      const accessCopy = {
        limited: "Можно создавать и изменять карточки, связи и доску. Удаление и восстановление недоступны.",
        full: "Можно создавать, изменять, удалять и восстанавливать карточки и элементы доски.",
        admin: "Полный редакционный доступ и управление публичным доступом к сайту.",
      };
      accountSessionCopy.textContent = accessCopy[session?.role] || "Редакционный доступ не назначен.";
    }
    if (accountIndicator) {
      accountIndicator.textContent = isEditor
        ? "ДОСТУП ОТКРЫТ"
        : (signedIn ? "ОЖИДАЕТ ОДОБРЕНИЯ" : "ДОСТУП ЗАКРЫТ");
      accountIndicator.classList.toggle("is-active", isEditor);
      accountIndicator.dataset.state = isEditor ? "active" : (signedIn ? "pending" : "locked");
    }
    if (accountStatus) {
      accountStatus.textContent = message || (session?.membershipError
        ? `ВХОД ВЫПОЛНЕН, НО РОЛЬ НЕ ПРОВЕРЕНА: ${session.membershipError}`
        : (isEditor ? "ВХОД ВЫПОЛНЕН. ВЫБЕРИТЕ НУЖНОЕ ДЕЙСТВИЕ." : "ВОЙДИТЕ ПО ВЫДАННЫМ ЛОГИНУ И ПАРОЛЮ."));
    }
    if (isEditor) renderRecoveryLists();
  }

  renderAccount(sessionApi?.read?.() || null, "ПРОВЕРЯЕМ СОХРАНЁННЫЙ СЕАНС SUPABASE…");
  sessionApi?.ready?.then((session) => {
    renderAccount(session || null);
    siteGate?.refresh?.();
  });
  siteGate?.ready?.then(renderMaintenanceControls);
  accountForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!accountForm.reportValidity()) return;
    const values = new FormData(accountForm);
    setAuthBusy(true);
    if (authStatus) authStatus.textContent = "ПРОВЕРЯЕМ ДАННЫЕ…";
    try {
      const credentials = { login: values.get("login"), password: values.get("password") };
      const session = await sessionApi?.signIn?.(credentials);
      if (!session) throw new Error("Модуль редакционного доступа недоступен.");
      accountForm.reset();
      closeLoginDialog();
      renderAccount(session, session.membershipError ? "" : `${session.roleLabel}. РЕЖИМ РЕДАКТОРА РАЗБЛОКИРОВАН.`);
    } catch (error) {
      const message = error.message || "НЕ УДАЛОСЬ ОТКРЫТЬ РЕДАКЦИОННЫЙ СЕАНС.";
      if (authStatus) authStatus.textContent = message;
      if (accountStatus) accountStatus.textContent = message;
    } finally {
      setAuthBusy(false);
    }
  });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!passwordForm.reportValidity()) return;
    const values = new FormData(passwordForm);
    setPasswordBusy(true);
    if (passwordStatus) passwordStatus.textContent = "ПРОВЕРЯЕМ ТЕКУЩИЙ ПАРОЛЬ…";
    try {
      const session = await sessionApi?.changePassword?.({
        currentPassword: values.get("currentPassword"),
        newPassword: values.get("newPassword"),
        confirmation: values.get("confirmation"),
      });
      if (!session) throw new Error("Модуль смены пароля Supabase недоступен.");
      passwordForm.reset();
      if (passwordStatus) passwordStatus.textContent = "ПАРОЛЬ ИЗМЕНЁН. ОСТАЛЬНЫЕ СЕАНСЫ ЗАВЕРШЕНЫ.";
      renderAccount(session, "ПАРОЛЬ АККАУНТА ИЗМЕНЁН. ТЕКУЩИЙ РЕДАКЦИОННЫЙ СЕАНС СОХРАНЁН.");
      window.setTimeout(closePasswordDialog, 1200);
    } catch (error) {
      const message = error.message || "НЕ УДАЛОСЬ ИЗМЕНИТЬ ПАРОЛЬ.";
      if (passwordStatus) passwordStatus.textContent = message;
      if (accountStatus) accountStatus.textContent = message;
    } finally {
      setPasswordBusy(false);
    }
  });

  loginOpen?.addEventListener("click", openLoginDialog);
  loginClose?.addEventListener("click", closeLoginDialog);
  passwordOpen?.addEventListener("click", openPasswordDialog);
  passwordClose?.addEventListener("click", closePasswordDialog);
  loginDialog?.addEventListener("click", (event) => { if (event.target === loginDialog) closeLoginDialog(); });
  passwordDialog?.addEventListener("click", (event) => { if (event.target === passwordDialog) closePasswordDialog(); });
  createOpen?.addEventListener("click", () => {
    resetCreateWizard();
    showEditorPanel(createPanel);
  });
  recoveryOpen?.addEventListener("click", () => showEditorPanel(recoveryPanel));
  document.querySelectorAll("[data-editor-panel-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.closest("[data-editor-create-panel], [data-editor-recovery-panel]");
      if (panel) panel.hidden = true;
      document.body.classList.remove("editor-overlay-open");
    });
  });
  [createPanel, recoveryPanel].forEach((panel) => panel?.addEventListener("click", (event) => {
    if (event.target !== panel) return;
    panel.hidden = true;
    document.body.classList.remove("editor-overlay-open");
  }));

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
    siteGate?.refresh?.();
  });

  window.addEventListener("midgas:maintenance-ready", (event) => {
    renderMaintenanceControls(event.detail || {});
  });

  maintenanceToggle?.addEventListener("click", async () => {
    maintenanceToggle.disabled = true;
    try {
      const state = await siteGate?.setMaintenance?.(!maintenanceState.enabled);
      renderMaintenanceControls(state || {});
      if (accountStatus) accountStatus.textContent = state?.enabled
        ? "САЙТ ЗАКРЫТ НА ТЕХНИЧЕСКОЕ ОБСЛУЖИВАНИЕ."
        : "САЙТ СНОВА ОТКРЫТ ДЛЯ ВСЕХ ПОСЕТИТЕЛЕЙ.";
    } catch (error) {
      if (accountStatus) accountStatus.textContent = error.message || "НЕ УДАЛОСЬ ИЗМЕНИТЬ РЕЖИМ САЙТА.";
    } finally {
      maintenanceToggle.disabled = false;
    }
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
  let remoteJournalEvents = [];
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

    const events = remoteJournalEvents.length
      ? remoteJournalEvents
      : (window.MIDGAS_EDITOR_STORE?.audit?.() || [])
        .filter((event) => ["update", "delete", "restore", "reset"].includes(event.action) && event.at);
    events.forEach(addEvent);

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
    if (eventCounts.create && !changes.length) statements.push(`создано карточек ${eventCounts.create}`);
    if (eventCounts.update) statements.push(`обновлено ${eventCounts.update}`);
    if (eventCounts.delete) statements.push(`скрыто ${eventCounts.delete}`);
    if (eventCounts.restore) statements.push(`восстановлено ${eventCounts.restore}`);
    if (eventCounts.reset) statements.push(`возвращено к исходной версии ${eventCounts.reset}`);
    if (eventCounts.link) statements.push(`добавлено связей ${eventCounts.link}`);
    if (eventCounts.unlink) statements.push(`удалено связей ${eventCounts.unlink}`);
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
      const eventLabels = {
        create: "СОЗДАНО",
        update: "ОБНОВЛЕНО",
        delete: "СКРЫТО",
        restore: "ВОССТАНОВЛЕНО",
        reset: "ИСХОДНАЯ ВЕРСИЯ",
        link: "СВЯЗЬ ДОБАВЛЕНА",
        unlink: "СВЯЗЬ УДАЛЕНА",
      };
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
        const canRollback = sessionApi?.hasAccess?.("full") && (
          event.action === "create"
          || (["update", "delete", "restore", "reset"].includes(event.action) && Number(event.version) > 1)
          || (["link", "unlink"].includes(event.action) && event.source && event.target)
        );
        if (canRollback) {
          const rollback = document.createElement("button");
          rollback.type = "button";
          rollback.className = "company-journal-rollback";
          rollback.textContent = "СДЕЛАТЬ ОТКАТ";
          rollback.addEventListener("click", async () => {
            rollback.disabled = true;
            rollback.textContent = "ОТКАТЫВАЮ…";
            try {
              const result = await window.MIDGAS_SUPABASE_DATA?.rollbackChange?.(event);
              if (!result) throw new Error("Модуль отката Supabase недоступен.");
              if (accountStatus) accountStatus.textContent = `${event.id}: ИЗМЕНЕНИЕ ОТКАЧЕНО. ОБНОВЛЯЮ ЖУРНАЛ…`;
              window.setTimeout(() => window.location.reload(), 420);
            } catch (error) {
              rollback.disabled = false;
              rollback.textContent = "СДЕЛАТЬ ОТКАТ";
              if (accountStatus) accountStatus.textContent = error.message || "НЕ УДАЛОСЬ ВЫПОЛНИТЬ ОТКАТ.";
            }
          });
          item.append(rollback);
        }
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

  async function loadRemoteJournal() {
    try {
      await window.MIDGAS_SUPABASE_DATA?.ready;
      const rows = await window.MIDGAS_SUPABASE_DATA?.loadChangeFeed?.(300);
      remoteJournalEvents = (rows || []).flatMap((row) => {
        const action = {
          record_created: "create",
          record_updated: "update",
          record_soft_deleted: "delete",
          record_restored: "restore",
          relationship_created: "link",
          relationship_deleted: "unlink",
        }[row.action];
        if (!action || !row.occurred_at) return [];
        const relationCode = [row.details?.source, row.details?.target].filter(Boolean).join(" ↔ ");
        return [{
          action,
          at: row.occurred_at,
          type: row.record_type,
          id: relationCode || row.record_code || "ЗАПИСЬ",
          name: action === "link" || action === "unlink" ? "Связь карточек" : (row.record_name || row.record_code),
          version: Number(row.details?.version) || null,
          source: row.details?.source || "",
          target: row.details?.target || "",
        }];
      });
      renderJournal();
    } catch (error) {
      console.warn("MIDGAS: общий журнал временно недоступен", error);
    }
  }

  const journalSection = journalList?.closest(".company-journal");
  const journalEnabled = Boolean(journalList && !journalSection?.hidden);
  if (journalEnabled) {
    renderJournal();
    loadRemoteJournal();
    window.setInterval(() => {
      if (!document.hidden) loadRemoteJournal();
    }, 30000);
  }

  const quotes = [
    ["Я целый месяц жил на Урале. Там была строительная площадка. Волшебный город для сериала. Там и играл в пинг-понг. Ещё приезжал на КАМАЗе Баста.", "СЛУЧАЙНАЯ ЗАПИСЬ / 01"],
    ["Мохнатая ОПГ не выкупает прикола чилить целый день.", "СЛУЧАЙНАЯ ЗАПИСЬ / 02"],
    ["Видимо, началось.", "СЛУЧАЙНАЯ ЗАПИСЬ / 03"],
    ["Эта дрянь выползла из недр черемушкинской сточной канавы, и теперь мы не знаем, куда его деть.", "СЛУЧАЙНАЯ ЗАПИСЬ / 04"],
    ["Зачем они светофоры ускорили?", "СЛУЧАЙНАЯ ЗАПИСЬ / 05"],
    ["День рождения только через пару дней, а Ярослав уже начал поздравлять.", "СЛУЧАЙНАЯ ЗАПИСЬ / 06"],
  ];
  let quoteIndex = 0;
  const quoteText = document.querySelector("[data-quote-text]");
  const quoteSource = document.querySelector("[data-quote-source]");
  const quoteCounter = document.querySelector("[data-quote-index]");
  const quoteFrame = quoteText?.closest("blockquote");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let quoteAnimation = null;
  let quoteTimer = null;
  const QUOTE_ROTATION_MS = 6500;

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

  function restartQuoteTimer() {
    window.clearInterval(quoteTimer);
    quoteTimer = null;
    if (reducedMotion || document.hidden || !quoteFrame) return;
    quoteTimer = window.setInterval(() => { void showQuote(quoteIndex + 1); }, QUOTE_ROTATION_MS);
  }

  document.querySelector("[data-quote-prev]")?.addEventListener("click", () => {
    void showQuote(quoteIndex - 1);
    restartQuoteTimer();
  });
  document.querySelector("[data-quote-next]")?.addEventListener("click", () => {
    void showQuote(quoteIndex + 1);
    restartQuoteTimer();
  });
  document.addEventListener("visibilitychange", restartQuoteTimer);
  restartQuoteTimer();

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
  const editorSectionsList = document.querySelector("[data-editor-sections-list]");
  const editorAddSection = document.querySelector("[data-editor-add-section]");
  const editorFieldsSteps = [...document.querySelectorAll('[data-create-step="fields"]')];
  const editorRelationsSteps = [...document.querySelectorAll('[data-create-step="relations"]')];
  const editorWizardStages = [...document.querySelectorAll("[data-wizard-stage]")];
  const editorWizardProgress = [...document.querySelectorAll("[data-wizard-progress]")];
  const editorWizardBack = document.querySelector("[data-wizard-back]");
  const editorWizardCounter = document.querySelector("[data-wizard-counter]");
  const editorWizardNavigation = document.querySelector("[data-wizard-navigation]");
  const editorCreateNext = document.querySelector("[data-create-next]");
  const clientStageOrder = ["identity", "levels", "summary", "sections", "relations", "publish"];
  const standardStageOrder = ["identity", "summary", "sections", "relations", "publish"];
  let editorStage = "type";
  let preparedImage = "";
  let preparedFile = "";
  let imagePreparing = false;

  function renumberCreateSections() {
    [...(editorSectionsList?.children || [])].forEach((row, index) => {
      const marker = row.querySelector("[data-editor-create-section-number]");
      if (marker) marker.textContent = String(index + 2).padStart(2, "0");
    });
  }

  function addCreateSection(section = {}) {
    if (!editorSectionsList) return;
    const row = document.createElement("article");
    row.className = "company-editor-section-row";
    const marker = document.createElement("span");
    marker.dataset.editorCreateSectionNumber = "";
    const fields = document.createElement("div");
    const title = document.createElement("input");
    title.type = "text";
    title.required = true;
    title.maxLength = 180;
    title.placeholder = "Название раздела";
    title.value = String(section.title || "НОВЫЙ РАЗДЕЛ");
    title.dataset.editorCreateSectionTitle = "";
    const paragraphs = document.createElement("textarea");
    paragraphs.required = true;
    paragraphs.maxLength = 12000;
    paragraphs.rows = 7;
    paragraphs.placeholder = "Текст первого абзаца\n\nТекст второго абзаца";
    paragraphs.value = Array.isArray(section.paragraphs) ? section.paragraphs.join("\n\n") : "";
    paragraphs.dataset.editorCreateSectionParagraphs = "";
    fields.append(title, paragraphs);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "company-editor-section-remove";
    remove.textContent = "УДАЛИТЬ";
    remove.addEventListener("click", () => { row.remove(); renumberCreateSections(); });
    row.append(marker, fields, remove);
    editorSectionsList.append(row);
    renumberCreateSections();
    title.focus({ preventScroll: true });
  }

  function collectCreateSections() {
    return [...(editorSectionsList?.children || [])].map((row) => ({
      title: row.querySelector("[data-editor-create-section-title]")?.value.trim() || "НОВЫЙ РАЗДЕЛ",
      paragraphs: String(row.querySelector("[data-editor-create-section-paragraphs]")?.value || "")
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean),
    })).filter((section) => section.paragraphs.length);
  }

  function selectedCreateType() {
    return String(editorForm?.querySelector('input[name="type"]:checked')?.value || "");
  }

  function activeCreateStages() {
    return selectedCreateType() === "client" ? clientStageOrder : standardStageOrder;
  }

  function updateCreateStageNumbers(order) {
    const numberFor = (stage) => String(order.indexOf(stage) + 1).padStart(2, "0");
    const summaryNumber = document.querySelector("[data-editor-summary-number]");
    const sectionsNumber = document.querySelector("[data-editor-sections-number]");
    const relationsNumber = document.querySelector("[data-editor-relations-number]");
    const publishNumber = document.querySelector("[data-editor-publish-number]");
    if (summaryNumber) summaryNumber.textContent = numberFor("summary");
    if (sectionsNumber) sectionsNumber.textContent = `${numberFor("sections")} / НЕОБЯЗАТЕЛЬНО`;
    if (relationsNumber) relationsNumber.textContent = `${numberFor("relations")} / НЕОБЯЗАТЕЛЬНО`;
    if (publishNumber) publishNumber.textContent = numberFor("publish");
  }

  function setCreateStage(stage) {
    if (editorWizardStages.length) {
      const order = activeCreateStages();
      editorStage = stage === "type" || order.includes(stage) ? stage : "type";
      const index = order.indexOf(editorStage);
      editorWizardStages.forEach((element) => { element.hidden = element.dataset.wizardStage !== editorStage; });
      const isTypeStage = editorStage === "type";
      const progressRoot = editorWizardProgress[0]?.parentElement;
      if (progressRoot) {
        progressRoot.hidden = isTypeStage;
        progressRoot.style.gridTemplateColumns = `repeat(${order.length}, minmax(0, 1fr))`;
      }
      editorWizardProgress.forEach((element) => {
        const progressIndex = order.indexOf(element.dataset.wizardProgress);
        element.hidden = progressIndex < 0;
        element.classList.toggle("is-current", progressIndex === index);
        element.classList.toggle("is-complete", progressIndex >= 0 && progressIndex < index);
      });
      updateCreateStageNumbers(order);
      if (editorWizardBack) editorWizardBack.hidden = isTypeStage;
      if (editorCreateNext) {
        editorCreateNext.hidden = isTypeStage || index === order.length - 1;
        editorCreateNext.textContent = index === order.length - 2 ? "К ПУБЛИКАЦИИ →" : "ДАЛЕЕ →";
      }
      if (editorWizardCounter && !isTypeStage) editorWizardCounter.textContent = `ШАГ ${index + 1} ИЗ ${order.length}`;
      if (editorWizardNavigation) editorWizardNavigation.hidden = isTypeStage;
      clearEditorError();
      if (!isTypeStage) document.querySelector(`[data-wizard-stage="${editorStage}"] input:not([type="hidden"]), [data-wizard-stage="${editorStage}"] textarea, [data-wizard-stage="${editorStage}"] select`)?.focus?.({ preventScroll: true });
      return;
    }
    editorFieldsSteps.forEach((element) => { element.hidden = stage === "type"; });
    editorRelationsSteps.forEach((element) => { element.hidden = stage !== "relations"; });
  }

  function resetCreateWizard() {
    if (!editorForm) return;
    editorForm.reset();
    preparedImage = "";
    preparedFile = "";
    imagePreparing = false;
    if (editorClientAccessField) editorClientAccessField.hidden = false;
    if (editorPreview) {
      editorPreview.src = "";
      editorPreview.hidden = true;
    }
    if (editorUploadCopy) editorUploadCopy.hidden = false;
    if (editorRelationsPanel) editorRelationsPanel.hidden = true;
    editorRelationsToggle?.setAttribute("aria-expanded", "false");
    editorRelationsList?.querySelectorAll('input[type="checkbox"]:checked').forEach((input) => { input.checked = false; });
    if (editorRelationsSearch) editorRelationsSearch.value = "";
    if (editorSectionsList) editorSectionsList.replaceChildren();
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

  editorAddSection?.addEventListener("click", () => addCreateSection());

  function openRequestedCreatePanel() {
    const requestedType = new URLSearchParams(window.location.search).get("create");
    if (!["client", "anomaly", "incident"].includes(requestedType) || !sessionApi?.isEditor?.()) return;
    resetCreateWizard();
    showEditorPanel(createPanel);
    const typeInput = editorForm?.querySelector(`input[name="type"][value="${requestedType}"]`);
    if (typeInput) {
      typeInput.checked = true;
      typeInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("create");
    url.hash = "company-editor";
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  sessionApi?.ready?.then(openRequestedCreatePanel);
  window.addEventListener(sessionApi?.eventName || "midgas:editor-session", openRequestedCreatePanel);

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
    const selectedBeforeRefresh = new Set([...editorRelationsList.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => `${input.dataset.relationType}:${input.dataset.relationId}`));
    editorRelationsList.replaceChildren();
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
          input.checked = selectedBeforeRefresh.has(`${type}:${record.id}`);
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
    updateRelationsCount();
  }

  editorRelationsList?.addEventListener("change", updateRelationsCount);
  buildRelationsList();
  window.addEventListener("midgas:records-ready", buildRelationsList);

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
      // Keep enough source detail for dossier covers and high-density displays.
      // The previous 1200px / 560KB ceiling visibly softened portraits.
      const maximumSide = 2400;
      const scale = Math.min(1, maximumSide / Math.max(source.naturalWidth, source.naturalHeight));
      let width = Math.max(1, Math.round(source.naturalWidth * scale));
      let height = Math.max(1, Math.round(source.naturalHeight * scale));
      let canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d", { alpha: false }).drawImage(source, 0, 0, width, height);

      let quality = 0.92;
      let blob = await canvasBlob(canvas, "image/webp", quality);
      for (let attempt = 0; blob && blob.size > 2 * 1024 * 1024 && attempt < 3; attempt += 1) {
        quality = Math.max(0.82, quality - 0.035);
        width = Math.max(960, Math.round(width * 0.94));
        height = Math.max(640, Math.round(height * 0.94));
        const resized = document.createElement("canvas");
        resized.width = width;
        resized.height = height;
        resized.getContext("2d", { alpha: false }).drawImage(canvas, 0, 0, width, height);
        canvas = resized;
        blob = await canvasBlob(canvas, "image/webp", quality);
      }
      if (!blob) blob = await canvasBlob(canvas, "image/jpeg", 0.9);
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

  async function geocodeCreatedLocation(query) {
    const value = String(query || "").trim().split(/\s+\/\s+/)[0].trim();
    if (!value || /^(?:нет|не указано|не установлено|не раскрывается|unknown|—)$/i.test(value)) return null;
    const coordinates = value.match(/^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/);
    if (coordinates) {
      const lat = Number(coordinates[1].replace(",", "."));
      const lng = Number(coordinates[2].replace(",", "."));
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng, label: value, source: "editor_coordinates", updatedAt: new Date().toISOString() };
      }
    }
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("accept-language", "ru");
    url.searchParams.set("q", value);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6500);
    const response = await window.fetch(url.toString(), { headers: { Accept: "application/json" }, signal: controller.signal })
      .finally(() => window.clearTimeout(timeout));
    if (!response.ok) return null;
    const result = (await response.json())?.[0];
    const lat = Number(result?.lat);
    const lng = Number(result?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, label: String(result.display_name || value), source: "nominatim", updatedAt: new Date().toISOString() };
  }

  editorForm?.querySelectorAll('input[name="type"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      const isClient = input.value === "client";
      if (editorClientAccessField) editorClientAccessField.hidden = !isClient;
      const identityTitle = document.querySelector("[data-editor-identity-title]");
      if (identityTitle) identityTitle.textContent = isClient ? "КТО ЭТО?" : (input.value === "incident" ? "ЧТО ПРОИЗОШЛО?" : "ЧТО ОБНАРУЖЕНО?");
      if (editorWizardStages.length) window.setTimeout(() => setCreateStage("identity"), 90);
      else setCreateStage("fields");
    });
  });

  editorCreateNext?.addEventListener("click", () => {
    clearEditorError();
    if (editorWizardStages.length) {
      const current = document.querySelector(`[data-wizard-stage="${editorStage}"]`);
      const required = [...(current?.querySelectorAll("input[required], select[required], textarea[required]") || [])];
      const invalid = required.find((control) => !control.checkValidity());
      if (invalid) {
        invalid.reportValidity();
        return;
      }
      if (editorStage === "identity") {
        if (imagePreparing) {
          showEditorError("Дождитесь завершения оптимизации изображения.");
          return;
        }
        if (!preparedImage) {
          showEditorError("Загрузите обложку карточки.");
          return;
        }
      }
      const order = activeCreateStages();
      const index = order.indexOf(editorStage);
      setCreateStage(order[Math.min(order.length - 1, index + 1)]);
      return;
    }
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

  editorWizardBack?.addEventListener("click", () => {
    const order = activeCreateStages();
    const index = order.indexOf(editorStage);
    if (index > 0) setCreateStage(order[index - 1]);
    else setCreateStage("type");
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
      const recordType = String(formData.get("type") || "");
      if (editorSubmit && ["client", "anomaly"].includes(recordType)) editorSubmit.textContent = "ОПРЕДЕЛЯЮ ЛОКАЦИЮ…";
      let geo = null;
      if (["client", "anomaly"].includes(recordType)) {
        try { geo = await geocodeCreatedLocation(formData.get("location")); }
        catch { geo = null; }
      }
      const relations = [...(editorRelationsList?.querySelectorAll('input[type="checkbox"]:checked') || [])].map((input) => ({
        type: input.dataset.relationType,
        id: input.dataset.relationId,
        label: input.dataset.relationLabel,
      }));
      const created = await window.MIDGAS_EDITOR_STORE?.create({
        type: recordType,
        name: formData.get("name"),
        alias: formData.get("alias"),
        threat: formData.get("threat"),
        access: formData.get("access"),
        location: formData.get("location"),
        summary: formData.get("summary"),
        description: formData.get("summary"),
        geo,
        sections: collectCreateSections(),
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
      if (editorWizardStages.length) editorWizardStages.forEach((stage) => { stage.hidden = true; });
      if (editorWizardNavigation) editorWizardNavigation.hidden = true;
      editorWizardProgress.forEach((item) => { item.hidden = true; });
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
    loadRemoteJournal();
  });

  window.addEventListener("midgas:record-mutated", loadRemoteJournal);

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
  const galleryToggle = document.querySelector("[data-company-gallery-toggle]");
  const gallery = document.querySelector(".company-process-grid");
  let parallaxFrame = 0;

  galleryToggle?.addEventListener("click", () => {
    const expanded = gallery?.classList.toggle("is-expanded") || false;
    galleryToggle.setAttribute("aria-expanded", String(expanded));
    galleryToggle.querySelector("span").textContent = expanded ? "СВЕРНУТЬ МЕДИАФОНД" : "ПОКАЗАТЬ ВЕСЬ МЕДИАФОНД";
    galleryToggle.querySelector("b").textContent = expanded ? "ПОКАЗАНЫ ВСЕ ↑" : "20 МАТЕРИАЛОВ ↓";
  });

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

  if (!reducedMotion && !saveData && parallaxElements.length && window.innerWidth > 760) {
    updateParallax();
    window.addEventListener("scroll", requestParallax, { passive: true });
    window.addEventListener("resize", requestParallax);
  }
})();
