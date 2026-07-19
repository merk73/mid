const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".main-navigation");
const siteHeader = document.querySelector(".home-page .site-header");
const coverHero = document.querySelector(".home-page .hero-cover");
const headerBackButton = document.querySelector(".header-back-button");

const homeGlossary = document.querySelector(".home-page #glossary");
const homeQuotes = document.querySelector(".home-page #company-quotes");
if (homeGlossary && homeQuotes) homeQuotes.insertAdjacentElement("beforebegin", homeGlossary);

headerBackButton?.addEventListener("click", () => {
  let hasInternalReferrer = false;
  try {
    hasInternalReferrer = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
  } catch {
    hasInternalReferrer = false;
  }

  if (hasInternalReferrer && window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = headerBackButton.dataset.fallback || "index.html";
  }
});

function updateHeaderMode() {
  const heroBottom = coverHero.getBoundingClientRect().bottom;
  const hasLeftHero = window.scrollY > 1 && heroBottom <= siteHeader.offsetHeight + 1;
  siteHeader.classList.toggle("is-scrolled", hasLeftHero);
}

if (siteHeader && coverHero) {
  let headerFrame = 0;
  const scheduleHeaderMode = () => {
    if (headerFrame) return;
    headerFrame = window.requestAnimationFrame(() => {
      headerFrame = 0;
      updateHeaderMode();
    });
  };
  updateHeaderMode();
  window.addEventListener("load", scheduleHeaderMode);
  window.addEventListener("pageshow", scheduleHeaderMode);
  window.addEventListener("scroll", scheduleHeaderMode, { passive: true });
  window.addEventListener("resize", scheduleHeaderMode);
}

menuButton?.addEventListener("click", () => {
  const isOpen = navigation.classList.toggle("is-open");
  menuButton.closest(".site-header")?.classList.toggle("menu-open", isOpen);
  menuButton.classList.toggle("is-open", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
});

navigation?.addEventListener("click", (event) => {
  if (event.target.closest("a") && window.matchMedia("(max-width: 760px)").matches) {
    navigation.classList.remove("is-open");
    menuButton.closest(".site-header")?.classList.remove("menu-open");
    menuButton.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Открыть меню");
  }
});

const clientGrid = document.querySelector("#client-grid");

function normalizedCardFieldLabel(value) {
  return String(value || "").trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function clientCardFieldValue(record, labels) {
  const normalizedLabels = labels.map(normalizedCardFieldLabel);
  const match = (record?.fields || []).find(([label]) => normalizedLabels.some((item) => normalizedCardFieldLabel(label).includes(item)));
  return String(match?.[1] || "").trim();
}

function clientCardLevel(value, kind) {
  const prefix = kind === "threat" ? "T" : "D";
  const source = String(value || "").trim();
  const code = source.match(new RegExp(`\\b${prefix}([1-5])\\b`, "i"));
  if (code) return Number(code[1]);
  const normalized = normalizedCardFieldLabel(source);
  if (!normalized) return 0;
  if (kind === "threat") {
    if (normalized.includes("критич") || normalized.includes("сверхопас")) return 5;
    if (normalized.includes("высок")) return 4;
    if (normalized.includes("значитель") || normalized.includes("влияни")) return 3;
    if (normalized.includes("умерен") || normalized.includes("скрыт")) return 2;
    if (normalized.includes("низк")) return 1;
  } else {
    if (normalized.includes("максим") || normalized.includes("полн") || normalized.includes("высш")) return 5;
    if (normalized.includes("высок")) return 4;
    if (normalized.includes("средн")) return 3;
    if (normalized.includes("низк")) return normalized.includes("очень") ? 1 : 2;
  }
  return 0;
}

function createClientCardLevels(record, options = {}) {
  const threatValue = record?.threatLevel ? `T${record.threatLevel}` : clientCardFieldValue(record, ["Уровень угрозы"]);
  const accessValue = record?.accessLevel ? `D${record.accessLevel}` : clientCardFieldValue(record, ["Уровень доступа", "Осведомленность клиента"]);
  const levels = [
    { kind: "threat", label: "УГРОЗА", prefix: "T", value: threatValue, level: clientCardLevel(threatValue, "threat") },
    { kind: "access", label: "ДОСТУП", prefix: "D", value: accessValue, level: clientCardLevel(accessValue, "access") },
  ].filter((entry) => !options.threatOnly || entry.kind === "threat");
  const root = document.createElement("div");
  root.className = `client-card-levels${options.threatOnly ? " client-card-levels--threat-only" : ""}`;
  root.setAttribute("aria-label", options.threatOnly
    ? `Уровень угрозы: ${threatValue || "не указан"}.`
    : `Уровень угрозы: ${threatValue || "не указан"}. Уровень доступа: ${accessValue || "не указан"}.`);
  levels.forEach((entry) => {
    const item = document.createElement("span");
    item.className = `client-card-level client-card-level--${entry.kind}`;
    item.dataset.level = String(entry.level);
    item.title = entry.value || "Не указан";
    const label = document.createElement("small");
    label.textContent = entry.label;
    const value = document.createElement("strong");
    value.textContent = `${entry.prefix}${entry.level || "—"}`;
    const scale = document.createElement("span");
    scale.className = "client-card-level-scale";
    scale.setAttribute("aria-hidden", "true");
    for (let index = 1; index <= 5; index += 1) {
      const division = document.createElement("span");
      if (index <= entry.level) division.className = "is-active";
      scale.append(division);
    }
    item.append(label, value, scale);
    root.append(item);
  });
  return root;
}

window.MIDGAS_CREATE_CLIENT_CARD_LEVELS = createClientCardLevels;

function renderPreviewGrid(grid, records, recordType, limit) {
  if (!grid) return;
  grid.replaceChildren();
  records.slice(0, limit).forEach((record) => {
    const card = document.createElement("a");
    card.className = "client-card";
    card.dataset.status = record.sections?.length ? "lore" : "missing";
    card.href = `record.html?type=${encodeURIComponent(recordType)}&id=${encodeURIComponent(record.id)}`;

    const image = document.createElement("img");
    image.src = record.cardImage || record.image;
    image.alt = record.name;
    image.loading = "lazy";
    image.decoding = "async";
    if (record.imageFit) image.dataset.fit = record.imageFit;

    const idOverlay = document.createElement("span");
    idOverlay.className = "client-card-id-overlay";
    idOverlay.textContent = record.id;

    const data = document.createElement("div");
    data.className = "client-card-data";
    const id = document.createElement("span");
    id.textContent = record.id;
    data.append(id);
    data.classList.add("client-card-data--levels");
    data.append(createClientCardLevels(record, { threatOnly: recordType !== "client" }));

    const heading = document.createElement("h3");
    heading.textContent = record.name;
    const type = document.createElement("p");
    type.textContent = record.cardType;

    card.append(image, idOverlay, data, heading, type);
    grid.append(card);
  });

  if (document.body.classList.contains("home-page")) {
    const allCard = document.createElement("a");
    allCard.className = "client-card registry-more-card";
    allCard.href = `registry.html?type=${encodeURIComponent(recordType)}`;
    const label = document.createElement("span");
    label.textContent = "ПОЛНЫЙ КАТАЛОГ";
    const title = document.createElement("strong");
    title.textContent = recordType === "client" ? "ПОСМОТРЕТЬ ВСЕХ" : "ПОСМОТРЕТЬ ВСЕ";
    const count = document.createElement("span");
    count.textContent = `${String(records.length).padStart(4, "0")} →`;
    allCard.append(label, title, count);
    grid.append(allCard);
  }
}

function renderRecordPreviews() {
  const clientRecords = Object.values(window.MIDGAS_RECORDS?.client || {});
  renderPreviewGrid(clientGrid, clientRecords, "client", document.body.classList.contains("home-page") ? 7 : clientRecords.length);
  renderPreviewGrid(document.querySelector("#anomaly-grid"), Object.values(window.MIDGAS_RECORDS?.anomaly || {}), "anomaly", 4);
  renderPreviewGrid(document.querySelector("#incident-grid"), Object.values(window.MIDGAS_RECORDS?.incident || {}), "incident", 4);
}

renderRecordPreviews();
window.addEventListener("midgas:records-ready", renderRecordPreviews);

const filterButtons = document.querySelectorAll(".filter-button");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;

    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    document.querySelectorAll(".client-card").forEach((card) => {
      card.hidden = filter !== "all" && card.dataset.status !== filter;
    });
  });
});

const glossarySearch = document.querySelector("#glossary-search");
const glossaryFilterButtons = [...document.querySelectorAll("[data-glossary-filter]")];
let glossaryEntries = [...document.querySelectorAll("[data-glossary-entry]")];
let glossaryGroups = [...document.querySelectorAll("[data-glossary-group]")];
const glossaryEmpty = document.querySelector("#glossary-empty");
let activeGlossaryFilter = "all";
let activeGlossaryEntry = null;

function normalizeGlossaryText(value) {
  return String(value || "").toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

function closeGlossaryEntry() {
  if (!activeGlossaryEntry) return;

  const trigger = activeGlossaryEntry.querySelector(".glossary-entry-trigger");
  const body = activeGlossaryEntry.querySelector(".glossary-entry-body");
  activeGlossaryEntry.classList.remove("is-open");
  trigger?.setAttribute("aria-expanded", "false");
  body?.setAttribute("aria-hidden", "true");
  activeGlossaryEntry = null;
}

function toggleGlossaryEntry(entry) {
  if (!entry || entry.hidden) return;
  if (activeGlossaryEntry === entry) {
    closeGlossaryEntry();
    return;
  }

  closeGlossaryEntry();
  const trigger = entry.querySelector(".glossary-entry-trigger");
  const body = entry.querySelector(".glossary-entry-body");
  entry.classList.add("is-open");
  trigger?.setAttribute("aria-expanded", "true");
  body?.setAttribute("aria-hidden", "false");
  activeGlossaryEntry = entry;
}

function initializeGlossaryAccordions() {
  glossaryEntries.forEach((entry, index) => {
    if (entry.querySelector(":scope > .glossary-entry-trigger")) return;
    const sourceMeta = entry.querySelector(":scope > div");
    const code = sourceMeta?.querySelector(":scope > span");
    const title = sourceMeta?.querySelector("h4");
    const category = sourceMeta?.querySelector("em");
    const description = entry.querySelector(":scope > p");
    const link = entry.querySelector(":scope > a");
    if (!sourceMeta || !code || !title || !category || !description) return;

    const trigger = document.createElement("button");
    const body = document.createElement("div");
    const bodyInner = document.createElement("div");
    const indicator = document.createElement("span");
    const bodyId = `glossary-entry-body-${index + 1}`;

    trigger.type = "button";
    trigger.className = "glossary-entry-trigger";
    trigger.setAttribute("aria-label", title.textContent.trim());
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", bodyId);
    indicator.className = "glossary-entry-indicator";
    indicator.setAttribute("aria-hidden", "true");

    body.className = "glossary-entry-body";
    body.id = bodyId;
    body.setAttribute("aria-hidden", "true");
    bodyInner.className = "glossary-entry-body-inner";

    trigger.append(code, title, indicator);
    bodyInner.append(category, description);
    if (link) bodyInner.append(link);
    body.append(bodyInner);
    sourceMeta.replaceWith(trigger);
    entry.append(body);

    trigger.addEventListener("click", () => toggleGlossaryEntry(entry));
  });
}

function updateGlossary() {
  if (!glossaryEntries.length) return;
  const query = normalizeGlossaryText(glossarySearch?.value);
  let visibleCount = 0;

  glossaryEntries.forEach((entry) => {
    const matchesGroup = activeGlossaryFilter === "all" || entry.dataset.group === activeGlossaryFilter;
    const matchesQuery = !query || normalizeGlossaryText(entry.textContent).includes(query);
    entry.hidden = !(matchesGroup && matchesQuery);
    if (!entry.hidden) visibleCount += 1;
  });

  glossaryGroups.forEach((group) => {
    group.hidden = !group.querySelector("[data-glossary-entry]:not([hidden])");
  });
  if (activeGlossaryEntry?.hidden) closeGlossaryEntry();
  if (glossaryEmpty) glossaryEmpty.hidden = visibleCount > 0;
}

initializeGlossaryAccordions();

window.MIDGAS_REFRESH_GLOSSARY = () => {
  glossaryEntries = [...document.querySelectorAll("[data-glossary-entry]")];
  glossaryGroups = [...document.querySelectorAll("[data-glossary-group]")];
  initializeGlossaryAccordions();
  updateGlossary();
};

glossaryFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeGlossaryFilter = button.dataset.glossaryFilter || "all";
    glossaryFilterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    updateGlossary();
  });
});

glossarySearch?.addEventListener("input", updateGlossary);

document.querySelectorAll('a[href*="record.html?"]').forEach((link) => {
  try {
    const target = new URL(link.href, window.location.href);
    const targetType = target.searchParams.get("type") || "";
    const targetId = target.searchParams.get("id") || "";
    if (window.MIDGAS_EDITOR_STORE?.isDeleted?.(targetType, targetId)) link.hidden = true;
  } catch {
    // Keep malformed editorial links visible for manual review.
  }
});

const motionTargets = document.querySelectorAll(
  ".home-page .hero-cover-copy > *, .home-page .intro-section > *, .home-page .support-section > *, .home-page .section-heading > *, .home-page .registry-row, .home-page .historical-archive-heading > *, .home-page .historical-archive-footer > *, .home-page .client-card, .home-page .archive-section > *, .home-page .glossary-section > *",
);

if (motionTargets.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.body.classList.add("motion-ready");

  motionTargets.forEach((element, index) => {
    element.classList.add("reveal-item");
    element.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 45}ms`);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "115% 0px 105%", threshold: 0.001 },
  );

  motionTargets.forEach((element) => observer.observe(element));
}
