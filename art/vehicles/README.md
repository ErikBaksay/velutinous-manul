# Courier van asset

`courier_van.blend` is the source of truth for the exterior model. The current
Blender-first baseline is an intentionally aggressive low-poly edit cage: the
broad body, canopy, lower fascia, rocker band, wheel arches, rear/front caps,
and roof are faces of one contiguous `van_body_shell` mesh. Wheels are the only
detached exterior meshes.

Fine lenses, mirrors, handles, vents, lights, markers, and shallow seams were
removed from the geometry during the low-poly migration so they can be rebuilt
accurately against the reference proposal. Compatibility empties retain their
stable runtime names while that modelling work proceeds.

The windshield, side glazing, former pillar surrounds, and panoramic roof are
one uninterrupted opaque `van_glass_black` region on that shell.  They are not
separate glass or frame meshes and intentionally share one glossy finish.

Reference set:

- `references/reference-front.png`
- `references/reference-right.png`
- `references/reference-rear.png`
- `references/reference-top.png`

The fixed review outputs are `courier-van-front.png`, `courier-van-right.png`,
`courier-van-back.png`, `courier-van-top.png`, `courier-van-left.png`, and
`courier-van-preview.png`.  Use the author/validate/render commands in
`tools/blender/README.md` to regenerate them with the portable Blender install.

## Blender-first editing workflow

Open and edit `courier_van.blend` directly in Blender. After saving manual
changes, run the export and preview commands in `tools/blender/README.md` so
the runtime GLB and fixed review renders stay synchronized.

`tools/blender/author_courier_van.py` is the original procedural bootstrap and
rebuild helper. It clears and recreates the old detailed scene, so do not run
it after manual edits unless intentionally restarting from that recipe. The
one-time `tools/blender/simplify_courier_van.py` migration produced the current
clean cage and is not part of the normal edit/export loop. Future scripted
changes must target the existing scene and preserve the stable root, marker
names, materials, and object contract required by the validator.
