"""Download the explicit public MIDGAS media inventory; never read credentials."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "design/archive-source"
URLS = json.loads((SOURCE / "asset-urls.json").read_text())
MANIFEST_PATH = SOURCE / "assets.json"
manifest = json.loads(MANIFEST_PATH.read_text()) if MANIFEST_PATH.exists() else {}

def download(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "skvwaovkkoxqfwkcpuvh.supabase.co" or not parsed.path.startswith("/storage/v1/object/public/"):
        raise ValueError("Only explicitly public MIDGAS Storage objects can be downloaded.")
    existing = manifest.get(url)
    if existing and (ROOT / "web" / existing["path"]).exists():
        data = (ROOT / "web" / existing["path"]).read_bytes()
        if hashlib.sha256(data).hexdigest() == existing["sha256"]:
            return url, existing
    ext = Path(parsed.path).suffix.lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg", ".gif", ".mp4", ".webm", ".pdf", ".mp3", ".wav"):
        raise ValueError("Unsupported asset extension: " + ext)
    with urllib.request.urlopen(url, timeout=45) as response:
        data = response.read()
        content_type = response.headers.get("Content-Type", "")
        if not content_type.startswith(("image/", "video/", "audio/", "application/pdf")):
            raise ValueError("Unexpected asset content type: " + content_type)
    local = "assets/archive/" + hashlib.sha256(url.encode()).hexdigest()[:20] + ext
    (ROOT / "web" / local).write_bytes(data)
    return url, {"path": local, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}

errors = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
    futures = {executor.submit(download, url): url for url in URLS}
    for future in concurrent.futures.as_completed(futures):
        url = futures[future]
        try:
            _, metadata = future.result()
            manifest[url] = metadata
        except Exception as error:
            errors[url] = str(error)
MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
(SOURCE / "missing-assets.json").write_text(json.dumps(errors, ensure_ascii=False, indent=2) + "\n")
print(f"Verified {len(URLS) - len(errors)} local media files; {len(errors)} unavailable objects.")
if errors:
    raise SystemExit(1)
