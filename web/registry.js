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

const grid = document.querySelector("#registry-grid");
const empty = document.querySelector("#catalog-empty");
const filters = document.querySelector("#catalog-filters");
const search = document.querySelector("#catalog-search");
const searchClear = document.querySelector("#catalog-search-clear");
const sort = document.querySelector("#catalog-sort");
const reset = document.querySelector("#catalog-reset");
const visibleCount = document.querySelector("#catalog-visible-count");
const viewButtons = [...document.querySelectorAll("[data-catalog-view]")];
const state = { query: "", filter: "all", sort: "id", view: "grid" };
let records = [];

document.body.dataset.registryType = registryType;
document.title = `${registryConfig[registryType].title} — THE MIDGAS`;
document.querySelector("#catalog-code").textContent = registryConfig[registryType].code;
document.querySelector("#catalog-title").textContent = registryConfig[registryType].title;
document.querySelector("#catalog-description").textContent = registryConfig[registryType].description;

function normalise(value) {
  return String(value || "").toLocaleLowerCase("ru").replaceAll("ё", "е").trim();
}

function fieldValue(record, pattern) {
  const pair = (record.fields || []).find(([name]) => pattern.test(String(name || "")));
  return String(pair?.[1] || "");
}

function recordLevel(record, kind) {
  const value = fieldValue(record, kind === "threat" ? /уровень угрозы/i : /уровень доступа|осведомленность клиента/i);
  const match = value.match(new RegExp(`${kind === "threat" ? "T" : "D"}([1-5])`, "i"));
  return match ? Number(match[1]) : 0;
}

function hasLocation(record) {
  const lat = Number(record?.geo?.lat);
  const lng = Number(record?.geo?.lng);
  return (Number.isFinite(lat) && Number.isFinite(lng)) || Boolean(fieldValue(record, /местополож|локац|город|регион/i).trim());
}

function hasRelations(record) {
  if (Array.isArray(record.editorRelations) && record.editorRelations.length) return true;
  return (record.sections || []).some((section) => Array.isArray(section.relatedRecords) && section.relatedRecords.length);
}

function matchesSmartFilter(record, filter) {
  if (filter === "danger") return recordLevel(record, "threat") >= 4;
  if (filter === "access") return recordLevel(record, "access") >= 4;
  if (filter === "located") return hasLocation(record);
  if (filter === "linked") return hasRelations(record);
  return true;
}

function searchText(record) {
  return normalise([
    record.id, record.name, record.alias, record.cardType, record.summary,
    fieldValue(record, /местополож|локац|город|регион/i),
  ].join(" "));
}

function newestTime(record) {
  const raw = record.createdAt || record.created_at || record.editorCreatedAt || record.supabaseCreatedAt
    || record.updatedAt || record.updated_at || record.editorUpdatedAt || record.supabaseUpdatedAt || "";
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function recordSequence(record) {
  const match = String(record.id || "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function createRegistryCard(record) {
  const card = document.createElement("a");
  card.className = "client-card registry-card";
  card.dataset.search = searchText(record);
  card.href = `record.html?type=${encodeURIComponent(registryType)}&id=${encodeURIComponent(record.id)}`;

  const image = document.createElement("img");
  image.src = record.cardImage || record.image;
  image.alt = record.name;
  image.loading = "lazy";
  image.decoding = "async";
  if (record.imageFit) image.dataset.fit = record.imageFit;

  const idOverlay = document.createElement("span");
  idOverlay.className = "client-card-id-overlay";
  idOverlay.textContent = record.id;

  const data = document.createElement("div");
  data.className = "client-card-data";
  const id = document.createElement("span");
  id.textContent = record.id;
  data.append(id);
  if (registryType === "client") {
    data.classList.add("client-card-data--levels");
    data.append(window.MIDGAS_CREATE_CLIENT_CARD_LEVELS(record));
  }

  const heading = document.createElement("h3");
  heading.textContent = record.name;
  const type = document.createElement("p");
  type.textContent = record.cardType;
  card.append(image, idOverlay, data, heading, type);
  return card;
}

function createRegistryAddCard() {
  const link = document.createElement("a");
  link.className = "registry-create-card";
  link.href = `editor.html?create=${encodeURIComponent(registryType)}`;
  const icon = document.createElement("span");
  icon.textContent = "+";
  const title = document.createElement("strong");
  title.textContent = "НОВАЯ КАРТОЧКА";
  const note = document.createElement("small");
  note.textContent = registryType === "client" ? "ДОБАВИТЬ КЛИЕНТА" : registryType === "anomaly" ? "ДОБАВИТЬ АНОМАЛИЮ" : "ДОБАВИТЬ ИНЦИДЕНТ";
  link.append(icon, title, note);
  return link;
}

function filterDefinitions() {
  if (registryType === "client") return [
    ["all", "ВСЕ"], ["danger", "УГРОЗА T4–T5"], ["access", "ДОСТУП D4–D5"], ["located", "ЕСТЬ ЛОКАЦИЯ"], ["linked", "ЕСТЬ СВЯЗИ"],
  ];
  return [["all", "ВСЕ"], ["located", "ЕСТЬ ЛОКАЦИЯ"], ["linked", "ЕСТЬ СВЯЗИ"]];
}

function renderFilters() {
  filters.replaceChildren();
  filterDefinitions().forEach(([value, label]) => {
    const count = records.filter((record) => matchesSmartFilter(record, value)).length;
    const button = document.createElement("button");
    button.className = `filter-button${state.filter === value ? " is-active" : ""}`;
    button.type = "button";
    button.dataset.filter = value;
    button.textContent = `${label} / ${count}`;
    button.addEventListener("click", () => {
      state.filter = value;
      renderFilters();
      renderRecords();
    });
    filters.append(button);
  });
}

function sortedVisibleRecords() {
  const query = normalise(state.query);
  return records
    .filter((record) => matchesSmartFilter(record, state.filter))
    .filter((record) => !query || searchText(record).includes(query))
    .sort((left, right) => {
      if (state.sort === "name") return String(left.name).localeCompare(String(right.name), "ru");
      if (state.sort === "updated") {
        return newestTime(right) - newestTime(left)
          || recordSequence(right) - recordSequence(left)
          || String(right.id).localeCompare(String(left.id), "ru");
      }
      return String(left.id).localeCompare(String(right.id), "ru");
    });
}

function updateView() {
  grid.classList.toggle("is-list-view", state.view === "list");
  viewButtons.forEach((button) => {
    const active = button.dataset.catalogView === state.view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderRecords() {
  const visible = sortedVisibleRecords();
  const nodes = visible.map(createRegistryCard);
  if (!state.query && state.filter === "all") nodes.push(createRegistryAddCard());
  grid.replaceChildren(...nodes);
  empty.hidden = visible.length > 0;
  visibleCount.textContent = `ПОКАЗАНО: ${String(visible.length).padStart(4, "0")} ИЗ ${String(records.length).padStart(4, "0")}`;
  document.querySelector("#catalog-count").textContent = `${String(records.length).padStart(4, "0")} ЗАПИСЕЙ`;
  searchClear.hidden = !state.query;
  reset.hidden = !state.query && state.filter === "all" && state.sort === "id";
  updateView();
}

function refreshRegistryFromSource() {
  records = Object.values(window.MIDGAS_RECORDS?.[registryType] || {});
  renderFilters();
  renderRecords();
}

search.addEventListener("input", () => {
  state.query = search.value;
  renderRecords();
});
searchClear.addEventListener("click", () => {
  search.value = "";
  state.query = "";
  search.focus();
  renderRecords();
});
sort.addEventListener("change", () => {
  state.sort = sort.value;
  renderRecords();
});
reset.addEventListener("click", () => {
  state.query = "";
  state.filter = "all";
  state.sort = "id";
  search.value = "";
  sort.value = "id";
  renderFilters();
  renderRecords();
});
viewButtons.forEach((button) => button.addEventListener("click", () => {
  state.view = button.dataset.catalogView;
  try { localStorage.setItem("midgas:registry-view", state.view); } catch { /* storage can be blocked */ }
  updateView();
}));

try {
  const savedView = localStorage.getItem("midgas:registry-view");
  if (["grid", "list"].includes(savedView)) state.view = savedView;
} catch { /* storage can be blocked */ }

refreshRegistryFromSource();
window.addEventListener("midgas:records-ready", refreshRegistryFromSource);
window.addEventListener("midgas:record-mutated", refreshRegistryFromSource);
