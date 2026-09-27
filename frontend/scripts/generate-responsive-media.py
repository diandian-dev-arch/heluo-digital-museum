"""Derive registered WebP variants without modifying approved source images."""

import argparse
import json
import shutil
from pathlib import Path

from PIL import Image, ImageOps


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify all registered files without writing")
    args = parser.parse_args()
    frontend = Path(__file__).resolve().parents[1]
    public = frontend / "public"
    manifest = json.loads((frontend / "src/lib/responsiveMediaManifest.json").read_text(encoding="utf-8"))
    output = public / "media/responsive"
    if not args.check:
        output.mkdir(parents=True, exist_ok=True)
    totals = {"sources": 0, "variants": 0, "original_bytes": 0, "bytes_320": 0, "bytes_640": 0, "bytes_960": 0}
    for url, name in manifest.items():
        source = public / url.lstrip("/")
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGBA" if "A" in opened.getbands() else "RGB")
        if image.width < 960:
            raise ValueError(f"Refusing to upscale {source}: {image.size}")
        row = {"name": name, "source": url, "dimensions": list(image.size), "original_bytes": source.stat().st_size}
        totals["sources"] += 1
        totals["original_bytes"] += source.stat().st_size
        for width in (320, 640, 960):
            target = output / f"{name}-{width}w.webp"
            size = (width, round(image.height * width / image.width))
            if not args.check:
                if size == image.size:
                    shutil.copyfile(source, target)
                else:
                    resized = image.resize(size, Image.Resampling.LANCZOS)
                    resized.save(target, format="WEBP", quality=85, method=6, exact=True)
                    resized.close()
            with Image.open(target) as checked:
                checked.load()
                if checked.size != size or checked.format != "WEBP":
                    raise ValueError(f"Invalid variant {target}: {checked.size}, {checked.format}")
            row[str(width)] = target.stat().st_size
            totals[f"bytes_{width}"] += target.stat().st_size
            totals["variants"] += 1
        image.close()
        print(json.dumps(row, ensure_ascii=True))
    print(json.dumps({"totals": totals, "mode": "check" if args.check else "generate"}))


if __name__ == "__main__":
    main()
