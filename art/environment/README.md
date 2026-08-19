# Velutinous Manul environment art

This directory contains original Blender source files for the environment kit.

Runtime assets are exported to `public/assets/environment/environment.glb` by
`tools/blender/build_environment_assets.py`. Do not add downloaded models,
textures, or third-party asset packs here.

Asset conventions:

- Blender scene units map to game world units; one terrain cell is one unit.
- Use Y-up coordinates and place each asset origin at its ground contact point.
- Apply transforms before export.
- Keep materials simple, opaque, and vertex-color friendly.
- Use stable names such as `tree_spruce_lod0`, `rock_boulder_lod0`, and
  `shore_pebbles_lod1`.
- Keep LOD0 and LOD1 geometry in the same exported scene for later runtime LOD
  selection.

## Classical shaft-house mine contract

The first building asset is generated with the environment kit and exported as
two joined, multi-material meshes:

- `mine_shaft_house_lod0`
- `mine_shaft_house_lod1`

The asset follows the supplied concept and elevation as the visual source of
truth. The defining composition is a west shaft
tower/headframe, long central hall, south entrance portico, east utility/loading
end, twin east chimneys, dark pitched roof, and paired solar fields on the main roof.

Runtime orientation and placement:

- X runs west/east; the shaft tower is on positive X so it reads on the left
  from the game's default front three-quarter camera.
- Runtime negative Z is south/front; the portico faces south.
- The horizontal origin is the center of the large 15×6 footprint.
- Local Y=0 is ground contact on the continuous foundation.
- Both LODs have authored bounds of approximately X `-7.45..7.45`,
  Y `-2.95..2.97`, and Z `0..6.12` before glTF axis conversion.
- The meshes remain strictly inside the 15×6 footprint.
- `mine_resource_anchor` is an exported Empty under the west shaft at local
  runtime position derived from the generated tower center. It records the future resource
  relationship only; current placement does not require a deposit.

Stable opaque material names:

- `mine_light_stone`
- `mine_dark_stone`
- `mine_dark_metal`
- `mine_solar_panels`
- `mine_metal_doors`
- `mine_windows`
- `mine_timber`
- `mine_weathered_stone`

LOD0 is 9,554 triangles and LOD1 is 7,656 triangles. LOD1 is authored separately
to preserve the open tower, dominant winding wheel, timber braces, long roofline,
columned entrance, six machinery entrances, and twin-chimney silhouette instead of
relying on generic decimation.

## Arcaded warehouse contract

The first destination/logistics building shares the deterministic environment
GLB and is exported as two joined, multi-material meshes:

- `warehouse_lod0`
- `warehouse_lod1`

The warehouse uses a 15×6 footprint. Its horizontal origin is the footprint
center and local Z=0 is ground contact before glTF axis conversion. Runtime
negative Z is the loading facade. Both LODs stay inside authored bounds X
`-7.460..7.488`, Y `-2.900..2.900`, and Z `0..4.271`.

The defining forms are six unobstructed recessed vehicle bays beneath a continuous
loading canopy, ten upper front arches, twelve rear service arches, a classical
end receiving pavilion with a large arched door, a rear service door, a repeated
masonry bay rhythm, a broad solar field, three roof vents, and a marked loading apron. Vehicles,
roads, inventories, and physical cargo remain separate gameplay work.

LOD0 is 7,699 triangles and LOD1 is 5,402 triangles. LOD1 is authored
separately so the canopy, loading rhythm, end pediment, roof field, and vents
retain their silhouettes.
