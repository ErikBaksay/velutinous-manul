# Residential Building 01 Blender master

`residential_01.blend` is the editable, literal-metric exterior source of truth
for the first residential building.  The front faces local `-Y`, local `+Z` is
up, the horizontal origin is centered in the footprint, and continuous ground
contact is at `Z=0`.

The supplied composite and its calibrated crops in `references/` are the visual
authority.  Where the generated composite disagrees with itself, the labeled
elevations define the repeatable geometry: four bays on front/rear and three on
left/right.  The large hero view defines the rounded corners, restrained
materials, strong floor bands, recessed penthouse, and terrace character.

## Current approval gate

The proportion blockout was approved on 2026-08-29.  The primary architecture
pass is now ready for manual review:

- detailed bounds: `18.54 m x 14.04 m x 15.72 m`, including projecting frames
- rounded dark ground-floor podium
- three full white residential levels separated by continuous belts
- recessed penthouse and wraparound terrace slab
- flat roof and upper cornice; the proposed rooftop AC/service box was removed
- 56 upper/penthouse windows following the approved four-by-three bay authority
- 13 framed ground-floor openings, including the centered front double entrance
- editable frames, mullions, transoms, handles, cladding joints, and warm wall
  sconces; all window-mounted guards were removed by user direction
- continuous three-rail terrace guard with 152 editable vertical posts
- packed calibrated references and six fixed review cameras
- 11,996 triangles; no runtime triangle budget is imposed yet

Planters, attached vegetation, and the final procedural surface/material pass
belong to the next approval gate.  The asset remains exterior-only: no apartment
or ground-floor interiors are modeled.  Street, pavement, freestanding
planters, hedges, and mature trees remain outside the building asset.

## Blender-first workflow

From the repository root, using the verified portable Blender 5.1.1 build:

```bash
BLENDER="/home/erikbaksay/My Files/Apps/blender-5.1.1-linux-x64/blender"

# One-time/recovery bootstrap. Refuses to replace residential_01.blend unless
# --force is passed deliberately. Do not use after manual Blender edits.
"$BLENDER" --background --factory-startup \
  --python tools/blender/author_residential_01.py

# Read-only design-review render pass; this never saves over the .blend.
"$BLENDER" --background art/buildings/residential_01/residential_01.blend \
  --python tools/blender/render_residential_01_preview.py

# Render one review role while iterating.
RESIDENTIAL_01_RENDER_ONLY=hero "$BLENDER" --background \
  art/buildings/residential_01/residential_01.blend \
  --python tools/blender/render_residential_01_preview.py
```

`tools/blender/advance_residential_01_primary_architecture.py` is the guarded,
one-time transition from the approved blockout to the current architecture
gate.  It has already been applied and must not be rerun.  The bootstrap and
advance scripts are recovery/history tools; edit the current `.blend` directly.
The subsequent guarded refinement
`tools/blender/refine_residential_01_remove_window_guards.py` removed every
window-mounted guard while preserving the penthouse terrace railing; it has
also already been applied.

The current headless host has no usable EGL context for Eevee.  Automated
review renders were therefore verified with
`RESIDENTIAL_01_RENDER_ENGINE=CYCLES`; the editable scene remains configured for
Eevee use in Blender.  After the first manual edit, open and save the `.blend`
directly and run only the review renderer.

The current runtime export uses stable IDs `residential_01_lod0` and
`residential_01_lod1`; LOD0 is 11,996 triangles and LOD1 is 6,596 triangles.
The gameplay footprint is a separate strict-land `10×8` cell definition, and
grid occupancy supplies collision for this first settlement slice. The shared
environment export applies a uniform `0.5×` runtime scale to this architectural
master, producing roughly `9.27×7.02×7.86` world units (X×Z footprint and Y
height). Re-export the shared environment bundle after approved art edits:

```bash
blender --background --python tools/blender/build_environment_assets.py
```
