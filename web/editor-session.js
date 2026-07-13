(() => {
  const SESSION_KEY = "midgas-editor-session-v1";
  const SESSION_EVENT = "midgas:editor-session";

  function normalizeEmail(value) {
    return String(value || "").trim().toLocaleLowerCase("ru");
  }

  function read() {
    try {
      const value = JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null");
      if (!value || value.role !== "editor" || !value.email) return null;
      return {
        email: normalizeEmail(value.email),
        role: "editor",
        prototype: true,
        signedInAt: String(value.signedInAt || ""),
      };
    } catch {
      return null;
    }
  }

  function notify(session) {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: { session } }));
  }

  function signIn({ email } = {}) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("Укажите корректный адрес электронной почты.");
    }
    const session = {
      email: normalizedEmail,
      role: "editor",
      prototype: true,
      signedInAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    notify(session);
    return session;
  }

  function signOut() {
    window.localStorage.removeItem(SESSION_KEY);
    notify(null);
  }

  function isEditor() {
    return Boolean(read());
  }

  window.addEventListener("storage", (event) => {
    if (event.key === SESSION_KEY) notify(read());
  });

  window.MIDGAS_EDITOR_SESSION = Object.freeze({
    storageKey: SESSION_KEY,
    eventName: SESSION_EVENT,
    read,
    isEditor,
    signIn,
    signOut,
  });
})();
