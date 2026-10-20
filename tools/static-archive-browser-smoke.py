"""Browser checks for the public, database-free archive. Start a loopback server first."""
import json
import os
from pathlib import Path
import re
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("MIDGAS_PREVIEW_URL", "http://127.0.0.1:43129")
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)
archive = json.loads((ROOT / "web/archive-data.js").read_text().split(" = ", 1)[1].strip().removesuffix(";"))
clients = [r for r in archive["records"] if r["type"] == "client"]
errors, requests = [], []
tile_cache = {}

def real_tile(route):
    # Chromium in the cloud does not trust the session proxy CA. Fetch the
    # identical public tile with urllib's configured CA trust; never disable TLS.
    url = route.request.url
    try:
        if url not in tile_cache:
            with urllib.request.urlopen(url, timeout=20) as response:
                tile_cache[url] = response.read()
        route.fulfill(status=200, content_type="image/png", body=tile_cache[url])
    except Exception:
        route.abort()

with sync_playwright() as p:
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), headless=True, args=["--no-sandbox"], proxy={"server": proxy, "bypass": "127.0.0.1,localhost"} if proxy else None)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: requests.append(request.url))
    page.route(re.compile(r"https://[abc]\.basemaps\.cartocdn\.com/"), real_tile)
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("document.fonts.ready")
    assert page.locator(".record-card").count() == len(clients)
    assert page.locator("#record-grid").evaluate("e => getComputedStyle(e).gridTemplateColumns.split(' ').length") == 6
    assert page.locator(".record-card h3").first.evaluate("e => getComputedStyle(e).fontFamily").startswith('"PT Mono"')
    assert page.evaluate('document.fonts.check(\'12px "PT Mono"\')')
    assert page.locator(".site-access-gate").count() == 0
    page.screenshot(path=str(OUT / "archive-desktop.png"))

    page.locator("#catalog-sort").select_option("number-desc")
    assert page.locator(".record-card").first.get_attribute("data-id") == max(clients, key=lambda r: int(r["id"].rsplit("-", 1)[1]))["id"]
    page.locator("#catalog-search").fill("НЕСУЩЕСТВУЮЩАЯ_ЗАПИСЬ_998877")
    assert page.locator("#catalog-empty").is_visible()
    page.locator("#empty-reset").click()
    assert page.locator(".record-card").count() == len(clients)
    page.locator("#catalog-search").fill("Галина Крапивкина")
    assert page.locator('.record-card[data-id="MID-C-0001"]').is_visible()
    assert page.locator(".record-card").count() < len(clients)
    page.locator("#catalog-search").fill("")
    page.locator("#filter-toggle").click()
    page.locator("#filter-threat").select_option("2")
    assert page.locator(".record-card").count() > 0
    assert all("T2" in text for text in page.locator(".card-levels").all_inner_texts())
    assert "threat=2" in page.url
    page.reload(wait_until="networkidle")
    assert page.locator("#filter-threat").input_value() == "2"
    assert page.locator("#advanced-filters").is_visible()
    page.locator("#reset-filters").click()
    page.locator("#tab-anomaly").click()
    assert page.locator(".record-card").count() == sum(r["type"] == "anomaly" for r in archive["records"])
    page.locator("#tab-anomaly").press("ArrowRight")
    assert page.locator("#tab-incident").get_attribute("aria-selected") == "true"
    assert page.locator(".record-card").count() == sum(r["type"] == "incident" for r in archive["records"])
    page.locator("#tab-client").click()

    # Verify tags without modifying real archive files or inventing source tags.
    page.evaluate('window.MIDGAS_ARCHIVE.records.find(r=>r.id==="MID-C-0001").tags=["Тестовый тег"]')
    page.locator("#tab-anomaly").click(); page.locator("#tab-client").click()
    page.locator("#filter-toggle").click() if not page.locator("#advanced-filters").is_visible() else None
    page.locator("#filter-tag").select_option("Тестовый тег")
    assert page.locator(".record-card").count() == 1
    assert page.locator(".card-tags").inner_text() == "Тестовый тег"
    page.locator("#reset-filters").click()

    page.locator("#connections").scroll_into_view_if_needed()
    assert page.locator(".graph-node").count() == len(archive["records"]) + len(archive["board"]["nodes"])
    view_before = page.locator("#connection-graph").get_attribute("viewBox")
    page.locator("#graph-in").click()
    assert page.locator("#connection-graph").get_attribute("viewBox") != view_before
    page.locator("#graph-focus").select_option("MID-C-0001")
    assert page.locator("#graph-inspector").is_visible()
    assert "MID-C-0001" in page.locator("#graph-inspector a").get_attribute("href")
    assert page.locator(".graph-node.is-muted").count() > 0
    page.locator("#graph-list-toggle").click()
    assert page.locator("#graph-list .edge-pair").count() >= len(archive["relationships"])
    page.locator("#graph-reset").click()
    assert page.locator("#graph-inspector").is_hidden()
    node = page.locator('.graph-node[data-node="MID-C-0001"]')
    initial_transform = node.get_attribute("transform")
    box = node.bounding_box(); x, y = box["x"] + box["width"] / 2, box["y"] + 10
    page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + 35, y + 25, steps=5); page.mouse.up()
    assert node.get_attribute("transform") != initial_transform
    page.locator("#connections").screenshot(path=str(OUT / "archive-connections.png"))

    page.locator("#locations").scroll_into_view_if_needed()
    page.wait_for_function("document.querySelectorAll('.leaflet-marker-icon').length > 0")
    page.wait_for_function("document.querySelectorAll('.leaflet-tile-loaded').length > 0", timeout=60000)
    assert len(tile_cache) > 0
    page.locator(".location-item").first.click()
    assert page.locator(".leaflet-popup-content a").count() > 0
    page.locator("#location-search").fill("Воронеж")
    assert page.locator(".location-item").count() == 1
    page.locator("#location-search").fill("")
    page.locator("#map-reset").click()
    page.locator("#locations").screenshot(path=str(OUT / "archive-locations.png"))

    page.locator("#glossary").scroll_into_view_if_needed()
    assert page.locator(".term").count() == len(archive["glossary"])
    page.locator("#glossary-search").fill("Клиент")
    assert 0 < page.locator(".term").count() < len(archive["glossary"])
    page.locator(".term summary").first.click()
    assert page.locator(".term[open]").count() == 1
    page.locator("#glossary-search").fill("")
    page.locator("#glossary-category").select_option("cosmos")
    assert page.locator(".term").count() == sum(t["group"] == "cosmos" for t in archive["glossary"])

    for width in [320, 375, 390, 430, 768, 1440]:
        page.set_viewport_size({"width": width, "height": 844})
        page.goto(BASE, wait_until="networkidle")
        assert page.locator("#record-grid").evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length") == (6 if width >= 1024 else 2)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Overflow at {width}px"
        box = page.locator(".card-image").first.bounding_box()
        assert abs(box["width"] - box["height"]) < 1, "Image is not square"
        if width == 390:
            page.screenshot(path=str(OUT / "archive-mobile.png"))

    # Every dossier and its full prose are available without a database session.
    for record in archive["records"]:
        page.goto(BASE + "/record.html?id=" + record["id"], wait_until="networkidle")
        assert page.locator(".dossier-intro h1").inner_text() == record["name"]
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), record["id"]
        if record.get("summary"):
            assert page.locator(".dossier-summary").inner_text() == record["summary"]
        for i, section in enumerate(record.get("sections", [])):
            assert page.locator(f"#section-{i+1} h2").inner_text() == section["title"]
            paragraphs = page.locator(f"#section-{i+1} > p").all_text_contents()
            assert paragraphs == section.get("paragraphs", []), (record["id"], i)
        if record.get("research"):
            assert page.locator(".archive-chart").count() == len(record["research"]["charts"])
        if record["id"] == "MID-C-0040":
            assert page.locator(".dossier-symbol > svg").count() > 0
    page.goto(BASE + "/mid-c-0001/", wait_until="networkidle")
    assert page.locator(".dossier-intro h1").inner_text() == clients[0]["name"]
    page.goto(BASE + "/record.html?id=MID-C-9999", wait_until="networkidle")
    assert page.locator(".empty-state h1").inner_text() == "Запись не найдена"
    page.goto(BASE + "/registry.html?type=anomaly", wait_until="networkidle")
    assert page.locator("#tab-anomaly").get_attribute("aria-selected") == "true"
    assert not any("supabase.co" in url for url in requests), "The static site contacted Supabase"
    assert not errors, errors
    browser.close()
print(f"Browser QA passed: six/two columns, PT Mono, search, sorting, filters, tags, graph, genuine map tiles, glossary, {len(archive['records'])} complete dossiers and legacy URLs; zero Supabase requests or JS exceptions.")
