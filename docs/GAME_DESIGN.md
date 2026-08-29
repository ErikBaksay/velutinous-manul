# Velutinous Manul — Game Design

## Purpose of this document

This document is the source of truth for what Velutinous Manul is intended to become. It describes the long-term direction, not the amount of content that should be implemented in the current milestone.

The implementation plan lives in [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md). Collaboration and review rules live in [`PROJECT_WORKFLOW.md`](./PROJECT_WORKFLOW.md).

## Project identity

- **Game:** Velutinous Manul
- **Genre:** 3D sandbox logistics, industry, and settlement builder
- **Primary platform:** Browser, desktop-first
- **Initial architecture:** Angular, TypeScript, Three.js, client-side simulation
- **Deployment direction:** GitHub Pages
- **Later capability:** PWA support
- **Initial persistence:** Browser-local IndexedDB saves with file export/import; no backend required at the start
- **Initial entry flow:** A dedicated start screen with Continue, Load Save (including import/export), and New World
- **Reference inspirations:** Factorio, Transport Fever, Captain of Industry

## One-sentence definition

Velutinous Manul is a large-scale 3D sandbox logistics and industry builder where the player creates beautiful traditional settlements around resource industries and connects a growing regional economy using modern electric road transportation.

## Core fantasy

Build a beautiful industrial region from nothing.

The player discovers natural resources, establishes industries near them, constructs roads, builds settlements for workers, expands electricity and logistics, and gradually connects separate regions into one functioning economy. The world should make the player's infrastructure visible and satisfying: roads fill with physical electric trucks, towns grow where the player chooses, and industrial districts remain attractive parts of the landscape.

## Core gameplay loop

```text
Explore
→ discover resources
→ build extraction
→ construct roads
→ establish processing
→ transport materials with electric trucks
→ build settlements for workers
→ expand electricity and logistics
→ develop advanced industries
→ establish additional regions
→ connect everything into one large economy
```

The game is primarily an open-ended sandbox. Milestones and unlocks may provide gentle direction, but they should not replace player-defined goals or become a rigid campaign.

## Design pillars

1. **Beautiful industry** — Industrial sites should be clean, legible, and satisfying to compose.
2. **Road logistics** — Roads and electric trucks are a primary identity of the game, not incidental transport.
3. **Player-built settlements** — The player decides where towns and worker settlements go and how they look.
4. **Believable but accessible production** — Production chains should feel plausible without requiring spreadsheet-level management.
5. **Traditional architecture plus modern technology** — European-inspired traditional buildings coexist naturally with factories, solar power, charging stations, and electric vehicles.
6. **Large-scale regional expansion** — The local starting system should be able to grow into a connected regional economy.
7. **Sandbox first** — No formal victory condition is initially required.
8. **Extremely lightweight visuals** — Proportions, silhouettes, materials, lighting, and composition matter more than expensive assets.
9. **Readable physical logistics** — The player should be able to see where materials and vehicles are and understand why a chain is blocked.
10. **Incremental complexity** — Complexity should arrive in layers, each of which remains understandable and testable.

## Player construction

The player directly constructs the world. Towns are not automatically generated as complete settlements around industrial sites.

Long-term construction categories include:

- roads
- houses and worker housing
- town and civic buildings
- mines and extraction sites
- factories and processing plants
- warehouses and logistics hubs
- truck depots and charging stations
- power infrastructure
- solar farms
- decorative and environmental assets

Player placement and visual composition are important forms of expression.

## Production and resources

Resources should be recognizable real-world materials with simplified recipes. The intended pattern is:

```text
Iron Ore
→ Iron Processing
→ Steel
→ Components
→ Machinery
```

Potential later resources include iron, copper, stone, sand, clay, timber, agricultural products, construction materials, batteries, electronics, and consumer goods.

Production should be deep enough to create interesting logistics networks while remaining understandable from the world and UI. The player should not need external documentation to understand a basic production chain.

## Transportation

Road logistics are one of the game's main identities. The initial transportation focus is:

- roads
- electric trucks
- delivery vehicles
- utility vehicles

Electric trucks should look futuristic in a credible contemporary or near-future way, not like science-fiction spacecraft.

Long-term vehicle and logistics systems may include:

- vehicle capacities and classes
- routing over the actual road network
- logistics depots
- pickup and delivery requests
- range and battery state
- charging stations and downtime
- vehicle upgrades
- visible physical movement of trucks carrying materials

Road layout and transportation efficiency should matter. Railways are deliberately not an early priority.

## Electricity

Electricity is an infrastructure layer that should add planning decisions without becoming an electrical-engineering simulator.

Possible systems include:

- generation and demand
- industrial and settlement consumption
- solar farms
- electrical connections
- battery storage
- charging infrastructure
- truck charging

## World and grid

The long-term world is a very large, procedurally generated finite world that feels effectively enormous during normal play. It may contain forests, hills, valleys, plains, rivers, lakes, deposits, attractive settlement areas, and geographically distinct regions.

Resource distribution should encourage geographically separated industries and settlements. Different regions should naturally create larger logistics networks as the economy develops.

The underlying world and construction system should use a grid, especially during early development. The grid simplifies placement, roads, pathfinding, generation, resource positions, simulation, and serialization. It does not need to be strongly visible in the final presentation; terrain and scenery should still feel organic.

## Visual identity

The attached reference image establishes the broad mood and composition: an elevated view of a coherent region containing traditional civic architecture, tree-lined streets, modern industrial campuses, roads, water, and resource or construction areas. It is an approximate direction, not a requirement to reproduce every building or exact camera angle.

The visual question is:

> What if society continued technological progress without abandoning beautiful traditional architecture?

Settlements should draw from attractive European towns using stone, stucco, brick, pitched roofs, traditional houses, townhouses, civic architecture, churches, town squares, and tree-lined roads. This is not a historical game: the traditional forms are contemporary choices in a modern or near-future society.

Modern factories, clean warehouses, solar roofs, charging infrastructure, advanced manufacturing, and electric trucks should belong to the same visual world as the settlements.

### Visual production constraints

The visual target must remain achievable for a small indie browser game:

- low-poly and lightweight models
- simple textures and restrained materials
- clear proportions and strong silhouettes
- readable from normal gameplay distances
- pleasant lighting and atmospheric perspective
- coherent color relationships and composition
- inexpensive rendering and small downloads

Avoid making visual quality depend on high polygon counts, detailed facade trim, interiors, complex shader stacks, or large texture sets.

Industry should generally feel advanced, clean, and satisfying rather than automatically dystopian. Heavy extraction and mining can be rougher and more mechanical while still belonging to the same landscape.

## Settlements

Settlements are important, but the game remains primarily about industry, logistics, and construction rather than individual citizen simulation.

### Settlement founding direction

Every settlement is church-centered. The church is the settlement's visual,
spatial, and civic anchor rather than a production building. The initial
settlement-founding sequence is:

```text
place a church
→ place a residential building within the church's founding area
→ found a town
```

The church establishes the settlement center and identity. The first
residential building represents the initial population and worker capacity.
Founding a town is an explicit player action that turns these buildings into a
named settlement with a visible center and room to grow. The first version
should not simulate individual citizens or require a full service economy.

The intended spatial composition is a traditional church and small plaza at
the center, residential buildings around it, roads connecting the settlement
to the wider logistics network, and industrial or warehouse buildings kept
toward the edge where practical. Later settlement growth can add more homes,
civic buildings, services, and regional-center upgrades while preserving the
church-centered identity.

Possible evolution:

```text
worker settlement
→ village
→ town
→ regional center
```

Later settlement needs may include housing, electricity, food, consumer goods, jobs, road access, and services. Individual citizens should not be simulated unless a later design decision demonstrates a compelling need.

## Economy and progression

Economics should create meaningful operational decisions without turning the game into a spreadsheet. Possible concepts include construction costs, operating costs, vehicle costs, production profitability, resource value, logistics cost, electricity costs, maintenance, and efficiency differences.

Progression may gradually unlock industries, buildings, trucks, production chains, electricity technologies, logistics technologies, construction options, and new capabilities. The player-defined objective remains:

> Build a larger, more efficient, and more beautiful interconnected region.

## Long-term regional expansion

The intended arc grows from:

```text
one resource
+ one industrial site
+ one small settlement
```

to:

```text
multiple towns
+ multiple industrial zones
+ separate resource regions
+ major road corridors
+ logistics hubs
+ large vehicle fleets
+ interconnected production chains
+ regional electricity infrastructure
```

The architecture should allow this growth without requiring all systems to exist in the first playable slice.

## Systems that may exist eventually

- procedural terrain generation
- resource deposits
- extraction, processing, and manufacturing
- multiple production chains
- warehouses and logistics hubs
- road construction and pathfinding
- vehicle fleets, truck charging, and visible delivery routes
- electricity generation, distribution, and storage
- worker settlements, town growth, and local consumption
- operating economics and unlocks
- multiple regions and large maps
- local saving/loading
- forests, waterways, terrain variation, and environmental decoration

This is a scope direction, not an immediate implementation checklist.

## Explicit scope discipline

Do not begin with dozens of resources, dozens of buildings, a large asset library, sophisticated world generation, an enormous map, advanced traffic simulation, individual citizens, complex economics, railways, multiplayer, backend accounts, cloud saving, weather, seasons, elaborate pollution, a campaign, mobile controls, modding, or advanced PWA functionality.

Those may be revisited only when the current development stage genuinely requires them.
