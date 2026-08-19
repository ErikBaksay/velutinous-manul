"""Build Velutinous Manul's original low-poly environment kit.

This script intentionally uses only Blender primitives and materials created in
this file. It is a reproducible source for the first runtime GLB; no external
asset or texture is imported.
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector


PALETTE = {
    "bark": (0.18, 0.10, 0.055, 1.0),
    "pine": (0.055, 0.20, 0.11, 1.0),
    "leaf": (0.22, 0.42, 0.15, 1.0),
    "leaf_light": (0.38, 0.56, 0.20, 1.0),
    "grass": (0.42, 0.55, 0.20, 1.0),
    "reed": (0.48, 0.56, 0.21, 1.0),
    "stone": (0.36, 0.37, 0.32, 1.0),
    "shore": (0.58, 0.52, 0.34, 1.0),
    "iron": (0.48, 0.22, 0.15, 1.0),
    "copper": (0.20, 0.48, 0.40, 1.0),
    "mine_light_stone": (0.46, 0.44, 0.39, 1.0),
    "mine_dark_stone": (0.22, 0.23, 0.22, 1.0),
    "mine_dark_metal": (0.10, 0.12, 0.13, 1.0),
    "mine_solar_panels": (0.055, 0.11, 0.15, 1.0),
    "mine_metal_doors": (0.12, 0.14, 0.14, 1.0),
    "mine_windows": (0.065, 0.052, 0.042, 1.0),
    "mine_timber": (0.24, 0.20, 0.16, 1.0),
    "mine_weathered_stone": (0.34, 0.33, 0.30, 1.0),
    "warehouse_stone": (0.31, 0.30, 0.28, 1.0),
    "warehouse_trim": (0.22, 0.22, 0.21, 1.0),
    "warehouse_weathered_stone": (0.26, 0.255, 0.24, 1.0),
    "warehouse_markings": (0.54, 0.52, 0.46, 1.0),
    "warehouse_lamps": (0.78, 0.39, 0.10, 1.0),
}

NATURE_BASE_IDS = (
    "tree_spruce",
    "tree_pine",
    "tree_birch",
    "tree_oak",
    "shrub_cluster",
    "grass_clump",
    "reed_cluster",
    "rock_pebbles",
    "rock_boulder",
    "rock_outcrop",
    "shore_stones",
    "driftwood",
    "ore_iron",
    "ore_copper",
    "ore_stone",
)


def material(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = PALETTE[name]
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = PALETTE[name]
    principled.inputs["Roughness"].default_value = 0.86
    if name in ("mine_dark_metal", "mine_solar_panels", "mine_metal_doors"):
        principled.inputs["Metallic"].default_value = 0.28
        principled.inputs["Roughness"].default_value = 0.62
    if name == "mine_timber":
        principled.inputs["Roughness"].default_value = 0.93
    if name == "warehouse_lamps":
        principled.inputs["Roughness"].default_value = 0.68
        principled.inputs["Emission Color"].default_value = PALETTE[name]
        principled.inputs["Emission Strength"].default_value = 1.6
    return mat


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)


def link_object(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    obj.select_set(False)
    return obj


def cone(name, radius, depth, location, mat, vertices=6):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=0.0, depth=depth, location=location)
    return link_object(bpy.context.object, name, mat)


def cylinder(name, radius, depth, location, mat, vertices=6):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    return link_object(bpy.context.object, name, mat)


def cube(name, size, location, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = link_object(bpy.context.object, name, mat)
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("edge_bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    return obj


def cylinder_between(name, start, end, radius, mat, vertices=6):
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    midpoint = (start_vector + end_vector) / 2
    obj = cylinder(name, radius, direction.length, midpoint, mat, vertices)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return obj


def beam_between(name, start, end, width, depth, mat, bevel=0.0):
    """Create a squared structural beam aligned between two points."""
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    midpoint = (start_vector + end_vector) / 2
    obj = cube(name, (width, depth, direction.length), midpoint, mat, bevel)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.select_set(False)
    return obj


def torus(name, major_radius, minor_radius, location, rotation, mat, major_segments=12, minor_segments=4):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=major_segments,
        minor_segments=minor_segments,
        major_radius=major_radius,
        minor_radius=minor_radius,
        location=location,
        rotation=rotation,
    )
    return link_object(bpy.context.object, name, mat)


def gable_roof(name, length, depth, eaves_z, ridge_z, center_x, center_y, mat):
    half_length = length / 2
    half_depth = depth / 2
    vertices = [
        (center_x - half_length, center_y - half_depth, eaves_z),
        (center_x - half_length, center_y + half_depth, eaves_z),
        (center_x - half_length, center_y, ridge_z),
        (center_x + half_length, center_y - half_depth, eaves_z),
        (center_x + half_length, center_y + half_depth, eaves_z),
        (center_x + half_length, center_y, ridge_z),
    ]
    faces = [
        (0, 2, 1),
        (3, 4, 5),
        (0, 3, 5, 2),
        (1, 2, 5, 4),
        (0, 1, 4, 3),
    ]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def hip_roof(name, length, depth, eaves_z, ridge_z, center_x, center_y, mat):
    half_length = length / 2
    half_depth = depth / 2
    vertices = [
        (center_x - half_length, center_y - half_depth, eaves_z),
        (center_x - half_length, center_y + half_depth, eaves_z),
        (center_x + half_length, center_y + half_depth, eaves_z),
        (center_x + half_length, center_y - half_depth, eaves_z),
        (center_x, center_y, ridge_z),
    ]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (0, 3, 2, 1)]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def ico(name, radius, location, scale, mat, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=location)
    obj = link_object(bpy.context.object, name, mat)
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def join_objects(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return ground_asset(objects[0])


def ground_asset(asset):
    # Apply the object matrix directly. This remains deterministic in background
    # mode even when Blender changes operator selection behavior between releases.
    asset.data.transform(asset.matrix_local)
    asset.matrix_local = Matrix.Identity(4)

    # Blender is Z-up; the glTF exporter converts this to runtime Y-up.
    minimum_z = min(vertex.co.z for vertex in asset.data.vertices)
    for vertex in asset.data.vertices:
        vertex.co.z -= minimum_z

    asset.data.update()
    asset.select_set(False)
    return asset


def tree_spruce(name):
    bark = material("bark")
    pine = material("pine")
    parts = [cylinder(f"{name}_trunk", 0.12, 1.1, (0, 0.55, 0), bark)]
    for index, (radius, height, y) in enumerate(((0.78, 1.45, 1.0), (0.62, 1.35, 1.75), (0.44, 1.1, 2.4))):
        parts.append(cone(f"{name}_canopy_{index}", radius, height, (0, y, 0), pine))
    return join_objects(parts, name)


def tree_pine(name):
    bark = material("bark")
    pine = material("pine")
    light = material("leaf_light")
    parts = [cylinder(f"{name}_trunk", 0.13, 1.2, (0, 0.6, 0), bark)]
    for index, (radius, height, y, mat) in enumerate(((0.72, 1.2, 1.0, pine), (0.66, 1.1, 1.65, light), (0.5, 0.95, 2.25, pine))):
        parts.append(cone(f"{name}_canopy_{index}", radius, height, (0.03 * index, y, 0), mat))
    return join_objects(parts, name)


def tree_broadleaf(name, light=False):
    bark = material("bark")
    leaves = material("leaf_light" if light else "leaf")
    parts = [cylinder(f"{name}_trunk", 0.15, 1.25, (0, 0.62, 0), bark)]
    parts.extend([
        ico(f"{name}_canopy_left", 0.78, (-0.34, 1.55, 0), (1.0, 0.84, 0.92), leaves),
        ico(f"{name}_canopy_right", 0.76, (0.35, 1.65, 0.02), (1.0, 0.9, 0.94), leaves),
        ico(f"{name}_canopy_top", 0.7, (0.0, 2.15, 0.0), (1.05, 0.86, 1.0), leaves),
    ])
    return join_objects(parts, name)


def shrub(name):
    leaves = material("leaf_light")
    return join_objects([
        ico(f"{name}_left", 0.34, (-0.25, 0.3, 0), (1.0, 0.85, 0.9), leaves),
        ico(f"{name}_right", 0.38, (0.22, 0.34, 0.03), (1.0, 0.9, 0.9), leaves),
    ], name)


def grass(name):
    mat = material("grass")
    return join_objects([
        cone(f"{name}_a", 0.12, 0.65, (-0.18, 0.32, 0), mat, 5),
        cone(f"{name}_b", 0.1, 0.8, (0.0, 0.4, 0.04), mat, 5),
        cone(f"{name}_c", 0.1, 0.58, (0.2, 0.29, -0.02), mat, 5),
    ], name)


def reeds(name):
    mat = material("reed")
    parts = []
    for index in range(5):
        x = (index - 2) * 0.12
        parts.append(cylinder(f"{name}_{index}", 0.035, 0.9 + index * 0.06, (x, 0.46, 0.03 * (index % 2)), mat, 5))
    return join_objects(parts, name)


def driftwood(name):
    mat = material("shore")
    piece = cylinder(f"{name}_main", 0.09, 1.25, (0, 0.12, 0), mat, 6)
    piece.rotation_euler[1] = 1.2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    branch = cylinder(f"{name}_branch", 0.05, 0.52, (0.34, 0.22, 0.05), mat, 5)
    branch.rotation_euler[2] = 0.7
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return join_objects([piece, branch], name)


def rock(name, radius, mat_name="stone"):
    # Keep the legacy source transform intact until after LOD1 is generated.
    # Decimating an already-grounded copy changes the distant rock silhouette.
    return ico(name, radius, (0, radius * 0.7, 0), (1.0, 0.72, 0.85), material(mat_name), 1)


def arch_face(name, center_x, y, sill_z, width, height, mat, segments=8):
    """Create a shallow, genuinely arched facade insert in the X/Z plane."""
    radius = width / 2
    spring_z = sill_z + height - radius
    vertices = [
        (center_x - radius, y, sill_z),
        (center_x + radius, y, sill_z),
        (center_x + radius, y, spring_z),
    ]
    for index in range(1, segments + 1):
        angle = index * math.pi / segments
        vertices.append((center_x + math.cos(angle) * radius, y, spring_z + math.sin(angle) * radius))
    vertices.append((center_x - radius, y, spring_z))
    faces = [tuple(range(len(vertices)))]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def side_arch_face(name, x, center_y, sill_z, width, height, mat, segments=8):
    """Create an arched insert on a tower wall in the Y/Z plane."""
    radius = width / 2
    spring_z = sill_z + height - radius
    vertices = [
        (x, center_y - radius, sill_z),
        (x, center_y + radius, sill_z),
        (x, center_y + radius, spring_z),
    ]
    for index in range(1, segments + 1):
        angle = index * math.pi / segments
        vertices.append((x, center_y + math.cos(angle) * radius, spring_z + math.sin(angle) * radius))
    vertices.append((x, center_y - radius, spring_z))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], [tuple(range(len(vertices)))])
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def side_arch_trim(parts, name, x, center_y, sill_z, width, height, mat, detailed):
    """Create an archivolt and uprights in the Y/Z plane for an end facade."""
    radius = width / 2
    spring_z = sill_z + height - radius
    trim_width = 0.09
    segments = 10 if detailed else 7
    vertices = []
    faces = []
    for index in range(segments + 1):
        angle = index * math.pi / segments
        vertices.extend([
            (x, center_y + math.cos(angle) * (radius + trim_width), spring_z + math.sin(angle) * (radius + trim_width)),
            (x, center_y + math.cos(angle) * radius, spring_z + math.sin(angle) * radius),
        ])
    for index in range(segments):
        first = index * 2
        faces.append((first, first + 1, first + 3, first + 2))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    parts.append(obj)
    upright_height = spring_z - sill_z
    for side, y in enumerate((center_y - radius - trim_width / 2, center_y + radius + trim_width / 2)):
        parts.append(cube(f"{name}_upright_{side}", (0.04, trim_width, upright_height), (x, y, sill_z + upright_height / 2), mat))
    parts.append(cube(f"{name}_sill", (0.04, width + 0.20, 0.08), (x, center_y, sill_z - 0.03), mat))


def arch_trim(parts, name, center_x, y, sill_z, width, height, mat, detailed):
    radius = width / 2
    spring_z = sill_z + height - radius
    trim_width = 0.045
    segments = 8 if detailed else 6
    vertices = []
    faces = []
    outer_radius = radius + trim_width
    inner_radius = radius
    for index in range(segments + 1):
        angle = index * math.pi / segments
        vertices.extend([
            (center_x + math.cos(angle) * outer_radius, y, spring_z + math.sin(angle) * outer_radius),
            (center_x + math.cos(angle) * inner_radius, y, spring_z + math.sin(angle) * inner_radius),
        ])
    for index in range(segments):
        first = index * 2
        faces.append((first, first + 1, first + 3, first + 2))
    mesh = bpy.data.meshes.new(f"{name}_arch_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(f"{name}_arch", mesh)
    bpy.context.collection.objects.link(obj)
    parts.append(obj)
    upright_height = spring_z - sill_z
    for side, x in enumerate((center_x - radius - trim_width / 2, center_x + radius + trim_width / 2)):
        parts.append(cube(f"{name}_upright_{side}", (trim_width, 0.035, upright_height), (x, y, sill_z + upright_height / 2), mat))
    parts.append(cube(f"{name}_sill", (width + 0.13, 0.055, 0.055), (center_x, y, sill_z - 0.025), mat))


def mine_window(parts, name, x, y, sill_z, front, detailed, width=0.34, height=0.88):
    glass = material("mine_windows")
    trim = material("mine_dark_stone")
    surface_y = y + (0.022 if front else -0.022)
    parts.append(arch_face(f"{name}_glass", x, surface_y, sill_z, width, height, glass, 8 if detailed else 6))
    arch_trim(parts, name, x, surface_y + (0.012 if front else -0.012), sill_z, width, height, trim, detailed)
    if detailed:
        parts.append(cube(f"{name}_mullion", (0.025, 0.035, height - width / 2), (x, surface_y, sill_z + (height - width / 2) / 2), trim))
        parts.append(cube(f"{name}_transom", (width - 0.04, 0.035, 0.025), (x, surface_y, sill_z + 0.40), trim))


def mine_door(parts, name, x, y, width, height, detailed):
    doors = material("mine_metal_doors")
    trim = material("mine_dark_stone")
    parts.append(cube(f"{name}_door", (width, 0.026, height), (x, y + 0.014, 0.12 + height / 2), doors, 0.008))
    parts.append(cube(f"{name}_lintel", (width + 0.07, 0.04, 0.035), (x, y + 0.01, 0.14 + height), trim))
    if detailed:
        parts.append(cube(f"{name}_split", (0.014, 0.03, height * 0.94), (x, y + 0.03, 0.12 + height / 2), trim))


def mine_vehicle_bay(parts, name, x, y, width, height, detailed, front=True):
    """Add a broad sectional machinery entrance with a heavy stone surround."""
    doors = material("mine_metal_doors")
    trim = material("mine_dark_stone")
    face_y = y + (0.018 if front else -0.018)
    depth = 0.045
    parts.append(cube(f"{name}_door", (width, depth, height), (x, face_y, 0.15 + height / 2), doors, 0.012))
    side_y = face_y + (0.016 if front else -0.016)
    for side, frame_x in enumerate((x - width / 2 - 0.055, x + width / 2 + 0.055)):
        parts.append(cube(f"{name}_jamb_{side}", (0.11, 0.08, height + 0.18), (frame_x, side_y, 0.13 + (height + 0.18) / 2), trim, 0.008))
    parts.append(cube(f"{name}_lintel", (width + 0.22, 0.08, 0.13), (x, side_y, 0.20 + height), trim, 0.008))
    if detailed:
        for panel in range(1, 4):
            z = 0.15 + panel * height / 4
            parts.append(cube(f"{name}_panel_{panel}", (width - 0.07, 0.022, 0.025), (x, side_y, z), trim))
        for seam_index, seam in enumerate((-width / 6, width / 6)):
            parts.append(cube(f"{name}_seam_{seam_index}", (0.018, 0.025, height - 0.05), (x + seam, side_y, 0.15 + height / 2), trim))


MINE_FOOTPRINT = (15.0, 6.0)
MINE_TOWER_X = -5.25


def validate_mine_facade_layout():
    """Fail generation if a facade divider enters a window or vehicle opening."""
    front_windows = (-2.05, -0.80, 0.45, 1.70, 2.95, 6.58)
    front_gates = (4.15, 5.43)
    front_dividers = (-2.70, -1.43, -0.18, 1.07, 2.32, 3.55, 4.78, 6.06, 7.05)
    rear_gates = (-0.90, 1.20, 3.30, 5.40)
    rear_dividers = (-3.78, -2.10, 0.15, 2.25, 4.35, 6.18, 7.05)
    openings = [(x, 0.66) for x in front_windows] + [(x, 0.96) for x in front_gates]
    rear_openings = [(6.58, 0.52)] + [(x, 1.30) for x in rear_gates]
    for divider in front_dividers:
        for center, width in openings:
            if abs(divider - center) < width / 2 + 0.10:
                raise RuntimeError(f"Front facade divider {divider} intersects opening at {center}.")
    for divider in rear_dividers:
        for center, width in rear_openings:
            if abs(divider - center) < width / 2 + 0.10:
                raise RuntimeError(f"Rear facade divider {divider} intersects opening at {center}.")
    if len(front_windows) != 6 or len(front_gates) != 2 or len(rear_gates) != 4:
        raise RuntimeError("Mine facade inventory no longer matches the approved reference layout.")


def mine_shaft_house(name, detailed):
    light_stone = material("mine_light_stone")
    dark_stone = material("mine_dark_stone")
    metal = material("mine_dark_metal")
    solar = material("mine_solar_panels")
    windows = material("mine_windows")
    timber = material("mine_timber")
    weathered_stone = material("mine_weathered_stone")
    parts = []
    validate_mine_facade_layout()

    parts.append(cube(f"{name}_foundation", (14.90, 5.90, 0.20), (0, 0, 0.10), dark_stone, 0.035))
    hall_center_x = 1.60
    hall_length = 10.90
    hall_depth = 3.80
    hall_eaves = 2.28
    hall_ridge = 2.78

    # Recessed shadow core plus modular facade strips create genuine openings.
    parts.append(cube(f"{name}_hall_shadow_core", (hall_length - 0.20, hall_depth - 0.34, 1.90), (hall_center_x, 0, 1.18), weathered_stone, 0.010))
    for side, y in (("front", 1.90), ("back", -1.90)):
        parts.append(cube(f"{name}_hall_{side}_base", (hall_length, 0.20, 0.34), (hall_center_x, y, 0.36), light_stone, 0.010))
        parts.append(cube(f"{name}_hall_{side}_spandrel", (hall_length, 0.20, 0.42), (hall_center_x, y, 2.05), light_stone, 0.010))
        parts.append(cube(f"{name}_{side}_ground_course", (hall_length + 0.12, 0.12, 0.12), (hall_center_x, y + (0.11 if y > 0 else -0.11), 0.20), dark_stone, 0.006))
        parts.append(cube(f"{name}_{side}_cornice", (hall_length + 0.18, 0.16, 0.14), (hall_center_x, y + (0.11 if y > 0 else -0.11), 2.24), dark_stone, 0.006))
    parts.append(cube(f"{name}_hall_east_wall", (0.22, hall_depth, 2.05), (7.05, 0, 1.27), light_stone, 0.012))
    parts.append(cube(f"{name}_hall_west_transition", (0.42, hall_depth, 2.05), (-3.72, 0, 1.27), light_stone, 0.012))
    parts.append(gable_roof(f"{name}_hall_roof", hall_length + 0.28, 4.18, hall_eaves, hall_ridge, hall_center_x, 0, metal))

    front_dividers = (-2.70, -1.43, -0.18, 1.07, 2.32, 3.55, 4.78, 6.06, 7.05)
    rear_dividers = (-3.78, -2.10, 0.15, 2.25, 4.35, 6.18, 7.05)
    for side, y, dividers in (("front", 1.96, front_dividers), ("rear", -1.96, rear_dividers)):
        for index, x in enumerate(dividers):
            parts.append(cube(f"{name}_{side}_pier_{index}", (0.22, 0.28, 1.74), (x, y, 1.22), dark_stone, 0.008))
            parts.append(cube(f"{name}_{side}_pier_cap_{index}", (0.34, 0.32, 0.12), (x, y + (0.02 if y > 0 else -0.02), 2.08), light_stone, 0.008))

    # Front sequence: entrance, five windows, paired gates, east end window.
    for index, x in enumerate((-2.05, -0.80, 0.45, 1.70, 2.95, 6.58)):
        mine_window(parts, f"{name}_front_window_{index}", x, 2.02, 0.55, True, detailed, width=0.66, height=1.38)
    for index, x in enumerate((4.15, 5.43)):
        mine_vehicle_bay(parts, f"{name}_front_vehicle_bay_{index}", x, 2.02, 0.96, 1.38, detailed, True)
    for index, x in enumerate((3.52, 4.78, 6.06)):
        parts.append(cube(f"{name}_loading_surround_pier_{index}", (0.24, 0.28, 1.70), (x, 2.13, 1.15), light_stone, 0.010))
        parts.append(cube(f"{name}_loading_surround_cap_{index}", (0.36, 0.32, 0.13), (x, 2.15, 1.99), dark_stone, 0.008))
    parts.append(cube(f"{name}_loading_surround_lintel", (2.78, 0.30, 0.22), (4.79, 2.13, 1.93), light_stone, 0.012))

    # Rear service elevation: personnel door and four unobstructed machinery gates.
    mine_door(parts, f"{name}_rear_personnel_door", 6.58, -2.02, 0.52, 1.10, detailed)
    for index, x in enumerate((-0.90, 1.20, 3.30, 5.40)):
        mine_vehicle_bay(parts, f"{name}_rear_vehicle_bay_{index}", x, -2.02, 1.30, 1.34, detailed, False)
        parts.append(cube(f"{name}_rear_high_window_{index}", (0.28, 0.035, 0.24), (x, -2.055, 1.94), windows, 0.008))

    # Full columned entrance beside the tower.
    entrance_x = -3.48
    parts.append(cube(f"{name}_entrance_body", (1.42, 0.82, 1.34), (entrance_x, 2.02, 0.87), weathered_stone, 0.012))
    parts.append(cube(f"{name}_entrance_shadow", (0.62, 0.04, 1.02), (entrance_x, 2.45, 0.78), windows, 0.006))
    for index, (x, y) in enumerate(((entrance_x - 0.52, 2.62), (entrance_x + 0.52, 2.62), (entrance_x - 0.52, 2.18), (entrance_x + 0.52, 2.18))):
        parts.append(cylinder(f"{name}_entrance_column_{index}", 0.115, 1.30, (x, y, 0.88), light_stone, 8 if detailed else 6))
        parts.append(cube(f"{name}_entrance_column_base_{index}", (0.30, 0.30, 0.12), (x, y, 0.24), dark_stone, 0.006))
        parts.append(cube(f"{name}_entrance_column_cap_{index}", (0.29, 0.29, 0.12), (x, y, 1.53), dark_stone, 0.006))
    parts.append(gable_roof(f"{name}_entrance_roof", 1.70, 1.38, 1.62, 1.90, entrance_x, 2.28, metal))
    for index, (depth, z) in enumerate(((0.62, 0.18), (0.48, 0.28), (0.34, 0.38))):
        parts.append(cube(f"{name}_entrance_step_{index}", (1.55 - index * 0.14, depth, 0.10), (entrance_x, 2.55 + index * 0.08, z), dark_stone, 0.004))

    # Tall lower shaft block and open upper machinery stage.
    tower_x = MINE_TOWER_X
    tower_base = cube(f"{name}_tower_base", (2.10, 2.50, 2.78), (tower_x, 0, 1.49), light_stone, 0.025)
    parts.append(tower_base)
    tower_anchor_x = tower_base.location.x
    for index, z in enumerate((0.25, 0.45, 2.58, 2.78)):
        parts.append(cube(f"{name}_tower_base_band_{index}", (2.24, 2.64, 0.13), (tower_x, 0, z), dark_stone, 0.010))
    mine_door(parts, f"{name}_tower_service_door", tower_x, 1.27, 0.52, 1.18, detailed)
    parts.append(side_arch_face(f"{name}_tower_west_window", tower_x - 1.056, 0, 0.92, 0.48, 1.05, windows, 8 if detailed else 6))
    if detailed:
        for course, z in enumerate((0.68, 1.02, 1.36, 1.70, 2.04, 2.38)):
            parts.append(cube(f"{name}_tower_course_{course}", (2.08, 2.52, 0.028), (tower_x, 0, z), dark_stone))

    pier_z = 4.02
    for index, (x, y) in enumerate(((tower_x - 0.82, -1.00), (tower_x - 0.82, 1.00), (tower_x + 0.82, -1.00), (tower_x + 0.82, 1.00))):
        parts.append(cube(f"{name}_tower_upper_pier_{index}", (0.38, 0.38, 2.12), (x, y, pier_z), light_stone, 0.014))
        parts.append(cube(f"{name}_tower_upper_pier_base_{index}", (0.54, 0.54, 0.16), (x, y, 2.97), dark_stone, 0.008))
        parts.append(cube(f"{name}_tower_upper_pier_cap_{index}", (0.56, 0.56, 0.17), (x, y, 5.06), dark_stone, 0.008))
    for y_index, y in enumerate((-1.00, 1.00)):
        parts.append(cube(f"{name}_tower_upper_lintel_{y_index}", (2.08, 0.38, 0.34), (tower_x, y, 4.96), light_stone, 0.014))
    for x_index, x in enumerate((tower_x - 0.82, tower_x + 0.82)):
        parts.append(cube(f"{name}_tower_side_lintel_{x_index}", (0.38, 2.18, 0.34), (x, 0, 4.96), light_stone, 0.014))
    arch_trim(parts, f"{name}_tower_open_arch", tower_x, 1.205, 3.10, 1.34, 1.75, dark_stone, detailed)
    for index, (size, z) in enumerate((((2.34, 2.58, 0.16), 5.18), ((2.22, 2.46, 0.13), 5.32))):
        parts.append(cube(f"{name}_tower_cornice_{index}", size, (tower_x, 0, z), dark_stone, 0.010))
    parts.append(hip_roof(f"{name}_tower_cap", 2.08, 2.32, 5.39, 5.70, tower_x, 0, metal))
    parts.append(cylinder(f"{name}_tower_finial", 0.045, 0.32, (tower_x, 0, 5.83), metal, 8))
    parts.append(cone(f"{name}_tower_finial_tip", 0.09, 0.18, (tower_x, 0, 6.03), metal, 8))

    # Recessed twin winding wheel, axle, spokes, and cradle.
    wheel_center = (tower_x, 0.82, 4.02)
    wheel_radius = 0.72
    for rim_index, y in enumerate((0.76, 0.90)):
        parts.append(torus(f"{name}_headframe_wheel_rim_{rim_index}", wheel_radius, 0.060, (tower_x, y, 4.02), (math.pi / 2, 0, 0), metal, 28 if detailed else 16, 6 if detailed else 4))
    axle = cylinder(f"{name}_wheel_axle", 0.105, 2.20, (tower_x, 0, 4.02), metal, 12 if detailed else 8)
    axle.rotation_euler[0] = math.pi / 2
    bpy.context.view_layer.objects.active = axle
    axle.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    axle.select_set(False)
    parts.append(axle)
    hub = cylinder(f"{name}_wheel_hub", 0.15, 0.22, wheel_center, metal, 12 if detailed else 8)
    hub.rotation_euler[0] = math.pi / 2
    bpy.context.view_layer.objects.active = hub
    hub.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    hub.select_set(False)
    parts.append(hub)
    spoke_count = 14 if detailed else 8
    for spoke_index in range(spoke_count):
        angle = spoke_index * 2 * math.pi / spoke_count
        end = (tower_x + math.cos(angle) * 0.66, wheel_center[1], 4.02 + math.sin(angle) * 0.66)
        parts.append(cylinder_between(f"{name}_wheel_spoke_{spoke_index}", wheel_center, end, 0.022, metal, 6))
    for side_index, x in enumerate((tower_x - 0.58, tower_x + 0.58)):
        parts.append(beam_between(f"{name}_wheel_cradle_{side_index}", (x, 0.18, 2.92), (tower_x, 0.18, 4.02), 0.13, 0.13, metal, 0.006))

    # Squared headframe braces, masonry court, and explicit anchor blocks.
    parts.append(cube(f"{name}_headframe_court_floor", (2.65, 4.65, 0.22), (-6.10, 0, 0.23), dark_stone, 0.018))
    for side_index, y in enumerate((-2.25, 2.25)):
        parts.append(cube(f"{name}_headframe_court_wall_{side_index}", (2.65, 0.24, 0.62), (-6.10, y, 0.50), weathered_stone, 0.012))
        for post_index, x in enumerate((-7.28, -6.48, -5.68)):
            parts.append(cube(f"{name}_court_post_{side_index}_{post_index}", (0.30, 0.34, 0.82), (x, y, 0.56), light_stone, 0.010))
    parts.append(cube(f"{name}_headframe_court_end_wall", (0.24, 4.65, 0.62), (-7.30, 0, 0.50), weathered_stone, 0.012))
    brace_sets = []
    for y in (-1.02, 1.02):
        brace_sets.extend([
            ((-7.10, y, 0.62), (tower_x - 0.64, y, 4.80)),
            ((-6.58, y, 0.62), (tower_x + 0.64, y, 4.80)),
            ((-7.04, y, 0.78), (tower_x + 0.64, y, 3.05)),
        ])
    if not detailed:
        brace_sets = brace_sets[:4]
    for index, (start, end) in enumerate(brace_sets):
        parts.append(beam_between(f"{name}_tower_timber_{index}", start, end, 0.20, 0.18, timber, 0.008))
    for index, x in enumerate((-6.92, -6.35, -5.78)):
        height = 1.10 + (x + 6.92) * 1.62
        parts.append(beam_between(f"{name}_headframe_cross_tie_{index}", (x, -1.12, height), (x, 1.12, height), 0.13, 0.13, metal, 0.004))

    # Inset solar field, five ridge vents, and paired east chimneys.
    roof_angle = -math.atan2(hall_ridge - hall_eaves, 2.09)
    array_center = cube(f"{name}_solar_array", (7.40, 1.48, 0.045), (1.20, 0.88, 2.55), solar, 0.010)
    array_center.rotation_euler[0] = roof_angle
    bpy.context.view_layer.objects.active = array_center
    array_center.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    array_center.select_set(False)
    parts.append(array_center)
    array_back = cube(f"{name}_solar_array_rear", (7.40, 1.48, 0.045), (1.20, -0.88, 2.55), solar, 0.010)
    array_back.rotation_euler[0] = -roof_angle
    bpy.context.view_layer.objects.active = array_back
    array_back.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    array_back.select_set(False)
    parts.append(array_back)
    if detailed:
        for index in range(1, 15):
            x = -2.50 + index * 0.493
            grid = cube(f"{name}_solar_grid_x_{index}", (0.018, 1.50, 0.018), (x, 0.88, 2.575), metal)
            grid.rotation_euler[0] = roof_angle
            parts.append(grid)
            rear_grid = cube(f"{name}_solar_rear_grid_x_{index}", (0.018, 1.50, 0.018), (x, -0.88, 2.575), metal)
            rear_grid.rotation_euler[0] = -roof_angle
            parts.append(rear_grid)
        for index, y in enumerate((0.36, 0.70, 1.04, 1.38)):
            z = hall_ridge - y * math.tan(-roof_angle)
            grid = cube(f"{name}_solar_grid_y_{index}", (7.42, 0.018, 0.018), (1.20, y, z + 0.02), metal)
            grid.rotation_euler[0] = roof_angle
            parts.append(grid)
            rear_grid = cube(f"{name}_solar_rear_grid_y_{index}", (7.42, 0.018, 0.018), (1.20, -y, z + 0.02), metal)
            rear_grid.rotation_euler[0] = -roof_angle
            parts.append(rear_grid)
    vent_positions = (-2.30, -0.55, 1.20, 2.95, 4.70)
    for index, x in enumerate(vent_positions):
        parts.append(cube(f"{name}_roof_vent_{index}", (0.48, 0.52, 0.24), (x, -0.64, 2.60), weathered_stone, 0.014))
        parts.append(cube(f"{name}_roof_vent_cap_{index}", (0.58, 0.62, 0.09), (x, -0.64, 2.75), dark_stone, 0.008))
    for index, x in enumerate((6.32, 6.72)):
        parts.append(cylinder(f"{name}_chimney_{index}", 0.13, 1.52, (x, -1.18, 3.27), light_stone, 12 if detailed else 8))
        parts.append(cylinder(f"{name}_chimney_cap_{index}", 0.18, 0.13, (x, -1.18, 4.08), dark_stone, 12 if detailed else 8))
        if detailed:
            parts.append(cylinder(f"{name}_chimney_band_{index}", 0.15, 0.08, (x, -1.18, 3.54), dark_stone, 10))

    asset = join_objects(parts, name)
    # The game's default three-quarter camera reads positive X on screen-left.
    # Mirror the authored composition so the shaft tower matches the proposal's
    # defining left-hand silhouette while the entrance remains on the front.
    for vertex in asset.data.vertices:
        vertex.co.x = -vertex.co.x
    asset.data.update()
    asset["resource_anchor_x"] = -tower_anchor_x
    return asset


WAREHOUSE_FOOTPRINT = (15.0, 6.0)
WAREHOUSE_LOADING_BAYS = (-5.60, -3.65, -1.70, 0.25, 2.20, 4.15)
WAREHOUSE_FRONT_ARCHES = (-6.25, -5.00, -3.75, -2.50, -1.25, 0.00, 1.25, 2.50, 3.75, 5.00)
WAREHOUSE_REAR_ARCHES = tuple(-5.70 + index for index in range(12))
WAREHOUSE_FRONT_DIVIDERS = (-6.55, -4.625, -2.675, -0.725, 1.225, 3.175, 5.125)


def validate_warehouse_facade_layout():
    """Protect truck clearances and the blueprint's explicit facade inventory."""
    bay_width = 1.45
    for divider in WAREHOUSE_FRONT_DIVIDERS:
        for center in WAREHOUSE_LOADING_BAYS:
            if abs(divider - center) < bay_width / 2 + 0.10:
                raise RuntimeError(
                    f"Warehouse facade divider {divider} intersects loading bay at {center}."
                )
    if len(WAREHOUSE_LOADING_BAYS) != 6:
        raise RuntimeError("Warehouse must retain six clear loading bays.")
    if len(WAREHOUSE_FRONT_ARCHES) != 10 or len(WAREHOUSE_REAR_ARCHES) != 12:
        raise RuntimeError("Warehouse must retain its ten-front/twelve-rear arcade inventory.")


def warehouse_window(parts, name, x, y, sill_z, front, detailed, width=0.54, height=0.76):
    glass = material("mine_windows")
    trim = material("warehouse_trim")
    surface_y = y + (0.026 if front else -0.026)
    parts.append(arch_face(f"{name}_glass", x, surface_y, sill_z, width, height, glass, 8 if detailed else 6))
    arch_trim(parts, name, x, surface_y + (0.014 if front else -0.014), sill_z, width, height, trim, detailed)
    if detailed:
        parts.append(cube(f"{name}_mullion", (0.022, 0.035, height - width / 2), (x, surface_y, sill_z + (height - width / 2) / 2), trim))


def warehouse_loading_bay(parts, name, x, y, detailed):
    """Layer a deep portal over the wall so the sectional door reads recessed."""
    doors = material("mine_metal_doors")
    trim = material("warehouse_trim")
    width = 1.45
    height = 1.65
    parts.append(cube(f"{name}_recess", (width + 0.18, 0.11, height + 0.18), (x, y + 0.035, 0.13 + height / 2), trim, 0.008))
    parts.append(cube(f"{name}_door", (width, 0.035, height), (x, y + 0.098, 0.15 + height / 2), doors, 0.008))
    for side, frame_x in enumerate((x - width / 2 - 0.09, x + width / 2 + 0.09)):
        parts.append(cube(f"{name}_jamb_{side}", (0.18, 0.18, height + 0.26), (frame_x, y + 0.145, 0.13 + (height + 0.26) / 2), trim, 0.008))
    parts.append(cube(f"{name}_lintel", (width + 0.36, 0.18, 0.18), (x, y + 0.145, 0.23 + height), trim, 0.008))
    if detailed:
        for panel in range(1, 5):
            z = 0.15 + panel * height / 5
            parts.append(cube(f"{name}_panel_{panel}", (width - 0.08, 0.025, 0.025), (x, y + 0.122, z), trim))
        for seam_index, seam in enumerate((-width / 4, 0, width / 4)):
            parts.append(cube(f"{name}_seam_{seam_index}", (0.018, 0.025, height - 0.06), (x + seam, y + 0.122, 0.15 + height / 2), trim))


def warehouse_end_pediment(parts, name, x, detailed, stone, trim):
    """Build a layered classical receiving end without creating a tower."""
    face_x = x + 0.018
    vertices = [
        (face_x, -2.18, 3.47),
        (face_x, 1.58, 3.47),
        (face_x, -0.30, 4.14),
    ]
    mesh = bpy.data.meshes.new(f"{name}_pediment_mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2)])
    mesh.materials.append(stone)
    pediment = bpy.data.objects.new(f"{name}_pediment", mesh)
    bpy.context.collection.objects.link(pediment)
    parts.append(pediment)
    parts.extend([
        beam_between(f"{name}_pediment_left", (face_x + 0.01, -2.28, 3.43), (face_x + 0.01, -0.30, 4.22), 0.12, 0.11, trim, 0.008),
        beam_between(f"{name}_pediment_right", (face_x + 0.01, -0.30, 4.22), (face_x + 0.01, 1.68, 3.43), 0.12, 0.11, trim, 0.008),
        cube(f"{name}_pediment_base", (0.12, 4.08, 0.16), (face_x + 0.01, -0.30, 3.43), trim, 0.008),
        cube(f"{name}_entablature", (0.16, 4.24, 0.18), (face_x + 0.02, -0.30, 3.25), stone, 0.010),
    ])
    if detailed:
        parts.append(cube(f"{name}_pediment_inset", (0.04, 1.55, 0.10), (face_x + 0.04, -0.30, 3.67), trim, 0.004))


def warehouse_arcaded_depot(name, detailed):
    light_stone = material("warehouse_stone")
    dark_stone = material("warehouse_trim")
    weathered_stone = material("warehouse_weathered_stone")
    metal = material("mine_dark_metal")
    doors = material("mine_metal_doors")
    solar = material("mine_solar_panels")
    lamps = material("warehouse_lamps")
    markings = material("warehouse_markings")
    parts = []
    validate_warehouse_facade_layout()

    # The enclosed hall occupies about 15x5 cells; the sixth row is an integral
    # apron that gives the loading face the breadth shown in the blueprint.
    parts.append(cube(f"{name}_foundation", (14.80, 5.80, 0.18), (0, 0, 0.09), dark_stone, 0.025))
    parts.append(cube(f"{name}_loading_apron", (14.30, 1.10, 0.07), (-0.10, 2.35, 0.205), weathered_stone, 0.018))
    parts.append(cube(f"{name}_hall", (14.40, 4.60, 3.06), (-0.10, -0.30, 1.70), light_stone, 0.025))
    parts.append(cube(f"{name}_plinth", (14.52, 4.72, 0.38), (-0.10, -0.30, 0.38), weathered_stone, 0.020))
    parts.append(cube(f"{name}_upper_band", (14.56, 4.74, 0.18), (-0.10, -0.30, 2.96), weathered_stone, 0.018))
    parts.append(cube(f"{name}_cornice", (14.72, 4.88, 0.18), (-0.10, -0.30, 3.24), dark_stone, 0.025))

    # A near-flat metal roof sits behind the continuous masonry cornice.
    roof = hip_roof(f"{name}_roof", 14.64, 4.84, 3.31, 3.64, -0.10, -0.30, metal)
    parts.append(roof)
    panel = cube(f"{name}_solar_field", (11.00, 2.20, 0.045), (-0.65, 0.38, 3.675), solar, 0.008)
    parts.append(panel)
    if detailed:
        for index in range(1, 20):
            x = -6.15 + index * 0.55
            grid = cube(f"{name}_solar_grid_x_{index}", (0.018, 2.21, 0.018), (x, 0.38, 3.705), metal)
            parts.append(grid)
        for index, y in enumerate((-0.34, 0.02, 0.38, 0.74, 1.10)):
            grid = cube(f"{name}_solar_grid_y_{index}", (11.02, 0.018, 0.018), (-0.65, y, 3.705), metal)
            parts.append(grid)
    for index, x in enumerate((-4.60, 0.05, 4.70)):
        parts.append(cube(f"{name}_roof_vent_curb_{index}", (0.62, 0.52, 0.12), (x, -1.55, 3.52), weathered_stone, 0.010))
        parts.append(cube(f"{name}_roof_vent_{index}", (0.42, 0.34, 0.22), (x, -1.55, 3.67), dark_stone, 0.010))
        parts.append(cube(f"{name}_roof_vent_cap_{index}", (0.52, 0.44, 0.07), (x, -1.55, 3.81), metal, 0.006))

    # Six deep truck portals and ten upper arches establish the receiving face.
    front_y = 2.00
    for index, x in enumerate(WAREHOUSE_LOADING_BAYS):
        warehouse_loading_bay(parts, f"{name}_loading_bay_{index}", x, front_y, detailed)
    for index, x in enumerate(WAREHOUSE_FRONT_ARCHES):
        warehouse_window(parts, f"{name}_front_arch_{index}", x, front_y, 2.14, True, detailed, 0.52, 0.76)
    for index, x in enumerate(WAREHOUSE_FRONT_DIVIDERS):
        parts.append(cube(f"{name}_front_pilaster_{index}", (0.22, 0.20, 2.88), (x, 2.08, 1.70), weathered_stone, 0.015))

    parts.append(cube(f"{name}_canopy", (11.80, 1.00, 0.16), (-0.72, 2.38, 1.98), dark_stone, 0.018))
    parts.append(cube(f"{name}_canopy_fascia", (11.88, 0.10, 0.28), (-0.72, 2.84, 1.89), weathered_stone, 0.010))
    for index, x in enumerate(WAREHOUSE_FRONT_DIVIDERS):
        parts.append(cube(f"{name}_canopy_column_{index}", (0.22, 0.24, 1.70), (x, 2.73, 1.05), dark_stone, 0.012))
    if detailed:
        bollard_xs = tuple(x + offset for x in WAREHOUSE_LOADING_BAYS for offset in (-0.84, 0.84))
        for index, x in enumerate(bollard_xs):
            parts.append(cylinder(f"{name}_bollard_{index}", 0.06, 0.44, (x, 2.46, 0.44), metal, 8))
        for index, x in enumerate(WAREHOUSE_FRONT_DIVIDERS):
            parts.append(cube(f"{name}_front_lamp_mount_{index}", (0.12, 0.09, 0.14), (x, 2.19, 2.20), metal, 0.008))
            parts.append(ico(f"{name}_front_lamp_{index}", 0.065, (x, 2.25, 2.14), (1.0, 0.75, 1.0), lamps, 1))
        for index, x in enumerate(WAREHOUSE_LOADING_BAYS):
            parts.append(cube(f"{name}_apron_centerline_{index}", (0.045, 0.72, 0.018), (x, 2.48, 0.255), markings))
        parts.append(cube(f"{name}_apron_dock_edge", (11.65, 0.045, 0.018), (-0.72, 2.02, 0.255), markings))

    # The service elevation retains a personnel door and a denser twelve-arch rhythm.
    rear_y = -2.60
    for index, x in enumerate(WAREHOUSE_REAR_ARCHES):
        warehouse_window(parts, f"{name}_rear_arch_{index}", x, rear_y, 1.12, False, detailed, 0.50, 1.00)
    mine_door(parts, f"{name}_service_door", -6.72, rear_y - 0.03, 0.48, 1.18, detailed)
    for index, x in enumerate(tuple(-6.20 + index for index in range(13))):
        parts.append(cube(f"{name}_rear_pilaster_{index}", (0.18, 0.16, 2.74), (x, -2.68, 1.66), weathered_stone, 0.012))

    # The pavilion is now a terminal module instead of half of the composition.
    end_x = 7.37
    parts.append(cube(f"{name}_end_pavilion", (1.30, 4.50, 3.40), (6.70, -0.30, 1.86), light_stone, 0.024))
    parts.append(cube(f"{name}_end_step_left", (0.16, 0.48, 2.96), (7.34, -2.32, 1.66), weathered_stone, 0.012))
    parts.append(cube(f"{name}_end_step_right", (0.16, 0.48, 2.96), (7.34, 1.72, 1.66), weathered_stone, 0.012))
    parts.append(side_arch_face(f"{name}_end_receiving_door", end_x + 0.025, -0.30, 0.20, 1.80, 2.70, doors, 10 if detailed else 7))
    side_arch_trim(parts, f"{name}_end_receiving_arch", end_x + 0.045, -0.30, 0.20, 1.80, 2.70, dark_stone, detailed)
    for side, y in enumerate((-1.36, 0.76)):
        parts.append(cube(f"{name}_end_door_jamb_{side}", (0.08, 0.24, 2.80), (end_x + 0.04, y, 1.57), dark_stone, 0.012))
        pilaster_y = -2.08 if side == 0 else 1.48
        parts.append(cube(f"{name}_end_pilaster_{side}", (0.08, 0.36, 3.18), (end_x + 0.04, pilaster_y, 1.80), weathered_stone, 0.014))
        parts.append(cube(f"{name}_end_pilaster_base_{side}", (0.08, 0.52, 0.28), (end_x + 0.045, pilaster_y, 0.32), dark_stone, 0.010))
        parts.append(cube(f"{name}_end_pilaster_cap_{side}", (0.08, 0.52, 0.20), (end_x + 0.045, pilaster_y, 3.28), dark_stone, 0.010))
    parts.append(cube(f"{name}_end_door_sill", (0.08, 2.18, 0.12), (end_x + 0.045, -0.30, 0.18), dark_stone, 0.008))
    parts.append(cube(f"{name}_end_cornice", (0.10, 4.38, 0.18), (end_x + 0.04, -0.30, 3.34), dark_stone, 0.018))
    warehouse_end_pediment(parts, f"{name}_end", end_x, detailed, light_stone, dark_stone)
    if detailed:
        for panel in (-0.60, -0.30, 0, 0.30):
            parts.append(cube(f"{name}_end_door_panel_{panel}", (0.025, 0.025, 1.95), (end_x + 0.045, -0.30 + panel, 1.28), dark_stone))
        for index, y in enumerate((-1.62, 1.02)):
            parts.append(cube(f"{name}_end_lamp_mount_{index}", (0.05, 0.10, 0.16), (end_x + 0.045, y, 1.72), metal, 0.006))
            parts.append(ico(f"{name}_end_lamp_{index}", 0.04, (end_x + 0.055, y, 1.66), (0.78, 1.0, 1.0), lamps, 1))

    return join_objects(parts, name)


def mine_resource_anchor(collection, mine_asset):
    anchor = bpy.data.objects.new("mine_resource_anchor", None)
    anchor.empty_display_type = "PLAIN_AXES"
    anchor.empty_display_size = 0.12
    anchor.location = (float(mine_asset["resource_anchor_x"]), 0, 0)
    collection.objects.link(anchor)
    return anchor


def create_lod1(source, name, collection):
    copy = source.copy()
    copy.data = source.data.copy()
    copy.name = name
    collection.objects.link(copy)
    modifier = copy.modifiers.new("lod1_decimate", "DECIMATE")
    modifier.ratio = 0.55
    bpy.context.view_layer.objects.active = copy
    copy.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    copy.select_set(False)
    return ground_asset(copy)


def build_assets():
    environment_assets = [
        tree_spruce("tree_spruce_lod0"),
        tree_pine("tree_pine_lod0"),
        tree_broadleaf("tree_birch_lod0", light=True),
        tree_broadleaf("tree_oak_lod0"),
        shrub("shrub_cluster_lod0"),
        grass("grass_clump_lod0"),
        reeds("reed_cluster_lod0"),
        rock("rock_pebbles_lod0", 0.28),
        rock("rock_boulder_lod0", 0.72),
        rock("rock_outcrop_lod0", 1.05),
        rock("shore_stones_lod0", 0.42, "shore"),
        driftwood("driftwood_lod0"),
        rock("ore_iron_lod0", 0.7, "iron"),
        rock("ore_copper_lod0", 0.7, "copper"),
        rock("ore_stone_lod0", 0.7, "stone"),
    ]
    mine_lod0 = mine_shaft_house("mine_shaft_house_lod0", detailed=True)
    mine_lod1 = mine_shaft_house("mine_shaft_house_lod1", detailed=False)
    warehouse_lod0 = warehouse_arcaded_depot("warehouse_lod0", detailed=True)
    warehouse_lod1 = warehouse_arcaded_depot("warehouse_lod1", detailed=False)
    lod0_collection = bpy.data.collections.new("Environment_LOD0")
    bpy.context.scene.collection.children.link(lod0_collection)
    lod1_collection = bpy.data.collections.new("Environment_LOD1")
    bpy.context.scene.collection.children.link(lod1_collection)
    all_assets = []
    for asset in environment_assets:
        # LOD1 must be derived before grounding the source. This is a no-op for
        # the already-grounded joined assets and preserves the original rock
        # decimation order used by the deployed nature kit.
        lod1 = create_lod1(asset, asset.name.replace("_lod0", "_lod1"), lod1_collection)
        ground_asset(asset)
        for collection in list(asset.users_collection):
            collection.objects.unlink(asset)
        lod0_collection.objects.link(asset)
        all_assets.extend((asset, lod1))
    for collection in list(mine_lod0.users_collection):
        collection.objects.unlink(mine_lod0)
    lod0_collection.objects.link(mine_lod0)
    for collection in list(mine_lod1.users_collection):
        collection.objects.unlink(mine_lod1)
    lod1_collection.objects.link(mine_lod1)
    mine_resource_anchor(lod0_collection, mine_lod0)
    all_assets.extend((mine_lod0, mine_lod1))
    for collection in list(warehouse_lod0.users_collection):
        collection.objects.unlink(warehouse_lod0)
    lod0_collection.objects.link(warehouse_lod0)
    for collection in list(warehouse_lod1.users_collection):
        collection.objects.unlink(warehouse_lod1)
    lod1_collection.objects.link(warehouse_lod1)
    all_assets.extend((warehouse_lod0, warehouse_lod1))
    return all_assets


def validate_assets(assets):
    anchor = bpy.data.objects.get("mine_resource_anchor")
    if anchor is None or anchor.type != "EMPTY":
        raise RuntimeError("Mine resource anchor is missing or is not an Empty.")
    mine_lod0 = next((asset for asset in assets if asset.name == "mine_shaft_house_lod0"), None)
    expected_anchor_x = float(mine_lod0["resource_anchor_x"]) if mine_lod0 is not None else None
    if expected_anchor_x is None or abs(anchor.location.x - expected_anchor_x) > 1e-5:
        raise RuntimeError(f"Mine resource anchor does not match generated tower center: {tuple(anchor.location)}")
    for asset in assets:
        if not asset.name.endswith(("_lod0", "_lod1")):
            raise RuntimeError(f"Environment asset has an invalid name: {asset.name}")
        if any(abs(value) > 1e-5 for value in asset.location):
            raise RuntimeError(
                f"Environment asset is not located at the origin: {asset.name} "
                f"{tuple(round(value, 6) for value in asset.location)}"
            )
        if any(abs(value - 1.0) > 1e-5 for value in asset.scale):
            raise RuntimeError(f"Environment asset has unapplied scale: {asset.name}")
        minimum_z = min(vertex.co.z for vertex in asset.data.vertices)
        if minimum_z < -1e-5:
            raise RuntimeError(f"Environment asset is below its ground origin: {asset.name}")
        if asset.name.startswith("mine_shaft_house_"):
            xs = [vertex.co.x for vertex in asset.data.vertices]
            ys = [vertex.co.y for vertex in asset.data.vertices]
            if min(xs) < -7.5 or max(xs) > 7.5 or min(ys) < -3.0 or max(ys) > 3.0:
                raise RuntimeError(
                    f"Mine asset exceeds its 15x6 footprint: {asset.name} "
                    f"X[{min(xs):.3f}, {max(xs):.3f}] Y[{min(ys):.3f}, {max(ys):.3f}]"
                )
            triangles = sum(max(1, len(polygon.vertices) - 2) for polygon in asset.data.polygons)
            ceiling = 26000 if asset.name.endswith("_lod0") else 15000
            if triangles > ceiling:
                raise RuntimeError(f"Mine asset exceeds its triangle budget: {asset.name} ({triangles} > {ceiling})")
            print(
                f"Validated {asset.name}: {triangles} triangles, "
                f"bounds X[{min(xs):.3f}, {max(xs):.3f}] "
                f"Y[{min(ys):.3f}, {max(ys):.3f}] "
                f"Z[{minimum_z:.3f}, {max(vertex.co.z for vertex in asset.data.vertices):.3f}]"
            )
        if asset.name.startswith("warehouse_"):
            xs = [vertex.co.x for vertex in asset.data.vertices]
            ys = [vertex.co.y for vertex in asset.data.vertices]
            if min(xs) < -7.5 or max(xs) > 7.5 or min(ys) < -3.0 or max(ys) > 3.0:
                raise RuntimeError(
                    f"Warehouse asset exceeds its 15x6 footprint: {asset.name} "
                    f"X[{min(xs):.3f}, {max(xs):.3f}] Y[{min(ys):.3f}, {max(ys):.3f}]"
                )
            triangles = sum(max(1, len(polygon.vertices) - 2) for polygon in asset.data.polygons)
            ceiling = 16000 if asset.name.endswith("_lod0") else 9000
            if triangles > ceiling:
                raise RuntimeError(
                    f"Warehouse asset exceeds its triangle budget: {asset.name} ({triangles} > {ceiling})"
                )
            if max(xs) - min(xs) < 14.5 or max(ys) - min(ys) < 5.5:
                raise RuntimeError(f"Warehouse asset no longer fills its declared footprint: {asset.name}")
            maximum_z = max(vertex.co.z for vertex in asset.data.vertices)
            if maximum_z > 4.30:
                raise RuntimeError(f"Warehouse asset exceeds its low depot height: {asset.name} ({maximum_z:.3f} > 4.300)")
            print(
                f"Validated {asset.name}: {triangles} triangles, "
                f"bounds X[{min(xs):.3f}, {max(xs):.3f}] "
                f"Y[{min(ys):.3f}, {max(ys):.3f}] "
                f"Z[{minimum_z:.3f}, {max(vertex.co.z for vertex in asset.data.vertices):.3f}]"
            )
    validate_nature_lods(assets)


def validate_nature_lods(assets):
    """Protect the complete nature inventory and its distant silhouettes."""
    by_name = {asset.name: asset for asset in assets}
    for base_id in NATURE_BASE_IDS:
        lod0 = by_name.get(f"{base_id}_lod0")
        lod1 = by_name.get(f"{base_id}_lod1")
        if lod0 is None or lod1 is None:
            raise RuntimeError(f"Nature asset is missing a required LOD pair: {base_id}")

        lod0_dimensions = mesh_dimensions(lod0)
        lod1_dimensions = mesh_dimensions(lod1)
        for axis, (lod0_size, lod1_size) in enumerate(zip(lod0_dimensions, lod1_dimensions)):
            if lod0_size <= 1e-5 or lod1_size <= 1e-5:
                raise RuntimeError(f"Nature asset has a collapsed axis: {base_id} axis {axis}")
            retention = lod1_size / lod0_size
            if retention < 0.84 or retention > 1.35:
                raise RuntimeError(
                    f"Nature LOD1 silhouette drifted on axis {axis}: {base_id} "
                    f"retains {retention:.3f} of LOD0"
                )


def mesh_dimensions(asset):
    xs = [vertex.co.x for vertex in asset.data.vertices]
    ys = [vertex.co.y for vertex in asset.data.vertices]
    zs = [vertex.co.z for vertex in asset.data.vertices]
    return (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))


def export_glb(output_path, assets):
    validate_assets(assets)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
    )
    manifest_path = os.path.join(os.path.dirname(output_path), "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as manifest_file:
        json.dump({
            "runtimeAsset": True,
            "assetPath": "/assets/environment/environment.glb",
            "assetIds": sorted(
                asset.name for asset in assets
            ),
        }, manifest_file, indent=2)
        manifest_file.write("\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default="public/assets/environment/environment.glb",
        help="Output GLB path relative to the repository root.",
    )
    parser.add_argument(
        "--blend-output",
        default="art/environment/environment.blend",
        help="Blender source scene path relative to the repository root.",
    )
    args, _ = parser.parse_known_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    clear_scene()
    assets = build_assets()
    validate_assets(assets)
    blend_output = os.path.abspath(args.blend_output)
    os.makedirs(os.path.dirname(blend_output), exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=blend_output)
    export_glb(os.path.abspath(args.output), assets)


if __name__ == "__main__":
    main()
