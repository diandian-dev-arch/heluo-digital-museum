import bpy
from pathlib import Path
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for mesh in list(bpy.data.meshes):
    bpy.data.meshes.remove(mesh)
path = Path(__file__).resolve().parent / 'export' / 'heluo-bronze-ding.glb'
bpy.ops.import_scene.gltf(filepath=str(path))
objects = list(bpy.context.scene.objects)
meshes = [obj for obj in objects if obj.type == 'MESH']
materials = set()
for obj in meshes:
    for material in obj.data.materials:
        if material:
            materials.add(material.name)
print(f'GLB_IMPORT_OK objects={len(objects)} meshes={len(meshes)} materials={len(materials)} names={sorted(materials)}')
