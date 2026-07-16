import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const allowedOrigins = new Set(["https://midgas.ru", "https://www.midgas.ru"]);

function corsHeaders(request: Request) {
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

function response(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
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

async function verifyCredentials(login: string, password: string, ipHash: string) {
  const { data, error } = await service.rpc("verify_editor_credentials", {
    p_login: login,
    p_password: password,
    p_ip_hash: ipHash,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
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
    user_metadata: { login, access_role: role },
  });
  if (!created.error && created.data.user) return created.data.user;

  if (!String(created.error?.message || "").toLowerCase().includes("already")) throw created.error;
  const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const user = listed.data.users.find((candidate) => String(candidate.email || "").toLowerCase() === email.toLowerCase());
  if (!user) throw created.error || new Error("Editor Auth user was not found.");
  return user;
}

async function login(request: Request, payload: Record<string, unknown>, ipHash: string) {
  const loginValue = normalizeLogin(payload.login);
  const password = String(payload.password || "");
  if (!/^[a-z0-9_-]{3,40}$/.test(loginValue) || !password) {
    return response(request, 400, { error: "УКАЖИТЕ ЛОГИН И ПАРОЛЬ." });
  }

  const account = await verifyCredentials(loginValue, password, ipHash);
  if (account?.is_locked) return response(request, 429, { error: "СЛИШКОМ МНОГО ПОПЫТОК. ПОВТОРИТЕ ЧЕРЕЗ 15 МИНУТ." });
  if (!account?.is_valid) return response(request, 401, { error: "НЕВЕРНЫЙ ЛОГИН ИЛИ ПАРОЛЬ." });

  const authPassword = await hmacHex(`editor-auth:${loginValue}:${password}`);
  const user = await findOrCreateUser(
    String(account.internal_email),
    loginValue,
    String(account.access_role),
    authPassword,
    String(account.auth_user_id || ""),
  );

  const updated = await service.auth.admin.updateUserById(user.id, {
    password: authPassword,
    email_confirm: true,
    user_metadata: { login: loginValue, access_role: account.access_role },
  });
  if (updated.error) throw updated.error;

  const binding = await service.rpc("bind_editor_auth_user", { p_login: loginValue, p_user_id: user.id });
  if (binding.error) throw binding.error;

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await authClient.auth.signInWithPassword({ email: String(account.internal_email), password: authPassword });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error || new Error("Supabase session was not created.");

  return response(request, 200, {
    login: loginValue,
    role: account.access_role,
    session: signedIn.data.session,
  });
}

async function changePassword(request: Request, payload: Record<string, unknown>, ipHash: string) {
  const token = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return response(request, 401, { error: "СЕАНС РЕДАКТОРА ЗАКРЫТ." });
  const userResult = await service.auth.getUser(token);
  const user = userResult.data.user;
  if (userResult.error || !user) return response(request, 401, { error: "СЕАНС РЕДАКТОРА ЗАКРЫТ." });

  const loginValue = normalizeLogin(payload.login || user.user_metadata?.login);
  const currentPassword = String(payload.currentPassword || "");
  const newPassword = String(payload.newPassword || "");
  if (newPassword.length < 6) return response(request, 400, { error: "НОВЫЙ ПАРОЛЬ ДОЛЖЕН СОДЕРЖАТЬ НЕ МЕНЕЕ 6 СИМВОЛОВ." });

  const account = await verifyCredentials(loginValue, currentPassword, ipHash);
  if (account?.is_locked) return response(request, 429, { error: "СЛИШКОМ МНОГО ПОПЫТОК. ПОВТОРИТЕ ЧЕРЕЗ 15 МИНУТ." });
  if (!account?.is_valid || String(account.auth_user_id || "") !== user.id) {
    return response(request, 401, { error: "ТЕКУЩИЙ ПАРОЛЬ УКАЗАН НЕВЕРНО." });
  }

  const changed = await service.rpc("change_editor_login_password", {
    p_login: loginValue,
    p_current_password: currentPassword,
    p_new_password: newPassword,
    p_user_id: user.id,
  });
  if (changed.error || changed.data !== true) throw changed.error || new Error("Password was not changed.");

  const authPassword = await hmacHex(`editor-auth:${loginValue}:${newPassword}`);
  const updated = await service.auth.admin.updateUserById(user.id, { password: authPassword });
  if (updated.error) throw updated.error;
  return response(request, 200, { changed: true });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return response(request, 405, { error: "METHOD NOT ALLOWED" });
  try {
    const payload = await request.json();
    const ip = String(request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
    const ipHash = await hmacHex(`editor-ip:${ip}`);
    return payload?.action === "change-password"
      ? await changePassword(request, payload, ipHash)
      : await login(request, payload, ipHash);
  } catch (error) {
    console.error("editor-login", error);
    return response(request, 500, { error: "СЕРВИС ВХОДА ВРЕМЕННО НЕДОСТУПЕН." });
  }
});
