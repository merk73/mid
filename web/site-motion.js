(() => {
  "use strict";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const targets = [...document.querySelectorAll("main > section:not(.hero-cover), .account-profile, .account-tools, .workspace-actions, .workspace-content, .workspace-journal")];
  if (!targets.length || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("motion-enabled");
  targets.forEach((target) => target.classList.add("motion-reveal"));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: 0.05 });
  targets.forEach((target) => observer.observe(target));
})();
