(() => {
  "use strict";
  const root = document.querySelector("[data-hero-topics]");
  if (!root) return;
  const topics = [
    { heading: "КЛИЕНТЫ", summary: "Наблюдаемые субъекты внутреннего архива.", type: "client", id: "MID-C-0024", name: "Анна Мацкевич", caption: "Клиент / наблюдаемый субъект", image: "assets/topics/anna-matskevich-topic.webp" },
    { heading: "АНОМАЛИИ", summary: "Места и феномены, меняющие известные правила.", type: "anomaly", id: "MID-A-0001", name: "Андреевская аномалия", caption: "Активная зона / Андреевка", image: "assets/topics/andreevka-anomaly.webp" },
    { heading: "ИНЦИДЕНТЫ", summary: "События, связывающие людей, места и последствия.", type: "incident", id: "MID-I-0001", name: "СТРАХОМАХА.EXE", caption: "Цифровой инцидент / активен", image: "assets/topics/strakhomakha-exe.webp" },
  ];
  const card = root.querySelector("[data-hero-card]");
  const image = root.querySelector("[data-hero-image]");
  const controls = [...root.querySelectorAll("[data-hero-topic]")];
  let index = 0;
  let timer = 0;
  function show(nextIndex) {
    index = (nextIndex + topics.length) % topics.length;
    const topic = topics[index];
    root.classList.add("is-changing");
    window.setTimeout(() => {
      root.querySelector("[data-hero-heading]").textContent = topic.heading;
      root.querySelector("[data-hero-summary]").textContent = topic.summary;
      root.querySelector("[data-hero-code]").textContent = topic.id;
      root.querySelector("[data-hero-name]").textContent = topic.name;
      root.querySelector("[data-hero-caption]").textContent = topic.caption;
      card.href = `record.html?type=${topic.type}&id=${topic.id}&from=topics`;
      image.src = topic.image; image.alt = topic.name;
      controls.forEach((button, itemIndex) => button.setAttribute("aria-current", String(itemIndex === index)));
      root.classList.remove("is-changing");
    }, 220);
  }
  function schedule() { window.clearInterval(timer); timer = window.setInterval(() => show(index + 1), 5000); }
  controls.forEach((button, itemIndex) => button.addEventListener("click", () => { show(itemIndex); schedule(); }));
  document.addEventListener("visibilitychange", () => document.hidden ? window.clearInterval(timer) : schedule());
  schedule();
})();
