import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const allowedOrigins = new Set(["https://midgas.ru", "https://www.midgas.ru", "https://merk73.github.io"]);

function headers(request: Request) {
  const origin = request.headers.get("origin") || "";
  const allowed = allowedOrigins.has(origin) || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://midgas.ru",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function json(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

function normalizeLogin(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function hmacHex(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(serviceRoleKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(request: Request) {
  return String(request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0].trim();
}

async function accountForUser(userId: string) {
  const { data, error } = await service
    .from("account_members")
    .select("user_id,login,role,display_name,avatar_path,approved_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findOrCreateUser(email: string, login: string, role: string, authPassword: string, knownId = "") {
  if (knownId) {
    const existing = await service.auth.admin.getUserById(knownId);
    if (!existing.error && existing.data.user) return existing.data.user;
  }

  const created = await service.auth.admin.createUser({
    email,
    password: authPassword,
    email_confirm: true,
    app_metadata: { account_login: login, account_role: role },
    user_metadata: { display_name: login },
  });
  if (!created.error && created.data.user) return created.data.user;
  if (!String(created.error?.message || "").toLowerCase().includes("already")) throw created.error;

  const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const user = listed.data.users.find((candidate) => String(candidate.email || "").toLowerCase() === email.toLowerCase());
  if (!user) throw created.error || new Error("Account Auth user was not found.");
  return user;
}

async function login(request: Request, payload: Record<string, unknown>, ipHash: string) {
  const loginValue = normalizeLogin(payload.login);
  const password = String(payload.password || "");
  if (!/^[a-z0-9_-]{3,40}$/.test(loginValue) || !password) {
    return json(request, 400, { error: "УКАЖИТЕ ЛОГИН И ПАРОЛЬ." });
  }

  const verified = await service.rpc("verify_account_credentials", {
    p_login: loginValue,
    p_password: password,
    p_ip_hash: ipHash,
  });
  if (verified.error) throw verified.error;
  const account = Array.isArray(verified.data) ? verified.data[0] : verified.data;
  if (account?.is_locked) return json(request, 429, { error: "СЛИШКОМ МНОГО ПОПЫТОК. ПОВТОРИТЕ ЧЕРЕЗ 15 МИНУТ." });
  if (!account?.is_valid) return json(request, 401, { error: "НЕВЕРНЫЙ ЛОГИН ИЛИ ПАРОЛЬ." });

  const authPassword = await hmacHex(`account-auth:${loginValue}:${password}`);
  const user = await findOrCreateUser(
    String(account.internal_email),
    loginValue,
    String(account.access_role),
    authPassword,
    String(account.auth_user_id || ""),
  );
  const updated = await service.auth.admin.updateUserById(user.id, {
    email: String(account.internal_email),
    password: authPassword,
    email_confirm: true,
    app_metadata: { account_login: loginValue, account_role: account.access_role },
    user_metadata: { display_name: loginValue },
  });
  if (updated.error) throw updated.error;

  const binding = await service.rpc("bind_account_auth_user", { p_login: loginValue, p_user_id: user.id });
  if (binding.error) throw binding.error;

  const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await authClient.auth.signInWithPassword({ email: String(account.internal_email), password: authPassword });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error || new Error("Account session was not created.");

  return json(request, 200, {
    account: await accountForUser(user.id),
    session: signedIn.data.session,
  });
}

async function validate(request: Request, payload: Record<string, unknown>) {
  const accessToken = String(payload.access_token || "");
  const refreshToken = String(payload.refresh_token || "");
  if (!accessToken || !refreshToken) return json(request, 401, { error: "СЕАНС ЗАКРЫТ." });

  const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const restored = await authClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (restored.error || !restored.data.session?.user) return json(request, 401, { error: "СЕАНС ЗАКРЫТ." });
  const account = await accountForUser(restored.data.session.user.id);
  if (!account) return json(request, 403, { error: "АККАУНТ ОТКЛЮЧЁН." });
  return json(request, 200, { account, session: restored.data.session });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(request) });
  if (request.method !== "POST") return json(request, 405, { error: "METHOD NOT ALLOWED" });
  try {
    const payload = await request.json();
    const ipHash = await hmacHex(`account-ip:${clientIp(request)}`);
    return payload?.action === "validate"
      ? await validate(request, payload)
      : await login(request, payload, ipHash);
  } catch (error) {
    console.error("account-login", error);
    return json(request, 500, { error: "СЕРВИС ВХОДА ВРЕМЕННО НЕДОСТУПЕН." });
  }
});
