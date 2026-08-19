"""Render the generated arcaded warehouse in repeatable design-review views."""

import os

import bpy
from mathutils import Vector


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


for obj in bpy.context.scene.objects:
    obj.hide_render = obj.name not in {"warehouse_lod0"}

bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.015))
ground = bpy.context.object
ground.name = "warehouse_preview_ground"
ground_material = bpy.data.materials.new("warehouse_preview_ground_material")
ground_material.diffuse_color = (0.20, 0.20, 0.19, 1)
ground.data.materials.append(ground_material)

bpy.ops.object.camera_add(location=(10.0, 11.0, 8.0))
camera = bpy.context.object
camera.data.type = "ORTHO"
bpy.context.scene.camera = camera

bpy.ops.object.light_add(type="AREA", location=(-3.0, 6.0, 9.0))
key = bpy.context.object
key.data.energy = 1100
key.data.shape = "DISK"
key.data.size = 5.5
point_at(key, (0, 0, 1.6))

bpy.ops.object.light_add(type="AREA", location=(6.0, -4.0, 5.0))
fill = bpy.context.object
fill.data.energy = 650
fill.data.size = 4.0
point_at(fill, (0, 0, 1.8))

bpy.ops.object.light_add(type="AREA", location=(15.0, 0.0, 6.0))
end_fill = bpy.context.object
end_fill.data.energy = 850
end_fill.data.size = 5.0
point_at(end_fill, (6.8, -0.3, 1.8))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.world.color = (0.035, 0.040, 0.038)
scene.view_settings.look = "AgX - Medium High Contrast"


def render_view(path, location, target, ortho_scale, resolution):
    camera.location = location
    camera.data.ortho_scale = ortho_scale
    point_at(camera, target)
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)


render_view("art/environment/warehouse-preview.png", (16.0, 17.0, 11.0), (0, 0, 1.8), 17.8, (1400, 800))
render_view("art/environment/warehouse-front-elevation.png", (0, 22.0, 4.0), (0, 0, 2.0), 16.4, (1600, 700))
render_view("art/environment/warehouse-rear-elevation.png", (0, -22.0, 4.0), (0, 0, 2.0), 16.4, (1600, 700))
render_view("art/environment/warehouse-receiving-end.png", (19.0, 0, 3.8), (0, -0.30, 2.0), 7.2, (900, 900))
render_view("art/environment/warehouse-top.png", (0, 0, 24.0), (0, 0, 0), 17.0, (1400, 700))
