(() => {
  const portal = document.querySelector("[data-hero-rotator]");
  if (!portal) return;

  const slides = [...portal.querySelectorAll("[data-hero-slide]")];
  const controls = [...portal.querySelectorAll("[data-hero-go]")];
  const video = portal.querySelector("video");
  const sceneDuration = 7000;
  let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-active")));
  let rotationTimer = 0;
  let transitionTimer = 0;
  let paused = false;

  const scheduleNext = () => {
    window.clearTimeout(rotationTimer);
    if (paused || document.hidden) return;
    rotationTimer = window.setTimeout(() => activate((activeIndex + 1) % slides.length), sceneDuration);
  };

  const activate = (nextIndex) => {
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= slides.length) return;
    if (nextIndex === activeIndex) {
      scheduleNext();
      return;
    }

    const previous = slides[activeIndex];
    const next = slides[nextIndex];
    window.clearTimeout(transitionTimer);

    previous.classList.add("is-leaving");
    previous.classList.remove("is-active");
    previous.setAttribute("aria-hidden", "true");
    next.classList.remove("is-leaving");
    portal.dataset.heroScene = next.dataset.heroSlide || "all";

    window.requestAnimationFrame(() => {
      next.classList.add("is-active");
      next.setAttribute("aria-hidden", "false");
    });

    controls.forEach((control, index) => {
      const isActive = index === nextIndex;
      control.classList.toggle("is-active", isActive);
      if (isActive) control.setAttribute("aria-current", "true");
      else control.removeAttribute("aria-current");
    });

    activeIndex = nextIndex;
    transitionTimer = window.setTimeout(() => previous.classList.remove("is-leaving"), 1250);
    scheduleNext();
  };

  controls.forEach((control) => {
    control.addEventListener("click", () => activate(Number(control.dataset.heroGo)));
  });

  const pause = () => {
    paused = true;
    portal.classList.add("is-paused");
    window.clearTimeout(rotationTimer);
  };
  const resume = () => {
    paused = false;
    portal.classList.remove("is-paused");
    scheduleNext();
  };

  portal.addEventListener("focusin", pause);
  portal.addEventListener("focusout", (event) => {
    if (!portal.contains(event.relatedTarget)) resume();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.clearTimeout(rotationTimer);
    else scheduleNext();
  });

  if (video) {
    video.muted = true;
    video.defaultMuted = true;
    video.play().catch(() => {});
  }

  scheduleNext();
})();
