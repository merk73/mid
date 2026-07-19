"""Convert photographic PNG assets to WebP and update site references."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
ASSETS = WEB / "assets"
TEXT_SUFFIXES = {".html", ".css", ".js", ".json", ".md"}


def convert_images() -> tuple[dict[str, str], int, int]:
    before = 0
    after = 0
    converted: dict[str, str] = {}

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
        old_reference = source.relative_to(WEB).as_posix()
        new_reference = target.relative_to(WEB).as_posix()
        source.unlink()
        converted[old_reference] = new_reference

    return converted, before, after


def rewrite_references(converted: dict[str, str]) -> int:
    changed = 0
    for path in WEB.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        original = path.read_text(encoding="utf-8")
        updated = original
        for old_reference, new_reference in converted.items():
            updated = updated.replace(old_reference, new_reference)
        if updated != original:
            path.write_text(updated, encoding="utf-8", newline="\n")
            changed += 1
    return changed


def find_missing_assets(converted: dict[str, str]) -> list[tuple[Path, str]]:
    missing: list[tuple[Path, str]] = []
    for reference in converted.values():
        if not (WEB / reference).is_file():
            missing.append((WEB.relative_to(ROOT), reference))
    return missing


def main() -> None:
    converted, before, after = convert_images()
    changed = rewrite_references(converted)
    missing = find_missing_assets(converted)
    if missing:
        details = "\n".join(f"{path}: {reference}" for path, reference in missing)
        raise SystemExit(f"Missing asset references:\n{details}")
    saved = before - after
    print(
        f"converted={len(converted)} references_updated={changed} "
        f"before_mb={before / 1_048_576:.2f} "
        f"after_mb={after / 1_048_576:.2f} "
        f"saved_mb={saved / 1_048_576:.2f} missing_assets=0"
    )


if __name__ == "__main__":
    main()
