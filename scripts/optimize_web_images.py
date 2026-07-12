"""Convert photographic PNG assets to WebP and update site references."""

from __future__ import annotations

from pathlib import Path
import re

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
ASSETS = WEB / "assets"
TEXT_SUFFIXES = {".html", ".css", ".js", ".json", ".md"}
ASSET_REFERENCE = re.compile(r'''["'](assets/[^"'?#]+)''')


def convert_images() -> tuple[int, int, int]:
    before = 0
    after = 0
    converted = 0

    for source in sorted(ASSETS.rglob("*.png")):
        target = source.with_suffix(".webp")
        before += source.stat().st_size

        with Image.open(source) as image:
            image.load()
            mode = "RGBA" if "A" in image.getbands() else "RGB"
            image.convert(mode).save(
                target,
                format="WEBP",
                quality=84,
                method=6,
                exact=True,
            )

        after += target.stat().st_size
        source.unlink()
        converted += 1

    return converted, before, after


def rewrite_references() -> int:
    changed = 0
    for path in WEB.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        original = path.read_text(encoding="utf-8")
        updated = original.replace(".png", ".webp")
        if updated != original:
            path.write_text(updated, encoding="utf-8", newline="\n")
            changed += 1
    return changed


def find_missing_assets() -> list[tuple[Path, str]]:
    missing: list[tuple[Path, str]] = []
    for path in WEB.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        for reference in ASSET_REFERENCE.findall(path.read_text(encoding="utf-8")):
            if not (WEB / reference).is_file():
                missing.append((path.relative_to(ROOT), reference))
    return missing


def main() -> None:
    converted, before, after = convert_images()
    changed = rewrite_references()
    missing = find_missing_assets()
    if missing:
        details = "\n".join(f"{path}: {reference}" for path, reference in missing)
        raise SystemExit(f"Missing asset references:\n{details}")
    saved = before - after
    print(
        f"converted={converted} references_updated={changed} "
        f"before_mb={before / 1_048_576:.2f} "
        f"after_mb={after / 1_048_576:.2f} "
        f"saved_mb={saved / 1_048_576:.2f} missing_assets=0"
    )


if __name__ == "__main__":
    main()
