import bpy
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source'
EXPORT = ROOT / 'export'
PREVIEW = ROOT / 'preview'
BLEND = SOURCE / 'heluo-bronze-ding-v4.blend'
GLB = EXPORT / 'heluo-bronze-ding-v4.glb'
COVER = PREVIEW / 'heluo-bronze-ding-v4-cover.png'

# Reset scene.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name != 'Collection': bpy.data.collections.remove(c)
root = bpy.context.scene.collection
if bpy.data.collections.get('Collection'): bpy.data.collections.remove(bpy.data.collections['Collection'])
model_col = bpy.data.collections.new('MODEL_HeluoBronzeDing_V2'); root.children.link(model_col)
render_col = bpy.data.collections.new('RENDER_Only'); root.children.link(render_col)

def move(obj, col):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    col.objects.link(obj)

def mat(name, color, metallic, roughness, noise=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n=m.node_tree.nodes; l=m.node_tree.links; b=n.get('Principled BSDF')
    b.inputs['Metallic'].default_value=metallic; b.inputs['Roughness'].default_value=roughness
    if noise:
        tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=4.6; tex.inputs['Detail'].default_value=5.5
        ramp=n.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position=.27; ramp.color_ramp.elements[0].color=(0.006,0.025,0.018,1)
        ramp.color_ramp.elements[1].position=.72; ramp.color_ramp.elements[1].color=color
        bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.18; bump.inputs['Distance'].default_value=.06
        l.new(tex.outputs['Fac'],ramp.inputs['Fac']); l.new(ramp.outputs['Color'],b.inputs['Base Color']); l.new(tex.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs['Normal'],b.inputs['Normal'])
    else: b.inputs['Base Color'].default_value=color
    return m
bronze=mat('Bronze_Aged_Brown',(0.14,0.075,0.028,1),.88,.42,False)
dark_bronze=mat('Bronze_Dark_Relief',(0.055,0.027,0.012,1),.88,.46,False)
relief=mat('Subtle_Engraved_Bronze',(0.105,0.050,0.018,1),.90,.43,False)
gold=mat('Muted_Antique_Gold',(0.34,0.175,0.035,1),.90,.36)
stone=mat('Dark_Gallery_Stone',(0.012,0.02,0.017,1),.15,.42)

# Custom hollow round body with taller collar.
def ring_mesh():
    profile=[
        (0.0,-.78),(.54,-.75),(1.02,-.62),(1.25,-.42),(1.36,-.12),(1.37,.18),(1.31,.40),(1.24,.53),(1.20,.62),
        (1.05,.62),(1.00,.47),(.91,.20),(.74,-.14),(.50,-.46),(0.0,-.55)
    ]
    seg=80; verts=[]; faces=[]
    for i in range(seg):
        a=2*math.pi*i/seg
        for r,z in profile: verts.append((r*math.cos(a),r*math.sin(a)*.86,z))
    p=len(profile)
    for i in range(seg):
        ni=(i+1)%seg
        for j in range(p-1): faces.append((i*p+j,ni*p+j,ni*p+j+1,i*p+j+1))
    me=bpy.data.meshes.new('Refined_Ding_Body_Mesh'); me.from_pydata(verts,[],faces); me.update()
    ob=bpy.data.objects.new('Refined_Ding_Body',me); model_col.objects.link(ob); me.materials.append(bronze)
    for f in me.polygons: f.use_smooth=True
    be=ob.modifiers.new('Cast_edge_softness','BEVEL'); be.width=.018; be.segments=2
    return ob
body=ring_mesh()

# Bronze and antique-gold rim layers.
for name,z,major,minor,material in [('Upper_dark_band',.50,1.21,.052,dark_bronze),('Upper_gold_band',.625,1.125,.020,relief),('Lower_gold_band',.26,1.34,.025,gold)]:
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=80,minor_segments=12,location=(0,0,z))
    o=bpy.context.object; o.name=name; o.scale.y=.86; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material); move(o,model_col)
    for f in o.data.polygons:f.use_smooth=True

# Front plaque inset, a contrasting bronze panel.
bpy.ops.mesh.primitive_cube_add(location=(0,-1.187,.16))
panel=bpy.context.object; panel.name='Front_Ritual_Relief_Panel'; panel.dimensions=(1.68,.055,.44); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); panel.data.materials.append(dark_bronze); move(panel,model_col)
be=panel.modifiers.new('Panel_rounded_edge','BEVEL');be.width=.06;be.segments=4

# Curving, symmetric original river/taotie-like relief lines.
def curve_path(name, points, bevel=.035, material=gold):
    cu=bpy.data.curves.new(name+'_Curve','CURVE'); cu.dimensions='3D'; cu.bevel_depth=bevel; cu.bevel_resolution=3
    sp=cu.splines.new('BEZIER'); sp.bezier_points.add(len(points)-1)
    for bp,co in zip(sp.bezier_points,points):
        bp.co=co; bp.handle_left_type='AUTO'; bp.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,cu); model_col.objects.link(ob); cu.materials.append(material); return ob
# central spine and four mirrored flow scrolls on front
curve_path('Relief_Center_Spine',[(0,-1.225,-.01),(0,-1.235,.18),(0,-1.225,.36)],.018,relief)
for sign in (-1,1):
    curve_path(f'Relief_Upper_Scroll_{sign}',[(0,-1.225,.26),(sign*.24,-1.23,.34),(sign*.55,-1.225,.28),(sign*.66,-1.22,.16),(sign*.46,-1.22,.08)],.020,relief)
    curve_path(f'Relief_Lower_Scroll_{sign}',[(0,-1.23,.10),(sign*.22,-1.232,.00),(sign*.50,-1.23,.01),(sign*.61,-1.228,-.10),(sign*.42,-1.225,-.16)],.018,relief)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=.072,location=(sign*.39,-1.245,.18))
    eye=bpy.context.object;eye.name=f'Relief_Eye_{sign}';eye.data.materials.append(relief);move(eye,model_col)
# Decorative lower river strokes
for z in (-.30,-.38): curve_path(f'Lower_River_Band_{z}', [(-.90,-1.02,z),(-.35,-1.23,z+.025),(0,-1.27,z-.01),(.35,-1.23,z+.025),(.90,-1.02,z)], .018, dark_bronze)

# Small side plaques make the model read well when rotated.
for xsign in (-1,1):
    bpy.ops.mesh.primitive_cube_add(location=(xsign*1.30,0,.12),rotation=(0,0,math.pi/2))
    side=bpy.context.object;side.name=f'Side_Relief_Panel_{xsign}';side.dimensions=(1.15,.05,.34);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);side.data.materials.append(dark_bronze);move(side,model_col)
    be=side.modifiers.new('Side_panel_bevel','BEVEL');be.width=.04;be.segments=3

# Four-sided, tapered legs; three-foot configuration.
for i,a_deg in enumerate((90,210,330),1):
    a=math.radians(a_deg); x=.74*math.cos(a); y=.63*math.sin(a)
    bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.19,radius2=.28,depth=.96,location=(x,y,-1.12),rotation=(0,0,math.radians(45)))
    leg=bpy.context.object;leg.name=f'Ritual_Square_Leg_{i}';leg.data.materials.append(bronze);move(leg,model_col)
    be=leg.modifiers.new('Leg_softness','BEVEL');be.width=.045;be.segments=3
    # Small collar at each upper leg
    bpy.ops.mesh.primitive_cube_add(location=(x,y,-.68),rotation=(0,0,math.radians(45)))
    collar=bpy.context.object;collar.name=f'Leg_Collar_{i}';collar.dimensions=(.42,.42,.11);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);collar.data.materials.append(gold);move(collar,model_col)
    be=collar.modifiers.new('Collar_bevel','BEVEL');be.width=.025;be.segments=2

# Integrated double ears shaped as squared ceremonial loops.
def ear(name,sign):
    pts=[(sign*.73,0,.50),(sign*.73,0,.96),(sign*1.00,0,1.08),(sign*1.11,0,.86),(sign*1.11,0,.54)]
    return curve_path(name,pts,.062,bronze)
ear('Left_Ceremonial_Ear',-1);ear('Right_Ceremonial_Ear',1)

# Small rivets below the collar give tactile detail.
for i in range(16):
    a=2*math.pi*i/16; r=1.37; x=r*math.cos(a);y=r*.86*math.sin(a)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.032,location=(x,y,.43))
    riv=bpy.context.object;riv.name=f'Rim_Rivet_{i+1:02d}';riv.data.materials.append(relief);move(riv,model_col)

# Display base as a stepped octagonal plinth.
for name,r,z,h,material in [('Pedestal_Lower',1.85,-1.64,.14,stone),('Pedestal_Upper',1.56,-1.54,.10,dark_bronze)]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=h,location=(0,0,z),rotation=(0,0,math.radians(15)))
    p=bpy.context.object;p.name=name;p.scale.y=.82;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);p.data.materials.append(material);move(p,model_col)
    be=p.modifiers.new('Plinth_bevel','BEVEL');be.width=.055;be.segments=3

# Render-only floor and backdrop.
bpy.ops.mesh.primitive_plane_add(size=20,location=(0,0,-1.72));floor=bpy.context.object;floor.name='Render_Floor';floor.data.materials.append(stone);move(floor,render_col)
# circular gold halo behind artifact
bpy.ops.mesh.primitive_torus_add(major_radius=2.30,minor_radius=.015,major_segments=96,minor_segments=8,location=(0,1.5,.1),rotation=(math.radians(90),0,0))
halo=bpy.context.object;halo.name='Render_Halo';halo.data.materials.append(gold);halo.hide_render=True;move(halo,render_col)

def track(obj,target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-7.2,1.30));cam=bpy.context.object;cam.name='Render_Camera';cam.data.lens=58;track(cam,(0,0,-.20));move(cam,render_col);bpy.context.scene.camera=cam
for name,loc,energy,size,color in [
 ('Key',(3.6,-4.5,5.2),1350,4.0,(1.0,.68,.36)),('Fill',(-4.5,-3.5,3.0),700,4.0,(.34,.22,.12)),('Rim',(0,2.5,4.4),1150,3.0,(1.0,.46,.12))]:
    bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.name=name;l.data.energy=energy;l.data.shape='DISK';l.data.size=size;l.data.color=color;track(l,(0,0,-.1));move(l,render_col)

sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE';sc.render.resolution_x=1024;sc.render.resolution_y=1024;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.render.filepath=str(COVER);sc.world.color=(.003,.008,.006);sc.view_settings.look='AgX - Medium High Contrast'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND));bpy.ops.render.render(write_still=True)
bpy.ops.object.select_all(action='DESELECT')
for o in model_col.objects:o.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,export_apply=True,export_materials='EXPORT')
print(f'V4_EXPORT_OK blend={BLEND} glb={GLB} cover={COVER}')




