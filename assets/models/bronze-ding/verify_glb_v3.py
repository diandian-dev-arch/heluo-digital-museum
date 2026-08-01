import bpy
from pathlib import Path
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
path=Path(__file__).resolve().parent/'export'/'heluo-bronze-ding-v3.glb'
bpy.ops.import_scene.gltf(filepath=str(path))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
materials={m.name for o in meshes for m in o.data.materials if m}
print(f'V3_GLB_IMPORT_OK meshes={len(meshes)} materials={len(materials)} material_names={sorted(materials)}')
