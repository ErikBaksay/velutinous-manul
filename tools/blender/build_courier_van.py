"""Validate and export the authored courier van Blender scene.

The production source is ``art/vehicles/courier_van.blend``. Geometry is
authored in Blender (see ``author_courier_van.py``); this script deliberately
does not rebuild or mutate the model. It only checks the asset contract,
exports a self-contained GLB, and validates a clean GLB re-import.
"""

import argparse
import os
import sys

import bpy
from mathutils import Vector


ROOT_NAME = "courier_van_lod0"
DEFAULT_BLEND = "art/vehicles/courier_van.blend"
DEFAULT_GLB = "public/assets/vehicles/courier_van.glb"
TRIANGLE_MINIMUM = 1_000
TRIANGLE_CEILING = 80_000

EXPECTED_MARKERS = {
    "van_body_shell",
    "van_glass_canopy",
    "van_lower_trim",
    "van_door_cab_left",
    "van_door_cab_right",
    "van_door_cargo_left",
    "van_door_rear",
    "van_lights_front",
    "van_lights_rear",
    "van_lights_side_markers",
    "van_mirror_sensor_left",
    "van_mirror_sensor_right",
    "van_wheel_front_left",
    "van_wheel_front_right",
    "van_wheel_rear_left",
    "van_wheel_rear_right",
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", default=DEFAULT_BLEND, help="Authored Blender source scene.")
    parser.add_argument("--output", default=DEFAULT_GLB, help="Runtime GLB destination.")
    return parser.parse_known_args(
        sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    )[0]


def root_children(root):
    return list(root.children_recursive)


def mesh_world_bounds(root):
    points = []
    for obj in root_children(root):
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
    if not points:
        raise RuntimeError("Courier van contains no mesh geometry.")
    return (
        Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points))),
        Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points))),
    )


def triangle_count(root):
    return sum(
        max(1, len(polygon.vertices) - 2)
        for obj in root_children(root)
        if obj.type == "MESH"
        for polygon in obj.data.polygons
    )


def mesh_component_materials(obj):
    """Return the material names used by each connected mesh component."""
    parents = list(range(len(obj.data.vertices)))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left, right):
        left_root = find(left)
        right_root = find(right)
        if left_root != right_root:
            parents[right_root] = left_root

    for edge in obj.data.edges:
        union(edge.vertices[0], edge.vertices[1])

    components = {}
    for polygon in obj.data.polygons:
        root = find(polygon.vertices[0])
        material = obj.data.materials[polygon.material_index]
        components.setdefault(root, set()).add(material.name if material else "<none>")
    return list(components.values())


def validate_model(root, imported=False):
    if root.name != ROOT_NAME:
        raise RuntimeError(f"Unexpected courier van root: {root.name}")

    children = root_children(root)
    names = {obj.name for obj in children}
    missing = sorted(EXPECTED_MARKERS - names)
    if missing:
        raise RuntimeError(f"Courier van is missing stable parts or markers: {missing}")
    if len(names) != len(children):
        raise RuntimeError("Courier van contains duplicate child names.")

    body = bpy.data.objects.get("van_body_shell")
    if body is None or body.type != "MESH":
        raise RuntimeError("van_body_shell must be the authored exterior mesh.")
    body_materials = {material.name for material in body.data.materials if material is not None}
    required_materials = {
        "van_body_pearl",
        "van_glass_black",
        "van_lower_graphite",
    }
    def has_material(material_name):
        return any(
            name == material_name or name.startswith(f"{material_name}.")
            for name in body_materials
        )

    if not all(has_material(material_name) for material_name in required_materials):
        raise RuntimeError(
            f"Body shell is missing material regions: "
            f"{sorted(material_name for material_name in required_materials if not has_material(material_name))}"
        )

    if has_material("van_cab_black_paint"):
        raise RuntimeError(
            "Legacy van_cab_black_paint remains; the cabin and roof must use "
            "the single van_glass_black canopy material."
        )

    used_body_materials = {
        body.data.materials[polygon.material_index].name
        for polygon in body.data.polygons
        if polygon.material_index < len(body.data.materials)
        and body.data.materials[polygon.material_index] is not None
    }
    if not all(
        any(name == material_name or name.startswith(f"{material_name}.") for name in used_body_materials)
        for material_name in required_materials
    ):
        raise RuntimeError("van_body_shell does not use all required face-level material regions.")
    # The Blender-first low-poly source deliberately omits fine exterior
    # details. Its body must remain one contiguous cage while those details
    # are progressively modelled back in. glTF splits material primitives, so
    # source connectivity is checked only before export.
    if not imported and len(mesh_component_materials(body)) != 1:
        raise RuntimeError("van_body_shell must remain one contiguous editable mesh.")

    legacy_overlay_prefixes = (
        "body_side_",
        "body_front_",
        "body_rear_",
        "body_roof_",
        "body_cab_",
        "body_glass_",
    )
    legacy_overlays = sorted(
        obj.name
        for obj in children
        if obj.type == "MESH" and obj.name.startswith(legacy_overlay_prefixes)
    )
    if legacy_overlays:
        raise RuntimeError(f"Broad legacy body overlays remain separate from van_body_shell: {legacy_overlays}")

    for marker_name in (
        "van_glass_canopy",
        "van_lower_trim",
        "van_door_cargo_left",
        "van_door_rear",
        "van_lights_front",
        "van_lights_rear",
        "van_lights_side_markers",
        "van_mirror_sensor_left",
        "van_mirror_sensor_right",
        "van_sensor_front",
        "van_sensor_rear",
        "van_door_handles",
    ):
        marker = bpy.data.objects.get(marker_name)
        if marker is None or marker.type != "EMPTY":
            raise RuntimeError(f"Integrated compatibility marker must be an EMPTY: {marker_name}")

    if not imported:
        # Marker metadata documents the authored source contract.  The GLB
        # exporter intentionally omits Blender custom properties, so the clean
        # re-import is validated through marker identity and shell materials.
        body_paint = bpy.data.materials.get("van_body_pearl")
        canopy_paint = bpy.data.materials.get("van_glass_black")
        body_principled = body_paint.node_tree.nodes.get("Principled BSDF") if body_paint else None
        canopy_principled = canopy_paint.node_tree.nodes.get("Principled BSDF") if canopy_paint else None
        if body_principled is None or canopy_principled is None:
            raise RuntimeError("Body and canopy materials must use Principled BSDF nodes.")
        canopy_metallic = canopy_principled.inputs["Metallic"].default_value
        if abs(canopy_metallic) > 1e-5:
            raise RuntimeError("van_glass_black must remain an opaque dielectric, not metallic paint.")
        canopy_marker = bpy.data.objects["van_glass_canopy"]
        if canopy_marker.get("integrated_into") != "van_body_shell":
            raise RuntimeError("van_glass_canopy must remain integrated into van_body_shell.")
        if canopy_marker.get("material") != "van_glass_black":
            raise RuntimeError("van_glass_canopy must identify van_glass_black as its sole material.")
        for marker_name in (
            "van_lights_front",
            "van_lights_rear",
            "van_lights_side_markers",
            "van_mirror_sensor_left",
            "van_mirror_sensor_right",
            "van_sensor_front",
            "van_sensor_rear",
            "van_door_handles",
        ):
            marker = bpy.data.objects[marker_name]
            if marker.get("integrated_into") != "van_body_shell":
                raise RuntimeError(f"{marker_name} must identify van_body_shell as its integrated mesh.")

    minimum, maximum = mesh_world_bounds(root)
    dimensions = maximum - minimum
    if not 5.50 <= dimensions.x <= 6.60:
        raise RuntimeError(f"Courier van length is outside the reference envelope: {dimensions.x:.3f} m")
    # The authored body is 2.23 m wide; mirrors and side markers extend the
    # complete asset envelope beyond the body reference width.
    if not 2.00 <= dimensions.y <= 2.80:
        raise RuntimeError(f"Courier van width is outside the reference envelope: {dimensions.y:.3f} m")
    if not 2.15 <= dimensions.z <= 2.55:
        raise RuntimeError(f"Courier van height is outside the reference envelope: {dimensions.z:.3f} m")
    if abs(minimum.z) > 0.005:
        raise RuntimeError(f"Courier van is not grounded: minimum Z={minimum.z:.5f}")
    if maximum.x <= 2.75 or minimum.x >= -2.75:
        raise RuntimeError("Courier van front/rear orientation is invalid.")

    wheel_positions = {
        "van_wheel_front_left": (-2.08, -1.00),
        "van_wheel_front_right": (-2.08, 1.00),
        "van_wheel_rear_left": (1.74, -1.00),
        "van_wheel_rear_right": (1.74, 1.00),
    }
    for name, (expected_x, expected_y) in wheel_positions.items():
        wheel = bpy.data.objects.get(name)
        if wheel is None:
            raise RuntimeError(f"Missing wheel {name}.")
        center = wheel.matrix_world.translation
        if abs(center.x - expected_x) > 0.20 or abs(center.y - expected_y) > 0.20:
            raise RuntimeError(f"Wheel position drifted for {name}: {tuple(center)}")

    for obj in children:
        if obj.type == "MESH" and any(abs(value - 1.0) > 1e-5 for value in obj.scale):
            raise RuntimeError(f"Unapplied scale on {obj.name}: {tuple(obj.scale)}")
        if obj.type == "MESH" and not obj.data.materials:
            raise RuntimeError(f"Mesh has no material: {obj.name}")

    triangles = triangle_count(root)
    if not imported and not TRIANGLE_MINIMUM <= triangles <= TRIANGLE_CEILING:
        raise RuntimeError(
            f"Courier van triangle count is outside {TRIANGLE_MINIMUM}..{TRIANGLE_CEILING}: {triangles}"
        )
    print(
        f"Validated {'imported ' if imported else ''}{ROOT_NAME}: {triangles} triangles, "
        f"bounds X[{minimum.x:.3f},{maximum.x:.3f}] "
        f"Y[{minimum.y:.3f},{maximum.y:.3f}] Z[{minimum.z:.3f},{maximum.z:.3f}]"
    )
    return dimensions, triangles


def export_glb(path, root):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in root_children(root):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
    )


def validate_export(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=path)
    imported_root = bpy.data.objects.get(ROOT_NAME)
    if imported_root is None:
        raise RuntimeError(f"Re-imported GLB does not contain {ROOT_NAME}.")
    validate_model(imported_root, imported=True)


def main():
    args = parse_args()
    source_path = os.path.abspath(args.blend)
    if not bpy.data.filepath or os.path.abspath(bpy.data.filepath) != source_path:
        bpy.ops.wm.open_mainfile(filepath=source_path)
    root = bpy.data.objects.get(ROOT_NAME)
    if root is None:
        raise RuntimeError(
            f"Authored scene does not contain {ROOT_NAME}. Run author_courier_van.py first."
        )
    validate_model(root)
    export_path = os.path.abspath(args.output)
    export_glb(export_path, root)
    validate_export(export_path)


if __name__ == "__main__":
    main()
