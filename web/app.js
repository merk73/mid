const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".main-navigation");
const siteHeader = document.querySelector(".home-page .site-header");
const coverHero = document.querySelector(".home-page .hero-cover");
const headerBackButton = document.querySelector(".header-back-button");
const otherMenuButton = document.querySelector(".other-menu-toggle");
const otherMenu = document.querySelector(".other-menu");

function setOtherMenu(open) {
  if (!otherMenuButton || !otherMenu) return;
  if (window.matchMedia("(max-width: 760px)").matches) open = false;
  if (open) {
    const buttonRect = otherMenuButton.getBoundingClientRect();
    const headerRect = otherMenuButton.closest(".site-header")?.getBoundingClientRect();
    otherMenu.style.width = `${buttonRect.width}px`;
    otherMenu.style.right = `${Math.max((headerRect?.right || window.innerWidth) - buttonRect.right, 0)}px`;
  }
  otherMenu.hidden = !open;
  otherMenuButton.setAttribute("aria-expanded", String(open));
  otherMenuButton.closest(".site-header")?.classList.toggle("other-menu-open", open);
}

otherMenuButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  setOtherMenu(otherMenu.hidden);
});

otherMenu?.addEventListener("click", (event) => event.stopPropagation());

document.addEventListener("click", () => setOtherMenu(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setOtherMenu(false);
});

window.addEventListener("resize", () => {
  if (!otherMenu?.hidden) setOtherMenu(true);
});

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
  if (!siteHeader || !coverHero) return;
  const switchPoint = Math.max(0, coverHero.offsetHeight - siteHeader.offsetHeight);
  siteHeader.classList.toggle("is-scrolled", window.scrollY >= switchPoint);
}

updateHeaderMode();
window.addEventListener("scroll", updateHeaderMode, { passive: true });
window.addEventListener("resize", updateHeaderMode);

menuButton?.addEventListener("click", () => {
  const isOpen = navigation.classList.toggle("is-open");
  menuButton.closest(".site-header")?.classList.toggle("menu-open", isOpen);
  menuButton.classList.toggle("is-open", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
  if (!isOpen) setOtherMenu(false);
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
const clientRecords = Object.values(window.MIDGAS_RECORDS?.client || {});

function renderPreviewGrid(grid, records, recordType, limit) {
  if (!grid) return;
  records.slice(0, limit).forEach((record) => {
    const card = document.createElement("a");
    card.className = "client-card";
    card.dataset.status = record.sections?.length ? "lore" : "missing";
    card.href = `record.html?type=${encodeURIComponent(recordType)}&id=${encodeURIComponent(record.id)}`;

    const image = document.createElement("img");
    image.src = record.cardImage || record.image;
    image.alt = record.name;
    image.loading = "lazy";
    if (record.imageFit) image.dataset.fit = record.imageFit;

    const data = document.createElement("div");
    data.className = "client-card-data";
    const id = document.createElement("span");
    id.textContent = record.id;
    const stage = document.createElement("span");
    stage.textContent = record.stage;
    data.append(id, stage);

    const heading = document.createElement("h3");
    heading.textContent = record.name;
    const type = document.createElement("p");
    type.textContent = record.cardType;

    card.append(image, data, heading, type);
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

renderPreviewGrid(clientGrid, clientRecords, "client", document.body.classList.contains("home-page") ? 7 : clientRecords.length);
renderPreviewGrid(document.querySelector("#anomaly-grid"), Object.values(window.MIDGAS_RECORDS?.anomaly || {}), "anomaly", 4);
renderPreviewGrid(document.querySelector("#incident-grid"), Object.values(window.MIDGAS_RECORDS?.incident || {}), "incident", 4);

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
const glossaryEntries = [...document.querySelectorAll("[data-glossary-entry]")];
const glossaryGroups = [...document.querySelectorAll("[data-glossary-group]")];
const glossaryEmpty = document.querySelector("#glossary-empty");
const glossaryFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const glossaryPanels = new Map();
let activeGlossaryFilter = "all";
let activeGlossaryEntry = null;

function normalizeGlossaryText(value) {
  return String(value || "").toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

function closeGlossaryEntry() {
  if (!activeGlossaryEntry) return;

  activeGlossaryEntry.classList.remove("is-open");
  activeGlossaryEntry.setAttribute("aria-expanded", "false");
  const group = activeGlossaryEntry.closest(".glossary-group");
  const panel = glossaryPanels.get(group);
  panel?.classList.remove("is-open");
  panel?.setAttribute("aria-hidden", "true");
  activeGlossaryEntry = null;
}

function openGlossaryEntry(entry) {
  if (!entry || entry.hidden) return;
  if (activeGlossaryEntry && activeGlossaryEntry !== entry) closeGlossaryEntry();

  const group = entry.closest(".glossary-group");
  const panel = glossaryPanels.get(group);
  const panelInner = panel?.querySelector(".glossary-definition-inner");
  if (!panel || !panelInner) return;

  const sourceMeta = entry.querySelector(":scope > div");
  const sourceDescription = entry.querySelector(":scope > p");
  const sourceLink = entry.querySelector(":scope > a");
  const code = sourceMeta?.querySelector(":scope > span")?.textContent?.trim() || "";
  const title = sourceMeta?.querySelector("h4")?.textContent?.trim() || "";
  const category = sourceMeta?.querySelector("em")?.textContent?.trim() || "";

  const heading = document.createElement("div");
  heading.className = "glossary-definition-heading";
  const headingCode = document.createElement("span");
  headingCode.textContent = code;
  const headingTitle = document.createElement("h4");
  headingTitle.textContent = title;
  const headingCategory = document.createElement("em");
  headingCategory.textContent = category;
  heading.append(headingCode, headingTitle, headingCategory);

  const body = document.createElement("div");
  body.className = "glossary-definition-copy";
  if (sourceDescription) body.append(sourceDescription.cloneNode(true));
  if (sourceLink) {
    const link = sourceLink.cloneNode(true);
    link.removeAttribute("tabindex");
    body.append(link);
  }

  panelInner.replaceChildren(heading, body);
  entry.classList.add("is-open");
  entry.setAttribute("aria-expanded", "true");
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  activeGlossaryEntry = entry;
}

function initializeGlossaryPanels() {
  glossaryGroups.forEach((group, index) => {
    const panel = document.createElement("div");
    panel.className = "glossary-definition-panel";
    panel.id = `glossary-definition-${index + 1}`;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-live", "polite");
    panel.setAttribute("aria-hidden", "true");

    const panelInner = document.createElement("div");
    panelInner.className = "glossary-definition-inner";
    panel.append(panelInner);
    group.append(panel);
    glossaryPanels.set(group, panel);

    group.addEventListener("mouseleave", () => {
      if (glossaryFinePointer.matches && !group.contains(document.activeElement)) closeGlossaryEntry();
    });

    group.addEventListener("focusout", () => {
      window.requestAnimationFrame(() => {
        if (glossaryFinePointer.matches && !group.contains(document.activeElement) && !group.matches(":hover")) {
          closeGlossaryEntry();
        }
      });
    });
  });

  glossaryEntries.forEach((entry) => {
    const group = entry.closest(".glossary-group");
    const panel = glossaryPanels.get(group);
    entry.tabIndex = 0;
    entry.setAttribute("role", "button");
    entry.setAttribute("aria-expanded", "false");
    if (panel) entry.setAttribute("aria-controls", panel.id);

    entry.addEventListener("mouseenter", () => {
      if (glossaryFinePointer.matches) openGlossaryEntry(entry);
    });

    entry.addEventListener("focus", () => openGlossaryEntry(entry));
    entry.addEventListener("click", () => {
      if (glossaryFinePointer.matches) {
        openGlossaryEntry(entry);
        return;
      }
      if (activeGlossaryEntry === entry) closeGlossaryEntry();
      else openGlossaryEntry(entry);
    });

    entry.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (activeGlossaryEntry === entry) closeGlossaryEntry();
      else openGlossaryEntry(entry);
    });
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

initializeGlossaryPanels();

glossaryFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeGlossaryFilter = button.dataset.glossaryFilter || "all";
    glossaryFilterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    updateGlossary();
  });
});

glossarySearch?.addEventListener("input", updateGlossary);

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
    { rootMargin: "0px 0px -7%", threshold: 0.06 },
  );

  motionTargets.forEach((element) => observer.observe(element));
}
