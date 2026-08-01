import bpy
collection = bpy.data.collections.get('MODEL_HeluoBronzeDing')
print(f'BLEND_OPEN_OK objects={len(bpy.context.scene.objects)} model_objects={len(collection.objects) if collection else 0} materials={len(bpy.data.materials)}')
