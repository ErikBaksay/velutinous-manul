# Velutinous Manul — Development Plan

## How to use this document

This document describes how we are getting from an empty repository to the game described in [`GAME_DESIGN.md`](./GAME_DESIGN.md). It is intentionally changeable. Update it after each approved milestone and after important technical or design decisions.

Every implementation milestone is small enough to run and manually test. Work pauses after the milestone until the user reviews it and approves the next step.

## Current status

- **Final target:** A browser-first 3D sandbox logistics and industry builder with beautiful traditional settlements, modern industry, and electric road transportation.
- **Current development stage:** Stage 1 — browser and 3D foundation with the first generic mine-to-warehouse gameplay slice implemented; Map Generation v1 Gate 6.3 approved for map creation and preview.
- **Completed work:** Repository inspection; game direction captured in `GAME_DESIGN.md`; incremental workflow captured in `PROJECT_WORKFLOW.md` and this document; Map Generation v1 Gates 1 and 2 plus Gate 3, Gates 4.1–4.2, Gate 5.1, Gate 5.2a–5.2b, Gate 5.3, Gates 6.1–6.3 implemented and manually approved; Milestone 2 dedicated start screen and session routing; Milestone 3 IndexedDB, autosave, named saves, and portable import/export; Milestone 5 pure construction data, footprint, occupancy, and placement validation foundations; Milestone 6 terrain selection, placement, removal, and save/reload; Milestones 7–8 classical shaft-house asset contract and authored runtime integration; Milestone 9 arcaded warehouse authored asset and construction integration; Milestone 10 generic mineral production and warehouse transfer.
- **Current task:** Review the generic mine-to-warehouse browser slice and its typed save/reload state in the world session.
- **Next planned work:** Record manual gameplay feedback, then add roads and physical transport only after this deterministic transfer slice is approved.
- **Deferred systems:** Remaining production chains, physical trucks, settlements, electricity, procedural generation, economy, progression, large maps, and all other systems listed as long-term scope until the prerequisite slice is working.
- **Known limitations / technical debt:** Chunk streaming is bounded by the provisional 576-chunk desired budget, so prefetch work can be rejected when a broad view consumes the budget. The camera intentionally limits elevation to 40°–88° and zooms to a map-safe range. Biome, tree, and resource colors are provisional and may receive a later three-option visual design review. Angular's browser unit tests and Playwright runs require a local browser plus permission to bind their test servers; the full-resolution map-generation tests run separately through `npm run test:map`.
- **Naming convention:** Use the full game name, `Velutinous Manul`, in game-facing text, code-owned identifiers, seeds, save formats, and documentation. Do not abbreviate the project name.

## Delivery and approval gates

1. Define one tiny implementation step.
2. Make only the changes required for that step.
3. Run automated checks that are appropriate to the step.
4. Start the local app when relevant.
5. Tell the user exactly what to inspect manually.
6. Pause for the user's test result and approval.
7. Update this plan with the result.
8. Begin the next step only after approval.

No large batch of unreviewed features should cross an approval gate.

During intermediate milestones, use targeted checks for the riskiest changes plus manual review; do not spend time running the full unit/e2e suite after every milestone. Run the complete verification suite only after multiple milestones, when the user explicitly requests it.

## Proposed incremental roadmap

### Stage 0 — Definition and visual alignment

- [x] Inspect the repository and attached game brief.
- [x] Record the long-term game design.
- [x] Record collaboration, design, testing, and Git boundaries.
- [x] Choose the initial visual/runtime direction from three proposed directions.
- [x] Record the selected direction and unresolved visual questions.

### Stage 1 — Browser and 3D foundation

This stage proves that the project can render a lightweight Three.js world in the intended Angular/browser stack.

- [x] Step 1: scaffold the smallest Angular/TypeScript application with a Three.js canvas and a neutral empty map surface.
- [ ] Step 2: add a stable render loop, resize handling, and a clear scene lifecycle.
- [ ] Step 3: add the initial camera interaction: pan, zoom, and the chosen orbit/rotation behavior.
- [ ] Step 4: add a basic ground plane and an underlying grid representation.
- [ ] Step 5: add simple lighting, fog/atmosphere if approved, and a restrained debug overlay.
- [ ] Step 6: pause for manual review of camera feel, readability, performance, and visual direction.

**Stage exit condition:** The user can open the local game, inspect a stable 3D scene, move the camera, and understand the underlying play area.

### Stage 2 — First construction interaction

- [ ] Step 1: define a small typed world-state model for cells and placed objects.
- [ ] Step 2: make one grid cell selectable.
- [ ] Step 3: show a placement preview with valid/invalid feedback.
- [ ] Step 4: place one simple building and keep it in the world state.
- [ ] Step 5: allow removal or reset of the placed building.
- [ ] Step 6: pause for manual placement testing.

**Stage exit condition:** A player can select a cell, preview a building, place it, see it persist in the scene, and undo/reset it.

### Stage 3 — Roads and the first transport-friendly map

- [ ] Step 1: place a road segment on grid cells.
- [ ] Step 2: join road segments and validate connections.
- [ ] Step 3: create one small resource point, one extraction building, one processing building, and one destination/warehouse.
- [ ] Step 4: connect the locations with roads.
- [ ] Step 5: pause for manual map composition and readability review.

**Stage exit condition:** The first meaningful map has roads linking a tiny production chain and is pleasant to inspect.

### Stage 4 — Minimal production simulation

- [ ] Step 1: add one resource inventory.
- [ ] Step 2: produce one raw resource from the extraction building.
- [ ] Step 3: convert the raw resource in the processing building.
- [ ] Step 4: move material between buildings through a simple request/transfer model.
- [ ] Step 5: expose only the minimum UI needed to understand the flow.
- [ ] Step 6: pause for manual simulation testing.

**Stage exit condition:** A visible, understandable one-resource production chain runs from extraction to processing to destination.

### Stage 5 — First physical electric truck

- [ ] Step 1: represent one truck and its route request.
- [ ] Step 2: move the truck along the road network.
- [ ] Step 3: load and unload the first resource.
- [ ] Step 4: add basic battery/range state only if needed for the first useful behavior.
- [ ] Step 5: pause for manual logistics testing.

**Stage exit condition:** The player can watch a truck physically transport the first resource over roads and observe the resulting production flow.

### Stage 6 — Small playable vertical slice

Combine the proven systems into one deliberately small sandbox:

```text
3D terrain
+ camera controls
+ grid
+ building placement
+ roads
+ one resource
+ one extraction building
+ one processing building
+ one warehouse/destination
+ one functioning electric truck
+ basic transport
```

Add only the interface and feedback needed to make this slice understandable. Stop for a full manual playtest before expanding the system count.

### Stage 7 — Settlements and electricity

Introduce a small worker settlement, basic worker demand, simple electricity generation/consumption, and one charging station only after the logistics slice is stable.

### Stage 8 — Expansion and content growth

Add more recipes, industries, vehicle types, settlement progression, regional planning, procedural terrain, saving/loading, operating economics, and other long-term systems one approved slice at a time.

## Architectural decisions to preserve

- Keep simulation state independent from Three.js scene objects.
- Keep rendering, input, simulation, and UI responsibilities separate enough to test and replace independently.
- Use typed data structures for grid cells, buildings, roads, resources, vehicles, and deliveries.
- Prefer deterministic, inspectable simulation behavior during early development.
- Use a grid as the underlying construction and pathfinding structure even when the rendered terrain becomes organic.
- Keep the first data model small; add abstractions when a second real use case requires them.
- Prefer lightweight procedural or primitive visuals early so gameplay systems can be tested before asset production.
- Do not couple the first playable slice to a backend, cloud service, or large asset library.

## Known deferred decisions

- Exact initial visual direction and camera behavior.
- Final UI layout and information density.
- Asset creation pipeline and model format.
- Whether Angular should own the game shell only or also selected UI state.
- Final procedural world size and streaming strategy.
- Full electricity model, vehicle battery model, and economic balance.

## Approved persistence and entry-flow decisions

### 2026-08-13 — Browser-local persistence

- **Decision:** Use IndexedDB as the primary local save store, with explicit export/import through portable save files. No backend, account system, or cloud synchronization is planned for the initial game.
- **Selected direction:** IndexedDB + export/import.
- **Rejected alternatives:** Seed/configuration-only saves were rejected because loading would depend on regenerating the map and could change old worlds when the generator evolves. File-first saves were rejected because requiring manual file management for ordinary play adds friction and makes autosaving less reliable.
- **Consequences:**
  - The game can support multiple local save slots and resume without regenerating the map every time.
  - Export/import provides backup, transfer, and recovery when browser storage is cleared or unavailable.
  - Save data must be versioned, validated, and designed for migration from the beginning.
  - Three.js render objects, chunk caches, workers, and other runtime objects must not be serialized; saves contain map/session data that can rebuild the runtime scene.
  - IndexedDB quota errors, private browsing restrictions, browser data clearing, and corrupted files require visible recovery messages and an export path.
  - `localStorage` is reserved for lightweight preferences and the last active save reference, not authoritative world data.
- **Implementation implication:** The initial save contract should distinguish map identity/configuration, authoritative map data, and mutable gameplay state. The current technical preference is to retain the generated authoritative map snapshot so generator changes do not rewrite an existing world, subject to final save-size validation.

### 2026-08-13 — Dedicated start screen

- **Decision:** Start the game in a dedicated entry screen with three primary choices: **Continue**, **Load Save**, and **New World**. Import and export belong inside the Load Save flow rather than being top-level start-screen actions.
- **Selected direction:** Dedicated start screen.
- **Rejected alternatives:** Workshop-first was rejected because it makes creating a new world and resuming an existing one less distinct. Automatic resume was rejected because it is less clear for first-time players and makes recovery from a broken or unwanted last save less obvious.
- **Consequences:**
  - Application startup must stop generating a map automatically before the player chooses New World or Continue.
  - New World opens the Map Workshop and creates a new session only after the player accepts the generated map.
  - Continue requires a remembered last-active save reference and must gracefully fall back to Load Save when no valid continuation exists.
  - Load Save becomes the home for save-slot selection, import, export, deletion, and recovery messaging.
  - The map workshop remains focused on world creation; save management does not need to crowd the workshop controls.
- **Resolved in Milestone 3:** Save-slot naming, manual-save versus autosave behavior, deletion/recovery rules, and the portable save-file format are recorded below.

### 2026-08-13 — Milestone 3 save behavior and portable format

- **Decision:** Use named manual saves plus one visible, protected `Autosave` slot. Create the first Autosave when a world is accepted, refresh it every five minutes while the world is active, and refresh it before explicit Leave World.
- **Decision:** Add slot names and slot kind to schema version 2. Continue reading version-1 portable files by migrating them to named manual saves with a deterministic fallback name.
- **Decision:** Use JSON envelopes with base64-encoded typed arrays for portable saves. Imported files receive fresh local IDs, become manual saves, and require a new name when a name collision occurs.
- **Decision:** Store authoritative save payloads and lightweight slot metadata in separate IndexedDB object stores. Store only the last-active save ID in `localStorage`.
- **Decision:** Autosave is visible and exportable but protected from rename and deletion. Manual deletion requires confirmation; manual name collisions require overwrite confirmation.

## Current implementation plan after map-preview approval

Each milestone below is intentionally small and receives its own automated checks and manual approval gate.

### Milestone 1 — World-session and save contract

- Define `WorldSession`, versioned `SaveGame`, save-slot metadata, and the separation between map identity/configuration, authoritative map data, and mutable gameplay state.
- Define serialization boundaries so Three.js meshes, materials, workers, chunk caches, and other runtime objects are never stored.
- Keep the first contract ready for buildings without adding production, roads, vehicles, or economy.

**Exit condition:** The application has a typed, versioned representation of an empty playable world that can later contain placed buildings.

### Milestone 2 — Dedicated start screen and session routing

- Replace automatic map generation on application startup with the approved start screen.
- Add Continue, Load Save, and New World states.
- Make New World open the existing Map Workshop and make Continue/Load Save enter a world session.
- Handle empty-save and missing-last-save states clearly.

**Exit condition:** The player can navigate between the start screen, Map Workshop, and an empty world session without ambiguous transitions.

### Milestone 3 — IndexedDB and portable save persistence

- Implement the IndexedDB repository for multiple local save slots.
- Add save, load, delete, and last-active-save tracking.
- Add export/import inside Load Save with format validation and version checks.
- Keep `localStorage` limited to lightweight preferences and the last-active-save reference.

**Exit condition:** An empty world can be saved, loaded, deleted, exported, and imported through the intended UI flows.

**Implementation status:** Complete pending manual review. Added schema-versioned save slots, transactional IndexedDB storage, last-active tracking, five-minute Autosave, named manual saves, portable JSON/base64 export/import, v1 migration, validation, and visible storage/validation feedback in the entry and world-session flows.

### Milestone 4 — Empty-world round-trip approval

- Test the complete flow: New World → generate → accept world → save → reload application → Continue.
- Confirm the same map identity, map data, and session state are restored.
- Test import/export recovery and visible storage or validation errors.

**Exit condition:** The user approves the persistent empty-world flow before construction work begins.

### Milestone 5 — Construction data foundation

- Define grid-coordinate conversion, cell occupancy, building definitions, placed-building instances, and building serialization.
- Define generic placement validation for map bounds, buildability, water, terrain slope, occupancy, and footprint.
- Keep the rules data-driven so the mine is not hard-coded into the renderer.

**Exit condition:** A building can be represented and validated in world state without requiring a final 3D model.

**Implementation status:** Complete pending focused review. Added pure grid-coordinate, rectangular-footprint, data-driven definition, derived occupancy, terrain sampling, and generic placement-validation modules under `src/app/construction/`. Existing schema-version-2 placed-building state remains unchanged, and structured-clone plus portable JSON/base64 round-trip coverage now includes multiple placed buildings and unknown future definition IDs.

### Milestone 5 construction decisions — 2026-08-13

- **Footprint convention:** Use an integer anchor rectangle. `origin` is the canonical rectangle's minimum-x/minimum-y cell. Quarter-turns rotate local cells around that anchor, normalize to non-negative offsets, and swap width and height for odd rotations.
- **Terrain policy:** Use definition-driven placement profiles with independent `requiresBuildable`, `allowWater`, `allowImpassable`, and `maxSlope` fields. Ordinary land structures provide strict policies; future bridges may opt into water or impassable surfaces, while bridge connection and endpoint rules remain a later concern.
- **Rejected footprint alternatives:** Center anchors were rejected because even-sized footprints require an additional half-cell or bias convention before the mine pivot is known. Explicit rotated cell masks were deferred because no current building requires irregular geometry.
- **Rejected terrain alternatives:** A permanent strict baseline was rejected because bridges and other special structures need different surface permissions. A composable rule pipeline was deferred because it would add footprint-level semantics before a real second rule type exists.

### Milestone 6 — Selection and placeholder mine placement

- Add cell selection and a selected-cell highlight.
- Add a configurable placeholder mine footprint and placement preview.
- Add valid/invalid feedback, placement, removal, and cancellation.
- Save and reload the placed placeholder mine.

**Exit condition:** The user can place and remove a placeholder mine, save it, reload it, and find it in the same location.

**Implementation status:** Complete and manually approved. Added terrain-mesh raycast selection, Select and Mine tools, an initially 2×2 strict-land placeholder mine (subsequently enlarged to 7×3 for the authored asset), valid/invalid preview feedback, multiple placement instances, removal, and red primitive visuals. Existing schema-version-2 gameplay state remains unchanged, including unknown-definition preservation.

### Milestone 6 decisions and verification — 2026-08-13

- **Selection surface:** Raycast only currently attached terrain chunks and convert the hit x/z position through the existing grid-coordinate utilities. Navigation-plane fallback was rejected because construction selection should reflect the rendered terrain and should not silently select during a streaming gap.
- **Construction interaction:** Use a Select/Mine tool palette. Mine mode previews on terrain hover and places on a valid click; Cancel returns to Select. Rotation controls, roads, production, economy, vehicles, and resource binding remain deferred.
- **Placeholder scope:** Support multiple generic `velutinous-manul-placeholder-mine` instances with deterministic IDs and no deposit/resource association. The definition now uses a 7×3 footprint and strict-land policy (`maxSlope: 0.2`).
- **Visuals:** Use translucent bordered cell tiles for selection and green/red footprint previews. Placed mines use simple opaque red boxes; the final mine model remains deferred to Milestone 8.
- **Save/reload synchronization:** Persisted `placedBuildings` was present after reload, but async world-save completion could leave the scene visual set stale. Construction occupancy and visuals now resynchronize whenever the active world is replaced during initial load, manual save, autosave, placement, or removal.
- **Manual verification:** Confirmed placement, multiple-instance behavior, removal, manual save, leave/reload, and same-location mine reconstruction in the local browser. No files were staged, committed, or pushed.

### Milestone 7 preparation — 2026-08-13

- The existing environment asset contract is available in `art/environment/README.md`: one world unit per terrain cell, Y-up, origin at ground contact, applied transforms, simple opaque materials, stable names, and paired LOD0/LOD1 geometry.
- At the time of this preparation note, no mine blueprint, mine source scene, or mine asset specification was present in the workspace. A classical shaft-house blueprint was subsequently supplied in chat on 2026-08-18; its printed dimensions are approximate and potentially incorrect, so it is general visual guidance rather than an exact drafting source.
- No mine source scene or mine runtime asset has been added to the repository. Mine geometry remains deferred until the Milestone 7 contract is approved.

### Milestone 7 — Mine blueprint and asset contract

- Review the supplied mine blueprint as approximate guidance for its silhouette, composition, architectural vocabulary, and material mood. Preserve the west shaft tower/headframe, long central hall, south portico, east utility/loading end, twin chimneys, dark roof, and main solar array; regularize contradictory counts of small roof and facade details.
- Preserve the approved construction and save contracts: definition ID `velutinous-manul-placeholder-mine`, 7×3 footprint, rotation `0`, integer minimum-cell save origin, schema version 2, deterministic instance IDs, unknown-definition preservation, and the existing terrain policy (`requiresBuildable=true`, `allowWater=false`, `allowImpassable=false`, `maxSlope=0.2`).
- Use the runtime's existing visual anchor: the horizontal center of the 7×3 footprint at the average elevation of its cells. The asset's joined LOD mesh therefore needs a centered X/Z origin and ground contact at local Y=0; the saved minimum-cell origin does not become the model pivot.
- Keep the model rigid and within the logical 7×3 footprint. Use a shallow opaque foundation/plinth to tolerate the already-permitted slope rather than deforming the asset to terrain.
- Treat all printed blueprint dimensions as non-binding. Select the final uniform game scale from an in-engine blockout, then reuse exactly the same ground alignment and bounds for LOD0 and LOD1.
- Keep Milestone 7 documentation-only. Do not add mine geometry, resource placement enforcement, a new save field, or runtime registry behavior before the decisions below are approved.

#### Milestone 7 repository findings — 2026-08-18

- The repository was clean on `main` when this plan was reconciled; no staged or unstaged handoff changes remained to preserve.
- `GameScene.setPlacedBuildings()` currently centers the placeholder from its rotated footprint, averages terrain elevation across the footprint, and renders a disposable red box. This is the Milestone 8 visual replacement seam.
- `VisualAssetRegistry` currently recognizes environment prototypes by stable `_lod0`/`_lod1` mesh names, bakes authored transforms into geometry, and supports one material or a material array per joined mesh.
- The current deterministic Blender script exports one self-contained `public/assets/environment/environment.glb` plus `manifest.json`. It creates LOD1 with a generic decimate modifier; the mine will need an authored/silhouette-aware LOD1 even if it shares this export.
- The registry has no building family and no grouped-scene building API. A composed multi-node mine would therefore require more runtime architecture than a joined mesh per LOD.
- Blender 5.1.1 was found in the user's portable application directory and executed directly. The deterministic build, `.blend` save, GLB export, re-import validation, and review render all completed in the current environment.

#### Milestone 7 approved design decisions — 2026-08-18

The user directed the complete plan to be implemented in one pass after the recommended directions were presented. The implementation therefore uses the recommended direction for each decision below.

**Decision 7A — Game-scale massing**

1. **Selected — Footprint-filling, blueprint-faithful:** Enlarge the construction footprint to 7×3 so the long axis, broad headframe braces, hall depth, and tower can retain the proposal's proportions with a small boundary margin.
2. **Compact industrial landmark:** Rejected after visual review because the 2×2 occupancy made the building read undersized and compressed compared with the proposal.
3. **Tower-emphasized interpretation:** Keep the plan envelope moderate but increase the tower/headframe's relative height during blockout. Improves distant recognition, but intentionally departs from the approximate reference proportions.

The compact and tower-emphasized alternatives were rejected because the selected model needed to stay as close to the supplied composition as the fixed footprint permits.

**Decision 7B — Fixed rotation-0 orientation**

1. **Selected — Proposal-facing presentation:** The front portico faces south (`-Z`); the authored X composition is mirrored so the tower reads on the left and the chimneys on the right from the default front three-quarter camera.
2. **Front-facing north:** Keep the tower west but mirror the facade so the portico faces `+Z`. May suit a preferred camera approach, but contradicts the blueprint's front/south label.
3. **Quarter-turned presentation:** Put the long axis on Z and choose an east- or west-facing portico. May frame better from some cameras, but makes rotation 0 diverge most strongly from the supplied plan.

The mirrored and quarter-turned alternatives were rejected because the blueprint's labeled compass provides an unambiguous rotation-0 contract.

**Decision 7C — Future resource-deposit relationship**

1. **Selected — Named shaft locator, deferred enforcement:** Include a stable semantic anchor under the west shaft in the authoring contract, but leave Milestone 6 placement validity and saved state unchanged until resource binding is implemented. Preserves architecture while giving the future system an explicit extraction point.
2. **Any deposit under the footprint:** Document a future rule that accepts a compatible deposit beneath any of the four occupied cells. Simpler gameplay validation, but less faithful to the visible shaft location.
3. **Defer the relationship entirely:** Add no locator or rule yet. Minimizes Milestone 7 scope, but risks requiring an asset-origin or mesh-contract change when resource extraction arrives.

The any-cell and no-locator alternatives were rejected because the visible shaft supplies a natural future extraction point without requiring a current save or placement change.

**Decision 7D — Runtime asset packaging**

1. **Selected — Joined mine mesh per LOD in the existing GLB:** Export `mine_shaft_house_lod0` and `mine_shaft_house_lod1` with stable material slots, and extend the current registry with a building family. Smallest change to the proven pipeline and compatible with the current prototype representation.
2. **Separate building GLB and registry:** Create a dedicated building manifest/loader. Cleaner long-term separation from streamed environment scatter, but introduces a second asset pipeline and more Milestone 8 architecture.
3. **Composed multi-node mine scene:** Preserve modules as separately named runtime nodes and add grouped-scene loading. Offers maximum per-module flexibility, but is unnecessary for a static first mine and requires the largest loader/rendering change.

The separate pipeline and composed-scene alternatives were rejected because the first static mine can use the existing manifest and prototype registry. The loader now merges a named multi-material glTF group into one runtime prototype while retaining material groups.

#### Milestone 7 execution and approval gate

1. [x] User selected the recommended Decisions 7A–7D by directing the presented plan to be implemented completely.
2. [x] Record selected and rejected directions, stable names, material slots, bounds, and LOD budgets here and in `art/environment/README.md`.
3. [x] Preserve the placement/save architecture and validate the contract through the deterministic Blender build and focused checks.

**Exit condition:** The mine model can be created without changing the placement or save architecture.

### Milestone 8 — First mine model integration

- **Step 8.1 — Approved blockout:** Add the major mine masses and final ground alignment to the deterministic Blender source. Export a joined `lod0` blockout, register it through the approved packaging direction, and tune it inside the enlarged 15×6 footprint. Run asset-name/bounds checks, focused TypeScript checks, and a placement manual test; then pause for approval.
- **Step 8.2 — LOD0 form and materials:** Add the approved silhouette-defining architecture and simple opaque materials. Prefer geometry for the headframe, portico, roofline, loading end, and chimneys; use restrained surface treatment for repeated facade and solar-panel detail. Run triangle/material/bounds checks and compare six review views plus gameplay distance; then pause for approval.
- **Step 8.3 — Authored LOD1:** Create a silhouette-aware LOD1 with the exact LOD0 pivot, bounds contract, and material names. Validate LOD switching and distant readability; then pause for approval.
- **Step 8.4 — Final runtime replacement:** Replace only the red placeholder visual at the existing `GameScene.setPlacedBuildings()` seam. Preserve construction definitions, placement rules, occupancy, IDs, schema version, save encoding, and unknown-definition behavior. Run the focused construction/save/terrain tests and both TypeScript no-emit checks; manually test placement, invalid preview, multiple mines, removal, manual save, leave/reload, and reconstruction; then pause for approval.
- **Step 8.5 — Documentation closeout:** Record final asset names, actual approved bounds and triangle counts, build command, checks, and manual approval. Do not begin resource production or another milestone without a new approval.

**Exit condition:** The first mine is a persistent, placeable building in the world, but extraction simulation remains a later milestone.

**Implementation status:** Complete pending manual approval. Blender 5.1.1 generated the source `.blend`, self-contained GLB, `mine_shaft_house_lod0` (9,554 triangles), `mine_shaft_house_lod1` (7,656 triangles), eight stable opaque materials, and a tower-derived `mine_resource_anchor`. The visual registry recognizes the building family and reconstructs joined multi-material prototypes from glTF groups. `GameScene` replaces the red box with cloned authored LOD meshes and switches LOD by orthographic visible height while retaining the red fallback for asset-load failure. The mine now fills a 15×6 footprint and follows the proposal with a long extraction hall, tower-adjacent columned entrance, five uninterrupted window bays, paired front truck gates, four rear machinery gates, an open masonry winding stage, recessed twin-rim wheel, squared structural braces, expanded solar arrays, five roof vents, and twin chimneys. Placement, save schema, deterministic IDs, unknown-definition behavior, and terrain rules otherwise remain unchanged.

### Milestone 9 — Arcaded warehouse destination

- Add `velutinous-manul-warehouse` to the existing construction definition registry with a 15×6 strict-land footprint.
- Author `warehouse_lod0` and `warehouse_lod1` in the shared deterministic Blender/GLB pipeline.
- Preserve the blueprint's long arcaded hall, loading canopy, large vehicle bays, classical receiving end, solar roof, vents, service elevation, and restrained mine-compatible palette.
- Generalize authored-building LOD rendering, placement preview, deterministic IDs, selection, and removal without changing the save schema.
- Verify placement, invalid preview, manual save/reload, removal, asset bounds, LOD loading, and mine preservation in the actual browser world session.

**Implementation status:** Complete pending visual approval. The corrected 15×6 warehouse is placeable from the Construction palette, uses its authored GLB for translucent validation preview and final rendering, persists through manual save/reload, and can be selected and removed. LOD0 is 7,699 triangles and LOD1 is 5,402 triangles; both fill bounds near X `-7.46..7.488`, Y `-2.90..2.90`, Z `0..4.271`. The mine retains its stable ID, 15×6 footprint, LOD names, triangle counts, and bounds. Generic mineral inventory and transfer are implemented in Milestone 10; roads and visible trucks remain deferred.

### Milestone 10 — Generic mine to warehouse mineral transfer

- Replace the iron-specific extraction model with one typed mineral model for iron ore, copper ore, and stone.
- Bind the mine’s authored local resource anchor with quarter-turn conversion, one-cell Chebyshev extraction, nearest-deposit selection, and ID tie-breaking.
- Add schema-v3 production state with shared deposit capacity, mine buffers and totals, typed warehouse inventories, transfer records, and a manual simulation tick.
- Preserve v1/v2 save compatibility, keep authoritative map deposits immutable, and clean up production state when mines or warehouses are removed.
- Extend the world session with generic deposit binding information, explicit warehouse assignment, quantity test IDs, warehouse inventory views, and Run Tick controls.
- Verify unit binding/production behavior, portable and IndexedDB migration/validation, application/e2e type checks, production build, and the deterministic browser transfer flow through save/reload.

**Implementation status:** Implemented. The deterministic simulation uses 10 units per mine per tick, stable mine ordering, immediate full-buffer delivery to the explicitly assigned warehouse, and buffering when unassigned. Unit coverage includes all three mineral kinds, rotations, extraction radius, deterministic ties, shared capacity, exhaustion, buffering, explicit destinations, cleanup, and persistence/malformed-save cases. The browser scenario uses the deterministic world’s valid mineral deposit and verifies assignment, a tick, typed inventory, manual save, leave, load, and persisted quantity. The production build passes with the existing 11-byte global stylesheet budget warning.

## Completed first implementation definition

The original first implementation established the browser/Three.js foundation and map-preview experience with:

- one ground area
- one grid representation
- one camera interaction model
- one or two lightweight placeholder forms for scale
- no production, economy, trucks, settlements, or procedural world yet

This technical and visual checkpoint is complete and manually approved. The current work begins with Milestone 1 above.

## Update log

### 2026-08-09

- Created the initial implementation plan from the attached game definition.
- Confirmed the repository is empty and has no existing application scaffold.
- Established a manual review gate after every meaningful milestone.
- Established that staging and committing remain the user's responsibility.
- Marked the initial visual/runtime direction as pending user selection.
- Generated three independent visual directions for the initial visual/runtime decision; no generated image has been added to the repository as a production asset.
- User selected the first direction as the baseline, rejected the second as too ambitious for a small weekend project, and rejected the third as visually unsuitable.
- User approved sunset lighting and requested the first direction move closer to the original reference composition.
- User later selected the second revised sunset direction and attached a screenshot to remove ambiguity.

## Pending visual decision: initial camera and scene language

The second revised sunset concept is the approved visual target. It defines the first scene's camera framing, visual density, lighting baseline, and placeholder geometry style. The concept is a reference for alignment, not a final asset specification.

- **Status:** Approved; implementation may begin with the first technical slice.
- **Locked direction:** elevated/isometric regional view close to the user's reference, with traditional civic architecture on the left, industry on the right, visible roads/water, lightweight geometry, and sunset lighting.
- **Implementation gate:** Start with the camera/scene foundation only; pause for manual review before adding grid, placement, or gameplay.

## Visual decision log

### 2026-08-09 — Initial direction review

- The first generated direction was accepted as the closest baseline.
- The second generated direction was rejected because its grounded valley presentation was too ambitious and unrealistic for a small weekend project.
- The third generated direction was rejected as visually unsuitable.
- The user requested the baseline composition be brought closer to the original reference screenshot and use sunset lighting.
- Three revised sunset directions were generated; the user selected the second revised direction and supplied a matching screenshot.

### 2026-08-09 — Approved visual target

- **Selected direction:** second revised sunset concept, confirmed by user-provided screenshot.
- **Locked visual constraints:** elevated/isometric regional framing; large traditional civic architecture on the left; dense traditional civic/residential fabric through the center; modern solar-roof industrial campuses on the right; visible road and water corridors; deep copper sunset; lightweight, readable forms suitable for a small browser game.
- **First-slice constraint:** use simple procedural Three.js geometry only; do not build a complete asset library or attempt to reproduce the screenshot as a flat image.

### 2026-08-09 — Stage 1, Step 1 implementation

- Created the Angular 20 application shell and added Three.js.
- Added a standalone `GameScene` with an orthographic elevated camera, sunset lighting, fog, ground, water, bridge, road corridors, civic placeholder buildings, industrial warehouses, solar roofs, a utility plant, and lightweight trees.
- Kept the scene static and procedural; grid, input, construction, production, transport, and simulation remain deferred.
- `npm run build` passes with an initial bundle-size warning caused by the first Three.js inclusion.
- The browser unit-test command builds the test bundle but cannot launch because Chromium is not installed in the environment.
- Local preview is running for manual review; no files were staged or committed.

### 2026-08-09 — Proxy scene removed

- Removed the first composition-probe scene: civic buildings, houses, warehouses, solar roofs, utility plant, roads, bridge, water, trees, and all placeholder geometry.
- Reduced the scene to a large neutral map surface with restrained ambient, sunset, and cool-fill lighting.
- This reset is intentionally not the final map. The next design gate is the grid and resource layer, including how different procedural seeds should be communicated visually.

### 2026-08-09 — Map Generation v1 Gate 1

- Added the map domain foundation under `src/app/map/`.
- Added normalized map configuration, generator versioning, canonical `configHash`, stable `mapIdentity`, and authoritative-data `mapHash`.
- Added deterministic random substreams for terrain, erosion, hydrology, forests, regions, and resources.
- Added water, biome, resource, deposit, summary, and typed-array map-data contracts.
- Added final/peak memory estimation against the v1 budgets.
- Added Gate 1 unit specifications for identity, determinism, hashing, and memory limits.
- `npm run build` passes with the existing Three.js bundle-size warning.
- `npx tsc -p tsconfig.app.json --noEmit` and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- The Angular spec bundle builds, but browser execution is blocked because Chrome is not installed in the environment.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 2

- Added the typed worker request/response protocol with progress, completion, and error messages.
- Added request IDs, worker replacement on regeneration, stale response/error protection, and explicit disposal.
- Added the real bundled worker entry point and a Gate 2 synthetic completion using empty authoritative typed arrays.
- Added transfer-buffer collection for every authoritative typed array and wired a browser smoke request from the application shell.
- Added unit specifications for request replacement, stale-result protection, active errors, progress/completion forwarding, and transferable-buffer coverage.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- The Angular browser test bundle builds, but browser execution cannot start because Chromium is not installed in the environment.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 3.1

- Replaced the empty worker payload with deterministic layered heightfield generation using the terrain substream, domain warping, fractal noise, and preset shaping.
- Added a 32×32 chunk renderer using 33×33 shared-edge vertices per chunk.
- Derived terrain normals from global height samples so neighboring chunk edges use identical source data.
- Added restrained terrain vertex coloring and replaced the neutral plane in the live scene with the generated central terrain region.
- Added deterministic terrain, relief, preset, and chunk-edge normal specifications.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- Local preview is running for manual review; water, erosion, and hydrology remain deferred to Gate 3.2.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 3.2a

- Added two bounded deterministic erosion passes over the global heightfield.
- Added histogram-based sea-level solving from post-erosion cell elevations.
- Added edge-connected ocean classification and enclosed inland lake classification.
- Added water-surface chunk rendering at the solved sea level.
- Added `seaLevelSample` to the generation summary so rendering uses the worker’s authoritative water level.
- Added water coverage, lake classification, erosion, and water-quad specifications.
- Direct worker-side validation produced approximately 18.19% total water for the default 18% setting.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- Local preview is running for manual review; flow accumulation and rivers remain deferred to Gate 3.2b.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 3.2b

- Added deterministic D8 downhill direction selection with stable tie-breaking.
- Added counting-sort elevation order and temporary flow-accumulation data.
- Added non-carving river rasterization using an accumulation threshold.
- Added river-specific water coloring and summary river-cell counts.
- Added deterministic validation for river terminations and cycles.
- Direct worker-side validation produced 4,055 river cells, 492 terminations, and zero cycles for the default seed/configuration.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- Local preview is running for manual review; biomes, landmasses, forests, and resources remain deferred.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 4.1

- Added deterministic moisture and temperature fields derived from elevation, latitude, water proximity, and a climate substream.
- Added biome classification for plains, forest, hills, mountains, wetland, and coast.
- Added buildability and impassable flags with a provisional biome-readable terrain palette.
- Added four-direction landmass connected-component assignment and buildable-cell summary data.
- Direct validation produced 23 landmasses and 523,359 buildable cells for the default seed/configuration.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- Local preview is running for manual review; forest instances and timber fields remain deferred to Gate 4.2.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 4.2

- Added deterministic forest-cell selection from biome and landmass data.
- Added instanced low-poly tree rendering per active chunk using shared geometry and material ownership.
- Added deterministic tree scale and rotation variation without object-per-cell world state.
- Added forest placement and renderer lifecycle specifications.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- Local preview is running for manual review; resource provinces, deposits, timber/fertility fields, and starting-area validation remain deferred to Gate 5.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 5.1

- Added deterministic resource-province assignment across non-water cells using the dedicated resource random substream.
- Added authoritative timber and fertile-land per-cell intensity fields controlled by global resource abundance.
- Added resource mask bits for renewable fields while leaving mineral sources for the next slice.
- Added worker progress reporting and summary coverage for the 24 resource provinces.
- Added deterministic resource-generation specifications and measurable abundance-control coverage.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- Local preview is running for manual review; mineral deposits, markers, and starting-area validation remain deferred to Gate 5.2 and 5.3.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 5.2a

- User selected the natural geological outcrop direction for mineral visualization.
- Added deterministic iron, copper, and stone deposit sources using the resource random substream and per-kind forks.
- Added deposit radius, strength, capacity, and resource-province ownership metadata.
- Rasterized mineral intensity fields and presence-mask bits over the authoritative map without changing terrain height.
- Included deposit metadata in the authoritative map hash and worker completion summary.
- Added deterministic deposit, abundance-control, and province-association specifications.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- Direct validation produced 19 default deposits: 6 iron, 5 copper, and 8 stone.
- Local preview is running for manual review; natural outcrop and marker rendering remains deferred to Gate 5.2b.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 5.2b

- Implemented the selected natural geological outcrop direction.
- Added shared low-poly rock geometry with distinct iron, copper, and stone materials.
- Added three deterministic rock instances per active deposit and a subtle colored marker ring.
- Kept rendering limited to the existing active central chunk window and preserved renderer-owned disposal rules.
- Added active-deposit visibility and renderer lifecycle specifications.
- Corrected marker-ring terrain occlusion by lifting rings above the local deposit relief and improved outcrop readability with larger, brighter rocks.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- Local preview is running for manual visual review; starting-area validation remains deferred to Gate 5.3.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 5.3a

- Added a fixed 4×4 logical-cell coarse navigation graph with four-direction traversal and deterministic tie-breaking.
- Added measurable starting-basin invariants for buildable area, stone, timber, fertile land, iron, and copper path costs.
- Added deterministic candidate scoring using component size, local buildability/resource suitability, terrain quality, water proximity, and copper distance preference.
- Added a bounded deterministic repair pass that ensures required resources are reachable without weakening the hard path-cost guarantees.
- Added starting-basin summary fields and automated deterministic validation coverage.
- Direct validation produced 8,027 reachable buildable cells, local resource path costs within 64, iron within 128, and copper at path cost 152 within the 512 hard limit.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- Local preview is running for manual review; no new rendering was added in this data-only slice.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 6.1

- User selected the Map Workshop direction: a polished dedicated creation experience built around a floating left control dock over the map.
- Added the static creation-screen shell with world identity, seed, preset, tuning, readiness, and map-preview hierarchy.
- Added the approved sunset-toned translucent panel treatment, preset swatches, focused slider styling, responsive narrow-screen behavior, and local-generation messaging.
- Kept all controls static in this first visual slice; worker behavior and generation actions remain unchanged until Gate 6.2.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- Local preview is running for manual review; no files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 6.2

- Wired the seed field and browser-side randomize action to the active `MapConfig`.
- Wired preset selection and all four normalized tuning controls without automatic regeneration.
- Wired the primary Generate World action to replace the worker and regenerate the map from the current configuration.
- Preserved stale-worker protection and deterministic generation behavior through the existing worker client.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- Local preview is running for manual interaction review; in-panel progress and completion feedback remain deferred to Gate 6.3.
- No files were staged or committed.

### 2026-08-09 — Gate 6.2 robustness polish

- Fixed the initial Angular change-detection error by making the initial generation state explicit before the first view check.
- Made generation failures visible in the creation dock with a human-readable recovery message and retry action; raw worker details remain in the console for diagnostics.
- Made normal workshop buttons use a pointer cursor and disabled generation controls use a wait cursor.
- Made biome elevation thresholds relative to the generated water level so seed-specific absolute height ranges do not incorrectly classify nearly all land as mountains.
- Added a regression specification for the previously failing seed `VELUTINOUS-MANUL-e73c4b5c-89c5059b`; it now produces a valid starting basin.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass. Browser unit-test execution remains environment-blocked because the test server cannot bind its port here.
- No files were staged or committed.

### 2026-08-09 — Map Generation v1 Gate 6.3

- Added the restrained cinematic World Forge overlay with a full-scene veil, backdrop blur, responsive card, and reduced-motion fallback.
- Added five player-facing milestones: Terrain, Waterways, Biomes & Forests, Resources, and Starting Area.
- Added live worker progress, player-facing phase descriptions, completion summary metrics, memory estimates, and starting-area confirmation.
- Added persistent completion handoff through Explore Map plus retry and Edit Settings recovery actions for errors.
- Locked the creation dock while the overlay blocks interaction and added dialog/progress accessibility semantics.
- Added overlay presentation and formatting specifications; raised the component-style budget to accommodate the approved visual treatment.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass.
- No files were staged or committed.

### 2026-08-10 — Camera navigation baseline and streaming Gate 2

- Preserved the approved camera-navigation implementation with WASD/arrows, middle-button orbit, right-button pan, orthographic zoom, fixed navigation-plane Y, and overlay input locking.
- Intentionally deferred the previously observed shallow-angle world cutoff instead of adding temporary angle or zoom restrictions.
- Added conservative frustum-to-terrain-slab chunk selection that scans only the projected candidate area and tests chunk bounds including elevated decorative content.
- Added one logical prefetch ring, the initial desired-chunk tuning value of 576, visible/prefetch/desired/rejected classification, and budget-pressure reporting without attaching or evicting chunks yet.
- Added opt-in development diagnostics at `?debug=chunks`, including chunk-bound visualization, visible/peak counts, candidate counts, static attached count, budget state, and map epoch.
- Kept the current central static renderers, deterministic generation, World Forge overlay, and renderer ownership unchanged.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, and `git diff --check` pass. The browser unit-test bundle builds but remains unable to bind its test server port in this environment.
- No files were staged, committed, or pushed by the assistant.

### 2026-08-10 — Streaming Gate 3.1: atomic chunk bundles

- Replaced the GameScene-owned fixed central render session with a chunk streaming coordinator that queues logical chunks from the frustum selection and attaches complete terrain/water/forest/deposit bundles incrementally.
- Preserved shared layer materials and geometries while making per-chunk geometry and objects removable without disposing resources still used by neighboring chunks.
- Added explicit `absent → queued → building → ready → attached → retiring → disposed` lifecycle states, map-epoch checks, desired-set attachment validation, and cancellation of queued work that is no longer desired.
- Treated the 4 ms value as a scheduler target: synchronous bundle construction is allowed to finish, and actual last/rolling build times are reported.
- Prioritized visible chunks ahead of prefetch, kept optional empty layers complete, and made the World Forge completion card wait for the default reset view’s visible chunks.
- Kept map generation deterministic and retained the existing overlay; the previously observed camera/world cutoff remains intentionally deferred.
- Added streaming lifecycle specifications for initial readiness and map-epoch replacement.
- `npm run build`, both TypeScript checks, and `git diff --check` pass. The browser unit-test runner builds the complete test bundle but remains unable to bind its test server port in this environment.
- Manual browser review approved the streaming behavior. The preexisting shallow-angle chunk disappearance remains intentionally deferred for a later camera/frustum investigation.
- No files were staged, committed, or pushed by the assistant.

### 2026-08-10 — Streaming Gate 3.2: budget survey and prioritization

- Added a development-only survey of 2,700 representative camera cases across 16:9, 4:3, square, 2:1, and 2.4:1 viewports; minimum, default, and maximum view heights; five elevations; four headings; and center, edge, and corner targets.
- Kept `INITIAL_DESIRED_CHUNK_BUDGET = 576` as a provisional tuning value until the browser survey confirms whether it is comfortably sufficient.
- Sorted visible and prefetch queues by distance from the camera’s fixed navigation target so nearby visible chunks are built first.
- Exposed survey peak visible, desired, and candidate counts in the `?debug=chunks` diagnostics without changing camera limits or enforcing a new cap.
- Added a regression specification that confirms visible chunk priority is target-centered.
- The shallow-angle chunk disappearance remains intentionally deferred.
- `npm run build`, both TypeScript checks, and `git diff --check` pass. Browser unit-test execution remains environment-blocked by the test server port.
- No files were staged, committed, or pushed by the assistant.

### 2026-08-10 — Playwright chunk-visibility investigation

- Added Chromium Playwright configuration with a fixed 1440×900 viewport, Angular server reuse/startup, SwiftShader WebGL fallback, serial execution, and failure screenshots/traces/videos.
- Added deterministic browser coverage for seed `VELUTINOUS-MANUL-START-001`, generation-overlay input locking, WASD/arrows, middle-button orbit, right-button pan, wheel zoom, left-click no-op behavior, post-generation exploration, browser error collection, and chunk-streaming consistency.
- Captured the requested reset, shallow, mid-angle, steep, edge, diagonal, and corner camera states with actual browser input events, plus the separate shallow-angle backward movement state. Each state records camera and chunk coordinate data attributes as JSON/text attachments and attempts a deterministic screenshot; no pixel baselines or disappearance assertions were added.
- Extended only the existing `?debug=chunks` path with machine-readable camera state and chunk metrics. `?debug=chunks&metrics=only` is used by automation to avoid wireframe churn; the full debug view remains available for manual visual inspection.
- Validation: `npx tsc -p tsconfig.app.json --noEmit`, `npm run typecheck:e2e`, `npm run e2e` (12 passed), `npm run build`, and `git diff --check` pass. Chromium was installed locally with `npx playwright install chromium`.
- Automated metrics showed broad max-zoom-out views can carry a substantial queued/missing-desired backlog while the active desired set is larger than the attached set. This is evidence for a streaming-readiness/coverage investigation, not proof of the shallow-angle disappearance cause.
- Manual review remains pending at 1440×900 using `?debug=chunks`, the fixed seed, and the same camera matrix. The shallow-angle cutoff remains intentionally deferred; no camera, frustum, clipping, streaming, or rendering fix was implemented.
- No files were staged, committed, or pushed by the assistant.

### 2026-08-10 — Shallow-angle chunk disappearance fix

- Replaced the four-corner terrain projection shortcut with exact orthographic-frustum clipping against the terrain content-height slab, including all eight frustum corners and twelve frustum-edge/slab intersections.
- Added transition-safe chunk streaming: current visible chunks are prioritized ahead of prefetch work, outgoing attached bundles are retained until the replacement visible set is ready, and retained bundles are bounded by the existing 576-chunk budget.
- Added exact attached-key, retained-count, and missing-visible diagnostics to the development debug surface.
- Added a full-map reference-frustum regression across 12°, 20°, 30°, 45°, and 65° elevations, streaming lifecycle coverage, and Playwright shallow-transition coverage at default and zoomed-out views.
- Validation: `npm run build`, both TypeScript checks, focused visibility/streaming browser unit specs (6 and 3 passed), and `npm run e2e` (13 passed). The full 48-spec browser unit run compiled but Chromium disconnected after 8 specs in this environment.
- Camera framing is intentionally bounded by a 40° minimum elevation, an 88° maximum elevation, and a map-safe minimum zoom derived from the terrain footprint. Map generation, chunk geometry, and rendering-layer behavior were not changed.

### 2026-08-10 — Shallow-angle view distance correction

- Confirmed the map camera is orthographic, so there is no perspective FOV or lens value causing the apparent telephoto behavior.
- Extended scene fog from its previous 500-unit cutoff to the camera’s map-safe far plane, while retaining atmospheric fade from 420 units.
- This prevents distant terrain from fading completely into the background during shallow-angle views and complements the intentional camera framing and transition-safe chunk streaming changes.
- Validation: `npm run build`, both TypeScript checks, and `npm run e2e` (13 passed).

### 2026-08-10 — Surface-aligned orbit pivot

- Reproduced the zoomed-in shallow-tilt issue: the fixed `Y = 18` navigation plane was below the generated terrain range (`≈25.8–60`) and below the default sea surface (`≈35.2`).
- Made the camera navigation/orbit plane follow the generated sea-level surface, including camera movement, reset framing, chunk target sorting, and diagnostics.
- Added camera-controller coverage and Playwright coverage for zooming in first, then tilting to the configured 40° minimum; the pivot now remains on the map surface and visible chunks stay attached.
- Validation: focused camera browser unit specs (4 passed), `npm run build`, both TypeScript checks, and full `npm run e2e` (13 passed).

### 2026-08-10 — Camera contract and verification cleanup

- Kept the intentional 40°–88° elevation range, map-safe zoom limits, surface-aligned pivot, cursor-directed zoom, and exploration dock behavior documented as product behavior rather than treating them as regressions.
- Made camera reset honor the configured minimum zoom even before map-specific constraints are installed.
- Restored explicit WASD/arrow movement assertions, added exploration-dock state coverage, and made the hidden dock inaccessible to assistive technology while it is closed.
- Validation: `npm run build`, all three TypeScript checks, `npm run test:ci` (36 passed), and `npm run e2e` (14 passed).

### 2026-08-13 — Persistence and entry-flow decisions

- Chose IndexedDB as the primary local save store with explicit portable export/import.
- Chose a dedicated start screen with Continue, Load Save, and New World; import/export will live inside Load Save.
- Recorded the rejected alternatives, consequences, and remaining save-format questions in the approved decision section above.
- No persistence or start-screen implementation has been added yet; these decisions define the next foundation milestone before the final mine asset is integrated.

### 2026-08-13 — Map creation and preview approval

- User manually tested world creation and map preview.
- User approved the current generation, starting-area handoff, and exploration-preview experience.
- The map-preview approval gate is complete; the next gate is the dedicated start screen and local persistence foundation.

### 2026-08-13 — Milestone 2 — Dedicated start screen and session routing

- Replaced automatic startup generation with hash-based Angular Router states for the start screen, Map Workshop, Load Save, and guarded in-memory World Session routes.
- Added Continue, Load Save, and New World actions with honest missing-save messaging; persistence, save slots, import, and export remain deferred to Milestone 3.
- Added the ephemeral `WorldSessionRuntime`, exact generated configuration snapshots, authoritative map handoff, Accept World navigation, unsaved-session warning, and reload/direct-access guarding.
- Preserved the approved World Forge → Explore Map flow and adapted browser diagnostics to preserve debug query parameters across hash navigation.
- Verification: application/spec/e2e TypeScript checks and `git diff --check` pass; the focused start-screen → workshop → accept → world → reload Playwright flow passes in 1 test.
- `npm run test:ci` and `npm run build` still exit 134 during Angular's `Building...` phase in this local environment. One adapted legacy camera test exceeded the extended slow-machine browser budget while the existing chunk-streaming/input loop was still active.
- Manual approval status: pending review of the four application states and the unsaved-session handoff. No files were staged, committed, or pushed by the assistant.

### 2026-08-13 — Milestone 3 — IndexedDB and portable save persistence

- Added schema-version 2 save envelopes with named manual slots, a protected `Autosave` slot, v1 portable-file migration, and strict map/gameplay validation.
- Added separate IndexedDB metadata and payload stores with transactional writes/deletes, last-active save tracking in `localStorage`, and JSON/base64 portable export/import.
- Added Load Save slot management, Continue restoration, manual Save World, five-minute Autosave, explicit-leave persistence, import name conflict handling, and visible storage/validation errors.
- Verification: application TypeScript, spec TypeScript, e2e TypeScript, and `git diff --check` pass. Focused Angular unit execution remains blocked by the known local Angular builder exit 134 during `Building...`; local browser smoke checks reached Load Save, empty state, and missing-Continue fallback with no console errors.
- Manual approval status: pending review of Autosave creation, named save round-trip, Continue after reload, export/delete/import, and protected Autosave behavior. No files were staged, committed, or pushed by the assistant.
