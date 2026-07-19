(() => {
  "use strict";

  const SESSION_EVENT = "midgas:account-session";
  const ROLE_RANK = { viewer: 1, editor: 2, admin: 3 };
  const ROLE_LABELS = {
    viewer: "ПОЛЬЗОВАТЕЛЬ",
    editor: "РЕДАКТОР",
    admin: "АДМИНИСТРАТОР",
  };
  const config = window.MIDGAS_SUPABASE_CONFIG;
  const createClient = window.supabase?.createClient;
  const client = config?.url && config?.publishableKey && typeof createClient === "function"
    ? createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
    : null;
  const endpoint = config?.url ? `${config.url}/functions/v1/account-login` : "";
  let cachedAccount = null;
  let authSession = null;
  let hydrationSequence = 0;
  let hydrationPromise = null;
  let hydrationToken = "";

  window.MIDGAS_SUPABASE_CLIENT = client;

  function normalizeRole(value) {
    const role = String(value || "").toLowerCase();
    return ROLE_RANK[role] ? role : "viewer";
  }

  function normalizeRequired(value) {
    const required = String(value || "viewer").toLowerCase();
    if (["limited", "full", "editor"].includes(required)) return "editor";
    return required === "admin" ? "admin" : "viewer";
  }

  function read() {
    return cachedAccount;
  }

  function notify(account, reason = "updated") {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: { session: account, account, reason } }));
    window.dispatchEvent(new CustomEvent("midgas:editor-session", { detail: { session: account, reason } }));
  }

  function hasAccess(required = "viewer") {
    const current = ROLE_RANK[cachedAccount?.role] || 0;
    return current >= (ROLE_RANK[normalizeRequired(required)] || 1);
  }

  function isEditor() {
    return hasAccess("editor");
  }

  function friendlyError(error) {
    const message = String(error?.message || error || "").trim();
    if (/failed to fetch|network/i.test(message)) return new Error("Нет связи с Supabase. Проверьте подключение к интернету.");
    return new Error(message || "Supabase не выполнил запрос авторизации.");
  }

  async function requestAccount(userId) {
    const { data, error } = await client
      .from("account_members")
      .select("user_id,login,role,display_name,avatar_path,approved_at,created_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function hydrate(nextSession, reason = "updated") {
    const nextToken = String(nextSession?.access_token || "");
    if (nextToken && hydrationPromise && hydrationToken === nextToken) return hydrationPromise;
    hydrationToken = nextToken;
    const activeHydration = (async () => {
    authSession = nextSession || null;
    const sequence = ++hydrationSequence;
    if (!authSession?.user?.id) {
      cachedAccount = null;
      notify(null, reason);
      return null;
    }

    try {
      const membership = await requestAccount(authSession.user.id);
      if (!membership) throw new Error("Аккаунт отключён.");
      if (sequence !== hydrationSequence) return cachedAccount;
      const avatarPath = membership.avatar_path || "";
      const avatarUrl = avatarPath ? client.storage.from("account-avatars").getPublicUrl(avatarPath).data.publicUrl : "";
      cachedAccount = Object.freeze({
        userId: membership.user_id,
        login: membership.login,
        role: normalizeRole(membership.role),
        roleLabel: ROLE_LABELS[normalizeRole(membership.role)],
        displayName: membership.display_name || membership.login,
        avatarPath,
        avatarUrl,
        approvedAt: membership.approved_at,
        memberSince: membership.created_at,
        authenticated: true,
      });
      document.documentElement.dataset.accountRole = cachedAccount.role;
      window.MIDGAS_SITE_ACCESS?.setSession?.(authSession);
      notify(cachedAccount, reason);
      return cachedAccount;
    } catch (error) {
      if (sequence !== hydrationSequence) return cachedAccount;
      console.error("MIDGAS: account hydration failed.", error);
      cachedAccount = null;
      notify(null, "account-disabled");
      return null;
    }
    })();
    hydrationPromise = activeHydration;
    try { return await activeHydration; }
    finally {
      if (hydrationPromise === activeHydration) {
        hydrationPromise = null;
        hydrationToken = "";
      }
    }
  }

  async function callEndpoint(payload) {
    if (!endpoint || !config?.publishableKey) throw new Error("Модуль Supabase не загружен.");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.publishableKey },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Сервис входа временно недоступен.");
    return result;
  }

  async function signIn({ login, password } = {}) {
    const normalizedLogin = String(login || "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,40}$/.test(normalizedLogin) || !String(password || "")) throw new Error("Укажите логин и пароль.");
    const result = await callEndpoint({ action: "login", login: normalizedLogin, password: String(password) });
    if (!result.session?.access_token || !result.session?.refresh_token) throw new Error("Supabase не вернул сеанс.");
    const restored = await client.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (restored.error) throw friendlyError(restored.error);
    return hydrate(restored.data.session || result.session, "signed-in");
  }

  async function signOut() {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw friendlyError(error);
    authSession = null;
    cachedAccount = null;
    hydrationSequence += 1;
    window.MIDGAS_SITE_ACCESS?.clear?.();
    delete document.documentElement.dataset.accountRole;
    notify(null, "signed-out");
    window.location.reload();
  }

  async function refresh() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw friendlyError(error);
    return hydrate(data.session, "refreshed");
  }

  const ready = (async () => {
    if (!client) return null;
    const gateResult = await window.MIDGAS_SITE_ACCESS?.ready;
    const gateSession = gateResult?.session || window.MIDGAS_SITE_ACCESS?.getSession?.();
    if (gateSession?.access_token && gateSession?.refresh_token) {
      const restored = await client.auth.setSession({
        access_token: gateSession.access_token,
        refresh_token: gateSession.refresh_token,
      });
      if (!restored.error && restored.data.session) return hydrate(restored.data.session, "gate-session");
    }
    const current = await client.auth.getSession();
    if (current.error) return null;
    return hydrate(current.data.session, "ready");
  })();

  client?.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    if (!session && window.MIDGAS_SITE_ACCESS?.getSession?.()) return;
    if (event === "TOKEN_REFRESHED" && cachedAccount?.userId === session?.user?.id) {
      authSession = session;
      window.MIDGAS_SITE_ACCESS?.setSession?.(session);
      return;
    }
    window.setTimeout(() => void hydrate(session, event.toLowerCase()), 0);
  });

  window.addEventListener("midgas:account-access-granted", (event) => {
    const nextSession = event.detail?.session;
    if (!nextSession?.access_token || !nextSession?.refresh_token) return;
    if (nextSession.access_token === authSession?.access_token && cachedAccount) return;
    window.setTimeout(async () => {
      const restored = await client.auth.setSession({ access_token: nextSession.access_token, refresh_token: nextSession.refresh_token });
      if (!restored.error && restored.data.session) await hydrate(restored.data.session, "gate-refreshed");
    }, 0);
  });

  const api = Object.freeze({
    eventName: SESSION_EVENT,
    ready,
    read,
    isEditor,
    hasAccess,
    roleLabels: Object.freeze({ ...ROLE_LABELS }),
    signIn,
    signOut,
    refresh,
  });
  window.MIDGAS_ACCOUNT_SESSION = api;
  window.MIDGAS_EDITOR_SESSION = api;
})();
