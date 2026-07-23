(() => {
  "use strict";

  const root = document.documentElement;
  const homePage = document.body.classList.contains("home-page");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(navigator.connection?.saveData);
  const recordPage = document.querySelector("main.record-page");

  function primeImage(image) {
    if (!(image instanceof HTMLImageElement)) return;
    image.decoding = "async";
    image.loading = "eager";
    if (!image.closest(".hero-cover, .record-portrait, .history-hero")) image.fetchPriority = "low";
  }

  const images = [...document.images];
  images.forEach(primeImage);

  const imageObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (node instanceof HTMLImageElement) primeImage(node);
      node.querySelectorAll?.("img").forEach(primeImage);
    }));
  });
  imageObserver.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => imageObserver.disconnect(), 30000);

  if (homePage) {
    root.classList.add("home-preload-all");
    Promise.allSettled(images.filter((image) => image.src).map((image) => image.decode?.())).then(() => {
      root.classList.add("home-assets-ready");
      window.dispatchEvent(new CustomEvent("midgas:home-assets-ready"));
    });
  }

  const revealTargets = recordPage || reduceMotion
    ? []
    : [...document.querySelectorAll("main > section:not(.hero-cover), .account-profile, .account-tools, .workspace-actions, .workspace-content, .workspace-journal")];

  if (revealTargets.length) {
    root.classList.add("motion-enabled");
    revealTargets.forEach((target, index) => {
      target.classList.add("motion-reveal");
      target.style.setProperty("--motion-order", String(index % 3));
    });
    if (!("IntersectionObserver" in window)) {
      revealTargets.forEach((target) => target.classList.add("is-visible"));
    } else {
      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      }, {
        rootMargin: homePage ? "115% 0px 115%" : "55% 0px 40%",
        threshold: 0.001,
      });
      revealTargets.forEach((target) => {
        if (target.getBoundingClientRect().top < window.innerHeight * 2.15) target.classList.add("is-visible");
        else revealObserver.observe(target);
      });
    }
  }

  const parallaxTargets = reduceMotion || saveData ? [] : [...document.querySelectorAll([
    ".hero-group-photo > img",
    ".topic-strip > img",
    ".historical-archive-cover > img",
    ".company-quotes-image > img",
    ".company-board-preview-image",
    ".catalog-hero img",
    ".record-portrait > img",
  ].join(","))].filter((element) => !element.closest("[data-company-parallax]"));

  let motionFrame = 0;
  function renderParallax() {
    motionFrame = 0;
    const viewport = window.innerHeight || 1;
    const mobileFactor = window.innerWidth <= 760 ? 0.42 : 0.72;
    parallaxTargets.forEach((element) => {
      const rect = element.parentElement?.getBoundingClientRect?.() || element.getBoundingClientRect();
      if (rect.bottom < -viewport * .25 || rect.top > viewport * 1.25) return;
      const progress = (rect.top + rect.height / 2 - viewport / 2) / viewport;
      const travel = Math.max(-42, Math.min(42, progress * -52 * mobileFactor));
      element.style.translate = `0 ${travel.toFixed(2)}px`;
    });
  }
  function requestParallax() {
    if (!motionFrame) motionFrame = window.requestAnimationFrame(renderParallax);
  }

  if (parallaxTargets.length) {
    root.classList.add("site-parallax-enabled");
    renderParallax();
    window.addEventListener("scroll", requestParallax, { passive: true });
    window.addEventListener("resize", requestParallax, { passive: true });
  }

  window.MIDGAS_SITE_MOTION = Object.freeze({ refresh: requestParallax });
})();
