"""Render the generated mine in a repeatable design-review view."""

import os

import bpy
from mathutils import Vector


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


for obj in bpy.context.scene.objects:
    obj.hide_render = obj.name not in {"mine_shaft_house_lod0"}

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.015))
ground = bpy.context.object
ground.name = "preview_ground"
ground_material = bpy.data.materials.new("preview_ground_material")
ground_material.diffuse_color = (0.72, 0.70, 0.65, 1)
ground.data.materials.append(ground_material)

bpy.ops.object.camera_add(location=(16.0, 18.0, 12.0))
camera = bpy.context.object
camera.data.type = "ORTHO"
bpy.context.scene.camera = camera

bpy.ops.object.light_add(type="AREA", location=(-3.5, 5.0, 9.0))
key = bpy.context.object
key.data.energy = 1150
key.data.shape = "DISK"
key.data.size = 6.0
point_at(key, (0, 0, 1.3))

bpy.ops.object.light_add(type="AREA", location=(6.0, -4.0, 5.0))
fill = bpy.context.object
fill.data.energy = 700
fill.data.size = 5.0
point_at(fill, (0, 0, 1.8))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1100
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.world.color = (0.055, 0.055, 0.055)
scene.view_settings.look = "AgX - Medium High Contrast"
scene.camera.data.lens = 52


def render_view(path, location, target, ortho_scale, resolution):
    camera.location = location
    camera.data.ortho_scale = ortho_scale
    point_at(camera, target)
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)


render_view("art/environment/mine-preview.png", (16.0, 18.0, 12.0), (0, 0, 2.15), 16.6, (1100, 700))
render_view("/tmp/mine-front-elevation.png", (0, 20.0, 3.3), (0, 0, 2.1), 15.9, (1400, 620))
render_view("/tmp/mine-rear-elevation.png", (0, -20.0, 3.3), (0, 0, 2.1), 15.9, (1400, 620))
render_view("/tmp/mine-tower-closeup.png", (8.8, 12.0, 7.0), (5.25, 0, 3.25), 7.4, (900, 900))
