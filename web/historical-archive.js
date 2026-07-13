const historyEntries = [...document.querySelectorAll(".timeline-entry")];
const historyScenes = [...document.querySelectorAll(".archive-scene")];
const historyTimeline = document.querySelector(".history-timeline");
const historyProgress = document.querySelector("#timeline-progress");
const historyProgressBar = document.querySelector(".timeline-progress");
const historyRail = document.querySelector(".timeline-rail");
const historyRailLinks = [...document.querySelectorAll(".timeline-rail a")];
const historyDossiers = [...document.querySelectorAll(".timeline-dossier")];

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarsePointer = window.matchMedia("(pointer: coarse)");
const narrowViewport = window.matchMedia("(max-width: 760px)");
const saveData = navigator.connection?.saveData === true;
const dossierStorageKey = "midgas:historical-archive:dossiers:v1";
const visibleScenes = new Set();

let frameRequested = false;
let activeEntryId = "";

if (!reduceMotion.matches && historyEntries.length) {
  document.documentElement.classList.add("archive-motion-ready");
}

const entryObserver = new IntersectionObserver(
  (records) => {
    records.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) target.classList.add("is-visible");
    });
  },
  { rootMargin: "0px 0px -10%", threshold: 0.08 },
);

const sceneObserver = new IntersectionObserver(
  (records) => {
    records.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) visibleScenes.add(target);
      else visibleScenes.delete(target);
    });
    scheduleArchiveFrame();
  },
  { rootMargin: "28% 0px" },
);

historyEntries.forEach((entry) => {
  if (reduceMotion.matches) entry.classList.add("is-visible");
  else entryObserver.observe(entry);
});
historyScenes.forEach((scene) => sceneObserver.observe(scene));

function readDossierState() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(dossierStorageKey) || "[]"));
  } catch {
    return new Set();
  }
}

const openDossiers = readDossierState();

function syncDossierLabel(details) {
  const label = details.querySelector(".timeline-dossier-label");
  if (label) label.textContent = details.open ? "СВЕРНУТЬ ДОСЬЕ" : "ЧИТАТЬ ДАЛЕЕ";
}

historyDossiers.forEach((details) => {
  const key = details.dataset.dossierKey;
  details.open = openDossiers.has(key);
  syncDossierLabel(details);

  details.addEventListener("toggle", () => {
    if (details.open) openDossiers.add(key);
    else openDossiers.delete(key);

    try {
      sessionStorage.setItem(dossierStorageKey, JSON.stringify([...openDossiers]));
    } catch {
      // Session persistence is optional; interaction must continue without it.
    }

    syncDossierLabel(details);
    scheduleArchiveFrame();
  });
});

function revealHashTarget() {
  if (!window.location.hash) return;

  let target;
  try {
    target = document.querySelector(decodeURIComponent(window.location.hash));
  } catch {
    return;
  }

  const parentDetails = target?.matches("details") ? target : target?.closest("details");
  if (parentDetails) {
    parentDetails.open = true;
    syncDossierLabel(parentDetails);
  }
}

function updateHistoryProgress() {
  if (!historyTimeline || !historyProgress) return;

  const rect = historyTimeline.getBoundingClientRect();
  const available = Math.max(historyTimeline.offsetHeight - window.innerHeight, 1);
  const travelled = Math.min(Math.max(-rect.top, 0), available);
  const progress = travelled / available;
  const percentage = Math.round(progress * 100);

  historyProgress.style.setProperty("--progress", progress.toFixed(4));
  historyProgressBar?.setAttribute("aria-valuenow", String(percentage));
}

function updateActiveEntry() {
  let nextEntry = historyEntries[0] || null;

  historyEntries.forEach((entry) => {
    if (entry.getBoundingClientRect().top <= window.innerHeight * 0.43) {
      nextEntry = entry;
    }
  });

  const nextEntryHash = nextEntry?.id ? `#${nextEntry.id}` : "";

  historyRailLinks.forEach((link) => {
    const isActive = link.hash === nextEntryHash;
    link.classList.toggle("is-active", isActive);
    if (isActive) link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
  });

  if (nextEntryHash !== activeEntryId) {
    activeEntryId = nextEntryHash;
    const activeLink = historyRailLinks.find((link) => link.getAttribute("aria-current") === "step");
    if (activeLink && window.innerWidth <= 980) {
      activeLink.scrollIntoView({ block: "nearest", inline: "center", behavior: reduceMotion.matches ? "auto" : "smooth" });
    }
  }
}

function updateParallax() {
  const parallaxEnabled =
    !reduceMotion.matches &&
    !coarsePointer.matches &&
    !narrowViewport.matches &&
    !saveData;

  visibleScenes.forEach((scene) => {
    const rect = scene.getBoundingClientRect();
    const distance = (window.innerHeight / 2 - (rect.top + rect.height / 2)) / window.innerHeight;
    const progress = Math.max(-1, Math.min(1, distance));

    scene.querySelectorAll("[data-parallax]").forEach((layer) => {
      const range = layer.dataset.parallax === "cutout" ? 76 : 38;
      layer.style.setProperty("--parallax-y", parallaxEnabled ? String(progress * range) + "px" : "0px");
    });
  });
}

function renderArchiveFrame() {
  frameRequested = false;
  updateHistoryProgress();
  updateActiveEntry();
  updateParallax();
}

function scheduleArchiveFrame() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(renderArchiveFrame);
}

revealHashTarget();
scheduleArchiveFrame();

window.addEventListener("hashchange", revealHashTarget);
window.addEventListener("scroll", scheduleArchiveFrame, { passive: true });
window.addEventListener("resize", scheduleArchiveFrame);
reduceMotion.addEventListener?.("change", scheduleArchiveFrame);
narrowViewport.addEventListener?.("change", scheduleArchiveFrame);
coarsePointer.addEventListener?.("change", scheduleArchiveFrame);

historyRail?.addEventListener("click", () => scheduleArchiveFrame());
