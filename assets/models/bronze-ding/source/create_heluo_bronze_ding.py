import bpy
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "source"
EXPORT_DIR = ROOT / "export"
PREVIEW_DIR = ROOT / "preview"
BLEND_PATH = SOURCE_DIR / "heluo-bronze-ding.blend"
GLB_PATH = EXPORT_DIR / "heluo-bronze-ding.glb"
PREVIEW_PATH = PREVIEW_DIR / "heluo-bronze-ding-cover.png"

# Clean the default scene.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != "Collection":
        bpy.data.collections.remove(collection)
root_collection = bpy.context.scene.collection
base_collection = bpy.data.collections.get("Collection")
if base_collection:
    bpy.data.collections.remove(base_collection)
model_collection = bpy.data.collections.new("MODEL_HeluoBronzeDing")
root_collection.children.link(model_collection)
scene_collection = bpy.data.collections.new("SCENE_RenderOnly")
root_collection.children.link(scene_collection)

def move_to(obj, collection):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)

def material_bronze():
    mat = bpy.data.materials.new("Patinated_Bronze")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Metallic"].default_value = 0.9
    bsdf.inputs["Roughness"].default_value = 0.34
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.8
    noise.inputs["Detail"].default_value = 5.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[0].color = (0.018, 0.045, 0.032, 1)
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (0.18, 0.43, 0.28, 1)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.17
    bump.inputs["Distance"].default_value = 0.08
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def material_gold():
    mat = bpy.data.materials.new("Antique_Gold")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.38, 0.16, 0.025, 1)
    bsdf.inputs["Metallic"].default_value = 0.92
    bsdf.inputs["Roughness"].default_value = 0.28
    return mat

def material_stone():
    mat = bpy.data.materials.new("Charcoal_Stone")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.018, 0.024, 0.022, 1)
    bsdf.inputs["Roughness"].default_value = 0.48
    return mat

bronze = material_bronze()
gold = material_gold()
stone = material_stone()

def smooth(obj):
    if hasattr(obj.data, "polygons"):
        for p in obj.data.polygons:
            p.use_smooth = True

def add_lathe_body():
    # Radius/Z profile traverses exterior, rim, interior and closes at the inner floor.
    profile = [
        (0.00, -0.73), (0.58, -0.69), (1.10, -0.53), (1.39, -0.22),
        (1.43, 0.16), (1.35, 0.43), (1.19, 0.59), (1.14, 0.66),
        (0.99, 0.66), (0.96, 0.50), (0.84, 0.22), (0.69, -0.12),
        (0.49, -0.42), (0.00, -0.48)
    ]
    segments = 64
    verts, faces = [], []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        for r, z in profile:
            verts.append((r * math.cos(a), r * math.sin(a) * 0.86, z))
    ring = len(profile)
    for i in range(segments):
        nxt = (i + 1) % segments
        for j in range(ring - 1):
            faces.append((i * ring + j, nxt * ring + j, nxt * ring + j + 1, i * ring + j + 1))
    mesh = bpy.data.meshes.new("Ding_Body_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Ding_Body", mesh)
    model_collection.objects.link(obj)
    obj.data.materials.append(bronze)
    smooth(obj)
    bevel = obj.modifiers.new("Soft_cast_edges", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 2
    return obj

body = add_lathe_body()

# Rim bands
for z, major, minor in [(0.62, 1.13, 0.055), (0.37, 1.32, 0.035)]:
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=64, minor_segments=12, location=(0,0,z))
    torus = bpy.context.active_object
    torus.name = "Ding_Rim_Band"
    torus.scale.y = 0.86
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    torus.data.materials.append(gold)
    move_to(torus, model_collection)
    smooth(torus)

# Three tapered tripod legs
for i in range(3):
    a = math.radians(90 + i * 120)
    x, y = 0.76 * math.cos(a), 0.63 * math.sin(a)
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.15, radius2=0.25, depth=0.98, location=(x,y,-1.04))
    leg = bpy.context.active_object
    leg.name = f"Ding_Tripod_Leg_{i+1}"
    leg.data.materials.append(bronze)
    move_to(leg, model_collection)
    smooth(leg)
    bevel = leg.modifiers.new("Leg_edge_softness", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 2

# Two loop-shaped ears, as original simplified sculptural handles.
def add_ear(name, sign):
    curve = bpy.data.curves.new(name + "_Curve", type="CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.075
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(3)
    points = [
        (sign*0.72, 0, 0.52), (sign*0.72, 0, 1.03),
        (sign*1.03, 0, 1.08), (sign*1.03, 0, 0.56)
    ]
    for p, co in zip(spline.bezier_points, points):
        p.co = co
        p.handle_left_type = "AUTO"
        p.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    model_collection.objects.link(obj)
    curve.materials.append(bronze)
    return obj
add_ear("Ding_Left_Ear", -1)
add_ear("Ding_Right_Ear", 1)

# Abstract raised river-map motif band: twelve original gold relief tiles.
for i in range(12):
    a = 2 * math.pi * i / 12
    r = 1.40
    x, y = r * math.cos(a), r * math.sin(a) * 0.86
    bpy.ops.mesh.primitive_cube_add(location=(x, y, 0.06), rotation=(0,0,a))
    motif = bpy.context.active_object
    motif.name = f"River_Motif_{i+1:02d}"
    motif.dimensions = (0.17, 0.055, 0.12)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    motif.data.materials.append(gold)
    move_to(motif, model_collection)
    bevel = motif.modifiers.new("Motif_rounding", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 2

# Museum pedestal, included as part of the display model.
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.75, depth=0.16, location=(0,0,-1.58))
pedestal = bpy.context.active_object
pedestal.name = "Display_Pedestal"
pedestal.scale.y = 0.86
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
pedestal.data.materials.append(stone)
move_to(pedestal, model_collection)
bevel = pedestal.modifiers.new("Pedestal_bevel", "BEVEL")
bevel.width = 0.07
bevel.segments = 3
smooth(pedestal)

# Render-only floor and lighting.
bpy.ops.mesh.primitive_plane_add(size=20, location=(0,0,-1.68))
floor = bpy.context.active_object
floor.name = "Render_Floor"
floor.data.materials.append(stone)
move_to(floor, scene_collection)

def point_camera(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

bpy.ops.object.camera_add(location=(4.3, -6.3, 2.75))
camera = bpy.context.active_object
camera.name = "Render_Camera"
camera.data.lens = 56
point_camera(camera, (0,0,-0.15))
move_to(camera, scene_collection)
bpy.context.scene.camera = camera

for name, loc, energy, size, color in [
    ("Key_Light", (3.5,-3.5,5.2), 1100, 4.0, (1.0,0.77,0.48)),
    ("Fill_Light", (-4,-2,2.5), 650, 4.0, (0.22,0.48,0.36)),
    ("Rim_Light", (0,3.5,4.0), 900, 3.0, (1.0,0.57,0.2))
]:
    bpy.ops.object.light_add(type="AREA", location=loc)
    light = bpy.context.active_object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    point_camera(light, (0,0,-0.1))
    move_to(light, scene_collection)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(PREVIEW_PATH)
scene.render.film_transparent = False
scene.world.color = (0.006, 0.012, 0.009)
scene.view_settings.look = "AgX - Medium High Contrast"

# Save editable source with render setup, then produce a cover render.
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
bpy.ops.render.render(write_still=True)

# Export only the display asset. Modifiers are applied by exporter.
bpy.ops.object.select_all(action="DESELECT")
for obj in model_collection.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.export_scene.gltf(filepath=str(GLB_PATH), export_format="GLB", use_selection=True, export_apply=True, export_materials="EXPORT")
print(f"MODEL_EXPORT_OK blend={BLEND_PATH} glb={GLB_PATH} preview={PREVIEW_PATH}")

