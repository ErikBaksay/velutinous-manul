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
