import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});

try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:43129/index.html", { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("midgas-editor-images-v1");
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  await page.reload({ waitUntil: "networkidle" });

  const result = await page.evaluate(async () => {
    MIDGAS_EDITOR_SESSION.signIn({ email: "browser-smoke@midgas.test" });
    const cover = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const sectionPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n1cAAAAASUVORK5CYII=";
    const created = await MIDGAS_EDITOR_STORE.create({
      type: "client",
      name: "INDEXEDDB SMOKE",
      alias: "IDB",
      cardType: "Клиент",
      status: "НАБЛЮДЕНИЕ",
      location: "Тестовый сектор",
      summary: "Проверка хранения",
      description: "Проверка хранения пользовательских изображений.",
      image: cover,
      relations: [],
    });
    await MIDGAS_EDITOR_STORE.update("client", created.record.id, {
      sections: [{
        title: "ПЕРВИЧНАЯ РЕГИСТРАЦИЯ",
        paragraphs: ["Тестовый абзац"],
        image: { src: sectionPhoto, caption: "Тест" },
      }],
    });

    const raw = localStorage.getItem(MIDGAS_EDITOR_STORE.storageKey) || "";
    const parsed = JSON.parse(raw);
    const entry = Object.values(parsed.records).find((item) => item.id === created.record.id);
    const keys = await new Promise((resolve, reject) => {
      const open = indexedDB.open("midgas-editor-images-v1", 1);
      open.onsuccess = () => {
        const request = open.result.transaction("images", "readonly").objectStore("images").getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      };
      open.onerror = () => reject(open.error);
    });
    return {
      id: created.record.id,
      containsInlineImage: raw.includes("data:image/"),
      coverReference: entry.record.image,
      sectionReference: entry.record.sections[0].image.src,
      imageCount: keys.length,
    };
  });

  assert.equal(result.containsInlineImage, false);
  assert.match(result.coverReference, /^midgas-image:/);
  assert.match(result.sectionReference, /^midgas-image:/);
  assert.ok(result.imageCount >= 2);

  await page.reload({ waitUntil: "networkidle" });
  const restored = await page.evaluate(async (id) => {
    await MIDGAS_EDITOR_STORE.imagesReady;
    const record = MIDGAS_EDITOR_STORE.get("client", id);
    return {
      cover: record?.image || "",
      section: record?.sections?.[0]?.image?.src || "",
    };
  }, result.id);
  assert.match(restored.cover, /^blob:/);
  assert.match(restored.section, /^blob:/);

  console.log("editor images browser smoke: ok");
} finally {
  await browser.close();
}
