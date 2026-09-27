from pathlib import Path
from PIL import Image, ImageFilter
import shutil

root = Path(__file__).resolve().parents[2]
source = root / 'assets/images/editorial/source/ding-user-20260911'
source.mkdir(parents=True, exist_ok=True)
inputs = {
    'background.png': 'codex-clipboard-791e95a9-218b-460e-a008-48a1e27c77bb.png',
    'transparent.png': 'codex-clipboard-65875b19-816d-4f67-8aca-2ef7bf17af3d.png',
}
for name, filename in inputs.items():
    target = source / name
    if not target.exists():
        shutil.copy2(Path('C:/Users/Jie/AppData/Local/Temp') / filename, target)

original = Image.open(source / 'background.png').convert('RGB')
# Extend only the outer background; the object and contact shadow stay intact.
size = 1370
offset = (size - original.width) // 2
canvas = original.resize((size, size), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(45))
mask = Image.new('L', original.size, 255)
pixels = mask.load()
for y in range(mask.height):
    for x in range(mask.width):
        edge = min(x, y, mask.width - 1 - x, mask.height - 1 - y)
        pixels[x, y] = min(255, round(edge / 45 * 255))
canvas.paste(original, (offset, offset), mask)
name = 'explore-bronze-ding-user-v1'
for width in [320, 640, 960]:
    target = root / f'frontend/public/media/responsive/{name}-{width}w.webp'
    canvas.resize((width, width), Image.Resampling.LANCZOS).save(target, quality=88, method=6)
canvas.resize((960, 960), Image.Resampling.LANCZOS).save(root / f'frontend/public/media/editorial/{name}.webp', quality=88, method=6)
print({'input': original.size, 'canvas': canvas.size, 'transparent_mode': Image.open(source / 'transparent.png').mode})
