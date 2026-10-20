"""Version selection, preserved legacy routes, and explicit coloured scores."""
import os
from pathlib import Path
import re
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("MIDGAS_PREVIEW_URL", "http://127.0.0.1:43129")
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)
cdn_cache = {}

def cdn_asset(route):
    url = route.request.url
    try:
        if url not in cdn_cache:
            with urllib.request.urlopen(url, timeout=20) as response:
                cdn_cache[url] = (response.read(), response.headers.get("Content-Type", "application/javascript"))
        body, content_type = cdn_cache[url]
        route.fulfill(body=body, content_type=content_type)
    except Exception:
        route.abort()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    local_failures = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("response", lambda r: local_failures.append(r.url) if r.url.startswith(BASE) and r.status == 404 else None)
    page.route("**/assets/video/**", lambda route: route.abort())
    page.route(re.compile(r"https://cdn\.jsdelivr\.net/"), cdn_asset)
    page.route(re.compile(r"https://[^/]+\.supabase\.co/"), lambda route: route.abort())
    page.goto(BASE, wait_until="networkidle")
    assert page.locator(".record-grid").evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length") == 2
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    first = page.locator('.record-card[data-id="MID-C-0001"]')
    threat = first.locator('.card-metric[data-kind="threat"]')
    assert threat.locator('.card-metric-scale i').count() == 5
    assert threat.locator('.is-filled').count() == 2
    assert "Угроза" in threat.inner_text() and "Умеренная" in threat.inner_text()
    assert threat.locator('.card-metric-scale').get_attribute('aria-label') == 'Угроза: 2 из 5, Умеренная'
    unknown = page.locator('.card-metric[data-level="0"]').first
    assert unknown.locator('.is-filled').count() == 0
    assert 'Нет данных' in unknown.inner_text()
    page.screenshot(path=str(OUT / "archive-mobile-colour-scales.png"))
    page.locator('[data-version-settings-trigger]').click()
    dialog = page.locator('[data-version-settings-dialog]')
    assert dialog.is_visible()
    assert dialog.locator('input[value="modern"]').is_checked()
    dialog.locator('input[value="legacy"]').check()
    dialog.locator('[data-version-apply]').click()
    page.wait_for_url('**/legacy/index.html?version=legacy')
    page.wait_for_load_state('domcontentloaded')
    assert page.evaluate('localStorage.getItem("midgas_site_version_v1")') == 'legacy'
    assert page.locator('.hero-cover').count() == 1
    assert page.locator('script[src="legacy/app.js?v=39"]').count() == 1
    assert page.locator('link[href="legacy/styles.css?v=103"]').count() == 1
    assert page.locator('.site-access-gate').count() == 1
    assert page.locator('[data-version-settings-trigger]').is_visible()
    # The settings must remain clickable above the preserved original login gate.
    page.locator('[data-version-settings-trigger]').click()
    assert dialog.is_visible()
    page.screenshot(path=str(OUT / "legacy-version-settings.png"))
    dialog.locator('button[value="cancel"]').last.click()
    page.goto(BASE + '/record.html?id=MID-C-0001', wait_until='domcontentloaded')
    page.wait_for_url('**/legacy/mid-c-0001/')
    assert page.locator('#record-content').count() == 1
    assert page.locator('script[src="legacy/record.js?v=23"]').count() == 1
    page.goto(BASE + '/mid-c-0001/', wait_until='domcontentloaded')
    page.wait_for_url('**/legacy/mid-c-0001/')
    assert page.locator('base').get_attribute('href') == '../../'
    page.locator('[data-version-settings-trigger]').click()
    dialog.locator('input[value="modern"]').check()
    dialog.locator('[data-version-apply]').click()
    page.wait_for_url('**/mid-c-0001/?version=modern')
    page.wait_for_load_state('networkidle')
    assert page.locator('.dossier-intro h1').inner_text() == 'ГАЛИНА КРАПИВКИНА'
    assert page.evaluate('localStorage.getItem("midgas_site_version_v1")') == 'modern'
    page.goto(BASE + '/index.html', wait_until='networkidle')
    page.locator('[data-version-settings-trigger]').click()
    dialog.locator('input[value="legacy"]').check()
    dialog.locator('button[value="cancel"]').last.click()
    assert page.evaluate('localStorage.getItem("midgas_site_version_v1")') == 'modern'
    page.set_viewport_size({"width": 1440, "height": 1000})
    assert page.locator(".record-grid").evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length") == 6
    page.screenshot(path=str(OUT / "archive-desktop-colour-scales.png"))
    # Explicit URLs let a shared link opt into either version.
    page.goto(BASE + '/legacy/index.html?version=modern', wait_until='networkidle')
    assert '/legacy/' not in page.url
    assert page.locator('.record-card').count() == 27
    assert not local_failures, local_failures
    assert not errors, errors
    browser.close()
print('Version settings QA passed: 2/6 columns; labelled, coloured five-part scores; unknown scores; saved preference; cancel; both-direction switching above the legacy login gate; dossier/short routes and preserved legacy resources.')
