(() => {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const recordPage = document.querySelector("main.record-page");
  const targets = recordPage || reduceMotion
    ? []
    : [...document.querySelectorAll("main > section:not(.hero-cover), .account-profile, .account-tools, .workspace-actions, .workspace-content, .workspace-journal")];

  const lazyImages = [...document.querySelectorAll('img[loading="lazy"]')];
  if (lazyImages.length && "IntersectionObserver" in window) {
    const preloadObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.loading = "eager";
        preloadObserver.unobserve(entry.target);
      });
    }, { rootMargin: "140% 0px", threshold: 0.01 });
    lazyImages.forEach((image) => preloadObserver.observe(image));
  }

  if (!targets.length || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("motion-enabled");
  targets.forEach((target) => target.classList.add("motion-reveal"));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "70% 0px 55%", threshold: 0.01 });
  targets.forEach((target) => observer.observe(target));
})();
