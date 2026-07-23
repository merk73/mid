(() => {
  const entries = window.MIDGAS_DEPLOY_HISTORY || [];
  const list = document.querySelector("[data-deploy-list]");
  const count = document.querySelector("[data-deploy-count]");
  if (count) count.textContent = String(entries.length).padStart(2, "0");
  if (!list) return;
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Vladivostok",
  });

  const cleanText = (value) => String(value || "")
    .replace(/(?:^|\s)(?:этап|stage)\s*\d+\s*[:—–-]?\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  list.replaceChildren(...entries.map((entry) => {
    const article = document.createElement("article");
    article.className = "deploy-log-entry";
    const revision = String(entry.revision).padStart(3, "0");
    const title = cleanText(entry.title) || "Обновлён сайт";
    const changes = (entry.changes || [])
      .map(cleanText)
      .filter((item, index, items) => item && item.replace(/[.!?]+$/, "") !== title.replace(/[.!?]+$/, "") && items.indexOf(item) === index);

    const header = document.createElement("header");
    const label = document.createElement("span");
    const time = document.createElement("time");
    label.textContent = `ОБНОВЛЕНИЕ / ${revision}`;
    time.dateTime = entry.date;
    time.textContent = formatter.format(new Date(entry.date));
    header.append(label, time);

    const content = document.createElement("div");
    const heading = document.createElement("h2");
    heading.textContent = title;
    content.append(heading);
    if (changes.length) {
      const details = document.createElement("ul");
      details.replaceChildren(...changes.map((change) => {
        const item = document.createElement("li");
        item.textContent = change;
        return item;
      }));
      content.append(details);
    }

    const hash = document.createElement("code");
    hash.textContent = entry.hash;
    article.append(header, content, hash);
    return article;
  }));
})();
