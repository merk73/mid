const params = new URLSearchParams(window.location.search);
const type = params.get("type") || "client";
const id = params.get("id") || "";
const source = params.get("from") || "";
const records = window.MIDGAS_RECORDS?.[type] || {};
const record = records[id];

const backLink = document.querySelector("#record-back");
if (backLink) {
  if (source === "topics") {
    backLink.href = "index.html#current-topics";
    backLink.lastChild.textContent = " Вернуться к актуальным темам";
  } else {
    backLink.href = `registry.html?type=${encodeURIComponent(type)}`;
    backLink.lastChild.textContent = " Вернуться к полному реестру";
  }
}

const content = document.querySelector("#record-content");
const overview = document.querySelector("#record-overview");
const lore = document.querySelector("#record-lore");
const empty = document.querySelector("#record-empty");

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function createMediaGrid(items) {
  const gallery = document.createElement("div");
  gallery.className = `lore-media-grid lore-media-count-${items.length}`;

  items.forEach((item) => {
    const figure = document.createElement("figure");
    figure.className = `lore-media lore-media-${item.aspect || "wide"}`;
    const mediaImage = document.createElement("img");
    mediaImage.src = item.src;
    mediaImage.alt = item.alt || "Архивный материал MIDGAS";
    mediaImage.loading = "lazy";
    const caption = document.createElement("figcaption");
    caption.textContent = item.caption || "АРХИВ MIDGAS";
    figure.append(mediaImage, caption);
    gallery.append(figure);
  });

  return gallery;
}

if (!record) {
  empty.hidden = false;
} else {
  document.body.dataset.recordType = type;
  if (headerBackButton) headerBackButton.dataset.fallback = `registry.html?type=${encodeURIComponent(type)}`;
  document.title = `${record.id} — ${record.name} — THE MIDGAS`;
  setText("#record-id", record.id);
  setText("#record-kind", record.kind);
  setText("#record-name", record.name);
  setText("#record-alias", record.alias);
  setText("#record-image-id", record.id);
  setText("#record-summary", record.summary);

  const image = document.querySelector("#record-image");
  image.src = record.image;
  image.alt = record.name;
  if (record.imageFit) image.dataset.fit = record.imageFit;

  const fields = document.querySelector("#record-fields");
  record.fields.forEach(([term, value]) => {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    wrapper.append(dt, dd);
    fields.append(wrapper);
  });

  const sections = document.querySelector("#record-sections");
  if (record.sections.length) {
    if (record.loreState === "partial") {
      const notice = document.createElement("div");
      notice.className = "lore-editorial-note";
      const label = document.createElement("strong");
      label.textContent = "РЕДАКЦИОННЫЙ СТАТУС";
      const text = document.createElement("span");
      text.textContent = record.loreNote;
      notice.append(label, text);
      sections.append(notice);
    }
    const explicitRelations = Array.isArray(record.editorRelations) ? record.editorRelations : null;
    record.sections.forEach((section, index) => {
      const article = document.createElement("article");
      article.className = "lore-section";

      const number = document.createElement("span");
      number.className = "lore-number";
      number.textContent = String(index + 1).padStart(2, "0");

      const body = document.createElement("div");
      const heading = document.createElement("h3");
      heading.textContent = section.title;
      body.append(heading);

      const sectionImage = typeof section.image === "string" ? { src: section.image } : section.image;
      if (sectionImage?.src) {
        const sectionImageGrid = createMediaGrid([{
          ...sectionImage,
          alt: sectionImage.alt || section.title || "Фотография раздела MIDGAS",
          caption: sectionImage.caption || "ФОТОМАТЕРИАЛ MIDGAS",
          aspect: sectionImage.aspect || "wide",
        }]);
        sectionImageGrid.classList.add("lore-section-image");
        body.append(sectionImageGrid);
      }

      section.paragraphs.forEach((paragraph, paragraphIndex) => {
        const element = document.createElement("p");
        element.textContent = paragraph;
        body.append(element);

        const inlineMedia = section.media?.filter((item) => item.afterParagraph === paragraphIndex) || [];
        if (inlineMedia.length) body.append(createMediaGrid(inlineMedia));
      });

      if (section.media?.length) {
        const trailingMedia = section.media.filter((item) => !Number.isInteger(item.afterParagraph));
        if (trailingMedia.length) body.append(createMediaGrid(trailingMedia));
      }

      const relationItems = (explicitRelations ? (index === 0 ? explicitRelations : []) : (section.relatedRecords || []))
        .filter((item) => window.MIDGAS_RECORDS?.[item.type]?.[item.id]);
      if (relationItems.length) {
        const related = document.createElement("div");
        related.className = "related-records";
        const relatedLabel = document.createElement("strong");
        relatedLabel.textContent = "СВЯЗАННЫЕ ЗАПИСИ";
        const relatedList = document.createElement("div");
        relatedList.className = "related-record-list";

        relationItems.forEach((item) => {
          const link = document.createElement("a");
          link.href = `record.html?type=${encodeURIComponent(item.type)}&id=${encodeURIComponent(item.id)}`;
          link.textContent = item.label || item.id;
          relatedList.append(link);
        });

        related.append(relatedLabel, relatedList);
        body.append(related);
      }

      article.append(number, body);
      sections.append(article);
    });
    window.renderMidgasResearch?.(record, sections);
  } else {
    const pending = document.createElement("div");
    pending.className = "lore-pending";
    const heading = document.createElement("strong");
    heading.textContent = type === "client" ? "ТРЕБУЕТСЯ УНИКАЛЬНЫЙ ЛОР" : "МАТЕРИАЛЫ ГОТОВЯТСЯ";
    const note = document.createElement("span");
    note.textContent = record.loreNote || "Уникальное описание для клиента пока отсутствует.";
    pending.append(heading, note);
    sections.append(pending);
  }

  content.hidden = false;
  overview.hidden = false;
  lore.hidden = false;
}
