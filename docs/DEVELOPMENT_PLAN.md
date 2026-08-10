# Velutinous Manul — Development Plan

## How to use this document

This document describes how we are getting from an empty repository to the game described in [`GAME_DESIGN.md`](./GAME_DESIGN.md). It is intentionally changeable. Update it after each approved milestone and after important technical or design decisions.

Every implementation milestone is small enough to run and manually test. Work pauses after the milestone until the user reviews it and approves the next step.

## Current status

- **Final target:** A browser-first 3D sandbox logistics and industry builder with beautiful traditional settlements, modern industry, and electric road transportation.
- **Current development stage:** Stage 1 — browser and 3D foundation, Map Generation v1 Gate 6.3.
- **Completed work:** Repository inspection; game direction captured in `GAME_DESIGN.md`; incremental workflow captured in `PROJECT_WORKFLOW.md` and this document; Map Generation v1 Gates 1 and 2 plus Gate 3, Gates 4.1–4.2, Gate 5.1, Gate 5.2a–5.2b, Gate 5.3, Gates 6.1–6.3 implemented.
- **Current task:** Manual review of streaming budget and prioritization tuning Gate 3.2.
- **Next planned work:** After approval, add budget hysteresis and repeated-sweep resource stabilization before moving to construction interaction.
- **Deferred systems:** Production chains, physical trucks, settlements, electricity, procedural generation, saving, economy, progression, large maps, and all other systems listed as long-term scope until the prerequisite slice is working.
- **Known limitations / technical debt:** The map still renders only an active central set of chunks while camera streaming is deferred. The previously observed shallow-angle world cutoff is intentionally deferred for a later camera/streaming discussion. Biome, tree, and resource colors are provisional and may receive a later three-option visual design review. Karma cannot execute browser specs in this environment because no Chrome binary is installed, although the specs compile successfully.

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
- The exact save format and versioning strategy.
- Final procedural world size and streaming strategy.
- Full electricity model, vehicle battery model, and economic balance.

## Current first implementation definition

The first implementation should be intentionally smaller than the vertical slice. It should establish the browser/Three.js foundation and prove the chosen camera and visual mood with:

- one ground area
- one grid representation
- one camera interaction model
- one or two lightweight placeholder forms for scale
- no production, economy, trucks, settlements, or procedural world yet

This is a technical and visual checkpoint, not a playable game. It must be reviewed manually before construction systems are added.

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
- `npm test -- --watch=false --browsers=ChromeHeadless` builds the test bundle but cannot launch because Chrome is not installed in the environment.
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
- The Angular test bundle builds, but Karma cannot execute because Chrome is not installed in the environment.
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
- Added a regression specification for the previously failing seed `VM-e73c4b5c-89c5059b`; it now produces a valid starting basin.
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, and `npx tsc -p tsconfig.spec.json --noEmit` pass. Karma execution remains environment-blocked because the test server cannot bind its port here.
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
- `npm run build`, `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, and `git diff --check` pass. Karma builds the test bundle but remains unable to bind port 9876 in this environment.
- No files were staged, committed, or pushed by the assistant.

### 2026-08-10 — Streaming Gate 3.1: atomic chunk bundles

- Replaced the GameScene-owned fixed central render session with a chunk streaming coordinator that queues logical chunks from the frustum selection and attaches complete terrain/water/forest/deposit bundles incrementally.
- Preserved shared layer materials and geometries while making per-chunk geometry and objects removable without disposing resources still used by neighboring chunks.
- Added explicit `absent → queued → building → ready → attached → retiring → disposed` lifecycle states, map-epoch checks, desired-set attachment validation, and cancellation of queued work that is no longer desired.
- Treated the 4 ms value as a scheduler target: synchronous bundle construction is allowed to finish, and actual last/rolling build times are reported.
- Prioritized visible chunks ahead of prefetch, kept optional empty layers complete, and made the World Forge completion card wait for the default reset view’s visible chunks.
- Kept map generation deterministic and retained the existing overlay; the previously observed camera/world cutoff remains intentionally deferred.
- Added streaming lifecycle specifications for initial readiness and map-epoch replacement.
- `npm run build`, both TypeScript checks, and `git diff --check` pass. Karma builds the complete test bundle but remains unable to bind port 9876 in this environment.
- Manual browser review approved the streaming behavior. The preexisting shallow-angle chunk disappearance remains intentionally deferred for a later camera/frustum investigation.
- No files were staged, committed, or pushed by the assistant.

### 2026-08-10 — Streaming Gate 3.2: budget survey and prioritization

- Added a development-only survey of 2,700 representative camera cases across 16:9, 4:3, square, 2:1, and 2.4:1 viewports; minimum, default, and maximum view heights; five elevations; four headings; and center, edge, and corner targets.
- Kept `INITIAL_DESIRED_CHUNK_BUDGET = 576` as a provisional tuning value until the browser survey confirms whether it is comfortably sufficient.
- Sorted visible and prefetch queues by distance from the camera’s fixed navigation target so nearby visible chunks are built first.
- Exposed survey peak visible, desired, and candidate counts in the `?debug=chunks` diagnostics without changing camera limits or enforcing a new cap.
- Added a regression specification that confirms visible chunk priority is target-centered.
- The shallow-angle chunk disappearance remains intentionally deferred.
- `npm run build`, both TypeScript checks, and `git diff --check` pass. Karma remains environment-blocked at port 9876.
- No files were staged, committed, or pushed by the assistant.

### 2026-08-10 — Playwright chunk-visibility investigation

- Added Chromium Playwright configuration with a fixed 1440×900 viewport, Angular server reuse/startup, SwiftShader WebGL fallback, serial execution, and failure screenshots/traces/videos.
- Added deterministic browser coverage for seed `VM-START-001`, generation-overlay input locking, WASD/arrows, middle-button orbit, right-button pan, wheel zoom, left-click no-op behavior, post-generation exploration, browser error collection, and chunk-streaming consistency.
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
- Validation: `npm run build`, both TypeScript checks, focused visibility/streaming Karma specs (6 and 3 passed), and `npm run e2e` (13 passed). The full 48-spec Karma run compiled but Chrome disconnected after 8 specs in this environment.
- No camera limits, framing, map generation, chunk geometry, or rendering-layer behavior were changed.

### 2026-08-10 — Shallow-angle view distance correction

- Confirmed the map camera is orthographic, so there is no perspective FOV or lens value causing the apparent telephoto behavior.
- Extended scene fog from its previous 500-unit cutoff to the camera’s map-safe far plane, while retaining atmospheric fade from 420 units.
- This prevents distant terrain from fading completely into the background during shallow-angle views; camera controls, orthographic framing, map bounds, and chunk streaming remain unchanged.
- Validation: `npm run build`, both TypeScript checks, and `npm run e2e` (13 passed).

### 2026-08-10 — Surface-aligned orbit pivot

- Reproduced the zoomed-in shallow-tilt issue: the fixed `Y = 18` navigation plane was below the generated terrain range (`≈25.8–60`) and below the default sea surface (`≈35.2`).
- Made the camera navigation/orbit plane follow the generated sea-level surface, including camera movement, reset framing, chunk target sorting, and diagnostics.
- Added camera-controller coverage and Playwright coverage for zooming in first, then tilting to 12°; the pivot now remains on the map surface and visible chunks stay attached.
- Validation: focused camera Karma specs (4 passed), `npm run build`, both TypeScript checks, and full `npm run e2e` (13 passed).
