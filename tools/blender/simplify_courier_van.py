"""Create an aggressively simplified, Blender-first courier van source.

This is a targeted migration for the existing authored scene. It does not run
``author_courier_van.py``. Instead, it replaces the Boolean-heavy body with a
small, deterministic loft cage, rebuilds the wheels from clean low-segment
primitives, preserves the root/marker contract, and saves a new Blender file.

Run from the repository root with Blender 5.x:

    blender --background art/vehicles/courier_van.blend \
      --python tools/blender/simplify_courier_van.py -- \
      --output art/vehicles/courier_van.blend
"""

import argparse
import math
import os
import sys

import bpy


ROOT_NAME = "courier_van_lod0"
BODY_NAME = "van_body_shell"

WHEEL_SPECS = {
    "van_wheel_front_left": (-2.08, -1.00),
    "van_wheel_front_right": (-2.08, 1.00),
    "van_wheel_rear_left": (1.74, -1.00),
    "van_wheel_rear_right": (1.74, 1.00),
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default="art/vehicles/courier_van.blend",
        help="Destination for the simplified Blender source.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow replacing an existing source file. Required for in-place migration.",
    )
    return parser.parse_known_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )[0]


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def triangle_count(obj):
    return sum(max(1, len(polygon.vertices) - 2) for polygon in obj.data.polygons)


def window_lower(x):
    points = [
        (-3.03, 1.23),
        (-2.78, 1.27),
        (-2.36, 1.31),
        (-2.04, 1.35),
        (-1.76, 1.40),
        (-1.58, 1.56),
        (-1.44, 1.83),
        (-1.36, 2.07),
        (-1.28, 2.085),
    ]
    if x <= points[0][0]:
        return points[0][1]
    if x >= points[-1][0]:
        return points[-1][1]
    for (x0, z0), (x1, z1) in zip(points, points[1:]):
        if x0 <= x <= x1:
            amount = (x - x0) / (x1 - x0)
            return z0 + (z1 - z0) * amount
    return points[-1][1]


def simplify_body():
    body = bpy.data.objects.get(BODY_NAME)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Missing mesh: {BODY_NAME}")

    before = triangle_count(body)

    # Cross-sections retain the approved broad proportions but deliberately
    # omit lights, seams, mirrors, handles, vents, and Boolean residue. Extra
    # stations around each axle lift the side sill into a coarse wheel arch.
    # Tuple: X, half width, lower Z, shoulder Z, roof Z, upper half width.
    sections = [
        (-3.03, 0.93, 0.30, 0.82, 1.24, 1.08),
        (-2.75, 1.03, 0.35, 1.11, 1.95, 1.10),
        (-2.60, 1.06, 0.35, 1.20, 2.10, 1.08),
        (-2.44, 1.08, 0.35, 1.27, 2.18, 1.09),
        (-2.08, 1.10, 0.35, 1.34, 2.27, 1.10),
        (-1.72, 1.10, 0.35, 1.35, 2.28, 1.10),
        (-1.56, 1.10, 0.35, 1.36, 2.28, 1.10),
        (-1.28, 1.10, 0.35, 1.38, 2.27, 1.10),
        (0.00, 1.10, 0.35, 1.39, 2.28, 1.10),
        (1.18, 1.10, 0.35, 1.39, 2.28, 1.10),
        (1.38, 1.10, 0.35, 1.39, 2.28, 1.10),
        (1.74, 1.10, 0.35, 1.39, 2.28, 1.10),
        (2.10, 1.10, 0.35, 1.39, 2.28, 1.10),
        (2.30, 1.10, 0.35, 1.39, 2.28, 1.10),
        (2.62, 1.09, 0.37, 1.37, 2.27, 1.09),
        (2.88, 1.06, 0.33, 1.32, 2.24, 1.05),
        (3.03, 0.97, 0.34, 1.28, 2.18, 0.97),
    ]

    def arch_floor(x, lower):
        height = lower
        for axle in (-2.08, 1.74):
            distance = abs(x - axle)
            if distance < 0.54:
                amount = math.sqrt(max(0.0, 1.0 - (distance / 0.54) ** 2))
                height = max(height, lower + (1.04 - lower) * amount)
        return height

    def ring(section):
        x, half_width, lower, shoulder, roof, upper_width = section
        corner = min(0.15, half_width * 0.15)
        upper_corner = min(0.15, upper_width * 0.15)
        side_floor = arch_floor(x, lower)
        belt = min(roof - 0.05, window_lower(x) if x < -1.28 else 2.08)
        return [
            (x, 0.0, lower),
            (x, half_width - corner, side_floor),
            (x, half_width, side_floor + corner),
            (x, half_width, max(side_floor + corner, 0.61)),
            (x, half_width, shoulder),
            (x, upper_width, belt),
            (x, upper_width, roof - upper_corner),
            (x, upper_width - upper_corner, roof),
            (x, 0.0, roof + 0.02),
            (x, -upper_width + upper_corner, roof),
            (x, -upper_width, roof - upper_corner),
            (x, -upper_width, belt),
            (x, -half_width, shoulder),
            (x, -half_width, max(side_floor + corner, 0.61)),
            (x, -half_width, side_floor + corner),
            (x, -half_width + corner, side_floor),
        ]

    rings = [ring(section) for section in sections]
    ring_size = len(rings[0])
    vertices = [vertex for section_ring in rings for vertex in section_ring]
    faces = []
    for section_index in range(len(rings) - 1):
        current = section_index * ring_size
        following = (section_index + 1) * ring_size
        for ring_index in range(ring_size):
            next_index = (ring_index + 1) % ring_size
            faces.append(
                (
                    current + ring_index,
                    following + ring_index,
                    following + next_index,
                    current + next_index,
                )
            )

    # End caps use small triangle fans. Most of the editable body remains a
    # regular longitudinal quad cage, while the cap fans keep it watertight.
    for section_index, reverse in ((0, True), (len(rings) - 1, False)):
        section_ring = rings[section_index]
        center_index = len(vertices)
        center_z = sum(vertex[2] for vertex in section_ring) / ring_size
        vertices.append((section_ring[0][0], 0.0, center_z))
        offset = section_index * ring_size
        for ring_index in range(ring_size):
            next_index = (ring_index + 1) % ring_size
            face = (center_index, offset + ring_index, offset + next_index)
            faces.append(tuple(reversed(face)) if reverse else face)

    old_mesh = body.data
    new_mesh = bpy.data.meshes.new(BODY_NAME)
    new_mesh.from_pydata(vertices, [], faces)
    new_mesh.update(calc_edges=True)
    body.data = new_mesh
    if old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    body.name = BODY_NAME
    body.data.name = BODY_NAME

    material_names = ("van_body_pearl", "van_lower_graphite", "van_glass_black")
    body.data.materials.clear()
    for name in material_names:
        material = bpy.data.materials.get(name)
        if material is None:
            raise RuntimeError(f"Missing required material: {name}")
        body.data.materials.append(material)

    # Assign only the three broad editable regions. Fine lamps, seams, sensors,
    # mirrors, handles, and vents intentionally disappear in this low-poly base.
    for polygon in body.data.polygons:
        center = polygon.center
        if center.z <= 0.61:
            polygon.material_index = 1
        elif center.z >= 2.08 or (
            center.x < -1.28 and center.z >= window_lower(center.x) - 0.015
        ):
            polygon.material_index = 2
        else:
            polygon.material_index = 0
        polygon.use_smooth = False

    body["authoring_mode"] = "blender_first_low_poly"
    body["pre_simplification_triangles"] = before
    body["coarse_body_sections"] = len(sections)
    body.data.validate(verbose=True, clean_customdata=True)
    body.data.update(calc_edges=True)
    print(
        f"Simplified {BODY_NAME}: {before} -> {triangle_count(body)} triangles, "
        f"{len(body.data.vertices)} vertices, {len(body.data.polygons)} faces"
    )
    return body


def apply_rotation(obj):
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def rebuild_wheel(name, x, y, root):
    old = bpy.data.objects.get(name)
    if old is not None:
        old_mesh = old.data if old.type == "MESH" else None
        bpy.data.objects.remove(old, do_unlink=True)
        if old_mesh is not None and old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)

    tire_material = bpy.data.materials.get("van_tire_rubber")
    wheel_material = bpy.data.materials.get("van_wheel_graphite")
    if tire_material is None or wheel_material is None:
        raise RuntimeError("Missing wheel materials.")

    bpy.ops.mesh.primitive_torus_add(
        major_segments=12,
        minor_segments=6,
        major_radius=0.385,
        minor_radius=0.115,
        location=(x, y, 0.50),
        rotation=(math.pi / 2.0, 0.0, 0.0),
    )
    tire = bpy.context.object
    tire.name = f"{name}_tire"
    tire.data.materials.append(tire_material)
    for polygon in tire.data.polygons:
        polygon.use_smooth = False
    apply_rotation(tire)

    side = -1 if y < 0 else 1
    parts = [tire]
    for suffix, vertices, radius, depth, offset in (
        ("disc", 12, 0.325, 0.105, 0.070),
        ("hub", 8, 0.095, 0.135, 0.110),
    ):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=vertices,
            radius=radius,
            depth=depth,
            location=(x, y + side * offset, 0.50),
            rotation=(math.pi / 2.0, 0.0, 0.0),
        )
        part = bpy.context.object
        part.name = f"{name}_{suffix}"
        part.data.materials.append(wheel_material)
        for polygon in part.data.polygons:
            polygon.use_smooth = False
        apply_rotation(part)
        parts.append(part)

    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = tire
    bpy.ops.object.join()
    tire.name = name
    tire.data.name = name
    tire.parent = root
    tire.data.validate(verbose=True, clean_customdata=True)
    tire.data.update(calc_edges=True)
    print(
        f"Rebuilt {name}: {triangle_count(tire)} triangles, "
        f"{len(tire.data.vertices)} vertices"
    )
    return tire


def simplify_interior():
    interior = bpy.data.objects.get("van_interior_occluder")
    if interior is None or interior.type != "MESH":
        return
    activate(interior)
    modifier = interior.modifiers.new("low_poly_planar_dissolve", "DECIMATE")
    modifier.decimate_type = "DISSOLVE"
    modifier.angle_limit = math.radians(45.0)
    modifier.use_dissolve_boundaries = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in interior.data.polygons:
        polygon.use_smooth = False
    interior.data.validate(verbose=True, clean_customdata=True)
    interior.data.update(calc_edges=True)


def main():
    args = parse_args()
    root = bpy.data.objects.get(ROOT_NAME)
    if root is None:
        raise RuntimeError(f"Missing root: {ROOT_NAME}")

    output = os.path.abspath(args.output)
    current = os.path.abspath(bpy.data.filepath) if bpy.data.filepath else None
    if current and output == current and not args.force:
        raise RuntimeError(
            f"Refusing to overwrite the opened Blender source: {output}. "
            "Use --force only for an intentional migration, or choose a separate --output file."
        )

    simplify_body()
    simplify_interior()
    for name, (x, y) in WHEEL_SPECS.items():
        rebuild_wheel(name, x, y, root)

    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=output, check_existing=False)
    print(f"Saved Blender-first low-poly source: {output}")


if __name__ == "__main__":
    main()
