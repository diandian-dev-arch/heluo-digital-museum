"""Create the v5.5 derivative with a small local correction to the front center relief.

Run with Blender using the v5.4 blend as input. The v5.4 source and GLB remain
unchanged; only a smooth, narrow front-body vertex band is adjusted.
"""

import bpy
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE_BLEND = ROOT / "source" / "heluo-bronze-ding-v5.4.blend"
OUTPUT_BLEND = ROOT / "source" / "heluo-bronze-ding-v5.5.blend"
OUTPUT_GLB = ROOT / "export" / "heluo-bronze-ding-v5.5.glb"


def smoothstep(edge0, edge1, value):
    value = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return value * value * (3.0 - 2.0 * value)


def correct_centerline():
    changed = 0
    total_shift = 0.0
    model_objects = [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and obj.name.startswith("V5_4_CMA_CC0_")
    ]

    for obj in model_objects:
        for vertex in obj.data.vertices:
            x, y, z = vertex.co

            # The screenshot issue is on the front (-Y) belly relief only.
            front_weight = smoothstep(-0.56, -0.68, y)
            center_weight = 1.0 - smoothstep(0.035, 0.14, abs(x))
            lower_weight = smoothstep(-0.22, 0.34, 0.34 - z)
            weight = front_weight * center_weight * lower_weight
            if weight < 0.001:
                continue

            # The lower end currently drifts right. Pull it left by at most
            # 0.022 Blender units while leaving the upper end unchanged.
            offset = -0.022 * weight
            vertex.co.x += offset
            changed += 1
            total_shift += abs(offset)

        obj.data.update()

    if not changed:
        raise RuntimeError("No front centerline vertices matched the correction band")

    return model_objects, changed, total_shift


def export_model(model_objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in model_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = model_objects[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND))
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
        export_normals=True,
        export_tangents=True,
        export_apply=True,
        export_image_format="WEBP",
        export_image_quality=52,
    )


def render_front(model_objects):
    scene = bpy.context.scene
    camera = bpy.data.objects.get("V5_4_Render_Camera")
    if camera is None:
        return

    scene.camera = camera
    camera.location = (0.0, -5.2, 1.25)
    target = Vector((0.0, 0.0, -0.15))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


if __name__ == "__main__":
    model_objects, changed, total_shift = correct_centerline()
    export_model(model_objects)
    print(f"V5.5_CENTERLINE_FIX_OK vertices={changed} total_abs_shift={total_shift:.6f} glb={OUTPUT_GLB} bytes={OUTPUT_GLB.stat().st_size}")
