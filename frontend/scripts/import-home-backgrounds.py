"""Export user-approved homepage images without upscaling or retouching."""
from pathlib import Path
from shutil import copy2
from PIL import Image

root = Path(__file__).resolve().parents[2]
sources = {
    'dark': 'codex-clipboard-a5e1ae09-21b0-429c-b140-a491350c6e62.png',
    'light': 'codex-clipboard-f696c3f9-9d76-4bcd-b3f0-8400657804eb.png',
}
for theme, filename in sources.items():
    name = f'home-corridor-{theme}-user-v2'
    archive = root / 'assets/images/editorial/source' / f'{name}.png'
    if not archive.exists():
        copy2(Path('C:/Users/Jie/AppData/Local/Temp') / filename, archive)
    with Image.open(archive) as source:
        im = source.convert('RGB')
        out = root / 'frontend/public/media/editorial'
        im.save(out / f'{name}.webp', quality=90, method=6)
        for width in (640, 1280):
            im.resize((width, round(im.height * width / im.width)), Image.Resampling.LANCZOS).save(out / f'{name}-{width}w.webp', quality=86, method=6)
        width = round(im.height * 512 / 998)
        left = (im.width - width) // 2
        im.crop((left, 0, left + width, im.height)).save(out / f'{name}-portrait.webp', quality=90, method=6)
        print(theme, im.size, 'portrait', (width, im.height))
