function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

async function serveAsset(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  let response = await env.ASSETS.fetch(assetRequest(request, pathname));

  if (response.status === 404 && !pathname.split("/").at(-1).includes(".")) {
    response = await env.ASSETS.fetch(assetRequest(request, `${pathname}.html`));
  }

  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Cache-Control", pathname.endsWith(".html")
    ? "public, max-age=0, must-revalidate"
    : "public, max-age=604800, stale-while-revalidate=86400");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    if (!env?.ASSETS?.fetch) {
      return new Response("Static asset binding is unavailable", { status: 503 });
    }

    return serveAsset(request, env);
  },
};
