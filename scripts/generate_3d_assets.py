import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODELS_DIR = os.path.join(PROJECT_ROOT, "frontend", "assets", "models")
BLENDER_DIR = os.path.join(PROJECT_ROOT, "frontend", "assets", "blender")

os.makedirs(os.path.join(MODELS_DIR, "launch_site"), exist_ok=True)
os.makedirs(os.path.join(MODELS_DIR, "planets"), exist_ok=True)
os.makedirs(os.path.join(MODELS_DIR, "vehicles"), exist_ok=True)
os.makedirs(os.path.join(MODELS_DIR, "hangar"), exist_ok=True)
os.makedirs(BLENDER_DIR, exist_ok=True)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_pbr_material(name, base_color, metallic=0.0, roughness=0.5, emissive=(0,0,0,1), emissive_strength=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = base_color
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Roughness'].default_value = roughness
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = emissive
            bsdf.inputs['Emission Strength'].default_value = emissive_strength
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = emissive
    return mat

# ==========================================
# 1. LAUNCH COMPLEX
# ==========================================
def build_launch_complex():
    reset_scene()
    print("Building Launch Complex...")
    
    mat_concrete = create_pbr_material("Concrete_Pad", (0.52, 0.51, 0.49, 1.0), metallic=0.05, roughness=0.88)
    mat_steel_red = create_pbr_material("Steel_Red", (0.75, 0.18, 0.12, 1.0), metallic=0.75, roughness=0.38)
    mat_steel_white = create_pbr_material("Steel_White", (0.86, 0.88, 0.90, 1.0), metallic=0.65, roughness=0.42)
    mat_steel_dark = create_pbr_material("Steel_Dark", (0.16, 0.17, 0.19, 1.0), metallic=0.85, roughness=0.35)
    mat_deflector = create_pbr_material("Deflector_Armor", (0.22, 0.23, 0.25, 1.0), metallic=0.9, roughness=0.45)
    mat_hazard = create_pbr_material("Hazard_Yellow", (0.92, 0.72, 0.08, 1.0), metallic=0.2, roughness=0.4)
    mat_pipe = create_pbr_material("Cryo_Pipe", (0.8, 0.82, 0.85, 1.0), metallic=0.8, roughness=0.25)
    mat_light = create_pbr_material("Floodlight", (1.0, 0.95, 0.8, 1.0), emissive=(1.0, 0.95, 0.8, 1.0), emissive_strength=6.0)

    # Base Ground Slab
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -1.0))
    ground = bpy.context.active_object
    ground.name = "Ground_Terrain"
    ground.scale = (120.0, 120.0, 2.0)
    ground.data.materials.append(mat_concrete)

    # Raised Launch Platform Deck
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.5))
    platform = bpy.context.active_object
    platform.name = "Launch_Platform"
    platform.scale = (26.0, 30.0, 3.0)
    platform.data.materials.append(mat_concrete)

    # Flame Trench opening & Dual-Wedge Flame Deflector underneath (centered at 0,0,0.5)
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=4.8, radius2=0.2, depth=3.2, location=(0, 0, 0.8))
    deflector = bpy.context.active_object
    deflector.name = "Flame_Deflector"
    deflector.rotation_euler = (0, 0, math.pi/4)
    deflector.scale = (2.2, 1.1, 1.0)
    deflector.data.materials.append(mat_deflector)

    # Service Tower (approx 44m tall lattice tower at x = -7.5)
    tx, ty, th = -7.5, 0.0, 44.0
    for lx, ly in [(-2.2, -2.2), (2.2, -2.2), (2.2, 2.2), (-2.2, 2.2)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=th, location=(tx + lx, ty + ly, 3.0 + th/2.0))
        col = bpy.context.active_object
        col.name = f"Tower_Column_{lx}_{ly}"
        col.data.materials.append(mat_steel_red)

    # Decks every 5.5m
    for lvl in range(8):
        dz = 3.0 + lvl * 5.5
        mat_d = mat_steel_white if (lvl % 2 == 1) else mat_steel_red
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(tx, ty, dz))
        d = bpy.context.active_object
        d.name = f"Tower_Deck_{lvl}"
        d.scale = (4.8, 4.8, 0.3)
        d.data.materials.append(mat_d)
        
        # Railing
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(tx, ty, dz + 0.65))
        r = bpy.context.active_object
        r.name = f"Tower_Railing_{lvl}"
        r.scale = (4.9, 4.9, 0.1)
        r.data.materials.append(mat_hazard)

    # Tower Lightning Mast
    bpy.ops.mesh.primitive_cylinder_add(radius=0.1, depth=9.0, location=(tx, ty, 3.0 + th + 4.5))
    mast = bpy.context.active_object
    mast.name = "Lightning_Mast"
    mast.data.materials.append(mat_steel_dark)

    # Umbilical Service Arms (3 arms at various heights pointing to rocket center at x=0)
    for arm_z, arm_len in [(14.0, 5.2), (25.0, 5.4), (36.0, 5.2)]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(tx + arm_len/2.0 + 1.8, ty, arm_z))
        arm = bpy.context.active_object
        arm.name = f"Umbilical_Arm_{int(arm_z)}"
        arm.scale = (arm_len, 0.7, 0.9)
        arm.data.materials.append(mat_steel_dark)
        
        # Umbilical connection connector
        bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=1.4, location=(tx + arm_len + 1.8, ty, arm_z - 0.45))
        pipe = bpy.context.active_object
        pipe.data.materials.append(mat_pipe)

    # 4 Hold-Down Clamps on Pad at radius 2.6m
    for angle in [0, math.pi/2, math.pi, 3*math.pi/2]:
        cx = 2.6 * math.cos(angle)
        cy = 2.6 * math.sin(angle)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy, 3.8))
        clamp = bpy.context.active_object
        clamp.name = f"Hold_Down_Clamp_{int(angle*180/math.pi)}"
        clamp.scale = (0.85, 0.85, 1.6)
        clamp.rotation_euler = (0, 0, angle)
        clamp.data.materials.append(mat_steel_dark)

    # Cryogenic Propellant Storage Spheres & Piping
    for sx, sy in [(18.0, 14.0), (18.0, -14.0)]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=3.8, location=(sx, sy, 5.2))
        sph = bpy.context.active_object
        sph.name = f"Cryo_Storage_{int(sy)}"
        sph.data.materials.append(mat_steel_white)
        
        for dxa, dya in [(-2, -2), (2, -2), (2, 2), (-2, 2)]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=3.2, location=(sx + dxa, sy + dya, 1.6))
            leg = bpy.context.active_object
            leg.data.materials.append(mat_steel_dark)
            
        # Connecting Pipe from sphere to platform
        bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=14.0, location=(sx - 6.0, sy, 1.2))
        feed_pipe = bpy.context.active_object
        feed_pipe.rotation_euler = (0, math.pi/2, 0)
        feed_pipe.data.materials.append(mat_pipe)

    # Perimeter Floodlights
    for fx, fy in [(-22, -22), (-22, 22), (22, -22), (22, 22)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=16.0, location=(fx, fy, 8.0))
        pole = bpy.context.active_object
        pole.data.materials.append(mat_steel_dark)
        
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(fx, fy, 16.2))
        head = bpy.context.active_object
        head.scale = (1.4, 0.9, 0.6)
        head.data.materials.append(mat_light)

    # Save and export
    blend_path = os.path.join(BLENDER_DIR, "launch_site.blend")
    glb_path = os.path.join(MODELS_DIR, "launch_site", "launch_complex.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', export_apply=True)
    print("SUCCESS: Exported Launch Complex ->", glb_path)

# ==========================================
# 2. LUNAR SURFACE ENVIRONMENT
# ==========================================
def build_lunar_environment():
    reset_scene()
    print("Building Lunar Surface Environment...")
    
    mat_regolith = create_pbr_material("Lunar_Regolith", (0.24, 0.24, 0.25, 1.0), metallic=0.02, roughness=0.94)
    mat_crater_rim = create_pbr_material("Crater_Rim", (0.29, 0.29, 0.30, 1.0), metallic=0.03, roughness=0.92)
    mat_rock = create_pbr_material("Lunar_Basalt", (0.18, 0.18, 0.19, 1.0), metallic=0.05, roughness=0.88)
    mat_beacon = create_pbr_material("Touchdown_Beacon", (0.2, 0.8, 1.0, 1.0), emissive=(0.2, 0.8, 1.0, 1.0), emissive_strength=4.0)

    # 1. Base Lunar Terrain Grid (160m x 160m)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=48, y_subdivisions=48, size=160.0, location=(0, 0, 0))
    terrain = bpy.context.active_object
    terrain.name = "Lunar_Terrain"
    
    # Procedural deformation on terrain mesh
    mesh = terrain.data
    for v in mesh.vertices:
        x, y = v.co.x, v.co.y
        # Rolling hills and micro-undulations
        d = math.hypot(x, y)
        z = math.sin(x * 0.04) * math.cos(y * 0.04) * 2.2 + math.sin(x * 0.1 + y * 0.08) * 0.6
        # Flatten the designated landing zone around center (radius 18m)
        if d < 18.0:
            weight = (d / 18.0) ** 2
            z = z * weight
        v.co.z = z
    mesh.update()
    terrain.data.materials.append(mat_regolith)

    # 2. Craters around the landing zone
    craters = [
        (35.0, 28.0, 18.0, 3.5),
        (-42.0, 30.0, 24.0, 4.8),
        (-28.0, -38.0, 16.0, 3.2),
        (45.0, -32.0, 22.0, 4.2),
        (12.0, 52.0, 12.0, 2.5),
        (-14.0, -56.0, 14.0, 2.8)
    ]
    for cx, cy, radius, depth in craters:
        # Rim
        bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=radius*0.2, location=(cx, cy, 0.5))
        rim = bpy.context.active_object
        rim.name = f"Crater_Rim_{int(cx)}_{int(cy)}"
        rim.scale = (1.0, 1.0, 0.4)
        rim.data.materials.append(mat_crater_rim)
        
        # Depression bowl
        bpy.ops.mesh.primitive_uv_sphere_add(radius=radius*0.85, location=(cx, cy, -radius*0.75 + depth*0.2))
        bowl = bpy.context.active_object
        bowl.name = f"Crater_Bowl_{int(cx)}_{int(cy)}"
        bowl.scale = (1.0, 1.0, 0.35)
        bowl.data.materials.append(mat_rock)

    # 3. Scattered Rocks / Boulders
    rock_locs = [
        (12.0, 8.0, 0.6), (-9.0, 14.0, 0.8), (15.0, -11.0, 0.5), (-16.0, -8.0, 0.7),
        (22.0, 18.0, 1.2), (-25.0, 19.0, 1.4), (20.0, -22.0, 1.1), (-21.0, -26.0, 1.3),
        (8.0, -18.0, 0.4), (-12.0, -17.0, 0.6), (7.0, 16.0, 0.5), (-6.0, -14.0, 0.4)
    ]
    for rx, ry, rscale in rock_locs:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=rscale, location=(rx, ry, rscale*0.6))
        rock = bpy.context.active_object
        rock.name = f"Lunar_Rock_{int(rx)}_{int(ry)}"
        rock.scale = (1.0 + (rx % 3)*0.2, 1.0 + (ry % 3)*0.15, 0.75)
        rock.rotation_euler = (rx * 0.3, ry * 0.4, (rx + ry) * 0.5)
        rock.data.materials.append(mat_rock)

    # 4. Landing Target Beacons at perimeter of landing circle (radius 10m)
    for ang in [0, math.pi/2, math.pi, 3*math.pi/2]:
        bx = 10.0 * math.cos(ang)
        by = 10.0 * math.sin(ang)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=0.6, location=(bx, by, 0.3))
        bpost = bpy.context.active_object
        bpost.data.materials.append(mat_rock)
        
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.18, location=(bx, by, 0.65))
        light = bpy.context.active_object
        light.data.materials.append(mat_beacon)

    # Save and export
    blend_path = os.path.join(BLENDER_DIR, "lunar_environment.blend")
    glb_path = os.path.join(MODELS_DIR, "planets", "lunar_surface.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', export_apply=True)
    print("SUCCESS: Exported Lunar Surface ->", glb_path)

# ==========================================
# 3. LANDER & ROVER
# ==========================================
def build_lander_and_rover():
    reset_scene()
    print("Building Lander & Planetary Rover...")
    
    mat_gold_foil = create_pbr_material("Gold_MLI", (0.90, 0.72, 0.18, 1.0), metallic=0.92, roughness=0.22)
    mat_silver_foil = create_pbr_material("Silver_MLI", (0.92, 0.94, 0.96, 1.0), metallic=0.95, roughness=0.18)
    mat_steel = create_pbr_material("Strut_Steel", (0.75, 0.77, 0.80, 1.0), metallic=0.85, roughness=0.3)
    mat_dark = create_pbr_material("Chassis_Dark", (0.15, 0.16, 0.18, 1.0), metallic=0.6, roughness=0.4)
    mat_engine_copper = create_pbr_material("Engine_Nozzle", (0.82, 0.48, 0.28, 1.0), metallic=0.88, roughness=0.32)
    mat_solar_blue = create_pbr_material("Solar_Cells", (0.12, 0.22, 0.45, 1.0), metallic=0.75, roughness=0.2)
    mat_glass = create_pbr_material("Cockpit_Glass", (0.35, 0.75, 0.90, 1.0), metallic=0.1, roughness=0.1, emissive=(0.15, 0.45, 0.6, 1.0), emissive_strength=1.5)

    # --- A. LUNAR LANDER (Centered at origin) ---
    lander_group = bpy.data.collections.new("Lunar_Lander")
    bpy.context.scene.collection.children.link(lander_group)

    # Octagonal Descent Stage Bus
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=2.2, depth=1.6, location=(0, 0, 1.8))
    bus = bpy.context.active_object
    bus.name = "Lander_Descent_Bus"
    bus.data.materials.append(mat_gold_foil)

    # Descent Engine Bell
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.8, radius2=0.25, depth=1.2, location=(0, 0, 0.6))
    nozzle = bpy.context.active_object
    nozzle.name = "Lander_Engine_Nozzle"
    nozzle.data.materials.append(mat_engine_copper)

    # 4 Landing Struts with footpads (angled out 45 degrees)
    for leg_idx, angle in enumerate([math.pi/4, 3*math.pi/4, 5*math.pi/4, 7*math.pi/4]):
        hip_x = 2.0 * math.cos(angle)
        hip_y = 2.0 * math.sin(angle)
        foot_x = 3.6 * math.cos(angle)
        foot_y = 3.6 * math.sin(angle)
        
        # Primary Strut
        mid_x = (hip_x + foot_x) / 2.0
        mid_y = (hip_y + foot_y) / 2.0
        strut_len = math.hypot(foot_x - hip_x, foot_y - hip_y)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.1, depth=2.4, location=(mid_x, mid_y, 0.9))
        strut = bpy.context.active_object
        strut.name = f"Landing_Strut_{leg_idx}"
        strut.rotation_euler = (0.5 * math.sin(angle), -0.5 * math.cos(angle), 0)
        strut.data.materials.append(mat_steel)
        
        # Circular Footpad
        bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=0.1, location=(foot_x, foot_y, 0.05))
        foot = bpy.context.active_object
        foot.name = f"Landing_Footpad_{leg_idx}"
        foot.data.materials.append(mat_gold_foil)

    # Pressurized Ascent Cabin Module
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=1.6, depth=1.8, location=(0, 0, 3.4))
    cabin = bpy.context.active_object
    cabin.name = "Lander_Ascent_Cabin"
    cabin.data.materials.append(mat_silver_foil)
    
    # Windows
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.55, 3.7))
    win = bpy.context.active_object
    win.name = "Cabin_Window"
    win.scale = (0.8, 0.15, 0.45)
    win.data.materials.append(mat_glass)

    # Upper Docking Hatch / Antenna
    bpy.ops.mesh.primitive_cylinder_add(radius=0.55, depth=0.4, location=(0, 0, 4.4))
    hatch = bpy.context.active_object
    hatch.name = "Docking_Hatch"
    hatch.data.materials.append(mat_steel)

    # --- B. PLANETARY ROVER (Placed beside lander at x = 7.0) ---
    rx = 7.0
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(rx, 0, 0.55))
    r_body = bpy.context.active_object
    r_body.name = "Rover_Chassis"
    r_body.scale = (2.2, 1.4, 0.4)
    r_body.data.materials.append(mat_gold_foil)

    # Top Solar Array
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(rx, 0, 0.8))
    r_solar = bpy.context.active_object
    r_solar.name = "Rover_Solar_Array"
    r_solar.scale = (2.0, 1.3, 0.05)
    r_solar.data.materials.append(mat_solar_blue)

    # 4 Wheels
    for wx_off in [-0.9, 0.9]:
        for wy_off in [-0.85, 0.85]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.35, depth=0.25, location=(rx + wx_off, wy_off, 0.35))
            wheel = bpy.context.active_object
            wheel.name = f"Rover_Wheel_{int(wx_off*10)}_{int(wy_off*10)}"
            wheel.rotation_euler = (math.pi/2, 0, 0)
            wheel.data.materials.append(mat_dark)

    # Camera Mast & Sensors
    bpy.ops.mesh.primitive_cylinder_add(radius=0.06, depth=1.1, location=(rx + 0.8, 0.4, 1.3))
    mast = bpy.context.active_object
    mast.name = "Rover_Camera_Mast"
    mast.data.materials.append(mat_steel)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(rx + 0.8, 0.4, 1.9))
    cam_head = bpy.context.active_object
    cam_head.name = "Rover_Sensor_Head"
    cam_head.scale = (0.28, 0.45, 0.22)
    cam_head.data.materials.append(mat_dark)

    # High-Gain Antenna Dish
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.45, radius2=0.05, depth=0.25, location=(rx - 0.7, -0.35, 1.2))
    dish = bpy.context.active_object
    dish.name = "Rover_HighGain_Dish"
    dish.rotation_euler = (0.4, 0.2, 0)
    dish.data.materials.append(mat_silver_foil)

    # Save and export
    blend_path = os.path.join(BLENDER_DIR, "lander_and_rover.blend")
    glb_path = os.path.join(MODELS_DIR, "vehicles", "lander_rover.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', export_apply=True)
    print("SUCCESS: Exported Lander & Rover ->", glb_path)

# ==========================================
# 4. HANGAR INTERIOR
# ==========================================
def build_hangar_interior():
    reset_scene()
    print("Building Engineering Hangar Interior...")
    
    mat_floor = create_pbr_material("Hangar_Concrete", (0.42, 0.43, 0.45, 1.0), metallic=0.1, roughness=0.6)
    mat_steel_frame = create_pbr_material("Structural_Steel", (0.22, 0.25, 0.28, 1.0), metallic=0.8, roughness=0.35)
    mat_yellow_gantry = create_pbr_material("Gantry_Yellow", (0.88, 0.65, 0.08, 1.0), metallic=0.3, roughness=0.45)
    mat_wall = create_pbr_material("Hangar_Walls", (0.35, 0.38, 0.42, 1.0), metallic=0.2, roughness=0.7)
    mat_light = create_pbr_material("HighBay_Light", (0.95, 0.98, 1.0, 1.0), emissive=(0.95, 0.98, 1.0, 1.0), emissive_strength=7.0)

    # Floor (40m x 40m)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -0.5))
    floor = bpy.context.active_object
    floor.name = "Hangar_Floor"
    floor.scale = (42.0, 42.0, 1.0)
    floor.data.materials.append(mat_floor)

    # Central Vehicle Assembly Turntable Pad (radius 6m)
    bpy.ops.mesh.primitive_cylinder_add(radius=6.0, depth=0.2, location=(0, 0, 0.1))
    pad = bpy.context.active_object
    pad.name = "Assembly_Turntable"
    pad.data.materials.append(mat_steel_frame)

    # Structural Perimeter Columns & Roof Trusses (Height 28m)
    hh = 28.0
    for cx in [-18.0, 18.0]:
        for cy in [-16.0, -8.0, 0.0, 8.0, 16.0]:
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy, hh/2.0))
            col = bpy.context.active_object
            col.scale = (1.2, 1.2, hh)
            col.data.materials.append(mat_steel_frame)

    # Overhead Gantry Crane Rail (at z = 24m)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 24.5))
    gantry = bpy.context.active_object
    gantry.name = "Overhead_Gantry_Crane"
    gantry.scale = (36.0, 2.8, 1.6)
    gantry.data.materials.append(mat_yellow_gantry)

    # High-Bay Industrial Ceiling Lights
    for lx in [-10.0, 0.0, 10.0]:
        for ly in [-12.0, 0.0, 12.0]:
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(lx, ly, 26.5))
            lamp = bpy.context.active_object
            lamp.name = f"HighBay_Lamp_{int(lx)}_{int(ly)}"
            lamp.scale = (2.2, 1.2, 0.4)
            lamp.data.materials.append(mat_light)

    # Save and export
    blend_path = os.path.join(BLENDER_DIR, "hangar.blend")
    glb_path = os.path.join(MODELS_DIR, "hangar", "hangar_interior.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', export_apply=True)
    print("SUCCESS: Exported Hangar Interior ->", glb_path)

if __name__ == "__main__":
    build_launch_complex()
    build_lunar_environment()
    build_lander_and_rover()
    build_hangar_interior()
    print("ALL 3D ASSETS BUILT AND EXPORTED SUCCESSFULLY!")
