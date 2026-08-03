"""Create v5.2 from Cleveland Museum CC0 multi-view reference imagery.
The geometry and PBR materials are a new project reconstruction; no downloaded Sketchfab mesh is used.
"""
import bpy, math
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]; SRC=ROOT/'source'; OUT=ROOT/'export'; PRE=ROOT/'preview'; TEX=SRC/'textures'/'v5.2'
for p in (SRC,OUT,PRE,TEX):p.mkdir(parents=True,exist_ok=True)
BLEND=SRC/'heluo-bronze-ding-v5.2.blend'; GLB=OUT/'heluo-bronze-ding-v5.2.glb'; COVER=PRE/'heluo-bronze-ding-v5.2-cover.png'

def clear():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for c in list(bpy.data.collections): bpy.data.collections.remove(c)
clear();root=bpy.context.scene.collection
low=bpy.data.collections.new('MODEL_HeluoBronzeDing_V5_2_LOW');high=bpy.data.collections.new('SCULPT_HeluoBronzeDing_V5_2_HIGH');render=bpy.data.collections.new('RENDER_V5_2');root.children.link(low);root.children.link(high);root.children.link(render)
def move(o,c):
 for x in list(o.users_collection):x.objects.unlink(o)
 c.objects.link(o)
def smooth(o):
 if o.type=='MESH':
  for f in o.data.polygons:f.use_smooth=True
def bevel(o,w=.012,n=3):
 m=o.modifiers.new('Cast_edge_softness','BEVEL');m.width=w;m.segments=n;m.limit_method='ANGLE'
def make_map(name,kind):
 s=2048;rng=np.random.default_rng(5202+len(kind));noise=rng.normal(0,2.4,(s,s)).astype(np.float32);a=np.zeros((s,s,4),np.float32)
 if kind=='base':a[:,:,0]=64+noise;a[:,:,1]=53+noise*.72;a[:,:,2]=38+noise*.5
 elif kind=='normal':a[:,:,0]=128+rng.normal(0,2.1,(s,s));a[:,:,1]=128+rng.normal(0,2.1,(s,s));a[:,:,2]=254
 elif kind=='mr':a[:,:,0]=255;a[:,:,1]=154+rng.normal(0,4,(s,s));a[:,:,2]=210
 else:a[:,:,:3]=224+rng.normal(0,1.5,(s,s))[:,:,None]
 a[:,:,3]=255;a=np.clip(a,0,255);im=bpy.data.images.new(name,s,s,alpha=True);im.filepath_raw=str(TEX/(name+'.png'));im.file_format='PNG';im.pixels.foreach_set((a/255).ravel());im.save();return im
base=make_map('v52_cma_reconstruction_basecolor_2k','base');normal=make_map('v52_cma_reconstruction_normal_2k','normal');mr=make_map('v52_cma_reconstruction_metallicroughness_2k','mr');ao=make_map('v52_cma_reconstruction_ao_2k','ao');normal.colorspace_settings.name='Non-Color';mr.colorspace_settings.name='Non-Color';ao.colorspace_settings.name='Non-Color'
def material(name,color,metal=.9,rough=.5,textured=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;b=n.get('Principled BSDF');b.inputs['Base Color'].default_value=color;b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
 if textured:
  for x in list(n):
   if x!=b and x.bl_idname!='ShaderNodeOutputMaterial':n.remove(x)
  uv=n.new('ShaderNodeTexCoord');tb=n.new('ShaderNodeTexImage');tb.image=base;tn=n.new('ShaderNodeTexImage');tn.image=normal;tm=n.new('ShaderNodeTexImage');tm.image=mr;sep=n.new('ShaderNodeSeparateColor');nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.24
  for x in (tb,tn,tm):l.new(uv.outputs['UV'],x.inputs['Vector'])
  l.new(tb.outputs['Color'],b.inputs['Base Color']);l.new(tn.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],b.inputs['Normal']);l.new(tm.outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],b.inputs['Roughness']);l.new(sep.outputs['Blue'],b.inputs['Metallic'])
 m['pbr_maps']='2K generated reconstruction maps: BaseColor, Normal, Metallic-Roughness, AO';return m
# Keep the broad areas grey-brown rather than saturated green. The contrast is
# deliberately carried by roughness, recessed patina, and worn relief edges.
bronze=material('CMA_Reconstruction_Aged_Bronze',(.13,.105,.073,1),.84,.58,True);relief=material('CMA_Reconstruction_Raised_Relief',(.081,.064,.044,1),.86,.5);edge=material('CMA_Reconstruction_Worn_Edge',(.145,.097,.052,1),.9,.43);recess=material('CMA_Reconstruction_Recess',(.021,.035,.029,1),.7,.64);patina=material('CMA_Reconstruction_Cavity_Patina',(.014,.065,.052,1),.55,.68);stone=material('Charcoal_Stone',(.025,.023,.02,1),.05,.78)
def lathe(name,profile,mat,ys=.88):
 seg=128;v=[];f=[];pc=len(profile)
 for r in range(seg):
  a=math.tau*r/seg
  for rad,z in profile:v.append((rad*math.cos(a),rad*ys*math.sin(a),z))
 for r in range(seg):
  q=(r+1)%seg
  for p in range(pc-1):f.append((r*pc+p,q*pc+p,q*pc+p+1,r*pc+p+1))
 me=bpy.data.meshes.new(name+'_Mesh');me.from_pydata(v,[],f);me.update();uv=me.uv_layers.new(name='UVMap')
 for poly in me.polygons:
  for li in poly.loop_indices:
   ring,pt=divmod(me.loops[li].vertex_index,pc);uv.data[li].uv=(ring/seg,pt/(pc-1))
 o=bpy.data.objects.new(name,me);low.objects.link(o);me.materials.append(mat);smooth(o);bevel(o,.012,2);return o
body=lathe('V5_2_CMA_Reference_Reconstructed_Body',[(.31,-.51),(.57,-.51),(.89,-.42),(1.06,-.27),(1.14,-.05),(1.15,.15),(1.1,.34),(1.08,.43),(1.19,.51),(1.05,.51),(1.0,.35),(.94,.08),(.83,-.26),(.48,-.46)],bronze)
def torus(name,z,maj,minr,mat):
 bpy.ops.mesh.primitive_torus_add(major_radius=maj,minor_radius=minr,major_segments=128,minor_segments=16,location=(0,0,z));o=bpy.context.object;o.name=name;o.scale.y=.88;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);smooth(o);move(o,low);return o
torus('V5_2_Flared_Rim',.51,1.18,.045,edge);torus('V5_2_Rim_Inner_Shadow',.49,1.05,.017,recess);torus('V5_2_Upper_Band',.35,1.105,.014,relief);torus('V5_2_Lower_Band',-.12,1.12,.012,recess)
def surface(a,z,r=1.145):return (r*math.cos(a),r*.88*math.sin(a),z)
def curve(name,pts,mat,depth=.012,col=low,cyclic=False):
 c=bpy.data.curves.new(name+'_Curve','CURVE');c.dimensions='3D';c.resolution_u=8;c.bevel_depth=depth;c.bevel_resolution=3;s=c.splines.new('POLY');s.points.add(len(pts)-1)
 for p,q in zip(s.points,pts):p.co=(*q,1)
 s.use_cyclic_u=cyclic;c.materials.append(mat);o=bpy.data.objects.new(name,c);col.objects.link(o);return o
def relief_path(name,center,coords,depth=.013,mat=relief):
 pts=[surface(center+u/1.12,z) for u,z in coords];curve(name,pts,mat,depth);h=curve(name+'_High',[(x*.998,y*.998,z) for x,y,z in pts],mat,depth*1.65,high);h.hide_viewport=True;h.hide_render=True
# upper repeating interlocking square-scroll band, observed in CMA reference.
for i in range(12):
 c=math.tau*i/12
 relief_path(f'V5_2_Upper_Scroll_{i:02d}',c,[(-.21,.4),(-.21,.28),(-.07,.28),(-.07,.37),(.08,.37),(.08,.27),(.22,.27),(.22,.4)],.010,recess)
# lower cicada panels: six dense shield masks wrapped across the bowl.
for i in range(6):
 c=math.tau*i/6
 relief_path(f'V5_2_Cicada_Frame_{i}',c,[(-.2,.22),(-.25,.05),(-.16,-.2),(0,-.34),(.16,-.2),(.25,.05),(.2,.22)],.017)
 relief_path(f'V5_2_Cicada_Brow_{i}',c,[(-.18,.15),(-.09,.23),(0,.14),(.09,.23),(.18,.15)],.014,edge)
 relief_path(f'V5_2_Cicada_Nose_{i}',c,[(0,.14),(0,-.11),(-.06,-.2),(0,-.27),(.06,-.2),(0,-.11)],.012,recess)
 for side in (-1,1):
  ring=[]
  for k in range(13):
   a=math.tau*k/12;ring.append((side*.095+.052*math.cos(a),.055+.04*math.sin(a)))
  relief_path(f'V5_2_Cicada_Eye_{i}_{side}',c,ring,.009,edge)
# tiny boss line between panels.
for i in range(18):
 a=math.tau*i/18;x,y,z=surface(a,.40,1.15);bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.026,location=(x,y,z));o=bpy.context.object;o.name=f'V5_2_Rim_Boss_{i:02d}';o.data.materials.append(edge);smooth(o);move(o,low)
# Three stout legs copied from the actual reference proportions.
for i,a in enumerate((-math.pi/2,math.radians(30),math.radians(150)),1):
 x,y=.67*math.cos(a),.67*.88*math.sin(a);bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=.16,radius2=.2,depth=.92,location=(x,y,-.84));o=bpy.context.object;o.name=f'V5_2_Cylindrical_Leg_{i}';o.data.materials.append(bronze);smooth(o);bevel(o,.014,2);move(o,low)
 # restrained upper leg collar
 bpy.ops.mesh.primitive_torus_add(major_radius=.2,minor_radius=.016,major_segments=32,minor_segments=8,location=(x,y,-.4));q=bpy.context.object;q.name=f'V5_2_Leg_Collar_{i}';q.data.materials.append(relief);smooth(q);move(q,low)
 # Each foot receives a compact face / taotie suggestion. This follows the
 # reference's decorated collars without claiming a literal reproduction.
 def leg_point(u,z,rad=.205):
  ang=a+u;return ((.67+rad)*math.cos(ang),(.67+rad)*.88*math.sin(ang),z)
 def leg_curve(label,coords,depth=.011,mat=relief):
  curve(label,[leg_point(u,z) for u,z in coords],mat,depth,low)
 leg_curve(f'V5_2_Leg_Brow_{i}',[(-.13,-.48),(0,-.40),(.13,-.48)],.013,edge)
 leg_curve(f'V5_2_Leg_Nose_{i}',[(0,-.42),(0,-.68),(-.05,-.75),(0,-.79),(.05,-.75),(0,-.68)],.011,recess)
 for side in (-1,1):
  leg_curve(f'V5_2_Leg_Eye_{i}_{side}',[(side*.075,-.54),(side*.052,-.58),(side*.075,-.62),(side*.098,-.58),(side*.075,-.54)],.008,edge)
# Compact squared U ears, unlike the tall prior version.
def ear(name,x):
 pts=[(x-.14,0,.47),(x-.14,0,.86),(x-.08,0,.98),(x+.08,0,.98),(x+.14,0,.86),(x+.14,0,.47)];curve(name,pts,bronze,.054,low);curve(name+'_Inner_Channel',[(x-.08,-.006,.51),(x-.08,-.006,.83),(x, -0.006,.91),(x+.08,-.006,.83),(x+.08,-.006,.51)],recess,.010,low)
ear('V5_2_Left_Compact_Ear',-.66);ear('V5_2_Right_Compact_Ear',.66)
# Sparse cavity patina only in rim recess and selected lower ornaments.
for i in range(8):
 a=math.tau*i/8;relief_path(f'V5_2_Patina_Cavity_{i}',a,[(-.035,.30),(.035,.30)],.006,patina)
# Render-only plinth.
bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=1.72,depth=.24,location=(0,0,-1.35));p=bpy.context.object;p.data.materials.append(stone);smooth(p);bevel(p,.035,3);move(p,render)
bpy.ops.mesh.primitive_plane_add(size=25,location=(0,0,-1.48));g=bpy.context.object;g.data.materials.append(stone);move(g,render)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=980;scene.render.resolution_y=1180;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.look='AgX - Medium High Contrast';scene.world.color=(.014,.014,.012)
def look(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(3.15,-7.3,2.35));cam=bpy.context.object;cam.data.lens=62;look(cam,(0,0,-.25));scene.camera=cam;move(cam,render)
def light(loc,e,size,col):
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=e;o.data.size=size;o.data.color=col;look(o,(0,0,-.25));move(o,render)
light((3.5,-4.7,5.5),1050,4,(1,.76,.48));light((-4,-2.5,2.4),430,3.2,(.55,.68,.64));light((0,4.5,3.8),520,3,(1,.55,.25))
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND));bpy.ops.object.select_all(action='DESELECT')
for o in low.objects:o.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,export_materials='EXPORT',export_normals=True,export_tangents=True,export_apply=True,export_image_format='WEBP',export_image_quality=78)
bpy.ops.object.select_all(action='DESELECT');scene.render.filepath=str(COVER);bpy.ops.render.render(write_still=True)
# reference validation angles
scene.render.resolution_x=700;scene.render.resolution_y=700
for label,loc in [('front',(0,-7.7,1.3)),('right',(7.2,0,1.3)),('back',(0,7.7,1.3)),('top',(0,0,8.3))]:
 cam.location=loc;look(cam,(0,0,-.25));scene.render.filepath=str(PRE/f'_v52_{label}.png');bpy.ops.render.render(write_still=True)
cam.location=(3.15,-7.3,2.35);look(cam,(0,0,-.25));scene.render.resolution_x=980;scene.render.resolution_y=1180;bpy.ops.wm.save_as_mainfile(filepath=str(BLEND));print('V5.2 GLB',GLB.stat().st_size)
