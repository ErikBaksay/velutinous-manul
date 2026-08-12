"""Build Velutinous Manul's original low-poly environment kit.

This script intentionally uses only Blender primitives and materials created in
this file. It is a reproducible source for the first runtime GLB; no external
asset or texture is imported.
"""

import argparse
import json
import os
import sys

import bpy


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
}


def material(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = PALETTE[name]
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = PALETTE[name]
    principled.inputs["Roughness"].default_value = 0.86
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
    bpy.ops.object.select_all(action="DESELECT")
    asset.select_set(True)
    bpy.context.view_layer.objects.active = asset
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Blender is Z-up; the glTF exporter converts this to runtime Y-up.
    minimum_z = min(vertex.co.z for vertex in asset.data.vertices)
    for vertex in asset.data.vertices:
        vertex.co.z -= minimum_z

    asset.location = (0.0, 0.0, 0.0)
    asset.rotation_euler = (0.0, 0.0, 0.0)
    asset.scale = (1.0, 1.0, 1.0)
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
    return ico(name, radius, (0, radius * 0.7, 0), (1.0, 0.72, 0.85), material(mat_name), 1)


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
    assets = [
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
    lod0_collection = bpy.data.collections.new("Environment_LOD0")
    bpy.context.scene.collection.children.link(lod0_collection)
    lod1_collection = bpy.data.collections.new("Environment_LOD1")
    bpy.context.scene.collection.children.link(lod1_collection)
    all_assets = []
    for asset in assets:
        for collection in list(asset.users_collection):
            collection.objects.unlink(asset)
        lod0_collection.objects.link(asset)
        lod1 = create_lod1(asset, asset.name.replace("_lod0", "_lod1"), lod1_collection)
        all_assets.extend((asset, lod1))
    return all_assets


def validate_assets(assets):
    for asset in assets:
        if not asset.name.endswith(("_lod0", "_lod1")):
            raise RuntimeError(f"Environment asset has an invalid name: {asset.name}")
        if any(abs(value) > 1e-5 for value in asset.location):
            raise RuntimeError(f"Environment asset is not located at the origin: {asset.name}")
        if any(abs(value - 1.0) > 1e-5 for value in asset.scale):
            raise RuntimeError(f"Environment asset has unapplied scale: {asset.name}")
        minimum_z = min(vertex.co.z for vertex in asset.data.vertices)
        if minimum_z < -1e-5:
            raise RuntimeError(f"Environment asset is below its ground origin: {asset.name}")


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
    args, _ = parser.parse_known_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    clear_scene()
    assets = build_assets()
    export_glb(os.path.abspath(args.output), assets)


if __name__ == "__main__":
    main()
