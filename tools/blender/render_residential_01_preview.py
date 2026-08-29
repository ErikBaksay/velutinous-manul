"""Render repeatable design-review views from Residential Building 01."""

import os

import bpy
from mathutils import Vector


ROOT_NAME = "residential_01_master"
OUTPUT_DIRECTORY = os.path.abspath("art/buildings/residential_01")


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, energy, size, target, color):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    point_at(light, target)
    return light


def validate_source(root):
    stage = root.get("authoring_stage")
    if stage not in {"proportion_blockout", "primary_architecture"}:
        raise RuntimeError(f"Residential preview does not support authoring stage: {stage}")
    if root.get("forward_axis") != "-Y" or root.get("up_axis") != "+Z":
        raise RuntimeError("Residential source axes no longer match the asset contract.")
    if root.get("front_rear_bay_count") != 4 or root.get("side_bay_count") != 3:
        raise RuntimeError("Residential labeled-elevation bay authority changed.")
    meshes = [obj for obj in root.children_recursive if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("Residential source contains no mesh geometry.")
    minimum_z = min(
        (obj.matrix_world @ vertex.co).z
        for obj in meshes
        for vertex in obj.data.vertices
    )
    maximum_z = max(
        (obj.matrix_world @ vertex.co).z
        for obj in meshes
        for vertex in obj.data.vertices
    )
    if abs(minimum_z) > 0.002:
        raise RuntimeError(f"Residential source is not grounded: minimum Z={minimum_z:.5f}")
    if not 15.69 <= maximum_z <= 15.75:
        raise RuntimeError(f"Residential source height changed: maximum Z={maximum_z:.3f}")
    if stage == "primary_architecture":
        upper_windows = [
            obj
            for obj in root.children_recursive
            if obj.get("opening_type") == "upper_window"
        ]
        ground_openings = [
            obj
            for obj in root.children_recursive
            if obj.get("opening_type") == "ground_opening"
        ]
        if len(upper_windows) != 56 or len(ground_openings) != 13:
            raise RuntimeError(
                "Residential primary-architecture opening contract is incomplete."
            )
        window_guards = [
            obj for obj in root.children_recursive if "_juliet_" in obj.name
        ]
        if window_guards:
            raise RuntimeError(
                f"Residential windows must have no mounted guards: {len(window_guards)} remain"
            )


root = bpy.data.objects.get(ROOT_NAME)
if root is None:
    raise RuntimeError(
        "Open art/buildings/residential_01/residential_01.blend before rendering previews."
    )
validate_source(root)
AUTHORING_STAGE = root.get("authoring_stage")
OUTPUT_LABEL = "primary" if AUTHORING_STAGE == "primary_architecture" else "blockout"
os.makedirs(OUTPUT_DIRECTORY, exist_ok=True)

# Temporary preview support is never saved over the editable source.
for obj in bpy.context.scene.objects:
    if obj.type == "LIGHT":
        obj.hide_render = True

bpy.ops.mesh.primitive_plane_add(size=80, location=(0.0, 0.0, -0.025))
ground = bpy.context.object
ground.name = "residential_01_preview_ground"
ground_material = bpy.data.materials.new("residential_01_preview_ground_material")
ground_material.diffuse_color = (0.60, 0.59, 0.55, 1.0)
ground_material.use_nodes = True
ground_principled = ground_material.node_tree.nodes.get("Principled BSDF")
ground_principled.inputs["Base Color"].default_value = (0.60, 0.59, 0.55, 1.0)
ground_principled.inputs["Roughness"].default_value = 0.92
ground.data.materials.append(ground_material)

add_area(
    "residential_01_preview_key",
    (-18.0, -24.0, 28.0),
    2300,
    12.0,
    (0.0, 0.0, 8.0),
    (1.0, 0.82, 0.66),
)
add_area(
    "residential_01_preview_fill",
    (24.0, -7.0, 19.0),
    1500,
    11.0,
    (0.0, 0.0, 8.0),
    (0.72, 0.82, 1.0),
)
add_area(
    "residential_01_preview_rim",
    (8.0, 24.0, 25.0),
    1850,
    10.0,
    (0.0, 1.0, 9.0),
    (1.0, 0.94, 0.82),
)
add_area(
    "residential_01_preview_front_fill",
    (0.0, -27.0, 10.0),
    650,
    8.0,
    (0.0, -3.0, 7.0),
    (0.82, 0.87, 1.0),
)

scene = bpy.context.scene
requested_engine = os.environ.get("RESIDENTIAL_01_RENDER_ENGINE", "BLENDER_EEVEE")
if requested_engine == "BLENDER_EEVEE_NEXT":
    requested_engine = "BLENDER_EEVEE"
scene.render.engine = requested_engine
if scene.render.engine == "CYCLES":
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.film_transparent = False
scene.render.image_settings.color_mode = "RGB"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.world.color = (0.40, 0.57, 0.77)
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.40, 0.57, 0.77, 1.0)
background.inputs["Strength"].default_value = 0.48


VIEWS = {
    "hero": (
        f"residential-01-{OUTPUT_LABEL}-hero.png",
        "residential_01_review_hero",
        (1200, 900),
    ),
    "front": (
        f"residential-01-{OUTPUT_LABEL}-front.png",
        "residential_01_review_front",
        (1100, 1100),
    ),
    "back": (
        f"residential-01-{OUTPUT_LABEL}-back.png",
        "residential_01_review_back",
        (1100, 1100),
    ),
    "left": (
        f"residential-01-{OUTPUT_LABEL}-left.png",
        "residential_01_review_left",
        (900, 1100),
    ),
    "right": (
        f"residential-01-{OUTPUT_LABEL}-right.png",
        "residential_01_review_right",
        (900, 1100),
    ),
    "top": (
        f"residential-01-{OUTPUT_LABEL}-top.png",
        "residential_01_review_top",
        (1100, 900),
    ),
}


def render_view(role):
    filename, camera_name, resolution = VIEWS[role]
    camera = bpy.data.objects.get(camera_name)
    if camera is None or camera.type != "CAMERA":
        raise RuntimeError(f"Residential source is missing review camera: {camera_name}")
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.filepath = os.path.join(OUTPUT_DIRECTORY, filename)
    bpy.ops.render.render(write_still=True)
    print(f"Rendered Residential 01 {role}: {scene.render.filepath}")


only_view = os.environ.get("RESIDENTIAL_01_RENDER_ONLY")
if only_view:
    if only_view not in VIEWS:
        raise RuntimeError(f"Unknown RESIDENTIAL_01_RENDER_ONLY view: {only_view}")
    render_view(only_view)
else:
    for role in VIEWS:
        render_view(role)
