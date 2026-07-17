(() => {
  "use strict";

  const SESSION_EVENT = "midgas:editor-session";
  const ROLE_RANK = { pending: 0, limited: 1, full: 2, admin: 3 };
  const ROLE_LABELS = {
    limited: "ОГРАНИЧЕННЫЙ ДОСТУП",
    full: "ПОЛНЫЙ ДОСТУП",
    admin: "ДОСТУП АДМИНИСТРАТОРА",
    pending: "ДОСТУП НЕ НАЗНАЧЕН",
  };
  const config = window.MIDGAS_SUPABASE_CONFIG;
  const createClient = window.supabase?.createClient;
  const client = config?.url && config?.publishableKey && typeof createClient === "function"
    ? createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    : null;
  const endpoint = config?.url ? `${config.url}/functions/v1/editor-login` : "";
  let cachedSession = null;
  let authSession = null;
  let refreshSequence = 0;
  let hydrationPromise = null;
  let hydrationUserId = "";

  window.MIDGAS_SUPABASE_CLIENT = client;

  function normalizeLogin(value) {
    return String(value || "").trim().toLowerCase();
  }

  function read() {
    return cachedSession;
  }

  function notify(session, reason = "updated") {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: { session, reason } }));
  }

  function hasAccess(required = "limited") {
    const role = cachedSession?.approvedAt ? cachedSession.role : "pending";
    return (ROLE_RANK[role] || 0) >= (ROLE_RANK[required] || 1);
  }

  function isEditor() {
    return hasAccess("limited");
  }

  function validateCredentials({ login, password } = {}) {
    const normalizedLogin = normalizeLogin(login);
    if (!/^[a-z0-9_-]{3,40}$/.test(normalizedLogin)) throw new Error("Укажите корректный логин.");
    if (!String(password || "")) throw new Error("Введите пароль.");
    return { login: normalizedLogin, password: String(password) };
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
    const message = String(error?.message || error || "").trim();
    const normalized = message.toLowerCase();
    if (normalized.includes("failed to fetch") || normalized.includes("network")) return new Error("Нет связи с Supabase. Проверьте подключение к интернету.");
    return new Error(message || "Supabase не выполнил запрос авторизации.");
  }

  function isStaleSessionError(error) {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || error || "").toLowerCase();
    return code === "refresh_token_not_found"
      || code === "session_not_found"
      || message.includes("invalid refresh token")
      || message.includes("refresh token not found")
      || message.includes("session not found");
  }

  async function clearStaleSession(reason = "stale-session-cleared") {
    try {
      await client?.auth.signOut({ scope: "local" });
    } catch {
      // Supabase still clears browser auth storage when the remote session is already gone.
    }
    authSession = null;
    cachedSession = null;
    refreshSequence += 1;
    notify(null, reason);
    return null;
  }

  async function requestMembership(user) {
    const { data, error } = await client
      .from("editor_members")
      .select("role, approved_at, created_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
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
      let verifiedUser = currentAuthSession.user;
      let identityVerified = false;
      let membership;
      let membershipError = "";
      try {
        const verified = await client.auth.getUser(currentAuthSession.access_token);
        if (verified.error) {
          if (isStaleSessionError(verified.error)) return clearStaleSession();
          throw verified.error;
        }
        verifiedUser = verified.data.user || verifiedUser;
        identityVerified = Boolean(verified.data.user);
        membership = await requestMembership(verifiedUser);
      } catch (error) {
        membership = { role: "pending", approved_at: null, created_at: null };
        membershipError = friendlyError(error).message;
        console.error("MIDGAS: не удалось проверить editor_members.", error);
      }
      if (sequence !== refreshSequence) return cachedSession;

      const trustedLogin = identityVerified ? normalizeLogin(verifiedUser.app_metadata?.editor_login) : "";
      const login = trustedLogin || normalizeLogin(verifiedUser.user_metadata?.login || verifiedUser.email?.split("@")[0]);
      cachedSession = Object.freeze({
        userId: verifiedUser.id,
        login,
        role: membership.role || "pending",
        roleLabel: ROLE_LABELS[membership.role] || ROLE_LABELS.pending,
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

  async function callEndpoint(body, accessToken = "") {
    if (!endpoint || !config?.publishableKey) throw new Error("Модуль Supabase не загружен.");
    const response = await window.fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.publishableKey,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Сервис входа временно недоступен.");
    return payload;
  }

  async function signIn(credentials = {}) {
    if (!client) throw new Error("Модуль Supabase не загружен.");
    const values = validateCredentials(credentials);
    const result = await callEndpoint(values);
    if (!result.session?.access_token || !result.session?.refresh_token) throw new Error("Supabase не вернул редакционный сеанс.");
    const sessionResult = await client.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (sessionResult.error) throw friendlyError(sessionResult.error);
    return hydrate(sessionResult.data.session || result.session, "signed-in");
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
    if (!client || !cachedSession?.authenticated || !authSession?.access_token) throw new Error("Сначала войдите в редактор.");
    const { currentPassword, newPassword } = validatePasswordChange(values);
    await callEndpoint({
      action: "change-password",
      login: cachedSession.login,
      currentPassword,
      newPassword,
    }, authSession.access_token);
    const otherSessions = await client.auth.signOut({ scope: "others" });
    if (otherSessions.error) throw friendlyError(otherSessions.error);
    return hydrate(authSession, "password-changed");
  }

  async function refresh() {
    if (!client) return null;
    if (authSession?.user) return hydrate(authSession, "membership-refreshed");
    const { data, error } = await client.auth.getSession();
    if (error) {
      if (isStaleSessionError(error)) return clearStaleSession();
      throw friendlyError(error);
    }
    return hydrate(data.session, "session-refreshed");
  }

  const ready = (async () => {
    if (!client) {
      notify(null, "unavailable");
      return null;
    }
    const { data, error } = await client.auth.getSession();
    if (error) {
      if (isStaleSessionError(error)) return clearStaleSession();
      notify(null, "initialization-error");
      return null;
    }
    return hydrate(data.session, "ready");
  })();

  client?.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => void hydrate(session, event.toLowerCase()).catch(() => {}), 0);
  });
  window.addEventListener("focus", () => { if (authSession?.user) void hydrate(authSession, "focus-refresh"); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && authSession?.user) void hydrate(authSession, "visibility-refresh");
  });

  window.MIDGAS_EDITOR_SESSION = Object.freeze({
    eventName: SESSION_EVENT,
    ready,
    read,
    isEditor,
    hasAccess,
    roleLabels: Object.freeze({ ...ROLE_LABELS }),
    signIn,
    signOut,
    changePassword,
    refresh,
  });
})();
