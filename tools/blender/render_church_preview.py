"""Render repeatable design-review views from the editable church master."""

import os

import bpy
from mathutils import Vector


ROOT_NAME = "church_master"
OUTPUT_DIRECTORY = os.path.abspath("art/buildings/church")


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, energy, size, target):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    point_at(light, target)
    return light


def validate_source(root):
    if root.get("forward_axis") != "-Y":
        raise RuntimeError("Church entrance must face local -Y.")
    meshes = [obj for obj in root.children_recursive if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("Church source contains no mesh geometry.")
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
        raise RuntimeError(f"Church is not grounded: minimum Z={minimum_z:.5f}")
    if not 26.85 <= maximum_z <= 27.15:
        raise RuntimeError(f"Church height is outside the approved envelope: {maximum_z:.3f}")


root = bpy.data.objects.get(ROOT_NAME)
if root is None:
    raise RuntimeError("Open art/buildings/church/church.blend before rendering previews.")
validate_source(root)
os.makedirs(OUTPUT_DIRECTORY, exist_ok=True)

# Keep the authored review cameras while making temporary rendering support
# objects.  The file is never saved by this script.
for obj in bpy.context.scene.objects:
    if obj.type == "LIGHT":
        obj.hide_render = True

bpy.ops.mesh.primitive_plane_add(size=90, location=(0.0, 0.0, -0.018))
ground = bpy.context.object
ground.name = "church_preview_ground"
ground_material = bpy.data.materials.new("church_preview_ground_material")
ground_material.diffuse_color = (0.78, 0.77, 0.73, 1.0)
ground_material.use_nodes = True
ground_principled = ground_material.node_tree.nodes.get("Principled BSDF")
ground_principled.inputs["Base Color"].default_value = (0.78, 0.77, 0.73, 1.0)
ground_principled.inputs["Roughness"].default_value = 0.94
ground.data.materials.append(ground_material)

add_area("church_preview_key", (-18.0, -24.0, 38.0), 2600, 14.0, (0.0, 0.0, 10.0))
add_area("church_preview_fill", (23.0, -8.0, 24.0), 1650, 12.0, (0.0, 0.0, 11.0))
add_area("church_preview_rim", (5.0, 28.0, 32.0), 1900, 12.0, (0.0, 3.0, 13.0))
add_area("church_preview_front_fill", (0.0, -31.0, 15.0), 900, 9.0, (0.0, -7.0, 9.0))

scene = bpy.context.scene
requested_engine = os.environ.get("CHURCH_RENDER_ENGINE", "BLENDER_EEVEE")
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
scene.world.color = (0.82, 0.82, 0.80)
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.82, 0.82, 0.80, 1.0)
background.inputs["Strength"].default_value = 0.72
scene.view_settings.look = "AgX - Medium High Contrast"


VIEWS = {
    "front": ("church-front.png", "church_review_front", (1170, 1344)),
    "right": ("church-right.png", "church_review_right", (1448, 1086)),
    "three-quarter": (
        "church-three-quarter.png",
        "church_review_three_quarter",
        (1448, 1086),
    ),
    "left": ("church-left.png", "church_review_left", (1448, 1086)),
    "rear": ("church-rear.png", "church_review_rear", (1170, 1344)),
    "top": ("church-top.png", "church_review_top", (1448, 1086)),
}


def render_view(role):
    filename, camera_name, resolution = VIEWS[role]
    camera = bpy.data.objects.get(camera_name)
    if camera is None or camera.type != "CAMERA":
        raise RuntimeError(f"Church source is missing review camera: {camera_name}")
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.filepath = os.path.join(OUTPUT_DIRECTORY, filename)
    bpy.ops.render.render(write_still=True)
    print(f"Rendered church {role}: {scene.render.filepath}")


only_view = os.environ.get("CHURCH_RENDER_ONLY")
if only_view:
    if only_view not in VIEWS:
        raise RuntimeError(f"Unknown CHURCH_RENDER_ONLY view: {only_view}")
    render_view(only_view)
else:
    for role in VIEWS:
        render_view(role)
