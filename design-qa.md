# Mine model design QA

## Evidence

- Primary source visual: `/tmp/codex-clipboard-d8b3dcec-00b6-4081-84fa-84d95c437324.png` (659×362).
- Service elevation source: `/tmp/codex-clipboard-ddfdf627-aee7-4625-9362-296a7213adc3.png` (493×125).
- Headframe detail source: `/tmp/codex-clipboard-d090d077-80c2-4916-a050-49b29d4f0e36.png` (1456×1086).
- Three-quarter implementation: `art/environment/mine-preview.png` (1100×700).
- Front and rear implementation elevations: `/tmp/mine-front-elevation.png` and `/tmp/mine-rear-elevation.png` (1400×620).
- Headframe implementation detail: `/tmp/mine-tower-closeup.png` (900×900).
- Browser-rendered implementation: `art/environment/mine-in-game.jpg` (1144×902 viewport, 1× density).
- Normalized comparisons: `/tmp/mine-full-comparison-v2.png`, `/tmp/mine-elevation-comparison-v2.png`, and `/tmp/mine-tower-comparison-v2.png`.
- Browser state: fresh balanced-continental world, 15×6 mine placed at cell 559,774 and inspected at close zoom.
- Nature baseline: `/tmp/codex-clipboard-6f866e42-c9f0-4ec8-8b2d-9d86ee6ae9f2.png` (1920×998, deployed commit `271a5f4c924e2ebd2a46688159a735115475ccc2`).
- Nature implementation: `/tmp/fixed-nature-world.png` (750×900 browser viewport, 1× density).
- Nature comparison: `/tmp/nature-fixed-comparison.png`, normalized to an 800px content height. The source and implementation use different deterministic world sessions, so this comparison is used for asset silhouette and art-direction fidelity rather than placement matching.

## Required fidelity surfaces

- Fonts and typography: not applicable to model geometry. The construction UI correctly reports the 15×6 footprint.
- Spacing and layout rhythm: passed. The rebuilt composition has the long hall, deep foundation, tower court, tower-adjacent entrance, five window bays, paired loading doors, end window, four service gates, and east chimney termination shown by the references.
- Colors and visual tokens: passed for the established low-poly game style. Stone, weathered masonry, dark metal, timber, glazing, doors, and solar materials preserve the reference hierarchy without the previous bright cartoon treatment.
- Image quality and asset fidelity: passed. All defining forms are authored Blender geometry in the exported GLB; no placeholder image or approximate UI drawing is used.
- Copy and content: passed. Stable asset IDs and registry paths are unchanged, while the footprint label is updated.
- Nature fidelity: passed. Runtime trees again use the established upright procedural compatibility kit; single-mesh shrubs, grass, reeds, rocks, shore assets, driftwood, and ores retain their authored loading path.

## Full-view comparison

The normalized three-quarter comparison confirms the reference silhouette: broad braced headframe on the left, tall open winding stage, full entrance at the tower/hall transition, long low extraction hall, repeated roof vents, large inset solar field, grouped truck doors, and paired east chimneys. The former compressed 9×3 church-like mass is gone.

## Focused comparisons

- Service elevation: one personnel entrance, four clear machinery gates, upper vents, solar field, tower at the opposite end, and uninterrupted bay dividers now follow the elevation reference.
- Headframe: the tower has a recessed twin-rim wheel, visible axle and cradle, open four-pier stage, squared braces, cross ties, masonry court, anchored feet, layered cornice, and restrained cap. The primary concept controls the low cap where the detailed headframe image differs.
- Facade clearance: generator assertions reject any window, gate, or personnel opening intersected by a facade divider. Blender bounds validation also confirms both LODs remain inside 15×6.

## Comparison history

### Pass 1 — blocked

- [P1] The 9×3 massing was substantially too short and narrow.
- [P1] The tower-adjacent main entrance and reference facade sequence were missing.
- [P1] Independently positioned pilasters crossed windows and vehicle gates.
- [P1] Gates were narrow, scattered garage doors instead of paired truck entrances.
- [P1] The headframe was squat, weakly supported, and insufficiently recessed.
- [P2] The service elevation did not reproduce the four-gate rhythm.

Fixes: rebuilt the model around a 15×6 layout; replaced the monolithic facade with modular opening bays; added the full entrance, five window bays, paired front gates, end window, personnel entrance, and four rear gates; rebuilt the tower, wheel, braces, court, roof, vents, solar field, and chimneys.

### Pass 2 — blocked

- [P2] The service elevation lost the solar field behind the roof ridge.

Fix: added the corresponding rear-slope solar field and panel grid, then regenerated both LODs and all comparison renders.

### Pass 3 — passed

The post-fix three-quarter, elevation, headframe, and browser comparisons contain no actionable P0, P1, or P2 mismatch. The 15×6 asset placed successfully in the actual world session, retained the authored materials and LOD geometry, and produced no browser console errors.

### Nature pass 1 — blocked

- [P1] Composite GLTF tree groups replaced the deployed procedural trees and rendered with their canopy-stacking axis horizontal, producing short wedge-like conifers and compressed broadleaf crowns.
- [P2] Grounding rock sources before decimation changed the LOD1 silhouettes of pebbles, boulders, outcrops, and shore stones.

Fixes: limited composite GLTF loading to the building family, restored the procedural compatibility path for grouped trees, and generated rock LOD1 before grounding the source asset.

### Nature pass 2 — passed

The browser-rendered world shows upright conifers, distinct trunks, full broadleaf crowns, grounded understory, and restored distant rock massing. The normalized comparison contains no actionable P0, P1, or P2 asset-fidelity regression. The vegetation placement differs because the supplied deployed screenshot is from another deterministic world session; geometry contracts and exact LOD bounds were used to verify the underlying asset restoration.

## Follow-up polish

- [P3] A later texture budget could add individual stone-block variation, grime, bolts, and timber grain beyond the current opaque low-poly materials.
- [P3] Fine maintenance railings and wheel-rim fasteners from the close-up reference can be added without changing the accepted silhouette.
- [P3] World vegetation is not cleared beneath placed buildings yet; this is an environment-placement concern rather than a mine-asset geometry mismatch.

## Verification

- Blender LOD0: 9,554 triangles; bounds X[-7.450,7.450], Y[-2.950,2.970], Z[0,6.120].
- Blender LOD1: 7,656 triangles; same footprint bounds.
- Facade inventory and opening-divider clearance assertions: passed.
- Angular browser suite: 29 files, 95 tests passed.
- Manual browser flow: generated world, accepted world, selected Mine, placed 15×6 asset, zoomed for inspection, switched back to Select.
- Browser console errors: none.
- Nature inventory validation: all 15 base assets include grounded LOD0/LOD1 geometry with per-axis silhouette retention between 84% and 135%.
- Restored rock LOD1 runtime bounds match commit `271a5f4…` for pebbles (`0.504×0.452×0.426`), boulders (`1.296×1.163×1.097`), outcrops (`1.889×1.696×1.599`), and shore stones (`0.756×0.678×0.640`).
- Mine preservation: staged and regenerated LOD0/LOD1 geometry hashes match exactly (`3c347d…` and `da6780…`).
- Browser nature check: loaded the autosaved balanced-continental world, inspected both forest types and open understory, and confirmed the mine remains visible in the regenerated shared GLB.

final result: passed
