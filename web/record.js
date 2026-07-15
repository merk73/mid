const params = new URLSearchParams(window.location.search);
const type = params.get("type") || "client";
const id = params.get("id") || "";
const source = params.get("from") || "";
const records = window.MIDGAS_RECORDS?.[type] || {};
let record = records[id];
const waitsForRemoteRecord = Boolean(window.MIDGAS_SUPABASE_CONFIG?.url);
if (waitsForRemoteRecord) document.documentElement.classList.add("record-awaiting-sync");

const backLink = document.querySelector("#record-back");
if (backLink) {
  if (source === "topics") {
    backLink.href = "index.html#current-topics";
    backLink.lastChild.textContent = " Вернуться к актуальным темам";
  } else {
    backLink.href = `registry.html?type=${encodeURIComponent(type)}`;
    backLink.lastChild.textContent = " Вернуться к полному реестру";
  }
}

const content = document.querySelector("#record-content");
const overview = document.querySelector("#record-overview");
const lore = document.querySelector("#record-lore");
const empty = document.querySelector("#record-empty");
const locationRoot = document.querySelector("[data-record-location]");
const relationsRoot = document.querySelector("[data-record-relations]");
const relatedList = document.querySelector("[data-record-related-list]");

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function normalizedLabel(value) {
  return String(value || "").trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function recordFieldValue(sourceRecord, names) {
  const candidates = (sourceRecord?.fields || []).map(([term, value]) => [normalizedLabel(term), String(value || "").trim()]);
  const match = candidates.find(([term]) => names.some((name) => term === normalizedLabel(name) || term.includes(normalizedLabel(name))));
  return match?.[1] || "";
}

function levelFromValue(value, kind) {
  const source = String(value || "").trim();
  const normalized = normalizedLabel(source);
  const code = source.match(new RegExp(`\\b${kind === "threat" ? "T" : "D"}([1-5])\\b`, "i"));
  if (code) return Number(code[1]);
  if (!normalized || normalized.includes("не указан") || normalized === "нет") return 0;
  if (kind === "threat") {
    if (normalized.includes("критич")) return 5;
    if (normalized.includes("высок")) return 4;
    if (normalized.includes("значитель")) return 3;
    if (normalized.includes("умерен")) return 2;
    if (normalized.includes("низк")) return 1;
  } else {
    if (normalized.includes("полн") || normalized.includes("макс") || normalized.includes("маким") || normalized.includes("высш")) return 5;
    if (normalized.includes("высок")) return 4;
    if (normalized.includes("средн")) return 3;
    if (normalized.includes("очень низк")) return 1;
    if (normalized.includes("низк")) return 2;
  }
  return 0;
}

function renderLevel(root, value, prefix, kind) {
  if (!root) return;
  const level = levelFromValue(value, kind);
  root.dataset.level = String(level);
  root.querySelector("strong").textContent = level ? `${prefix}${level}` : "—";
  root.querySelector("small").textContent = value || "НЕ УКАЗАН";
  root.querySelectorAll(".record-level-scale i").forEach((item, index) => item.classList.toggle("is-active", index < level));
  root.setAttribute("aria-label", `${kind === "threat" ? "Уровень угрозы" : "Уровень доступа"}: ${value || "не указан"}`);
}

function renderClearance(sourceRecord) {
  const root = document.querySelector("[data-record-clearance]");
  if (!root) return;
  root.hidden = type !== "client";
  if (type !== "client") return;
  const threat = recordFieldValue(sourceRecord, ["Уровень угрозы"]);
  const access = recordFieldValue(sourceRecord, ["Уровень доступа", "Осведомленность клиента"]);
  renderLevel(root.querySelector("[data-record-threat]"), threat, "T", "threat");
  renderLevel(root.querySelector("[data-record-access]"), access, "D", "access");
}

function createMediaGrid(items, context = {}) {
  const gallery = document.createElement("div");
  gallery.className = `lore-media-grid lore-media-count-${items.length}`;

  items.forEach((item, itemIndex) => {
    const figure = document.createElement("figure");
    figure.className = `lore-media lore-media-${item.aspect || "wide"}`;
    if (Number.isInteger(context.sectionIndex)) {
      figure.dataset.recordSectionMedia = "";
      figure.dataset.sectionIndex = String(context.sectionIndex);
      figure.dataset.mediaKind = context.kind || "media";
      figure.dataset.mediaIndex = String(Number.isInteger(item._mediaIndex) ? item._mediaIndex : itemIndex);
    }
    const mediaImage = document.createElement("img");
    mediaImage.src = item.src;
    mediaImage.alt = item.alt || "Архивный материал MIDGAS";
    mediaImage.loading = "lazy";
    mediaImage.className = "lore-media-expandable";
    mediaImage.tabIndex = 0;
    mediaImage.setAttribute("role", "button");
    mediaImage.setAttribute("aria-expanded", "false");
    mediaImage.setAttribute("aria-label", "Показать фотографию целиком");
    const toggleSourceSize = () => {
      const expanded = figure.classList.toggle("is-source-expanded");
      mediaImage.setAttribute("aria-expanded", String(expanded));
      mediaImage.setAttribute("aria-label", expanded ? "Вернуть фотографию к формату раздела" : "Показать фотографию целиком");
    };
    mediaImage.addEventListener("click", toggleSourceSize);
    mediaImage.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleSourceSize();
    });
    const caption = document.createElement("figcaption");
    caption.textContent = item.caption || "АРХИВ MIDGAS";
    figure.append(mediaImage, caption);
    gallery.append(figure);
  });

  return gallery;
}

function renderRecord(nextRecord) {
  record = nextRecord;
  content.hidden = true;
  overview.hidden = true;
  lore.hidden = true;
  empty.hidden = true;
  if (locationRoot) locationRoot.hidden = true;
  if (relationsRoot) relationsRoot.hidden = true;
  relatedList?.replaceChildren();
  document.querySelector("#record-fields")?.replaceChildren();
  document.querySelector("#record-sections")?.replaceChildren();

if (!record) {
  empty.hidden = false;
} else {
  document.body.dataset.recordType = type;
  if (headerBackButton) headerBackButton.dataset.fallback = `registry.html?type=${encodeURIComponent(type)}`;
  document.title = `${record.id} — ${record.name} — THE MIDGAS`;
  setText("#record-id", record.id);
  setText("#record-kind", record.kind);
  setText("#record-name", record.name);
  setText("#record-alias", record.alias);
  setText("#record-image-id", record.id);
  setText("#record-summary", record.summary);

  const image = document.querySelector("#record-image");
  image.hidden = !record.image;
  image.src = record.image || "";
  image.alt = record.name;
  if (record.imageFit) image.dataset.fit = record.imageFit;
  else delete image.dataset.fit;

  renderClearance(record);

  const location = recordFieldValue(record, ["Местоположение", "Локация"]);
  if (locationRoot && (location || record.geo)) {
    locationRoot.hidden = false;
    locationRoot.dataset.recordLocationValue = location;
    setText("[data-record-location-label]", location || record.geo?.label || "Координаты указаны редактором");
    const queryInput = document.querySelector("[data-record-map-query]");
    if (queryInput) queryInput.value = location || record.geo?.label || "";
  }

  const fields = document.querySelector("#record-fields");
  record.fields.filter(([term]) => normalizedLabel(term) !== "связанные записи").forEach(([term, value]) => {
    const wrapper = document.createElement("div");
    wrapper.dataset.recordFieldRow = "";
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    wrapper.append(dt, dd);
    fields.append(wrapper);
  });

  const sections = document.querySelector("#record-sections");
  if (record.sections.length) {
    if (record.loreState === "partial") {
      const notice = document.createElement("div");
      notice.className = "lore-editorial-note";
      const label = document.createElement("strong");
      label.textContent = "РЕДАКЦИОННЫЙ СТАТУС";
      const text = document.createElement("span");
      text.textContent = record.loreNote;
      notice.append(label, text);
      sections.append(notice);
    }
    record.sections.forEach((section, index) => {
      const article = document.createElement("article");
      article.className = "lore-section";
      article.dataset.recordSection = String(index);

      const number = document.createElement("span");
      number.className = "lore-number";
      number.textContent = String(index + 1).padStart(2, "0");

      const body = document.createElement("div");
      const heading = document.createElement("h3");
      heading.textContent = section.title;
      heading.dataset.recordSectionTitle = "";
      body.append(heading);

      const sectionImage = typeof section.image === "string" ? { src: section.image } : section.image;
      if (sectionImage?.src) {
        const sectionImageGrid = createMediaGrid([{
          ...sectionImage,
          alt: sectionImage.alt || section.title || "Фотография раздела MIDGAS",
          caption: sectionImage.caption || "ФОТОМАТЕРИАЛ MIDGAS",
          aspect: sectionImage.aspect || "wide",
        }], { sectionIndex: index, kind: "image" });
        sectionImageGrid.classList.add("lore-section-image");
        body.append(sectionImageGrid);
      }

      section.paragraphs.forEach((paragraph, paragraphIndex) => {
        const element = document.createElement("p");
        element.textContent = paragraph;
        element.dataset.recordSectionParagraph = "";
        body.append(element);

        const inlineMedia = section.media?.map((item, mediaIndex) => ({ ...item, _mediaIndex: mediaIndex })).filter((item) => item.afterParagraph === paragraphIndex) || [];
        if (inlineMedia.length) body.append(createMediaGrid(inlineMedia, { sectionIndex: index, kind: "media" }));
      });

      if (section.media?.length) {
        const trailingMedia = section.media.map((item, mediaIndex) => ({ ...item, _mediaIndex: mediaIndex })).filter((item) => !Number.isInteger(item.afterParagraph));
        if (trailingMedia.length) body.append(createMediaGrid(trailingMedia, { sectionIndex: index, kind: "media" }));
      }

      article.append(number, body);
      sections.append(article);
    });
    window.renderMidgasResearch?.(record, sections);

  } else {
    const pending = document.createElement("div");
    pending.className = "lore-pending";
    const heading = document.createElement("strong");
    heading.textContent = type === "client" ? "ТРЕБУЕТСЯ УНИКАЛЬНЫЙ ЛОР" : "МАТЕРИАЛЫ ГОТОВЯТСЯ";
    const note = document.createElement("span");
    note.textContent = record.loreNote || "Уникальное описание для клиента пока отсутствует.";
    pending.append(heading, note);
    sections.append(pending);
  }

  const explicitRelations = Array.isArray(record.editorRelations) ? record.editorRelations : null;
  const relationSource = explicitRelations || [
    ...record.sections.flatMap((section) => section.relatedRecords || []),
    ...(window.MIDGAS_RELATIONS?.forRecord?.(type, id) || []),
  ];
  const relationKeys = new Set();
  const relationItems = relationSource.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (!window.MIDGAS_RECORDS?.[item.type]?.[item.id] || relationKeys.has(key)) return false;
    relationKeys.add(key);
    return true;
  });
  if (relationsRoot) relationsRoot.hidden = !relationItems.length;
  relationItems.forEach((item) => {
    const target = window.MIDGAS_RECORDS?.[item.type]?.[item.id];
    const link = document.createElement("a");
    link.href = `record.html?type=${encodeURIComponent(item.type)}&id=${encodeURIComponent(item.id)}`;
    const meta = document.createElement("span");
    meta.textContent = `${String(item.type || "").toUpperCase()} / ${item.id}`;
    const title = document.createElement("strong");
    title.textContent = item.label || target?.name || item.id;
    link.append(meta, title);
    relatedList?.append(link);
  });

  content.hidden = false;
  overview.hidden = false;
  lore.hidden = false;
  window.dispatchEvent(new CustomEvent("midgas:record-rendered", { detail: { type, id, record } }));
}
}

renderRecord(record);

function revealSyncedRecord() {
  const image = document.querySelector("#record-image");
  const reveal = () => document.documentElement.classList.remove("record-awaiting-sync");
  if (!image?.src || image.complete) {
    window.requestAnimationFrame(reveal);
    return;
  }
  image.addEventListener("load", reveal, { once: true });
  image.addEventListener("error", reveal, { once: true });
}

window.addEventListener("midgas:records-ready", () => {
  renderRecord(window.MIDGAS_RECORDS?.[type]?.[id] || null);
  revealSyncedRecord();
}, { once: true });

// If Supabase is temporarily unavailable, fall back to the bundled dossier
// instead of leaving the portrait hidden indefinitely.
if (waitsForRemoteRecord) window.setTimeout(revealSyncedRecord, 5000);
