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
  list.replaceChildren(...entries.map((entry) => {
    const article = document.createElement("article");
    article.className = "deploy-log-entry";
    const revision = String(entry.revision).padStart(3, "0");
    const changes = (entry.changes || [entry.title]).map((item) => `<li>${item}</li>`).join("");
    article.innerHTML = `<header><span>ОБНОВЛЕНИЕ / ${revision}</span><time datetime="${entry.date}">${formatter.format(new Date(entry.date))}</time></header><div><h2>${entry.title}</h2><ul>${changes}</ul></div><code>${entry.hash}</code>`;
    return article;
  }));
})();
