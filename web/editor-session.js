(() => {
  const SESSION_EVENT = "midgas:editor-session";
  const config = window.MIDGAS_SUPABASE_CONFIG;
  const createClient = window.supabase?.createClient;
  const client = config?.url && config?.publishableKey && typeof createClient === "function"
    ? createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
    : null;
  let cachedSession = null;
  let authSession = null;
  let refreshSequence = 0;
  let hydrationPromise = null;
  let hydrationUserId = "";

  window.MIDGAS_SUPABASE_CLIENT = client;

  function normalizeEmail(value) {
    return String(value || "").trim().toLocaleLowerCase("ru");
  }

  function read() {
    return cachedSession;
  }

  function notify(session, reason = "updated") {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: { session, reason } }));
  }

  function editorRole(role, approvedAt) {
    return Boolean(approvedAt && (role === "editor" || role === "admin"));
  }

  function isEditor() {
    return editorRole(cachedSession?.role, cachedSession?.approvedAt);
  }

  function validateCredentials({ email, password } = {}) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("Укажите корректный адрес электронной почты.");
    }
    if (!String(password || "")) throw new Error("Введите пароль.");
    return { email: normalizedEmail, password: String(password) };
  }

  function validatePasswordChange({ currentPassword, newPassword, confirmation } = {}) {
    const current = String(currentPassword || "");
    const next = String(newPassword || "");
    const repeated = String(confirmation || "");
    if (!current) throw new Error("Введите текущий пароль.");
    if (next.length < 8) throw new Error("Новый пароль должен содержать не менее 8 символов.");
    if (next !== repeated) throw new Error("Новые пароли не совпадают.");
    if (next === current) throw new Error("Новый пароль должен отличаться от текущего.");
    return { currentPassword: current, newPassword: next };
  }

  function friendlyError(error) {
    const message = String(error?.message || "");
    const normalized = message.toLocaleLowerCase("en");
    if (normalized.includes("invalid login credentials")) return new Error("Неверная электронная почта или пароль.");
    if (normalized.includes("email not confirmed")) return new Error("Сначала подтвердите электронную почту по ссылке из письма.");
    if (normalized.includes("user already registered")) return new Error("Аккаунт с этой почтой уже зарегистрирован.");
    if (normalized.includes("password") && normalized.includes("least")) return new Error("Пароль не соответствует требованиям безопасности.");
    if (normalized.includes("failed to fetch") || normalized.includes("network")) return new Error("Нет связи с Supabase. Проверьте подключение к интернету.");
    return new Error(message || "Supabase не выполнил запрос авторизации.");
  }

  async function requestMembership(user) {
    const selectMembership = () => client
      .from("editor_members")
      .select("role, approved_at, created_at")
      .eq("user_id", user.id)
      .maybeSingle();

    let { data, error } = await selectMembership();
    if (error) throw error;
    if (!data) {
      const pendingInsert = await client.from("editor_members").insert({ user_id: user.id });
      if (pendingInsert.error && pendingInsert.error.code !== "23505") throw pendingInsert.error;
      ({ data, error } = await selectMembership());
      if (error) throw error;
    }
    return data || { role: "pending", approved_at: null, created_at: null };
  }

  function hydrate(nextAuthSession, reason = "updated") {
    authSession = nextAuthSession || null;
    if (!authSession?.user) {
      refreshSequence += 1;
      hydrationPromise = null;
      hydrationUserId = "";
      cachedSession = null;
      notify(null, reason);
      return Promise.resolve(null);
    }

    if (hydrationPromise && hydrationUserId === authSession.user.id) return hydrationPromise;
    const sequence = ++refreshSequence;
    const currentAuthSession = authSession;
    hydrationUserId = currentAuthSession.user.id;
    hydrationPromise = (async () => {
      let membership;
      let membershipError = "";
      try {
        membership = await requestMembership(currentAuthSession.user);
      } catch (error) {
        membership = { role: "pending", approved_at: null, created_at: null };
        membershipError = friendlyError(error).message;
        console.error("MIDGAS: не удалось проверить editor_members.", error);
      }
      if (sequence !== refreshSequence) return cachedSession;

      cachedSession = Object.freeze({
        userId: currentAuthSession.user.id,
        email: normalizeEmail(currentAuthSession.user.email),
        role: membership.role || "pending",
        approvedAt: membership.approved_at || null,
        memberSince: membership.created_at || null,
        signedInAt: currentAuthSession.user.last_sign_in_at || "",
        authenticated: true,
        membershipError,
      });
      notify(cachedSession, reason);
      return cachedSession;
    })().finally(() => {
      if (hydrationUserId === currentAuthSession.user.id) {
        hydrationPromise = null;
        hydrationUserId = "";
      }
    });
    return hydrationPromise;
  }

  async function signIn(credentials = {}) {
    if (!client) throw new Error("Модуль Supabase не загружен.");
    const { email, password } = validateCredentials(credentials);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw friendlyError(error);
    return hydrate(data.session, "signed-in");
  }

  async function signUp(credentials = {}) {
    if (!client) throw new Error("Модуль Supabase не загружен.");
    const { email, password } = validateCredentials(credentials);
    const emailRedirectTo = new URL("editor.html", window.location.href).href;
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });
    if (error) throw friendlyError(error);
    const session = data.session ? await hydrate(data.session, "signed-up") : null;
    return Object.freeze({
      session,
      user: data.user || null,
      email,
      confirmationRequired: !data.session,
    });
  }

  async function signOut() {
    if (!client) throw new Error("Модуль Supabase не загружен.");
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw friendlyError(error);
    authSession = null;
    cachedSession = null;
    refreshSequence += 1;
    notify(null, "signed-out");
    return null;
  }

  async function changePassword(values = {}) {
    if (!client) throw new Error("Модуль Supabase не загружен.");
    if (!cachedSession?.authenticated || !cachedSession.email) {
      throw new Error("Сначала войдите в аккаунт редактора.");
    }

    const { currentPassword, newPassword } = validatePasswordChange(values);
    const verification = await client.auth.signInWithPassword({
      email: cachedSession.email,
      password: currentPassword,
    });
    if (verification.error) throw new Error("Текущий пароль указан неверно.");

    authSession = verification.data.session || authSession;
    const { error } = await client.auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
    });
    if (error) throw friendlyError(error);

    const otherSessions = await client.auth.signOut({ scope: "others" });
    if (otherSessions.error) throw friendlyError(otherSessions.error);
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw friendlyError(sessionError);
    return hydrate(sessionData.session || authSession, "password-changed");
  }

  async function refresh() {
    if (!client) return null;
    if (authSession?.user) return hydrate(authSession, "membership-refreshed");
    const { data, error } = await client.auth.getSession();
    if (error) throw friendlyError(error);
    return hydrate(data.session, "session-refreshed");
  }

  const ready = (async () => {
    if (!client) {
      console.error("MIDGAS: Supabase SDK или публичная конфигурация не загружены.");
      notify(null, "unavailable");
      return null;
    }
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.error("MIDGAS: не удалось восстановить Supabase-сессию.", error);
      notify(null, "initialization-error");
      return null;
    }
    return hydrate(data.session, "ready");
  })();

  client?.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => {
      void hydrate(session, event.toLocaleLowerCase("en")).catch((error) => {
        console.error("MIDGAS: ошибка обновления сессии.", error);
      });
    }, 0);
  });

  window.addEventListener("focus", () => {
    if (authSession?.user) void hydrate(authSession, "focus-refresh");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && authSession?.user) {
      void hydrate(authSession, "visibility-refresh");
    }
  });

  window.MIDGAS_EDITOR_SESSION = Object.freeze({
    eventName: SESSION_EVENT,
    ready,
    read,
    isEditor,
    signIn,
    signUp,
    signOut,
    changePassword,
    refresh,
  });
})();
