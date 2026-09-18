from pathlib import Path
from PIL import Image
import shutil

root = Path(__file__).resolve().parents[2]
source = root / 'assets/images/editorial/source/ding-user-20260911/background-v2.png'
if not source.exists():
    shutil.copy2('C:/Users/Jie/AppData/Local/Temp/codex-clipboard-8d02df93-2689-48a0-9ff1-01b474c0b37c.png', source)
original = Image.open(source).convert('RGB')
assert original.width == original.height
name = 'explore-bronze-ding-user-v2'
for width in [320, 640, 960]:
    target = root / f'frontend/public/media/responsive/{name}-{width}w.webp'
    original.resize((width, width), Image.Resampling.LANCZOS).save(target, quality=88, method=6)
original.resize((960, 960), Image.Resampling.LANCZOS).save(root / f'frontend/public/media/editorial/{name}.webp', quality=88, method=6)
print({'source': original.size, 'output': name, 'composition': 'unchanged'})
