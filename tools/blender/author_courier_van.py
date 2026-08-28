"""Author the Blender source scene for the panoramic courier van.

Run from the repository root with Blender 5.x:

    blender --background --python tools/blender/author_courier_van.py

This is the one-time/rebuild authoring helper. After the scene is saved,
``build_courier_van.py`` is the only script used for export and validation.
"""

import math
import os
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


ROOT_NAME = "courier_van_lod0"
OUTPUT_BLEND = "art/vehicles/courier_van.blend"
REFERENCE_DIR = "art/vehicles/references"

FRONT_AXLE_X = -2.08
REAR_AXLE_X = 1.74
CAB_END_X = -1.28
WHEEL_RADIUS = 0.50
# The torus outer radius is 0.50 m; this keeps the tire exactly on the
# ground plane instead of letting the rounded profile dip below it.
WHEEL_CENTER_Z = 0.50

PALETTE = {
    # Blender node colors are linear values; this keeps the pearl body a
    # medium silver-gray in the review renders instead of washing to white.
    "van_body_pearl": (0.24, 0.22, 0.20, 1.0),
    "van_glass_black": (0.008, 0.012, 0.014, 1.0),
    "van_lower_graphite": (0.024, 0.028, 0.029, 1.0),
    "van_tire_rubber": (0.010, 0.011, 0.011, 1.0),
    "van_wheel_graphite": (0.055, 0.060, 0.058, 1.0),
    "van_led_white": (0.92, 0.98, 0.95, 1.0),
    "van_marker_amber": (0.95, 0.24, 0.015, 1.0),
    "van_light_red": (0.40, 0.004, 0.002, 1.0),
    "van_sensor_black": (0.006, 0.007, 0.007, 1.0),
    "van_interior_occluder": (0.003, 0.004, 0.004, 1.0),
}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)


def make_material(name):
    material = bpy.data.materials.new(name)
    color = PALETTE[name]
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = 0.42
    if name == "van_body_pearl":
        # Satin automotive paint: broad, restrained highlights without the
        # wet/plastic response that made every triangulated panel visible.
        principled.inputs["Metallic"].default_value = 0.03
        principled.inputs["Roughness"].default_value = 0.42
        if principled.inputs.get("Coat Weight"):
            principled.inputs["Coat Weight"].default_value = 0.18
            principled.inputs["Coat Roughness"].default_value = 0.22
    elif name == "van_glass_black":
        # The canopy is deliberately opaque: glass, pillars, surround, and
        # panoramic roof are represented by one continuous glossy material.
        principled.inputs["Metallic"].default_value = 0.0
        principled.inputs["Roughness"].default_value = 0.30
        if principled.inputs.get("Coat Weight"):
            principled.inputs["Coat Weight"].default_value = 0.04
            principled.inputs["Coat Roughness"].default_value = 0.20
        if principled.inputs.get("Specular IOR Level"):
            principled.inputs["Specular IOR Level"].default_value = 0.12
    elif name == "van_lower_graphite":
        principled.inputs["Metallic"].default_value = 0.35
        principled.inputs["Roughness"].default_value = 0.38
    elif name == "van_wheel_graphite":
        principled.inputs["Metallic"].default_value = 0.52
        principled.inputs["Roughness"].default_value = 0.30
    elif name in {"van_tire_rubber", "van_sensor_black", "van_interior_occluder"}:
        principled.inputs["Roughness"].default_value = 0.82
    elif name in {"van_led_white", "van_marker_amber", "van_light_red"}:
        principled.inputs["Roughness"].default_value = 0.24
        if principled.inputs.get("Emission Color"):
            principled.inputs["Emission Color"].default_value = color
            principled.inputs["Emission Strength"].default_value = 0.05
    return material


def materials():
    return {name: make_material(name) for name in PALETTE}


def apply_bevel(obj, width=0.0, segments=2):
    if width <= 0:
        return obj
    modifier = obj.modifiers.new("author_bevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    return obj


def cube(name, size, location, material, bevel=0.0, segments=2):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    apply_bevel(obj, bevel, segments)
    return obj


def prism_yz(name, points, x, depth, material, bevel=0.0):
    vertices = [(x - depth / 2, y, z) for y, z in points]
    vertices += [(x + depth / 2, y, z) for y, z in points]
    count = len(points)
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    apply_bevel(obj, bevel, 4)
    return obj


def smooth(obj):
    if obj.type != "MESH":
        return obj
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def smooth_shell_by_angle(obj, angle_degrees=24.0):
    """Preserve broad panel shading while smoothing authored curvature.

    Boolean integration triangulates the shell around every painted inset.
    Unrestricted smooth shading then averages those triangles across panel,
    seam, arch, and trim boundaries, creating large false dents in glossy
    reflections.  Split normals only at meaningful angular breaks after all
    topology operations are complete.
    """
    if obj.type != "MESH":
        return obj
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(
        angle=math.radians(angle_degrees),
        keep_sharp_edges=True,
    )
    # The canopy is one deliberately uninterrupted glossy surface. Its tight
    # front curvature legitimately exceeds the body-panel threshold, so do
    # not split normals between two adjoining canopy faces. Otherwise the
    # studio reflections break into large faceted patches across the glass.
    glass_indices = {
        index
        for index, material in enumerate(obj.data.materials)
        if material is not None and material.name == "van_glass_black"
    }
    edge_faces = {edge.index: [] for edge in obj.data.edges}
    edge_lookup = {edge.key: edge.index for edge in obj.data.edges}
    for polygon in obj.data.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_lookup[edge_key]].append(polygon.index)
    for edge in obj.data.edges:
        linked = edge_faces[edge.index]
        if (
            len(linked) == 2
            and obj.data.polygons[linked[0]].material_index in glass_indices
            and obj.data.polygons[linked[1]].material_index in glass_indices
            and max(obj.data.vertices[index].co.x for index in edge.vertices) < CAB_END_X + 0.05
        ):
            edge.use_edge_sharp = False
    obj.data.update(calc_edges=True)
    obj.select_set(False)
    return obj


def ring(
    half_width,
    lower,
    shoulder,
    roof,
    corner=0.16,
    crown=0.02,
    side_cut=None,
    upper_half_width=None,
    corner_segments=5,
):
    if side_cut is None:
        side_cut = shoulder + (roof - corner - shoulder) * 0.5
    if upper_half_width is None:
        upper_half_width = half_width

    def append_segment(points, start, end, segments):
        for index in range(1, segments + 1):
            amount = index / segments
            points.append((
                start[0] + (end[0] - start[0]) * amount,
                start[1] + (end[1] - start[1]) * amount,
            ))

    # Build the positive-Y half once, then mirror it.  Sampling the lower and
    # upper corner arcs removes the broad faceted chamfers that were especially
    # visible at the front nose in the top and three-quarter views.
    positive = [(half_width - corner, lower)]
    lower_center = (half_width - corner, lower + corner)
    for index in range(1, corner_segments + 1):
        angle = -math.pi / 2.0 + (math.pi / 2.0) * index / corner_segments
        positive.append((
            lower_center[0] + corner * math.cos(angle),
            lower_center[1] + corner * math.sin(angle),
        ))
    append_segment(positive, (half_width, lower + corner), (half_width, shoulder), 2)
    append_segment(positive, (half_width, shoulder), (upper_half_width, side_cut), 3)
    append_segment(positive, (upper_half_width, side_cut), (upper_half_width, roof - corner), 3)
    upper_center = (upper_half_width - corner, roof - corner)
    for index in range(1, corner_segments + 1):
        angle = (math.pi / 2.0) * index / corner_segments
        positive.append((
            upper_center[0] + corner * math.cos(angle),
            upper_center[1] + corner * math.sin(angle),
        ))
    append_segment(positive, (upper_half_width - corner, roof), (0.0, roof + crown), 4)

    points = [(-half_width + corner, lower), (0.0, lower - 0.018)]
    points.extend(positive)
    # Leave the first negative lower point as the closing vertex so the
    # sampled lower arc does not introduce a zero-length duplicate edge.
    for y, z in reversed(positive[1:-1]):
        points.append((-y, z))
    return points


def window_lower(x):
    # Outer edge of the unified black canopy in side elevation.  The final
    # control points climb into the roof edge so the rear of the cabin reads
    # as a rounded return surrounded by pearl bodywork, not a vertical belt.
    # The sill stays close to the mirror through the front-wheel centre before
    # turning sharply upward into the rear of the side glazing.
    points = [
        (-3.03, 1.23),
        (-2.92, 1.25),
        (-2.78, 1.27),
        (-2.60, 1.29),
        (-2.36, 1.31),
        (-2.18, 1.33),
        (-2.04, 1.35),
        (-1.90, 1.37),
        (-1.76, 1.40),
        (-1.66, 1.46),
        (-1.58, 1.56),
        (-1.50, 1.69),
        (-1.44, 1.83),
        (-1.40, 1.98),
        (-1.36, 2.07),
        (-1.32, 2.085),
        (-1.28, 2.085),
    ]
    if x <= points[0][0]:
        return points[0][1]
    if x >= points[-1][0]:
        return points[-1][1]
    for (x0, z0), (x1, z1) in zip(points, points[1:]):
        if x0 <= x <= x1:
            amount = (x - x0) / (x1 - x0)
            return z0 + amount * (z1 - z0)
    return points[-1][1]


def loft_body(name, sections, materials):
    vertices = []
    faces = []
    contexts = []
    ring_size = len(sections[0][1])

    def section_points(section):
        x, section_ring, *rest = section
        offsets = rest[0] if rest else None
        if offsets is None:
            offsets = [0.0] * len(section_ring)
        if len(offsets) != len(section_ring):
            raise ValueError("Section X offsets must match the section ring size.")
        return [(x + offset, y, z) for (y, z), offset in zip(section_ring, offsets)]

    point_sections = [section_points(section) for section in sections]
    for points in point_sections:
        vertices.extend(points)
    for section_index in range(len(sections) - 1):
        current = section_index * ring_size
        following = (section_index + 1) * ring_size
        for ring_index in range(ring_size):
            next_index = (ring_index + 1) % ring_size
            faces.append((current + ring_index, following + ring_index, following + next_index, current + next_index))
            contexts.append(("side", section_index, ring_index))

    # Build each end cap as horizontal strips.  A radial fan would technically
    # be one face-level surface, but it makes material boundaries radiate into
    # wedges when the lower fascia or roof cap changes material.  These strips
    # keep those zones horizontal and leave the front/rear body as one mesh.
    def cap_row_intersections(section_points, z):
        crossings = []
        epsilon = 1e-6
        for point_index, point in enumerate(section_points):
            other = section_points[(point_index + 1) % len(section_points)]
            x0, y0, z0 = point
            x1, y1, z1 = other
            if abs(z1 - z0) <= epsilon:
                if abs(z - z0) <= epsilon:
                    crossings.extend(((y0, x0), (y1, x1)))
                continue
            if min(z0, z1) - epsilon <= z <= max(z0, z1) + epsilon:
                amount = (z - z0) / (z1 - z0)
                crossings.append((
                    y0 + amount * (y1 - y0),
                    x0 + amount * (x1 - x0),
                ))
        if not crossings:
            return []
        unique = []
        for value in sorted(crossings):
            if not unique or abs(value[0] - unique[-1][0]) > 1e-5:
                unique.append(value)
        if len(unique) < 2:
            return []
        return unique

    def add_horizontal_cap(surface, section, lower_threshold, upper_threshold):
        section_ring = section[1]
        section_points_data = section_points(section)
        levels = [z for _, z in section_ring]
        levels.extend((lower_threshold, upper_threshold))
        levels = sorted({round(z, 6) for z in levels})
        levels = [z for z in levels if min(level for _, level in section_ring) - 1e-5 <= z <= max(level for _, level in section_ring) + 1e-5]
        sample_count = 9
        row_indices = []
        for z in levels:
            crossings = cap_row_intersections(section_points_data, z)
            if len(crossings) < 2:
                continue
            left_y, left_x = crossings[0]
            right_y, right_x = crossings[-1]
            row = []
            for sample_index in range(sample_count):
                amount = sample_index / (sample_count - 1)
                y = left_y + (right_y - left_y) * amount
                x = left_x + (right_x - left_x) * amount
                row.append(len(vertices))
                vertices.append((x, y, z))
            row_indices.append(row)
        for row_index in range(len(row_indices) - 1):
            lower_row = row_indices[row_index]
            upper_row = row_indices[row_index + 1]
            for sample_index in range(sample_count - 1):
                face = (
                    lower_row[sample_index],
                    upper_row[sample_index],
                    upper_row[sample_index + 1],
                    lower_row[sample_index + 1],
                )
                # The front cap faces -X while the rear cap faces +X.  Using
                # the rear winding at both ends inverted the front normals,
                # confusing Boolean classification exactly where the welded
                # lightbar crosses the fascia.
                faces.append(tuple(reversed(face)) if surface == "front" else face)
                contexts.append((surface, -1, row_index))

    add_horizontal_cap("front", sections[0], 0.60, 1.23)
    add_horizontal_cap("rear", sections[-1], 0.58, 2.08)

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    for material in (
        materials["van_body_pearl"],
        materials["van_lower_graphite"],
        materials["van_glass_black"],
    ):
        mesh.materials.append(material)
    mesh.update()
    for polygon, (surface, section_index, ring_index) in zip(mesh.polygons, contexts):
        center = polygon.center
        x = center.x
        if surface == "front" and center.z <= 0.60:
            polygon.material_index = 1
        elif surface == "front" and center.z >= 1.23:
            polygon.material_index = 2
        elif surface == "rear" and center.z <= 0.58:
            polygon.material_index = 1
        elif surface == "rear" and center.z >= 2.08:
            polygon.material_index = 2
        elif surface == "side" and center.z <= 0.56 and abs(center.y) > 0.52:
            polygon.material_index = 1
        elif surface == "side" and x < CAB_END_X and center.z >= window_lower(x) - 0.005:
            polygon.material_index = 2
        elif surface == "side" and x >= CAB_END_X and center.z >= 2.08:
            polygon.material_index = 2
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    smooth(obj)
    return obj


def join_meshes(objects, name):
    objects = [obj for obj in objects if obj is not None and obj.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = objects[0]
    joined.name = name
    joined.data.name = name
    # Joining meshes can preserve unused material slots, especially after a
    # Boolean modifier.  Remove those slots so the shell has a clean,
    # deterministic face-material table.
    for slot_index in range(len(joined.data.materials) - 1, -1, -1):
        if joined.data.materials[slot_index] is None:
            joined.data.materials.pop(index=slot_index)
            for polygon in joined.data.polygons:
                if polygon.material_index > slot_index:
                    polygon.material_index -= 1
    joined.select_set(False)
    return joined


def body_surface_tree(body):
    """Build a read-only surface index for seating painted shell details."""
    return BVHTree.FromPolygons(
        [vertex.co.copy() for vertex in body.data.vertices],
        [polygon.vertices[:] for polygon in body.data.polygons],
    )


def project_path_to_body(body, points, normals, offset=0.0):
    """Project a detail path onto the already-authored unibody surface.

    A joined object is not automatically conformal: a lightbar can still be
    several centimetres outside the shell after an object join.  Use the
    shell's actual evaluated triangles as the source of truth for every path
    sample, then apply only a tiny outward paint clearance.  The supplied
    XY normals retain the intended front/side orientation at the rounded
    corner instead of inheriting a potentially noisy triangle normal.
    """
    tree = body_surface_tree(body)
    projected = []
    projected_normals = []
    for point, normal in zip(points, normals):
        direction = Vector((normal[0], normal[1], 0.0))
        if direction.length <= 1e-8:
            direction = Vector((-1.0, 0.0, 0.0))
        direction.normalize()
        # Cast from well outside toward the shell.  A nearest-point query can
        # select an adjacent windshield or corner face when the fascia is
        # nearly vertical, which places the entire strip inside the body and
        # makes the Boolean union swallow it.  The inward ray always returns
        # the exterior face for the authored front/side normal.
        origin = Vector(point) + direction * 1.0
        ray_hit = tree.ray_cast(origin, -direction, 2.0)
        surface = ray_hit[0]
        if surface is None:
            nearest = tree.find_nearest(Vector(point))
            surface = nearest[0]
        if surface is None:
            projected.append(point)
            projected_normals.append(normal)
            continue
        surface += direction * offset
        # Keep the authored height.  The lightbar's front run is intentionally
        # level; a nearest-point hit on an adjacent upper-corner triangle can
        # otherwise lift one sample onto the roof edge and create a visible
        # kink in the white face.
        projected.append((surface.x, surface.y, point[2]))
        projected_normals.append((direction.x, direction.y))
    return projected, projected_normals


def seat_detail_on_body(obj, body, normal, exposed_depth, inset_fraction=0.35):
    """Push a detail through the shell so a Boolean union can weld it.

    Merely placing the inner face against the shell (or joining the objects)
    leaves a disconnected island.  The centre is deliberately moved inside
    the body by part of its depth, leaving only a shallow painted extrusion
    outside and a substantial overlap for the union operation.
    """
    tree = body_surface_tree(body)
    hit = tree.find_nearest(obj.location)
    if hit[0] is None:
        return obj
    direction = Vector(normal)
    if direction.length <= 1e-8:
        return obj
    direction.normalize()
    surface = hit[0]
    target = surface + direction * (exposed_depth * (0.5 - inset_fraction))
    obj.location += target - obj.location
    return obj


def boolean_union_into_body(body, detail, label):
    """Weld intersecting detail geometry into the body shell topology."""
    if detail is None:
        return body
    bpy.context.view_layer.objects.active = detail
    detail.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    detail.select_set(False)

    modifier = body.modifiers.new(f"integrate_{label}", "BOOLEAN")
    modifier.operation = "UNION"
    modifier.solver = "EXACT"
    modifier.material_mode = "TRANSFER"
    modifier.object = detail
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    body.select_set(False)
    bpy.data.objects.remove(detail, do_unlink=True)
    return body


def paint_front_lightbar_faces(body, path_points, path_normals, materials):
    """Paint only the welded strip's outward face white after the union."""
    led_material = materials["van_led_white"]
    glass_material = materials["van_glass_black"]
    led_index = next(
        (index for index, material in enumerate(body.data.materials) if material == led_material),
        None,
    )
    if led_index is None:
        body.data.materials.append(led_material)
        led_index = len(body.data.materials) - 1
    glass_index = next(
        index for index, material in enumerate(body.data.materials) if material == glass_material
    )

    # The rounded loft leaves two tiny pearl transition faces immediately
    # above the bar at the windshield corners.  They belong to the black
    # canopy wrap, and otherwise read as bright triangular spikes in front
    # view after the bar is inset.
    for polygon in body.data.polygons:
        center = polygon.center
        material = body.data.materials[polygon.material_index]
        if (
            material == materials["van_body_pearl"]
            and center.x < -2.84
            and abs(center.y) > 1.00
            and center.z > 1.225
        ):
            polygon.material_index = glass_index

    sensor_names = {"van_sensor_black", "van_sensor_black.001"}
    path = [Vector(point) for point in path_points]
    normals = [Vector((normal[0], normal[1], 0.0)).normalized() for normal in path_normals]
    for polygon in body.data.polygons:
        material = body.data.materials[polygon.material_index]
        if material is None or material.name not in sensor_names:
            continue
        center = polygon.center
        best_distance = float("inf")
        best_normal = None
        for index in range(len(path) - 1):
            start = path[index]
            delta = path[index + 1] - start
            length_squared = delta.length_squared
            amount = 0.0 if length_squared <= 1e-12 else max(0.0, min(1.0, (center - start).dot(delta) / length_squared))
            nearest = start + delta * amount
            distance = (center - nearest).length
            if distance < best_distance:
                best_distance = distance
                best_normal = (normals[index] * (1.0 - amount) + normals[index + 1] * amount).normalized()
        # The extrusion is 18 mm deep, so its outward face is 9 mm from the
        # path. Top/bottom and Boolean cut faces either sit farther away or
        # face across the strip and are deliberately left channel-black.
        # At the tight wrap corner the Boolean retessellation rotates the
        # exposed quad normal more quickly than the sampled guide normal.  A
        # positive-facing threshold keeps that continuous outward face white
        # while still rejecting the inward, top, and bottom cut faces.
        if best_distance <= 0.014 and best_normal is not None and polygon.normal.dot(best_normal) >= 0.30:
            polygon.material_index = led_index


def cut_wheel_openings(body):
    """Cut genuine wheel openings through the side walls of the shell."""
    for index, center_x in enumerate((FRONT_AXLE_X, REAR_AXLE_X), 1):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=64,
            radius=0.56,
            depth=3.0,
            location=(center_x, 0.0, WHEEL_CENTER_Z),
            rotation=(math.pi / 2, 0.0, 0.0),
        )
        cutter = bpy.context.object
        cutter.name = f"wheel_arch_cutter_{index}"
        modifier = body.modifiers.new(f"wheel_arch_boolean_{index}", "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = "EXACT"
        modifier.object = cutter
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    return body


def cut_rear_inset(body, materials):
    """Create the shallow recessed service panel visible on the rear door."""
    bpy.ops.mesh.primitive_cube_add(
        location=(3.015, 0.0, 0.76),
    )
    cutter = bpy.context.object
    cutter.name = "rear_inset_cutter"
    cutter.dimensions = (0.08, 1.36, 0.40)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_bevel(cutter, 0.075, 5)
    modifier = body.modifiers.new("rear_inset_boolean", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

    backing = prism_yz(
        "body_rear_inset_surface",
        [
            (-0.49, 0.57), (0.49, 0.57),
            (0.57, 0.65), (0.57, 0.87),
            (0.49, 0.95), (-0.49, 0.95),
            (-0.57, 0.87), (-0.57, 0.65),
        ],
        2.975,
        0.012,
        materials["van_body_pearl"],
        0.025,
    )
    return backing


def half_arch(name, center_x, y, material):
    path_segments = 32
    tube_segments = 8
    radius = 0.56
    tube_radius = 0.030
    vertices = []
    for path_index in range(path_segments + 1):
        angle = math.pi * path_index / path_segments
        for tube_index in range(tube_segments):
            tube_angle = math.tau * tube_index / tube_segments
            vertices.append((
                center_x + math.cos(angle) * (radius + tube_radius * math.cos(tube_angle)),
                y + tube_radius * math.sin(tube_angle),
                WHEEL_CENTER_Z + math.sin(angle) * (radius + tube_radius * math.cos(tube_angle)),
            ))
    faces = []
    for path_index in range(path_segments):
        for tube_index in range(tube_segments):
            next_tube = (tube_index + 1) % tube_segments
            current = path_index * tube_segments + tube_index
            following = (path_index + 1) * tube_segments + tube_index
            faces.append((current, following, (path_index + 1) * tube_segments + next_tube, path_index * tube_segments + next_tube))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    smooth(obj)
    return obj


def parent(obj, root):
    world = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_world = world


def make_body(materials):
    def profile(
        x,
        half_width,
        lower,
        shoulder,
        roof,
        corner=0.16,
        crown=0.02,
        upper_half_width=None,
    ):
        # Add a real topology cut on both side walls.  It follows the swept
        # outer canopy edge through the cab, then rises to a narrow roof return
        # through the cargo section.  The entire black area remains shell
        # faces rather than a glazing board laid over the body.
        roof_edge = roof - corner
        if x <= CAB_END_X:
            side_cut = max(shoulder + 0.025, min(roof_edge - 0.025, window_lower(x)))
        else:
            side_cut = roof_edge - 0.045
        return ring(
            half_width,
            lower,
            shoulder,
            roof,
            corner,
            crown,
            side_cut,
            upper_half_width,
        )

    # The nose is a rounded plan-view cap, not a stack of straight chamfers.
    # Each front station keeps its centerline at the authored X while the
    # outer ring points ease rearward.  The setback is height-dependent: the
    # roof rolls back strongly to create the rounded top-view footprint, but
    # the windshield sill and silver fascia remain close to the centre nose.
    # Applying the full plan-view setback to the complete ring made the lower
    # nose look pushed deep into the body in side elevation.
    front_nose_x = -3.03
    front_tangent_x = -2.16
    front_curve_depth = 0.18

    def front_setback_weight(z):
        # The lower bumper rolls under slightly, the main fascia stays nearly
        # vertical beneath the canopy, and the upper windshield/roof gains the
        # full capsule-shaped plan setback.  These transitions reproduce the
        # reference side profile without flattening the top-view nose.
        if z <= 0.36:
            return 0.55
        if z < 0.55:
            amount = (z - 0.36) / (0.55 - 0.36)
            return 0.55 + (0.15 - 0.55) * amount
        if z <= 1.28:
            return 0.15
        if z < 1.90:
            amount = (z - 1.28) / (1.90 - 1.28)
            amount = amount * amount * (3.0 - 2.0 * amount)
            return 0.15 + 0.85 * amount
        return 1.0

    def section(x, half_width, lower, shoulder, roof, corner=0.16, crown=0.02, upper_half_width=None):
        section_ring = profile(
            x,
            half_width,
            lower,
            shoulder,
            roof,
            corner,
            crown,
            upper_half_width,
        )
        offsets = [0.0] * len(section_ring)
        if x <= front_tangent_x:
            amount = (x - front_nose_x) / (front_tangent_x - front_nose_x)
            amount = max(0.0, min(1.0, amount))
            depth = front_curve_depth * (1.0 - amount) ** 2
            widest = max(abs(y) for y, _ in section_ring)
            offsets = [
                depth * (abs(y) / widest) ** 2 * front_setback_weight(z)
                for y, z in section_ring
            ]
        return (x, section_ring, offsets)

    sections = [
        section(-3.03, 0.93, 0.30, 0.82, 1.24, 0.13, 0.01, 1.08),
        section(-3.015, 0.94, 0.305, 0.845, 1.30, 0.135, 0.011, 1.085),
        section(-2.99, 0.955, 0.31, 0.88, 1.40, 0.14, 0.012, 1.09),
        section(-2.95, 0.975, 0.32, 0.93, 1.52, 0.145, 0.014, 1.095),
        section(-2.90, 0.99, 0.33, 0.98, 1.64, 0.15, 0.016, 1.10),
        section(-2.84, 1.005, 0.34, 1.04, 1.75, 0.16, 0.018, 1.10),
        section(-2.76, 1.025, 0.35, 1.10, 1.94, 0.17, 0.021, 1.10),
        section(-2.66, 1.045, 0.35, 1.17, 2.05, 0.175, 0.023, 1.10),
        section(-2.55, 1.065, 0.35, 1.22, 2.13, 0.18, 0.024),
        section(-2.43, 1.08, 0.35, 1.26, 2.19, 0.18, 0.025),
        section(-2.30, 1.09, 0.35, 1.29, 2.23, 0.18, 0.025),
        section(-2.16, 1.095, 0.35, 1.32, 2.25, 0.18, 0.025),
        section(-2.04, 1.10, 0.35, 1.335, 2.265, 0.18, 0.025),
        section(-1.96, 1.10, 0.35, 1.34, 2.27, 0.18, 0.025),
        section(-1.76, 1.10, 0.35, 1.35, 2.28, 0.18, 0.025),
        section(-1.64, 1.10, 0.35, 1.355, 2.28, 0.18, 0.025),
        section(-1.58, 1.10, 0.35, 1.36, 2.28, 0.18, 0.025),
        section(-1.54, 1.10, 0.35, 1.362, 2.28, 0.18, 0.025),
        section(-1.50, 1.10, 0.35, 1.365, 2.28, 0.18, 0.025),
        section(-1.46, 1.10, 0.35, 1.368, 2.28, 0.18, 0.025),
        section(-1.44, 1.10, 0.35, 1.37, 2.28, 0.18, 0.025),
        section(-1.42, 1.10, 0.35, 1.372, 2.28, 0.18, 0.025),
        section(-1.40, 1.10, 0.35, 1.374, 2.28, 0.18, 0.025),
        section(-1.38, 1.10, 0.35, 1.375, 2.28, 0.18, 0.025),
        section(-1.36, 1.10, 0.35, 1.38, 2.27, 0.18, 0.025),
        section(-1.32, 1.10, 0.35, 1.38, 2.27, 0.18, 0.025),
        section(-1.28, 1.10, 0.35, 1.38, 2.27, 0.18, 0.025),
        section(-1.00, 1.10, 0.35, 1.39, 2.28, 0.18, 0.025),
        section(1.30, 1.10, 0.35, 1.39, 2.28, 0.18, 0.025),
        section(2.38, 1.09, 0.36, 1.38, 2.27, 0.18, 0.025),
        section(2.62, 1.09, 0.37, 1.37, 2.27, 0.18, 0.023),
        section(2.80, 1.08, 0.31, 1.34, 2.26, 0.17, 0.02),
        section(2.94, 1.04, 0.32, 1.31, 2.23, 0.16, 0.016),
        section(3.03, 0.97, 0.34, 1.28, 2.18, 0.13, 0.01),
    ]
    # This is intentionally the only broad body geometry. All broad colour
    # zones are assigned to faces of the loft above; no side, roof, front, or
    # rear boards are added here.
    shell = loft_body("body_unibody_loft", sections, materials)
    cut_wheel_openings(shell)
    rear_inset = cut_rear_inset(shell, materials)
    apply_bevel(shell, 0.025, 3)
    boolean_union_into_body(shell, rear_inset, "rear_inset_surface")
    attached_details = []

    for side in (-1, 1):
        y = side * 1.108
        attached_details.extend([
            half_arch(f"body_fender_arch_front_{side}", FRONT_AXLE_X, y, materials["van_body_pearl"]),
            half_arch(f"body_fender_arch_rear_{side}", REAR_AXLE_X, y, materials["van_body_pearl"]),
        ])
        # Hairline seams are the only side detail geometry; the side panel
        # itself remains the original shell surface.
        seams = [
            cube(f"body_cargo_seam_front_{side}", (0.008, 0.012, 1.50), (-1.00, y, 1.30), materials["van_sensor_black"], 0.002, 1),
            cube(f"body_cargo_seam_rear_{side}", (0.008, 0.012, 1.50), (0.38, y, 1.30), materials["van_sensor_black"], 0.002, 1),
            cube(f"body_cargo_seam_top_{side}", (1.38, 0.012, 0.008), (-0.31, y, 2.16), materials["van_sensor_black"], 0.002, 1),
            cube(f"body_cargo_seam_bottom_{side}", (1.38, 0.012, 0.008), (-0.31, y, 0.61), materials["van_sensor_black"], 0.002, 1),
        ]
        for seam in seams:
            seat_detail_on_body(seam, shell, (0.0, float(side), 0.0), seam.dimensions.y)
        attached_details.extend(seams)
    for index, y in enumerate((-0.56, -0.28, 0.0, 0.28, 0.56), 1):
        # These are shallow roof insets following the flat cargo-roof portion;
        # they stop before the rear taper instead of floating above it.
        groove = cube(f"body_roof_groove_{index}", (3.45, 0.010, 0.008), (0.90, y, 2.303), materials["van_glass_black"], 0.001, 1)
        seat_detail_on_body(groove, shell, (0.0, 0.0, 1.0), groove.dimensions.z)
        attached_details.append(groove)
    for index, detail in enumerate(attached_details, 1):
        boolean_union_into_body(shell, detail, f"body_detail_{index}")
    shell.name = "van_body_shell"
    shell.data.name = "van_body_shell"
    return shell


def make_empty(name, root, properties=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    if properties:
        for key, value in properties.items():
            obj[key] = value
    parent(obj, root)
    return obj


def make_front_lights(materials, body):
    # The reference lightbar is a recessed band in the front fascia, not a
    # floating rectangular lamp.  Keep a dark channel against the shell and a
    # narrow white face just proud of it.  The side returns follow the front
    # corner and remain visible in the orthographic side views.
    # Use one continuous U-shaped path for each material.  Separate front and
    # side strips leave a visible seam at the turn even when their endpoints
    # overlap in space; one path keeps the corner faces welded and tangent.
    path_points = []
    path_normals = []
    front_light_z = 1.115

    # Left side return, running from the wheel-side end toward the nose.
    for index in range(8):
        amount = index / 7.0
        x = -2.52 - 0.46 * amount
        path_points.append((x, -1.10, front_light_z + 0.018 * (1.0 - amount)))
        path_normals.append((0.0, -1.0))

    # Left front corner: rotate the exposed normal continuously from side to
    # front while easing the centerline through the body corner.
    for index in range(1, 7):
        amount = index / 6.0
        eased = amount * amount * (3.0 - 2.0 * amount)
        theta = math.pi * 0.5 * eased
        path_points.append((
            -2.98 + 0.05 * eased - 0.07 * math.sin(math.pi * amount),
            -1.10 + 0.30 * eased - 0.04 * math.sin(math.pi * amount),
            front_light_z,
        ))
        path_normals.append((-math.sin(theta), -math.cos(theta)))

    # Front face: keep the lightbar level across the fascia.  The previous
    # quadratic end lift made the center sag visibly in the front review view
    # and produced a kink where the white face met the corner returns.
    for index in range(13):
        amount = index / 12.0
        y = -0.80 + 1.60 * amount
        z = front_light_z
        if index == 0:
            continue  # already supplied by the left corner endpoint
        # Follow the new rounded front footprint instead of leaving the bar
        # on a flat X plane.  The center remains foremost; the ends ease back
        # with the fascia, and the normal follows the same shallow plan curve.
        front_x = -3.030 + 0.10 * (abs(y) / 0.80) ** 2
        slope = 0.3125 * y
        length = math.sqrt(1.0 + slope * slope)
        path_points.append((front_x, y, z))
        path_normals.append((-1.0 / length, slope / length))

    # Right front corner and right side return mirror the left exactly.
    for index in range(1, 7):
        amount = index / 6.0
        eased = amount * amount * (3.0 - 2.0 * amount)
        theta = math.pi * 0.5 * eased
        path_points.append((
            -3.030 + 0.10 * (1.0 - eased) + 0.05 * eased - 0.07 * math.sin(math.pi * amount),
            0.80 + 0.30 * eased + 0.04 * math.sin(math.pi * amount),
            front_light_z,
        ))
        path_normals.append((-math.cos(theta), math.sin(theta)))
    for index in range(1, 8):
        amount = index / 7.0
        path_points.append((-2.98 + 0.46 * amount, 1.10, front_light_z + 0.018 * amount))
        path_normals.append((0.0, 1.0))

    # The front loft is deliberately rounded in plan, so the old constant-X
    # path floated in front of the nose.  Project every sample onto the shell
    # before creating the painted strip; the side returns now follow the same
    # curved body corner as the fascia instead of tracing a detached U.
    path_points, path_normals = project_path_to_body(body, path_points, path_normals)

    # One solid strip crosses the body skin.  Its exposed faces are white and
    # its narrow perimeter faces are dark; the later Boolean union welds that
    # perimeter into the fascia instead of preserving a floating lamp mesh.
    parts = [
        ribbon_path(
            "front_led_bar",
            path_points,
            path_normals,
            0.021,
            0.018,
            materials["van_sensor_black"],
            0.0,
            0.0,
        ),
    ]
    front_amber_left = cube("front_amber_left", (0.040, 0.060, 0.22), (-3.095, -0.90, 0.66), materials["van_marker_amber"], 0.014, 3)
    front_amber_right = cube("front_amber_right", (0.040, 0.060, 0.22), (-3.095, 0.90, 0.66), materials["van_marker_amber"], 0.014, 3)
    seat_detail_on_body(front_amber_left, body, (-1.0, 0.0, 0.0), 0.040)
    seat_detail_on_body(front_amber_right, body, (-1.0, 0.0, 0.0), 0.040)
    parts.extend([front_amber_left, front_amber_right])
    return join_meshes(parts, "van_lights_front"), path_points, path_normals


def make_rear_panel_seams(materials, body):
    parts = [
        cube("rear_door_seam_left", (0.012, 0.012, 1.38), (3.075, -0.68, 1.33), materials["van_sensor_black"], 0.002, 1),
        cube("rear_door_seam_right", (0.012, 0.012, 1.38), (3.075, 0.68, 1.33), materials["van_sensor_black"], 0.002, 1),
        cube("rear_inset_seam_left", (0.012, 0.012, 0.38), (3.075, -0.66, 0.76), materials["van_sensor_black"], 0.002, 1),
        cube("rear_inset_seam_right", (0.012, 0.012, 0.38), (3.075, 0.66, 0.76), materials["van_sensor_black"], 0.002, 1),
        cube("rear_inset_seam_top", (0.012, 1.32, 0.012), (3.075, 0, 0.95), materials["van_sensor_black"], 0.002, 1),
        cube("rear_inset_seam_bottom", (0.012, 1.32, 0.012), (3.075, 0, 0.57), materials["van_sensor_black"], 0.002, 1),
    ]
    for part in parts:
        seat_detail_on_body(part, body, (1.0, 0.0, 0.0), part.dimensions.x)
    return join_meshes(parts, "van_sensor_rear")


def make_front_vents(materials, body):
    parts = [
        cube("front_panel_seam_left", (0.030, 0.010, 0.40), (-3.103, -0.79, 0.91), materials["van_sensor_black"], 0.002, 1),
        cube("front_panel_seam_right", (0.030, 0.010, 0.40), (-3.103, 0.79, 0.91), materials["van_sensor_black"], 0.002, 1),
        cube("front_central_intake", (0.045, 1.08, 0.065), (-3.097, 0, 0.49), materials["van_sensor_black"], 0.025, 4),
    ]
    for side in (-1, 1):
        for index, z in enumerate((0.49, 0.56, 0.63), 1):
            parts.append(cube(f"front_vent_{side}_{index}", (0.050, 0.27, 0.022), (-3.100, side * 0.69, z), materials["van_sensor_black"], 0.008, 2))
    for part in parts:
        seat_detail_on_body(part, body, (-1.0, 0.0, 0.0), part.dimensions.x)
    return join_meshes(parts, "van_sensor_front")


def make_rear_lights(materials, body):
    parts = [
        cube("rear_red_housing_left", (0.050, 0.11, 1.40), (3.085, -0.91, 1.55), materials["van_sensor_black"], 0.028, 4),
        cube("rear_red_housing_right", (0.050, 0.11, 1.40), (3.085, 0.91, 1.55), materials["van_sensor_black"], 0.028, 4),
        cube("rear_red_left", (0.060, 0.060, 1.30), (3.120, -0.91, 1.55), materials["van_light_red"], 0.022, 4),
        cube("rear_red_right", (0.060, 0.060, 1.30), (3.120, 0.91, 1.55), materials["van_light_red"], 0.022, 4),
        cube("rear_amber_left", (0.045, 0.16, 0.050), (3.098, -0.68, 0.50), materials["van_marker_amber"], 0.014, 3),
        cube("rear_amber_right", (0.045, 0.16, 0.050), (3.098, 0.68, 0.50), materials["van_marker_amber"], 0.014, 3),
        cube("rear_brake_center", (0.045, 0.34, 0.020), (3.100, 0, 2.16), materials["van_light_red"], 0.008, 2),
    ]
    for part in parts:
        seat_detail_on_body(part, body, (1.0, 0.0, 0.0), part.dimensions.x)
    return join_meshes(parts, "van_lights_rear")


def make_side_markers(materials, body):
    parts = []
    for side in (-1, 1):
        for position, x in (("front", -1.35), ("rear", 2.48)):
            part = cube(f"marker_{side}_{position}", (0.18, 0.032, 0.050), (x, side * 1.11, 0.54), materials["van_marker_amber"], 0.012, 2)
            seat_detail_on_body(part, body, (0.0, float(side), 0.0), part.dimensions.y)
            parts.append(part)
    return join_meshes(parts, "van_lights_side_markers")


def make_mirror(name, y, materials):
    side = -1 if y < 0 else 1
    parts = [
        # The mount deliberately penetrates the shell by a generous amount;
        # the mirror is welded body topology, not a pod merely touching the
        # outside skin.
        cube(f"{name}_mount", (0.18, 0.30, 0.055), (-2.08, y + side * 0.05, 1.34), materials["van_sensor_black"], 0.018, 3),
        cube(f"{name}_pod", (0.26, 0.17, 0.11), (-2.18, y + side * 0.06, 1.36), materials["van_sensor_black"], 0.035, 5),
    ]
    return join_meshes(parts, name)


def make_side_handles(materials, body):
    parts = []
    for side in (-1, 1):
        part = cube(
                f"side_door_handle_{side}",
                (0.06, 0.035, 0.19),
                (-0.78, side * 1.115, 1.39),
                materials["van_sensor_black"],
                0.018,
                4,
            )
        seat_detail_on_body(part, body, (0.0, float(side), 0.0), part.dimensions.y)
        parts.append(part)
    return join_meshes(parts, "van_door_handles")


def make_wheel(name, x, y, materials):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=40,
        minor_segments=14,
        major_radius=0.385,
        minor_radius=0.115,
        location=(x, y, WHEEL_CENTER_Z),
        rotation=(math.pi / 2, 0, 0),
    )
    tire = bpy.context.object
    tire.name = f"{name}_tire"
    tire.data.materials.append(materials["van_tire_rubber"])
    smooth(tire)
    parts = [tire]
    side = -1 if y < 0 else 1
    outer_y = y + side * 0.075
    for suffix, radius, depth in (("disc", 0.325, 0.12), ("hub", 0.090, 0.16)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=radius, depth=depth, location=(x, outer_y, WHEEL_CENTER_Z), rotation=(math.pi / 2, 0, 0))
        disc = bpy.context.object
        disc.name = f"{name}_{suffix}"
        disc.data.materials.append(materials["van_wheel_graphite"])
        apply_bevel(disc, 0.015, 3)
        parts.append(disc)
    for index in range(5):
        angle = index * math.tau / 5 + math.radians(9)
        blade = cube(
            f"{name}_blade_{index}",
            (0.26, 0.055, 0.095),
            (x + math.cos(angle) * 0.215, y + side * 0.145, WHEEL_CENTER_Z + math.sin(angle) * 0.215),
            materials["van_wheel_graphite"],
            0.024,
            3,
        )
        blade.rotation_euler[1] = -angle
        bpy.context.view_layer.objects.active = blade
        blade.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        blade.select_set(False)
        parts.append(blade)
    wheel = join_meshes(parts, name)
    wheel.location = (0, 0, 0)
    return wheel


def make_interior_occluder(materials):
    return cube("van_interior_occluder", (0.40, 1.32, 0.38), (-1.95, 0, 1.52), materials["van_interior_occluder"], 0.07, 3)


def ribbon_path(name, points, normals, width, depth, material, offset=0.0, bevel=0.0, side_material=None):
    """Build a shallow, continuous strip following a body-facing path.

    The lightbar is intentionally a very thin face-level detail: the inner
    half of the strip sits against the unibody while the small outer half
    catches the review lighting.  This gives the front band a recessed-channel
    read without introducing a separate lamp pod or a thick bumper applique.
    """
    vertices = []
    for (x, y, z), (nx, ny) in zip(points, normals):
        length = math.hypot(nx, ny) or 1.0
        nx /= length
        ny /= length
        base_x = x + nx * offset
        base_y = y + ny * offset
        inner_x = base_x - nx * depth * 0.5
        inner_y = base_y - ny * depth * 0.5
        outer_x = base_x + nx * depth * 0.5
        outer_y = base_y + ny * depth * 0.5
        vertices.extend([
            (inner_x, inner_y, z + width),
            (inner_x, inner_y, z - width),
            (outer_x, outer_y, z - width),
            (outer_x, outer_y, z + width),
        ])

    faces = []
    for index in range(len(points) - 1):
        current = index * 4
        following = (index + 1) * 4
        faces.extend([
            (current + 3, following + 3, following + 2, current + 2),  # exposed face
            (current + 0, current + 1, following + 1, following + 0),
            (current + 0, following + 0, following + 3, current + 3),
            (current + 1, current + 2, following + 2, following + 1),
        ])
    first = 0
    last = (len(points) - 1) * 4
    faces.extend([
        (first + 0, first + 1, first + 2, first + 3),
        (last + 3, last + 2, last + 1, last + 0),
    ])
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    if side_material is not None:
        mesh.materials.append(side_material)
    mesh.update()
    if side_material is not None:
        # Every segment contributes four faces; only the first is the outward
        # face.  Keep the ribbon thickness and caps dark so the LED reads as a
        # single painted line even where the path rotates around the corner.
        segment_face_count = 4
        exposed_face_count = segment_face_count * max(0, len(points) - 1)
        for face_index, polygon in enumerate(mesh.polygons):
            if face_index >= exposed_face_count or face_index % segment_face_count != 0:
                polygon.material_index = 1
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    apply_bevel(obj, bevel, 2)
    return obj


def ribbon_surface_path(name, points, normals, width, offset, material):
    """Build a single painted face along a changing front/side normal."""
    vertices = []
    for (x, y, z), (nx, ny) in zip(points, normals):
        length = math.hypot(nx, ny) or 1.0
        nx /= length
        ny /= length
        base_x = x + nx * offset
        base_y = y + ny * offset
        vertices.extend([
            (base_x, base_y, z + width),
            (base_x, base_y, z - width),
        ])
    faces = []
    for index in range(len(points) - 1):
        current = index * 2
        following = (index + 1) * 2
        faces.append((current, following, following + 1, current + 1))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def create_review_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def add_reference(collection, name, filename, location, rotation, size):
    path = os.path.abspath(os.path.join(REFERENCE_DIR, filename))
    if not os.path.exists(path):
        print(f"Reference image is not present yet: {path}")
        return None
    image = bpy.data.images.load(path, check_existing=True)
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "IMAGE"
    empty.data = image
    empty.empty_display_size = size
    empty.location = location
    empty.rotation_euler = rotation
    empty.color[3] = 0.38
    empty.show_in_front = True
    empty.hide_render = True
    collection.objects.link(empty)
    empty["reference_file"] = path
    return empty


def point_at(obj, target):
    from mathutils import Vector
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_review_cameras():
    collection = create_review_collection("REVIEW_CAMERAS")
    specs = {
        "review_front": ((-9.0, 0.0, 1.35), (-2.3, 0.0, 1.25), 2.85),
        "review_rear": ((9.0, 0.0, 1.35), (2.3, 0.0, 1.25), 2.85),
        "review_right": ((0.0, 10.0, 1.45), (0.0, 0.0, 1.25), 6.90),
        "review_left": ((0.0, -10.0, 1.45), (0.0, 0.0, 1.25), 6.90),
        "review_top": ((0.0, 0.0, 12.0), (0.0, 0.0, 0.0), 6.90),
        "review_three_quarter": ((-6.8, -7.2, 2.55), (0.0, 0.0, 1.10), 7.0),
    }
    for name, (location, target, scale) in specs.items():
        camera_data = bpy.data.cameras.new(name)
        camera_data.type = "ORTHO"
        camera_data.ortho_scale = scale
        camera = bpy.data.objects.new(name, camera_data)
        collection.objects.link(camera)
        camera.location = location
        point_at(camera, target)
        camera["review_target"] = name.removeprefix("review_")


def setup_references():
    collection = create_review_collection("REFERENCE_IMAGES")
    add_reference(collection, "reference_front", "reference-front.png", (-3.35, 0, 1.25), (0, -math.pi / 2, 0), 2.85)
    add_reference(collection, "reference_rear", "reference-rear.png", (3.35, 0, 1.25), (0, math.pi / 2, 0), 2.85)
    add_reference(collection, "reference_right", "reference-right.png", (0, 3.35, 1.25), (-math.pi / 2, 0, 0), 6.90)
    add_reference(collection, "reference_top", "reference-top.png", (0, 0, 3.35), (0, 0, 0), 6.90)


def export_glb(path, root):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in root.children_recursive:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_yup=True,
    )


def build_scene():
    clear_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    materials_map = materials()
    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.30
    bpy.context.collection.objects.link(root)
    root["lod"] = 0
    root["forward_axis"] = "-X"
    root["left_axis"] = "-Y"
    root["authoring_scale"] = "literal_metric"
    root["source_of_truth"] = "Blender-authored unibody scene"
    root["lod0_triangle_ceiling"] = 80000

    body = make_body(materials_map)
    interior = make_interior_occluder(materials_map)
    front_lights, front_light_path, front_light_normals = make_front_lights(materials_map, body)
    rear_lights = make_rear_lights(materials_map, body)
    rear_panel_seams = make_rear_panel_seams(materials_map, body)
    side_markers = make_side_markers(materials_map, body)
    front_vents = make_front_vents(materials_map, body)
    mirror_left = make_mirror("van_mirror_sensor_left", -1.08, materials_map)
    mirror_right = make_mirror("van_mirror_sensor_right", 1.08, materials_map)
    side_handles = make_side_handles(materials_map, body)
    # These are topology unions, not object-level joins.  Every detail crosses
    # the body skin and is welded into it, so no disconnected light/trim mesh
    # islands survive inside van_body_shell.  Wheels remain separate because
    # they are rolling assemblies; the mirror housings are also welded into
    # the shell so wheels are the only detached exterior meshes.
    for label, detail in (
        ("front_lights", front_lights),
        ("rear_lights", rear_lights),
        ("rear_panel_seams", rear_panel_seams),
        ("side_markers", side_markers),
        ("front_vents", front_vents),
        ("side_handles", side_handles),
    ):
        boolean_union_into_body(body, detail, label)
    boolean_union_into_body(body, mirror_left, "mirror_left")
    boolean_union_into_body(body, mirror_right, "mirror_right")
    paint_front_lightbar_faces(body, front_light_path, front_light_normals, materials_map)
    body.name = "van_body_shell"
    body.data.name = "van_body_shell"
    # Boolean intersections at very shallow painted seams can leave duplicate
    # or zero-area bookkeeping faces.  Clean those without changing the
    # welded surface before saving/exporting the authored mesh.
    body.data.validate(verbose=True, clean_customdata=True)
    body.data.update(calc_edges=True)
    smooth_shell_by_angle(body)
    parent(body, root)
    parent(interior, root)
    for name, location in (
        ("van_wheel_front_left", (FRONT_AXLE_X, -1.00)),
        ("van_wheel_front_right", (FRONT_AXLE_X, 1.00)),
        ("van_wheel_rear_left", (REAR_AXLE_X, -1.00)),
        ("van_wheel_rear_right", (REAR_AXLE_X, 1.00)),
    ):
        wheel = make_wheel(name, location[0], location[1], materials_map)
        parent(wheel, root)

    for name, properties in (
        ("van_lights_front", {"integrated_into": "van_body_shell"}),
        ("van_lights_rear", {"integrated_into": "van_body_shell"}),
        ("van_lights_side_markers", {"integrated_into": "van_body_shell"}),
        ("van_mirror_sensor_left", {"integrated_into": "van_body_shell"}),
        ("van_mirror_sensor_right", {"integrated_into": "van_body_shell"}),
        ("van_sensor_front", {"integrated_into": "van_body_shell"}),
        ("van_sensor_rear", {"integrated_into": "van_body_shell"}),
        ("van_door_handles", {"integrated_into": "van_body_shell"}),
        ("van_glass_canopy", {"integrated_into": "van_body_shell", "material": "van_glass_black"}),
        ("van_lower_trim", {"integrated_into": "van_body_shell", "material": "van_lower_graphite"}),
        ("van_door_cab_left", {"integrated_into": "van_body_shell", "animated": False}),
        ("van_door_cab_right", {"integrated_into": "van_body_shell", "animated": False}),
        ("van_door_cargo_left", {"integrated_into": "van_body_shell", "animated": False}),
        ("van_door_rear", {"integrated_into": "van_body_shell", "animated": False}),
    ):
        make_empty(name, root, properties)

    setup_references()
    setup_review_cameras()
    return root


def main():
    blend_path = os.path.abspath(OUTPUT_BLEND)
    if os.path.exists(blend_path) and "--force" not in sys.argv:
        raise RuntimeError(
            f"Refusing to rebuild existing source scene: {blend_path}. "
            "Pass --force only when intentionally replacing it from the procedural recipe."
        )
    root = build_scene()
    os.makedirs(os.path.dirname(blend_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    export_glb(os.path.abspath("public/assets/vehicles/courier_van.glb"), root)
    print(f"Saved authored source scene: {blend_path}")


if __name__ == "__main__":
    main()
