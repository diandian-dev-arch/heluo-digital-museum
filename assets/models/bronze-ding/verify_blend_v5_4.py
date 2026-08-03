"""Reopen v5.4 source and re-import its delivery GLB."""
import bpy
from pathlib import Path

root = Path(__file__).resolve().parent
source = root / "source" / "heluo-bronze-ding-v5.4.blend"
glb = root / "export" / "heluo-bronze-ding-v5.4.glb"
bpy.ops.wm.open_mainfile(filepath=str(source))
low = bpy.data.collections.get("MODEL_HeluoBronzeDing_V5_4_WEB_LOW")
render = bpy.data.collections.get("RENDER_HeluoBronzeDing_V5_4_STUDIO")
print(f"v5.4 source low_objects={len(low.objects) if low else 0} render_objects={len(render.objects) if render else 0}")
if not low or not any(obj.type == "MESH" for obj in low.objects):
    raise RuntimeError("v5.4 source low collection is missing meshes")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(glb))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
materials = {mat.name for obj in meshes for mat in obj.data.materials if mat}
images = list(bpy.data.images)
print(f"v5.4 GLB meshes={len(meshes)} materials={sorted(materials)} images={len(images)} bytes={glb.stat().st_size}")
if not meshes or "CMA_CC0_V5_4_Authentic_Aged_Bronze" not in materials or len(images) < 3:
    raise RuntimeError("v5.4 asset verification failed: mesh/material/texture missing")
if glb.stat().st_size > 6_000_000:
    raise RuntimeError("v5.4 GLB exceeds 6MB web target")
print("V5_4_VERIFY_OK")
