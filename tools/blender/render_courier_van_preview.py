"""Render repeatable design-review views of the panoramic courier van."""

import os

import bpy
from mathutils import Vector


OUTPUT_DIRECTORY = os.path.abspath("art/vehicles")


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


root = bpy.data.objects.get("courier_van_lod0")
if root is None:
    raise RuntimeError("Open courier_van.blend before rendering previews.")

os.makedirs(OUTPUT_DIRECTORY, exist_ok=True)

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.012))
ground = bpy.context.object
ground.name = "van_preview_ground"
ground_material = bpy.data.materials.new("van_preview_ground_material")
ground_material.diffuse_color = (1.0, 0.98, 0.96, 1.0)
ground_material.use_nodes = True
ground_principled = ground_material.node_tree.nodes.get("Principled BSDF")
ground_principled.inputs["Base Color"].default_value = (1.0, 0.98, 0.96, 1.0)
ground_principled.inputs["Roughness"].default_value = 0.92
ground.data.materials.append(ground_material)

bpy.ops.object.camera_add(location=(-7.0, -7.0, 4.2))
camera = bpy.context.object
camera.name = "van_review_camera"
camera.data.type = "ORTHO"
bpy.context.scene.camera = camera

add_area("van_key", (-4.5, -4.0, 8.0), 650, 5.0, (0, 0, 1.1))
add_area("van_fill", (3.0, -5.0, 4.0), 320, 4.0, (0.4, 0, 1.0))
add_area("van_rim", (4.0, 4.0, 6.0), 420, 4.5, (0.6, 0, 1.4))
add_area("van_front_fill", (-6.0, 2.0, 3.0), 250, 3.0, (-2.5, 0, 1.0))
add_area("van_rear_fill", (6.5, 0.0, 4.5), 210, 4.0, (2.4, 0, 1.2))

scene = bpy.context.scene
requested_engine = os.environ.get("COURIER_VAN_RENDER_ENGINE", "CYCLES")
if requested_engine == "BLENDER_EEVEE_NEXT":
    requested_engine = "BLENDER_EEVEE"
scene.render.engine = requested_engine
if scene.render.engine == "CYCLES":
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
else:
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 64
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False
scene.render.image_settings.color_depth = "8"
scene.world.color = (1.0, 0.98, 0.96)
scene.world.use_nodes = True
world_background = scene.world.node_tree.nodes.get("Background")
world_background.inputs["Color"].default_value = (1.0, 0.98, 0.96, 1.0)
world_background.inputs["Strength"].default_value = 1.0
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.resolution_x = 1400
scene.render.resolution_y = 850


def render_view(filename, location, target, ortho_scale, resolution):
    camera.location = location
    camera.data.ortho_scale = ortho_scale
    point_at(camera, target)
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.filepath = os.path.join(OUTPUT_DIRECTORY, filename)
    bpy.ops.render.render(write_still=True)


only_view = os.environ.get("COURIER_VAN_RENDER_ONLY")
if only_view:
    views = {
        "front": ("courier-van-front.png", (-9.0, 0.0, 1.35), (-2.3, 0.0, 1.25), 3.15, (1000, 950)),
        "back": ("courier-van-back.png", (9.0, 0.0, 1.35), (2.3, 0.0, 1.25), 3.15, (1000, 950)),
        "left": ("courier-van-left.png", (0.0, -10.0, 1.45), (0.0, 0.0, 1.25), 7.0, (1600, 860)),
        "right": ("courier-van-right.png", (0.0, 10.0, 1.45), (0.0, 0.0, 1.25), 7.0, (1600, 860)),
        "top": ("courier-van-top.png", (0.0, 0.0, 12.0), (0.0, 0.0, 0.0), 6.90, (1500, 1120)),
    }
    if only_view not in views:
        raise RuntimeError(f"Unknown COURIER_VAN_RENDER_ONLY view: {only_view}")
    render_view(*views[only_view])
    raise SystemExit(0)


render_view(
    "courier-van-preview.png",
    (-6.8, -7.2, 2.55),
    (0.0, 0.0, 1.10),
    7.0,
    (1500, 950),
)
if os.environ.get("COURIER_VAN_RENDER_LIMIT") == "hero":
    raise SystemExit(0)
render_view(
    "courier-van-front.png",
    (-9.0, 0.0, 1.35),
    (-2.3, 0.0, 1.25),
    3.15,
    (1000, 950),
)
render_view(
    "courier-van-back.png",
    (9.0, 0.0, 1.35),
    (2.3, 0.0, 1.25),
    3.15,
    (1000, 950),
)
render_view(
    "courier-van-left.png",
    (0.0, -10.0, 1.45),
    (0.0, 0.0, 1.25),
    7.0,
    (1600, 860),
)
if os.environ.get("COURIER_VAN_RENDER_LIMIT") == "targets":
    raise SystemExit(0)
render_view(
    "courier-van-right.png",
    (0.0, 10.0, 1.45),
    (0.0, 0.0, 1.25),
    7.0,
    (1600, 860),
)
render_view(
    "courier-van-top.png",
    (0.0, 0.0, 12.0),
    (0.0, 0.0, 0.0),
    6.90,
    (1500, 1120),
)
