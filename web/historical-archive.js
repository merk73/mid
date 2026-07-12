const historyEntries = [...document.querySelectorAll(".timeline-entry")];
const historyTimeline = document.querySelector(".history-timeline");
const historyProgress = document.querySelector("#timeline-progress");
const historyRailLinks = [...document.querySelectorAll(".timeline-rail a")];

if (historyEntries.length) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    historyEntries.forEach((entry) => entry.classList.add("is-visible"));
  } else {
    const entryObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      { rootMargin: "0px 0px -12%", threshold: 0.12 },
    );
    historyEntries.forEach((entry) => entryObserver.observe(entry));
  }
}

function updateHistoryProgress() {
  if (!historyTimeline || !historyProgress) return;
  const rect = historyTimeline.getBoundingClientRect();
  const available = Math.max(historyTimeline.offsetHeight - window.innerHeight, 1);
  const travelled = Math.min(Math.max(-rect.top, 0), available);
  historyProgress.style.width = `${(travelled / available) * 100}%`;

  let activeId = "";
  historyEntries.forEach((entry) => {
    if (entry.getBoundingClientRect().top <= window.innerHeight * 0.42 && entry.id) activeId = entry.id;
  });
  historyRailLinks.forEach((link) => link.classList.toggle("is-active", link.hash === `#${activeId}`));
}

updateHistoryProgress();
window.addEventListener("scroll", updateHistoryProgress, { passive: true });
window.addEventListener("resize", updateHistoryProgress);
