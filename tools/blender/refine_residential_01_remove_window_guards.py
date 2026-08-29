"""Remove all window-mounted guards from Residential Building 01.

This targeted primary-gate refinement preserves the approved architecture and
the penthouse terrace railing.  It accepts only the current editable primary
architecture and cannot be applied twice.
"""

import os

import bpy


ROOT_NAME = "residential_01_master"
EXPECTED_SOURCE = os.path.abspath("art/buildings/residential_01/residential_01.blend")


def remove_object(obj):
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
        bpy.data.meshes.remove(data)


def main():
    if os.path.abspath(bpy.data.filepath) != EXPECTED_SOURCE:
        raise RuntimeError(
            f"Open the canonical Residential 01 source before refining: {EXPECTED_SOURCE}"
        )
    root = bpy.data.objects.get(ROOT_NAME)
    if root is None or root.get("authoring_stage") != "primary_architecture":
        raise RuntimeError("Window-guard removal expects Residential 01 primary architecture.")
    if root.get("window_guards") == "none by user direction":
        raise RuntimeError("Residential window guards have already been removed.")

    guards = [obj for obj in root.children_recursive if "_juliet_" in obj.name]
    if not guards:
        raise RuntimeError("Residential source contains no window-mounted guards to remove.")
    for obj in guards:
        remove_object(obj)

    remaining = [obj for obj in root.children_recursive if "_juliet_" in obj.name]
    terrace_posts = [obj for obj in root.children_recursive if obj.get("railing_post")]
    if remaining:
        raise RuntimeError(f"Window-mounted guards remain after refinement: {len(remaining)}")
    if len(terrace_posts) != 152:
        raise RuntimeError(
            "Penthouse terrace railing changed while removing window guards: "
            f"{len(terrace_posts)} posts remain"
        )

    root["window_guards"] = "none by user direction"
    root["window_guard_removal"] = "approved refinement 2026-08-29"
    bpy.ops.wm.save_as_mainfile(filepath=EXPECTED_SOURCE)
    print(
        f"Removed {len(guards)} window-mounted guard objects; "
        f"preserved {len(terrace_posts)} terrace posts."
    )


if __name__ == "__main__":
    main()
