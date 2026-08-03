"""Reopen the v5.2 source and re-import its delivery GLB."""
import bpy
from pathlib import Path

root = Path(__file__).resolve().parent
source = root / 'source' / 'heluo-bronze-ding-v5.2.blend'
glb = root / 'export' / 'heluo-bronze-ding-v5.2.glb'
bpy.ops.wm.open_mainfile(filepath=str(source))
low = bpy.data.collections.get('MODEL_HeluoBronzeDing_V5_2_LOW')
high = bpy.data.collections.get('SCULPT_HeluoBronzeDing_V5_2_HIGH')
print(f'v5.2 source low_objects={len(low.objects) if low else 0} high_objects={len(high.objects) if high else 0}')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(glb))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
materials = {mat.name for obj in meshes for mat in obj.data.materials if mat}
images = list(bpy.data.images)
print(f'v5.2 GLB meshes={len(meshes)} materials={len(materials)} images={len(images)} bytes={glb.stat().st_size}')
if not meshes or len(materials) < 3 or glb.stat().st_size > 6_000_000:
    raise RuntimeError('v5.2 asset verification failed')
