import bpy
collection=bpy.data.collections.get('MODEL_HeluoBronzeDing_V2')
print(f'V3_BLEND_OPEN_OK objects={len(bpy.context.scene.objects)} model_objects={len(collection.objects) if collection else 0} materials={len(bpy.data.materials)}')
