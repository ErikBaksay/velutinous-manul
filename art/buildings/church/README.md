# Church Blender master

`church.blend` is the editable exterior source of truth for the settlement
church.  It is authored at architectural metric scale, with the entrance
facing local `-Y`, local `+Z` up, and continuous ground contact at `Z=0`.

The supplied front, right-side, and three-quarter images in `references/` are
the visual authority.  The left elevation mirrors the right-side bay rhythm;
the centered rear annex is a conservative reconstruction from the visible
evidence.  The asset is exterior-only and does not contain a navigable nave or
tower interior.

## Current approval stage

The proportional blockout is approved.  The scene now contains the primary
architecture pass for the next visual approval gate:

- nominal envelope: `12.8 m × 28.0 m × 27.0 m`
- raised foundation and broad front stair
- tetrastyle portico with side-return columns
- long nave, pitched roof, and centered rear annex
- stepped square tower, octagonal lantern, spire, orb, and cross
- four reference-matched arched nave windows per side, with muntins and vents
- Ionic column bases, capitals, volutes, and layered portico entablature
- paneled entry door, upper window, pediment oculus, and corner pilasters
- clock face and hands, arched belfry/lantern openings, and opaque louvers
- restrained side/rear openings and trim on the inferred rear annex
- calibrated reference images and six fixed review cameras

The final ornament and surface pass remains intentionally deferred until this
gate is approved.  That pass will add dentils, finer stepped moldings, stone
courses, roof panel seams, spire ribs, arch keystones, column fluting, and the
remaining small finials and hardware that define the close reference read.

## Blender-first workflow

From the repository root:

```bash
# One-time/recovery bootstrap. Refuses to overwrite church.blend unless
# --force is passed deliberately.
blender --background --python tools/blender/author_church.py

# Read-only review render pass; this does not save over church.blend.
blender --background art/buildings/church/church.blend \
  --python tools/blender/render_church_preview.py

# Render one fixed view while iterating.
CHURCH_RENDER_ONLY=front blender --background \
  art/buildings/church/church.blend \
  --python tools/blender/render_church_preview.py
```

After the final modeling handoff, edit `church.blend` directly.  Do not rerun
the bootstrap over manual changes.  The current runtime export uses stable IDs
`church_lod0` and `church_lod1`; LOD0 is 16,172 triangles and LOD1 is 8,894
triangles. The gameplay footprint is a separate strict-land `7×14` cell
definition, and grid occupancy supplies collision for this first settlement
slice. The shared environment export applies a uniform `0.5×` runtime scale to
this architectural master, producing roughly `6.4×14.0×13.56` world units
(X×Z footprint and Y height). Re-export the shared environment bundle after
approved art edits:

```bash
blender --background --python tools/blender/build_environment_assets.py
```
