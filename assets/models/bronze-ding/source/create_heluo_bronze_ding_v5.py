"""Build the original Heluo bronze ding v5 and export a browser-ready GLB.

This script intentionally builds an original concept object.  It does not use
third-party scans, historical meshes, or copied ornamental texture files.
"""

import bpy
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source"
EXPORT = ROOT / "export"
PREVIEW = ROOT / "preview"
TEXTURES = SOURCE / "textures"
BLEND = SOURCE / "heluo-bronze-ding-v5.blend"
GLB = EXPORT / "heluo-bronze-ding-v5.glb"
COVER = PREVIEW / "heluo-bronze-ding-v5-cover.png"

for directory in (SOURCE, EXPORT, PREVIEW, TEXTURES):
    directory.mkdir(parents=True, exist_ok=True)

random.seed(20260801)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


reset_scene()
root = bpy.context.scene.collection
model_col = bpy.data.collections.new("MODEL_HeluoBronzeDing_V5")
render_col = bpy.data.collections.new("RENDER_Only")
root.children.link(model_col)
root.children.link(render_col)


def move_to(obj, collection):
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)


def set_smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def add_bevel(obj, width, segments=3):
    modifier = obj.modifiers.new("Soft_cast_edges", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"


def make_texture(name, mode):
    """Create a packed, seamless 256px micro-detail texture for GLB export."""
    size = 256
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    image.filepath_raw = str(TEXTURES / f"{name}.png")
    pixels = [0.0] * (size * size * 4)
    for y in range(size):
        for x in range(size):
            i = (y * size + x) * 4
            grain = random.uniform(-0.035, 0.035)
            speck = random.random() < 0.018
            scratch = abs(math.sin(x * 0.19 + y * 0.027)) > 0.992
            if mode == "base":
                # Linear values are deliberately warmer and brighter than the old v4 swatch:
                # under AgX and in Three.js this remains dark bronze rather than near-black plastic.
                base = (0.125 + grain, 0.112 + grain * 0.72, 0.080 + grain * 0.42)
                if speck:
                    base = (0.070, 0.063, 0.045)
                if scratch:
                    base = tuple(min(value + 0.035, 1.0) for value in base)
                pixels[i:i + 4] = (*base, 1.0)
            elif mode == "roughness":
                value = 0.43 + grain * 2.3 + (0.08 if speck else 0.0) - (0.045 if scratch else 0.0)
                pixels[i:i + 4] = (value, value, value, 1.0)
            else:
                # Subtle tangent-space irregularity: intentionally not strong enough to look pitted.
                dx = math.sin((x + 1) * 0.28 + y * 0.11) - math.sin((x - 1) * 0.28 + y * 0.11)
                dy = math.sin(x * 0.28 + (y + 1) * 0.11) - math.sin(x * 0.28 + (y - 1) * 0.11)
                pixels[i:i + 4] = (0.5 + dx * 0.055, 0.5 + dy * 0.055, 1.0, 1.0)
    image.pixels.foreach_set(pixels)
    image.file_format = "PNG"
    image.save()
    return image


base_texture = make_texture("v5_bronze_basecolor", "base")
roughness_texture = make_texture("v5_bronze_roughness", "roughness")
normal_texture = make_texture("v5_bronze_normal", "normal")


def bronze_material(name, color, metallic, roughness, textured=False):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if textured:
        texcoord = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (3.5, 3.5, 3.5)
        base = nodes.new("ShaderNodeTexImage")
        base.image = base_texture
        base.extension = "REPEAT"
        rough = nodes.new("ShaderNodeTexImage")
        rough.image = roughness_texture
        rough.image.colorspace_settings.name = "Non-Color"
        rough.extension = "REPEAT"
        normal = nodes.new("ShaderNodeTexImage")
        normal.image = normal_texture
        normal.image.colorspace_settings.name = "Non-Color"
        normal.extension = "REPEAT"
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 0.24
        links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], base.inputs["Vector"])
        links.new(mapping.outputs["Vector"], rough.inputs["Vector"])
        links.new(mapping.outputs["Vector"], normal.inputs["Vector"])
        links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
        links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


bronze = bronze_material("Bronze_Aged_Cast_PBR", (0.125, 0.112, 0.080, 1), 0.91, 0.43, textured=True)
bronze_relief = bronze_material("Bronze_Worn_Relief", (0.094, 0.080, 0.054, 1), 0.90, 0.44)
bronze_dark = bronze_material("Bronze_Recess", (0.050, 0.038, 0.026, 1), 0.84, 0.52)
patina = bronze_material("Patina_Recess_Only", (0.012, 0.042, 0.035, 1), 0.63, 0.62)
stone = bronze_material("Charcoal_Stone", (0.025, 0.023, 0.020, 1), 0.04, 0.72)


def create_lathe_body():
    # Closed radial profile: exterior rises from the lower belly to the rim, then returns through interior wall.
    profile = [
        (0.28, -0.55), (0.66, -0.53), (1.03, -0.40), (1.28, -0.15),
        (1.38, 0.10), (1.37, 0.30), (1.31, 0.46), (1.34, 0.58),
        (1.19, 0.58), (1.16, 0.44), (1.10, 0.27), (1.04, 0.04),
        (0.96, -0.18), (0.76, -0.40), (0.34, -0.45),
    ]
    segments = 96
    vertices, faces, uvs = [], [], []
    for index in range(segments):
        angle = math.tau * index / segments
        for radius, z in profile:
            vertices.append((radius * math.cos(angle), radius * 0.82 * math.sin(angle), z))
    profile_count = len(profile)
    for index in range(segments):
        next_index = (index + 1) % segments
        for point in range(profile_count - 1):
            faces.append((
                index * profile_count + point,
                next_index * profile_count + point,
                next_index * profile_count + point + 1,
                index * profile_count + point + 1,
            ))
    mesh = bpy.data.meshes.new("V5_Hollow_Body_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            ring = vertex_index // profile_count
            point = vertex_index % profile_count
            uv.data[loop_index].uv = (ring / segments, point / (profile_count - 1))
    obj = bpy.data.objects.new("V5_Hollow_Cast_Body", mesh)
    model_col.objects.link(obj)
    mesh.materials.append(bronze)
    set_smooth(obj)
    add_bevel(obj, 0.012, 2)
    return obj


body = create_lathe_body()


def torus(name, z, major_radius, minor_radius, material, scale_y=0.82):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius, minor_radius=minor_radius,
        major_segments=96, minor_segments=16, location=(0, 0, z),
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale.y = scale_y
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    set_smooth(obj)
    move_to(obj, model_col)
    return obj


torus("V5_Outer_Double_Rim", 0.575, 1.34, 0.052, bronze_relief)
torus("V5_Inner_Rim", 0.555, 1.185, 0.025, bronze_dark)
torus("V5_Shoulder_Collar", 0.405, 1.335, 0.021, bronze_relief)
torus("V5_Lower_Contour", -0.315, 1.105, 0.014, bronze_dark)


def add_curve(name, points, bevel, material, cyclic=False):
    curve = bpy.data.curves.new(name + "_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
    spline = curve.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1.0)
    spline.order_u = min(3, len(points))
    spline.use_endpoint_u = not cyclic
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    model_col.objects.link(obj)
    curve.materials.append(material)
    return obj


def surface_point(angle, z, radius=1.35):
    return (radius * math.cos(angle), radius * 0.82 * math.sin(angle), z)


# Continuous river-line relief bands, deliberately wrapped around the vessel rather than mounted on a panel.
for band_index, (z, phase, depth) in enumerate(((0.16, 0.0, 0.007), (0.03, 0.84, 0.006), (-0.10, 1.55, 0.005)), 1):
    points = []
    for i in range(49):
        angle = math.tau * i / 48
        ripple = math.sin(angle * 4 + phase) * 0.045 + math.sin(angle * 9 - phase) * 0.014
        points.append(surface_point(angle, z + ripple, 1.382))
    add_curve(f"V5_Continuous_River_Band_{band_index}", points, depth, bronze_dark, cyclic=True)

def front_relief_point(u, z):
    # Maps the reference's frontal rectilinear relief into the curved front belly.
    # The line is intentionally half-sunk into the body so it reads as cast relief,
    # not as a bright wire glued to the surface.
    return surface_point(-math.pi / 2 + u / 1.42, z, 1.378)


def add_front_relief(name, coords, bevel=0.026):
    curve = bpy.data.curves.new(name + "_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(coords) - 1)
    for point, (u, z) in zip(spline.points, coords):
        point.co = (*front_relief_point(u, z), 1.0)
    obj = bpy.data.objects.new(name, curve)
    model_col.objects.link(obj)
    curve.materials.append(bronze_relief)
    return obj


# A bold, original geometric mask/frieze based on the supplied visual target.  It is not a panel:
# every line sits directly on the vessel curvature and continues into the small side motifs.
add_front_relief("V5_Central_Mask_Spine", [(0, -0.28), (0, 0.23)], 0.029)
for sign in (-1, 1):
    add_front_relief(f"V5_Central_Mask_Upper_{sign}", [
        (0.0, 0.19), (sign * 0.16, 0.29), (sign * 0.46, 0.29),
        (sign * 0.57, 0.16), (sign * 0.41, 0.04), (sign * 0.17, 0.04),
    ], 0.027)
    add_front_relief(f"V5_Central_Mask_Lower_{sign}", [
        (0.0, -0.08), (sign * 0.20, -0.08), (sign * 0.34, -0.19),
        (sign * 0.25, -0.30), (sign * 0.06, -0.30),
    ], 0.025)
    add_front_relief(f"V5_Side_Labyrinth_Outer_{sign}", [
        (sign * 0.62, 0.26), (sign * 1.02, 0.26), (sign * 1.08, 0.08),
        (sign * 0.92, -0.04), (sign * 0.66, -0.04), (sign * 0.58, -0.18),
        (sign * 0.81, -0.28), (sign * 1.05, -0.25),
    ], 0.025)
    add_front_relief(f"V5_Side_Labyrinth_Inner_{sign}", [
        (sign * 0.54, 0.16), (sign * 0.76, 0.16), (sign * 0.84, 0.07),
        (sign * 0.74, -0.03), (sign * 0.55, -0.03),
    ], 0.022)

# The patina material is reserved for a later baked recess mask.  No raised green spheres are
# used: those made the previous iteration read as a decorative toy instead of cast bronze.

# Shoulder bosses provide material hierarchy without visual clutter.
for index in range(18):
    angle = math.tau * index / 18
    x, y, z = surface_point(angle, 0.355, 1.382)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.036, location=(x, y, z))
    obj = bpy.context.object
    obj.name = f"V5_Shoulder_Boss_{index + 1:02d}"
    obj.data.materials.append(bronze_relief)
    move_to(obj, model_col)
    set_smooth(obj)


def create_ear(name, sign):
    # Three beveled cast blocks create the squared arch visible in the visual reference.
    inner_x, outer_x = sign * 0.84, sign * 1.31
    for piece, x, z, dimensions in (
        ("Inner_Post", inner_x, 0.75, (0.13, 0.18, 0.54)),
        ("Outer_Post", outer_x, 0.75, (0.13, 0.18, 0.54)),
        ("Top_Bridge", sign * 1.075, 1.02, (0.60, 0.18, 0.14)),
    ):
        bpy.ops.mesh.primitive_cube_add(location=(x, 0, z))
        part = bpy.context.object
        part.name = f"{name}_{piece}"
        part.dimensions = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        part.data.materials.append(bronze)
        move_to(part, model_col)
        add_bevel(part, 0.045, 4)
    for collar_index, collar_x in enumerate((inner_x, outer_x), 1):
        bpy.ops.mesh.primitive_cube_add(location=(collar_x, 0, 0.49))
        collar = bpy.context.object
        collar.name = f"{name}_Attachment_Collar_{collar_index}"
        collar.dimensions = (0.19, 0.21, 0.075)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        collar.data.materials.append(bronze_relief)
        move_to(collar, model_col)
        add_bevel(collar, 0.022, 3)


create_ear("V5_Left_Ceremonial_Ear", -1)
create_ear("V5_Right_Ceremonial_Ear", 1)


def create_leg(index, x, y, rotation):
    bpy.ops.mesh.primitive_cone_add(
        vertices=6, radius1=0.19, radius2=0.33, depth=1.15,
        location=(x, y, -1.02), rotation=(0, 0, rotation),
    )
    leg = bpy.context.object
    leg.name = f"V5_Faceted_Ritual_Leg_{index}"
    leg.scale.y = 0.88
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    leg.data.materials.append(bronze)
    move_to(leg, model_col)
    set_smooth(leg)
    add_bevel(leg, 0.028, 2)
    bpy.ops.mesh.primitive_cone_add(
        vertices=8, radius1=0.295, radius2=0.355, depth=0.105,
        location=(x, y, -0.48), rotation=(0, 0, rotation),
    )
    collar = bpy.context.object
    collar.name = f"V5_Leg_Collar_{index}"
    collar.scale.y = 0.88
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    collar.data.materials.append(bronze_relief)
    move_to(collar, model_col)
    set_smooth(collar)
    add_bevel(collar, 0.015, 2)
    # A small vertical inlay aligns with each leg rather than becoming a separate plaque.
    add_curve(
        f"V5_Leg_Inlay_{index}",
        [(x, y - 0.205 if y < 0 else y + 0.205, -0.72), (x, y - 0.218 if y < 0 else y + 0.218, -1.05)],
        0.014,
        bronze_relief,
    )


create_leg(1, 0.0, -0.78, math.radians(30))
create_leg(2, -0.92, 0.43, math.radians(150))
create_leg(3, 0.92, 0.43, math.radians(30))

# Render-only presentation plinth (not selected for GLB export).
for name, radius, depth, z, material in (
    ("Render_Plinth_Base", 1.83, 0.16, -1.64, stone),
    ("Render_Plinth_Top", 1.58, 0.095, -1.51, bronze_dark),
):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius, depth=depth, location=(0, 0, z))
    obj = bpy.context.object
    obj.name = name
    obj.scale.y = 0.82
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    move_to(obj, render_col)
    set_smooth(obj)
    add_bevel(obj, 0.035, 3)

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -1.73))
floor = bpy.context.object
floor.name = "Render_Floor"
floor.data.materials.append(stone)
move_to(floor, render_col)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


bpy.ops.object.camera_add(location=(1.05, -8.8, 1.65))
camera = bpy.context.object
camera.name = "Render_Camera"
camera.data.lens = 62
look_at(camera, (0, 0, -0.22))
move_to(camera, render_col)
bpy.context.scene.camera = camera

for name, location, energy, size, color in (
    ("Key_Warm", (4.4, -4.8, 5.7), 1650, 4.8, (1.0, 0.76, 0.58)),
    ("Fill_Neutral", (-4.0, -3.5, 3.0), 1120, 5.2, (0.72, 0.73, 0.70)),
    ("Rim_Cool", (-1.4, 3.4, 4.4), 850, 3.5, (0.34, 0.54, 0.48)),
):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    look_at(light, (0, 0, -0.12))
    move_to(light, render_col)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1200
scene.render.resolution_y = 1500
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(COVER)
scene.render.film_transparent = False
scene.world.color = (0.025, 0.022, 0.019)
scene.view_settings.look = "AgX - Medium High Contrast"

# Save the editable scene before conversion so curves and modifiers remain editable in the source file.
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.render.render(write_still=True)

# The exporter and MeshSurfaceSampler work reliably with meshes; make a disposable export copy in memory.
bpy.ops.object.select_all(action="DESELECT")
for obj in list(model_col.objects):
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if obj.type == "CURVE":
        bpy.ops.object.convert(target="MESH")

bpy.ops.object.select_all(action="DESELECT")
for obj in model_col.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.export_scene.gltf(
    filepath=str(GLB), export_format="GLB", use_selection=True,
    export_apply=True, export_materials="EXPORT", export_keep_originals=False,
)
print(f"V5_EXPORT_OK blend={BLEND} glb={GLB} cover={COVER}")
