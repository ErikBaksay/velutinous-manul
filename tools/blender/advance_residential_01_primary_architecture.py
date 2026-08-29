"""Advance the approved Residential 01 blockout to primary architecture.

Run this targeted patch against the existing editable source:

    blender --background art/buildings/residential_01/residential_01.blend \
      --python tools/blender/advance_residential_01_primary_architecture.py

The script accepts only the approved ``proportion_blockout`` stage, preserves
the massing and calibrated references, removes the rejected rooftop service
box, adds the complete facade/railing pass, validates it, and saves in place.
It cannot be rerun over the advanced scene.
"""

import math
import os

import bpy
from mathutils import Vector


ROOT_NAME = "residential_01_master"
EXPECTED_SOURCE = os.path.abspath("art/buildings/residential_01/residential_01.blend")
FULL_WIDTH = 18.0
FULL_DEPTH = 13.5
PENTHOUSE_WIDTH = 15.8
PENTHOUSE_DEPTH = 11.3

FRONT_REAR_BAYS = (-6.45, -2.15, 2.15, 6.45)
SIDE_BAYS = (-4.35, 0.0, 4.35)
FULL_FLOOR_Z = (4.86, 7.74, 10.62)
PENTHOUSE_FRONT_REAR_BAYS = (-5.55, -1.85, 1.85, 5.55)
PENTHOUSE_SIDE_BAYS = (-3.45, 0.0, 3.45)

MATERIAL_SPECS = {
    "residential_frame_black": {
        "color": (0.012, 0.014, 0.014, 1.0),
        "roughness": 0.34,
        "metallic": 0.26,
    },
    "residential_smoked_glass": {
        "color": (0.025, 0.036, 0.042, 1.0),
        "roughness": 0.18,
        "metallic": 0.08,
    },
    "residential_cladding_seam": {
        "color": (0.045, 0.045, 0.042, 1.0),
        "roughness": 0.62,
        "metallic": 0.0,
    },
    "residential_light_warm": {
        "color": (0.84, 0.45, 0.16, 1.0),
        "roughness": 0.34,
        "metallic": 0.0,
        "emission": (1.0, 0.36, 0.08, 1.0),
        "emission_strength": 5.0,
    },
}


def material(name):
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    spec = MATERIAL_SPECS[name]
    created = bpy.data.materials.new(name)
    created.diffuse_color = spec["color"]
    created.use_nodes = True
    principled = created.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = spec["color"]
    principled.inputs["Roughness"].default_value = spec["roughness"]
    principled.inputs["Metallic"].default_value = spec["metallic"]
    if "emission" in spec:
        emission_input = principled.inputs.get("Emission Color") or principled.inputs.get(
            "Emission"
        )
        strength_input = principled.inputs.get("Emission Strength")
        if emission_input is not None:
            emission_input.default_value = spec["emission"]
        if strength_input is not None:
            strength_input.default_value = spec["emission_strength"]
    return created


def move_to_collection(obj, collection):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def cube(name, size, location, material_value, collection, parent, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material_value)
    if bevel > 0.0:
        modifier = obj.modifiers.new("editable_edge_bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
    move_to_collection(obj, collection)
    obj.parent = parent
    return obj


def cylinder(name, radius, depth, location, material_value, collection, parent, vertices=8):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material_value)
    move_to_collection(obj, collection)
    obj.parent = parent
    return obj


def facade_surface(facade, penthouse=False):
    if facade in {"front", "back"}:
        extent = PENTHOUSE_DEPTH / 2.0 if penthouse else FULL_DEPTH / 2.0
    else:
        extent = PENTHOUSE_WIDTH / 2.0 if penthouse else FULL_WIDTH / 2.0
    return extent


def facade_box(
    name,
    facade,
    horizontal,
    z,
    width,
    height,
    thickness,
    offset,
    material_value,
    collection,
    parent,
    penthouse=False,
    bevel=0.0,
):
    surface = facade_surface(facade, penthouse)
    sign = -1.0 if facade in {"front", "left"} else 1.0
    normal_center = sign * (surface + offset + thickness / 2.0)
    if facade in {"front", "back"}:
        size = (width, thickness, height)
        location = (horizontal, normal_center, z)
    else:
        size = (thickness, width, height)
        location = (normal_center, horizontal, z)
    return cube(
        name,
        size,
        location,
        material_value,
        collection,
        parent,
        bevel=bevel,
    )


def window_unit(
    name,
    facade,
    horizontal,
    center_z,
    collection,
    parent,
    frame,
    glass,
    penthouse=False,
    juliet=True,
):
    width = 1.42 if not penthouse else 1.48
    height = 2.18 if not penthouse else 2.24
    backing = facade_box(
        f"{name}_glass",
        facade,
        horizontal,
        center_z,
        width,
        height,
        0.035,
        0.010,
        glass,
        collection,
        parent,
        penthouse=penthouse,
    )
    backing["opening_type"] = "upper_window"
    backing["facade"] = facade
    backing["penthouse"] = penthouse

    frame_width = 0.075
    frame_depth = 0.075
    frame_offset = 0.052
    for suffix, h_offset in (("left", -width / 2.0), ("right", width / 2.0)):
        facade_box(
            f"{name}_frame_{suffix}",
            facade,
            horizontal + h_offset,
            center_z,
            frame_width,
            height + 0.13,
            frame_depth,
            frame_offset,
            frame,
            collection,
            parent,
            penthouse=penthouse,
            bevel=0.012,
        )
    for suffix, z_offset in (("bottom", -height / 2.0), ("top", height / 2.0)):
        facade_box(
            f"{name}_frame_{suffix}",
            facade,
            horizontal,
            center_z + z_offset,
            width + 0.13,
            frame_width,
            frame_depth,
            frame_offset,
            frame,
            collection,
            parent,
            penthouse=penthouse,
            bevel=0.012,
        )
    facade_box(
        f"{name}_mullion",
        facade,
        horizontal,
        center_z,
        0.055,
        height,
        frame_depth,
        frame_offset + 0.008,
        frame,
        collection,
        parent,
        penthouse=penthouse,
    )
    facade_box(
        f"{name}_transom",
        facade,
        horizontal,
        center_z - 0.28,
        width,
        0.052,
        frame_depth,
        frame_offset + 0.008,
        frame,
        collection,
        parent,
        penthouse=penthouse,
    )
    if juliet:
        rail_bottom = center_z - height / 2.0 + 0.16
        rail_top = center_z - 0.18
        for suffix, rail_z in (("bottom", rail_bottom), ("top", rail_top)):
            facade_box(
                f"{name}_juliet_{suffix}",
                facade,
                horizontal,
                rail_z,
                width + 0.18,
                0.045,
                0.040,
                0.145,
                frame,
                collection,
                parent,
                penthouse=penthouse,
            )
        for bar_index in range(7):
            bar_horizontal = horizontal - width / 2.0 + width * bar_index / 6.0
            facade_box(
                f"{name}_juliet_bar_{bar_index + 1:02d}",
                facade,
                bar_horizontal,
                (rail_bottom + rail_top) / 2.0,
                0.030,
                rail_top - rail_bottom,
                0.035,
                0.150,
                frame,
                collection,
                parent,
                penthouse=penthouse,
            )
    return backing


def storefront_unit(
    name,
    facade,
    horizontal,
    width,
    collection,
    parent,
    frame,
    glass,
    door=False,
):
    center_z = 1.67
    height = 2.75
    backing = facade_box(
        f"{name}_glass",
        facade,
        horizontal,
        center_z,
        width,
        height,
        0.045,
        0.018,
        glass,
        collection,
        parent,
    )
    backing["opening_type"] = "ground_opening"
    backing["facade"] = facade
    backing["door"] = door
    frame_width = 0.095
    for suffix, h_offset in (("left", -width / 2.0), ("right", width / 2.0)):
        facade_box(
            f"{name}_frame_{suffix}",
            facade,
            horizontal + h_offset,
            center_z,
            frame_width,
            height + 0.10,
            0.085,
            0.070,
            frame,
            collection,
            parent,
            bevel=0.01,
        )
    for suffix, z_offset in (("bottom", -height / 2.0), ("top", height / 2.0)):
        facade_box(
            f"{name}_frame_{suffix}",
            facade,
            horizontal,
            center_z + z_offset,
            width + 0.10,
            frame_width,
            0.085,
            0.070,
            frame,
            collection,
            parent,
            bevel=0.01,
        )
    mullion_count = 1 if door else max(1, round(width / 1.25) - 1)
    for index in range(mullion_count):
        fraction = (index + 1) / (mullion_count + 1)
        mullion_horizontal = horizontal - width / 2.0 + width * fraction
        facade_box(
            f"{name}_mullion_{index + 1:02d}",
            facade,
            mullion_horizontal,
            center_z,
            0.065,
            height,
            0.080,
            0.078,
            frame,
            collection,
            parent,
        )
    facade_box(
        f"{name}_transom",
        facade,
        horizontal,
        center_z + 0.72,
        width,
        0.060,
        0.080,
        0.078,
        frame,
        collection,
        parent,
    )
    if door:
        for side_index, h_offset in enumerate((-0.16, 0.16)):
            facade_box(
                f"{name}_handle_{side_index + 1:02d}",
                facade,
                horizontal + h_offset,
                1.55,
                0.035,
                0.42,
                0.055,
                0.175,
                frame,
                collection,
                parent,
                bevel=0.012,
            )
    return backing


def add_sconce(name, facade, horizontal, collection, parent, frame, light):
    facade_box(
        f"{name}_body",
        facade,
        horizontal,
        1.95,
        0.16,
        0.58,
        0.10,
        0.12,
        frame,
        collection,
        parent,
        bevel=0.025,
    )
    facade_box(
        f"{name}_light",
        facade,
        horizontal,
        1.95,
        0.065,
        0.34,
        0.045,
        0.225,
        light,
        collection,
        parent,
        bevel=0.012,
    )


def add_ground_seams(facade, width, boundaries, collection, parent, seam):
    for seam_index, z in enumerate((1.15, 2.30)):
        facade_box(
            f"residential_01_{facade}_ground_seam_horizontal_{seam_index + 1:02d}",
            facade,
            0.0,
            z,
            width,
            0.022,
            0.018,
            0.004,
            seam,
            collection,
            parent,
        )
    for boundary_index, horizontal in enumerate(boundaries):
        facade_box(
            f"residential_01_{facade}_ground_seam_vertical_{boundary_index + 1:02d}",
            facade,
            horizontal,
            1.72,
            0.022,
            3.20,
            0.018,
            0.004,
            seam,
            collection,
            parent,
        )


def rounded_rectangle_points(width, depth, radius, segments=10):
    half_width = width / 2.0
    half_depth = depth / 2.0
    corners = (
        ((half_width - radius, half_depth - radius), 0.0),
        ((-half_width + radius, half_depth - radius), math.pi / 2.0),
        ((-half_width + radius, -half_depth + radius), math.pi),
        ((half_width - radius, -half_depth + radius), 3.0 * math.pi / 2.0),
    )
    points = []
    for (center_x, center_y), start_angle in corners:
        for index in range(segments + 1):
            angle = start_angle + math.pi * 0.5 * index / segments
            points.append(
                (
                    center_x + radius * math.cos(angle),
                    center_y + radius * math.sin(angle),
                )
            )
    return points


def railing_curve(name, points, z, radius, material_value, collection, parent):
    curve_data = bpy.data.curves.new(f"{name}_curve", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 1
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = 2
    spline = curve_data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, (x, y) in zip(spline.points, points):
        point.co = (x, y, z, 1.0)
    spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve_data)
    collection.objects.link(obj)
    obj.data.materials.append(material_value)
    obj.parent = parent
    return obj


def add_terrace_railing(collection, parent, frame):
    width = 17.82
    depth = 13.32
    radius = 0.92
    outline = rounded_rectangle_points(width, depth, radius, segments=12)
    for suffix, z, rail_radius in (
        ("bottom", 12.43, 0.020),
        ("middle", 12.88, 0.018),
        ("top", 13.33, 0.027),
    ):
        railing_curve(
            f"residential_01_terrace_rail_{suffix}",
            outline,
            z,
            rail_radius,
            frame,
            collection,
            parent,
        )

    post_locations = set()
    straight_x_min = -width / 2.0 + radius
    straight_x_max = width / 2.0 - radius
    straight_y_min = -depth / 2.0 + radius
    straight_y_max = depth / 2.0 - radius
    x_count = math.ceil((straight_x_max - straight_x_min) / 0.46)
    y_count = math.ceil((straight_y_max - straight_y_min) / 0.46)
    for index in range(x_count + 1):
        x = straight_x_min + (straight_x_max - straight_x_min) * index / x_count
        post_locations.add((round(x, 4), round(-depth / 2.0, 4)))
        post_locations.add((round(x, 4), round(depth / 2.0, 4)))
    for index in range(y_count + 1):
        y = straight_y_min + (straight_y_max - straight_y_min) * index / y_count
        post_locations.add((round(-width / 2.0, 4), round(y, 4)))
        post_locations.add((round(width / 2.0, 4), round(y, 4)))
    for corner_x in (-width / 2.0 + radius, width / 2.0 - radius):
        for corner_y in (-depth / 2.0 + radius, depth / 2.0 - radius):
            x_sign = -1.0 if corner_x < 0.0 else 1.0
            y_sign = -1.0 if corner_y < 0.0 else 1.0
            base_angle = math.atan2(y_sign, x_sign)
            for offset_index in range(-3, 4):
                angle = base_angle + math.radians(offset_index * 12.5)
                x = corner_x + radius * math.cos(angle)
                y = corner_y + radius * math.sin(angle)
                if abs(x) <= width / 2.0 + 0.01 and abs(y) <= depth / 2.0 + 0.01:
                    post_locations.add((round(x, 4), round(y, 4)))
    for index, (x, y) in enumerate(sorted(post_locations)):
        post = cylinder(
            f"residential_01_terrace_post_{index + 1:03d}",
            0.024,
            0.88,
            (x, y, 12.88),
            frame,
            collection,
            parent,
            vertices=8,
        )
        post["railing_post"] = True


def remove_rejected_rooftop_box():
    obj = bpy.data.objects.get("residential_01_rooftop_service_box")
    if obj is None:
        return
    mesh = obj.data if obj.type == "MESH" else None
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh is not None and mesh.users == 0:
        bpy.data.meshes.remove(mesh)


def clear_target_collections(collections):
    for name in ("RESIDENTIAL_01_REPEATED", "RESIDENTIAL_01_TERRACE_DETAILS"):
        collection = collections[name]
        for obj in list(collection.objects):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and data.users == 0:
                if isinstance(data, bpy.types.Mesh):
                    bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Curve):
                    bpy.data.curves.remove(data)


def build_upper_architecture(collection, root, frame, glass):
    window_count = 0
    for facade, bays in (
        ("front", FRONT_REAR_BAYS),
        ("back", FRONT_REAR_BAYS),
        ("left", SIDE_BAYS),
        ("right", SIDE_BAYS),
    ):
        for floor_index, center_z in enumerate(FULL_FLOOR_Z):
            for bay_index, horizontal in enumerate(bays):
                window_unit(
                    f"residential_01_{facade}_floor_{floor_index + 1:02d}_window_{bay_index + 1:02d}",
                    facade,
                    horizontal,
                    center_z,
                    collection,
                    root,
                    frame,
                    glass,
                    juliet=False,
                )
                window_count += 1
    for facade, bays in (
        ("front", PENTHOUSE_FRONT_REAR_BAYS),
        ("back", PENTHOUSE_FRONT_REAR_BAYS),
        ("left", PENTHOUSE_SIDE_BAYS),
        ("right", PENTHOUSE_SIDE_BAYS),
    ):
        for bay_index, horizontal in enumerate(bays):
            window_unit(
                f"residential_01_{facade}_penthouse_window_{bay_index + 1:02d}",
                facade,
                horizontal,
                13.96,
                collection,
                root,
                frame,
                glass,
                penthouse=True,
                juliet=False,
            )
            window_count += 1
    return window_count


def build_ground_architecture(collection, root, frame, glass, seam, light):
    specs = {
        "front": ((-5.45, 4.15, False), (0.0, 2.85, True), (5.45, 4.15, False)),
        "back": tuple((center, 3.22, False) for center in FRONT_REAR_BAYS),
        "left": tuple((center, 3.18, False) for center in SIDE_BAYS),
        "right": tuple((center, 3.18, False) for center in SIDE_BAYS),
    }
    for facade, openings in specs.items():
        for index, (horizontal, width, door) in enumerate(openings):
            storefront_unit(
                f"residential_01_{facade}_ground_opening_{index + 1:02d}",
                facade,
                horizontal,
                width,
                collection,
                root,
                frame,
                glass,
                door=door,
            )

    # Horizontal seams stop before the rounded corners so they remain attached
    # to the flat cladding panels instead of floating across the corner void.
    add_ground_seams("front", 15.90, (-7.7, -3.4, 3.4, 7.7), collection, root, seam)
    add_ground_seams("back", 15.90, (-8.0, -4.3, 0.0, 4.3, 8.0), collection, root, seam)
    add_ground_seams("left", 11.40, (-6.0, -2.2, 2.2, 6.0), collection, root, seam)
    add_ground_seams("right", 11.40, (-6.0, -2.2, 2.2, 6.0), collection, root, seam)

    for facade, positions in {
        "front": (-2.45, 2.45),
        "back": (-4.30, 0.0, 4.30),
        "left": (-2.18, 2.18),
        "right": (-2.18, 2.18),
    }.items():
        for index, horizontal in enumerate(positions):
            add_sconce(
                f"residential_01_{facade}_sconce_{index + 1:02d}",
                facade,
                horizontal,
                collection,
                root,
                frame,
                light,
            )


def validate_primary_architecture(root):
    if root.get("authoring_stage") != "primary_architecture":
        raise RuntimeError("Residential root did not advance to primary architecture.")
    if bpy.data.objects.get("residential_01_rooftop_service_box") is not None:
        raise RuntimeError("Rejected rooftop service box still exists.")
    window_guards = [
        obj for obj in root.children_recursive if "_juliet_" in obj.name
    ]
    if window_guards:
        raise RuntimeError(
            f"Residential windows must have no mounted guards: {len(window_guards)} remain"
        )
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
    railing_posts = [obj for obj in root.children_recursive if obj.get("railing_post")]
    if len(upper_windows) != 56:
        raise RuntimeError(f"Residential upper-window contract changed: {len(upper_windows)}")
    if len(ground_openings) != 13:
        raise RuntimeError(f"Residential storefront contract changed: {len(ground_openings)}")
    if len(railing_posts) < 80:
        raise RuntimeError(f"Residential terrace railing is incomplete: {len(railing_posts)} posts")
    for facade, expected in {"front": 16, "back": 16, "left": 12, "right": 12}.items():
        actual = sum(obj.get("facade") == facade for obj in upper_windows)
        if actual != expected:
            raise RuntimeError(
                f"Residential {facade} upper-window count changed: {actual} != {expected}"
            )
    meshes = [obj for obj in root.children_recursive if obj.type == "MESH"]
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
        raise RuntimeError(f"Residential roof height changed: maximum Z={maximum_z:.3f}")
    return meshes, upper_windows, ground_openings, railing_posts


def main():
    blend_path = os.path.abspath(bpy.data.filepath)
    if blend_path != EXPECTED_SOURCE:
        raise RuntimeError(
            f"Open the canonical Residential 01 source before patching: {EXPECTED_SOURCE}"
        )
    root = bpy.data.objects.get(ROOT_NAME)
    if root is None:
        raise RuntimeError(f"Residential source is missing root: {ROOT_NAME}")
    if root.get("authoring_stage") != "proportion_blockout":
        raise RuntimeError(
            "Primary-architecture patch accepts only the approved proportion blockout."
        )
    if root.get("front_rear_bay_count") != 4 or root.get("side_bay_count") != 3:
        raise RuntimeError("Residential bay authority no longer matches the approval.")

    collections = {
        name: bpy.data.collections.get(name)
        for name in (
            "RESIDENTIAL_01_ARCHITECTURE",
            "RESIDENTIAL_01_REPEATED",
            "RESIDENTIAL_01_TERRACE_DETAILS",
        )
    }
    missing = [name for name, collection in collections.items() if collection is None]
    if missing:
        raise RuntimeError(f"Residential source is missing collections: {missing}")

    clear_target_collections(collections)
    remove_rejected_rooftop_box()
    frame = material("residential_frame_black")
    glass = material("residential_smoked_glass")
    seam = material("residential_cladding_seam")
    light = material("residential_light_warm")

    upper_count = build_upper_architecture(
        collections["RESIDENTIAL_01_REPEATED"], root, frame, glass
    )
    build_ground_architecture(
        collections["RESIDENTIAL_01_REPEATED"], root, frame, glass, seam, light
    )
    add_terrace_railing(collections["RESIDENTIAL_01_TERRACE_DETAILS"], root, frame)

    root["authoring_stage"] = "primary_architecture"
    root["blockout_approval"] = "approved 2026-08-29"
    root["rooftop_service_box"] = "removed by user direction"
    root["window_guards"] = "none by user direction"
    root["envelope_height_m"] = 15.72
    root["upper_window_count"] = upper_count
    root["ground_opening_count"] = 13
    root["next_gate"] = "surface materials and attached terrace details"

    meshes, upper_windows, ground_openings, railing_posts = validate_primary_architecture(
        root
    )
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    triangle_count = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangle_count += len(obj.data.loop_triangles)
    print(
        "Advanced Residential 01 to primary architecture: "
        f"{blend_path} ({len(upper_windows)} upper windows, "
        f"{len(ground_openings)} ground openings, {len(railing_posts)} railing posts, "
        f"{triangle_count} triangles)"
    )


if __name__ == "__main__":
    main()
