"""Build the Cleveland 1962.281 based v5.3 web asset.

The downloaded GLB is kept read-only in source/third-party.  This script only
creates a separate cleaned working file, a web GLB, PBR maps and validation
renders.  The material is intentionally restrained: deep brown/grey bronze,
warm worn edges, and small amounts of green patina in the dark/cavity mask.
"""
import bpy
import math
from array import array
from pathlib import Path

import numpy as np
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "source"
OUT = ROOT / "export"
PRE = ROOT / "preview"
TEX = SRC / "textures" / "v5.3"
THIRD_PARTY = SRC / "third-party" / "cleveland-1962.281" / "1962.281_tripod_ding.glb"
BLEND = SRC / "heluo-bronze-ding-v5.3.blend"
GLB = OUT / "heluo-bronze-ding-v5.3.glb"
COVER = PRE / "heluo-bronze-ding-v5.3-cover.png"
TURNAROUND = PRE / "heluo-bronze-ding-v5.3-turnaround.png"

for folder in (SRC, OUT, PRE, TEX):
    folder.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                       bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def ensure_collection(name):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


def move_to(obj, collection):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)


def smooth_and_normals(obj):
    if obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        poly.use_smooth = True
    # Weighted normals preserve the cast-metal silhouette after light cleanup.
    try:
        mod = obj.modifiers.new("V5_3_Cast_Weighted_Normals", "WEIGHTED_NORMAL")
        mod.keep_sharp = True
        mod.weight = 45
    except Exception:
        pass


def bilinear_noise(size, grid, seed):
    rng = np.random.default_rng(seed)
    small = rng.random((grid + 1, grid + 1), dtype=np.float32)
    y = np.linspace(0, grid, size, endpoint=False, dtype=np.float32)
    x = np.linspace(0, grid, size, endpoint=False, dtype=np.float32)
    yi = np.floor(y).astype(np.int32)
    xi = np.floor(x).astype(np.int32)
    fy = y - yi
    fx = x - xi
    y0, y1 = np.meshgrid(yi, yi, indexing="ij")
    x0, x1 = np.meshgrid(xi, xi, indexing="ij")
    # The meshgrid above is deliberately square; use outer products for the
    # interpolation weights and keep the operation deterministic in Blender.
    a = small[np.ix_(yi, xi)]
    b = small[np.ix_(yi, xi + 1)]
    c = small[np.ix_(yi + 1, xi)]
    d = small[np.ix_(yi + 1, xi + 1)]
    wx = fx[None, :]
    wy = fy[:, None]
    return (a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) +
            c * (1 - wx) * wy + d * wx * wy)


def save_rgba(name, rgb, alpha=None, colorspace="sRGB"):
    rgba = np.zeros((rgb.shape[0], rgb.shape[1], 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    rgba[:, :, 3] = 1 if alpha is None else np.clip(alpha, 0, 1)
    image = bpy.data.images.new(name, width=rgb.shape[1], height=rgb.shape[0], alpha=True)
    image.filepath_raw = str(TEX / f"{name}.png")
    image.file_format = "PNG"
    # foreach_set requires a contiguous flat buffer; using a non-contiguous
    # vertically flipped NumPy view silently produced all-black PNGs in Blender
    # 5.2. The UV orientation is unaffected for this isotropic material noise.
    image.pixels.foreach_set(array("f", np.ascontiguousarray(rgba).ravel().tolist()))
    image.update()
    print("MAP_SAMPLE", name, tuple(round(v, 4) for v in image.pixels[:4]))
    image.pack()
    image.colorspace_settings.name = colorspace
    image.save()
    return image


def make_pbr_maps(source_images=None):
    size = 2048
    macro = bilinear_noise(size, 24, 5301)
    mid = bilinear_noise(size, 96, 5302)
    micro = bilinear_noise(size, 384, 5303)
    pits = bilinear_noise(size, 700, 5304)
    # A cavity-like mask: sparse, dark, slightly green oxidised marks.  It is
    # intentionally low saturation so the asset never becomes uniformly green.
    cavity = np.clip((0.25 - macro) * 2.2 + (0.28 - mid) * 0.75, 0, 1)
    cavity *= np.clip((pits - 0.2) * 2.0, 0, 1)
    worn = np.clip((mid - 0.56) * 2.2 + (micro - 0.62) * 0.35, 0, 1)

    # Reuse the Cleveland CC0 scan texture for real cast/oxidation detail,
    # then tint it toward dark olive-grey bronze. The former procedural-only
    # map made the relief look like smooth rubber; the source map carries the
    # actual pits, worn edges and surface breakup.
    bronze_tint = np.array([0.60, 0.61, 0.55], dtype=np.float32)
    if source_images and source_images.get("base"):
        src = source_images["base"]
        pixels = np.asarray(src.pixels[:], dtype=np.float32).reshape(src.size[1], src.size[0], 4)[:, :, :3]
        lum = pixels @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        olive = lum[..., None] * np.array([0.62, 0.60, 0.52], dtype=np.float32)
        base = np.clip(pixels * 0.30 + olive * 0.70, 0, 1)
        base *= bronze_tint
        # Scale the 1K CC0 texture to the 2K delivery map without losing its
        # UV layout; the additional noise prevents a sterile upscaled look.
        base = np.repeat(np.repeat(base, size // src.size[0], axis=0), size // src.size[1], axis=1)
        base = np.clip(base * (0.86 + micro[..., None] * 0.14), 0, 1)
    else:
        bronze_a = np.array([0.075, 0.095, 0.085], dtype=np.float32)
        bronze_b = np.array([0.22, 0.25, 0.19], dtype=np.float32)
        warm_wear = np.array([0.52, 0.33, 0.12], dtype=np.float32)
        patina = np.array([0.035, 0.16, 0.12], dtype=np.float32)
        t = np.clip(macro * 0.72 + mid * 0.28, 0, 1)[..., None]
        base = bronze_a * (1 - t) + bronze_b * t
        base = base * (1 - worn[..., None] * 0.28) + warm_wear * (worn[..., None] * 0.28)
        base = base * (1 - cavity[..., None] * 0.72) + patina * (cavity[..., None] * 0.72)
        base *= (0.94 + micro[..., None] * 0.11)
    # Oxidation is green only in sparse dark areas; preserve warm worn ridges.
    base = base * (1 - cavity[..., None] * 0.22) + np.array([0.025, 0.12, 0.075], dtype=np.float32) * (cavity[..., None] * 0.22)

    normal = np.zeros((size, size, 3), dtype=np.float32)
    if source_images and source_images.get("normal"):
        src = source_images["normal"]
        npx = np.asarray(src.pixels[:], dtype=np.float32).reshape(src.size[1], src.size[0], 4)[:, :, :3]
        normal = np.repeat(np.repeat(npx, size // src.size[0], axis=0), size // src.size[1], axis=1)
        normal[:, :, 0] = np.clip(normal[:, :, 0] + (micro - 0.5) * 0.06, 0, 1)
        normal[:, :, 1] = np.clip(normal[:, :, 1] + (mid - 0.5) * 0.06, 0, 1)
    else:
        normal[:, :, 0] = 0.5 + (mid - 0.5) * 0.035
        normal[:, :, 1] = 0.5 + (micro - 0.5) * 0.035
        normal[:, :, 2] = 1.0

    # glTF metallic-roughness convention: G=roughness, B=metallic.
    mr = np.zeros((size, size, 3), dtype=np.float32)
    mr[:, :, 0] = 1.0
    mr[:, :, 1] = np.clip(0.62 + (macro - 0.5) * 0.2 + cavity * 0.10 - worn * 0.10, 0.48, 0.82)
    mr[:, :, 2] = np.clip(0.91 - cavity * 0.12 + worn * 0.025, 0.72, 0.96)
    ao = np.repeat((1 - cavity * 0.46)[..., None], 3, axis=2)
    return (
        save_rgba("v53_aged_bronze_basecolor_2k", base),
        save_rgba("v53_aged_bronze_normal_2k", normal, colorspace="Non-Color"),
        save_rgba("v53_aged_bronze_metallicroughness_2k", mr, colorspace="Non-Color"),
        save_rgba("v53_aged_bronze_ao_2k", ao, colorspace="Non-Color"),
    )


def make_material(maps):
    base, normal, mr, ao = maps
    mat = bpy.data.materials.new("CMA_CC0_V5_3_Authentic_Aged_Bronze")
    mat.use_nodes = True
    mat.diffuse_color = (0.16, 0.12, 0.075, 1)
    mat["source"] = "Cleveland Museum of Art 1962.281 CC0; v5.3 project material remake"
    mat["finish"] = "deep brown grey bronze, cavity-only restrained patina, cast grain"
    mat["pbr_maps"] = "2K Base Color, Normal, Metallic-Roughness, AO"
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (620, 40)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (340, 40)
    bsdf.inputs["Metallic"].default_value = 0.91
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["IOR"].default_value = 1.45
    # A restrained clearcoat makes worn ridges read as metal, not lacquer.
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.08
        bsdf.inputs["Coat Roughness"].default_value = 0.32
    texcoord = nodes.new("ShaderNodeTexCoord")
    texcoord.location = (-680, 0)
    def tex(image, label, y, non_color=False):
        n = nodes.new("ShaderNodeTexImage")
        n.label = label
        n.name = label
        n.image = image
        n.location = (-420, y)
        if non_color:
            n.image.colorspace_settings.name = "Non-Color"
        links.new(texcoord.outputs["UV"], n.inputs["Vector"])
        return n
    n_base = tex(base, "V5.3 Base Color", 240)
    n_norm = tex(normal, "V5.3 Normal", 20, True)
    n_mr = tex(mr, "V5.3 Metallic Roughness", -210, True)
    n_ao = tex(ao, "V5.3 Ambient Occlusion", -430, True)
    sep = nodes.new("ShaderNodeSeparateColor")
    sep.location = (-80, -210)
    links.new(n_mr.outputs["Color"], sep.inputs["Color"])
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.location = (40, -50)
    normal_map.inputs["Strength"].default_value = 0.23
    links.new(n_norm.outputs["Color"], normal_map.inputs["Color"])
    links.new(n_base.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def import_and_clean(low_collection):
    if not THIRD_PARTY.exists():
        raise FileNotFoundError(f"Missing read-only source: {THIRD_PARTY}")
    bpy.ops.import_scene.gltf(filepath=str(THIRD_PARTY))
    imported = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not imported:
        raise RuntimeError("Cleveland GLB contained no mesh objects")
    # The Sketchfab root applies a 90-degree orientation matrix. Apply it and
    # scale the museum object to a useful ~1.6m display height.
    root_candidates = [o for o in bpy.context.scene.objects if o.type == "EMPTY"]
    source_images = {}
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for link in material.node_tree.links:
            image_node = link.from_node
            if image_node.type != "TEX_IMAGE" or not image_node.image:
                continue
            if link.to_socket.name == "Base Color":
                source_images["base"] = image_node.image
            elif link.to_node.type == "NORMAL_MAP":
                source_images["normal"] = image_node.image
    for root in root_candidates:
        root.select_set(True)
    if root_candidates:
        bpy.context.view_layer.objects.active = root_candidates[0]
        try:
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        except Exception:
            pass
    bounds = []
    for obj in imported:
        for corner in obj.bound_box:
            bounds.append(obj.matrix_world @ Vector(corner))
    max_z = max(v.z for v in bounds)
    min_z = min(v.z for v in bounds)
    height = max_z - min_z
    if height <= 0:
        raise RuntimeError("Imported model has invalid bounds")
    scale = 1.62 / height
    for obj in imported:
        obj.scale *= scale
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.name = f"V5_3_CMA_CC0_{obj.name}"
        move_to(obj, low_collection)
        smooth_and_normals(obj)
        # Remove unused material slots but preserve UVs and the original mesh.
        while len(obj.data.materials) > 1:
            obj.data.materials.pop(index=1)
    for root in root_candidates:
        if root.users == 0 or root.type == "EMPTY":
            bpy.data.objects.remove(root, do_unlink=True)
    return imported, source_images


def add_plinth_and_lights(render_collection, target):
    stone = bpy.data.materials.new("V5_3_Charcoal_Stone")
    stone.diffuse_color = (0.025, 0.022, 0.019, 1)
    stone.use_nodes = True
    stone.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (0.025, 0.022, 0.019, 1)
    stone.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.8
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.3, depth=0.16, location=(0, 0, -0.90))
    plinth = bpy.context.object
    plinth.name = "V5_3_Render_Stone_Plinth"
    plinth.data.materials.append(stone)
    move_to(plinth, render_collection)
    gold = bpy.data.materials.new("V5_3_Warm_Gold_Plinth_Inlay")
    gold.use_nodes = True
    gold_bsdf = gold.node_tree.nodes.get("Principled BSDF")
    gold_bsdf.inputs["Base Color"].default_value = (0.42, 0.23, 0.075, 1)
    gold_bsdf.inputs["Metallic"].default_value = 0.78
    gold_bsdf.inputs["Roughness"].default_value = 0.34
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.13, depth=0.035, location=(0, 0, -0.805))
    inlay = bpy.context.object
    inlay.name = "V5_3_Render_Warm_Gold_Inlay"
    inlay.data.materials.append(gold)
    move_to(inlay, render_collection)
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -1.0))
    floor = bpy.context.object
    floor.name = "V5_3_Render_Floor"
    floor.data.materials.append(stone)
    move_to(floor, render_collection)

    def look(obj):
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    def area(name, loc, energy, size, color):
        bpy.ops.object.light_add(type="AREA", location=loc)
        lamp = bpy.context.object
        lamp.name = name
        lamp.data.energy = energy
        lamp.data.shape = "DISK"
        lamp.data.size = size
        lamp.data.color = color
        look(lamp)
        move_to(lamp, render_collection)
    area("V5_3_Warm_Key", (3.2, -4.0, 4.2), 1080, 3.0, (1.0, 0.82, 0.58))
    area("V5_3_Cool_Fill", (-3.5, -2.4, 2.5), 760, 3.0, (0.60, 0.70, 0.68))
    area("V5_3_Rim_Light", (0.0, 3.7, 3.8), 480, 2.5, (1.0, 0.70, 0.45))


def setup_render(low_collection, render_collection):
    scene = bpy.context.scene
    # Blender 5.2 LTS exposes the realtime engine as BLENDER_EEVEE.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 980
    scene.render.resolution_y = 1180
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("V5_3_Neutral_Dark_World")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.035, 0.030, 0.025, 1)
    bg.inputs["Strength"].default_value = 0.16
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    bpy.ops.object.camera_add(location=(2.55, -4.9, 1.75))
    camera = bpy.context.object
    camera.name = "V5_3_Render_Camera"
    camera.data.lens = 58
    camera.rotation_euler = (Vector((0, 0, -0.15)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    move_to(camera, render_collection)
    scene.camera = camera
    add_plinth_and_lights(render_collection, (0, 0, -0.15))
    # Ensure only the low collection is exported; render collection is hidden
    # from the GLB selection and remains a studio preview aid.
    return camera


def export_and_render(low_collection, camera):
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in low_collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next((o for o in low_collection.objects if o.type == "MESH"), None)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB), export_format="GLB", use_selection=True,
        export_materials="EXPORT", export_normals=True, export_tangents=True,
        export_apply=True, export_image_format="WEBP", export_image_quality=52,
    )
    scene = bpy.context.scene
    scene.render.filepath = str(COVER)
    bpy.ops.render.render(write_still=True)
    # Four-view/contact render for visual QA.
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    views = [("front", (0.0, -5.2, 1.25)), ("right", (5.0, 0.0, 1.25)),
             ("back", (0.0, 5.2, 1.25)), ("top", (0.0, 0.0, 6.0))]
    original = camera.location.copy()
    for label, loc in views:
        camera.location = loc
        camera.rotation_euler = (Vector((0, 0, -0.15)) - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(PRE / f"v5.3-{label}.png")
        bpy.ops.render.render(write_still=True)
    camera.location = original
    camera.rotation_euler = (Vector((0, 0, -0.15)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x = 980
    scene.render.resolution_y = 1180
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print(f"V5.3 GLB: {GLB} ({GLB.stat().st_size} bytes)")


def main():
    clear_scene()
    low = ensure_collection("MODEL_HeluoBronzeDing_V5_3_WEB_LOW")
    high = ensure_collection("MODEL_HeluoBronzeDing_V5_3_WORKING_HIGH")
    render = ensure_collection("RENDER_HeluoBronzeDing_V5_3_STUDIO")
    meshes, source_images = import_and_clean(low)
    maps = make_pbr_maps(source_images)
    mat = make_material(maps)
    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        obj["asset_source"] = "Cleveland Museum of Art 1962.281, CC0 Public Domain"
        obj["processing"] = "v5.3 cleaned normals/UV-preserving scale and aged bronze PBR remake"
        # A modest decimate modifier is applied only to very dense meshes. The
        # original download remains untouched and the relief silhouette stays.
        if len(obj.data.polygons) > 100000:
            dec = obj.modifiers.new("V5_3_Web_Optimization", "DECIMATE")
            dec.ratio = 0.52
    camera = setup_render(low, render)
    export_and_render(low, camera)


if __name__ == "__main__":
    main()
