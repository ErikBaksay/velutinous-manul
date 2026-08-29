"""Bootstrap the editable Residential Building 01 Blender master.

Run from the repository root with Blender 5.1.1:

    blender --background --python tools/blender/author_residential_01.py

This first approval-gate scene contains the calibrated references, literal-
metric massing, roof silhouette, floor bands, and fixed review cameras.  The
bootstrap refuses to replace the editable source unless ``--force`` is passed.
Do not run it over a scene that has been edited manually in Blender.
"""

import math
import os
import sys

import bpy
from mathutils import Vector


OUTPUT_BLEND = "art/buildings/residential_01/residential_01.blend"
REFERENCE_DIR = "art/buildings/residential_01/references"
COMPOSITE_REFERENCE = "reference-composite.png"
ROOT_NAME = "residential_01_master"

ENVELOPE_WIDTH = 18.0
ENVELOPE_DEPTH = 13.5
ENVELOPE_HEIGHT = 15.72
CORNER_RADIUS = 1.0
PENTHOUSE_SETBACK = 1.1

# Coordinates are in the 1333 x 1180 source, with the origin at its top-left.
# The crops deliberately exclude the captions and most of the white gutters.
REFERENCE_CROPS = {
    "hero": (0, 0, 1333, 790),
    "front": (14, 819, 367, 320),
    "left": (392, 819, 273, 320),
    "right": (677, 819, 260, 320),
    "back": (949, 819, 363, 320),
}

PALETTE = {
    "residential_stucco": (0.82, 0.79, 0.74, 1.0),
    "residential_trim": (0.93, 0.90, 0.84, 1.0),
    "residential_ground_cladding": (0.105, 0.105, 0.098, 1.0),
    "residential_roof_surface": (0.30, 0.285, 0.26, 1.0),
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
    for camera in list(bpy.data.cameras):
        bpy.data.cameras.remove(camera)


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
    color = PALETTE[name]
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = 0.82
    if name == "residential_ground_cladding":
        principled.inputs["Roughness"].default_value = 0.46
    elif name == "residential_roof_surface":
        principled.inputs["Roughness"].default_value = 0.72
    return material


def materials():
    return {name: make_material(name) for name in PALETTE}


def cube(name, size, location, material, collection, parent, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel > 0.0:
        modifier = obj.modifiers.new("editable_edge_bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
    move_to_collection(obj, collection)
    obj.parent = parent
    return obj


def rounded_rectangle_points(width, depth, radius, segments=8):
    half_width = width / 2.0
    half_depth = depth / 2.0
    radius = min(radius, half_width, half_depth)
    corners = (
        ((half_width - radius, half_depth - radius), 0.0),
        ((-half_width + radius, half_depth - radius), math.pi / 2.0),
        ((-half_width + radius, -half_depth + radius), math.pi),
        ((half_width - radius, -half_depth + radius), 3.0 * math.pi / 2.0),
    )
    points = []
    for (center_x, center_y), start_angle in corners:
        for index in range(segments + 1):
            angle = start_angle + (math.pi / 2.0) * index / segments
            points.append(
                (
                    center_x + radius * math.cos(angle),
                    center_y + radius * math.sin(angle),
                )
            )
    return points


def rounded_prism(
    name,
    width,
    depth,
    z_min,
    z_max,
    radius,
    material,
    collection,
    parent,
    segments=8,
):
    outline = rounded_rectangle_points(width, depth, radius, segments)
    count = len(outline)
    vertices = [(x, y, z_min) for x, y in outline]
    vertices.extend((x, y, z_max) for x, y in outline)
    faces = [tuple(range(count))[::-1], tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = parent
    return obj


def crop_reference_images():
    composite_path = os.path.abspath(os.path.join(REFERENCE_DIR, COMPOSITE_REFERENCE))
    if not os.path.exists(composite_path):
        raise RuntimeError(f"Missing residential reference: {composite_path}")
    source = bpy.data.images.load(composite_path, check_existing=False)
    source_width, source_height = source.size
    if (source_width, source_height) != (1333, 1180):
        raise RuntimeError(
            "Residential reference dimensions changed: "
            f"expected 1333x1180, received {source_width}x{source_height}."
        )
    source_pixels = list(source.pixels[:])
    output_paths = {}
    for role, (left, top, width, height) in REFERENCE_CROPS.items():
        output_path = os.path.abspath(
            os.path.join(REFERENCE_DIR, f"reference-{role}.png")
        )
        output = bpy.data.images.new(
            f"residential_reference_crop_{role}",
            width=width,
            height=height,
            alpha=True,
            float_buffer=False,
        )
        bottom = source_height - top - height
        pixels = []
        for output_y in range(height):
            source_y = bottom + output_y
            start = (source_y * source_width + left) * 4
            end = start + width * 4
            pixels.extend(source_pixels[start:end])
        output.pixels[:] = pixels
        output.filepath_raw = output_path
        output.file_format = "PNG"
        output.save()
        output_paths[role] = output_path
        bpy.data.images.remove(output)
    bpy.data.images.remove(source)
    return output_paths


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_reference(collection, name, path, location, rotation, size, role):
    image = bpy.data.images.load(path, check_existing=True)
    image.pack()
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "IMAGE"
    empty.data = image
    empty.empty_display_size = size
    empty.location = location
    empty.rotation_euler = rotation
    empty.color[3] = 0.34
    empty.show_in_front = True
    empty.hide_render = True
    empty["reference_file"] = os.path.relpath(path, os.getcwd())
    empty["reference_role"] = role
    collection.objects.link(empty)
    return empty


def add_ortho_camera(collection, name, location, target, scale, role):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = scale
    data.lens = 55.0
    camera = bpy.data.objects.new(name, data)
    collection.objects.link(camera)
    camera.location = location
    point_at(camera, target)
    camera["review_role"] = role
    return camera


def add_perspective_camera(collection, name, location, target, role):
    data = bpy.data.cameras.new(name)
    data.type = "PERSP"
    data.lens = 54.0
    data.sensor_width = 36.0
    camera = bpy.data.objects.new(name, data)
    collection.objects.link(camera)
    camera.location = location
    point_at(camera, target)
    camera["review_role"] = role
    return camera


def build_blockout(collections, mats, root):
    architecture = collections["RESIDENTIAL_01_ARCHITECTURE"]
    stucco = mats["residential_stucco"]
    trim = mats["residential_trim"]
    dark = mats["residential_ground_cladding"]
    roof = mats["residential_roof_surface"]

    rounded_prism(
        "residential_01_ground_podium",
        ENVELOPE_WIDTH,
        ENVELOPE_DEPTH,
        0.0,
        3.48,
        CORNER_RADIUS,
        dark,
        architecture,
        root,
    )
    rounded_prism(
        "residential_01_upper_mass",
        ENVELOPE_WIDTH,
        ENVELOPE_DEPTH,
        3.42,
        12.18,
        CORNER_RADIUS,
        stucco,
        architecture,
        root,
    )

    # The slightly projecting belts define the reference's strong horizontal
    # rhythm and make the three full residential levels readable in blockout.
    band_specs = (
        ("ground_cornice", 3.36, 3.63, 18.12, 13.62),
        ("level_02_band", 6.26, 6.49, 18.10, 13.60),
        ("level_03_band", 9.14, 9.37, 18.10, 13.60),
        ("terrace_band", 12.04, 12.34, 18.16, 13.66),
    )
    for suffix, z_min, z_max, width, depth in band_specs:
        rounded_prism(
            f"residential_01_{suffix}",
            width,
            depth,
            z_min,
            z_max,
            CORNER_RADIUS + 0.05,
            trim,
            architecture,
            root,
        )

    penthouse_width = ENVELOPE_WIDTH - 2.0 * PENTHOUSE_SETBACK
    penthouse_depth = ENVELOPE_DEPTH - 2.0 * PENTHOUSE_SETBACK
    rounded_prism(
        "residential_01_penthouse_mass",
        penthouse_width,
        penthouse_depth,
        12.30,
        15.52,
        0.90,
        stucco,
        architecture,
        root,
    )
    rounded_prism(
        "residential_01_penthouse_roof_cornice",
        penthouse_width + 0.24,
        penthouse_depth + 0.24,
        15.42,
        15.72,
        0.96,
        trim,
        architecture,
        root,
    )
    rounded_prism(
        "residential_01_flat_roof",
        penthouse_width - 0.20,
        penthouse_depth - 0.20,
        15.51,
        15.61,
        0.82,
        roof,
        architecture,
        root,
    )


def setup_references(collections, paths):
    references = collections["REFERENCE_IMAGES"]
    add_reference(
        references,
        "residential_01_reference_front",
        paths["front"],
        (0.0, -ENVELOPE_DEPTH / 2.0 - 0.04, ENVELOPE_HEIGHT / 2.0),
        (math.pi / 2.0, 0.0, 0.0),
        ENVELOPE_WIDTH,
        "front",
    )
    add_reference(
        references,
        "residential_01_reference_back",
        paths["back"],
        (0.0, ENVELOPE_DEPTH / 2.0 + 0.04, ENVELOPE_HEIGHT / 2.0),
        (-math.pi / 2.0, 0.0, math.pi),
        ENVELOPE_WIDTH,
        "back",
    )
    add_reference(
        references,
        "residential_01_reference_left",
        paths["left"],
        (-ENVELOPE_WIDTH / 2.0 - 0.04, 0.0, ENVELOPE_HEIGHT / 2.0),
        (math.pi / 2.0, 0.0, -math.pi / 2.0),
        ENVELOPE_DEPTH,
        "left",
    )
    add_reference(
        references,
        "residential_01_reference_right",
        paths["right"],
        (ENVELOPE_WIDTH / 2.0 + 0.04, 0.0, ENVELOPE_HEIGHT / 2.0),
        (math.pi / 2.0, 0.0, math.pi / 2.0),
        ENVELOPE_DEPTH,
        "right",
    )
    add_reference(
        references,
        "residential_01_reference_hero",
        paths["hero"],
        (21.0, -22.0, 14.0),
        (math.radians(67.0), 0.0, math.radians(43.0)),
        17.0,
        "hero",
    )
    # Reference planes are packed into the .blend and ready for drafting, but
    # hidden by default so the clean blockout is the first viewport read.
    references.hide_viewport = True


def setup_review_cameras(collections):
    cameras = collections["REVIEW_CAMERAS"]
    elevation_target = (0.0, 0.0, 8.15)
    add_perspective_camera(
        cameras,
        "residential_01_review_hero",
        (31.0, -35.0, 18.0),
        (0.0, 0.0, 7.45),
        "hero",
    )
    add_ortho_camera(
        cameras,
        "residential_01_review_front",
        (0.0, -34.0, 8.15),
        elevation_target,
        18.4,
        "front",
    )
    add_ortho_camera(
        cameras,
        "residential_01_review_back",
        (0.0, 34.0, 8.15),
        elevation_target,
        18.4,
        "back",
    )
    add_ortho_camera(
        cameras,
        "residential_01_review_left",
        (-30.0, 0.0, 8.15),
        elevation_target,
        18.4,
        "left",
    )
    add_ortho_camera(
        cameras,
        "residential_01_review_right",
        (30.0, 0.0, 8.15),
        elevation_target,
        18.4,
        "right",
    )
    add_ortho_camera(
        cameras,
        "residential_01_review_top",
        (0.0, 0.0, 40.0),
        (0.0, 0.0, 0.0),
        21.0,
        "top",
    )


def mesh_bounds(root):
    meshes = [obj for obj in root.children_recursive if obj.type == "MESH"]
    coordinates = [
        obj.matrix_world @ vertex.co
        for obj in meshes
        for vertex in obj.data.vertices
    ]
    minimum = Vector(
        (
            min(coordinate.x for coordinate in coordinates),
            min(coordinate.y for coordinate in coordinates),
            min(coordinate.z for coordinate in coordinates),
        )
    )
    maximum = Vector(
        (
            max(coordinate.x for coordinate in coordinates),
            max(coordinate.y for coordinate in coordinates),
            max(coordinate.z for coordinate in coordinates),
        )
    )
    return meshes, minimum, maximum


def validate_scene(root):
    if root.name != ROOT_NAME:
        raise RuntimeError(f"Unexpected residential root: {root.name}")
    scene = bpy.context.scene
    if scene.unit_settings.system != "METRIC" or scene.unit_settings.scale_length != 1.0:
        raise RuntimeError("Residential master must use literal metric units.")
    meshes, minimum, maximum = mesh_bounds(root)
    if not meshes:
        raise RuntimeError("Residential master contains no mesh geometry.")
    if abs(minimum.z) > 0.002:
        raise RuntimeError(f"Residential master is not grounded: minimum Z={minimum.z:.5f}")
    if not 15.69 <= maximum.z <= 15.75:
        raise RuntimeError(f"Residential envelope height changed: maximum Z={maximum.z:.3f}")
    if minimum.x < -9.10 or maximum.x > 9.10:
        raise RuntimeError(f"Residential width exceeds blockout envelope: {minimum.x:.3f}..{maximum.x:.3f}")
    if minimum.y < -6.85 or maximum.y > 6.85:
        raise RuntimeError(f"Residential depth exceeds blockout envelope: {minimum.y:.3f}..{maximum.y:.3f}")
    required_collections = {
        "RESIDENTIAL_01_ARCHITECTURE",
        "RESIDENTIAL_01_REPEATED",
        "RESIDENTIAL_01_TERRACE_DETAILS",
        "REFERENCE_IMAGES",
        "REVIEW_CAMERAS",
    }
    missing_collections = required_collections - set(bpy.data.collections.keys())
    if missing_collections:
        raise RuntimeError(
            f"Residential scene is missing collections: {sorted(missing_collections)}"
        )
    required_cameras = {
        f"residential_01_review_{role}"
        for role in ("hero", "front", "back", "left", "right", "top")
    }
    missing_cameras = required_cameras - set(bpy.data.objects.keys())
    if missing_cameras:
        raise RuntimeError(f"Residential scene is missing cameras: {sorted(missing_cameras)}")
    for role in ("hero", "front", "back", "left", "right"):
        image = bpy.data.images.get(f"reference-{role}.png")
        if image is None or image.packed_file is None:
            raise RuntimeError(f"Residential reference is not packed: {role}")
    if root.get("front_rear_bay_count") != 4 or root.get("side_bay_count") != 3:
        raise RuntimeError("Residential labeled-elevation bay authority changed.")


def configure_scene():
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.look = "AgX - Medium High Contrast"


def build_scene():
    clear_scene()
    configure_scene()
    crop_paths = crop_reference_images()
    collections = {
        name: make_collection(name)
        for name in (
            "RESIDENTIAL_01_ARCHITECTURE",
            "RESIDENTIAL_01_REPEATED",
            "RESIDENTIAL_01_TERRACE_DETAILS",
            "REFERENCE_IMAGES",
            "REVIEW_CAMERAS",
        )
    }
    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.60
    collections["RESIDENTIAL_01_ARCHITECTURE"].objects.link(root)
    root["authoring_stage"] = "proportion_blockout"
    root["source_of_truth"] = "editable Blender exterior master"
    root["forward_axis"] = "-Y"
    root["up_axis"] = "+Z"
    root["authoring_scale"] = "literal_metric"
    root["envelope_width_m"] = ENVELOPE_WIDTH
    root["envelope_depth_m"] = ENVELOPE_DEPTH
    root["envelope_height_m"] = ENVELOPE_HEIGHT
    root["corner_radius_m"] = CORNER_RADIUS
    root["penthouse_setback_m"] = PENTHOUSE_SETBACK
    root["front_rear_bay_count"] = 4
    root["side_bay_count"] = 3
    root["bay_authority"] = "labeled elevations override hero"
    root["interior_scope"] = "closed exterior only"
    root["asset_extent"] = "building and attached details only"
    root["unseen_roof_scope"] = "conservative flat roof reconstruction"

    mats = materials()
    build_blockout(collections, mats, root)
    setup_references(collections, crop_paths)
    setup_review_cameras(collections)
    validate_scene(root)
    return root


def main():
    args = parse_args()
    blend_path = os.path.abspath(OUTPUT_BLEND)
    if os.path.exists(blend_path) and not args["force"]:
        raise RuntimeError(
            f"Refusing to replace existing residential source: {blend_path}. "
            "Pass --force only while intentionally rebuilding the approved bootstrap."
        )
    root = build_scene()
    os.makedirs(os.path.dirname(blend_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    meshes, minimum, maximum = mesh_bounds(root)
    triangle_count = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangle_count += len(obj.data.loop_triangles)
    print(
        "Saved Residential 01 proportion blockout: "
        f"{blend_path} ({maximum.x - minimum.x:.2f} x "
        f"{maximum.y - minimum.y:.2f} x {maximum.z - minimum.z:.2f} m, "
        f"{triangle_count} triangles)"
    )
    return root


if __name__ == "__main__":
    main()
