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
      target.classList.toggle("is-in-viewport", isIntersecting);
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

historyDossiers.forEach((details) => {
  details.open = true;
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
  const parallaxEnabled = !reduceMotion.matches && !saveData;
  const compactMotion = narrowViewport.matches || coarsePointer.matches;

  visibleScenes.forEach((scene) => {
    const rect = scene.getBoundingClientRect();
    const travel = (window.innerHeight - rect.top) / Math.max(window.innerHeight + rect.height, 1);
    const progress = Math.max(-1, Math.min(1, travel * 2 - 1));

    scene.querySelectorAll("[data-parallax]").forEach((layer) => {
      const isCutout = layer.dataset.parallax === "cutout";
      const range = isCutout ? (compactMotion ? 26 : 92) : compactMotion ? 12 : 42;
      const direction = isCutout ? -1 : 1;
      const y = parallaxEnabled ? progress * range * direction : 0;
      layer.style.setProperty("--parallax-y", `${y.toFixed(2)}px`);

      if (isCutout) {
        const side = layer.classList.contains("archive-scene-cutout--left") ? -1 : 1;
        const xRange = compactMotion ? 4 : 15;
        const rotateRange = compactMotion ? 0 : 1.05;
        const x = parallaxEnabled ? progress * xRange * side : 0;
        const rotation = parallaxEnabled ? progress * rotateRange * side : 0;
        layer.style.setProperty("--parallax-x", `${x.toFixed(2)}px`);
        layer.style.setProperty("--parallax-rotate", `${rotation.toFixed(3)}deg`);
      }
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
reduceMotion.addEventListener?.("change", ({ matches }) => {
  document.documentElement.classList.toggle("archive-motion-ready", !matches && historyEntries.length > 0);
  if (matches) historyEntries.forEach((entry) => entry.classList.add("is-visible"));
  scheduleArchiveFrame();
});
narrowViewport.addEventListener?.("change", scheduleArchiveFrame);
coarsePointer.addEventListener?.("change", scheduleArchiveFrame);

historyRail?.addEventListener("click", () => scheduleArchiveFrame());
