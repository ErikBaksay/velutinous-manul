# Mine and warehouse model design QA

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

## Warehouse blueprint comparison

### Evidence

- Primary blueprint: `/tmp/codex-clipboard-44ec822c-fcc5-4394-93c5-ae0337eb6026.png`.
- Superseded compact render: `/tmp/codex-clipboard-ede327f8-5716-4e07-82e9-f3008c1a665d.png`.
- Authored three-quarter render: `art/environment/warehouse-preview.png`.
- Front/loading elevation: `art/environment/warehouse-front-elevation.png`.
- Rear/service elevation: `art/environment/warehouse-rear-elevation.png`.
- Classical receiving end: `art/environment/warehouse-receiving-end.png`.
- Top/roof view: `art/environment/warehouse-top.png`.
- Browser-rendered implementation: `art/environment/warehouse-in-game.jpg`.
- Browser state: corrected warehouse placed at cell 1009,208 and saved as `Warehouse 15x6 QA`.

### Proportion correction pass — 20 resolved differences

1. Replaced the undersized 8×4 footprint with a broad 15×6 footprint.
2. Extended the enclosed hall from 7.42 to approximately 14.4 units.
3. Increased enclosed depth from 2.70 to approximately 4.60 units.
4. Rebalanced the mass into the blueprint's long, low depot silhouette without raising it vertically.
5. Increased the loading inventory from four to six truck bays.
6. Enlarged each loading door from 1.02×1.42 to approximately 1.45×1.65 units.
7. Layered dark portals, doors, jambs, and lintels to create visibly recessed loading openings.
8. Increased the front arcade from five to ten narrow arches.
9. Increased the rear/service arcade from six to twelve arches.
10. Tightened the front and rear pilaster cadence into a repeated modular masonry rhythm.
11. Extended the canopy from 6.35 to 11.80 units across every loading bay.
12. Deepened the canopy from 0.72 to 1.00 unit.
13. Replaced thin 0.15-unit canopy posts with 0.22×0.24 structural piers.
14. Deepened the loading apron to 1.10 units and added dock-edge and bay center markings.
15. Recast the receiving pavilion as one terminal module rather than a dominant half-building mass.
16. Added a layered entablature, stepped shoulders, pilaster bases/caps, inset stonework, and a framed pediment.
17. Enlarged the receiving door to approximately 1.80×2.70 units and added a projecting archivolt.
18. Replaced the compact-looking roof with a broad, shallow-pitch metal roof behind a continuous cornice.
19. Expanded the solar field to approximately 11×2.2 units with a full panel grid and three restrained vents.
20. Introduced warehouse-only neutral/weathered masonry values, dark recesses, and restrained warm loading lights without changing mine materials.

The presentation's road network, parking field, fences, trucks, containers, and tanks remain contextual follow-up assets. The integral marked apron is included because it is part of the building's loading interface.

### Fidelity result

The corrected warehouse now has the proposal's defining identity and proportions: a broad low arcaded masonry hall, continuous six-bay loading canopy, dense upper arcade, classical terminal receiving pavilion, long rear service rhythm, low dark roof, large blue-black solar field, roof vents, marked apron, and warm exterior fixtures. It reads as a serious depot/logistics destination rather than the former compact block.

### Warehouse verification

- Definition ID: `velutinous-manul-warehouse`; footprint: 15×6.
- Asset IDs: `warehouse_lod0`, `warehouse_lod1` in the existing shared GLB.
- LOD0: 7,699 triangles; LOD1: 5,402 triangles.
- Both LODs: approximately X[-7.460,7.488], Y[-2.900,2.900], Z[0,4.271].
- Deterministic Blender validation: passed twice during final generation/export.
- Angular browser suite: 30 files, 100 tests passed.
- Production Angular build and e2e TypeScript check: passed; the pre-existing 11-byte stylesheet budget warning remains.
- Browser flow: non-buildable and map-boundary invalid previews, valid authored placement at 1009,208, 15×6 selection, removal, manual save, leave, and reload all passed.
- Reloaded browser view reconstructs the authored `warehouse_lod0`/`warehouse_lod1` family; the running development server reports clean rebuilds with no runtime compilation errors.
- Mine preservation: LOD0/LOD1 remain 9,554/7,656 triangles with unchanged 15×6 bounds and stable definition/asset IDs.

## Follow-up polish

- [P3] A later texture budget could add individual stone-block variation, grime, bolts, and timber grain beyond the current opaque low-poly materials.
- [P3] Fine maintenance railings and wheel-rim fasteners from the close-up reference can be added without changing the accepted silhouette.
- [P3] World vegetation is not cleared beneath placed buildings yet; this is an environment-placement concern rather than a mine-asset geometry mismatch.
- [P3] Vegetation also remains beneath the warehouse footprint; clearing belongs to the shared placement/environment system.
- [P3] Physical dock bumpers, cargo props, road markings, and trucks should arrive with the later transport slice rather than being baked into this asset.

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
