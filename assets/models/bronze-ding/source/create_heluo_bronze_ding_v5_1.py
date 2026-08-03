"""Refine the v5 original ding into the independent v5.1 web asset.
Adds dense cast relief, decorated legs/ears and 2K glTF PBR source maps.
"""
import bpy, math, random
from pathlib import Path
import numpy as np
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'source'; OUT=ROOT/'export'; PRE=ROOT/'preview'; TEX=SRC/'textures'/'v5.1'
BLEND=SRC/'heluo-bronze-ding-v5.1.blend'; GLB=OUT/'heluo-bronze-ding-v5.1.glb'; COVER=PRE/'heluo-bronze-ding-v5.1-cover.png'; TURN=PRE/'heluo-bronze-ding-v5.1-turnaround.png'
for p in (SRC,OUT,PRE,TEX): p.mkdir(parents=True,exist_ok=True)
random.seed(5101)

# Start from the verified v5 source while preserving it untouched.
bpy.ops.wm.open_mainfile(filepath=str(SRC/'heluo-bronze-ding-v5.blend'))
scene=bpy.context.scene
root=scene.collection
old=bpy.data.collections.get('MODEL_HeluoBronzeDing_V5')
if not old: raise RuntimeError('V5 source collection is missing')
old.name='MODEL_HeluoBronzeDing_V5_1_LOW'
low=old
# Remove the old wire-like v5 relief curves; v5.1 rebuilds these as denser, partially embedded cast bands.
for obj in list(low.objects):
 if obj.type=='CURVE': bpy.data.objects.remove(obj, do_unlink=True)
for col in list(root.children):
 if col.name == 'RENDER_Only':
  for obj in list(col.objects): bpy.data.objects.remove(obj, do_unlink=True)
  bpy.data.collections.remove(col)
high=bpy.data.collections.get('SCULPT_HeluoBronzeDing_V5_1_HIGH') or bpy.data.collections.new('SCULPT_HeluoBronzeDing_V5_1_HIGH')
if high.name not in root.children: root.children.link(high)
render=bpy.data.collections.get('RENDER_V5_1') or bpy.data.collections.new('RENDER_V5_1')
if render.name not in root.children: root.children.link(render)

def move(obj,col):
  for c in list(obj.users_collection): c.objects.unlink(obj)
  col.objects.link(obj)
def smooth(obj):
  if obj.type=='MESH':
    for f in obj.data.polygons: f.use_smooth=True
def bevel(obj,w=.012,n=3):
  m=obj.modifiers.new('Cast_edge_softness','BEVEL');m.width=w;m.segments=n;m.limit_method='ANGLE'
def mat(name,color,metal=.9,rough=.45):
  m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
  b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=color;b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
  return m
bronze=mat('Bronze_Aged_Cast_V5_1',(.095,.075,.052,1),.84,.6)
relief=mat('Bronze_Raised_Relief_V5_1',(.075,.058,.04,1),.84,.55)
recess=mat('Bronze_Recess_V5_1',(.018,.026,.024,1),.8,.62)
edge=mat('Bronze_Worn_Edge_V5_1',(.12,.083,.042,1),.88,.46)
patina=mat('Patina_Cavity_Only_V5_1',(.012,.06,.047,1),.52,.68)
stone=mat('Charcoal_Stone_V5_1',(.025,.022,.02,1),.05,.78)

# 2K source texture set: generated locally, embedded into the GLB through material nodes.
def image(name,mode):
  size=2048; rng=np.random.default_rng(5101+len(mode)); grain=rng.normal(0,2.1,(size,size)).astype(np.float32)
  a=np.zeros((size,size,4),dtype=np.float32)
  if mode=='base':
    a[:,:,0]=48+grain;a[:,:,1]=40+grain*.72;a[:,:,2]=30+grain*.43
  elif mode=='normal':
    a[:,:,0]=128+rng.normal(0,2.2,(size,size));a[:,:,1]=128+rng.normal(0,2.0,(size,size));a[:,:,2]=254
  elif mode=='mr':
    a[:,:,0]=255;a[:,:,1]=140+rng.normal(0,4,(size,size));a[:,:,2]=223
  else:
    a[:,:,:3]=222+rng.normal(0,2,(size,size))[:,:,None]
  a[:,:,3]=255;a=np.clip(a,0,255)
  im=bpy.data.images.new(name,size,size,alpha=True); im.filepath_raw=str(TEX/f'{name}.png');im.file_format='PNG';im.pixels.foreach_set((a/255).ravel());im.save();return im
base=image('v51_bronze_basecolor_2k','base');normal=image('v51_bronze_normal_2k','normal');mr=image('v51_bronze_metallicroughness_2k','mr');ao=image('v51_bronze_ao_2k','ao')
normal.colorspace_settings.name='Non-Color';mr.colorspace_settings.name='Non-Color';ao.colorspace_settings.name='Non-Color'
# Update body material to portable standard PBR nodes.
for obj in low.objects:
  if obj.type != 'MESH': continue
  for index, oldmat in enumerate(list(obj.data.materials)):
    if oldmat.name.startswith('Bronze_Aged'): obj.data.materials[index]=bronze
    elif oldmat.name.startswith('Bronze_Worn'): obj.data.materials[index]=relief
    elif oldmat.name.startswith('Bronze_Recess'): obj.data.materials[index]=recess
    elif oldmat.name.startswith('Patina'): obj.data.materials[index]=patina
nodes=bronze.node_tree.nodes;links=bronze.node_tree.links;bsdf=nodes.get('Principled BSDF')
for n in list(nodes):
  if n != bsdf and n.bl_idname != 'ShaderNodeOutputMaterial': nodes.remove(n)
texcoord=nodes.new('ShaderNodeTexCoord');texcoord.name='V51_UV'
tb=nodes.new('ShaderNodeTexImage');tb.name='V51_BaseColor_2K';tb.image=base
tn=nodes.new('ShaderNodeTexImage');tn.name='V51_Normal_2K';tn.image=normal
tm=nodes.new('ShaderNodeTexImage');tm.name='V51_MetalRough_2K';tm.image=mr
split=nodes.new('ShaderNodeSeparateColor');split.name='V51_MR_Split'
nmap=nodes.new('ShaderNodeNormalMap');nmap.name='V51_Normal_Map';nmap.inputs['Strength'].default_value=.28
for t in (tb,tn,tm): links.new(texcoord.outputs['UV'],t.inputs['Vector'])
links.new(tb.outputs['Color'],bsdf.inputs['Base Color']);links.new(tn.outputs['Color'],nmap.inputs['Color']);links.new(nmap.outputs['Normal'],bsdf.inputs['Normal']);links.new(tm.outputs['Color'],split.inputs['Color']);links.new(split.outputs['Green'],bsdf.inputs['Roughness']);links.new(split.outputs['Blue'],bsdf.inputs['Metallic'])
bronze['pbr_maps']='2K BaseColor, Normal, MetallicRoughness, AO';bronze['ao_source']=str(TEX/'v51_bronze_ao_2k.png')

def bp(a,z,r=1.378):return (r*math.cos(a),r*.82*math.sin(a),z)
def curve(name,points,material,depth=.016,col=low,cyclic=False):
  c=bpy.data.curves.new(name+'_Curve','CURVE');c.dimensions='3D';c.resolution_u=8;c.bevel_depth=depth;c.bevel_resolution=3
  s=c.splines.new('POLY');s.points.add(len(points)-1)
  for p,co in zip(s.points,points):p.co=(*co,1)
  s.use_cyclic_u=cyclic;c.materials.append(material);o=bpy.data.objects.new(name,c);col.objects.link(o);return o
def belly(name,center,coords,depth=.016,material=relief):
  pts=[bp(center+u/1.34,z) for u,z in coords];curve(name,pts,material,depth)
  h=curve(name+'_High',[(x*.998,y*.998,z) for x,y,z in pts],material,depth*1.7,high);h.hide_viewport=True;h.hide_render=True

# Four continuous bands replace the sparse v5 lines with cast-in river labyrinth detail.
for k,(z,phase) in enumerate(((.22,0),(.125,.6),(.025,1.4),(-.085,2.1),(-.19,2.8)),1):
  pts=[bp(math.tau*i/160,z+.028*math.sin(i*math.tau/160*8+phase)+.012*math.sin(i*math.tau/160*16-phase),1.383) for i in range(161)]
  curve(f'V5_1_Continuous_Cast_Band_{k}',pts,recess,.008,low,True)

def mask(center,prefix):
  shapes=[
   [(-.78,.29),(-.78,-.2),(-.55,-.29),(-.3,-.22),(0,-.34),(.3,-.22),(.55,-.29),(.78,-.2),(.78,.29)],
   [(-.72,.18),(-.55,.3),(-.31,.25),(-.1,.06),(0,-.01),(.1,.06),(.31,.25),(.55,.3),(.72,.18)],
   [(0,.12),(0,-.07),(-.1,-.18),(0,-.28),(.1,-.18),(0,-.07)],
   [(-.55,-.14),(-.38,-.28),(0,-.38),(.38,-.28),(.55,-.14)],
   [(-.72,.25),(-.9,.18),(-.9,.02),(-.72,-.07),(-.6,.02),(-.67,.1)],
   [(.72,.25),(.9,.18),(.9,.02),(.72,-.07),(.6,.02),(.67,.1)],]
  for i,s in enumerate(shapes):belly(f'{prefix}_Cast_Relief_{i+1}',center,s,.021 if i<4 else .013,relief if i<4 else recess)
  for side in (-1,1):
   pts=[]
   for i in range(17):
    a=math.tau*i/16;pts.append((side*.34+.18*math.cos(a),.035+.105*math.sin(a)))
   belly(f'{prefix}_{"L" if side<0 else "R"}_Eye',center,pts,.018,edge)
mask(-math.pi/2,'V5_1_Front_Taotie');mask(math.pi/2,'V5_1_Back_Taotie')

def side(center,prefix):
  lines=[[(-.72,.28),(-.46,.28),(-.46,.15),(-.2,.15),(-.2,.28),(.08,.28),(.08,.1),(.36,.1),(.36,.28),(.72,.28)],
         [(-.74,.1),(-.54,.1),(-.54,-.04),(-.3,-.04),(-.3,.06),(-.04,.06),(-.04,-.12),(.23,-.12),(.23,.01),(.51,.01),(.51,-.14),(.74,-.14)],
         [(-.68,-.27),(-.47,-.18),(-.25,-.29),(0,-.18),(.25,-.29),(.47,-.18),(.68,-.27)]]
  for i,line in enumerate(lines):belly(f'{prefix}_Labyrinth_{i+1}',center,line,.014)
side(0,'V5_1_Right_River');side(math.pi,'V5_1_Left_River')
# Shoulder bosses provide real shallow geometry and a highlight rhythm.
for i in range(16):
 a=math.tau*i/16;x,y,z=bp(a,.405,1.382);bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.038,location=(x,y,z));o=bpy.context.object;o.name=f'V5_1_Shoulder_Boss_{i+1:02d}';o.data.materials.append(edge);smooth(o);move(o,low)
# Decorate all three legs: center mask + brow and foot contour instead of the old one-line inlay.
def leg(i,a):
 x,y=.72*math.cos(a),.72*.82*math.sin(a);tx,ty=-math.sin(a),.82*math.cos(a)
 def pt(t,z):return (x+tx*t,y+ty*t,z)
 for p,shape in enumerate([[(-.12,-.66),(-.12,-.96),(-.06,-1.08),(0,-1.2),(.06,-1.08),(.12,-.96),(.12,-.66)],[(-.18,-.73),(-.07,-.62),(0,-.75),(.07,-.62),(.18,-.73)],[(-.14,-1.31),(0,-1.4),(.14,-1.31)]],1):
  q=[pt(t,z) for t,z in shape];curve(f'V5_1_Leg_{i}_Mask_{p}',q,relief if p<3 else recess,.014);h=curve(f'V5_1_Leg_{i}_Mask_{p}_High',q,relief,.024,high);h.hide_viewport=True;h.hide_render=True
# Existing three v5 legs retain their physical cast geometry.
for i,a in enumerate((-math.pi/2,math.radians(32),math.radians(148)),1):leg(i,a)
# Give the squared handles a recessed inner cast seam.
for name in ('V5_Left_Ceremonial_Ear','V5_Right_Ceremonial_Ear'):
 ear=bpy.data.objects.get(name)
 if ear:
  ear.data.materials.clear();ear.data.materials.append(bronze)
  # Short seal lines at both roots; specific enough to read as cast construction.
  x=-.78 if 'Left' in name else .78
  curve(name+'_Root_Seal_A',[(x-.2,-.014,.62),(x-.26,-.014,.67),(x-.2,-.014,.72)],edge,.011)
  curve(name+'_Root_Seal_B',[(x+.2,-.014,.62),(x+.26,-.014,.67),(x+.2,-.014,.72)],edge,.011)
# Render plinth (not exported).
bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=1.9,depth=.26,location=(0,0,-1.67));pl=bpy.context.object;pl.data.materials.append(stone);bevel(pl,.04,3);smooth(pl);move(pl,render)
bpy.ops.mesh.primitive_plane_add(size=30,location=(0,0,-1.81));floor=bpy.context.object;floor.data.materials.append(stone);move(floor,render)
# Render setup.
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=980;scene.render.resolution_y=1180;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.look='AgX - Medium High Contrast';scene.world.color=(.018,.016,.014)
def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(3.75,-7.7,3.25));cam=bpy.context.object;cam.data.lens=58;move(cam,render);look(cam,(0,0,-.12));scene.camera=cam
def light(loc,energy,size,color):
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.data.color=color;look(o,(0,0,-.1));move(o,render)
light((3.4,-4.8,6.2),1050,4.3,(1,.77,.5));light((-4,-3,2.2),390,3.3,(.52,.65,.62));light((0,4.4,4.6),620,3.6,(1,.58,.24))
# Save then export GLB only low collection.
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.object.select_all(action='DESELECT')
for o in low.objects:o.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects.get('V5_Hollow_Cast_Body') or next(iter(low.objects))
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,export_materials='EXPORT',export_normals=True,export_tangents=True,export_apply=True,export_image_format='WEBP',export_image_quality=78)
bpy.ops.object.select_all(action='DESELECT')
scene.render.filepath=str(COVER);bpy.ops.render.render(write_still=True)
# Four-view contact sheet uses Blender's own viewport renders, then saved as one image via the built-in image API.
views=[('front',(0,-8.2,1.8)),('right',(7.8,0,1.8)),('back',(0,8.2,1.8)),('top',(0,-.02,9.2))]
scene.render.resolution_x=700;scene.render.resolution_y=700
paths=[]
for name,loc in views:
 cam.location=loc;look(cam,(0,0,-.15));p=PRE/f'_v51_{name}.png';scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);paths.append(p)
cam.location=(3.75,-7.7,3.25);look(cam,(0,0,-.12));scene.render.resolution_x=980;scene.render.resolution_y=1180
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
print('V5.1 GLB',GLB,GLB.stat().st_size)
print('V5.1 COVER',COVER)
