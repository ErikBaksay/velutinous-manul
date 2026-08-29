"""Bootstrap the editable high-fidelity church Blender master.

Run from the repository root with Blender 5.1.1:

    blender --background --python tools/blender/author_church.py

The generated ``art/buildings/church/church.blend`` is the editable source of
truth.  This bootstrap refuses to replace it unless ``--force`` is supplied.
The current authoring stage is the primary-architecture approval gate.  It
extends the approved proportional blockout without changing its scale or axes.
"""

import math
import os
import sys

import bpy
from mathutils import Vector


OUTPUT_BLEND = "art/buildings/church/church.blend"
REFERENCE_DIR = "art/buildings/church/references"
ROOT_NAME = "church_master"

# Architectural master envelope.  The front stair begins at Y=-14 and the
# inferred rear annex ends at Y=+14.  Z=0 is the continuous ground contact.
ENVELOPE_WIDTH = 12.8
ENVELOPE_LENGTH = 28.0
ENVELOPE_HEIGHT = 27.0
TOWER_CENTER_Y = -7.35

PALETTE = {
    "church_stone_base": (0.56, 0.52, 0.45, 1.0),
    "church_stone_trim": (0.70, 0.66, 0.58, 1.0),
    "church_roof_metal": (0.055, 0.065, 0.070, 1.0),
    "church_glass_dark": (0.018, 0.023, 0.025, 1.0),
    "church_louvers_black": (0.012, 0.014, 0.014, 1.0),
    "church_wood_dark": (0.105, 0.055, 0.027, 1.0),
    "church_brass": (0.48, 0.31, 0.095, 1.0),
}


def parse_args():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return {"force": "--force" in args or "--force" in sys.argv}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)


def make_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj, collection):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def make_material(name):
    material = bpy.data.materials.new(name)
    color = PALETTE[name]
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = 0.84
    if name == "church_roof_metal":
        principled.inputs["Metallic"].default_value = 0.42
        principled.inputs["Roughness"].default_value = 0.46
    elif name == "church_glass_dark":
        principled.inputs["Metallic"].default_value = 0.0
        principled.inputs["Roughness"].default_value = 0.24
    elif name == "church_louvers_black":
        principled.inputs["Roughness"].default_value = 0.62
    elif name == "church_wood_dark":
        principled.inputs["Roughness"].default_value = 0.72
    elif name == "church_brass":
        principled.inputs["Metallic"].default_value = 0.68
        principled.inputs["Roughness"].default_value = 0.32
    return material


def materials():
    return {name: make_material(name) for name in PALETTE}


def apply_bevel(obj, width=0.0, segments=2):
    if width <= 0.0:
        return obj
    modifier = obj.modifiers.new("editable_edge_bevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    return obj


def cube(name, size, location, material, collection, parent, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    apply_bevel(obj, bevel)
    move_to_collection(obj, collection)
    obj.parent = parent
    return obj


def cylinder(
    name,
    radius,
    depth,
    location,
    material,
    collection,
    parent,
    vertices=32,
    bevel=0.0,
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    apply_bevel(obj, bevel)
    move_to_collection(obj, collection)
    obj.parent = parent
    return obj


def sphere(name, radius, location, material, collection, parent, segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=max(8, segments // 2),
        radius=radius,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    move_to_collection(obj, collection)
    obj.parent = parent
    return obj


def torus(
    name,
    major_radius,
    minor_radius,
    location,
    rotation,
    material,
    collection,
    parent,
):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=24,
        minor_segments=8,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    move_to_collection(obj, collection)
    obj.parent = parent
    return obj


def oriented_box(
    name,
    size,
    location,
    rotation_z,
    material,
    collection,
    parent,
    bevel=0.0,
):
    obj = cube(name, size, location, material, collection, parent, bevel=bevel)
    obj.rotation_euler.z = rotation_z
    return obj


def arched_slab(
    name,
    width,
    height,
    depth,
    location,
    rotation_z,
    material,
    collection,
    parent,
    arc_segments=12,
):
    """Create a closed Roman-arched slab in the local X/Z plane.

    Local -Y is the outward-facing direction.  Rotating about Z therefore
    places the same editable aperture on front, side, rear, or octagonal faces.
    """
    radius = width / 2.0
    straight_height = max(0.02, height - radius)
    z_bottom = -height / 2.0
    z_spring = z_bottom + straight_height
    outline = [(-radius, z_bottom), (radius, z_bottom), (radius, z_spring)]
    for index in range(1, arc_segments + 1):
        angle = math.pi * index / arc_segments
        outline.append((radius * math.cos(angle), z_spring + radius * math.sin(angle)))
    half_depth = depth / 2.0
    vertices = []
    for y in (-half_depth, half_depth):
        vertices.extend((x, y, z) for x, z in outline)
    count = len(outline)
    faces = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler.z = rotation_z
    obj.parent = parent
    return obj


def outward_location(location, rotation_z, distance):
    x, y, z = location
    return (
        x + math.sin(rotation_z) * distance,
        y - math.cos(rotation_z) * distance,
        z,
    )


def arched_opening(
    name,
    width,
    height,
    location,
    rotation_z,
    infill,
    trim,
    collection,
    parent,
    border=0.16,
    muntins=True,
):
    """Build a recessed opaque opening with a raised stone arch surround."""
    arched_slab(
        f"{name}_surround",
        width + border * 2.0,
        height + border * 2.0,
        0.14,
        location,
        rotation_z,
        trim,
        collection,
        parent,
    )
    inset_location = outward_location(location, rotation_z, 0.085)
    arched_slab(
        f"{name}_infill",
        width,
        height,
        0.08,
        inset_location,
        rotation_z,
        infill,
        collection,
        parent,
    )
    if muntins:
        bar_location = outward_location(location, rotation_z, 0.14)
        oriented_box(
            f"{name}_mullion",
            (0.07, 0.055, height - width * 0.22),
            (bar_location[0], bar_location[1], location[2] - width * 0.10),
            rotation_z,
            trim,
            collection,
            parent,
            bevel=0.012,
        )
        for index, z_offset in enumerate((-height * 0.24, 0.0, height * 0.22), start=1):
            oriented_box(
                f"{name}_transom_{index:02d}",
                (width - 0.10, 0.055, 0.065),
                (bar_location[0], bar_location[1], location[2] + z_offset),
                rotation_z,
                trim,
                collection,
                parent,
                bevel=0.01,
            )
    return inset_location


def rectangular_opening(
    name,
    width,
    height,
    location,
    rotation_z,
    infill,
    trim,
    collection,
    parent,
    border=0.14,
):
    inset_location = outward_location(location, rotation_z, 0.09)
    oriented_box(
        f"{name}_infill",
        (width, 0.08, height),
        inset_location,
        rotation_z,
        infill,
        collection,
        parent,
        bevel=0.015,
    )
    trim_location = outward_location(location, rotation_z, 0.145)
    for suffix, box_size, x_offset, z_offset in (
        ("jamb_left", (border, 0.08, height + border * 2.0), -(width + border) / 2.0, 0.0),
        ("jamb_right", (border, 0.08, height + border * 2.0), (width + border) / 2.0, 0.0),
        ("lintel", (width + border * 2.0, 0.08, border), 0.0, (height + border) / 2.0),
        ("sill", (width + border * 2.0, 0.08, border), 0.0, -(height + border) / 2.0),
    ):
        local_x = math.cos(rotation_z) * x_offset
        local_y = math.sin(rotation_z) * x_offset
        oriented_box(
            f"{name}_{suffix}",
            box_size,
            (trim_location[0] + local_x, trim_location[1] + local_y, location[2] + z_offset),
            rotation_z,
            trim,
            collection,
            parent,
            bevel=0.012,
        )
    return inset_location


def facing_disc(
    name,
    radius,
    depth,
    location,
    rotation_z,
    material,
    collection,
    parent,
    vertices=32,
):
    obj = cylinder(
        name,
        radius,
        depth,
        location,
        material,
        collection,
        parent,
        vertices=vertices,
    )
    obj.rotation_euler = (math.pi / 2.0, 0.0, rotation_z)
    return obj


def cone_frustum(
    name,
    radius1,
    radius2,
    depth,
    location,
    material,
    collection,
    parent,
    vertices=8,
):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    move_to_collection(obj, collection)
    obj.parent = parent
    return obj


def gable_prism_x(
    name,
    width,
    length,
    eaves_z,
    ridge_z,
    center_y,
    material,
    collection,
    parent,
):
    """Create a gable roof whose ridge runs along local Y."""
    half_width = width / 2.0
    half_length = length / 2.0
    vertices = [
        (-half_width, center_y - half_length, eaves_z),
        (half_width, center_y - half_length, eaves_z),
        (0.0, center_y - half_length, ridge_z),
        (-half_width, center_y + half_length, eaves_z),
        (half_width, center_y + half_length, eaves_z),
        (0.0, center_y + half_length, ridge_z),
    ]
    # The end triangles are deliberately open: the pale masonry gable or
    # pediment behind the roof remains visible, matching the references.
    faces = [
        (0, 3, 4, 1),
        (1, 4, 5, 2),
        (2, 5, 3, 0),
    ]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = parent
    return obj


def hip_roof(
    name,
    width,
    length,
    eaves_z,
    ridge_z,
    center_y,
    material,
    collection,
    parent,
):
    half_width = width / 2.0
    half_length = length / 2.0
    ridge_half = max(0.0, half_length - half_width)
    vertices = [
        (-half_width, center_y - half_length, eaves_z),
        (half_width, center_y - half_length, eaves_z),
        (half_width, center_y + half_length, eaves_z),
        (-half_width, center_y + half_length, eaves_z),
        (0.0, center_y - ridge_half, ridge_z),
        (0.0, center_y + ridge_half, ridge_z),
    ]
    faces = [
        (0, 1, 4),
        (1, 2, 5, 4),
        (2, 3, 5),
        (3, 0, 4, 5),
        (0, 3, 2, 1),
    ]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = parent
    return obj


def triangular_pediment(
    name,
    width,
    depth,
    base_z,
    peak_z,
    center_y,
    material,
    collection,
    parent,
):
    half_width = width / 2.0
    half_depth = depth / 2.0
    vertices = [
        (-half_width, center_y - half_depth, base_z),
        (half_width, center_y - half_depth, base_z),
        (0.0, center_y - half_depth, peak_z),
        (-half_width, center_y + half_depth, base_z),
        (half_width, center_y + half_depth, base_z),
        (0.0, center_y + half_depth, peak_z),
    ]
    faces = [
        (0, 1, 2),
        (3, 5, 4),
        (0, 3, 4, 1),
        (1, 4, 5, 2),
        (2, 5, 3, 0),
    ]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = parent
    return obj


def make_cross(name, location, material, collection, parent):
    x, y, z = location
    vertical = cube(
        f"{name}_vertical",
        (0.14, 0.14, 1.16),
        (x, y, z),
        material,
        collection,
        parent,
        bevel=0.035,
    )
    horizontal = cube(
        f"{name}_horizontal",
        (0.74, 0.14, 0.14),
        (x, y, z + 0.19),
        material,
        collection,
        parent,
        bevel=0.035,
    )
    horizontal_side = cube(
        f"{name}_horizontal_side",
        (0.14, 0.74, 0.14),
        (x, y, z + 0.19),
        material,
        collection,
        parent,
        bevel=0.035,
    )
    return vertical, horizontal, horizontal_side


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_reference(collection, name, filename, location, rotation, size):
    path = os.path.abspath(os.path.join(REFERENCE_DIR, filename))
    if not os.path.exists(path):
        raise RuntimeError(f"Missing church reference image: {path}")
    image = bpy.data.images.load(path, check_existing=True)
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "IMAGE"
    empty.data = image
    empty.empty_display_size = size
    empty.location = location
    empty.rotation_euler = rotation
    empty.color[3] = 0.34
    empty.show_in_front = True
    empty.hide_render = True
    empty.hide_viewport = False
    empty["reference_file"] = path
    collection.objects.link(empty)
    return empty


def add_review_camera(collection, name, location, target, ortho_scale, role):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = ortho_scale
    camera = bpy.data.objects.new(name, data)
    collection.objects.link(camera)
    camera.location = location
    point_at(camera, target)
    camera["review_role"] = role
    return camera


def add_stairs(model, trim, root):
    step_count = 7
    total_rise = 1.05
    top_y = -10.35
    front_y = -14.0
    depth = (top_y - front_y) / step_count
    for index in range(step_count):
        height = total_rise * (index + 1) / step_count
        y_min = front_y + index * depth
        y_max = top_y
        cube(
            f"church_stair_{index + 1:02d}",
            (9.15, y_max - y_min, height),
            (0.0, (y_min + y_max) / 2.0, height / 2.0),
            trim,
            model,
            root,
            bevel=0.025,
        )
    for side, x in (("left", -5.45), ("right", 5.45)):
        cube(
            f"church_stair_cheek_{side}",
            (1.35, 3.85, 1.05),
            (x, -12.075, 0.525),
            trim,
            model,
            root,
            bevel=0.035,
        )


def add_portico_architecture(collections, mats, root):
    model = collections["CHURCH_MODEL"]
    repeated = collections["CHURCH_REPEATED"]
    ornament = collections["CHURCH_ORNAMENT"]
    trim = mats["church_stone_trim"]
    glass = mats["church_glass_dark"]
    wood = mats["church_wood_dark"]
    brass = mats["church_brass"]

    column_locations = [
        (f"front_{index:02d}", x, -11.50)
        for index, x in enumerate((-4.05, -1.35, 1.35, 4.05), start=1)
    ]
    column_locations.extend(
        (("return_left", -4.05, -9.13), ("return_right", 4.05, -9.13))
    )
    for label, x, y in column_locations:
        cube(
            f"church_portico_column_{label}_plinth",
            (0.92, 0.92, 0.18),
            (x, y, 1.86),
            trim,
            repeated,
            root,
            bevel=0.025,
        )
        cylinder(
            f"church_portico_column_{label}_base_lower",
            0.51,
            0.18,
            (x, y, 2.00),
            trim,
            repeated,
            root,
            vertices=32,
            bevel=0.018,
        )
        cylinder(
            f"church_portico_column_{label}_base_upper",
            0.45,
            0.13,
            (x, y, 2.14),
            trim,
            repeated,
            root,
            vertices=32,
            bevel=0.014,
        )
        cylinder(
            f"church_portico_column_{label}_necking",
            0.44,
            0.15,
            (x, y, 7.78),
            trim,
            repeated,
            root,
            vertices=32,
            bevel=0.012,
        )
        cube(
            f"church_portico_column_{label}_capital",
            (1.00, 0.82, 0.20),
            (x, y, 7.96),
            trim,
            repeated,
            root,
            bevel=0.025,
        )
        for side_index, x_offset in enumerate((-0.31, 0.31), start=1):
            torus(
                f"church_portico_column_{label}_volute_{side_index:02d}",
                0.14,
                0.045,
                (x + x_offset, y - 0.43, 7.93),
                (math.pi / 2.0, 0.0, 0.0),
                trim,
                ornament,
                root,
            )

    # Layered architrave, frieze, and cornice preserve the approved top line.
    for suffix, size, z in (
        ("architrave", (12.10, 4.18, 0.18), 7.74),
        ("frieze", (12.22, 4.22, 0.22), 8.08),
        ("cornice", (12.48, 4.38, 0.18), 8.47),
    ):
        cube(
            f"church_portico_{suffix}",
            size,
            (0.0, -10.32, z),
            trim,
            model,
            root,
            bevel=0.025,
        )

    # Front wall hierarchy visible through the portico.
    for side, x in (("left", -5.03), ("right", 5.03)):
        cube(
            f"church_front_corner_pilaster_{side}",
            (0.48, 0.22, 6.25),
            (x, -9.39, 4.86),
            trim,
            model,
            root,
            bevel=0.018,
        )
    rectangular_opening(
        "church_front_door",
        1.48,
        3.10,
        (0.0, -9.42, 3.27),
        0.0,
        wood,
        trim,
        ornament,
        root,
        border=0.18,
    )
    for panel_index, (x, z) in enumerate(
        ((-0.35, 2.73), (0.35, 2.73), (-0.35, 3.78), (0.35, 3.78)), start=1
    ):
        cube(
            f"church_front_door_panel_{panel_index:02d}",
            (0.52, 0.06, 0.72),
            (x, -9.57, z),
            wood,
            ornament,
            root,
            bevel=0.035,
        )
    for side, x in (("left", -0.10), ("right", 0.10)):
        sphere(
            f"church_front_door_handle_{side}",
            0.045,
            (x, -9.64, 3.20),
            brass,
            ornament,
            root,
            segments=16,
        )
    rectangular_opening(
        "church_front_upper_window",
        1.32,
        2.12,
        (0.0, -9.42, 6.20),
        0.0,
        glass,
        trim,
        ornament,
        root,
        border=0.13,
    )
    for x_offset in (-0.31, 0.31):
        cube(
            "church_front_upper_window_mullion_" + ("left" if x_offset < 0 else "right"),
            (0.05, 0.05, 1.96),
            (x_offset, -9.58, 6.20),
            trim,
            ornament,
            root,
            bevel=0.008,
        )
    for z_offset in (-0.48, 0.0, 0.48):
        cube(
            f"church_front_upper_window_transom_{z_offset:+.2f}",
            (1.20, 0.05, 0.05),
            (0.0, -9.58, 6.20 + z_offset),
            trim,
            ornament,
            root,
            bevel=0.008,
        )

    # Circular pediment opening on the actual front face of the deep portico.
    facing_disc(
        "church_portico_oculus_surround",
        0.57,
        0.13,
        (0.0, -12.255, 9.24),
        0.0,
        trim,
        ornament,
        root,
        vertices=40,
    )
    facing_disc(
        "church_portico_oculus_infill",
        0.41,
        0.08,
        (0.0, -12.335, 9.24),
        0.0,
        glass,
        ornament,
        root,
        vertices=40,
    )


def add_nave_architecture(collections, mats, root):
    model = collections["CHURCH_MODEL"]
    repeated = collections["CHURCH_REPEATED"]
    trim = mats["church_stone_trim"]
    glass = mats["church_glass_dark"]
    louvers = mats["church_louvers_black"]

    bay_centers = (-5.45, -1.65, 2.15, 5.95)
    division_centers = (-7.32, -3.55, 0.25, 4.05, 7.83)
    for side, x, rotation in (
        ("right", 5.39, math.pi / 2.0),
        ("left", -5.39, -math.pi / 2.0),
    ):
        for bay_index, y in enumerate(bay_centers, start=1):
            arched_opening(
                f"church_nave_{side}_window_{bay_index:02d}",
                1.42,
                4.35,
                (x, y, 4.94),
                rotation,
                glass,
                trim,
                repeated,
                root,
                border=0.15,
                muntins=True,
            )
            rectangular_opening(
                f"church_nave_{side}_basement_vent_{bay_index:02d}",
                0.62,
                0.38,
                (x, y, 1.48),
                rotation,
                louvers,
                trim,
                repeated,
                root,
                border=0.08,
            )
        for division_index, y in enumerate(division_centers, start=1):
            oriented_box(
                f"church_nave_{side}_pilaster_{division_index:02d}",
                (0.44, 0.18, 7.30),
                (x, y, 5.05),
                rotation,
                trim,
                model,
                root,
                bevel=0.018,
            )
            oriented_box(
                f"church_nave_{side}_pilaster_cap_{division_index:02d}",
                (0.62, 0.20, 0.22),
                outward_location((x, y, 8.66), rotation, 0.02),
                rotation,
                trim,
                model,
                root,
                bevel=0.018,
            )

    # The restrained rear annex repeats only details supported by the views.
    for side, x, rotation in (
        ("right", 3.73, math.pi / 2.0),
        ("left", -3.73, -math.pi / 2.0),
    ):
        arched_opening(
            f"church_rear_annex_{side}_window",
            0.92,
            2.08,
            (x, 11.70, 3.32),
            rotation,
            glass,
            trim,
            repeated,
            root,
            border=0.12,
            muntins=True,
        )
    arched_opening(
        "church_rear_annex_rear_window",
        1.02,
        2.18,
        (0.0, 13.74, 3.32),
        math.pi,
        glass,
        trim,
        repeated,
        root,
        border=0.12,
        muntins=True,
    )
    for side, x in (("left", -3.42), ("right", 3.42)):
        cube(
            f"church_rear_annex_corner_pilaster_{side}",
            (0.34, 0.20, 3.92),
            (x, 13.78, 3.42),
            trim,
            model,
            root,
            bevel=0.015,
        )
        sphere(
            f"church_rear_annex_roof_finial_{side}",
            0.11,
            (x, 13.63, 6.02),
            trim,
            repeated,
            root,
            segments=16,
        )


def add_louver_slats(name, width, height, location, rotation_z, material, collection, parent):
    slat_location = outward_location(location, rotation_z, 0.15)
    for index in range(9):
        z_offset = -height * 0.30 + index * height * 0.075
        oriented_box(
            f"{name}_slat_{index + 1:02d}",
            (width * 0.84, 0.045, 0.045),
            (slat_location[0], slat_location[1], location[2] + z_offset),
            rotation_z,
            material,
            collection,
            parent,
            bevel=0.006,
        )


def add_tower_architecture(collections, mats, root):
    model = collections["CHURCH_MODEL"]
    repeated = collections["CHURCH_REPEATED"]
    ornament = collections["CHURCH_ORNAMENT"]
    trim = mats["church_stone_trim"]
    stone = mats["church_stone_base"]
    glass = mats["church_glass_dark"]
    louvers = mats["church_louvers_black"]
    brass = mats["church_brass"]
    tower_y = TOWER_CENTER_Y

    # Front clock and the smaller arched side openings on its stage.
    facing_disc(
        "church_tower_clock_bezel",
        0.70,
        0.15,
        (0.0, tower_y - 2.33, 11.62),
        0.0,
        trim,
        ornament,
        root,
        vertices=48,
    )
    facing_disc(
        "church_tower_clock_face",
        0.57,
        0.09,
        (0.0, tower_y - 2.425, 11.62),
        0.0,
        glass,
        ornament,
        root,
        vertices=48,
    )
    for tick_index in range(12):
        angle = math.tau * tick_index / 12.0
        radius = 0.46
        tick = cube(
            f"church_tower_clock_tick_{tick_index + 1:02d}",
            (0.035, 0.035, 0.12),
            (radius * math.sin(angle), tower_y - 2.49, 11.62 + radius * math.cos(angle)),
            brass,
            ornament,
            root,
            bevel=0.008,
        )
        tick.rotation_euler.y = angle
    for hand_name, length, angle in (("hour", 0.31, -0.82), ("minute", 0.43, 0.86)):
        hand = cube(
            f"church_tower_clock_{hand_name}_hand",
            (0.045, 0.04, length),
            (
                math.sin(angle) * length * 0.48,
                tower_y - 2.505,
                11.62 + math.cos(angle) * length * 0.48,
            ),
            brass,
            ornament,
            root,
            bevel=0.01,
        )
        hand.rotation_euler.y = angle
    sphere(
        "church_tower_clock_pin",
        0.055,
        (0.0, tower_y - 2.54, 11.62),
        brass,
        ornament,
        root,
        segments=16,
    )
    for side, x, rotation in (
        ("right", 2.41, math.pi / 2.0),
        ("left", -2.41, -math.pi / 2.0),
    ):
        arched_opening(
            f"church_tower_clock_stage_{side}_opening",
            0.76,
            1.45,
            (x, tower_y, 11.55),
            rotation,
            louvers,
            trim,
            ornament,
            root,
            border=0.10,
            muntins=False,
        )
        add_louver_slats(
            f"church_tower_clock_stage_{side}_opening",
            0.76,
            1.45,
            (x, tower_y, 11.55),
            rotation,
            louvers,
            ornament,
            root,
        )

    # Tall belfry apertures, surrounds, and corner orders on all elevations.
    belfry_faces = (
        ("front", (0.0, tower_y - 2.03, 15.25), 0.0),
        ("right", (2.13, tower_y, 15.25), math.pi / 2.0),
        ("rear", (0.0, tower_y + 2.03, 15.25), math.pi),
        ("left", (-2.13, tower_y, 15.25), -math.pi / 2.0),
    )
    for face, location, rotation in belfry_faces:
        arched_opening(
            f"church_tower_belfry_{face}_opening",
            1.38,
            2.62,
            location,
            rotation,
            louvers,
            trim,
            ornament,
            root,
            border=0.15,
            muntins=False,
        )
        add_louver_slats(
            f"church_tower_belfry_{face}_opening",
            1.38,
            2.62,
            location,
            rotation,
            louvers,
            ornament,
            root,
        )
    for side, x in (("left", -1.78), ("right", 1.78)):
        cube(
            f"church_tower_belfry_front_pilaster_{side}",
            (0.28, 0.22, 3.05),
            (x, tower_y - 2.12, 15.23),
            trim,
            model,
            root,
            bevel=0.015,
        )
    for side, y in (("front", tower_y - 1.66), ("rear", tower_y + 1.66)):
        cube(
            f"church_tower_belfry_right_pilaster_{side}",
            (0.22, 0.28, 3.05),
            (2.18, y, 15.23),
            trim,
            model,
            root,
            bevel=0.015,
        )

    # Paneled transition with restrained corner finials and a central medallion.
    rectangular_opening(
        "church_tower_transition_front_panel",
        1.62,
        0.58,
        (0.0, tower_y - 2.10, 18.13),
        0.0,
        stone,
        trim,
        ornament,
        root,
        border=0.09,
    )
    facing_disc(
        "church_tower_transition_front_medallion",
        0.18,
        0.07,
        (0.0, tower_y - 2.20, 18.13),
        0.0,
        trim,
        ornament,
        root,
        vertices=24,
    )
    for index, (x, y) in enumerate(
        ((-1.72, tower_y - 1.62), (1.72, tower_y - 1.62), (-1.72, tower_y + 1.62), (1.72, tower_y + 1.62)),
        start=1,
    ):
        sphere(
            f"church_tower_transition_finial_{index:02d}",
            0.12,
            (x, y, 19.16),
            trim,
            ornament,
            root,
            segments=16,
        )

    # Openings on the four cardinal faces imply the octagonal lantern rhythm.
    lantern_offset = 1.62
    for face, location, rotation in (
        ("front", (0.0, tower_y - lantern_offset, 20.27), 0.0),
        ("right", (lantern_offset, tower_y, 20.27), math.pi / 2.0),
        ("rear", (0.0, tower_y + lantern_offset, 20.27), math.pi),
        ("left", (-lantern_offset, tower_y, 20.27), -math.pi / 2.0),
    ):
        arched_opening(
            f"church_tower_lantern_{face}_opening",
            0.70,
            1.42,
            location,
            rotation,
            louvers,
            trim,
            ornament,
            root,
            border=0.09,
            muntins=False,
        )
        add_louver_slats(
            f"church_tower_lantern_{face}_opening",
            0.70,
            1.42,
            location,
            rotation,
            louvers,
            ornament,
            root,
        )
    cylinder(
        "church_spire_lower_molding",
        1.73,
        0.16,
        (0.0, tower_y, 21.89),
        trim,
        model,
        root,
        vertices=8,
        bevel=0.018,
    )


def build_primary_architecture(collections, mats, root):
    add_portico_architecture(collections, mats, root)
    add_nave_architecture(collections, mats, root)
    add_tower_architecture(collections, mats, root)


def build_blockout(collections, mats, root):
    model = collections["CHURCH_MODEL"]
    repeated = collections["CHURCH_REPEATED"]
    ornament = collections["CHURCH_ORNAMENT"]
    stone = mats["church_stone_base"]
    trim = mats["church_stone_trim"]
    roof = mats["church_roof_metal"]
    brass = mats["church_brass"]

    cube(
        "church_foundation",
        (12.8, 24.35, 0.62),
        (0.0, 1.825, 0.31),
        stone,
        model,
        root,
        bevel=0.045,
    )
    add_stairs(model, trim, root)

    # Rectangular nave and restrained inferred rear vestry/apse block.
    cube(
        "church_nave_mass",
        (10.65, 19.25, 8.65),
        (0.0, 0.35, 4.945),
        stone,
        model,
        root,
        bevel=0.055,
    )
    cube(
        "church_nave_plinth",
        (11.20, 19.75, 0.78),
        (0.0, 0.35, 1.01),
        trim,
        model,
        root,
        bevel=0.035,
    )
    cube(
        "church_nave_cornice",
        (11.25, 19.75, 0.42),
        (0.0, 0.35, 9.30),
        trim,
        model,
        root,
        bevel=0.035,
    )
    # Masonry gable ends close the triangular volume beneath the open-ended
    # roof shell.  Without these, the sky was visible below the roof around
    # the tower in three-quarter views.
    triangular_pediment(
        "church_nave_front_gable_wall",
        10.65,
        0.24,
        9.49,
        11.96,
        -9.43,
        stone,
        model,
        root,
    )
    triangular_pediment(
        "church_nave_rear_gable_wall",
        10.65,
        0.24,
        9.49,
        11.96,
        10.13,
        stone,
        model,
        root,
    )
    gable_prism_x(
        "church_nave_roof",
        11.35,
        19.75,
        9.50,
        12.00,
        0.35,
        roof,
        model,
        root,
    )

    cube(
        "church_rear_annex_mass",
        (7.35, 4.00, 5.25),
        (0.0, 11.70, 3.245),
        stone,
        model,
        root,
        bevel=0.045,
    )
    cube(
        "church_rear_annex_plinth",
        (7.80, 4.25, 0.68),
        (0.0, 11.70, 0.96),
        trim,
        model,
        root,
        bevel=0.035,
    )
    cube(
        "church_rear_annex_cornice",
        (7.85, 4.30, 0.34),
        (0.0, 11.70, 5.65),
        trim,
        model,
        root,
        bevel=0.025,
    )
    hip_roof(
        "church_rear_annex_roof",
        7.85,
        4.30,
        5.82,
        7.12,
        11.70,
        roof,
        model,
        root,
    )

    # Portico: the front tetrastyle row and two side-return columns establish
    # the depth visible in the supplied side and three-quarter references.
    cube(
        "church_portico_podium",
        (12.20, 4.30, 0.72),
        (0.0, -10.48, 1.41),
        trim,
        model,
        root,
        bevel=0.035,
    )
    column_xs = (-4.05, -1.35, 1.35, 4.05)
    for index, x in enumerate(column_xs, start=1):
        cylinder(
            f"church_portico_column_front_{index:02d}",
            0.39,
            6.20,
            (x, -11.50, 4.82),
            trim,
            repeated,
            root,
            vertices=24,
        )
    for side, x in (("left", -4.05), ("right", 4.05)):
        cylinder(
            f"church_portico_column_return_{side}",
            0.39,
            6.20,
            (x, -9.13, 4.82),
            trim,
            repeated,
            root,
            vertices=24,
        )
    cube(
        "church_portico_entablature",
        (12.25, 4.25, 0.82),
        (0.0, -10.32, 8.10),
        trim,
        model,
        root,
        bevel=0.04,
    )
    triangular_pediment(
        "church_portico_pediment",
        11.85,
        3.80,
        8.51,
        10.20,
        -10.32,
        trim,
        model,
        root,
    )
    gable_prism_x(
        "church_portico_roof",
        12.20,
        4.25,
        8.62,
        10.42,
        -10.32,
        roof,
        model,
        root,
    )

    # Tower stages follow the silhouette and setback rhythm of the references.
    tower_y = TOWER_CENTER_Y
    cube(
        "church_tower_clock_stage",
        (4.75, 4.55, 3.15),
        (0.0, tower_y, 11.52),
        stone,
        model,
        root,
        bevel=0.045,
    )
    cube(
        "church_tower_clock_cornice",
        (5.15, 4.95, 0.42),
        (0.0, tower_y, 13.22),
        trim,
        model,
        root,
        bevel=0.035,
    )
    cube(
        "church_tower_belfry_stage",
        (4.18, 3.98, 3.70),
        (0.0, tower_y, 15.25),
        stone,
        model,
        root,
        bevel=0.04,
    )
    cube(
        "church_tower_belfry_cornice",
        (4.68, 4.48, 0.48),
        (0.0, tower_y, 17.30),
        trim,
        model,
        root,
        bevel=0.035,
    )
    cube(
        "church_tower_transition",
        (4.28, 4.08, 1.22),
        (0.0, tower_y, 18.15),
        trim,
        model,
        root,
        bevel=0.04,
    )
    cube(
        "church_tower_transition_cornice",
        (4.62, 4.42, 0.34),
        (0.0, tower_y, 18.93),
        trim,
        model,
        root,
        bevel=0.03,
    )
    cylinder(
        "church_tower_octagonal_lantern",
        1.73,
        2.40,
        (0.0, tower_y, 20.30),
        stone,
        model,
        root,
        vertices=8,
    )
    cylinder(
        "church_tower_lantern_cornice",
        1.95,
        0.34,
        (0.0, tower_y, 21.67),
        trim,
        model,
        root,
        vertices=8,
    )
    cone_frustum(
        "church_spire",
        1.64,
        0.22,
        4.18,
        (0.0, tower_y, 23.93),
        roof,
        model,
        root,
        vertices=8,
    )
    cylinder(
        "church_spire_orb",
        0.22,
        0.38,
        (0.0, tower_y, 26.13),
        brass,
        ornament,
        root,
        vertices=24,
        bevel=0.06,
    )
    make_cross(
        "church_terminal_cross",
        (0.0, tower_y, 26.54),
        brass,
        ornament,
        root,
    )


def setup_references(collections):
    refs = collections["REFERENCE_IMAGES"]
    # Image empties are drafting aids only.  Their individual display sizes
    # are calibrated to the visible architectural envelope, not the white
    # margins in the source PNGs.
    add_reference(
        refs,
        "church_reference_front",
        "reference-front.png",
        (0.0, 3.0, 13.50),
        (math.pi / 2.0, 0.0, 0.0),
        27.8,
    )
    add_reference(
        refs,
        "church_reference_right",
        "reference-side.png",
        (-3.0, 0.0, 13.50),
        (math.pi / 2.0, 0.0, math.pi / 2.0),
        29.5,
    )
    add_reference(
        refs,
        "church_reference_three_quarter",
        "reference-three-quarter.png",
        (18.0, -18.0, 17.0),
        (math.radians(63.0), 0.0, math.radians(42.0)),
        18.0,
    )


def setup_review_cameras(collections):
    cameras = collections["REVIEW_CAMERAS"]
    target = (0.0, 0.0, 13.15)
    specs = (
        ("church_review_front", (0.0, -55.0, 13.5), (0.0, -1.0, 13.5), 29.2, "front"),
        ("church_review_right", (50.0, 0.0, 13.5), target, 39.5, "right"),
        ("church_review_three_quarter", (36.0, -42.0, 31.0), (0.0, 0.0, 11.5), 43.0, "three-quarter"),
        ("church_review_left", (-50.0, 0.0, 13.5), target, 39.5, "left"),
        ("church_review_rear", (0.0, 55.0, 13.5), (0.0, 1.0, 13.5), 29.2, "rear"),
        ("church_review_top", (0.0, 0.0, 60.0), (0.0, 0.0, 0.0), 34.0, "top"),
    )
    for name, location, camera_target, scale, role in specs:
        add_review_camera(cameras, name, location, camera_target, scale, role)


def validate_scene(root):
    if root.name != ROOT_NAME:
        raise RuntimeError(f"Unexpected church root: {root.name}")
    if bpy.context.scene.unit_settings.system != "METRIC":
        raise RuntimeError("Church master must use metric units.")
    meshes = [obj for obj in root.children_recursive if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("Church master contains no mesh geometry.")
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
        raise RuntimeError(f"Church height is outside its authoring envelope: {maximum_z:.3f}")
    required_collections = {
        "CHURCH_MODEL",
        "CHURCH_REPEATED",
        "CHURCH_ORNAMENT",
        "REFERENCE_IMAGES",
        "REVIEW_CAMERAS",
    }
    missing = required_collections - set(bpy.data.collections.keys())
    if missing:
        raise RuntimeError(f"Church scene is missing collections: {sorted(missing)}")


def build_scene():
    clear_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"

    collections = {
        name: make_collection(name)
        for name in (
            "CHURCH_MODEL",
            "CHURCH_REPEATED",
            "CHURCH_ORNAMENT",
            "REFERENCE_IMAGES",
            "REVIEW_CAMERAS",
        )
    }
    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.65
    collections["CHURCH_MODEL"].objects.link(root)
    root["authoring_stage"] = "primary_architecture"
    root["source_of_truth"] = "editable Blender exterior master"
    root["forward_axis"] = "-Y"
    root["up_axis"] = "+Z"
    root["authoring_scale"] = "literal_metric"
    root["envelope_width_m"] = ENVELOPE_WIDTH
    root["envelope_length_m"] = ENVELOPE_LENGTH
    root["envelope_height_m"] = ENVELOPE_HEIGHT
    root["hidden_elevations"] = "mirrored right elevation; conservative inferred rear"
    root["interior_scope"] = "closed exterior only"
    root["detail_method"] = "hybrid editable geometry and procedural materials"

    mats = materials()
    build_blockout(collections, mats, root)
    build_primary_architecture(collections, mats, root)
    setup_references(collections)
    setup_review_cameras(collections)
    validate_scene(root)
    return root


def main():
    args = parse_args()
    blend_path = os.path.abspath(OUTPUT_BLEND)
    if os.path.exists(blend_path) and not args["force"]:
        raise RuntimeError(
            f"Refusing to replace existing church source: {blend_path}. "
            "Pass --force only while intentionally rebuilding the approved bootstrap."
        )
    root = build_scene()
    os.makedirs(os.path.dirname(blend_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(
        f"Saved church primary architecture: {blend_path} "
        f"({ENVELOPE_WIDTH:.1f} x {ENVELOPE_LENGTH:.1f} x {ENVELOPE_HEIGHT:.1f} m)"
    )
    return root


if __name__ == "__main__":
    main()
