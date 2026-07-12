const registryParams = new URLSearchParams(window.location.search);
const requestedType = registryParams.get("type") || "client";
const registryType = ["client", "anomaly", "incident"].includes(requestedType) ? requestedType : "client";

const registryConfig = {
  client: {
    code: "DIRECTORY / C",
    title: "ВСЕ КЛИЕНТЫ",
    description: "Люди, существа и наблюдаемые субъекты, зарегистрированные институтом THE MIDGAS.",
  },
  anomaly: {
    code: "DIRECTORY / A",
    title: "ВСЕ АНОМАЛИИ",
    description: "Места, зоны и территориальные объекты с устойчивым аномальным воздействием.",
  },
  incident: {
    code: "DIRECTORY / I",
    title: "ВСЕ ИНЦИДЕНТЫ",
    description: "События и активные процессы, объединяющие клиентов, территории и технические системы.",
  },
};

const registryRecords = Object.values(window.MIDGAS_RECORDS?.[registryType] || {})
  .sort((left, right) => left.id.localeCompare(right.id, "ru"));
const registryGrid = document.querySelector("#registry-grid");
const registryEmpty = document.querySelector("#catalog-empty");
const controls = document.querySelector("#catalog-controls");
const filters = document.querySelector("#catalog-filters");

document.body.dataset.registryType = registryType;
document.title = `${registryConfig[registryType].title} — THE MIDGAS`;
document.querySelector("#catalog-code").textContent = registryConfig[registryType].code;
document.querySelector("#catalog-title").textContent = registryConfig[registryType].title;
document.querySelector("#catalog-description").textContent = registryConfig[registryType].description;
document.querySelector("#catalog-count").textContent = `${String(registryRecords.length).padStart(4, "0")} ЗАПИСЕЙ`;

function createRegistryCard(record) {
  const card = document.createElement("a");
  card.className = "client-card registry-card";
  card.dataset.status = record.sections?.length ? "lore" : "missing";
  card.href = `record.html?type=${encodeURIComponent(registryType)}&id=${encodeURIComponent(record.id)}`;

  const image = document.createElement("img");
  image.src = record.cardImage || record.image;
  image.alt = record.name;
  image.loading = "lazy";
  if (record.imageFit) image.dataset.fit = record.imageFit;

  const data = document.createElement("div");
  data.className = "client-card-data";
  const id = document.createElement("span");
  id.textContent = record.id;
  const stage = document.createElement("span");
  stage.textContent = record.stage;
  data.append(id, stage);

  const heading = document.createElement("h3");
  heading.textContent = record.name;
  const type = document.createElement("p");
  type.textContent = record.cardType;
  card.append(image, data, heading, type);
  return card;
}

registryRecords.forEach((record) => registryGrid.append(createRegistryCard(record)));
registryEmpty.hidden = registryRecords.length > 0;

if (registryType === "client") {
  controls.hidden = false;
  const loreCount = registryRecords.filter((record) => record.sections?.length).length;
  const filterData = [
    ["all", `ВСЕ / ${registryRecords.length}`],
    ["lore", `С ЛОРОМ / ${loreCount}`],
    ["missing", `БЕЗ ЛОРА / ${registryRecords.length - loreCount}`],
  ];

  filterData.forEach(([value, label], index) => {
    const button = document.createElement("button");
    button.className = `filter-button${index === 0 ? " is-active" : ""}`;
    button.type = "button";
    button.dataset.filter = value;
    button.textContent = label;
    button.addEventListener("click", () => {
      filters.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
      registryGrid.querySelectorAll(".registry-card").forEach((card) => {
        card.hidden = value !== "all" && card.dataset.status !== value;
      });
    });
    filters.append(button);
  });
}
