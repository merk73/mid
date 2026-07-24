(() => {
  const typeByPrefix = { C: "client", A: "anomaly", I: "incident" };
  const idPattern = /^MID-([CAI])-\d{4}$/i;

  const normalizeId = (value) => {
    const id = String(value || "").trim().toUpperCase();
    return idPattern.test(id) ? id : "";
  };

  const typeFromId = (value) => {
    const match = normalizeId(value).match(idPattern);
    return match ? typeByPrefix[match[1].toUpperCase()] : "";
  };

  const idFromPath = (pathname = window.location.pathname) => {
    const segments = String(pathname).split("/").filter(Boolean);
    return normalizeId(segments.at(-1));
  };

  const recordUrl = (type, value, options = {}) => {
    const id = normalizeId(value);
    if (!id) return "record.html";

    const query = new URLSearchParams();
    const source = options.from || options.source || "";
    if (source) query.set("from", source);

    const hash = String(options.hash || "").replace(/^#?/, "");
    const search = query.size ? `?${query.toString()}` : "";
    return `${id.toLowerCase()}/${search}${hash ? `#${hash}` : ""}`;
  };

  const canonicalizeLegacyLinks = () => {
    document.querySelectorAll('a[href*="record.html?"]').forEach((link) => {
      try {
        const target = new URL(link.getAttribute("href"), window.location.href);
        const id = normalizeId(target.searchParams.get("id"));
        if (!id) return;
        link.setAttribute("href", recordUrl(target.searchParams.get("type") || typeFromId(id), id, {
          from: target.searchParams.get("from") || "",
          hash: target.hash,
        }));
      } catch {
        // Leave editorial links untouched if their URL is incomplete.
      }
    });
  };

  window.MIDGAS_RECORD_URL = recordUrl;
  window.MIDGAS_RECORD_TYPE_FROM_ID = typeFromId;
  window.MIDGAS_RECORD_ID_FROM_PATH = idFromPath;
  window.addEventListener("DOMContentLoaded", canonicalizeLegacyLinks, { once: true });
})();
