"""Prepare native launcher resources from our original photo (requires Pillow)."""

from pathlib import Path
import json

from PIL import Image, ImageOps


MOBILE = Path(__file__).resolve().parents[1]
photo = ImageOps.exif_transpose(
    Image.open(MOBILE / "artwork" / "launcher-photo.jpg")
).convert("RGB")
# Keep both shadows and the heart gesture clear inside the launcher mask.
assert photo.size == (1086, 1448), "Review the crop when replacing the source photo."
square = photo.crop((170, 280, 870, 980))
# Adaptive icons reserve an outer sixth on each edge for launcher motion/masks.
adaptive = photo.crop((0, 105, 1050, 1155))

ios = MOBILE / "ios/Resources/Assets.xcassets/AppIcon.appiconset"
catalog = json.loads((ios / "Contents.json").read_text(encoding="utf-8"))
for item in catalog["images"]:
    points = float(item["size"].split("x")[0])
    scale = float(item["scale"].removesuffix("x"))
    pixels = round(points * scale)
    square.resize((pixels, pixels), Image.Resampling.LANCZOS).save(
        ios / item["filename"], optimize=True
    )

res = MOBILE / "android/app/src/main/res"
for density, scale in {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}.items():
    folder = res / ("mipmap-" + density)
    folder.mkdir(parents=True, exist_ok=True)
    size = round(48 * scale)
    square.resize((size, size), Image.Resampling.LANCZOS).save(
        folder / "ic_launcher.png", optimize=True
    )
    size = round(108 * scale)
    adaptive.resize((size, size), Image.Resampling.LANCZOS).save(
        folder / "ic_launcher_photo.png", optimize=True
    )

square.resize((1024, 1024), Image.Resampling.LANCZOS).save(
    MOBILE / "artwork/launcher-preview.png", optimize=True
)
print("Prepared iPhone, iPad, legacy Android, and adaptive Android launcher icons.")
