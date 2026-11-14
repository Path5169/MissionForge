import bpy
import bmesh
import math
import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODELS_DIR = os.path.join(PROJECT_ROOT, "frontend", "assets", "models", "rocket_components")
BLENDER_DIR = os.path.join(PROJECT_ROOT, "frontend", "assets", "blender")
os.makedirs(MODELS_DIR, exist_ok=True)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_pbr_material(name, base_color, metallic=0.0, roughness=0.5):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = base_color
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Roughness'].default_value = roughness
    return mat

def build_rocket_components():
    reset_scene()
    print("Building Modular 3D Rocket Parts in Blender...")
    
    mat_white = create_pbr_material("Rocket_White", (0.92, 0.93, 0.95, 1.0), metallic=0.25, roughness=0.35)
    mat_black = create_pbr_material("Interstage_Black", (0.12, 0.13, 0.15, 1.0), metallic=0.7, roughness=0.45)
    mat_copper = create_pbr_material("Engine_Nozzle_Copper", (0.85, 0.52, 0.30, 1.0), metallic=0.92, roughness=0.28)
    mat_steel = create_pbr_material("Turbopump_Steel", (0.75, 0.77, 0.80, 1.0), metallic=0.9, roughness=0.25)
    mat_amber = create_pbr_material("Thermal_Amber", (0.95, 0.65, 0.12, 1.0), metallic=0.85, roughness=0.3)

    # 1. Medium Fuel Tank (diameter 2.5m, height 5.0m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.25, depth=5.0, location=(-6.0, 0, 2.5))
    tank = bpy.context.active_object
    tank.name = "Part_Tank_Medium"
    tank.data.materials.append(mat_white)
    
    # Rib rings
    for rz in [1.0, 2.5, 4.0]:
        bpy.ops.mesh.primitive_torus_add(major_radius=1.26, minor_radius=0.03, location=(-6.0, 0, rz))
        ring = bpy.context.active_object
        ring.data.materials.append(mat_black)

    # 2. Main Booster Engine (cluster with 4 nozzles + center turbopump)
    ex = 0.0
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1.2, depth=0.8, location=(ex, 0, 1.4))
    eng_dome = bpy.context.active_object
    eng_dome.name = "Part_Engine_Cluster"
    eng_dome.data.materials.append(mat_black)
    
    # 4 Nozzles
    for angle in [math.pi/4, 3*math.pi/4, 5*math.pi/4, 7*math.pi/4]:
        nx = ex + 0.6 * math.cos(angle)
        ny = 0.6 * math.sin(angle)
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.45, radius2=0.18, depth=1.2, location=(nx, ny, 0.6))
        nozzle = bpy.context.active_object
        nozzle.data.materials.append(mat_copper)

    # 3. Ogive Aerodynamic Nose Cone (diameter 2.5m, height 3.5m)
    cx = 6.0
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=1.25, radius2=0.05, depth=3.5, location=(cx, 0, 1.75))
    cone = bpy.context.active_object
    cone.name = "Part_NoseCone_Ogive"
    cone.data.materials.append(mat_white)

    # 4. Decoupler / Interstage Ring
    dx = -6.0
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.27, depth=0.6, location=(dx, 6.0, 0.3))
    decoupler = bpy.context.active_object
    decoupler.name = "Part_Decoupler"
    decoupler.data.materials.append(mat_amber)

    blend_path = os.path.join(BLENDER_DIR, "rocket_components.blend")
    glb_path = os.path.join(MODELS_DIR, "rocket_parts.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', export_apply=True)
    print("SUCCESS: Exported Rocket Components ->", glb_path)

if __name__ == "__main__":
    build_rocket_components()
