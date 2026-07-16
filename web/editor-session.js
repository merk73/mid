(() => {
  "use strict";

  const SESSION_EVENT = "midgas:editor-session";
  const MONITORED_LOGIN = "abdulo";
  const GLITCH_MIN_DELAY_MS = 30_000;
  const GLITCH_MAX_DELAY_MS = 60_000;
  const GLITCH_VERTEX_SHADER = `
    attribute vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;
  const GLITCH_FRAGMENT_SHADER = `
    precision mediump float;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uSeed;
    uniform float uMode;
    uniform float uIntensity;

    float hash(vec2 point) {
      return fract(sin(dot(point, vec2(127.1, 311.7)) + uSeed * 17.17) * 43758.5453);
    }

    void main() {
      vec2 resolution = max(uResolution, vec2(1.0));
      vec2 uv = gl_FragCoord.xy / resolution;
      float clock = floor(uTime * 18.0);
      float grain = hash(floor(gl_FragCoord.xy * 0.48) + clock);
      float lineNoise = hash(vec2(floor(uv.y * 48.0), clock));
      float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.35 + uTime * 52.0);
      vec3 color = vec3(grain);
      float alpha = 0.0;

      if (uMode < 0.5) {
        float band = step(0.82, lineNoise);
        float split = step(0.5, hash(vec2(floor(uv.y * 18.0), uSeed)));
        color = mix(vec3(0.0, 0.88, 0.94), vec3(0.96, 0.02, 0.20), split);
        alpha = band * (0.30 + grain * 0.38) + scan * 0.045;
      } else if (uMode < 1.5) {
        vec2 cell = floor(uv * vec2(46.0, 78.0));
        float stuck = step(0.88, hash(cell));
        float pulse = step(0.34, hash(vec2(clock, uSeed)));
        color = vec3(hash(cell + 1.0), hash(cell + 9.0), hash(cell + 23.0));
        alpha = stuck * (0.20 + pulse * 0.56);
      } else if (uMode < 2.5) {
        float tear = step(0.86, lineNoise);
        float edge = step(0.78, hash(vec2(floor(uv.y * 96.0), floor(uTime * 9.0))));
        color = mix(vec3(0.0), vec3(0.84, 0.98, 0.90), edge);
        alpha = tear * (0.36 + edge * 0.42) + scan * 0.035;
      } else {
        float burst = step(0.66, grain);
        float channel = hash(vec2(floor(uv.y * 120.0), clock));
        color = mix(vec3(grain), vec3(0.12, 0.92, 0.66), step(0.82, channel));
        alpha = burst * (0.08 + lineNoise * 0.34);
      }

      float deadPixel = step(0.994, hash(floor(uv * vec2(94.0, 140.0))));
      color = mix(color, vec3(1.0), deadPixel);
      alpha = min(0.82, (alpha + deadPixel * 0.62) * uIntensity);
      gl_FragColor = vec4(color, alpha);
    }
  `;
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
  let glitchTimerId = 0;
  let glitchFrameId = 0;
  let glitchRenderer = null;
  let glitchAccountActive = false;
  let glitchSupported = true;

  window.MIDGAS_SUPABASE_CLIENT = client;

  function normalizeLogin(value) {
    return String(value || "").trim().toLowerCase();
  }

  function read() {
    return cachedSession;
  }

  function compileGlitchShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Shader compilation failed.";
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createGlitchRenderer() {
    if (!glitchSupported || !document.body) return null;
    if (glitchRenderer) return glitchRenderer;
    const canvas = document.createElement("canvas");
    canvas.className = "account-glitch-overlay";
    canvas.hidden = true;
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      glitchSupported = false;
      return null;
    }
    try {
      const vertexShader = compileGlitchShader(gl, gl.VERTEX_SHADER, GLITCH_VERTEX_SHADER);
      const fragmentShader = compileGlitchShader(gl, gl.FRAGMENT_SHADER, GLITCH_FRAGMENT_SHADER);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Shader link failed.");
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.useProgram(program);
      glitchRenderer = {
        canvas,
        gl,
        program,
        resolution: gl.getUniformLocation(program, "uResolution"),
        time: gl.getUniformLocation(program, "uTime"),
        seed: gl.getUniformLocation(program, "uSeed"),
        mode: gl.getUniformLocation(program, "uMode"),
        intensity: gl.getUniformLocation(program, "uIntensity"),
      };
      document.body.append(canvas);
      return glitchRenderer;
    } catch (error) {
      glitchSupported = false;
      canvas.remove();
      console.warn("MIDGAS: WebGL glitch overlay is unavailable.", error);
      return null;
    }
  }

  function resizeGlitchRenderer(renderer) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(window.innerWidth * pixelRatio));
    const height = Math.max(1, Math.round(window.innerHeight * pixelRatio));
    if (renderer.canvas.width !== width) renderer.canvas.width = width;
    if (renderer.canvas.height !== height) renderer.canvas.height = height;
    renderer.gl.viewport(0, 0, width, height);
  }

  function scheduleGlitch() {
    window.clearTimeout(glitchTimerId);
    glitchTimerId = 0;
    if (!glitchAccountActive || !glitchSupported) return;
    const delay = GLITCH_MIN_DELAY_MS + Math.random() * (GLITCH_MAX_DELAY_MS - GLITCH_MIN_DELAY_MS);
    glitchTimerId = window.setTimeout(playGlitch, delay);
  }

  function playGlitch() {
    glitchTimerId = 0;
    if (!glitchAccountActive || document.hidden) {
      scheduleGlitch();
      return;
    }
    const renderer = createGlitchRenderer();
    if (!renderer) return;
    resizeGlitchRenderer(renderer);
    renderer.canvas.hidden = false;
    const startedAt = performance.now();
    const duration = 620 + Math.random() * 1380;
    const mode = Math.floor(Math.random() * 4);
    const seed = Math.random() * 1000;
    const peakIntensity = 0.48 + Math.random() * 0.48;
    const draw = (now) => {
      if (!glitchAccountActive) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      const envelope = Math.sin(Math.PI * progress);
      const intensity = peakIntensity * envelope * (0.62 + Math.random() * 0.38);
      const { gl } = renderer;
      gl.useProgram(renderer.program);
      gl.uniform2f(renderer.resolution, renderer.canvas.width, renderer.canvas.height);
      gl.uniform1f(renderer.time, now / 1000);
      gl.uniform1f(renderer.seed, seed);
      gl.uniform1f(renderer.mode, mode);
      gl.uniform1f(renderer.intensity, intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (progress < 1) {
        glitchFrameId = window.requestAnimationFrame(draw);
        return;
      }
      glitchFrameId = 0;
      renderer.canvas.hidden = true;
      scheduleGlitch();
    };
    glitchFrameId = window.requestAnimationFrame(draw);
  }

  function stopGlitchEffects() {
    window.clearTimeout(glitchTimerId);
    window.cancelAnimationFrame(glitchFrameId);
    glitchTimerId = 0;
    glitchFrameId = 0;
    if (!glitchRenderer) return;
    glitchRenderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
    glitchRenderer.canvas.remove();
    glitchRenderer = null;
  }

  function setGlitchAccountState(active) {
    if (glitchAccountActive === active) return;
    glitchAccountActive = active;
    if (!active) {
      stopGlitchEffects();
      return;
    }
    scheduleGlitch();
  }

  function notify(session, reason = "updated") {
    setGlitchAccountState(Boolean(session?.glitchAccount));
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: { session, reason } }));
  }

  window.addEventListener("resize", () => {
    if (glitchRenderer && !glitchRenderer.canvas.hidden) resizeGlitchRenderer(glitchRenderer);
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (!glitchAccountActive) return;
    if (document.hidden) {
      window.clearTimeout(glitchTimerId);
      window.cancelAnimationFrame(glitchFrameId);
      glitchTimerId = 0;
      glitchFrameId = 0;
      if (glitchRenderer) glitchRenderer.canvas.hidden = true;
      return;
    }
    scheduleGlitch();
  });

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
        glitchAccount: trustedLogin === MONITORED_LOGIN,
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
    if (cachedSession.login === MONITORED_LOGIN) throw new Error("Смена пароля для этого аккаунта недоступна.");
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
