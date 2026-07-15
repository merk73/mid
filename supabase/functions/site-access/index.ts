import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const allowedOrigins = new Set([
  "https://midgas.ru",
  "https://www.midgas.ru",
  "https://merk73.github.io",
  "http://127.0.0.1:43129",
  "http://localhost:43129",
]);
const sessionHours = 12;
const attemptWindowMinutes = 15;
const maximumAttempts = 5;

function responseHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://midgas.ru",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function json(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });
}

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const encoded = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!encoded) return "";
  try {
    const keys = JSON.parse(encoded);
    return keys.default || Object.values(keys)[0] || "";
  } catch {
    return "";
  }
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { error: "METHOD_NOT_ALLOWED" });
  if (origin && !allowedOrigins.has(origin)) return json(request, 403, { error: "ORIGIN_NOT_ALLOWED" });

  const key = serviceKey();
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (!url || !key) return json(request, 503, { error: "SERVICE_NOT_CONFIGURED" });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(request, 400, { error: "INVALID_JSON" });
  }

  const action = String(body.action || "");
  const token = String(body.token || "").trim();

  if (action === "validate" || action === "logout") {
    if (!/^[a-f0-9]{64}$/.test(token)) return json(request, 401, { valid: false });
    const tokenHash = await sha256(token);
    if (action === "logout") {
      await supabase.from("site_access_sessions").delete().eq("token_hash", tokenHash);
      return json(request, 200, { valid: false });
    }
    const { data: session, error } = await supabase
      .from("site_access_sessions")
      .select("login,expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error || !session || Date.parse(session.expires_at) <= Date.now()) {
      if (session) await supabase.from("site_access_sessions").delete().eq("token_hash", tokenHash);
      return json(request, 401, { valid: false });
    }
    await supabase.from("site_access_sessions").update({ last_seen_at: new Date().toISOString() }).eq("token_hash", tokenHash);
    return json(request, 200, { valid: true, expiresAt: session.expires_at });
  }

  if (action !== "login") return json(request, 400, { error: "UNKNOWN_ACTION" });
  const login = String(body.login || "").trim().toLowerCase().slice(0, 120);
  const password = String(body.password || "").slice(0, 256);
  if (!login || !password) return json(request, 400, { error: "CREDENTIALS_REQUIRED" });

  const attemptKey = await sha256(`${clientAddress(request)}:${login}`);
  const now = new Date();
  const { data: attempt } = await supabase
    .from("site_access_attempts")
    .select("attempts,window_started_at,locked_until")
    .eq("attempt_key", attemptKey)
    .maybeSingle();
  if (attempt?.locked_until && Date.parse(attempt.locked_until) > now.getTime()) {
    return json(request, 429, { error: "TOO_MANY_ATTEMPTS", retryAt: attempt.locked_until });
  }

  const { data: verified, error: verifyError } = await supabase.rpc("verify_site_access_password", {
    p_login: login,
    p_password: password,
  });
  if (verifyError) return json(request, 503, { error: "AUTH_UNAVAILABLE" });

  if (!verified) {
    const windowExpired = !attempt?.window_started_at
      || now.getTime() - Date.parse(attempt.window_started_at) > attemptWindowMinutes * 60_000;
    const attempts = windowExpired ? 1 : Number(attempt?.attempts || 0) + 1;
    const lockedUntil = attempts >= maximumAttempts
      ? new Date(now.getTime() + attemptWindowMinutes * 60_000).toISOString()
      : null;
    await supabase.from("site_access_attempts").upsert({
      attempt_key: attemptKey,
      attempts,
      window_started_at: windowExpired ? now.toISOString() : attempt.window_started_at,
      locked_until: lockedUntil,
    });
    return json(request, lockedUntil ? 429 : 401, {
      error: lockedUntil ? "TOO_MANY_ATTEMPTS" : "INVALID_CREDENTIALS",
      remaining: Math.max(0, maximumAttempts - attempts),
      retryAt: lockedUntil,
    });
  }

  await supabase.from("site_access_attempts").delete().eq("attempt_key", attemptKey);
  await supabase.from("site_access_sessions").delete().lt("expires_at", now.toISOString());
  const sessionToken = randomToken();
  const expiresAt = new Date(now.getTime() + sessionHours * 60 * 60_000).toISOString();
  const { error: sessionError } = await supabase.from("site_access_sessions").insert({
    token_hash: await sha256(sessionToken),
    login,
    expires_at: expiresAt,
  });
  if (sessionError) return json(request, 503, { error: "SESSION_UNAVAILABLE" });
  return json(request, 200, { valid: true, token: sessionToken, expiresAt });
});
